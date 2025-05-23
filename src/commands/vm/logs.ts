import { getApiClient } from "../../services/apiClient";
import axios from "axios";

export async function vmLogsCommand(vmId: string): Promise<void> {
    const apiClient = await getApiClient();

    try {
        const response = await apiClient.get<string>(
            `/api/vm/${vmId}/docker_logs`,
        );
        const logs = response.data;

        if (logs) {
            console.log(logs);
        } else {
            console.log("Received an unexpected response for VM logs.");
        }
    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            if (error.response?.status === 401) {
                console.error(
                    'Error: Unauthorized. Please login first using "login" command.',
                );
            } else {
                console.error(
                    "Error fetching VM logs:",
                    error.response?.status,
                    error.response?.data || error.message,
                );
            }
        } else {
            console.error("An unexpected error occurred:", error.message);
        }
    }
}
