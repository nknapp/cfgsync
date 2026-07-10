# Sync Algorithm

This is a description of the algorithm that cfgsync uses to synchronize two directories. The goal of this algorithm is
to satisfy the following needs:

* Changed files should be copied into the other directory (two-way sync)
* Conflicts should be prompted to the user
* Even with conflicts, everything that can be synced should be synced.

## High-level overview

`cfgsync` performs the following steps to run the algorithm

1. [Load config](#1-load-config)
2. [Load state](#2-load-state)
3. [Find and classify changes](#3-find-and-classify-files)
4. [Validate action feasibility](#4-validate-action-feasibility)
5. [Execute changes](#5-execute-changes)
6. Run hooks

# 1. Load config

The config file is passed to `cfgsync` as first parameter. It is a `.toml` file consisting of multiple sync groups
each sync group defines

* a source directory
* a target directory
* optional default owner for files and directories in the target directory
* optional default file permissions for files in the target directory
* optional default directory permissions for directories in the target directory
* a list of globs that are either
    * a simple glob pattern
    * and object consisting of a
        * glob pattern,
        * optional file owner for files and directories in the target directory
        * optional file permissions for files in the target directory
        * optional directory permissions for directories in the target directory
* a list of deviating directories when looking at permissions and owner
    * path (no glob)
    * optional expected permission
    * optional expected owner

    
## 1a. Permission and owner fallbacks

(For details about configuration semantics concerning permissions and owner see [permissions-and-owner](./permissions-and-owner.md#permissions))


# 2. Load state

The path to the state file is derived from the config file by removing the `.toml` from the
name and then adding `.cfgsync.state`.
It contains

* A timestamp of the last sync
* A list of files involved in the last sync, consisting of their
    * path
    * sync_group (for stability, the target directory is used to indicate the sync group)
    * one timestamp of the last sync
    * a hash of the file (XXH3_128) at the time directly after the last sync.

If there is no state-file yet, every file is assumed to be new.

## 2.1 The state hash

The hash is computed after the sync, when source and target file have the same content.
The hash is based on
* the contents of the file (or the path of the link-target if it is a symlink)
* the permission of the file in the target directory after the sync, which is the same as the permissions of the source file
  after applying the [configured mapping rules](./permissions-and-owner.md#permissions)
* the owner of the file in the target directory after the sync, which is the same as the [configured owner](./permissions-and-owner.md#owner)
  for the source file.

# 3. Find and classify files

* This step first scans the files matching the globs in the source and target directory as well as the ancestor
  directories. It uses an efficient glob filtering method that only dives in a directory if there is a chance of it having 
  files matching the glob.
* Verify that every source and target file was found by no more than one sync group. If a file is in multiple
  sync groups, write an error message and exit immediately.
* The files and directories are paired up by their relative path, so we get this information on every entry (note that
  not all information must be read upfront. It can also be read when needed)
    * source file/dir (if it exists)
        * mtime
        * hash, computed from
            * contents
            * permissions from config (after applying defaults)
            * owner from config (after applying defaults)
    * target file/dir (if it exists)
        * mtime
        * hash, computed from
            * contents
            * permissions
            * owner
    * state-file entry for this file (if it exists)
        * sync time
        * hash of the file

## 3.1 For each file, determine the action

We assume having the following helpers (`file` is either `source` or `target`)

* `is_changed(file)` is an abbreviation for `file.mtime != state.last_sync && file.hash != state.hash`
  
> Note: This implementation means that files with a fabricated mtime may lead to falsely skipped files. 
> However, we do not assume bad intentions here. The major goal is to avoid unnecessary reads of the content
> We expect most of the files to be unchanged with the same mtime as before. The content hash is only checked to 
> detect files that have been edited and reverted as "unchanged"


```python
# Check for new files
if state is None:
    if source is not None and target is not None:
        if source.hash == target.hash:
            return "UpdateState"
        else:
            return "Conflict"
    elif source is not None:
        return "CopyToTarget"
    else:
        return "CopyToSource"
else:
    # Check for deleted files
    if source is None and target is None:
        return "DeleteFromState"
    elif source is None:
        if not is_changed(target):
            return "DeleteTarget"
        else:
            return "Conflict"
    elif target is None:
        if not is_changed(source):
            return "DeleteSource"
        else:
            return "Conflict"
    # Check for changed files
    else:
        if not is_changed(source) and not is_changed(target):
            # This should happen for almost all files
            return "Clean"
        elif is_changed(source) and not is_changed(target):
            return "CopyToTarget"
        elif is_changed(target) and not is_changed(source):
            return "CopyToSource"
        elif source.hash == target.hash:
            # Both sides made the same change. Adjust state to avoid having to compare the hash on the next run. 
            return "UpdateState"
        else:
            return "Conflict"
```

# 4. Validate action feasibility


Verify that the actions can be executed

* `UpdateState`:
    * Check that the state file can be written
* `CopyToTarget`:
    * Check that the state file can be written
    * Check that missing parent directories can be created.
    * Check that existing parent directories have the correct [permissions-and-owner](./permissions-and-owner.md)
    * Check that the target file can be written or created.
    * Check that the correct file owner can be set.
      (i.e., either `cfgsync` is running as root or as the intended owner of the target file)
* `CopyToSource`:
* Check that the state file can be written
* Check that the source file can be written or created.
* Check that missing parent directories can be created.
* Check that the correct file owner can be set.
  (i.e., either `cfgsync` is running as root or as the intended owner of the **config file**)
* `DeleteSource`:
    * Check that the state file can be written
    * Check the source file can be deleted
* `DeleteTarget`:
    * Check that the state file can be written
    * Check the target file can be deleted
* `DeleteFromState`:
    * Check that the state file can be written
* `Clean`
    * Nothing to check
* `Conflict`:
    * Check if any of `CopyToTarget` or `CopyToSource` are feasable.


All failed checks are collected and attached for each file record for use in later steps. 

# 5. Execute changes

### 5.1 Command: `status`

Show the number of files without failed checks the following categories

| Long                   | Short | Count computed via number of     |
|------------------------|-------|----------------------------------|
| source to target:      | →     | `CopyToTarget` +  `DeleteTarget` |
| target to source:      | ←     | `CopyToSource` + `DeleteSource`  |
| conflict:              | ↯     | `Conflict`                       |
| state update required: | ↺     | `UpdateState`                    |
| clean:                 |       | `Clean`                          |

In the short form, only value `>0` are shown, "clean" is omitted (e.g., 3→ 2← 1↯ ↺2)
If all files are "clean", show a `✓`.

### 5.2 Command: `diff`:

For each file show based on the action from step 3:

* `CopyToTarget`

   ```
   === file.conf (source -> target) ===
   Owner: <old-owner> -> <new-owner>
   Perms: <old-perms> -> <new-perms>
   
   --- /abs/path/source/file.conf 2026-05-20 15:00:00.000000000 +0000
   +++ /abs/path/target/file.conf 2026-05-20 13:00:00.000000000 +0000
   
   unified diff (--- source, +++ target)
   ```

Where `new-owner` and `new-perms` are the owner and permission valus derived from the configuration
(see [permissions-and-owner](./permissions-and-owner.md#source-to-target)).

- `CopyToSource`

   ``` 
   === file.conf (target -> source) ===
   Owner: <old-owner> -> <new-owner>
   Perms: <old-perms> -> <new-perms>
   
   +++ /abs/path/target/file.conf 2026-05-20 15:00:00.000000000 +0000
   --- /abs/path/source/file.conf 2026-05-20 13:00:00.000000000 +0000
   
   unified diff (--- source, +++ target)
   ```

  Where `new-owner` and `new-perms` are the owner and permission valus derived from the configuration
  (see [permissions-and-owner](./permissions-and-owner.md#target-to-source))
  If target-permissions or owner do not match configuration show error instead of `new-owner` or `new-perms`.

- `Conflict`

   ```
   === file.conf (CONFLICT) ===
   Target-Owner: <old-owner> -> <new-owner>
   Target-Perms: <old-perms> -> <new-perms>
   
   --- /abs/path/source/file.conf 2026-05-20 15:00:00.000000000 +0000
   +++ /abs/path/target/file.conf 2026-05-20 13:00:00.000000000 +0000
   
   unified diff (--- source, +++ target)
   ```

- `DeleteTarget`
    - Header: `=== <rel_path> (would be deleted from target) ===`
    - Diff: no diff shown
- `DeleteSource`
    - Header: `=== <rel_path> (would be deleted from source) ===`
    - Diff: no diff shown

### 5.3 Command: `sync`


For all files marked as `failed`, print a warning, but continue with the operation.

For all non-failed `Conflict` files, ask the user for a resolution.
* if cli option `-i` is active:
    * Show the same diff as in 4.2 (for conflicts))
    * Show `Overwrite [t]arget   Overwrite [s]ource   [x]skip  [q]uit:`
    * Based on the users chose set the action to
        * `t`: `CopyToTarget`,
        * `s`: `CopyToSource`,
        * `x`: `Clean`
        * `q`: Quit the whole application, do not roll back, do not continue
* else 
  * Print the following warning and mark all files as `Clean`
     ```
    Conflicts detected (N files):
    <rel_path_1>
    <rel_path_2>
    ... 
    Aborting due to N conflict(s). Use -i/--interactive to resolve.
    ```
    
For each non-failed file, perform the determined action. Because of the checks in [step 4](#4-validate-action-feasibility),
we expect all actions to pass without errors. If errors happen, revert the file where the error occurred, 
print an error message, and continue with the next file.

* `UpdateState`
    * Ensure that a state entry for the path exists with the hash.
    * Update the mtime of both files to the newest of both mtimes and set this time in the state as last_sync
* `CopyToTarget`
    * Create missing parent directories in the target folder an set the correct owner and permissions   
    * Copy the source file to the target directory
    * Ensure that permissions and owner match the configured values
      (see [permissions-and-owner](./permissions-and-owner.md)
    * Update the mtime of the target file to match the source file
    * Update the hash in state
    * Update the sync time in state to match the mtime
* `CopyToSource`
    * Copy the target file to the source directory
    * Ensure that permissions and owner match the valid values (see [permissions-and-owner](./permissions-and-owner.md)
    * Update the mtime of the source file to match the target file
    * Update the hash in state
    * Update the sync time in state to match the mtime
* `DeleteSource`:
    * Delete the source file
    * Remove the entry from the state file
* `DeleteTarget`:
    * Delete the target file
    * Remove the entry from the state file
* `DeleteFromState`:
    * Remove the entry from the state file
* `Clean`
    * Do nothing

# 6. Run hooks

For every sync group in which a `CopyToTarget` action was executed, the hooks configured in `hooks.after` are executed.
The hooks are run with the [configured owner](./permissions-and-owner.md#owner) of the sync group.

If it is not possible to run the hook as that user, a warning is printed and the hook is not executed.

## Notes on current implementation coverage

### What the e2e tests cover that the algorithm description doesn't explicitly mention

- **Multi-group scenarios**: Sync groups with independent source/target pairs (`test-multi-group-independent`), multiple groups sharing the same source directory with different owners (`test-multi-group-owner`), and multiple groups with per-glob permission overrides (`test-multi-group-per-glob`).
- **Overlapping glob error detection**: When a file matches globs in two or more sync groups, the tool exits with an error (unit tests in `changes.rs` and `test-multi-group-overlap`).
- **Glob filtering**: Only files matching configured globs are synced; non-matching files are ignored (`test-ignore-non-matching`). Per-glob permission/owner overrides without group-level defaults (`test-per-glob-no-group-defaults`).
- **Symlink handling**: Symlinks are preserved as symlinks during sync (the symlink target path is replicated). Symlink targets are tracked in the state file for change detection (`test-symlinks`).
- **Dry-run mode**: The `--dry-run` flag shows what would be done without making filesystem changes, including hook execution previews and no state file writes (`test-sync-dry-run`, `test-hooks-dry-run`).
- **Interactive conflict resolution**: With `-i`, conflicts are presented one-by-one with a unified diff. The user can choose `[t]arget`, `[s]ource`, `[x]skip`, or `[q]uit`. Non-conflict files are also interactively processed (`test-interactive-resolve`).
- **Watch mode**: With `-w`, the tool watches source and target directories for changes using inotify, re-running sync when files change (`test-watch`, `test-hooks-watch`).
- **Permission mismatch detection (root)**: As root, chmod and chown are actually applied to target files. Directories are not updated, only regular files (`test-root-permissions-enforced`, `test-root-no-permissions`).
- **Permission mismatch detection (non-root)**: As a non-root user, mismatches between actual and configured permissions/owner produce warnings but no filesystem changes (`test-permission-warning`).
- **Hooks execution**: `hooks.after` runs after `CopyToTarget` operations complete. Hook ownership and security checks vary by context: hooks run as the configured owner when root (`test-hooks-root-configured-owner`), as the config file owner when root with no configured owner (`test-hooks-root-config-owner`), are skipped with a warning when non-root with a configured owner (`test-hooks-nonroot-owner`), are not triggered by `CopyToSource` operations (`test-hooks-not-run-on-copy-to-source`), are skipped when no files changed (`test-hooks-unchanged`), and respect the working directory (`test-hooks-working-directory`).
- **Security confirmation (root with non-root-owned config)**: When running as root with a config file not owned by root, operations on target paths the config owner cannot write to require confirmation in interactive mode or are skipped with a warning in non-interactive mode. Hooks also require security confirmation when their effective owner differs from the config file owner. Covered by 7 test scenarios in `test-security-root-target-confirm`.
- **Status short format**: The `status --short` flag shows a compact representation: `→` for source-to-target, `←` for target-to-source, `↯` for conflicts, `↺` for state updates, and `✓` when all files are clean. Zero counts are omitted (`test-status-short`).
- **Schema output**: The `schema` command prints config schema documentation (`test-schema-json`).
- **Relative path resolution**: Source and target directories specified as relative paths in the config are resolved relative to the config file's location (`test-relative-paths`).
- **Tilde expansion**: Paths starting with `~` are expanded to the user's home directory (`test-resolve-tilde`).
- **Debug output**: The `--debug` flag prints detailed scan information including patterns and matched paths (`test-debug-flag`).
- **Content-based change detection**: When mtimes differ on only one side but the file contents are identical (e.g., file was touched but not modified), no copy change is emitted. Also, identical untracked files on both sides are skipped rather than flagged as conflicts (`test-status-unchanged-content`, `test-unchanged-skip`, `test-identical-untracked`).
- **Chown on source files**: When running as root, files copied from target to source get their owner set according to the configured glob's owner field (`test-chown`, `test-copy-to-source-owner`).
- **Delete operations**: Files removed from source are deleted from target and vice versa, with proper state cleanup (`test-delete-from-target`, `test-delete-from-source`).

### What the algorithm describes that the implementation does NOT yet cover

- **Step 4 — Validate action feasibility**: The algorithm describes a validation step (4) that checks whether each action can actually be performed before execution (write permissions on state file, parent directory creation, correct permissions/owner on existing parent directories, file writability, ability to set owner, etc.). This step is not implemented — the code goes directly from classification (step 3) to execution (step 5).
- **Hash includes permissions and owner**: Section 2.1 describes the state hash as computed from file contents, permissions, and owner. The current implementation (`compute_file_hash` in `changes.rs:356` and `compute_file_hash_for_state` in `sync.rs:703`) computes XXH3_128 over file contents only.
- **Permission preset mappings**: The `PermissionPreset` enum (`private`, `shared`, `group`, `group-read`, `public`) is deserialized from config and stored in `ResolvedGlob` as `file_perms` and `dir_perms`, but the mapping logic (e.g., 644 → 600 for `private`) is never applied at runtime. Only raw octal `permissions` fields are used.
- **Deviating directories validation**: The `deviating` field on sync groups is deserialized from config and stored in `ResolvedSyncGroup`, but the expected permissions and owner for these directories are never checked or enforced at runtime.
- **Target-to-source permission/owner validation before sync**: `permissions-and-owner.md` describes that before copying from target to source, the target file's permissions and owner must be validated against the configured values. If they don't match, the file should be skipped with a warning. This validation is not implemented — CopyToSource proceeds without checking target file permissions/owner.
- **Existing directories not updated with permissions/owner**: The algorithm says existing directories are NOT updated (only warning printed), but the current permission enforcement code in both `enforce_permissions_root` and `check_permissions_nonroot` restricts itself to `is_file()` and skips directories entirely — neither applying changes nor printing warnings about directory permission mismatches.
- **Security edge case — files without explicit owner in foreign-owned directories**: `permissions-and-owner.md` describes that a file without explicit owner configuration must never be copied into a directory owned by another user (treated as a write failure). This check is not implemented.