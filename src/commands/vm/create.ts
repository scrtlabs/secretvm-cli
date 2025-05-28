import inquirer from "inquirer";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import axios from "axios";
import { getApiClient } from "../../services/apiClient";
import {
    CreateVmApiResponse,
    GlobalOptions,
    CreateVmCommandOptions,
} from "../../types";
import { successResponse, errorResponse } from "../../utils";
import Table from "cli-table3";

export async function createVmCommand(
    cmdOptions: CreateVmCommandOptions,
    globalOptions: GlobalOptions,
): Promise<void> {
    const interactive = globalOptions.interactive;
    let name = cmdOptions.name;
    let type = cmdOptions.type;
    let dockerComposePath = cmdOptions.dockerCompose;
    let inviteCode = cmdOptions.inviteCode;
    try {
        if (interactive) {
            if (!name) {
                const answers = await inquirer.prompt([
                    {
                        type: "input",
                        name: "name",
                        message: "Enter a name for your VM:",
                        validate: (input: string) =>
                            input.trim() !== "" || "VM name cannot be empty.",
                    },
                ]);
                name = answers.name;
            }
            if (!type) {
                const answers = await inquirer.prompt([
                    {
                        type: "input",
                        name: "vmTypeId",
                        message: "Enter the VM Type ID (small, medium, large):",
                        validate: (input: string) =>
                            input.trim() !== "" ||
                            "VM Type ID cannot be empty.",
                    },
                ]);
                type = answers.vmTypeId;
            }
            if (!dockerComposePath) {
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
                                // Check if path is absolute or resolve it
                                const resolvedPath = path.resolve(trimmedInput);
                                fs.accessSync(resolvedPath, fs.constants.R_OK);
                                return true;
                            } catch (err) {
                                return `File "${trimmedInput}" does not exist or is not readable.`;
                            }
                        },
                    },
                ]);
                dockerComposePath = answers.dockerComposePath;
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
        } else {
            if (!name) {
                errorResponse("Missing required option: -n, --name");
                return;
            }
            if (!type) {
                errorResponse("Missing required option: -t, --type");
                return;
            }
            if (!dockerComposePath) {
                errorResponse("Missing required option: -d, --docker-compose");
                return;
            }
        }

        const apiClient = await getApiClient();
        const formData = new FormData();

        formData.append("name", name!.trim());
        formData.append("vmTypeId", type!.trim());

        if (inviteCode && inviteCode.trim() !== "") {
            formData.append("inviteCode", inviteCode.trim());
        }

        const absoluteDockerComposePath = path.resolve(
            dockerComposePath!.trim(),
        );
        const fileBuffer = fs.readFileSync(absoluteDockerComposePath);
        // The server expects the file field to be named 'dockercompose'
        formData.append(
            "dockercompose",
            fileBuffer,
            path.basename(absoluteDockerComposePath),
        );

        if (interactive) console.log("Sending VM creation request...");

        const response = await apiClient.post<CreateVmApiResponse>(
            "/api/vm/create",
            formData,
            {
                headers: {
                    ...formData.getHeaders(), // Necessary for multipart/form-data with boundary
                },
                maxContentLength: Infinity, // Allow large file uploads
                maxBodyLength: Infinity, // Allow large file uploads
            },
        );

        if (interactive) {
            if (response.data && response.data.id) {
                console.log("\nVM creation process initiated successfully!");
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
                    response.data.vmId,
                    response.data.nameFromUser,
                    response.data.status,
                    response.data.vmTypeId,
                    response.data.ip_address,
                    response.data.vmDomain,
                    response.data.createdAt,
                ]);
                console.log(table.toString());
                console.log(
                    'You can check the VM status using the "list-vms" command shortly.',
                );
            } else {
                console.log(
                    "VM creation request may have been processed, but the response format was unexpected:",
                    response.data,
                );
            }
        } else {
            successResponse(response.data);
        }
    } catch (error: any) {
        if (interactive) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 401) {
                    console.error(
                        'Error: Unauthorized. Please login first using the "login" command.',
                    );
                } else {
                    const errorMsg =
                        error.response?.data?.message ||
                        error.response?.data ||
                        error.message;
                    console.error(
                        `Error creating VM (HTTP ${error.response?.status}): ${errorMsg}`,
                    );
                }
            } else {
                console.error(
                    "An unexpected error occurred during VM creation:",
                    error.message || error,
                );
            }
        } else {
            errorResponse(error);
        }
    }
}
