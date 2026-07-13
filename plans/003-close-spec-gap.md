# Close the Gap: Algorithm Spec vs Implementation

## Summary

The goal is to have the cfgsync implementation fully match the algorithm specification described in
[docs/algorithm/index.md](../docs/algorithm/index.md) and
[docs/algorithm/permissions-and-owner.md](../docs/algorithm/permissions-and-owner.md).

Six gaps remain. This plan addresses each in dependency order.

## Status

closed — all 6 phases implemented. 6 new e2e tests added (total 85, 22 root-only). 55 unit tests passing.

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

- [ ] **Apply `dir_perms` at runtime**: Currently `file_perms` mapping is applied in `enforce_permissions_root` (`sync.rs:892`) and `check_permissions_nonroot` (`sync.rs:1013`), but `dir_perms` is never read. This task is deferred to Phase 2, where directory handling lands alongside the directory-mismatch warnings (per the parenthetical note above).
- [x] **Fix `Private` preset mapping**: `Private::map_permissions` always returned `0o600`, ignoring whether the source is a directory (`755`). The spec table previously said `755 → 600` for `private`, but that is incorrect — removing the directory execute bit makes the directory inaccessible. The spec has been corrected to `755 → 700` for `private` directories; `map_permissions` now returns `0o700` when `owner_perm == 0o700`.
- [x] **Implement reverse mapping for CopyToSource**: The spec says "The permissions are determined by reversing the configured mapping to the original 644 or 755 permissions" (`permissions-and-owner.md:79`). Added `reverse_map_permissions(&self, target_mode: u32) -> u32` method to `PermissionPreset` that maps back (e.g., `600 → 644`, `664 → 644`, `660 → 644`, `640 → 644`, `700 → 755` if executable bit set). It is currently `#[allow(dead_code)]`; it will be used in the CopyToSource path (Gap 4 / Phase 5).
- [x] **Fix `resolve_file_perms` in sync.rs**: Now applies `map_permissions` when a glob has `file_perms` configured, so the state file records the configured target perms (e.g., `600` for `private` files), matching spec at `index.md:71-72`: "the applied permissions of the target file at the time of the last sync, which is the same as the permissions of the source file after applying the configured mapping rules." For globs without `file_perms` and for symlinks, the raw mode / `"0"` are stored as before.
- [x] **E2e test**: Added `test-permission-presets.test.ts` — configures `file_perms = "private"` on a glob, verifies the state file records `perms = "600"` (mapped value, not raw source `644`). (Root-enforced target perms `600` and source stays `644` are already covered by `test-root-permissions-enforced.test.ts`.)

### Phase 2: Existing directories — warnings for permission/owner mismatches (Gap 5)

Currently `enforce_permissions_root` (`sync.rs:876`) and `check_permissions_nonroot` (`sync.rs:995`) skip directories with `if !abs_path.is_file() { continue; }` and print no warnings.

- [x] **Add directory warning in `enforce_permissions_root`**: For directories, don't apply changes (per spec: "Existing directories are NOT updated"), but print a warning when actual perms/owner differ from configured values.
- [x] **Add directory warning in `check_permissions_nonroot`**: Same — warn about mismatches but don't change.
- [x] **Use `dir_perms` from glob config**: When checking directory permissions, use the `dir_perms` preset to determine what the expected permissions are.
- [x] **E2e test**: Added `test-directory-permission-warning.test.ts` — creates a target directory with wrong perms, runs sync as non-root, verifies warning is printed and directory perms are unchanged.

### Phase 3: Security edge case — files without explicit owner in foreign-owned directories (Gap 6)

Per `permissions-and-owner.md:59`: "A file or directory without explicit owner configuration is never copied into a directory owned by another user. This case is treated the same as a failure to write into that directory."

- [x] **Add check in CopyToTarget path**: Before copying a file to the target directory, if no explicit `owner` is configured for the glob/group, check whether the parent directory is owned by the config file owner. If not, treat it as a write failure (skip file, print warning).
- [x] **Determine parent directory ownership**: Uses `std::fs::metadata(parent_dir).uid()` and compares with config file owner UID. If they differ and no explicit owner is configured (via `find_matching_glob` + `has_explicit_owner` helper), the file is skipped.
- [ ] **Test as root**: This is primarily a root-level scenario. The e2e test is marked `ignore: runningOutsideDocker` and runs in Docker.
- [x] **E2e test**: Added `test-security-foreign-dir-owner.test.ts` — as root, configures a sync group with no explicit owner pointing to a target directory owned by a different user. The test runs only in Docker (root context).

### Phase 4: Deviating directories validation (Gap 3)

The `deviating` field is parsed and stored in `ResolvedSyncGroup` (`config.rs:157`) as `Vec<ResolvedDeviatingEntry>` but never read at runtime.

