# Explicit Owner Bypasses Security Checks

## Summary

As a cfgsync user running as root with a non-root-owned config, I want `owner = "root:root"` on a sync group to bypass file-operation and hook security checks, so that explicit owner configuration is treated as sufficient authorization and files are synced without warnings, skips, or interactive prompts.

## Status

open

## Edge Cases

- **No owner configured, config owner can't write**: Still `ErrorSkip` — no change.
- **No owner configured, config owner can write**: Still `None` (proceeds) — no change.
- **Owner configured, running non-root**: `security_bypass()` returns true (not root) — security checks never engage. No change.
- **Owner configured, root-owned config**: `security_bypass()` returns true — security never engages. No change.
- **Owner configured on group, per-glob owner differs**: `security_action()` uses group-level `owner`; `has_explicit_owner()` with fix checks both group-level and per-glob. Group-level owner takes precedence for security bypass.
- **Owner configured, target parent dir foreign to config owner (foreign-dir check)**: With `has_explicit_owner()` fix, group-level owner satisfies the check so the foreign-dir block is skipped.
- **Multiple groups, mixed owner presence**: Each group is checked independently. Groups with owner bypass; groups without still go through `ErrorSkip`/`None` logic.
- **Hook dry-run with owner configured**: Still prints `[dry-run] would run hook:*` — dry-run path unchanged.
- **Hook with owner configured, running non-root**: The existing non-root-owner skip at `run_hook_for_group` line 1404 still applies — hook skipped with "owner requires root" warning. No change.
- **Dead code removal (clippy `-D warnings`)**: Removed `WarnOrPrompt` variant, `security_prompt()`, `security_prompt_hook()`, `hook_security_needed()`, and `security_notice_printed` must be cleanly removed to avoid unused-code/fn/var warnings.

## Tasks

- [ ] **1. Change `security_action()` to return `None` for groups with owner**

  In `src/sync.rs`, `security_action()` line 1661: change `SecurityAction::WarnOrPrompt` to `SecurityAction::None`.

  Rationale: configuring an owner on the sync group constitutes explicit authorization; no further confirmation is needed.

- [ ] **2. Remove `WarnOrPrompt` from `SecurityAction` enum and all match arms**

  In `src/sync.rs`:
  - Remove `WarnOrPrompt` from the `SecurityAction` enum (line 1646).
  - Remove the `SecurityAction::WarnOrPrompt => { ... }` arm from each of the 4 call sites:
    - Non-interactive `CopyToTarget` (lines 95–110)
    - Non-interactive `DeleteTarget` (lines 202–217)
    - Interactive `CopyToTarget` (lines 356–374)
    - Interactive `DeleteTarget` (lines 462–482)

  After this, `security_action()` has only two return values: `None` and `ErrorSkip`.

- [ ] **3. Fix `has_explicit_owner()` to also check group-level owner**

  In `src/sync.rs`, `has_explicit_owner()` (line 863): add a check for `group.owner.is_some()` before the per-glob check:

  ```rust
  fn has_explicit_owner(config: &ResolvedConfig, group_index: usize, rel_path: &str) -> bool {
      let group = &config.sync_groups[group_index];
      if group.owner.is_some() {
          return true;
      }
      find_matching_glob(group, rel_path)
          .map(|g| g.owner.is_some())
          .unwrap_or(false)
  }
  ```

  This ensures the foreign-parent-dir check (lines 115–128 and 378–390) also respects group-level owner.

- [ ] **4. Remove hook security checks and dead code from `run_hook_for_group()`**

  In `src/sync.rs`:
  - Remove the `security` variable and entire `if security { ... }` block (lines 1366–1397) from `run_hook_for_group()`.
  - Remove the `security_notice_printed: &mut bool` parameter from `run_hook_for_group()`'s signature (line 1358).

- [ ] **5. Remove dead functions: `security_prompt()`, `security_prompt_hook()`, `hook_security_needed()`**

  In `src/sync.rs`, remove the following now-unused functions:
  - `hook_security_needed()` (lines 1628–1641) — always returns false after change.
  - `security_prompt()` (lines 1677–1698) — only called from removed `WarnOrPrompt` arms.
  - `security_prompt_hook()` (lines 1700–1721) — only called from removed hook security block.

  Verify `eprint_diff()` (line 1484) is still called (it is, from the interactive conflict path at line 284).

