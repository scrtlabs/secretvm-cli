import { GlobalOptions, VerifyQuoteCommandOptions } from "../../types";
import { handleCommandExecution, successResponse } from "../../utils";
import type { VerifyQuoteResult } from "secretvm-verification-sdk";
import {
    createVerificationSdk,
    parseAttestationType,
    resolveQuoteInput,
} from "./utils";

export async function verifyQuoteCommand(
    cmdOptions: VerifyQuoteCommandOptions,
    globalOptions: GlobalOptions,
): Promise<void> {
    const attestationType = parseAttestationType(cmdOptions.attestationType);

    await handleCommandExecution(
        globalOptions,
        async (): Promise<VerifyQuoteResult> => {
            const quote = await resolveQuoteInput(
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
            return await sdk.VerifyQuote({ quote, attestationType });
        },
        (result: VerifyQuoteResult) => {
            if (!globalOptions.interactive) {
                successResponse(result);
                return;
            }

            if (result.ok) {
                console.log(
                    `✅ Quote verified (${result.attestationType.toUpperCase()})`,
                );
                if (result.vmType) {
                    console.log(`  VM Type: ${result.vmType}`);
                }
                if (result.artifactsVersion) {
                    console.log(`  Artifacts Version: ${result.artifactsVersion}`);
                }
                if (result.artifactsLink) {
                    console.log(`  Artifacts Link: ${result.artifactsLink}`);
                }
                if (typeof result.proof_of_cloud === "boolean") {
                    console.log(
                        `  Proof of Cloud: ${result.proof_of_cloud ? "Yes" : "No"}`,
                    );
                }
                if (result.origin) {
                    console.log(`  Origin: ${result.origin}`);
                }
                if (result.warnings && result.warnings.length > 0) {
                    console.log("  Warnings:");
                    result.warnings.forEach((warning) =>
                        console.log(`   - ${warning}`),
                    );
                }
            } else {
                console.error(
                    `❌ Quote verification failed: ${result.error || "Unknown error"}`,
                );
                if (result.attestationType) {
                    console.error(
                        `  Attestation Type: ${result.attestationType}`,
                    );
                }
                if (result.warnings && result.warnings.length > 0) {
                    console.error("  Warnings:");
                    result.warnings.forEach((warning) =>
                        console.error(`   - ${warning}`),
                    );
                }
            }
        },
    );
}
