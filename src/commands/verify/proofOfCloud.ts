import { GlobalOptions, VerifyProofOfCloudCommandOptions } from "../../types";
import { handleCommandExecution, successResponse } from "../../utils";
import type { VerifyProofOfCloudResult } from "secretvm-verification-sdk";
import { createVerificationSdk, resolveQuoteInput } from "./utils";

export async function verifyProofOfCloudCommand(
    cmdOptions: VerifyProofOfCloudCommandOptions,
    globalOptions: GlobalOptions,
): Promise<void> {
    await handleCommandExecution(
        globalOptions,
        async (): Promise<VerifyProofOfCloudResult> => {
            const quoteHex = await resolveQuoteInput(
                {
                    quote: cmdOptions.quote,
                    quoteFile: cmdOptions.quoteFile,
                    vmId: cmdOptions.vmId,
                },
                globalOptions,
            );
            const sdk = await createVerificationSdk(globalOptions, {
                baseUrl: cmdOptions.baseUrl,
                environment: cmdOptions.environment,
            });
            return await sdk.VerifyProofOfCloud({ quoteHex });
        },
        (result: VerifyProofOfCloudResult) => {
            if (!globalOptions.interactive) {
                successResponse(result);
                return;
            }

            if (result.error) {
                console.error(
                    `❌ Proof of Cloud verification failed: ${result.error}`,
                );
                return;
            }

            const verified = result.proof_of_cloud === true;
            console.log(
                `✅ Proof of Cloud: ${verified ? "Verified" : "Not verified"}`,
            );
            if (result.origin) {
                console.log(`  Origin: ${result.origin}`);
            }
            if (result.machine_id) {
                console.log(`  Machine ID: ${result.machine_id}`);
            }
        },
    );
}
