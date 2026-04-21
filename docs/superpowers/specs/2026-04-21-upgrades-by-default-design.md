# Upgrades-by-default for new VMs + startup animation + list-vms text fix

## Context

`secretvm-cli vm create` currently creates VMs with upgradeability disabled unless the user opts in via `-u, --upgradeability` (non-interactive) or answers "yes" to the interactive prompt (which defaults to "no"). We want new VMs to be upgradeable by default, so users must now opt **out** instead of opting in.

Separately, when the wizard finishes collecting input and the CLI posts to the create-VM endpoint, there's currently no visible feedback — the terminal just sits there until the server responds. We want a simple spinner + "Starting..." text to show the CLI is still working.

Also, the success message after VM creation tells the user to run `list-vms`, but that command doesn't exist — the correct command is `vm list`. We'll fix the wording.

## Goals

- New VMs are created with upgradeability enabled by default.
- Users can opt out explicitly via a new `--disable-upgrades` flag.
- The existing `-u, --upgradeability` flag is kept as a silent no-op so existing scripts and documentation don't break.
- Interactive and non-interactive modes behave consistently — the default is "on" in both.
- While the create-VM request is in flight in interactive mode, show a simple ASCII spinner with the text "Starting...".
- Fix the post-creation success message to reference the correct command name (`vm list` instead of `list-vms`).

## Non-goals

- Changing the server-side API contract. The server still accepts the `upgradeability=1` form field as today; we just send it by default.
- Deprecation messaging or warnings for the old `--upgradeability` flag. It remains silently accepted.
- Changing behavior for any other `vm` subcommand.
- Adding a spinner to non-interactive output (would corrupt the JSON written by `successResponse`).
- Adding a new dependency. The spinner will be implemented inline with `setInterval`.

## Design

### CLI surface (`src/cli.ts`)

Keep the existing option and add a new opt-out:

```
-u, --upgradeability     (existing, now a silent no-op — kept for backwards compat)
--disable-upgrades       (new, opts the VM out of upgradeability)
```

### Types (`src/types.d.ts`)

Add `disableUpgrades?: boolean` to `CreateVmCommandOptions`. The existing `upgradeability?: boolean` stays.

### Behavior (`src/commands/vm/create.ts`)

The command resolves a single `upgradeability` boolean that is then used for form submission. How it's resolved depends on mode:

- **Non-interactive mode:** `upgradeability = !cmdOptions.disableUpgrades`. No prompt.
- **Interactive mode:**
  - If `cmdOptions.disableUpgrades` is true, skip the prompt and set `upgradeability = false` (the user already expressed intent on the command line).
  - Otherwise, show the existing prompt with its default flipped to `true`, and take the user's answer as the value.
- **Form submission:** Append `upgradeability=1` whenever the resolved boolean is true. (This is the same append logic as today; we're just feeding it a different value.)

The existing `cmdOptions.upgradeability` flag has no effect on behavior — with the new default, the state it used to request (upgradeability on) is already the default.

### Data flow

```
cmdOptions.disableUpgrades ─► (interactive?) ─► prompt (default yes) ─┐
                              │                                        ├─► upgradeability (bool) ─► form field append
                              └─► non-interactive: use directly ──────┘
```

### Startup animation (interactive mode only)

A small inline spinner utility, implemented with `setInterval`. No new dependency.

- Frames: `|`, `/`, `-`, `\`. Frame advances every ~100ms.
- Rendered as a single line: `<frame> Starting...`, rewritten in place via `\r` + clear-to-end-of-line.
- Two exported helpers in a new file `src/spinner.ts` (sibling to the existing `src/utils.ts`):
  - `startSpinner(text: string): () => void` — starts the animation, returns a `stop` function that clears the line and stops the interval.
  - Internal handling: if `process.stdout.isTTY` is false, `startSpinner` is a no-op (returns a stop that also does nothing). This keeps CI logs and piped output clean.
- In `createVmCommand`, wrap the `apiClient.post(...)` call in interactive mode:
  ```
  const stop = globalOptions.interactive ? startSpinner("Starting...") : () => {};
  try {
      return await apiClient.post(...);
  } finally {
      stop();
  }
  ```
  This guarantees the spinner is cleared whether the request succeeds or errors.
- The spinner starts *after* all interactive prompts have completed (i.e., right before the HTTP call), not during form assembly.

### Success message wording (`src/commands/vm/create.ts`)

In the interactive success handler, change:

> `You can check the VM status using the "list-vms" command shortly.`

to:

> `You can check the VM status using the "vm list" command shortly.`

No other message text changes.

## Testing

This project does not currently have a test suite for `vm create`. Verification will be manual:

1. `secretvm-cli vm create --non-interactive ...` without either flag → server receives `upgradeability=1`.
2. `secretvm-cli vm create --non-interactive ... --disable-upgrades` → server does not receive `upgradeability`.
3. `secretvm-cli vm create --non-interactive ... --upgradeability` → server receives `upgradeability=1` (unchanged from today's outcome, flag is a no-op).
4. `secretvm-cli vm create` (interactive) → upgradeability prompt defaults to "yes".
5. `secretvm-cli vm create --disable-upgrades` (interactive) → prompt is skipped; VM is created without upgradeability.
6. `secretvm-cli vm create` (interactive, TTY) → after all prompts, spinner shows `<frame> Starting...` until server responds, then clears cleanly before the result table prints.
7. `secretvm-cli vm create ... --non-interactive` → no spinner, JSON output unchanged.
8. Spinner output piped to a file → no spinner characters written (isTTY guard).
9. `secretvm-cli vm create` (interactive) success output → references the `vm list` command (not `list-vms`).

Verification can be done against a staging backend or by inspecting the outgoing `FormData` with a local proxy / console log if needed.

## Risks and trade-offs

- **Breaking change for non-interactive users** who relied on absence-of-flag meaning "not upgradeable". They'll need to add `--disable-upgrades` to their scripts. Mitigation: release notes should call this out.
- **Silent no-op flag** (`--upgradeability`) is mildly confusing if a user reads the code and wonders what it does. Acceptable because removing it would break existing scripts.
