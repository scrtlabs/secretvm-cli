import { getApiClient } from "../../services/apiClient";
import { VmInstance, GlobalOptions } from "../../types";
import { successResponse, errorResponse } from "../../utils";
import axios from "axios";
import Table from "cli-table3";

export async function listVmsCommand(
    globalOptions: GlobalOptions,
): Promise<void> {
    const apiClient = await getApiClient();

    try {
        const response = await apiClient.get<VmInstance[]>("/api/vm/instances");
        const vms = response.data;

        if (globalOptions.interactive) {
            if (vms && vms.length > 0) {
                var table = new Table({
                    head: [
                        "ID",
                        "UUID",
                        "Name",
                        "Status",
                        "Type",
                        "PricePerHour",
                        "IP",
                        "Domain",
                        "Created At",
                    ],
                });
                vms.forEach((vm) => {
                    table.push([
                        vm.vmId,
                        vm.id,
                        vm.nameFromUser,
                        vm.status,
                        vm.vmTypeId,
                        vm.vmType.pricePerHour,
                        vm.ip_address,
                        vm.vmDomain,
                        vm.createdAt,
                    ]);
                });
                console.log(table.toString());
            } else if (vms) {
                console.log("No VM instances found.");
            } else {
                console.log("Received an unexpected response for VM list.");
            }
        } else {
            successResponse(vms);
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
                        "Error fetching VM instances:",
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
