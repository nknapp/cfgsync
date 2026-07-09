# Sync Algorithm

This is a description of the algorithm that cfgsync uses to synchronize two directories

## High level overview

`cfgsync` performs the following steps to run the algorithm

1. Load config
2. Load state
3. Find and classify changes
4. Execute changes
5. Run hooks

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

The files in the source directory always belong to the owner of the config file.
The permissions are always 755 for directories and 644 for regular files or 755 for files.

Owner and permission for files in the target directory are derived from the config
and from the source file.

If optional values are missing, the following fallbacks apply: The first existing value is used:

* The perms or owner defined at the glob pattern
* The perms or owner defined at the sync group
* base defaults:
    * owner: the owner of the config file
    * directory permissions "755"
    * file permissions: "644" or "755" depending on the source file

For the deviating directories the fallback is similar:

* The value that is defined in the "deviation list"
* The perms or owner defined at the glob pattern
* The perms or owner defined at the sync group
* base defaults:
    * owner of the source files
    * "755" for directory permission
    * "644" for file permissions
    * TODO: Symlinks?

> Note: Directory permissions and owner are never adjusted in a sync. They are only validated or used when creating
> new directories (see "Execute changes")

# 2. Load state

The path to the state file is derived from the config file by removing the `.toml` from the
name and then adding `.cfgsync.state`.
It contains

* A timestamp of the last sync
* A list of files involved in the last sync, consisting of their
    * path
    * sync_group (for stability, the target directory is used to indicate the sync group)
    * one timestamp of the last sync
    * a hash of the file (XXH3_128) at the time of the last sync. The hash is based on
        * the contents of the file in the target directory after the sync
        * the permission of the file in the target directory after the sync
        * the owner of the file in the target directory after the sync

If there is no state-file yet, every file is assumed to be new.

# 3. Find and classify files

* This step first scans the files matching the globs in the source and target directory as well as the ancestor
  directories.
* Verify that every source and target file was found by no more than one sync group. If a file is in multiple
  sync groups write an error message and exit immediately.
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

* `is_changed(file)` is an abbreviation for `file.mtime > state.last_sync && file.hash != state.hash`
* `is_unchanged(file)` is an abbreviation for `file.mtime == state.last_sync || file.hash == state.hash`

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
        if is_unchanged(target):
            return "DeleteTarget"
        else:
            return "Conflict"
    elif target is None:
        if is_unchanged(source):
            return "DeleteSource"
        else:
            return "Conflict"
    # Check for changed files
    else:
        if is_unchanged(source) and is_unchanged(target):
            return "Skip"
        elif is_changed(source) and is_unchanged(target):
            return "CopyToTarget"
        elif is_changed(target) and is_unchanged(source):
            return "CopyToSource"
        else source.hash == target.hash:
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
* `Skip`
    * Nothing to check
* `Conflict`:
    * Check if any of `CopyToTarget` or `CopyToSource` are feasable.

# 4. Execute changes

### 4.1 Command: `status`

Show number of files in the following categories

| Long                   | Short | Count computed via number of     |
|------------------------|-------|----------------------------------|
| source to target:      | →     | `CopyToTarget` +  `DeleteTarget` |
| target to source:      | ←     | `CopyToSource` + `DeleteSource`  |
| conflict:              | ↯     | `Conflict`                       |
| state update required: | ↺     | `UpdateState`                    |
| clean:                 |       | `Skip`                           |

In the short form, only value `>0` are shown, "clean" is omitted (e.g., 3→ 2← 1↯ ↺2)
If all files are "clean", show a `✓`.

### 4.2 Command: `diff`:

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


### 4.3 Command: `sync`

For each file, perform this action

* `UpdateState`
    * Ensure that a state entry for the path exists with the hash.
    * Update the mtime of both files to the current timestamp and set this time in the state as well
* `CopyToTarget`
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
* `Skip`
    * Do nothing
* `Conflict`:
    * if cli option `-i` is active:
      * Show the same diff as in 4.2 (for conflicts))
      * Show `Overwrite [t]arget   Overwrite [s]ource   [x]skip  [q]uit:`
      * Perform `CopyToTarget`, `CopyToSource` or nothing, based on the user's choice
    * else
      * skip 

If conflicts were found print 

```
Conflicts detected (N files):
<rel_path_1>
<rel_path_2>
...
Aborting due to N conflict(s). Use -i/--interactive to resolve.
```


