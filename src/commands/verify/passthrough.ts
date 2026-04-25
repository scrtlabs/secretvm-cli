import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { getApiClient } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants";
import {
    GlobalOptions,
    VerifyCommandOptions,
    VmDetailsApiResponse,
} from "../../types";

const VERB_FLAGS_THAT_ACCEPT_VM = new Set([
    "--cpu",
    "--tdx",
    "--sev",
    "--gpu",
    "--resolve-version",
    "-rv",
    "--verify-workload",
    "-vw",
    "--compose",
]);

const VERB_FLAGS_THAT_SPECIFY_TARGET = new Set([
    "--secretvm",
    "--vm",
    "--check-agent",
    "--agent",
]);

export async function verifyCommand(
    cmdOptions: VerifyCommandOptions,
    globalOptions: GlobalOptions,
): Promise<void> {
    const verifyIdx = process.argv.lastIndexOf("verify");
    const rawArgs = verifyIdx >= 0 ? process.argv.slice(verifyIdx + 1) : [];

    // Strip --vm-id and its value from the forwarded args.
    // Handles both `--vm-id <value>` and `--vm-id=<value>` forms.
    const passthrough: string[] = [];
    for (let i = 0; i < rawArgs.length; i++) {
        if (rawArgs[i] === "--vm-id") {
            i++; // skip value
            continue;
        }
        if (rawArgs[i].startsWith("--vm-id=")) {
            continue;
        }
        passthrough.push(rawArgs[i]);
    }

    const { binPath, version } = resolveUpstream();

    // No args, or --help / -h: print our note, then forward help with
    // the upstream CLI name rewritten to "secretvm-cli verify" so the
    // shown examples match what the user actually types.
    const isHelp =
        passthrough.length === 0 ||
        passthrough.some((a) => a === "--help" || a === "-h");
    if (isHelp) {
        console.log(
            `The commands are passed to secretvm-verify SDK, using version ${version} of secretvm-verify.`,
        );
        const helpArgs = passthrough.length === 0 ? ["--help"] : passthrough;
        await spawnUpstreamForHelp(binPath, helpArgs);
        return;
    }

    // --vm-id translation.
    if (cmdOptions.vmId) {
        for (const arg of passthrough) {
            if (VERB_FLAGS_THAT_SPECIFY_TARGET.has(arg)) {
                throw new Error(
                    `Cannot combine --vm-id with ${arg} (both specify the target VM).`,
                );
            }
        }
        const hostname = await resolveVmHostname(
            cmdOptions.vmId,
            globalOptions,
        );
        const hasVerbFlag = passthrough.some((a) =>
            VERB_FLAGS_THAT_ACCEPT_VM.has(a),
        );
        if (hasVerbFlag) {
            passthrough.push("--vm", hostname);
        } else {
            passthrough.push("--secretvm", hostname);
        }
    }

    await spawnUpstream(binPath, passthrough);
}

function resolveUpstream(): { binPath: string; version: string } {
    const pkgDir = findPackageDir(__dirname, "secretvm-verify");
    if (!pkgDir) {
        throw new Error(
            "Failed to locate the secretvm-verify package. Reinstall with `npm install secretvm-verify`.",
        );
    }
    const pkgJsonPath = path.join(pkgDir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    const binRelative =
        typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.["secretvm-verify"];
    if (!binRelative) {
        throw new Error(
            `secretvm-verify package.json at ${pkgJsonPath} does not declare a bin.secretvm-verify entry.`,
        );
    }
    const binPath = path.resolve(pkgDir, binRelative);
    if (!fs.existsSync(binPath)) {
        throw new Error(
            `secretvm-verify binary not found at ${binPath}. Try reinstalling the package.`,
        );
    }
    const version = typeof pkg.version === "string" ? pkg.version : "unknown";
    return { binPath, version };
}

function findPackageDir(startDir: string, packageName: string): string | null {
    // Walk up from startDir looking for node_modules/<packageName>/package.json.
    // Mirrors Node's own resolution for CJS packages, but works regardless of
    // the target package's "exports" field (which Node's resolver otherwise
    // honors, blocking access when only ESM conditions are declared).
    let dir = startDir;
    while (true) {
        const candidate = path.join(dir, "node_modules", packageName);
        if (fs.existsSync(path.join(candidate, "package.json"))) {
            return candidate;
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            return null;
        }
        dir = parent;
    }
}

function spawnUpstream(binPath: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [binPath, ...args], {
            stdio: "inherit",
        });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === null) {
                reject(new Error("secretvm-verify terminated by signal"));
                return;
            }
            if (code !== 0) {
                process.exit(code);
            }
            resolve();
        });
    });
}

// Same as spawnUpstream but captures stdout so we can rewrite the upstream CLI
// name to "secretvm-cli verify" before printing. Used only for help output;
// regular verification calls keep stdio:inherit so the user sees them live.
function spawnUpstreamForHelp(
    binPath: string,
    args: string[],
): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [binPath, ...args], {
            stdio: ["inherit", "pipe", "inherit"],
        });
        let stdout = "";
        child.stdout?.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
        });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === null) {
                reject(new Error("secretvm-verify terminated by signal"));
                return;
            }
            const rewritten = stdout.replace(
                /secretvm-verify/g,
                "secretvm-cli verify",
            );
            process.stdout.write(rewritten);
            if (code !== 0) {
                process.exit(code);
            }
            resolve();
        });
    });
}

async function resolveVmHostname(
    vmId: string,
    globalOptions: GlobalOptions,
): Promise<string> {
    const trimmedVmId = vmId.trim();
    if (!trimmedVmId) {
        throw new Error("VM ID is required to resolve the hostname.");
    }
    const apiClient = await getApiClient(globalOptions);
    const response = await apiClient.get<VmDetailsApiResponse>(
        API_ENDPOINTS.VM.DETAILS(trimmedVmId),
    );
    const vmDomain = response.data?.vmDomain;
    if (!vmDomain || vmDomain.trim() === "") {
        throw new Error(
            `VM "${trimmedVmId}" does not have a domain assigned. Use --secretvm <hostname> directly.`,
        );
    }
    return vmDomain.trim();
}
