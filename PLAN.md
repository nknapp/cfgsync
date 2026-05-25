# cfgsync — Plan

Bidirectional file sync between a source directory and a target directory,
based on mtime. Intended for syncing configuration files checked into git with
their deployed locations on the same machine.

## CLI

```
cfgsync sync   <CONFIG> [-i|--interactive] [--dry-run]
cfgsync status <CONFIG>
cfgsync diff   <CONFIG>
```

- `<CONFIG>` is a required positional argument pointing to a `.toml` file.
- State file is derived from the config path: `/foo/bar.toml` → `/foo/bar.state`.

## Configuration file format (TOML)

```toml
source_dir = "./source"        # relative to config file's directory
target_dir = "/etc/somewhere"  # absolute or relative to config file

[[filter]]
glob = "**/*.conf"
permissions = 0o644            # optional
owner = "root:root"            # optional

[[filter]]
glob = "**/*.service"
permissions = 0o644
```

- All relative paths in the config (`source_dir`, `target_dir`) are resolved
  against the directory containing the config file.
- Config files always have a `.toml` extension.

## State file (TOML, auto-generated)

```toml
last_sync = "2026-05-25T10:30:00Z"

[[file]]
path = "nginx/nginx.conf"
source_mtime = 1716634200
target_mtime = 1716634200

[[file]]
path = "systemd/myapp.service"
source_mtime = 1716634200
target_mtime = 1716634200
```

- `last_sync`: ISO 8601 timestamp of the last successful sync.
- `file.path`: relative path within source/target directory tree.
- `source_mtime` / `target_mtime`: unix timestamps recorded at last sync for
  each tracked file.

## Project structure

```
cfgsync/
├── Cargo.toml
└── src/
    ├── main.rs       # CLI entry point (clap derive), dispatches subcommands
    ├── config.rs     # TOML config deserialization, path resolution
    ├── state.rs      # State file read/write
    ├── changes.rs    # File scanning + classification into Change variants
    ├── sync.rs       # Executes classified changes
    ├── status.rs     # Counts + prints changes by direction
    └── diff.rs       # Generates unified diffs for each pending change
```

## Module responsibilities

### `main.rs`
- Define CLI structure with clap derive macros.
- Three subcommands: `Sync`, `Status`, `Diff`, each taking `<CONFIG>` as a
  positional argument.
- `Sync` additionally takes `-i`/`--interactive` and `--dry-run` flags.
- Load config, then delegate to the appropriate module.

