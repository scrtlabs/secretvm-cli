import inquirer from "inquirer";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import { getApiClient } from "../../services/apiClient";
import {
    CreateVmApiResponse,
    GlobalOptions,
    CreateVmCommandOptions,
} from "../../types";
import { handleCommandExecution, successResponse } from "../../utils";
import Table from "cli-table3";
import { API_ENDPOINTS } from "../../constants";
import { AxiosResponse } from "axios";

export async function createVmCommand(
    cmdOptions: CreateVmCommandOptions,
    globalOptions: GlobalOptions,
): Promise<void> {
    let name = cmdOptions.name;
    let type = cmdOptions.type;
    let dockerComposePath = cmdOptions.dockerCompose;
    let inviteCode = cmdOptions.inviteCode;

    await handleCommandExecution(
        globalOptions,
        async (): Promise<AxiosResponse> => {
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
                    throw new Error("Missing required option: -n, --name");
                }
                if (!type) {
                    throw new Error("Missing required option: -t, --type");
                }
                if (!dockerComposePath) {
                    throw new Error(
                        "Missing required option: -d, --docker-compose",
                    );
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
                        "\nVM creation process initiated successfully!",
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
