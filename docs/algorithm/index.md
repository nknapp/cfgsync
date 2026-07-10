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
* the contents of the file
* the permission of the file in the target directory after the sync, which is the same as the permissions of the source file
  after applying the [configured mapping rules](./permissions-and-owner.md#permissions)
* the owner of the file in the target directory after the sync, which is the same as the [configured owner](./permissions-and-owner.md#owner)
  for the source file.

# 3. Find and classify files

* This step first scans the files matching the globs in the source and target directory as well as the ancestor
  directories.
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