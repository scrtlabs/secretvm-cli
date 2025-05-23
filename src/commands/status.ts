import { getApiClient, SERVER_BASE_URL } from "../services/apiClient";
import { AuthSession } from "../types";
import axios from "axios";

export async function statusCommand(): Promise<void> {
    console.log(`Checking session status for server: ${SERVER_BASE_URL}`);
    const apiClient = await getApiClient();
    try {
        const response = await apiClient.get<AuthSession>("/api/auth/session");
        if (response.data && response.data.user && response.data.user.sub) {
            console.log(
                "You are logged in as:",
                response.data.user.email || response.data.user.sub,
            );
            console.log("Session expires:", response.data.expires || "N/A");
        } else if (
            Object.keys(response.data).length === 0 ||
            response.data.user === null
        ) {
            console.log("You are not logged in.");
        } else {
            console.log(
                "Session status unknown or you are not logged in. Received:",
                response.data,
            );
        }
    } catch (error: any) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
            console.log("You are not logged in (Unauthorized).");
        } else if (axios.isAxiosError(error)) {
            console.error(
                "Error checking session status:",
                error.response?.status,
                error.response?.data || error.message,
            );
        } else {
            console.error(
                "An unexpected error occurred while checking status:",
                error.message,
            );
        }
    }
}
