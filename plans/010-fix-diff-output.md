# Fix: Diff output — add owner and permissions information

## Summary

The algorithm spec (sec 5.2) says diff output should show owner and permission deltas:

```
=== file.conf (source -> target) ===
Owner: <old-owner> -> <new-owner>
Perms: <old-perms> -> <new-perms>

--- /abs/path/source/file.conf ...
+++ /abs/path/target/file.conf ...
```

Currently `print_diffs()` only shows the unified content diff. Owner and permissions are
missing from all diff variants (CopyToTarget, CopyToSource, Conflict, DeleteTarget, DeleteSource).

## Status

Not started.

## Files affected

| File | Change |
|------|--------|
| `src/diff.rs` | `print_diffs()` — add owner + perms lines before unified diff |

## Required changes

For `CopyToTarget`, `CopyToSource`, and `Conflict` change variants, after printing the header
and before the unified diff, print:

```
Owner: <old-owner> -> <new-owner>
Perms: <old-perms> -> <new-perms>
```

Where:
- **CopyToTarget**: `old` = target file's current owner/perms, `new` = configured owner/perms
  from the glob's settings (or defaults)
- **CopyToSource**: `old` = source file's current owner/perms, `new` = config file owner + reverse-mapped perms
- **Conflict**: `old` = target (displayed as "Target-Owner"), `new` = configured values

For `DeleteTarget` and `DeleteSource`, the algorithm already specifies the correct format
(no owner/perms shown), so no change needed.

### Implementation approach

Add helper functions:

```rust
fn format_owner_uid_gid(path: &Path) -> String { ... }
fn format_perms_octal(path: &Path) -> String { ... }
fn configured_owner_for_copy_to_target(group: &ResolvedSyncGroup, rel_path: &str) -> String { ... }
fn configured_perms_for_copy_to_target(group: &ResolvedSyncGroup, rel_path: &str, src_path: &Path) -> String { ... }
```

In `print_diffs()`, for each variant:
- Read old owner/perms from the destination file (target for CopyToTarget, source for CopyToSource)
- Compute new owner/perms from config
- If old ≠ new, print the delta lines

## E2e test to add

### B7. Diff output includes owner and permissions

```
Setup: config has file_perms = "private", owner = "otheruser:othergroup".
Source has file.txt with content "hello", owner user:user, perms 644.
Target has file.txt with content "world", owner user:user, perms 644.
Run: cfgsync diff
Expected output includes:
  === file.txt (source -> target) ===
  Owner: user:user -> otheruser:othergroup
  Perms: 644 -> 600
  --- .../source/file.txt ...
  +++ .../target/file.txt ...
```

## Verification

```bash
mise run all-local
```
