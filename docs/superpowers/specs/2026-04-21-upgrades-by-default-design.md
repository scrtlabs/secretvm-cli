# Upgrades-by-default for new VMs

## Context

`secretvm-cli vm create` currently creates VMs with upgradeability disabled unless the user opts in via `-u, --upgradeability` (non-interactive) or answers "yes" to the interactive prompt (which defaults to "no"). We want new VMs to be upgradeable by default, so users must now opt **out** instead of opting in.

## Goals

- New VMs are created with upgradeability enabled by default.
- Users can opt out explicitly via a new `--disable-upgrades` flag.
- The existing `-u, --upgradeability` flag is kept as a silent no-op so existing scripts and documentation don't break.
- Interactive and non-interactive modes behave consistently — the default is "on" in both.

## Non-goals

- Changing the server-side API contract. The server still accepts the `upgradeability=1` form field as today; we just send it by default.
- Deprecation messaging or warnings for the old `--upgradeability` flag. It remains silently accepted.
- Changing behavior for any other `vm` subcommand.

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

## Testing

This project does not currently have a test suite for `vm create`. Verification will be manual:

1. `secretvm-cli vm create --non-interactive ...` without either flag → server receives `upgradeability=1`.
2. `secretvm-cli vm create --non-interactive ... --disable-upgrades` → server does not receive `upgradeability`.
3. `secretvm-cli vm create --non-interactive ... --upgradeability` → server receives `upgradeability=1` (unchanged from today's outcome, flag is a no-op).
4. `secretvm-cli vm create` (interactive) → upgradeability prompt defaults to "yes".
5. `secretvm-cli vm create --disable-upgrades` (interactive) → prompt is skipped; VM is created without upgradeability.

Verification can be done against a staging backend or by inspecting the outgoing `FormData` with a local proxy / console log if needed.

## Risks and trade-offs

- **Breaking change for non-interactive users** who relied on absence-of-flag meaning "not upgradeable". They'll need to add `--disable-upgrades` to their scripts. Mitigation: release notes should call this out.
- **Silent no-op flag** (`--upgradeability`) is mildly confusing if a user reads the code and wonders what it does. Acceptable because removing it would break existing scripts.
