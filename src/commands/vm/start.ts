import axios from "axios";
import { getApiClient } from "../../services/apiClient";
import { StartVmApiResponse, GlobalOptions } from "../../types";
import { successResponse, errorResponse } from "../../utils";

export async function startVmCommand(
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
        const apiClient = await getApiClient();
        const endpointPath = `/api/vm/${trimmedVmId}/start`;

        const response = await apiClient.post<StartVmApiResponse>(endpointPath);

        if (globalOptions.interactive) {
            if (response.data) {
                console.log("\nVM start request processed.");
                console.log("------------------------------------------");
                console.log(
                    `Response Status: ${response.data.status || "N/A"}`,
                );
                if (response.data.message) {
                    console.log(`Message: ${response.data.message}`);
                }
                if (response.data.data) {
                    console.log(
                        "Details:",
                        JSON.stringify(response.data.data, null, 2),
                    );
                }
                console.log("------------------------------------------");
                console.log(
                    `VM ID "${trimmedVmId}" is being started. Use "list-vms" to check its status shortly.`,
                );
            } else {
                console.log(
                    "VM start request processed, but the response was empty or in an unexpected format.",
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
                        `Error: VM ID "${trimmedVmId}" not found or you are not authorized to perform this action.`,
                    );
                } else {
                    const errorMsg =
                        error.response?.data?.message ||
                        error.response?.data ||
                        error.message;
                    console.error(
                        `Error starting VM (HTTP ${error.response?.status}): ${errorMsg}`,
                    );
                }
            } else {
                console.error(
                    "An unexpected error occurred during the VM start operation:",
                    error.message || error,
                );
            }
        } else {
            errorResponse(error);
        }
    }
}
