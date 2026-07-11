# Close the Gap: Algorithm Spec vs Implementation

## Summary

The goal is to have the cfgsync implementation fully match the algorithm specification described in
[docs/algorithm/index.md](../docs/algorithm/index.md) and
[docs/algorithm/permissions-and-owner.md](../docs/algorithm/permissions-and-owner.md).

Six gaps remain. This plan addresses each in dependency order.

## Status

open

## Gaps overview

| # | Gap | Spec location | Implementation location | Complexity |
|---|-----|---------------|------------------------|------------|
| 1 | Step 4 — Validate action feasibility | index.md §4 | (missing) | High |
| 2 | Permission preset mappings (incl. `dir_perms` + reverse mapping) | permissions-and-owner.md §Permissions | config.rs, sync.rs, changes.rs | Medium |
| 3 | Deviating directories validation | index.md §1, permissions-and-owner.md | config.rs (stored only) | Medium |
| 4 | Target-to-source permission/owner validation before sync | permissions-and-owner.md §Target to source | sync.rs CopyToSource arms | Medium |
| 5 | Existing directories not updated — warnings for mismatches | permissions-and-owner.md §Source to target | sync.rs enforce/check perms | Low |
| 6 | Security edge case — files without explicit owner in foreign-owned directories | permissions-and-owner.md §Source to target §Edge case | sync.rs CopyToTarget path | Medium |

## Design decisions

- **Feasibility checks are non-fatal warnings by default**: If an action is infeasible, it's marked as `Failed` (the enum variant already exists at `changes.rs:58`). The `status` command shows failed counts; `sync` prints warnings and skips failed files.
- **Group the work bottom-up**: Gaps 2, 5, and 6 are lower-level permission/owner improvements that the higher-level gaps (1, 4) build on. Gap 3 is independent.
- **Preserve existing behavior for working features**: Don't break the 100 passing e2e tests. Each gap gets its own e2e test per the rule "For every new feature, an e2e test must be added."

### Phase 1: Permission preset mappings (Gap 2)

The `PermissionPreset` enum and `map_permissions()` already exist at `config.rs:14-58` and are partially applied. What's missing:

- [ ] **Apply `dir_perms` at runtime**: Currently `file_perms` mapping is applied in `enforce_permissions_root` (`sync.rs:892`) and `check_permissions_nonroot` (`sync.rs:1013`), but `dir_perms` is never read. Add directory permission enforcement alongside the file enforcement in both functions (within the directory warning logic from Gap 5).
- [ ] **Fix `Private` preset mapping**: `Private::map_permissions` always returns `0o600`, ignoring whether the source is a directory (`755`). Per the spec table, `755 → 600` for `private`, so this is correct — but verify the `dir_perms` path also produces `600` for directories and document the behavior.
- [ ] **Implement reverse mapping for CopyToSource**: The spec says "The permissions are determined by reversing the configured mapping to the original 644 or 755 permissions" (`permissions-and-owner.md:79`). Add a `reverse_map_permissions(&self, target_mode: u32) -> u32` method to `PermissionPreset` that maps back (e.g., `600 → 644`, `664 → 644`, `660 → 644`, `640 → 644`, `600/755 → 755` if executable bit expected). Use this in the CopyToSource path (Gap 4).
- [ ] **Fix `resolve_file_perms` in sync.rs**: Currently returns raw actual source mode, not the mapped target mode. Should apply `map_permissions` and return the configured target perms for the state file. (**Note**: verify whether the state file should store configured or actual perms — check spec at `index.md:71-72`: "the applied permissions of the target file at the time of the last sync". The state should store what was actually applied, which may differ from configured if running non-root.)
- [ ] **E2e test**: Add `test-permission-presets.test.ts` — configure `file_perms = "private"` on a glob, verify target file gets `600` after sync, verify source stays `644`.

### Phase 2: Existing directories — warnings for permission/owner mismatches (Gap 5)

Currently `enforce_permissions_root` (`sync.rs:876`) and `check_permissions_nonroot` (`sync.rs:995`) skip directories with `if !abs_path.is_file() { continue; }` and print no warnings.

- [ ] **Add directory warning in `enforce_permissions_root`**: For directories, don't apply changes (per spec: "Existing directories are NOT updated"), but print a warning when actual perms/owner differ from configured values. The warning contains details about found vs. expected values.
- [ ] **Add directory warning in `check_permissions_nonroot`**: Same — warn about mismatches but don't change.
- [ ] **Use `dir_perms` from glob config**: When checking directory permissions, use the `dir_perms` preset (from Gap 2) to determine what the expected permissions are.
- [ ] **E2e test**: Add `test-directory-permission-warning.test.ts` — create a target directory with wrong perms, run sync as non-root, verify warning is printed and directory perms are unchanged.

### Phase 3: Security edge case — files without explicit owner in foreign-owned directories (Gap 6)

Per `permissions-and-owner.md:59`: "A file or directory without explicit owner configuration is never copied into a directory owned by another user. This case is treated the same as a failure to write into that directory."

