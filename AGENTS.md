# AGENTS.md for cfgsync

## Project identity

- **Name**: `cfgsync` (crate name)
- **Version**: `0.1.0`
- **Rust edition**: 2024
- **Description**: Bidirectional config file sync tool. Keeps files in sync between a source directory (e.g. version-controlled dotfiles) and a target directory (e.g. `/etc`) using mtime-based state tracking. Supports conflict detection with interactive resolution, dry-run preview, diff output, and permission/ownership enforcement when run as root.
- **Repository format**: `https://github.com/<owner>/cfgsync` (update URL in `README.md`)

## Commands

Always run from the workspace root (`/home/nils/projects/sync`):

| Purpose     | Command                           |
|-------------|-----------------------------------|
| Build       | `cargo build --release`           |
| Test        | `cargo test`                      |
| Format      | `cargo fmt`                       |
| Lint        | `cargo clippy -- -D warnings`     |
| CI (check)  | `mise run ci`                     |
| Dev (all)   | `mise run fmt-lint-test-build`    |

Rust toolchain: `1.95` (managed by mise).

## Architecture

```
main.rs        CLI entry point (clap derive). Dispatches: sync / status / diff / schema.
config.rs      TOML config deserialization, path resolution, validation.
state.rs       State file (TOML) read/write. Tracks mtimes of synced files.
changes.rs     Scans source + target dirs and classifies files into Change variants.
sync.rs        Executes classified changes: copy, delete, permissions, interactive conflict resolution.
status.rs      Prints change count summary.
diff.rs        Prints unified diffs for pending changes.
schema.rs      Prints config schema documentation (embedded TOML with comments).
schema_doc.toml  LLM-readable config reference, embedded via include_str!.
```

### Key types

- **`Change`** (enum): `CopyToTarget`, `CopyToSource`, `Conflict`, `DeleteTarget`, `DeleteSource`, `Cleanup`
  - `CopyToTarget`/`CopyToSource` carry `abs_src` and `abs_tgt` paths
  - `Conflict` only carries `rel_path` (no absolute paths — diffs can't be shown)
  - `DeleteTarget` means: delete from **target** (file gone from source)
  - `DeleteSource` means: delete from **source** (file gone from target)
- **`ResolvedConfig`**: `config_dir`, `source_dir`, `target_dir`, `filters`, `state_path`
- **`ResolvedFilter`**: `glob` (string), `pattern` (compiled glob `Pattern`), `permissions` (optional `u32` octal), `owner` (optional `"user:group"`)
- **`State`**: `last_sync: DateTime<Utc>`, `file: Vec<FileEntry>`
- **`FileEntry`**: `path: String`, `source_mtime: i64`, `target_mtime: i64`

### Data flow: `cfgsync sync config.toml`

```
load_config(path)        → read/parse TOML, resolve paths, validate directories + globs
State::load(state_path)  → read state file (or empty state on first run)
changes::classify()      → scan_dir(source), scan_dir(target), classify each path → Vec<Change>
sync::run()              → handle conflicts, execute copies/deletes, enforce permissions, update + save state
```

## Testing

- **Framework**: plain `#[test]` — `rstest` and `pretty_assertions` are in `Cargo.toml` dev-deps but **not used** (removable dependency debt).
- **Location**: `#[cfg(test)] mod tests` blocks at the bottom of each source file. No `tests/` directory. All unit tests.
- **Pattern**: Use `tempfile::TempDir` for filesystem tests. Write TOML configs as strings. Call `File::set_modified()` to control mtimes in classification tests.
- **Total**: 21 tests across `config.rs` (6), `state.rs` (3), `changes.rs` (8), `sync.rs` (4).
- **Gaps**: No test for `diff::print_diffs`, `status::print_status`, or interactive mode.

### E2E tests

Located in `e2e-tests/`. Each subdirectory is a self-contained test with `config.toml`, `source/`, `target/`, and a `test.sh` script. Run with:

```bash
cargo build --release
./e2e-tests/run.sh [path-to-cfgsync-binary]
```

Tests: `basic-sync-to-target`, `basic-sync-to-source`, `conflict-detection`, `delete-from-target`, `delete-from-source`, `permission-warning` (non-root), `unchanged-skip`.

## Code conventions

- **Error handling**: All functions return `Result<T, String>` (string errors). `main.rs` prints errors to stderr and calls `process::exit(1)`. In `sync.rs`, copy/delete failures are **non-fatal** — printed as warnings, execution continues.
- **Config validation**: Eager / fail-fast in `load_config()` — filters must be non-empty, source_dir and target_dir must be existing directories, globs must compile.
- **Dead code**: `config_dir` and `glob` (string form) in resolved types have `#[allow(dead_code)]` — stored for future use.
- **Serialization**: Config is `Deserialize`-only. State is `Serialize + Deserialize`. Both TOML.
- **Mtimes**: Stored as `i64` Unix timestamps (seconds). `copy_file()` explicitly preserves source mtime on the destination after copy.

## State file format

```toml
last_sync = "2026-05-25T10:30:00Z"

[[file]]
path = "nginx/nginx.conf"
source_mtime = 1716634200
target_mtime = 1716634200
```

- Location: `<config_path>.cfgsync.state` (same directory, `.cfgsync.state` extension)
- `source_mtime` / `target_mtime`: `0` if file did not exist on that side
- First run (no file) → `State::empty()` (empty file list)
- Corrupted state file → fatal error with suggestion to delete and re-sync
- After each sync, state is rebuilt from scratch by re-scanning the source directory

## Edge cases and gotchas

- **Symlinks**: Always skipped with a stderr warning. No option to follow them.
- **Root vs non-root**: Root applies `chmod` + `chown` after sync. Non-root only warns about permission/owner mismatches.
- **Dry-run**: No filesystem changes, no state save, no permission enforcement. Summary still prints counts.
- **Interactive (`-i`)**: `[s]ource [t]arget [x]skip [q]uit`. `q` aborts entire sync. Diff shows target→source. Non-conflict changes are also processed interactively (duplicated code between interactive and non-interactive paths).
- **File exists on both sides, never tracked** (`classify`): Compares byte contents. If identical → skip. If different → `Conflict`.
- **State rebuilding bug**: If a file matches multiple filters, it may appear **twice** in the rebuilt state (`update_state` iterates filters then walkdir entries; `state.file.clear()` is called once at the top, not per-filter).
- **`skipped_perms` counter**: Tracks both true permission skips AND copy/delete failures — misleading in the summary.
- **`Conflict` in `diff` command**: Cannot show an actual diff because the enum only stores `rel_path` (no absolute source/target paths).

## Resources

- Config schema: `cfgsync schema` or read `src/schema_doc.toml`
- Help: `cfgsync --help`, `cfgsync sync --help`, `cfgsync status --help`, `cfgsync diff --help`
- Design doc: `PLAN.md`
- Prompts history: `prompts/`
