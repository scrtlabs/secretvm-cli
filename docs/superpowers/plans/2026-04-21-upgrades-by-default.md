# Upgrades-by-default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new VMs upgradeable by default (opt-out via `--disable-upgrades`), show a spinner during the create-VM HTTP call in interactive mode, and fix the post-create success message to reference the correct command name.

**Architecture:** Three focused edits in the `vm create` command. The spinner lives in its own new file (`src/spinner.ts`) as a tiny inline utility — no new dependency. The CLI-option and default-behavior changes live in `src/cli.ts`, `src/types.d.ts`, and `src/commands/vm/create.ts`.

**Tech Stack:** TypeScript, Commander.js (CLI), Inquirer (interactive prompts), Node.js `process.stdout` for spinner rendering.

**Spec:** `docs/superpowers/specs/2026-04-21-upgrades-by-default-design.md`

---

## File Structure

- **Create:** `src/spinner.ts` — spinner utility (`startSpinner(text) → stop`).
- **Modify:** `src/cli.ts` — add `--disable-upgrades` option on the `vm create` subcommand.
- **Modify:** `src/types.d.ts` — add `disableUpgrades?: boolean` to `CreateVmCommandOptions`.
- **Modify:** `src/commands/vm/create.ts`:
  - Replace the upgradeability default-on logic.
  - Wrap the `apiClient.post` with the spinner in interactive mode.
  - Fix the `list-vms` → `vm list` message.

No test files — this project has no test harness. Verification is manual (build + runtime smoke test).

---

## Task 1: Add the `--disable-upgrades` CLI option

**Files:**
- Modify: `src/cli.ts:94` (adjacent to the existing `--upgradeability` option)
- Modify: `src/types.d.ts:134-154` (`CreateVmCommandOptions` interface)

- [ ] **Step 1: Add `disableUpgrades` to the type**

Edit `src/types.d.ts`. Find the `CreateVmCommandOptions` interface (line 134) and add the new optional field right after `upgradeability`:

```ts
export interface CreateVmCommandOptions {
    name?: string;
    type?: string;
    dockerCompose?: string;
    template?: string;
    inviteCode?: string;
    tls?: boolean;
    env?: string;
    domain?: string;
    dockerCredentials?: string;
    dockerRegistry?: string;
    persistence?: boolean;
    upgradeability?: boolean;
    disableUpgrades?: boolean;
    private?: boolean;
    platform?: string;
    environment?: string;
    archive?: string;
    kms?: string;
    eip8004RegistrationJson?: string;
    eip8004Chain?: string;
}
```

- [ ] **Step 2: Add the CLI option**

Edit `src/cli.ts`. Find line 94:

```ts
.option("-u, --upgradeability", "Enable SecretVM upgradeability")
```

Insert the new `--disable-upgrades` option immediately after it. Leave the existing `--upgradeability` line exactly as-is (the spec treats it as silently accepted — no help-text change):

```ts
.option("-u, --upgradeability", "Enable SecretVM upgradeability")
.option(
    "--disable-upgrades",
    "Disable SecretVM upgradeability for this VM",
)
```

- [ ] **Step 3: Build to verify types compile**

Run: `npm run build`
Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts src/types.d.ts
git commit -m "Add --disable-upgrades CLI option and type"
```

---

## Task 2: Flip upgradeability default and handle opt-out in `create.ts`

**Files:**
- Modify: `src/commands/vm/create.ts:36` (variable init)
- Modify: `src/commands/vm/create.ts:404-415` (interactive prompt)
- Modify: `src/commands/vm/create.ts:683-685` (form submission — unchanged logic, but verify)

- [ ] **Step 1: Replace the initial `upgradeability` assignment**

Edit `src/commands/vm/create.ts`. Find line 36:

```ts
    let upgradeability = cmdOptions.upgradeability;
```

Replace with:

```ts
    let upgradeability = !cmdOptions.disableUpgrades;
```

This establishes the new default: if the user did not pass `--disable-upgrades`, start with `upgradeability = true`.

- [ ] **Step 2: Update the interactive prompt**

Edit `src/commands/vm/create.ts`. Find the block at lines 404-415:

```ts
                if (!upgradeability) {
                    const { enableUpgradeability } = await inquirer.prompt([
                        {
                            type: "confirm",
                            name: "enableUpgradeability",
                            message:
                                "Do you want to enable SecretVM upgradeability?",
                            default: false,
                        },
                    ]);
                    upgradeability = enableUpgradeability;
                }
```

Replace with:

```ts
                if (!cmdOptions.disableUpgrades) {
                    const { enableUpgradeability } = await inquirer.prompt([
                        {
                            type: "confirm",
                            name: "enableUpgradeability",
                            message:
                                "Do you want to enable SecretVM upgradeability?",
                            default: true,
                        },
                    ]);
                    upgradeability = enableUpgradeability;
                }
```

Changes: prompt is now gated on `cmdOptions.disableUpgrades` (so the prompt is skipped when the user explicitly opted out on the CLI), and its default is flipped to `true`.

- [ ] **Step 3: Verify the form submission is unchanged**

The block at lines 683-685 should already read:

```ts
            if (upgradeability) {
                formData.append("upgradeability", "1");
            }
