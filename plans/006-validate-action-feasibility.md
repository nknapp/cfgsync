# Validate Action Feasibility — Step 4

## Summary

The algorithm spec (sec 4) defines a validation step that runs between classification and execution.
It checks whether each action can actually be performed. The existing `validate_action()` function
only does rudimentary existence/path checks. Nine feasibility checks are missing, plus validation
for `Conflict` actions (which the spec requires but is currently absent).

## Status

Not started.

## Files affected

| File | Change |
|------|--------|
| `src/changes.rs:616-733` | `validate_actions()` / `validate_action()` — expand with full checks |
| `src/sync.rs` | No changes; checks are done in validation, not execution |

## Required feasibility checks (from sec 4 of algorithm)

| # | Action | Check needed | Currently |
|---|--------|-------------|-----------|
| 1 | `CopyToTarget` | Missing parent directories can be created | Not checked |
| 2 | `CopyToTarget` | Existing parent directories have correct permissions-and-owner | Not checked |
| 3 | `CopyToTarget` | Target file can be written or created | Not checked |
| 4 | `CopyToTarget` | Correct file owner can be set (running as root or as intended owner) | Not checked |
| 5 | `CopyToSource` | Source file can be written or created | Not checked |
| 6 | `CopyToSource` | Missing parent directories can be created | Not checked |
| 7 | `CopyToSource` | Correct file owner can be set (running as root or as config file owner) | Not checked |
| 8 | `DeleteTarget` | Target file can be deleted | Not checked |
| 9 | `DeleteSource` | Source file can be deleted | Not checked |
| 10 | `Conflict` | Check if any of CopyToTarget or CopyToSource are feasible | **Not checked** |

## Grill session resolution

### Overall goal: pre-flight checking (Q1)

Per spec section 4: *"For the next steps, a file is only considered 'valid' if EVERY check for that file passes."*
And section 5.3: *"Because of the checks in step 4, we expect all actions to pass without errors."*

Validation is **complete pre-flight checking** — execution should succeed for every validated action.
If validation passes but execution fails, the execution path's non-fatal error handling ("revert, print error, continue")
catches it. No need for a second validation pass (TOCTOU is theoretical, Q10).

### Effective user for validation (Q3, Q4)

**Principle**: Validate as if the **config file owner** were running the sync, unless the sync group
has an explicit owner that overrides it. Running as root doesn't bypass validation — root must still
pass checks as the effective user would.

### Conflict validation — missing from original plan (Q2)

The spec says for `Conflict`: *"Check if any of `CopyToTarget` or `CopyToSource` are possible."*
This was omitted from the original plan. Must be added: for each Conflict, run the CopyToTarget and
CopyToSource validation checks and append failures. If **both** directions are infeasible, the conflict
is genuinely impossible to resolve.

### Deletion requires w+x on parent + sticky-bit (Q3)

On Unix, deleting a file requires **write + execute** on the parent directory. The existing `can_write()`
helper only checks the write bit — insufficient. Additionally, sticky-bit directories (`1777`, like `/tmp`)
restrict deletion to the file owner (or root). The deletion feasibility check must account for both.

For DeleteTarget/DeleteSource: the check evaluates whether the **effective user** can delete the file
from its parent directory (w+x on parent, plus sticky-bit logic if applicable). Not the real uid/gid,
but the effective user determined by the config file owner or group's configured owner.

### "Correct" parent directory permissions = matches config (Q4)

The spec says "existing parent directories have the correct permissions-and-owner." This means matching
the config's resolved `dir_perms` (derived from settings like `"private"` or `"shared"`, not raw octal)
and the configured owner — not merely "is the parent writable by the effective user." If the parent
dir's actual perms/owner don't match config, the check fails.

### Parent directory boundary = target root (Q5)

Do NOT check parent directories **above the target root** (or source root). E.g., if target is
`/etc/myapp/subdir/`, check `/etc/myapp/subdir/` and `/etc/myapp/`, but NOT `/etc/`.
Directories outside the sync group's jurisdiction are skipped.