- [ ] **6. Clean up `security_notice_printed` from `run()`**

  In `src/sync.rs`:
  - Remove `let mut security_notice_printed = false;` (line 66).
  - Update the two `run_hook_for_group` call sites (lines 548–556 and lines 565–572) to not pass the last argument.

- [ ] **7. Update unit test at line 1819**

  In `src/sync.rs`, update the test call to `run_hook_for_group` to match the new signature (remove the last `&mut false` argument, replace with `false` if needed or rework the assertion).

- [ ] **8. Update e2e tests in `security-root-target-confirm.test.ts`**

  File: `e2e-tests/to-check/validation/Security/security-root-target-confirm.test.ts`

  Tests to update (each requires assertion changes to reflect no-skip/no-prompt behavior):

  | Test name | Old behavior | New behavior |
  |---|---|---|
  | `security-warning-non-interactive` (L363) | File skipped, `permission skips: 1`, stderr has security warning | File copied, `source -> target: 1`, `permission skips: 0`, no security stderr |
  | `security-prompt-owner-yes` (L413) | Interactive prompt, type `y`, file copied | No prompt, file copied directly. Remove `waitForStderr`/`type` calls. Assert no security stderr. |
  | `security-prompt-owner-no` (L466) | Interactive prompt, type `n`, file skipped | No prompt, file copied directly. Same result as `owner-yes`. Remove prompt interaction. |
  | `security-prompt-owner-quit` (L517) | Interactive prompt, type `q`, exit code 1 | No prompt, file copied, exit code 0. Remove prompt interaction. |
  | `security-hook-owner-mismatch-yes` (L147) | Interactive prompts for file + hook, type `y` twice | No prompts. File copied, hook runs. Remove `waitForStderr`/`type` calls. |
  | `security-hook-owner-mismatch-no` (L206) | Interactive prompts, type `y` for file, `n` for hook, hook skipped | No prompts. File copied, hook runs. Remove prompt interaction. |
  | `security-hook-owner-mismatch-quit` (L265) | Interactive prompts, type `y` for file, `q` for hook, exit 1 | No prompts. File copied, hook runs, exit 0. Remove prompt interaction. |

  Tests that **do NOT need changes** (assertions unchanged):
  - `security-bypass-root-owned-config` — bypass path unchanged
  - `security-bypass-non-root` — bypass path unchanged
  - `security-error-skip-cannot-write-dir` — no-owner ErrorSkip path unchanged
  - `security-hook-no-owner-runs-as-config-owner` — no-owner hook path unchanged
  - `security-foreign-dir-owner` (separate file) — unchanged

- [ ] **9. Update AGENTS.md security documentation**

  In `AGENTS.md`, update the bullet under "Security confirmation" that reads:
  > Groups with an `owner` configured always require `WarnOrPrompt` (chown is always privilege escalation).
  
  To:
  > Groups with an `owner` configured bypass file-operation and hook security checks (the explicit owner is treated as authorization). Groups without an `owner` trigger `ErrorSkip` when the config owner lacks write permission to the target.
  
  Also check the "Hooks" bullet for similar language.

- [ ] **10. Update `docs/algorithm/permissions-and-owner.md`**

  This file currently states (line 59–64):
  > *A file or directory without explicit owner configuration is never copied into a directory owned by another user.* [...] *If it is necessary to create such a file, the owner can be set explicitely in the configuration.*

  Three changes needed:
  1. **Make the statement accurate**: The old text implies setting `owner` always works, but the old code required `-i` too. After this plan, it's truly correct — swap "can be set" for "must be set" and note that hooks are also authorized. Suggested rewrite:
     > *A file or directory without explicit owner configuration is never copied into a directory owned by another user. If it is necessary to create such a file, the owner **must be set** explicitly in the configuration (on the sync group or the matching glob). Setting an explicit owner also authorizes hooks configured on that group to execute without additional security prompts.*

  2. **Document the security bypass path**: Add a short paragraph explaining that when the config file is root-owned and not group/other-writable, all security checks are bypassed entirely (a trusted-config shortcut). This is a significant design point currently missing from the docs.

  3. **Remove/update interactive-mode references**: The doc currently implies a binary "works / doesn't work." After the change, explicit owner = always proceeds (no interactive prompt needed). Update any language that suggests interactive confirmation is required for owner-configured groups.

- [ ] **11. Run `mise run all-local` and fix any failures**

  After all changes, run full verification. Expected: all unit tests pass, all e2e tests pass, clippy has no warnings, fmt is clean.

## Findings

<!-- Discovered during implementation. Leave empty initially. -->
