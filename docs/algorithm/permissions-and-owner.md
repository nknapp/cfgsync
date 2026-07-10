# Permissions and owner

`cfgsync` does not only copy files, it also makes sure that the permissions and file owner are correct.
This document describes the logic behind syncing permissions and owner

## Permissions

Files in the source folders always have one of the following permissions

* Directories: 755
* Symlinks: 755 (macOS), 777 (linux)
* Regular files: 644
* Executable files: 755

Files in the target folder may have different permissions. This is configured on different levels:
Glob patterns and sync-groups can each have a `file_perms` and a `dir_perms` property with the following
values that each represent a mapping of permissions. The following values are allowed:

| Value            | source-permissions | target-permissions |
|------------------|--------------------|--------------------|
| private          | 644                | 600                |
|                  | 755                | 600                |
| shared           | 644                | 664                |
|                  | 755                | 775                |
| group            | 644                | 660                |
|                  | 755                | 770                |
| group-read       | 644                | 640                |
|                  | 755                | 750                |
| public (default) | 644                | 644                |
|                  | 755                | 755                |

The order of preference is

1. Value in the glob pattern
2. Value in the sync group
3. Default (`public`)

The mapping is applied in both directions.

## Owner

The owner can also be configured for glob patterns and sync groups.
The order of preference is the same.
If no owner is specified, the default is the owner of the config file.

## Source to target

When copying files from source to target

* New files, existing files and new directories are updated with the configured owner and permissions
* Existing directories are NOT updated. If the owner or permissions do not match, a warning is printed. The warning
  contains details about what values are found and expected.
* New symlinks and existing symlinks are updated with the configured owner and permissions if os restrictions allow it.
  On Linux, symlinks always have 777, so updating the permissions is not even attempted.
  

### Edge case

* A file or directory without explicit owner configuration is never copied into a directory owned by another user.
  This case is treated the same as a failure to write into that directory.

> This is a security feature: We need to prevent accidential creation of user-writable config files in places
> where the user cannot write. If it is necessary to create such a file, the owner can be set explicitely in the 
> configuration.


## Target to source

Before syncing anything, the permissions and owner of the target file are validated. If they do not match the configured
permissions and owner, the whole file is skipped and a warning is printed. No content is copied, no state is updated.

> The goal is to force the user to fix the issue manually in the config and not make assumptions about resolutions.
> Since the hash is computed from "owner", "permissions" and "content", it will be different from the hash in the state.
> If the source file is now also changed, it will be shown as a conflict.
> Changing permissions is potentially dangerous, so the user must be conscious about it.

* The owner of new files, existing files, new directories and existing directories is always set to the owner of the
  config file.
* The permissions are determined by reversing the configured mapping to the original 644 or 755 permissions.


