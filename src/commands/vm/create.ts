import inquirer from "inquirer";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import { getApiClient } from "../../services/apiClient";
import {
    CreateVmApiResponse,
    GlobalOptions,
    CreateVmCommandOptions,
    DockerCompose,
    Template,
} from "../../types";
import { handleCommandExecution, successResponse } from "../../utils";
import Table from "cli-table3";
import { API_ENDPOINTS } from "../../constants";
import { AxiosResponse } from "axios";
import yaml from "js-yaml";
import { encryptDockerCredentials } from "../../services/encryption";

export async function createVmCommand(
    cmdOptions: CreateVmCommandOptions,
    globalOptions: GlobalOptions,
): Promise<void> {
    let name = cmdOptions.name;
    let type = cmdOptions.type;
    let dockerComposePath = cmdOptions.dockerCompose;
    let templateId = cmdOptions.template;
    let inviteCode = cmdOptions.inviteCode;
    let enableHttps = cmdOptions.tls ?? false;
    let domain = cmdOptions.domain;
    let dockerCredentials = cmdOptions.dockerCredentials;
    let dockerRegistry = cmdOptions.dockerRegistry ?? "docker.io";
    let fsPersistence = cmdOptions.persistence;
    let platform = cmdOptions.platform;
    let privateMode = cmdOptions.private ?? false;
    let upgradeability = cmdOptions.upgradeability;
    let environment = cmdOptions.environment;
    let secrets_plaintext: string | undefined;
    let dockerComposeContent: string | undefined;
    let dockerComposeFilename: string = "docker-compose.yml";
    let archive = cmdOptions.archive;
    let kms = cmdOptions.kms;

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

    await handleCommandExecution(
        globalOptions,
        async (): Promise<AxiosResponse> => {
            const apiClient = await getApiClient(globalOptions);

            // Logic to determine Docker content source: File vs Template
            if (globalOptions.interactive) {
                // If neither is provided, ask the user
                if (!dockerComposePath && !templateId) {
                    const { source } = await inquirer.prompt([
                        {
                            type: "list",
                            name: "source",
                            message: "How would you like to define your VM?",
                            choices: [
                                {
                                    name: "Use a local docker-compose.yml file",
                                    value: "file",
                                },
                                {
                                    name: "Select a Template",
                                    value: "template",
                                },
                            ],
                        },
                    ]);

                    if (source === "template") {
                        console.log("Fetching templates...");
                        const templatesResponse = await apiClient.get<
                            Template[]
                        >(API_ENDPOINTS.VM.TEMPLATES);
                        const templates = templatesResponse.data;

                        if (!templates || templates.length === 0) {
                            console.log(
                                "No templates available. Switching to file mode.",
                            );
                        } else {
                            const choices = templates.map((t) => ({
                                name: `${t.name} (${t.description}) [${t.defaultVmSize}]`,
                                value: t,
                            }));
                            const { selectedTemplate } = await inquirer.prompt([
                                {
                                    type: "list",
                                    name: "selectedTemplate",
                                    message: "Choose a template:",
                                    choices: choices,
                                },
                            ]);
                            templateId = selectedTemplate.id;
                            dockerComposeContent = selectedTemplate.docker;
                            if (!type) {
                                type = selectedTemplate.defaultVmSize;
                            }
                            if (!name) {
                                name = selectedTemplate.name
                                    .toLowerCase()
                                    .replace(/\s+/g, "-");
                            }
                        }
                    } else {
                        const answers = await inquirer.prompt([
                            {
                                type: "input",
                                name: "dockerComposePath",
                                message:
                                    "Enter the path to your docker-compose.yml or similar config file:",
                                validate: (input: string) => {
                                    const trimmedInput = input.trim();
                                    if (trimmedInput === "")
                                        return "Path cannot be empty.";
                                    try {
                                        const resolvedPath =
                                            path.resolve(trimmedInput);
                                        fs.accessSync(
                                            resolvedPath,
                                            fs.constants.R_OK,
                                        );
                                        return true;
                                    } catch (err) {
                                        return `File "${trimmedInput}" does not exist or is not readable.`;
                                    }
                                },
                            },
                        ]);
                        dockerComposePath = answers.dockerComposePath;
                    }
                }
            }

            // If template ID is provided (via flag or interactive selection)
            if (templateId && !dockerComposeContent) {
                const templatesResponse = await apiClient.get<Template[]>(
                    API_ENDPOINTS.VM.TEMPLATES,
                );
                const templates = templatesResponse.data;
                const selectedTemplate = templates.find(
                    (t) => t.id === templateId || t.name === templateId,
                );
                if (!selectedTemplate) {
                    throw new Error(
                        `Template with ID or name "${templateId}" not found.`,
                    );
                }
                dockerComposeContent = selectedTemplate.docker;
                if (!type) {
                    type = selectedTemplate.defaultVmSize;
                }
            }

            // If still no content, assume file path
            if (!dockerComposeContent) {
                if (!dockerComposePath) {
                    throw new Error(
                        "Missing required option: -d, --docker-compose or -T, --template",
                    );
                }
                const absoluteDockerComposePath = path.resolve(
                    dockerComposePath!.trim(),
                );
                const fileBuffer = fs.readFileSync(absoluteDockerComposePath);
                dockerComposeContent = fileBuffer.toString();
                dockerComposeFilename = path.basename(
                    absoluteDockerComposePath,
                );
            }

            // Basic check for missing env vars in templates
            if (dockerComposeContent) {
                const envVarMatches = dockerComposeContent.matchAll(
                    /\$\{?([A-Z0-9_]+)(?::-[^}]*)?\}?/g,
                );
                const neededVars = new Set<string>();
                for (const match of envVarMatches) {
                    // Ignore DOMAIN_NAME as it's typically handled dynamically by portal
                    if (match[1] !== "DOMAIN_NAME") {
                        neededVars.add(match[1]);
                    }
                }

                if (neededVars.size > 0 && !secrets_plaintext) {
                    if (globalOptions.interactive) {
                        const { proceed } = await inquirer.prompt([
                            {
                                type: "confirm",
                                name: "proceed",
                                message: `⚠️  The selected configuration appears to use environment variables (${Array.from(neededVars).join(", ")}), but no environment file was provided.\nDo you have an env file to upload?`,
                                default: true,
                            },
                        ]);

                        if (proceed) {
                            const { envPath } = await inquirer.prompt([
                                {
                                    type: "input",
                                    name: "envPath",
                                    message:
                                        "Enter the path to your .env file:",
                                    validate: (input: string) => {
                                        try {
                                            fs.accessSync(
                                                path.resolve(input),
                                                fs.constants.R_OK,
                                            );
                                            return true;
                                        } catch (e) {
                                            return "File not readable";
                                        }
                                    },
                                },
                            ]);
                            secrets_plaintext = fs.readFileSync(
                                path.resolve(envPath),
                                "utf-8",
                            );
                        }
                    } else {
                        console.warn(
                            `⚠️  Warning: Your configuration contains environment variables (${Array.from(neededVars).join(", ")}), but no --env file was provided. Ensure your template defaults handle this or provide an .env file.`,
                        );
                    }
                }
            }

            if (globalOptions.interactive) {
                if (!name) {
                    const answers = await inquirer.prompt([
                        {
                            type: "input",
                            name: "name",
                            message: "Enter a name for your VM:",
                            validate: (input: string) =>
                                input.trim() !== "" ||
                                "VM name cannot be empty.",
                        },
                    ]);
                    name = answers.name;
                }
                if (!type) {
                    const answers = await inquirer.prompt([
                        {
                            type: "input",
                            name: "vmTypeId",
                            message:
                                "Enter the VM Type ID (small, medium, large):",
                            validate: (input: string) =>
                                input.trim() !== "" ||
                                "VM Type ID cannot be empty.",
                        },
                    ]);
                    type = answers.vmTypeId;
                }

                if (!environment) {
                    const { envChoice } = await inquirer.prompt([
                        {
                            type: "list",
                            name: "envChoice",
                            message: "Select deployment environment:",
                            choices: [
                                { name: "Development (dev)", value: "dev" },
                                { name: "Production (prod)", value: "prod" },
                            ],
                            default: "dev",
                        },
                    ]);
                    environment = envChoice;
                }

                if (!inviteCode) {
                    const answers = await inquirer.prompt([
                        {
                            type: "input",
                            name: "inviteCode",
                            message:
                                "Enter invite code (optional, press Enter if not needed):",
                        },
                    ]);
                    inviteCode = answers.inviteCode;
                }
                if (cmdOptions.tls === undefined) {
                    const answers = await inquirer.prompt([
                        {
                            type: "confirm",
                            name: "https",
                            message: "Enable HTTPS with TLS?",
                            default: false,
                        },
                    ]);
                    enableHttps = answers.https;
                }

                if (!domain) {
                    const answers = await inquirer.prompt([
                        {
                            type: "input",
                            name: "domain",
                            message: "Enter your custom domain (FQDN):",
                        },
                    ]);
                    domain = answers.domain;
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
                if (!fsPersistence) {
                    const { enablePersistence } = await inquirer.prompt([
                        {
                            type: "confirm",
                            name: "enablePersistence",
                            message:
                                "Do you want to enable filesystem persistence?",
                            default: true,
                        },
                    ]);
                    fsPersistence = enablePersistence;
                }
                if (!platform) {
                    const { platformChoice } = await inquirer.prompt([
                        {
                            type: "list",
                            name: "platformChoice",
                            message: "What platform?",
                            choices: [
                                { name: "Intel TDX", value: "tdx" },
                                { name: "AMD SEV-SNP", value: "sev" },
                            ],
                            default: "tdx",
                        },
                    ]);
                    platform = platformChoice;
                }
                if (!privateMode) {
                    const { enablePrivateMode } = await inquirer.prompt([
                        {
                            type: "confirm",
                            name: "enablePrivateMode",
                            message: "Do you want to enable Private mode?",
                            default: false,
                        },
                    ]);
                    privateMode = enablePrivateMode;
                }
                if (!upgradeability) {
                    const { enableUpgradeability } = await inquirer.prompt([
                        {
                            type: "confirm",
                            name: "enableUpgradeability",
                            message:
                                "Do you want to enable SecretVM upgradeability?",
                            default: false,
                        },
                    ]);
                    upgradeability = enableUpgradeability;
                }
                if (!archive) {
                    const { provideArchive } = await inquirer.prompt([
                        {
                            type: "confirm",
                            name: "provideArchive",
                            message:
                                "Do you want to provide a .tar archive with additional files?",
                            default: false,
                        },
                    ]);
                    if (provideArchive) {
                        const { archivePath } = await inquirer.prompt([
                            {
                                type: "input",
                                name: "archivePath",
                                message: "Enter path to .tar archive:",
                                validate: (input: string) => {
                                    try {
                                        if (!input.endsWith(".tar"))
                                            return "File must be a .tar archive";
                                        fs.accessSync(
                                            path.resolve(input),
                                            fs.constants.R_OK,
                                        );
                                        return true;
                                    } catch (e) {
                                        return "File not found or not readable";
                                    }
                                },
                            },
                        ]);
                        archive = archivePath;
                    }
                }

                if (fsPersistence && !kms) {
                    const { kmsChoice } = await inquirer.prompt([
                        {
                            type: "list",
                            name: "kmsChoice",
                            message: "Select KMS type:",
                            choices: [
                                {
                                    name: "Secret Network KMS",
                                    value: "contract",
                                },
                                { name: "dstack KMS", value: "dstack" },
                                { name: "Google KMS", value: "GKMS" },
                            ],
                            default: "contract",
                        },
                    ]);
                    kms = kmsChoice;
                }
            } else {
                if (!name) {
                    throw new Error("Missing required option: -n, --name");
                }
                if (!type) {
                    throw new Error("Missing required option: -t, --type");
                }
                if (platform && !["sev", "tdx"].includes(platform)) {
                    throw new Error("Platform should be either sev or tdx");
                }
                if (environment && !["dev", "prod"].includes(environment)) {
                    throw new Error(
                        "Environment must be either 'dev' or 'prod'.",
                    );
                }
            }

            if (!environment) {
                environment = "prod";
            }

            const formData = new FormData();

            formData.append("name", name!.trim());
            formData.append("vmTypeId", type!.trim());

            if (environment) {
                formData.append("environment", environment);
            }

            if (inviteCode && inviteCode.trim() !== "") {
                formData.append("inviteCode", inviteCode.trim());
            }

            if (secrets_plaintext && secrets_plaintext.trim() !== "") {
                formData.append("secrets_plaintext", secrets_plaintext.trim());
            }

            if (domain && domain.trim() !== "") {
                formData.append("custom_domain", domain.trim());
                formData.append("skip_launch", "1");
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

            if (enableHttps) {
                const dockerCompose = yaml.load(
                    dockerComposeContent!,
                ) as DockerCompose;

                // Create traefik network if it doesn't exist
                if (!dockerCompose.networks) {
                    dockerCompose.networks = {};
                }
                dockerCompose.networks.traefik = {
                    driver: "bridge",
                };

                // Add Traefik service
                dockerCompose.services.traefik = {
                    image: "traefik:v2.10",
                    command: [
                        "--api.insecure=false",
                        "--providers.docker=true",
                        "--providers.docker.exposedbydefault=false",
                        "--entrypoints.web.address=:80",
                        "--entrypoints.websecure.address=:443",
                        "--certificatesresolvers.myresolver.acme.tlschallenge=true",
                        "--certificatesresolvers.myresolver.acme.email=admin@$DOMAIN_NAME",
                        "--certificatesresolvers.myresolver.acme.storage=/letsencrypt/acme.json",
                    ],
                    ports: ["80:80", "443:443"],
                    volumes: [
                        "/var/run/docker.sock:/var/run/docker.sock:ro",
                        "./letsencrypt:/letsencrypt",
                    ],
                    networks: ["traefik"],
                    labels: {
                        "traefik.enable": "true",
                        "traefik.http.routers.traefik.entrypoints": "websecure",
                        "traefik.http.routers.traefik.service": "api@internal",
                        "traefik.http.routers.traefik.tls.certresolver":
                            "myresolver",
                        "traefik.http.routers.traefik.middlewares": "auth",
                        "traefik.http.middlewares.auth.basicauth.users":
                            "admin:$apr1$H6uskkkW$IgXLP6ewTrSuBkTrqE8wj/",
                    },
                };

                // Add Traefik labels to all other services
                Object.keys(dockerCompose.services).forEach((serviceName) => {
                    if (serviceName !== "traefik") {
                        const service = dockerCompose.services[serviceName];

                        if (!service.networks) {
                            service.networks = [];
                        }
                        if (!service.networks.includes("traefik")) {
                            service.networks.push("traefik");
                        }

                        if (!service.labels) {
                            service.labels = {};
                        }

                        service.labels = {
                            ...service.labels,
                            "traefik.enable": "true",
                            [`traefik.http.routers.${serviceName}.rule`]: `Host(\`$DOMAIN_NAME\`)`,
                            [`traefik.http.routers.${serviceName}.entrypoints`]:
                                "websecure",
                            [`traefik.http.routers.${serviceName}.tls.certresolver`]:
                                "myresolver",
                            [`traefik.http.services.${serviceName}.loadbalancer.server.port`]:
                                "80",
                        };
                    }
                });

                dockerComposeContent = yaml.dump(dockerCompose);
            }
            // The server expects the file field to be named 'dockercompose'
            formData.append(
                "dockercompose",
                dockerComposeContent,
                dockerComposeFilename,
            );

            if (fsPersistence) {
                formData.append("fs_persistence", "1");
            }

            if (platform) {
                formData.append("platform", platform);
            }

            if (privateMode) {
                formData.append("private", "1");
            }

            if (upgradeability) {
                formData.append("upgradeability", "1");
            }

            if (archive) {
                const absoluteArchivePath = path.resolve(archive.trim());
                const dockerFilesFilename = path.basename(absoluteArchivePath);
                const dockerFilesContent = fs
                    .readFileSync(absoluteArchivePath)
                    .toString();

                formData.append(
                    "dockerfiles",
                    dockerFilesContent,
                    dockerFilesFilename,
                );
            }

            if (kms) {
                formData.append("kms_provider", kms);
            }
            return await apiClient.post<CreateVmApiResponse>(
                API_ENDPOINTS.VM.CREATE,
                formData,
                {
                    headers: {
                        ...formData.getHeaders(), // Necessary for multipart/form-data with boundary
                    },
                    maxContentLength: Infinity, // Allow large file uploads
                    maxBodyLength: Infinity, // Allow large file uploads
                },
            );
        },
        (data: AxiosResponse) => {
            if (globalOptions.interactive) {
                if (data.data && data.data.id) {
                    console.log(
                        "\nVM creation process initiated successfully! ✅",
                    );
                    var table = new Table({
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
                        'You can check the VM status using the "list-vms" command shortly.',
                    );
                } else {
                    console.log(
                        "VM creation request may have been processed, but the response format was unexpected:",
                        data.data,
                    );
                }
            } else {
                successResponse(data.data);
            }
        },
    );
}
