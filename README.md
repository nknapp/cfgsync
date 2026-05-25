# cfgsync

Bidirectional config file sync.

`cfgsync` keeps configuration files in sync between a source directory (e.g. a version-controlled dotfiles repo) and a target directory (e.g. system paths like `/etc`). It uses modification time (mtime) comparisons to detect changes, supports conflict detection with interactive resolution, and can enforce file permissions and ownership when run as root.

## Installation

```bash
cargo install cfgsync
```

Or download a pre-built binary from the [releases page](https://github.com/nils/cfgsync/releases).

## Quick start

1. Create a config file, e.g. `myconfig.toml`:

    ```toml
    source_dir = "./dotfiles"
    target_dir = "/etc"

    [[filter]]
    glob = "**/*.conf"
    permissions = 0o644
    owner = "root:root"

    [[filter]]
    glob = "systemd/system/*.service"
    permissions = 0o644
    ```

2. Check what would change:

    ```bash
    cfgsync status myconfig.toml
    ```

3. Preview the actual diffs:

    ```bash
    cfgsync diff myconfig.toml
    ```

4. Sync:

    ```bash
    cfgsync sync myconfig.toml
    ```

## Usage

```
cfgsync sync   <CONFIG>  [OPTIONS]
cfgsync status <CONFIG>
cfgsync diff   <CONFIG>
```

### Subcommands

| Command  | Description |
|----------|-------------|
| `sync`   | Perform bidirectional sync. With `-i`, resolve conflicts interactively. With `--dry-run`, preview without writing files. |
| `status` | Print counts of pending changes (copy, delete, conflicts). |
| `diff`   | Print unified diffs for all pending changes. |

`<CONFIG>` is a required path to a TOML configuration file.

### Options for `sync`

| Flag          | Description |
|---------------|-------------|
| `-i`, `--interactive` | Prompt to resolve conflicts interactively (pick source or target version). |
| `--dry-run`   | Show what would be done without making changes. |

## Configuration

Config files use [TOML](https://toml.io). All relative paths in the config are resolved against the directory containing the config file.

### Options

| Field        | Required | Type   | Description |
|--------------|----------|--------|-------------|
| `source_dir` | yes      | path   | Source directory (e.g. your dotfiles repo). |
| `target_dir` | yes      | path   | Target directory (e.g. `/etc`, `~/.config`). |
| `[[filter]]` | yes      | array  | One or more filter blocks defining which files to sync. |

### Filter options

| Field         | Required | Type    | Description |
|---------------|----------|---------|-------------|
| `glob`        | yes      | string  | Glob pattern matching file paths relative to source/target (e.g. `**/*.conf`). |
| `permissions` | no       | int     | Octal Unix permissions to enforce on target files (e.g. `0o644`). |
| `owner`       | no       | string  | `user:group` ownership to enforce on target files (e.g. `root:root`). Only applied when running as root. |

### Example

```toml
source_dir = "./dotfiles"
target_dir = "/etc"

[[filter]]
glob = "**/*.conf"
permissions = 0o644
owner = "root:root"

[[filter]]
glob = "**/*.service"
permissions = 0o644
owner = "root:root"

[[filter]]
glob = "**/*"
```

## How it works

`cfgsync` maintains a `.state` file (TOML, stored next to your config file) that records each file's mtime at the last successful sync. On each run it:

1. Scans source and target directories for files matching any filter glob.
2. Compares current mtimes against the recorded state.
3. Classifies each file as a copy (source → target, or target → source), a conflict (both sides modified), a deletion, or unchanged.
4. If conflicts exist and `-i` is not passed, prints them and exits without making changes.
5. Copies, deletes, and enforces permissions/ownership as needed.
6. Saves the updated state.

Symlinks are skipped with a warning.

## Requirements

- Linux or macOS (uses Unix filesystem APIs).

## Build from source

```bash
cargo build --release
```

Rust 1.95+ required.
