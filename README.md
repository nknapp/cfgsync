# cfgsync

Bidirectional config file sync.

> **Warning:** This project was vibe coded and is not thoroughly tested. Use at your own risk.
> If you want to assess for yourself, look at the e2e-tests which use cases are covered.

`cfgsync` keeps configuration files in sync between a source directory (e.g. a version-controlled dotfiles repo) and a
target directory (e.g. system paths like `/etc`). It uses modification time (mtime) comparisons to detect changes,
supports conflict detection with interactive resolution, and can enforce file permissions and ownership when run as
root.

## Installation

There are two ways of installing cfgsync:

Use [mise](https://mise.jdx.dev):

```bash
mise use github:nknapp/cfgsync
```

Or download a pre-built binary from the [releases page](https://github.com/nknapp/cfgsync/releases).

## Usage

Create a config file, e.g. `myconfig.toml`:

```toml
[[sync]]
source = "./dotfiles"
target = "~"
globs = [
    ".zshrc",
    ".wezterm.lua",
    ".config/nvim/**/*",
    ".config/hypr/**/*",
]
```

Check what would change:

```bash
cfgsync status myconfig.toml
```

Preview the actual diffs:

```bash
cfgsync diff myconfig.toml
```

Sync:

```bash
cfgsync sync myconfig.toml
```

### Commands

Get help with `cfgsync --help` or `cfgsync <COMMAND> --help`

| Command  | Description                                                                                                              |
|----------|--------------------------------------------------------------------------------------------------------------------------|
| `sync`   | Perform bidirectional sync. With `-i`, resolve conflicts interactively. With `--dry-run`, preview without writing files. |
| `status` | Print counts of pending changes (copy, delete, conflicts).                                                               |
| `diff`   | Print unified diffs for all pending changes.                                                                             |
| `schema` | Print the config file schema as a commented TOML example.                                                                |

`<CONFIG>` is a required path to a TOML configuration file.

### Options for `sync`

| Flag                  | Description                                                                |
|-----------------------|----------------------------------------------------------------------------|
| `-i`, `--interactive` | Prompt to resolve conflicts interactively (pick source or target version). |
| `--dry-run`           | Show what would be done without making changes.                            |

## Configuration

Config files use [TOML](https://toml.io). All relative paths in the config are resolved against the directory containing
the config file. Tilde (`~` and `~/path`) is expanded based on the config file owner's home directory.

### Sync group options

| Field         | Required | Type   | Description                                                                                             |
|---------------|----------|--------|---------------------------------------------------------------------------------------------------------|
| `source`      | yes      | path   | Source directory (e.g. your dotfiles repo). Relative to config or absolute. Supports `~` expansion.     |
| `target`      | yes      | path   | Target directory (e.g. `/etc`). Relative to config or absolute. Supports `~` expansion.                 |
| `globs`       | yes      | array  | One or more glob entries defining which files to sync. Cannot be empty.                                 |
| `permissions` | no       | string | Default octal permissions as a string (e.g. `"644"`, `"0755"`). Applied to all globs unless overridden. |
| `owner`       | no       | string | Default `user:group` ownership (e.g. `root:root`). Only enforced when running as root.                  |
| `hooks.after` | no       | string | Shell command run via `/bin/sh` after files are copied from source to target. See [hooks](#hooks) below. |

### Glob entry formats

Each entry in `globs` can be either a plain glob string or a detailed object:

**Plain string:**

```toml
globs = ["**/*.conf"]
```

**Detailed object:**

| Field         | Required | Type   | Description                                                                                 |
|---------------|----------|--------|---------------------------------------------------------------------------------------------|
| `pattern`     | yes      | string | Glob pattern matching file paths relative to source/target (e.g. `**/*.conf`).              |
| `permissions` | no       | string | Octal permissions override for this glob (e.g. `"600"`). Overrides the group-level default. |
| `owner`       | no       | string | `user:group` ownership override for this glob. Overrides the group-level default.           |

### Example

Sync system configuration files to the root filesystem, and dotfiles to your home directory:

```toml
[[sync]]
source = "./global-config"
target = "/"
owner = "root:root"
hooks = { after = "systemctl daemon-reload" }
globs = [
    "etc/keyd/**",
    "etc/systemd/system/**",
    "usr/lib/systemd/system-sleep/tb-dock-recover.sh",
]

[[sync]]
source = "./home-config"
target = "~"
globs = [
    ".zshrc",
    ".wezterm.lua",
    ".aliases",
    ".config/hypr/**/*",
    ".config/nvim/**/*",
    ".config/waybar/**/*",
    ".config/mise/**/*",
    { pattern = ".ssh/config", permissions = "600" },
]
```

### Hooks

You can configure a shell command to run after files are copied from source to target using the `hooks.after`
field on a sync group. This is useful for restarting or reloading services when their configuration changes.

```toml
[[sync]]
source = "./global-config"
target = "/"
owner = "root:root"
globs = ["etc/systemd/system/**"]
hooks = { after = "systemctl daemon-reload" }
```

- The command is run via `/bin/sh -c`.
- It fires **once per sync cycle** (not per file) when at least one file was copied from source to target.
- It does **not** fire for files copied from target to source.
- **When running as root**: the command runs as the group's configured `owner` (if set), or falls back to the
  config file's owner.
- **When non-root with `owner` set**: the hook is **skipped** with a warning.
- **When non-root without `owner`**: the hook runs as the current user.
- **Dry-run mode**: prints `[dry-run] would run hook: <command>` without executing.
- **Watch mode**: hooks run automatically on every sync cycle, including the initial sync.
- Hook failures are **non-fatal** — a warning is printed and sync continues.

## Algorithm

`cfgsync` maintains a `.cfgsync.state` file (TOML, stored next to your config file) that records each file's mtime at
the last successful sync. This file is a local runtime artifact — add `*.cfgsync.state` to your `.gitignore`.

### Data flow

```
load_config(path)        → Parse TOML, resolve paths relative to config dir,
                            validate directories and globs, merge per-glob
                            permissions/owner with group defaults.
State::load(state_path)  → Read state file (or empty state on first run).
changes::classify()      → Scan source + target dirs per sync group,
                            compare against state → Vec<Change>.
sync::run()              → Handle conflicts, execute copies/deletes,
                            enforce permissions, rebuild + save state.
```

### Classification matrix

For each unique `(group_index, rel_path)` tuple found in source, target, or state, the classifier checks presence and
mtime changes:

| In source | In target | In state                        | Result       |
|-----------|-----------|---------------------------------|--------------|
| Yes       | Yes       | Yes (both mtimes unchanged)     | No change    |
| Yes       | Yes       | Yes (source mtime changed only) | CopyToTarget |
| Yes       | Yes       | Yes (target mtime changed only) | CopyToSource |
| Yes       | Yes       | Yes (both mtimes changed)       | Conflict*    |
| Yes       | Yes       | No (never tracked)              | Conflict*    |
| Yes       | No        | No (new file)                   | CopyToTarget |
| No        | Yes       | No (new file)                   | CopyToSource |
| Yes       | No        | Yes (deleted from target)       | DeleteSource |
| No        | Yes       | Yes (deleted from source)       | DeleteTarget |
| No        | No        | Yes (gone from both)            | Cleanup      |

\* *Conflict*: When both sides exist but differ, the classifier compares byte contents. If identical → skipped (no
change). If different → `Conflict`.

### Sync execution flow

1. If conflicts exist and `-i` is not passed, print them and abort.
2. **Security check**: If running as root with a non-root-owned config file and a root-owned target directory, print a
   notice and require per-operation confirmation (see [Security confirmation](#security-confirmation) above).
3. Execute copy/delete operations. Individual failures are non-fatal (warnings) — sync continues.
4. If `-i` (interactive): prompt user for each conflict. Options: `[s]ource` (keep source copy), `[t]arget` (keep target
   copy), `[x]skip`, `[q]uit` (abort entire sync). Non-conflict changes are also processed in the interactive path.
5. Enforce permissions and ownership on target files (root) or warn about mismatches (non-root).
6. Run `hooks.after` commands for any sync groups that had files copied to target. If the security check is active,
   each hook also requires confirmation.
7. Rebuild state by re-scanning the source directory, save to `.cfgsync.state`.
8. If root, chown the state file to match the config file's owner.

### Mtime handling

- Mtimes are stored as `i64` Unix timestamps (seconds). A value of `0` means the file did not exist on that side at the
  last sync.
- `copy_file` preserves the source file's mtime on the destination after copying.
- When running as root, `copy_file` also preserves the source file's uid/gid on the destination.

## Edge cases

### Symlinks

Symlinks are **preserved as symlinks** when syncing. If a source file is a symlink, the target will be created as a
symlink pointing to the same target path. Symlink targets are tracked in the state file and compared on subsequent
syncs. Permission enforcement (chmod/chown) skips symlinks, as these operations follow the link target on Linux.

### Glob overlapping

Within a single sync group, if a file matches **multiple globs**, `cfgsync` returns a configuration error. Each file
must match exactly one glob per group.

Across sync groups, if the same absolute file path (on either source or target side) matches globs in **two different
groups**, `cfgsync` returns an error. Each file must belong to exactly one group. Full paths are compared, not just
relative names.

Note: Two groups can target the same source/target directories as long as their globs don't overlap on the same files (
e.g., `*.conf` in group 1 and `*.txt` in group 2 on the same directory is fine).

### Identical files (byte-level comparison)

When a file exists on both sides but has **never been tracked** in the state file, `cfgsync` compares byte contents. If
identical, the file is silently skipped — no change is generated, even if mtimes differ. If different, it becomes a
`Conflict`.

### Config format migration

Old `source_dir`/`target_dir`/`[[filter]]` format is detected and rejected with an error pointing to the new `[[sync]]`
group syntax. Run `cfgsync schema` for an up-to-date example.

### State file backward compatibility

State files from older versions that lack the `group_index` field deserialize with `group_index = 0` (via
`#[serde(default)]`), maintaining backward compatibility.

### Corrupted state file

A corrupted state file produces a fatal error suggesting you delete it and re-sync. There is no recovery mechanism — the
state file is treated as a local cache.

### Permission/ownership enforcement

- **When root**: `chmod` and `chown` are applied to target files after sync. File ownership during copy is also
  preserved (source uid/gid → destination).
- **When non-root**: Only warnings are emitted. For permissions, actual vs. desired mode is compared and a warning is
  printed on mismatch. **For ownership, any glob with an owner set unconditionally warns** — the current owner is not
  compared against the desired one; a warning is always printed when non-root.
- Permissions/ownership are only checked for globs that actually specify them. Globs without `permissions` or `owner`
  are skipped entirely during enforcement/warning.

### `CopyToSource` owner handling

When a file is copied from target to source (non-interactive path or interactive "keep target"), and the tool runs as
root, `apply_source_owner` is called to re-chown the source file to match the group/glob's configured owner. This
ensures source files get the correct ownership even when populated from the target.

### Error handling during sync

Copy and delete failures are **non-fatal** — they produce stderr warnings and increment the `skipped_perms` counter. The
sync continues with the remaining files. This means:

- The `skipped_perms` counter in the summary includes both genuine permission/owner warnings **and** copy/delete
  failures. A copy failure will be counted as a "permission skip" in the output, which is misleading.
- The state file is only saved if the sync completes; partial progress is not persisted.

### State rebuilding

After sync, state is rebuilt from scratch by re-scanning the **source** directory (not the target). For each file found,
the target's mtime is also checked. Files found in neither source nor target are omitted from state. A deduplication
hashset prevents files matching multiple globs in the same group from appearing twice (though this should not happen
since within-group glob overlap is rejected during scanning).

### Empty sync groups

A sync group whose globs match zero files is valid and produces no changes. It is not an error.

### Dry-run mode

`--dry-run` skips all filesystem changes, state file writes, permission enforcement, and hook execution. The summary still prints counts
as if changes had been applied, and hooks are shown as `[dry-run] would run hook: <command>`. Conflicts are still detected and would still abort (unless `-i` is used).

### Interactive mode

In interactive mode (`-i`):

- The diff shown for conflicts is a **unified diff from target (old) to source (new)** — showing what changes if you
  choose to keep the source version.
- Pressing `q` aborts the entire sync immediately (remaining conflicts are not shown).
- Pressing `x` (or any other unrecognized input) skips the conflict and decrements the remaining conflict count.
- Non-conflict changes (copy, delete) are also processed during the interactive loop, with no user prompt.

### Security confirmation

When cfgsync runs as **root** with a config file that does **not** belong to root (or is group/other-writable even if
root-owned), and the sync target directory is owned by root, each `CopyToTarget` and `DeleteTarget` operation requires
explicit user confirmation. This prevents a non-root user who can write the config file from tricking root into
syncing files into root-owned system directories.

The prompt shows a unified diff of the change and offers `[y]es [n]o [q]uit`:

```
=== Security: syncing to root-owned target: etc/nginx/nginx.conf ===
@@ -1,5 +1,5 @@
-(file missing)
+server { ... }
...

[y]es [n]o [q]uit:
```

- `y` — proceed with this operation.
- `n` — skip this operation (no changes made).
- `q` — abort the entire sync.

The same rules apply to `hooks.after` commands — they also require confirmation when the target is root-owned:

```
=== Security: running hook on root-owned target ===
  hook: systemctl reload nginx

[y]es [n]o [q]uit:
```

The security prompt is **bypassed** only when the config file is:
- Owned by root (uid 0), **and**
- Not writable by group or other (mode `0o022` bits clear).

This means a config file like `root:root 0755` skips the prompt, but `root:root 0664` (group-writable) still triggers it.

### Permissions format

Permissions are specified as **octal strings** (e.g., `"644"`, `"0755"`) in the config TOML, not as Rust-style `0o644`
integers. Leading zeros are accepted. The octal string must contain only digits `0`–`7`.

## Requirements

- Linux or macOS (uses Unix filesystem APIs).

## Build from source

```bash
cargo build --release
```

Rust 1.95+ required.

### Known issues

* Symlink permissions are not adjusted on macOS (at least, this is not tested). On Linux this does not work anyway.