# Validate Action Feasibility — Step 4

## Summary

The algorithm spec (sec 4) defines a validation step that runs between classification and execution.
It checks whether each action can actually be performed. The existing `validate_action()` function
only does rudimentary existence/path checks. Seven feasibility checks are missing.

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

## Design decisions

- **Failed checks are warnings**: Actions with failed checks get populated in `failed_checks`.
  `sync.rs` already skips actions with non-empty `failed_checks` and prints warnings.
  No change needed to the execution path.
- **`status` shows failed count**: `ChangeCounts` already has a `failed` field. `print_status`
  already prints it.
- **Don't break existing behavior**: The current shallow checks stay in place; we add additional
  checks. Existing e2e tests should continue to pass.
- **Parent directory owner check**: For CopyToTarget, verify that existing parent dirs have owner
  matching the config's owner (or config file owner as fallback). Permissions check uses
  `dir_perms` from config.
- **File writable**: For target path `/etc/foo/bar.conf`, check that the parent `/etc/foo/`
  allows writing (based on current user's uid/gid and directory mode).

## Implementation approach

Expand `validate_action()`:

### For `CopyToTarget`:

```rust
Change::CopyToTarget { abs_src, abs_tgt, group_index, .. } => {
    check_state_writable(failed_checks, config);
    let group = &config.sync_groups[*group_index];

    // Existing checks (source exists, parent is not a non-dir file)
    // ... keep existing ...

    // NEW: check parent directories can be created or are writable
    check_parent_dirs_creatable(abs_tgt, group.target_dir, failed_checks);

    // NEW: check existing parent dirs have correct owner + dir_perms
    check_parent_dir_owner_and_perms(abs_tgt, group, config, failed_checks);

    // NEW: check target writable
    check_target_writable(abs_tgt, failed_checks);

    // NEW: check owner settable
    check_owner_settable(group, rel_path, false /* is_copy_to_source */, config, failed_checks);
}
```

### For `CopyToSource`:

Similar but for source side, with config file owner.

### For `DeleteTarget` / `DeleteSource`:

Check parent directory writability.

## Reuse existing helpers

Several checks can reuse or extract from existing `sync.rs` helpers:
- `parent_dir_owned_by_foreign_user()` (already checks if parent dir owned by another user)
- `check_owner_feasibility()` (non-root + explicit owner = infeasible)
- `can_write()` (checks uid/gid against mode bits)

## E2e test to add

### Target parent dir not writable

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
Setup: non-root, config has owner = "otheruser:othergroup".
Source has file.txt.
Expected: status shows failed: 1 (owner not settable without root).
```

## Verification

```bash
mise run all-local
```
