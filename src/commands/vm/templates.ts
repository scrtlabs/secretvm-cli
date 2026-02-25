import { getApiClient } from "../../services/apiClient";
import { Template, GlobalOptions } from "../../types";
import { AxiosResponse } from "axios";
import { handleCommandExecution, successResponse } from "../../utils";
import Table from "cli-table3";
import { API_ENDPOINTS } from "../../constants";

export async function listTemplatesCommand(
    globalOptions: GlobalOptions,
): Promise<void> {
    await handleCommandExecution(
        globalOptions,
        async (): Promise<AxiosResponse> => {
            const apiClient = await getApiClient(globalOptions);
            return await apiClient.get<Template[]>(API_ENDPOINTS.VM.TEMPLATES);
        },
        (data: AxiosResponse) => {
            if (globalOptions.interactive) {
                if (data.data && data.data.length > 0) {
                    const table = new Table({
                        head: [
                            "ID",
                            "Name",
                            "Description",
                            "Default Size",
                            "Tags",
                        ],
                        colWidths: [30, 25, 40, 15, 20],
                        wordWrap: true,
                    });
                    data.data.forEach((t: Template) => {
                        table.push([
                            t.id,
                            t.name,
                            t.description,
                            t.defaultVmSize,
                            t.tags.join(", "),
                        ]);
                    });
                    console.log(table.toString());
                } else if (data.data) {
                    console.log("No templates available.");
                } else {
                    console.log(
                        "Received an unexpected response for templates list.",
                    );
                }
            } else {
                const sanitized = Array.isArray(data.data)
                    ? data.data.map((t: Template) => {
                          const { docker, ...rest } = t;
                          return rest;
                      })
                    : data.data;
                successResponse(sanitized);
            }
        },
    );
}