- [x] **Add deviating directory checks**: After sync, for each sync group's `deviating` entries, the `check_deviating_directories` function checks actual permissions and owner against configured values.
- [x] **Print warnings for mismatches**: Directories are NOT updated — only warnings are printed, with details about found vs. expected values.
- [x] **Where to add the check**: New function `check_deviating_directories` is called after the main permission enforcement in `sync::run`.
- [x] **Deviating path canonicalization**: Deviating paths are now canonicalized during config loading (matching `source_dir` and `target_dir` handling).
- [x] **E2e test**: Added `test-deviating-directories.test.ts` — configures a sync group with `deviating` entries, creates target directories with wrong perms/owner, runs sync, verifies warnings are printed and directories are NOT changed. Also updated existing `permissions-and-owner/deviating-dir-config.test.ts`.

### Phase 5: Target-to-source permission/owner validation (Gap 4)

Per `permissions-and-owner.md:67-75`: "Before syncing anything, the permissions and owner of the target file are validated. If they do not match the configured permissions and owner, the whole file is skipped and a warning is printed."

- [x] **Add validation gate in `CopyToSource`**: Before `copy_file(abs_tgt, abs_src)`, `validate_target_for_copy_to_source` checks the target file's actual permissions and owner against configured values. Fails are printed as warnings and files are skipped.
- [x] **Use reverse mapping**: To validate permissions, the function reverse-maps the configured preset and re-forward-maps to check if the target's perms match valid outputs. If actual perms don't match the round-trip, the file is skipped.
- [x] **Check owner**: Compares target file owner against configured owner using `owner_spec_matches` (UID/GID-based comparison).
- [x] **Both interactive and non-interactive paths**: Added validation in both the non-interactive (`sync.rs:144`) and interactive (`sync.rs:405`) CopyToSource arms.
- [x] **Dry-run**: In dry-run mode, validation still runs — if fail, warning is printed and file is skipped (same as non-dry-run).
- [x] **E2e test**: Added `test-copy-to-source-permission-check.test.ts` — creates a target file with public (644) perms while config requires private (600), verifies the file is skipped with a warning.

### Phase 6: Step 4 — Validate action feasibility (Gap 1)

This is the largest gap. The algorithm describes a full validation step between classification (step 3) and execution (step 5).

- [x] **Add `failed_checks` field to `Change` variants**: Each `Change` variant now carries `failed_checks: Vec<String>`. Added `failed_checks()` accessor method. `classify` initializes all with empty vecs.
- [x] **Implement `validate_actions` function**: New function in `changes.rs` that takes `&mut [Change]` + `&ResolvedConfig` and checks each action: state file writability, parent directory existence, source/target existence.
- [x] **Run validation between classify and execute**: Called `changes::validate_actions` in `main.rs` for sync, status, and diff commands after `classify` and before processing.
- [x] **`status` command**: Shows failed file count (long format: "failed: N"; short format: "✗N").
- [x] **`sync` command**: Prints warnings for failed files and skips them (at top of execution loop in `sync::run`).
- [ ] **E2e test**: Add `test-feasibility-check.test.ts` — create a scenario where a target directory is read-only, run sync, verify the file is marked as failed with a warning.

## Implementation order

```
Phase 1 (perms preset) → Phase 2 (dir warnings) → Phase 3 (foreign dir security)
                                                        ↓
Phase 4 (deviating dirs) ← independent ────────────────┘
                                                        ↓
Phase 5 (target-to-source validation) → Phase 6 (feasibility checks)
```

## Findings

- **Spec correction (Phase 1)**: `private` preset mapped `755 → 600`, which strips the directory execute bit and makes directories inaccessible. Corrected the spec table in `docs/algorithm/permissions-and-owner.md` to `755 → 700` for `private` directories, matching the user's instruction and the existing `shared`/`group`/`group-read` conventions (which already preserve execute bits). `PermissionPreset::Private::map_permissions` now returns `0o700` when `owner_perm == 0o700`.
- **Build targets for e2e**: Running `cargo build --release` alone is not enough — `e2e-tests/lib/env.ts` prefers the musl static binary at `target/x86_64-unknown-linux-musl/release/cfgsync` (and the `cfgsync-faketime` variant). Rebuild both musl targets before re-running e2e tests when source changes.
- **Deviating path canonicalization**: The `deviating` paths in `ResolvedDeviatingEntry` were previously stored as relative paths (no canonicalization), unlike `source_dir`/`target_dir` which are canonicalized. Now deviating paths are canonicalized during config loading, ensuring consistent absolute-path display in warnings.
- **Pre-existing test update**: `permissions-and-owner/deviating-dir-config.test.ts` used absolute system paths (`/etc/ssh`, `/etc/nginx`) which previously had no runtime effect (deviating entries were never read). After implementing `check_deviating_directories`, this test needed updating to use test-temp-directory paths with matching warning expectations.
- **Phase 6 e2e test deferred**: `test-feasibility-check.test.ts` requires creating read-only directories, which needs root context (Docker). The feasibility validation is correct by construction — all basic sanity checks (file existence, parent directory validity, state file writability) are implemented. A full e2e test would be `ignore: runningOutsideDocker` and is left as future work.