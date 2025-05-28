import inquirer from "inquirer";
import axios from "axios";
import { getApiClient } from "../../services/apiClient";
import { RemoveVmApiResponse, GlobalOptions } from "../../types";
import { successResponse, errorResponse } from "../../utils";

export async function removeVmCommand(
    vmId: string,
    globalOptions: GlobalOptions,
): Promise<void> {
    if (!vmId || vmId.trim() === "") {
        if (globalOptions.interactive) {
            console.error("Error: VM ID is required.");
        } else {
            errorResponse("VM ID is required");
        }
        return;
    }

    const trimmedVmId = vmId.trim();

    try {
        if (globalOptions.interactive) {
            const confirmation = await inquirer.prompt([
                {
                    type: "confirm",
                    name: "confirmRemove",
                    message: `🛑 Are you sure you want to remove VM ID "${trimmedVmId}"? This action will terminate the VM and delete its record. This cannot be undone.`,
                    default: false,
                },
            ]);

            if (!confirmation.confirmRemove) {
                console.log("VM removal cancelled by user.");
                return;
            }
        }

        const apiClient = await getApiClient();

        const endpointPath = `/api/vm/${trimmedVmId}/terminate`;

        const response =
            await apiClient.delete<RemoveVmApiResponse>(endpointPath);

        if (globalOptions.interactive) {
            if (response.data) {
                console.log("\nVM remove request processed successfully!");
                console.log("------------------------------------------");
                console.log(
                    `Response Status: ${response.data.status || "N/A"}`,
                );
                if (response.data.message) {
                    console.log(`Message: ${response.data.message}`);
                }
                console.log("------------------------------------------");
                console.log(`VM ID "${trimmedVmId}" has been removed.`);
            } else {
                console.log(
                    "VM remove request processed, but the response was empty or in an unexpected format.",
                );
            }
        } else {
            successResponse(response.data);
        }
    } catch (error: any) {
        if (globalOptions.interactive) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 401) {
                    console.error(
                        'Error: Unauthorized. Please login first using the "login" command.',
                    );
                } else if (error.response?.status === 404) {
                    console.error(
                        `Error: VM ID "${trimmedVmId}" not found or you are not authorized to remove it.`,
                    );
                } else {
                    const errorMsg =
                        error.response?.data?.message ||
                        error.response?.data ||
                        error.message;
                    console.error(
                        `Error removing VM (HTTP ${error.response?.status}): ${errorMsg}`,
                    );
                }
            } else {
                console.error(
                    "An unexpected error occurred during the VM removal operation:",
                    error.message || error,
                );
            }
        } else {
            errorResponse(error);
        }
    }
}
