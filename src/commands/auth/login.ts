import inquirer from "inquirer";
import {
    getApiClient,
    saveSession,
    getCurrentJar,
    SERVER_BASE_URL,
} from "../../services/apiClient";
import { getCsrfToken, loginWithKeplr } from "../../services/authService";

export async function loginCommand(): Promise<void> {
    console.log(`Attempting to login to server: ${SERVER_BASE_URL}`);
    const apiClient = await getApiClient();

    try {
        const csrfToken = await getCsrfToken(apiClient);
        console.log("CSRF Token obtained.");

        const answers = await inquirer.prompt([
            {
                type: "input",
                name: "walletAddress",
                message: "Enter your Keplr wallet address:",
                validate: (input: string) =>
                    input.trim() !== "" || "Wallet address cannot be empty.",
            },
        ]);
        const { walletAddress } = answers;

        const loginResult = await loginWithKeplr(
            apiClient,
            walletAddress,
            csrfToken,
        );

        if (loginResult) {
            // A 302 redirect with a cookie set is also a success
            const jar = getCurrentJar(apiClient);
            if (jar) {
                await saveSession(jar);
                console.log("Login successful and session saved.");
            } else {
                console.error(
                    "Login seemed successful, but could not retrieve session jar to save.",
                );
            }
        } else {
            console.log(
                "Login failed. Please check credentials and server logs.",
            );
        }
    } catch (error: any) {
        console.error("An error occurred during login:", error.message);
    }
}
