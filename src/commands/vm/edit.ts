import inquirer from "inquirer";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import { getApiClient } from "../../services/apiClient";
import {
    CreateVmApiResponse,
    GlobalOptions,
    EditVmCommandOptions,
} from "../../types";
import { handleCommandExecution, successResponse } from "../../utils";
import Table from "cli-table3";
import { API_ENDPOINTS } from "../../constants";
import { AxiosResponse } from "axios";
import { encryptDockerCredentials } from "../../services/encryption";

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

    await handleCommandExecution(
        globalOptions,
        async (): Promise<AxiosResponse> => {
            const apiClient = await getApiClient(globalOptions);

            if (globalOptions.interactive) {
                console.log(`Stopping VM ${trimmedVmId}...`);
            }
            await apiClient.post(API_ENDPOINTS.VM.STOP(trimmedVmId));

            await new Promise((resolve) => setTimeout(resolve, 5000));

            if (globalOptions.interactive) {
                console.log("VM stopped. Preparing update...");

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

            const formData = new FormData();
            if (name && name.trim() !== "") {
                formData.append("name", name.trim());
            }

            if (secrets_plaintext && secrets_plaintext.trim() !== "") {
                formData.append("secrets_plaintext", secrets_plaintext.trim());
            }

            if (dockerCredentials && dockerCredentials.trim() != "") {
                if (dockerRegistry.trim() != "") {
                    const [username, password] = dockerCredentials.split(":");
                    if (!username || !password) {
                        throw new Error(
                            "Invalid Docker credentials format. Expected username:password",
                        );
                    }

                    const encryptedCredentials = await encryptDockerCredentials(
                        dockerRegistry,
                        username,
                        password,
                    );

                    formData.append(
                        "docker_credentials_encrypted",
                        encryptedCredentials.encryptedData,
                    );
                    formData.append(
                        "docker_credentials_key",
                        encryptedCredentials.encryptedAESKey,
                    );
                } else {
                    throw new Error("Docker registry cannot be empty.");
                }
            }

            if (fsPersistence) {
                formData.append("fs_persistence", "1");
            }

            if (dockerComposePath && dockerComposePath.trim() !== "") {
                const absoluteDockerComposePath = path.resolve(
                    dockerComposePath.trim(),
                );
                const fileBuffer = fs.readFileSync(absoluteDockerComposePath);
                const dockerComposeContent = fileBuffer.toString();

                formData.append(
                    "dockercompose",
                    dockerComposeContent,
                    path.basename(absoluteDockerComposePath),
                );
            }

            if (globalOptions.interactive) {
                console.log(
                    `Launching VM ${trimmedVmId} with updated configuration...`,
                );
            }

            return await apiClient.post<CreateVmApiResponse>(
                API_ENDPOINTS.VM.LAUNCH(trimmedVmId),
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                },
            );
        },
        (data: AxiosResponse) => {
            if (globalOptions.interactive) {
                if (data.data && data.data.id) {
                    console.log(
                        "\n✅ VM update process initiated successfully!",
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
