import axios from "axios";
import { getApiClient } from "../../services/apiClient";
import { StopVmApiResponse } from "../../types";

export async function stopVmCommand(vmId: string): Promise<void> {
    if (!vmId || vmId.trim() === "") {
        console.error("Error: VM ID is required.");
        return;
    }

    const trimmedVmId = vmId.trim();

    try {
        const apiClient = await getApiClient();
        const endpointPath = `/api/vm/${trimmedVmId}/stop`;

        console.log(
            `Sending stop request to: ${apiClient.defaults.baseURL}${endpointPath}`,
        );

        const response = await apiClient.post<StopVmApiResponse>(endpointPath);

        if (response.data) {
            console.log("\nVM stop request processed.");
            console.log("------------------------------------------");
            console.log(`Response Status: ${response.data.status || "N/A"}`);
            if (response.data.message) {
                console.log(`Message: ${response.data.message}`);
            }
            console.log("------------------------------------------");
            console.log(
                `VM ID "${trimmedVmId}" is being stopped. Use "list-vms" to check its status.`,
            );
        } else {
            console.log(
                "VM stop request processed, but the response was empty or in an unexpected format.",
            );
        }
    } catch (error: any) {
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
                    `Error stopping VM (HTTP ${error.response?.status}): ${errorMsg}`,
                );
            }
        } else {
            console.error(
                "An unexpected error occurred during the VM stop operation:",
                error.message || error,
            );
        }
    }
}
