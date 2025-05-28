import axios from "axios";
import { getApiClient } from "../../services/apiClient";
import { VmDetailsApiResponse, GlobalOptions } from "../../types";
import { successResponse, errorResponse } from "../../utils";

export async function vmStatusCommand(
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

    const trimmedInternalId = vmId.trim();

    try {
        const apiClient = await getApiClient();
        const endpointPath = `/api/vm/${trimmedInternalId}`;

        const response =
            await apiClient.get<VmDetailsApiResponse>(endpointPath);

        if (globalOptions.interactive) {
            if (response.data) {
                const vm = response.data;
                console.log("\n✅ --- VM Details ---");
                console.log(`  VM UUID:        ${vm.id}`);
                console.log(`  VM ID:          ${vm.vmId}`);
                console.log(`  Name (User):    ${vm.nameFromUser || "N/A"}`);
                console.log(`  Name (System):  ${vm.name}`);
                console.log(
                    `  Status:         ${vm.status} (State: ${vm.state})`,
                );
                console.log(`  User Sub:       ${vm.user}`);
                console.log(`  IP Address:     ${vm.ip_address || "N/A"}`);
                console.log(`  Domain:         ${vm.vmDomain || "N/A"}`);
                console.log(
                    `  Created At:     ${new Date(vm.created_at).toLocaleString()}`,
                );
                console.log(
                    `  Updated At:     ${new Date(vm.updated_at).toLocaleString()}`,
                );

                console.log("\n  ⚙️ --- VM Configuration ---");
                console.log(`    Memory:       ${vm.memory} GB`);
                console.log(`    VCPUs:        ${vm.vcpus}`);
                console.log(`    Disk Size:    ${vm.disk_size} GB`);

                console.log("\n  📦 --- VM Type ---");
                console.log(`    Type Name:    ${vm.vmType.type}`);
                console.log(`    CPU:          ${vm.vmType.cpu} cores`);
                console.log(`    RAM:          ${vm.vmType.ram} GB`);
                console.log(`    Disk:         ${vm.vmType.disk} GB`);
                console.log(
                    `    Price/Hour:   $${Number(vm.vmType.pricePerHour).toFixed(2)}`,
                );

                console.log("\n  🖥️ --- Host ---");
                console.log(
                    `    Host Name:    ${vm.host.name} (${vm.host.host}:${vm.host.port})`,
                );

                console.log("\n  🌐 --- Network ---");
                console.log(`    Gateway:      ${vm.gateway || "N/A"}`);
                console.log(`    Bridge:       ${vm.network_bridge || "N/A"}`);
                console.log(
                    `    TAP Device:   ${vm.network_is_tap ? "Yes" : "No"}`,
                );
                console.log(
                    `    Ports:        ${vm.network_ports ? JSON.stringify(vm.network_ports) : "N/A"}`,
                );

                if (vm.docker_file && vm.docker_file.trim() !== "") {
                    console.log("\n  📄 --- Docker Config (Snippet) ---");
                    const snippet = vm.docker_file.substring(0, 250);
                    console.log(
                        snippet + (vm.docker_file.length > 250 ? "..." : ""),
                    );
                }
                console.log("--------------------");
            } else {
                console.log(
                    "VM details request processed, but the response was empty or in an unexpected format.",
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
                        `Error: VM with Internal DB ID "${trimmedInternalId}" not found or you are not authorized to view it.`,
                    );
                } else {
                    const errorMsg =
                        error.response?.data?.message ||
                        error.response?.data ||
                        error.message;
                    console.error(
                        `Error fetching VM details (HTTP ${error.response?.status}): ${errorMsg}`,
                    );
                }
            } else {
                console.error(
                    "An unexpected error occurred while fetching VM details:",
                    error.message || error,
                );
            }
        } else {
            errorResponse(error);
        }
    }
}
