import { clearSession } from "../../services/apiClient";

export async function logoutCommand(): Promise<void> {
    await clearSession();
}