- [ ] **Add check in CopyToTarget path**: Before copying a file to the target directory, if no explicit `owner` is configured for the glob/group, check whether the parent directory is owned by the config file owner. If not, treat it as a write failure (skip file, print warning).
- [ ] **Determine parent directory ownership**: Use `std::fs::metadata(parent_dir).uid()` and compare with config file owner UID. If they differ and no explicit owner is configured, skip the file.
- [ ] **Test as root**: This is primarily a root-level scenario (non-root can only write to directories they own or have write access to, which the OS enforces). As root, the check prevents accidental privilege escalation.
- [ ] **E2e test**: Add `test-security-foreign-dir-owner.test.ts` — as root, configure a sync group with no explicit owner pointing to a target directory owned by a different user. Verify the file is not copied and a warning is printed. (May need to skip on non-root CI.)

### Phase 4: Deviating directories validation (Gap 3)

The `deviating` field is parsed and stored in `ResolvedSyncGroup` (`config.rs:157`) as `Vec<ResolvedDeviatingEntry>` but never read at runtime.

- [ ] **Add deviating directory checks**: After sync (or during the permission enforcement phase), iterate each sync group's `deviating` entries. For each, check the target directory's actual permissions and owner against the configured `permissions` and `owner` values.
- [ ] **Print warnings for mismatches**: Per the spec, directories are NOT updated — only warnings are printed (same as Gap 5 for existing directories). The warning contains details about found vs. expected values.
- [ ] **Where to add the check**: In `enforce_permissions_root` and `check_permissions_nonroot`, add a separate loop that walks `group.deviating` entries. Or create a new function `check_deviating_directories` called after the main permission enforcement.
- [ ] **E2e test**: Add `test-deviating-directories.test.ts` — configure a sync group with `deviating` entries, create target directories with wrong perms/owner, run sync, verify warnings are printed and directories are NOT changed.

### Phase 5: Target-to-source permission/owner validation (Gap 4)

Per `permissions-and-owner.md:67-75`: "Before syncing anything, the permissions and owner of the target file are validated. If they do not match the configured permissions and owner, the whole file is skipped and a warning is printed."

- [ ] **Add validation gate in `CopyToSource` execution**: Before `copy_file(abs_tgt, abs_src)`, check the target file's actual permissions and owner against the configured values. If they don't match, skip the file, print a warning, and don't update state.
- [ ] **Use reverse mapping**: To compare, reverse-map the configured preset to derive the expected source-side permissions (e.g., if `file_perms = "private"`, the target should have `600`). If the actual target perms don't match, skip.
- [ ] **Check owner**: Compare target file owner against the configured owner (or config file owner as default). If mismatch, skip.
- [ ] **Both interactive and non-interactive paths**: Add the validation to both the interactive (`sync.rs:369-394`) and non-interactive (`sync.rs:128-154`) CopyToSource arms.
- [ ] **Dry-run**: In dry-run mode, print what would be skipped and why, but don't skip (show the warning as a preview).
- [ ] **E2e test**: Add `test-copy-to-source-permission-check.test.ts` — create a target file with wrong permissions, run sync, verify the file is skipped with a warning and the source is not modified.

### Phase 6: Step 4 — Validate action feasibility (Gap 1)

This is the largest gap. The algorithm describes a full validation step between classification (step 3) and execution (step 5).

- [ ] **Add `failed_checks` field to `Change` variants**: Each `Change` variant should carry an optional `Vec<String>` of failure reasons. The `Failed` variant already exists but is never used — either populate it or add failure info to existing variants.
- [ ] **Implement `validate_actions` function**: New function that takes `&[Change]` + `&ResolvedConfig` and checks each action:
  - `UpdateState`: check `state_path` is writable
  - `CopyToTarget`: check state writable, parent dirs creatable, existing parent dirs have correct perms/owner, target file writable/creatable, file owner can be set (root or intended owner)
  - `CopyToSource`: check state writable, source file writable/creatable, parent dirs creatable, file owner can be set (root or config file owner)
  - `DeleteSource`/`DeleteTarget`: check file deletable
  - `DeleteFromState`: check state writable
  - `Clean`: nothing to check
  - `Conflict`: check if CopyToTarget or CopyToSource are feasible
- [ ] **Run validation between classify and execute**: In `sync::run`, call `validate_actions` after `changes::classify` and before the execution loop. Attach failures to each `Change`.
- [ ] **`status` command**: Show failed file count (files where `failed_checks` is non-empty).
- [ ] **`sync` command**: Print warnings for failed files and skip them.
- [ ] **`diff` command**: Show feasibility warnings for failed files.
- [ ] **E2e test**: Add `test-feasibility-check.test.ts` — create a scenario where a target directory is read-only, run sync as non-root, verify the file is marked as failed with a warning and skipped.

## Implementation order

```
Phase 1 (perms preset) → Phase 2 (dir warnings) → Phase 3 (foreign dir security)
                                                        ↓
Phase 4 (deviating dirs) ← independent ────────────────┘
                                                        ↓
Phase 5 (target-to-source validation) → Phase 6 (feasibility checks)
```

## Findings

<!-- Discovered during implementation. Leave empty initially. -->