### `config.rs`
- Deserialize the TOML config file into a `Config` struct.
- Resolve `source_dir` and `target_dir` to absolute paths (relative to the
  config file's parent directory).
- Validate: both directories must exist and be directories; at least one filter
  must be present.
- `Filter` struct holds `glob`, optional `permissions` (u32, octal), optional
  `owner` (user:group string).

### `state.rs`
- Read/write the state file (TOML format) adjacent to the config file.
- `State` struct: `last_sync` (DateTime<Utc>), `files` (Vec<FileEntry>).
- `FileEntry`: `path` (String), `source_mtime` (i64), `target_mtime` (i64).

### `changes.rs`
- Scan `source_dir` and `target_dir` recursively using `walkdir`.
- For each directory, collect files whose relative path matches any filter glob.
- Build a set of discovered files: `{ rel_path -> (source_mtime?, target_mtime?, target_metadata?) }`.
- Join with state to classify each file into a `Change` variant:

  | Change variant | Condition |
  |---|---|
  | `CopyToTarget { rel_path, abs_src, abs_tgt }` | File exists on source, and either not in state (new), or source_mtime > state.source_mtime. The target side either lacks the file or has not been modified since last sync. |
  | `CopyToSource { rel_path, abs_src, abs_tgt }` | Mirror of above: file exists on target, and either not in state (new), or target_mtime > state.target_mtime. Source side unchanged. |
  | `Conflict { rel_path }` | File exists in both source and target, and both mtimes have advanced beyond their respective state mtimes (or either is new on both sides). |
  | `DeleteTarget { rel_path, abs_tgt }` | File was in state, now missing from source, still present in target. |
  | `DeleteSource { rel_path, abs_src }` | File was in state, now missing from target, still present in source. |
  | `Cleanup { rel_path }` | File was in state, now missing from both source and target. No action needed; just remove from state. |

- Symlinks are skipped (logged as warning).

### `sync.rs`
- Receive the list of classified changes.
- If any `Conflict` exists and `-i` was not passed: print all conflicts and
  abort (exit non-zero).
- If `Conflict` + `-i`: for each conflict, show a unified diff and prompt the
  user: `[s]ource [t]arget [q]uit`. Apply chosen version.
- Execute non-conflict changes in order:
  1. `CopyToTarget`: create parent dirs if needed, copy file, set mtime.
  2. `CopyToSource`: same as above, reversed.
  3. `DeleteTarget`: remove file from target.
  4. `DeleteSource`: remove file from source.
  5. `Cleanup`: no filesystem action.
- **Permission failure handling**: if a copy or delete fails due to filesystem
  permissions (e.g. cannot write to target dir as non-root), skip that file,
  print a warning, and continue. Do not abort the entire sync.
- After all successful copies to target: enforce permissions/owner from filter
  config.
  - If running as root (uid 0): apply `chmod` and `chown`.
  - If non-root: skip enforcement for any file that doesn't match, print a
    warning (the copy already succeeded with default permissions).
- Print summary: X copied source→target, Y copied target→source, Z deleted
  from target, W deleted from source, N skipped (permission errors).
- Save state file with updated `last_sync` and file entries (only for
  successful operations).

### `status.rs`
- Same scanning + classification as `sync`, but no filesystem changes.
- Print grouped counts:
  ```
  source → target: 3
  target → source: 1
  conflicts:        2
  deletions target: 0
  deletions source: 1
  ```

### `diff.rs`
- Same scanning + classification as `sync`, but no filesystem changes.
- For each change that involves file content (CopyToTarget, CopyToSource,
  Conflict), generate and print a unified diff between the current source
  and target versions.
- For `DeleteTarget`/`DeleteSource`: print the path and "would be deleted".

## Sync algorithm (step by step)

1. Parse CLI args → config path.
2. Parse config file (`config.rs`).
3. Resolve source_dir and target_dir to absolute paths.
4. Derive state path from config path (`config.toml` → `config.state`).
5. Load state if it exists, otherwise use empty state.
6. Scan source_dir for files matching any filter glob.
7. Scan target_dir for files matching any filter glob.
8. Build a unified map of all relative paths from:
   - files found in source_dir
   - files found in target_dir
   - files recorded in state
9. For each path, classify into a `Change` variant using the rules in
   `changes.rs`.
10. If command is `status` → print counts and exit.
11. If command is `diff` → print diffs and exit.
12. If command is `sync`:
    a. Check for conflicts. If any exist and no `-i`: print and abort.
    b. Resolve interactive conflicts if `-i`.
    c. Execute file operations (copy, delete).
    d. Handle permissions (chmod/chown if root, else warn).
    e. Save state file.

## Dependencies

| Crate | Purpose |
|---|---|
| `clap` (derive feature) | CLI argument parsing |
| `serde` + `serde_derive` | Deserialization / serialization |
| `toml` | Config and state file format |
| `glob` | Glob pattern matching for filters |
| `walkdir` | Recursive directory traversal |
| `similar` | Unified diff generation |
| `chrono` | Timestamp handling (state file) |

## Edge cases to handle

| Case | Behavior |
|---|---|
| Empty filter list | Warn and exit, nothing to sync. |
| Missing source_dir | Error and exit. |
| Missing target_dir | Error and exit. |
| Symlinks | Skip them, log a warning. |
| First run (no state file) | Treat all matching files as "new" (CopyToTarget if only in source, CopyToSource if only in target, both copies if new in both → handled by classification). |
| File exists in both, neither modified | Skip. |
| File exists in both, source modified, target deleted and recreated | Target mtime > state.target_mtime → treat as target modified. The classification logic handles this correctly because it compares current mtime to state mtime, not to source mtime. |
| Permission/owner enforcement as non-root | Warn per-file, do not abort the whole sync. |
| Copy or delete fails due to filesystem permissions | Skip that file, print warning, continue with remaining files. |
| State file is corrupted / unreadable | Error and exit; suggest deleting the state file and re-syncing. |
| Concurrent modification during sync | Not addressed (out of scope — same machine, sequential). |
