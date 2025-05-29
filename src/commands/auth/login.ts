import inquirer from "inquirer";
import {
    getApiClient,
    saveSession,
    getCurrentJar,
} from "../../services/apiClient";
import { getCsrfToken, loginWithKeplr } from "../../services/authService";
import { LoginCommandOptions, GlobalOptions } from "../../types";
import { successResponse, handleCommandExecution } from "../../utils";

export async function loginCommand(
    cmdOptions: LoginCommandOptions,
    globalOptions: GlobalOptions,
): Promise<void> {
    let walletAddress = cmdOptions.walletAddress;
    await handleCommandExecution(
        globalOptions,
        async (): Promise<string> => {
            if (!globalOptions.interactive && !walletAddress) {
                throw new Error(
                    "Missing required option: -w, --wallet-address",
                );
            }
            if (globalOptions.interactive && !walletAddress) {
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
            const apiClient = await getApiClient();
            const csrfToken = await getCsrfToken(apiClient);
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
                } else {
                    console.error(
                        "Login seemed successful, but could not retrieve session jar to save.",
                    );
                }
            } else {
                throw new Error(
                    "Login failed. Please check credentials and server logs.",
                );
            }
            return walletAddress!;
        },
        (data: string) => {
            if (globalOptions.interactive) {
                console.log(
                    `Login successful and session saved. Logged in as ${data}`,
                );
            } else {
                successResponse({ wallet_address: data });
            }
        },
    );
}