```

No change required. This block now fires by default (because `upgradeability` is `true` by default) and not when `--disable-upgrades` is set.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Smoke test — interactive default**

Run: `node dist/cli.js vm create` (or `npm run dev -- vm create` via ts-node)

Walk the wizard. When you reach the upgradeability prompt, confirm:
- Prompt text: "Do you want to enable SecretVM upgradeability?"
- Default shown as `(Y/n)` (i.e., yes).

You can Ctrl-C out before actually creating the VM.

- [ ] **Step 6: Smoke test — interactive with `--disable-upgrades` skips prompt**

Run: `node dist/cli.js vm create --disable-upgrades`

Walk the wizard. The upgradeability prompt should NOT appear at all.

- [ ] **Step 7: Commit**

```bash
git add src/commands/vm/create.ts
git commit -m "Default new VMs to upgradeable; respect --disable-upgrades"
```

---

## Task 3: Create the spinner utility

**Files:**
- Create: `src/spinner.ts`

- [ ] **Step 1: Write the spinner module**

Create `src/spinner.ts` with this exact content:

```ts
const FRAMES = ["|", "/", "-", "\\"];
const INTERVAL_MS = 100;

export function startSpinner(text: string): () => void {
    if (!process.stdout.isTTY) {
        return () => {};
    }

    let frameIndex = 0;

    const render = () => {
        const frame = FRAMES[frameIndex % FRAMES.length];
        process.stdout.write(`\r${frame} ${text}`);
        frameIndex++;
    };

    render();
    const handle = setInterval(render, INTERVAL_MS);

    return () => {
        clearInterval(handle);
        process.stdout.write("\r\x1b[K");
    };
}
```

Notes:
- `\r` returns the cursor to column 0; `\x1b[K` clears from cursor to end of line.
- When stdout is not a TTY (piped, redirected, CI), the function returns a no-op stop — nothing is written, nothing is cleared.
- `render()` is called once immediately so the spinner appears instantly rather than 100ms later.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Quick standalone test**

Run (from the project root):

```bash
node -e "const { startSpinner } = require('./dist/spinner'); const stop = startSpinner('Starting...'); setTimeout(() => { stop(); console.log('done'); }, 1500);"
```

Expected: spinner animates for 1.5 seconds, then the line clears and `done` prints cleanly (no lingering spinner chars).

- [ ] **Step 4: Commit**

```bash
git add src/spinner.ts
git commit -m "Add startSpinner utility"
```

---

## Task 4: Wire the spinner into `createVmCommand` and fix the success message

**Files:**
- Modify: `src/commands/vm/create.ts` (imports at top, `apiClient.post` call around line 758, success message around line 798)

- [ ] **Step 1: Import the spinner**

Edit `src/commands/vm/create.ts`. Find the existing import block at the top of the file. After the line:

```ts
import { encryptDockerCredentials } from "../../services/encryption";
```

Add:

```ts
import { startSpinner } from "../../spinner";
```

- [ ] **Step 2: Wrap the `apiClient.post` call with the spinner**

Find the `return await apiClient.post<CreateVmApiResponse>(` block (around line 758):

```ts
            return await apiClient.post<CreateVmApiResponse>(
                API_ENDPOINTS.VM.CREATE,
                formData,
                {
                    headers: {
                        ...formData.getHeaders(), // Necessary for multipart/form-data with boundary
                    },
                    maxContentLength: Infinity, // Allow large file uploads
                    maxBodyLength: Infinity, // Allow large file uploads
                },
            );
```

Replace with:

```ts
            const stopSpinner = globalOptions.interactive
                ? startSpinner("Starting...")
                : () => {};
            try {
                return await apiClient.post<CreateVmApiResponse>(
                    API_ENDPOINTS.VM.CREATE,
                    formData,
                    {
                        headers: {
                            ...formData.getHeaders(), // Necessary for multipart/form-data with boundary
                        },
                        maxContentLength: Infinity, // Allow large file uploads
                        maxBodyLength: Infinity, // Allow large file uploads
                    },
                );
            } finally {
                stopSpinner();
            }
```

`finally` guarantees the spinner stops whether the request succeeds or throws.

- [ ] **Step 3: Fix the success message text**

Find the line (around line 798):

```ts
                    console.log(
                        'You can check the VM status using the "list-vms" command shortly.',
                    );
```

Replace with:

```ts
                    console.log(
                        'You can check the VM status using the "vm list" command shortly.',
                    );
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Smoke test the full flow**

Run: `node dist/cli.js vm create`

Complete the wizard with valid inputs against a staging/dev backend. Observe:
- After the final prompt, `| Starting...` (or a rotating frame) appears and animates.
- When the server responds, the spinner line clears cleanly (no leftover characters) before the result table prints.
- The footer message reads `You can check the VM status using the "vm list" command shortly.`

- [ ] **Step 6: Smoke test the non-interactive path**

Run (with all required flags):

```
node dist/cli.js --non-interactive vm create -n test -t small -d path/to/compose.yml ...
```

Expected: no spinner output; JSON result printed as before.

- [ ] **Step 7: Commit**

```bash
git add src/commands/vm/create.ts
git commit -m "Show Starting... spinner during VM create; fix post-create message"
```

---

## Verification summary

After all tasks, confirm against the spec's testing section:

1. `vm create --non-interactive ...` (no opt-out flag) → form data includes `upgradeability=1`. Verify by temporarily logging `formData` or using a local proxy.
2. `vm create --non-interactive ... --disable-upgrades` → form data omits `upgradeability`.
3. `vm create --non-interactive ... --upgradeability` → form data includes `upgradeability=1` (same as default).
4. Interactive `vm create` → upgradeability prompt default is "yes".
5. Interactive `vm create --disable-upgrades` → prompt is skipped.
6. Interactive `vm create` in a TTY → spinner appears, clears cleanly.
7. Non-interactive → no spinner.
8. Piped stdout (e.g., `node dist/cli.js vm create | cat`) → no spinner characters.
9. Post-create message → references `vm list`, not `list-vms`.

If all pass, the branch is ready for PR.
