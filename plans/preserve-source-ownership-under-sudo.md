# Preserve source directory ownership when running under sudo

## Problem

When `cfgsync` runs as root (e.g. via `sudo cfgsync sync ...`), any file
written to the source directory is created as `root:root`. This pollutes the
user's dotfiles repo with root-owned files, breaking `git` operations and
requiring manual `chown` to fix.

The source directory is typically a user-owned directory (e.g.
`~/dotfiles`). Files there should always be owned by that user, not root.

## Scenarios affected

1. **CopyToSource** — target file copied to source. The copy is done by root,
   so the new file is root-owned.

2. **Conflict resolution** — user picks `t` (target-wins) in interactive mode.
   The target file is copied to source as root.

3. **DeleteSource** — root deletes a file from source. This works fine (root
   can delete anyone's files), but edge case: if the source dir has a sticky
   bit, it may fail. Unlikely.

4. **CopyToTarget** and **DeleteTarget** — target directory is system-owned
   (e.g. `/etc`), so root ownership is correct there. No change needed.

## Root cause

`copy_file()` in `sync.rs` uses `std::fs::copy()` which creates the
destination file owned by the effective UID (root). No ownership correction is
applied on the source side.

## Solution

After any write to the source directory, detect the owner of the source
directory (or the first existing parent directory of the written path) and
`chown` the file to that owner.

### Algorithm

```
fn fix_source_ownership(source_dir: &Path, written_file: &Path) -> Result<(), String>
```

1. Find the owner UID/GID of `source_dir` (via `std::fs::metadata` then
   `MetadataExt::uid()` / `MetadataExt::gid()`).
2. Call `nix::unistd::chown(written_file, Some(uid), Some(gid))`.
3. Non-fatal on failure (print warning, continue).

### Where to call it

- After `copy_file()` in the `CopyToSource` path (both interactive and
  non-interactive).
- After `copy_file()` in interactive conflict resolution when user picks `t`
  (target-wins → copy target to source).

### When NOT to call it

- When NOT running as root — non-root can't chown files they don't own.
- When the source directory IS owned by root (unlikely but possible).
- For target-side writes — those should remain root-or-system-owned.

## Files to change

- `src/sync.rs`: add `fix_source_ownership()` function, call it after
  source-side writes
- Needs `use std::os::unix::fs::MetadataExt;` if not already imported

## Edge cases

- **Source dir doesn't exist yet for the path**: walk up the parent chain
  until an existing directory is found, use its owner.
- **Source dir is on a filesystem that doesn't support Unix ownership**
  (e.g. FAT32, NTFS, sshfs): `chown` may fail silently. Already handled by
  the non-fatal warning pattern.
- **Running non-root**: skip — `chown` requires root. The existing
  `check_permissions_nonroot()` path already warns about mismatches.
- **User specified owner in filter**: filter owner applies to target only.
  Source ownership should always match the source directory owner, regardless
  of filter config.

## Verification

- Manual test: `sudo cfgsync sync config.toml` with a file on target only,
  verify the file created in source is owned by the source directory owner,
  not root.
- E2e test cannot verify this (can't run as root in CI). Unit test can call
  `fix_source_ownership()` directly with a temp dir and verify the chown.
