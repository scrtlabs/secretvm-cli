import fs from "fs";
import path from "path";
import { getApiClient } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants";
import { GlobalOptions } from "../../types";
import type {
    AttestationTypeInput,
    SdkConfig,
    SdkEnvironment,
} from "secretvm-verification-sdk";

type SecretVmSdkModule = typeof import("secretvm-verification-sdk");

const dynamicImport = new Function(
    "modulePath",
    "return import(modulePath);",
);

export async function loadSecretVmSdk(): Promise<SecretVmSdkModule> {
    return dynamicImport(
        "secretvm-verification-sdk",
    ) as Promise<SecretVmSdkModule>;
}

export function ensureFetchAvailable(): void {
    if (typeof globalThis.fetch !== "function") {
        throw new Error(
            "Fetch API not available. Use Node 18+ or provide a global fetch implementation.",
        );
    }
}

export function ensureWorkloadRuntime(
    hasDockerFiles: boolean,
    hasDockerFilesSha256: boolean,
): void {
    if (typeof globalThis.FormData === "undefined") {
        throw new Error(
            "FormData is not available in this runtime. Use Node 18+.",
        );
    }
    if (typeof globalThis.Blob === "undefined") {
        throw new Error("Blob is not available in this runtime. Use Node 18+.");
    }
    if (!globalThis.crypto?.subtle && hasDockerFiles && !hasDockerFilesSha256) {
        throw new Error(
            "WebCrypto is not available to hash docker files. Use Node 18+ or provide --docker-files-sha256.",
        );
    }
}

export function resolveSdkConfig(
    globalOptions: GlobalOptions,
    options: { baseUrl?: string; environment?: string },
): SdkConfig {
    const config: SdkConfig = {};
    if (options.baseUrl) {
        config.baseUrl = options.baseUrl;
    } else if (options.environment) {
        config.environment = normalizeEnvironment(options.environment);
    } else if (process.env.SERVER_BASE_URL) {
        config.baseUrl = process.env.SERVER_BASE_URL;
    }

    if (globalOptions.apiKey) {
        config.apiKey = globalOptions.apiKey;
    }

    return config;
}

export function normalizeEnvironment(
    input?: string,
): SdkEnvironment | undefined {
    if (!input) return undefined;
    const normalized = input.toLowerCase();
    if (normalized === "production" || normalized === "preview") {
        return normalized as SdkEnvironment;
    }
    throw new Error(
        `Invalid environment "${input}". Expected "production" or "preview".`,
    );
}

export function parseAttestationType(
    input?: string,
): AttestationTypeInput | undefined {
    if (!input) return undefined;
    const normalized = input.toLowerCase();
    if (normalized === "auto" || normalized === "tdx" || normalized === "sev") {
        return normalized as AttestationTypeInput;
    }
    throw new Error(
        `Invalid attestation type "${input}". Expected "auto", "tdx", or "sev".`,
    );
}

export async function createVerificationSdk(
    globalOptions: GlobalOptions,
    options: { baseUrl?: string; environment?: string },
) {
    ensureFetchAvailable();
    const { createSecretVmSdk } = await loadSecretVmSdk();
    const config = resolveSdkConfig(globalOptions, options);
    return createSecretVmSdk(config);
}

export async function resolveQuoteInput(
    options: { quote?: string; quoteFile?: string; vmId?: string },
    globalOptions: GlobalOptions,
): Promise<string> {
    const sources = [
        options.quote ? "quote" : null,
        options.quoteFile ? "quoteFile" : null,
        options.vmId ? "vmId" : null,
    ].filter(Boolean);

    if (sources.length === 0) {
        throw new Error("Provide one of --quote, --quote-file, or --vm-id.");
    }
    if (sources.length > 1) {
        throw new Error(
            "Provide only one of --quote, --quote-file, or --vm-id.",
        );
    }

    if (options.quote) {
        return options.quote.trim();
    }

    if (options.quoteFile) {
        return readTextFile(options.quoteFile, "Quote file");
    }

    return await fetchQuoteFromVm(options.vmId!, globalOptions);
}

function readTextFile(filePath: string, label: string): string {
    const trimmedPath = filePath.trim();
    if (!trimmedPath) {
        throw new Error(`${label} path cannot be empty.`);
    }
    const absolutePath = path.resolve(trimmedPath);
    try {
        fs.accessSync(absolutePath, fs.constants.R_OK);
    } catch (err) {
        throw new Error(
            `${label} "${trimmedPath}" does not exist or is not readable.`,
        );
    }
    return fs.readFileSync(absolutePath, "utf-8").trim();
}

async function fetchQuoteFromVm(
    vmId: string,
    globalOptions: GlobalOptions,
): Promise<string> {
    const trimmedVmId = vmId.trim();
    if (!trimmedVmId) {
        throw new Error("VM ID is required to fetch the quote.");
    }
    const apiClient = await getApiClient(globalOptions);
    const response = await apiClient.get<any>(
        API_ENDPOINTS.VM.CPU_ATTESTATION(trimmedVmId),
    );
    const data = response.data;
    if (typeof data === "string") {
        return data.trim();
    }
    if (data && typeof data.quote === "string") {
        return data.quote.trim();
    }
    throw new Error("Unexpected attestation response format.");
}
