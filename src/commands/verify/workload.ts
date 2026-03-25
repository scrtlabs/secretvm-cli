import fs from "fs";
import path from "path";
import { GlobalOptions, VerifyWorkloadCommandOptions } from "../../types";
import { handleCommandExecution, successResponse } from "../../utils";
import type { VerifyWorkloadResult } from "secretvm-verification-sdk";
import {
    createVerificationSdk,
    ensureWorkloadRuntime,
    parseAttestationType,
    resolveQuoteInput,
} from "./utils";

export async function verifyWorkloadCommand(
    cmdOptions: VerifyWorkloadCommandOptions,
    globalOptions: GlobalOptions,
): Promise<void> {
    if (!cmdOptions.dockerCompose || cmdOptions.dockerCompose.trim() === "") {
        throw new Error("Missing required option: --docker-compose");
    }

    const dockerComposePath = path.resolve(cmdOptions.dockerCompose.trim());
    try {
        fs.accessSync(dockerComposePath, fs.constants.R_OK);
    } catch (err) {
        throw new Error(
            `Docker compose file "${cmdOptions.dockerCompose}" does not exist or is not readable.`,
        );
    }

    const dockerComposeContent = fs.readFileSync(dockerComposePath, "utf-8");
    const dockerComposeFilename = path.basename(dockerComposePath);

    let dockerFiles: Uint8Array | undefined;
    if (cmdOptions.dockerFiles && cmdOptions.dockerFiles.trim() !== "") {
        const dockerFilesPath = path.resolve(cmdOptions.dockerFiles.trim());
        try {
            fs.accessSync(dockerFilesPath, fs.constants.R_OK);
        } catch (err) {
            throw new Error(
                `Docker files "${cmdOptions.dockerFiles}" does not exist or is not readable.`,
            );
        }
        dockerFiles = fs.readFileSync(dockerFilesPath);
    }

    const dockerFilesSha256 = cmdOptions.dockerFilesSha256?.trim();
    const attestationType = parseAttestationType(cmdOptions.attestationType);

    await handleCommandExecution(
        globalOptions,
        async (): Promise<VerifyWorkloadResult> => {
            ensureWorkloadRuntime(!!dockerFiles, !!dockerFilesSha256);
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
            return await sdk.VerifyWorkload({
                quote,
                dockerCompose: dockerComposeContent,
                dockerComposeFilename,
                dockerFiles,
                dockerFilesSha256,
                attestationType,
            });
        },
        (result: VerifyWorkloadResult) => {
            if (!globalOptions.interactive) {
                successResponse(result);
                return;
            }

            if (result.ok) {
                console.log(
                    `✅ Workload verified (${result.attestationType.toUpperCase()})`,
                );
                if (result.artifactsLink) {
                    console.log(`  Artifacts Link: ${result.artifactsLink}`);
                }
                if (result.workloadResult?.message) {
                    console.log(`  Message: ${result.workloadResult.message}`);
                }
            } else {
                console.error(
                    `❌ Workload verification failed: ${result.error || "Unknown error"}`,
                );
                if (result.quoteResult && !result.quoteResult.ok) {
                    console.error(
                        `  Quote error: ${result.quoteResult.error || "Unknown error"}`,
                    );
                }
                if (result.workloadResult?.message) {
                    console.error(`  Message: ${result.workloadResult.message}`);
                }
            }
        },
    );
}
