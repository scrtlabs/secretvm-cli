import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import { getApiClient } from "../../services/apiClient";
import {
    CreateVmApiResponse,
    GlobalOptions,
    EditVmCommandOptions,
    VmInstance,
} from "../../types";
import { handleCommandExecution, successResponse } from "../../utils";
import Table from "cli-table3";
import { API_ENDPOINTS, KMS_CONTRACT_PUBLIC_KEY } from "../../constants";
import { AxiosInstance, AxiosResponse } from "axios";
import { encryptDockerCredentials } from "../../services/encryption";
import { encryptForKmsContract } from "../../services/kmsEncryption";

/** Poll a background job until terminal status, then return the VM details. */
async function waitForJobAndFetchVm(
    apiClient: AxiosInstance,
    jobId: string,
    vmId: string,
    onProgress?: (msg: string) => void,
): Promise<CreateVmApiResponse> {
    const POLL_INTERVAL_MS = 3000;
    const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    const deadline = Date.now() + TIMEOUT_MS;

    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const { data: job } = await apiClient.get(
            API_ENDPOINTS.JOB.STATUS(jobId),
        );
        if (job.status === "completed") {
            const { data: vm } = await apiClient.get<CreateVmApiResponse>(
                API_ENDPOINTS.VM.DETAILS(vmId),
            );
            return vm;
        }
        if (job.status === "failed") {
            throw new Error(`VM update job failed: ${job.error || "unknown error"}`);
        }
        if (onProgress) {
            onProgress(`Job ${job.status} (${job.progress ?? 0}%)...`);
        }
    }
    throw new Error("Timed out waiting for VM update to complete");
}

