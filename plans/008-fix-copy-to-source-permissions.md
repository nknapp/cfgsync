# Fix: CopyToSource — enforce source permissions

## Summary

The algorithm spec (sec 5.3, `CopyToSource`) says: "Ensure that permissions and owner match the
valid values." The permissions-and-owner.md spec (§Target to source) says: "The permissions are
determined by reversing the configured mapping to the original 644 or 755 permissions."

Currently, after CopyToSource, only owner is applied (via `apply_source_owner`, root-only).
Permissions are never enforced on the source file.

## Status

Not started.

## Files affected

| File | Change |
|------|--------|
| `src/sync.rs` | CopyToSource execution path — add source permission enforcement |
| `src/config.rs` | `PermissionPreset::reverse_map_permissions` already exists |

## Current behavior

In the CopyToSource execution path (`sync.rs`), after `copy_file(abs_tgt, abs_src)` succeeds:

```rust
apply_source_owner(config, *group_index, abs_src);
```

Nothing enforces permissions on the source file. The source file gets whatever permissions
`copy_file` sets (typically the target file's permissions preserved by `std::fs::copy`),
which may not be the canonical 644/755.

## Required changes

Add a `apply_source_permissions()` function and call it after `apply_source_owner()`:

```rust
fn apply_source_permissions(
    config: &ResolvedConfig,
    group_index: usize,
    src_path: &Path,
    rel_path: &str,
) {
    let group = &config.sync_groups[group_index];
    let glob_entry = match find_matching_glob(group, rel_path) {
        Some(g) => g,
        None => return,
    };

    let Some(ref preset) = glob_entry.file_perms else {
        return;
    };

    let Ok(metadata) = std::fs::symlink_metadata(src_path) else {
        return;
    };
    if metadata.file_type().is_symlink() {
        return;
    }

    let current_mode = metadata.permissions().mode() & 0o777;
    let canonical_mode = preset.reverse_map_permissions(current_mode);
    let perms = std::fs::Permissions::from_mode(canonical_mode);

    if current_mode != canonical_mode {
        if is_root() {
            let _ = std::fs::set_permissions(src_path, perms);
        } else {
            eprintln!(
                "Permission warning: source '{}' has {:o}, should have {:o} (run as root to fix)",
                rel_path, current_mode, canonical_mode
            );
        }
    }
}
```

## E2e test to add

### B4. Source permission enforcement after CopyToSource

```
Setup: config has file_perms = "private". Target has file.txt with content, perms = 600.
No state file.
Expected after sync: source/file.txt exists with content from target, perms = 644.
(600 reverse-maps to 644 for regular files.)
```

## Verification

```bash
mise run all-local
```
