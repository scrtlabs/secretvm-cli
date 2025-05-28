import { getApiClient } from "../../services/apiClient";
import { GlobalOptions } from "../../types";
import axios from "axios";
import { successResponse, errorResponse } from "../../utils";

export async function vmAttestationCommand(
    vmId: string,
    globalOptions: GlobalOptions,
): Promise<void> {
    const apiClient = await getApiClient();

    try {
        const response = await apiClient.get<string>(`/api/vm/${vmId}/cpu`);
        const attestation = response.data;

        if (globalOptions.interactive) {
            if (attestation) {
                console.log(attestation);
            } else {
                console.log(
                    "Received an unexpected response for VM attestation.",
                );
            }
        } else {
            successResponse(attestation);
        }
    } catch (error: any) {
        if (globalOptions.interactive) {
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
        } else {
            errorResponse(error);
        }
    }
}
