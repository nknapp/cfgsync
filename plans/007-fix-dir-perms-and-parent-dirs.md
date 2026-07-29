# Fix: `dir_perms` enforcement and parent directory permissions on CopyToTarget

## Summary

The algorithm spec says:
1. `dir_perms` should be applied to directories (permissions-and-owner.md)
2. "Create missing parent directories in the target folder and set the correct owner and
   permissions" (index.md §5.3, CopyToTarget)

Currently `dir_perms` is only used for warnings in `enforce_permissions_root()` (root-only).
Non-root gets no directory permission warnings. Newly created parent directories via
`create_dir_all()` get no owner or `dir_perms` applied.

## Status

Not started.

## Files affected

| File | Change |
|------|--------|
| `src/sync.rs` | `copy_file()` — apply owner+dir_perms to newly created parent dirs |
| `src/sync.rs` | Add non-root directory permission warnings (extract from root-only path) |

## Current behavior

1. **`copy_file()`** (`sync.rs:543`): Calls `create_dir_all()` on parent, then copies the file.
   No chown/chmod on created directories.
2. **`warn_directory_permission_mismatch()`** (`sync.rs:1114`): Only called from
   `enforce_permissions_root()` which runs as root. Non-root never gets directory warnings.

## Required changes

### 1. Apply owner + dir_perms to newly created parent directories

After `create_dir_all(parent)`, walk up from `parent` to `group.target_dir`. For each directory
that `create_dir_all` just created (check by trying to read metadata — if it now exists and
is a directory), apply the configured owner and `dir_perms`.

```rust
fn copy_file(src: &Path, dst: &Path, group: &ResolvedSyncGroup) -> Result<(), String> {
    // ... existing symlink/source check ...

    if let Some(parent) = dst.parent() {
        // Track directories that exist BEFORE create_dir_all
        let existing: HashSet<PathBuf> = walk_parents_to_target(parent, &group.target_dir)
            .filter(|p| p.exists())
            .collect();

        std::fs::create_dir_all(parent)?;

        // For directories that DIDN'T exist before, apply owner + dir_perms
        for p in walk_parents_to_target(parent, &group.target_dir) {
            if !existing.contains(&p) && p.is_dir() {
                apply_directory_owner(&p, group);
                apply_directory_perms(&p, group);
            }
        }
    }

    // ... rest of copy ...
}
```

Note: this requires passing `&ResolvedSyncGroup` to `copy_file()`, which means updating the
caller in `sync.rs` run loop.

### 2. Non-root directory permission warnings

Extract directory warning logic from `enforce_permissions_root()` into a standalone function
and call it from the non-root path as well.

The existing `enforce_permissions_root()` iterates globs in the target dir, checks files for
perms/owner, and calls `warn_directory_permission_mismatch()` for dirs. After sync in
non-root mode, we should similarly walk target directories and warn about mismatches.

Simplest approach: call `enforce_permissions_root()` renamed to `check_permissions()` that
works for both root and non-root (root applies changes, non-root only warns). Or call the
existing function from both paths — `enforce_permissions_root` already only warns for dirs.

Actually looking at the code, `enforce_permissions_root` has `if is_root()` guard. We need
to split this:

- Root: `enforce_permissions_root()` — applies file perms + chown, warns for dirs
- Non-root: new `check_permissions_nonroot()` — warns for files + dirs

Wait, there's no `check_permissions_nonroot` currently. Let me re-read the sync run flow...

In `sync.rs::run()` (line 499):
```rust
if !dry_run {
    if is_root() {
        enforce_permissions_root(config, state)?;
    }
    check_deviating_directories(config);
    // hooks...
}
```

So non-root currently gets NO permission checking at all (except for the per-file
`apply_target_permissions` during CopyToTarget which tries to set perms and warns on
failure). We need to add a `check_permissions_nonroot()` call in the `else` branch.

## E2e tests to add

### B2. `dir_perms` enforcement as root (sudo test)

```
Setup: source has subdir/ with a file. Config has dir_perms = "private" on glob.
Expected after sync as root: target/subdir/ has 700 perms.
```

### B3. Parent directory owner + perms during CopyToTarget

```
Setup: source has deep/path/file.txt. Config has owner = "someuser:somegroup", dir_perms = "private".
Expected after sync: target/deep/ and target/deep/path/ have owner = someuser:somegroup and
permissions = 700.
```

## Verification

```bash
mise run all-local
```