export async function editVmCommand(
    vmId: string,
    cmdOptions: EditVmCommandOptions,
    globalOptions: GlobalOptions,
): Promise<void> {
    if (!vmId || vmId.trim() === "") {
        throw new Error("VM ID is required.");
    }
    const trimmedVmId = vmId.trim();

    let name = cmdOptions.name;
    let dockerComposePath = cmdOptions.dockerCompose;
    let secrets_plaintext: string | undefined;
    if (cmdOptions.env) {
        try {
            const envPath = path.resolve(cmdOptions.env);
            fs.accessSync(envPath, fs.constants.R_OK);
            secrets_plaintext = fs.readFileSync(envPath, "utf-8");
        } catch (err) {
            throw new Error(
                `Environment file "${cmdOptions.env}" does not exist or is not readable.`,
            );
        }
    }
    let fsPersistence = cmdOptions.persistence;
    let dockerCredentials = cmdOptions.dockerCredentials;
    let dockerRegistry = cmdOptions.dockerRegistry ?? "docker.io";
    let kms = cmdOptions.kms;

    await handleCommandExecution(
        globalOptions,
        async (): Promise<AxiosResponse> => {
            const apiClient = await getApiClient(globalOptions);

            if (globalOptions.interactive) {
                console.log("Preparing update...");

                const questions: any[] = [];
                if (!name) {
                    questions.push({
                        type: "input",
                        name: "name",
                        message: "Enter the new name for your VM (optional):",
                    });
                }
                if (!dockerComposePath) {
                    questions.push({
                        type: "input",
                        name: "dockerComposePath",
                        message:
                            "Enter the path to your new docker-compose.yml (optional):",
                        validate: (input: string) => {
                            if (input.trim() === "") return true;
                            try {
                                const resolvedPath = path.resolve(input.trim());
                                fs.accessSync(resolvedPath, fs.constants.R_OK);
                                return true;
                            } catch (err) {
                                return `File "${input.trim()}" does not exist or is not readable.`;
                            }
                        },
                    });
                }
                if (cmdOptions.persistence === undefined) {
                    questions.push({
                        type: "confirm",
                        name: "fsPersistence",
                        message: "Enable filesystem persistence?",
                        default: true,
                    });
                }

                if (!dockerRegistry && !dockerCredentials) {
                    const { usePrivateRegistry } = await inquirer.prompt([
                        {
                            type: "confirm",
                            name: "usePrivateRegistry",
                            message:
                                "Do you want to use a private Docker registry?",
                            default: false,
                        },
                    ]);

                    if (usePrivateRegistry) {
                        const answers = await inquirer.prompt([
                            {
                                type: "input",
                                name: "dockerRegistry",
                                message: "Enter the Docker registry URL:",
                            },
                            {
                                type: "input",
                                name: "username",
                                message: "Enter your Docker registry username:",
                            },
                            {
                                type: "password",
                                name: "password",
                                message: "Enter your Docker registry password:",
                                mask: "*",
                            },
                        ]);
                        dockerRegistry = answers.dockerRegistry;
                        dockerCredentials = `${answers.username}:${answers.password}`;
                    }
                }

                if (!secrets_plaintext) {
                    const { addEnv } = await inquirer.prompt([
                        {
                            type: "confirm",
                            name: "addEnv",
                            message:
                                "Do you want to add or update environment variables (secrets)?",
                            default: false,
                        },
                    ]);

                    if (addEnv) {
                        const { secrets } = await inquirer.prompt([
                            {
                                type: "editor",
                                name: "secrets",
                                message:
                                    "Enter variables in VAR=VALUE format (opens in your default editor).",
                                validate: (text: string) =>
                                    text.trim().length > 0 ||
                                    "Secrets cannot be empty.",
                            },
                        ]);
                        secrets_plaintext = secrets;
                    }
                }

                if (questions.length > 0) {
                    const answers = await inquirer.prompt(questions);
                    if (answers.name) name = answers.name;
                    if (answers.dockerComposePath)
                        dockerComposePath = answers.dockerComposePath;
                    if (answers.fsPersistence !== undefined)
                        fsPersistence = answers.fsPersistence;
                }
            }

            // Fetch VM details upfront to get current name and kmsProvider.
            const detailsRes = await apiClient.get<VmInstance>(
                API_ENDPOINTS.VM.DETAILS(trimmedVmId),
            );
            const vmDetails = detailsRes.data;

            // Auto-detect KMS mode from the existing VM if not specified via flag.
            if (!kms && vmDetails.kmsProvider === "secret-network") {
                kms = "contract";
            }

            const vmName = name || vmDetails.nameFromUser || vmDetails.name;

            if (kms === "contract") {
                // KMS path: use /update-background (JSON, async job).

                let dockerComposeBase64: string | undefined;
                if (dockerComposePath && dockerComposePath.trim() !== "") {
                    const absolutePath = path.resolve(dockerComposePath.trim());
                    const content = fs.readFileSync(absolutePath).toString();
                    dockerComposeBase64 = Buffer.from(content).toString("base64");
                } else if (vmDetails.docker_file) {
                    // No new docker-compose provided — reuse the current one from the VM.
                    dockerComposeBase64 = Buffer.from(vmDetails.docker_file).toString("base64");
                }

                if (!dockerComposeBase64) {
                    throw new Error(
                        "Missing required option: -d, --docker-compose (VM has no existing docker-compose to reuse)",
                    );
                }

                let secretsCipher: string | undefined;
                if (secrets_plaintext && secrets_plaintext.trim() !== "") {
                    secretsCipher = await encryptForKmsContract(
                        secrets_plaintext.trim(),
                        KMS_CONTRACT_PUBLIC_KEY,
                    );
                }

                let kmsDockerUsername: string | undefined;
                let kmsDockerCipher: string | undefined;
                let kmsDockerRepository: string | undefined;
                if (dockerCredentials && dockerCredentials.trim() !== "") {
                    if (!dockerRegistry || dockerRegistry.trim() === "") {
                        throw new Error("Docker registry cannot be empty.");
                    }
                    const [username, password] = dockerCredentials.split(":");
                    if (!username || !password) {
                        throw new Error(
                            "Invalid Docker credentials format. Expected username:password",
                        );
                    }
                    kmsDockerCipher = await encryptForKmsContract(
                        password,
                        KMS_CONTRACT_PUBLIC_KEY,
                    );
                    kmsDockerUsername = username;
                    kmsDockerRepository = dockerRegistry;
                }

                if (globalOptions.interactive) {
                    console.log(
                        `Submitting update job for VM ${trimmedVmId}...`,
                    );
                }

                const jobRes = await apiClient.post(
                    API_ENDPOINTS.VM.UPDATE_BACKGROUND(trimmedVmId),
                    {
                        name: vmName,
                        dockerComposeBase64,
                        fs_persistence: fsPersistence ? 1 : undefined,
                        kms_provider: kms === "contract" ? "secret-network" : kms,
                        secrets_cipher: secretsCipher,
                        kms_docker_username: kmsDockerUsername,
                        kms_docker_cipher: kmsDockerCipher,
                        kms_docker_repository: kmsDockerRepository,
                    },
                );

                const { jobId } = jobRes.data;
                if (globalOptions.interactive) {
                    console.log(`Job ${jobId} queued. Waiting for completion...`);
                }
                const vm = await waitForJobAndFetchVm(
                    apiClient, jobId, trimmedVmId,
                    globalOptions.interactive ? (msg) => console.log(msg) : undefined,
                );
                return { ...jobRes, data: vm } as AxiosResponse;
            }

            // Non-KMS path (dstack / GKMS / no KMS): /update-background with RSA-encrypted credentials
            {

                let dockerComposeBase64: string | undefined;
                if (dockerComposePath && dockerComposePath.trim() !== "") {
                    const absolutePath = path.resolve(dockerComposePath.trim());
                    const content = fs.readFileSync(absolutePath).toString();
                    dockerComposeBase64 = Buffer.from(content).toString("base64");
                } else if (vmDetails.docker_file) {
                    // No new docker-compose provided — reuse the current one from the VM.
                    dockerComposeBase64 = Buffer.from(vmDetails.docker_file).toString("base64");
                }

                if (!dockerComposeBase64) {
                    throw new Error(
                        "Missing required option: -d, --docker-compose (VM has no existing docker-compose to reuse)",
                    );
                }

                let dockerCredentialsEncrypted: string | undefined;
                let dockerCredentialsKey: string | undefined;
                if (dockerCredentials && dockerCredentials.trim() !== "") {
                    if (!dockerRegistry || dockerRegistry.trim() === "") {
                        throw new Error("Docker registry cannot be empty.");
                    }
                    const [username, password] = dockerCredentials.split(":");
                    if (!username || !password) {
                        throw new Error(
                            "Invalid Docker credentials format. Expected username:password",
                        );
                    }
                    const enc = await encryptDockerCredentials(
                        dockerRegistry,
                        username,
                        password,
                    );
                    dockerCredentialsEncrypted = enc.encryptedData;
                    dockerCredentialsKey = enc.encryptedAESKey;
                }

                if (globalOptions.interactive) {
                    console.log(
                        `Submitting update job for VM ${trimmedVmId}...`,
                    );
                }

                const jobRes = await apiClient.post(
                    API_ENDPOINTS.VM.UPDATE_BACKGROUND(trimmedVmId),
                    {
                        name: vmName,
                        dockerComposeBase64,
                        fs_persistence: fsPersistence ? 1 : undefined,
                        kms_provider: kms === "contract" ? "secret-network" : kms,
                        docker_credentials_encrypted: dockerCredentialsEncrypted,
                        docker_credentials_key: dockerCredentialsKey,
                    },
                );

                const { jobId } = jobRes.data;
                if (globalOptions.interactive) {
                    console.log(`Job ${jobId} queued. Waiting for completion...`);
                }
                const vm = await waitForJobAndFetchVm(
                    apiClient, jobId, trimmedVmId,
                    globalOptions.interactive ? (msg) => console.log(msg) : undefined,
                );
                return { ...jobRes, data: vm } as AxiosResponse;
            }
        },
        (data: AxiosResponse) => {
            if (globalOptions.interactive) {
                if (data.data && (data.data.id || data.data.vmId)) {
                    console.log(
                        "\n✅ VM updated successfully!",
                    );
                    const table = new Table({
                        head: [
                            "ID",
                            "Name",
                            "Status",
                            "Type",
                            "IP",
                            "Domain",
                            "Created At",
                        ],
                    });
                    table.push([
                        data.data.vmId,
                        data.data.nameFromUser,
                        data.data.status,
                        data.data.vmTypeId,
                        data.data.ip_address,
                        data.data.vmDomain,
                        data.data.createdAt,
                    ]);
                    console.log(table.toString());
                    console.log(
                        'You can check the VM status using the "vm status" command shortly.',
                    );
                } else {
                    console.log(
                        "VM update request may have been processed, but the response format was unexpected:",
                        data.data,
                    );
                }
            } else {
                successResponse(data.data);
            }
        },
    );
}
