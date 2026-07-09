# Permissions and owner

`cfgsync` does not only copy files, it also makes sure that the permissiosn and file owner are correct.  
Sometimes, this requires `chown` permissions (i.e., running as root).

## Permissions

Files in the target folder may have different permissions. This is configured on different levels:
Glob patterns and sync-groups can each have a `file_perms` and a `dir_perms` property with the following
values that each represent a mapping of permissions

| Name             | source-permissions | target-permissions |
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

## Target to source

Before syncing anything, the permissions and owner of the target file are validated. If they do not match the configured
permissions and owner, the whole file is skipped and a warning is printed. No content is copied, no state is updated.

> This will prevent the next source-to-target sync from overwriting the file, because cfgsync will treat that as a "conflict"
> if both sides have changed.

* The owner of new files, existing files, new directories and existing directories is always set to the owner of the config file.
* The permissions are set to 755 or 644 based on the target file/dir. 

