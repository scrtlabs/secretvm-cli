import { clearSession } from "../../services/apiClient";
import { successResponse } from "../../utils";
import { GlobalOptions } from "../../types";

export async function logoutCommand(
    globalOptions: GlobalOptions,
): Promise<void> {
    await clearSession();
    if (!globalOptions.interactive) successResponse({});
    else console.log("Session cleared");
}