### Multi-level missing parent directories (Q6)

When multiple parent directory levels are missing (e.g., file at `/a/b/c/d/file.conf`, `/a/b/` exists
but `/a/b/c/` and `/a/b/c/d/` don't), walk up from the file to the target root. For each missing level:
check if the effective user can create it (w+x on the level above). For the second and subsequent levels,
**assume the previous level's creation succeeds** — so the writability check for creating `/a/b/c/d/`
uses the configured `dir_perms` of `/a/b/c/` (which we'd set during creation).

### CopyToSource: existing checks are sufficient (Q7)

The current code already validates target-file perms, target-file owner, and user identity for
CopyToSource. Do NOT remove these. The new checks to add for CopyToSource are: source file writable,
missing parent directories creatable, and owner settable (using config file owner).

### `deviating` — remove for now (Q8)

The `deviating` config option is out of scope. Remove or ignore it. Will revisit later.

### Target writable check depends on existence (Q9)

For CopyToTarget, the "target writable" check depends on whether the target file already exists:
- **File exists** (overwrite): effective user needs `w` on the file itself.
- **File doesn't exist** (create): effective user needs `w`+`x` on the immediate parent directory.

### Q11: parent dir owner check with group-configured owner

When a sync group has an explicit `owner = "http:http"` but the config file is owned by `nils`:
the parent directory owner check uses the **group's configured owner** (`http:http`), falling back
to the config file owner only if the group has no explicit owner. This is consistent with the
general principle: the effective user is always the most specific owner configuration available.

## Design decisions

- **Failed checks are warnings**: Actions with failed checks get populated in `failed_checks`.
  `sync.rs` already skips actions with non-empty `failed_checks` and prints warnings.
  No change needed to the execution path.
- **`status` shows failed count**: `ChangeCounts` already has a `failed` field. `print_status`
  already prints it.
- **Don't break existing behavior**: The current shallow checks stay in place; we add additional
  checks. Existing e2e tests should continue to pass.
- **Effective user principle**: Validate as if the config file owner (or group's configured owner)
  were running the sync. All checks use the effective user's uid/gid, NOT the real uid/gid.
- **Parent directory owner check**: For CopyToTarget, verify that existing parent dirs have owner
  matching the config's resolved owner (group-configured owner or config-file-owner fallback).
  Permissions check uses resolved `dir_perms` from config.
- **File writable**: Differs by existence — existing file requires `w` on the file; new file
  requires `w`+`x` on the immediate parent directory.
- **Deletion**: Requires `w`+`x` on parent directory + sticky-bit check. Effective user must be
  file owner (or root) if sticky bit is set on parent.

## Implementation approach

### Effective user resolution

Before checking any action, resolve the effective user (uid/gid) for validation:

```rust
fn effective_user(config: &ResolvedConfig, group_index: usize) -> Option<(u32, u32)> {
    let group = &config.sync_groups[group_index];
    if let Some(owner) = group.globs.iter().find_map(|g| g.owner.clone()) {
        // resolve owner spec to uid/gid
    } else if let Ok(meta) = std::fs::metadata(&config.config_path) {
        Some((meta.uid(), meta.gid()))
    } else {
        None // state file only, shouldn't happen
    }
}
```

All checks below use this effective user, not the real uid/gid of the process.

### Expand `validate_action()`:

#### For `CopyToTarget`:

```rust
Change::CopyToTarget { abs_src, abs_tgt, group_index, .. } => {
    check_state_writable(failed_checks, config);
    let group = &config.sync_groups[*group_index];

    // Existing checks (source exists, parent is not a non-dir file)
    // ... keep existing ...

    // NEW: check parent directories can be created (walk up to target root)
    check_parent_dirs_creatable(abs_tgt, group.target_dir, effective_user, failed_checks);

    // NEW: check existing parent dirs have correct owner + dir_perms
    // (only directories within the target root, not above it)
    check_parent_dir_owner_and_perms(abs_tgt, group, config, effective_user, failed_checks);

    // NEW: check target writable (file exists → w on file; doesn't exist → w+x on parent)
    check_target_writable(abs_tgt, effective_user, failed_checks);

    // NEW: check owner settable
    check_owner_settable(group, rel_path, false /* is_copy_to_source */, config, failed_checks);
}
```

#### For `CopyToSource`:

Same pattern as CopyToTarget but for the source side, using config file owner as effective user.

**Keep existing checks**: `validate_target_perms_for_copy_to_source`,
`validate_target_owner_for_copy_to_source`, and `validate_copy_to_source_user` are already correct.
Do NOT remove them. Only add: source writable, parent dirs creatable, owner settable.

#### For `DeleteTarget` / `DeleteSource`:

Check that the effective user can delete the file from its parent directory:
- `w`+`x` on the parent directory (via effective user's uid/gid against parent mode)
- Sticky-bit check: if parent has sticky bit (`01000`), effective user must be file owner or root
- Use a new helper `can_delete(uid, gid, parent_meta, file_meta) -> bool`

#### For `Conflict` (NEW — omitted from original plan):

Run the full CopyToTarget validation checks *and* the full CopyToSource validation checks.
If either direction passes, the conflict is at least partially resolvable (the user can still pick
the other direction, but we warn about its failures). If **both** fail all checks, emit a special
warning that the conflict cannot be resolved.

## New helpers needed

| Helper | Purpose | Location |
|--------|---------|----------|
| `effective_user(config, group_index) -> Option<(u32, u32)>` | Resolve validation user | `changes.rs` |
| `check_parent_dirs_creatable(path, root, user, failed_checks)` | Walk up from path to root, check each missing dir is creatable | `changes.rs` |
| `check_parent_dir_owner_and_perms(path, group, config, user, failed_checks)` | Check existing parents within root match config owner/dir_perms | `changes.rs` |
| `check_target_writable(path, user, failed_checks)` | File exists → w on file; new → w+x on parent | `changes.rs` |
| `can_delete(user_uid, user_gid, parent_meta, file_meta) -> bool` | w+x on parent + sticky-bit logic | `changes.rs` |

## Existing helpers to reuse (from `sync.rs`)

- `parent_dir_owned_by_foreign_user()` — checks if parent dir owned by another user
- `check_owner_feasibility()` — non-root + explicit owner = infeasible
- `can_write()` — checks uid/gid against mode bits (write-only, may need enhancement for execute)

## E2e test to add

### Target parent dir not writable (CopyToTarget)

```
Setup: target/ owned by root:root with 700 perms. Config owned by user:user.
Source has file.txt.
Expected: status shows failed: 1 (cannot write parent dir).
```

### Source parent dir not writable (CopyToSource)

```
Setup: source/ owned by root:root with 700 perms. Config owned by user:user.
Target has file.txt.
Expected: status shows failed: 1 (cannot write source parent dir).
```

### Owner not settable (non-root, owner config set)

```
Setup: non-root, config group has owner = "otheruser:othergroup".
Source has file.txt.
Expected: status shows failed: 1 (owner not settable without root).
```

### Target file not writable (existing file, wrong owner)

```
Setup: target/file.txt owned by root:root with 600 perms. Config owned by user:user.
Source has file.txt with different content.
Expected: status shows failed: 1 (cannot overwrite target file).
```

### Cannot delete from sticky-bit directory (if feasible to test)

```
Setup: target/ has sticky bit (1777), target/file.txt owned by root:root.
Config owned by user:user.
File absent from source → DeleteTarget.
Expected: status shows failed: 1 (cannot delete, sticky-bit directory).
```

### Conflict with no feasible resolution

```
Setup: target/ owned by root:root with 700 perms, source/ owned by root:root with 700 perms.
Config owned by user:user. Both sides have file.txt with different content.
Expected: status shows failed: 1 (cannot resolve conflict — neither direction feasible).
```

## Verification

```bash
mise run all-local
```
