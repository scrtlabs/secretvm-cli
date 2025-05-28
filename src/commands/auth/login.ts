import inquirer from "inquirer";
import {
    getApiClient,
    saveSession,
    getCurrentJar,
} from "../../services/apiClient";
import { getCsrfToken, loginWithKeplr } from "../../services/authService";
import { LoginCommandOptions, GlobalOptions } from "../../types";
import { errorResponse, successResponse } from "../../utils";

export async function loginCommand(
    cmdOptions: LoginCommandOptions,
    globalOptions: GlobalOptions,
): Promise<void> {
    let walletAddress = cmdOptions.walletAddress;
    const interactive = globalOptions.interactive;

    const apiClient = await getApiClient();

    try {
        const csrfToken = await getCsrfToken(apiClient);
        if (!interactive && !walletAddress) {
            errorResponse("Missing required option: -w, --wallet-address");
            return;
        }
        if (interactive && !walletAddress) {
            const answers = await inquirer.prompt([
                {
                    type: "input",
                    name: "walletAddress",
                    message: "Enter your Keplr wallet address:",
                    validate: (input: string) =>
                        input.trim() !== "" ||
                        "Wallet address cannot be empty.",
                },
            ]);
            walletAddress = answers.walletAddress;
        }

        const loginResult = await loginWithKeplr(
            apiClient,
            walletAddress!,
            csrfToken,
        );

        if (loginResult) {
            // A 302 redirect with a cookie set is also a success
            const jar = getCurrentJar(apiClient);
            if (jar) {
                await saveSession(jar);
                if (interactive)
                    console.log("Login successful and session saved.");
            } else {
                console.error(
                    "Login seemed successful, but could not retrieve session jar to save.",
                );
            }
        } else {
            if (interactive) {
                console.log(
                    "Login failed. Please check credentials and server logs.",
                );
            } else {
                errorResponse(
                    "Login failed. Please check credentials and server logs.",
                );
                return;
            }
        }
        if (!interactive) successResponse({ wallet_address: walletAddress });
    } catch (error: any) {
        if (interactive) {
            console.error("An error occurred during login:", error.message);
        } else {
            errorResponse(error);
        }
    }
}
