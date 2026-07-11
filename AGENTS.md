# AGENTS.md for cfgsync

## Project identity

- **Name**: `cfgsync` (crate name)
- **Version**: `0.4.1`
- **Rust edition**: 2024
- **Description**: Bidirectional config file sync tool. Keeps files in sync between a source directory (e.g.
  version-controlled dotfiles) and a target directory (e.g. `/etc`) using mtime-based state tracking. Supports conflict
  detection with interactive resolution, dry-run preview, diff output, and permission/ownership enforcement when run as
  root.
- **Repository format**: `https://github.com/nknapp/cfgsync`

## Commands

Always run from the workspace root (`/home/nils/projects/cfgsync`):

| Purpose    | Command                       |
|------------|-------------------------------|
| Build      | `cargo build --release --target x86_64-unknown-linux-musl` |
| Test       | `cargo test`                  |
| Format     | `cargo fmt`                   |
| Lint       | `cargo clippy -- -D warnings` |
| CI (check) | `mise run ci-check`           |
| Dev (all)  | `mise run all-local`          |

Rust toolchain: `1.96.0` (managed by mise). The `x86_64-unknown-linux-musl` target is required for static builds (`rustup target add x86_64-unknown-linux-musl`).

## Git workflow

**Never commit or push directly to `main`.** All changes must go through branches and pull requests.

When making changes, follow this branch-based workflow:

1. **Create a branch** — use a descriptive name (e.g. `feat/add-watch-mode`, `fix/state-rebuild-dup`).
2. **Work on the branch** — make all changes there.
3. **Commit** all changes to the branch. Write concise commit messages matching the repo's conventional commit style.
4. **Push** the branch to origin.
5. **Create a PR** — use `gh pr create` to open a pull request.

Run `mise run all-local` before pushing to ensure everything passes.

## Verification (mandatory)

After making any code changes, you MUST run the full verification as a single command:

```bash
mise run all-local
```

Running individual steps (cargo fmt, cargo clippy, cargo test, e2e-tests/run.sh) separately is NOT
sufficient — the all-local task may also run additional checks (like convco commit format checking) and
ensures everything works in the CI environment.

If all-local fails for environment reasons (e.g., GLIBC mismatch in Docker), that still counts as a
failure — the issue must be identified and reported, not worked around.

When an e2e test fails, the assertion output labels tell you which is which:

- `EXPECTED:` — the values the test expects cfgsync to produce
- `ACTUAL:` — the values cfgsync actually returned
- `[Diff] Actual / Expected` — the structured diff from the assertion library (red `-` = actual, green `+` = expected)

## Test discipline

When `mise run all-local` reports any test failure (unit or e2e), you MUST:
1. **Identify the root cause** — determine whether it's a genuine regression or a flaky test
2. **Fix it** — fix the test or the code, whichever is at fault
3. **Re-run** until all tests pass (0 failures required)
4. **Never dismiss** a failure as "pre-existing" or "flaky" — either fix it or ask for help if blocked

The all-local command MUST exit with code 0 and zero test failures before you consider the work done.

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

See [docs/algorithm/index.md](docs/algorithm/index.md) for the full algorithm specification, change classification
logic, and state file format.

- **`Change`** (enum): `CopyToTarget`, `CopyToSource`, `Conflict`, `DeleteTarget`, `DeleteSource`, `Cleanup` — each variant carries `group_index`.
- **`ResolvedConfig`**: `config_dir`, `sync_groups: Vec<ResolvedSyncGroup>`, `state_path`
- **`ResolvedSyncGroup`**: `source_dir`, `target_dir`, `globs: Vec<ResolvedGlob>`, `hooks`, `deviating`
- **`ResolvedGlob`**: `pattern` (compiled glob), `file_perms`, `dir_perms`, `owner`

### Data flow: `cfgsync sync config.toml`

```
load_config(path)        → read/parse TOML, resolve paths, validate directories + globs
State::load(state_path)  → read state file (or empty state on first run)
changes::classify()      → scan source + target dirs, classify each path → Vec<Change>
sync::run()              → handle conflicts, execute copies/deletes, enforce permissions,
                            run post-copy hooks for groups with CopyToTarget operations,
                            update + save state
```

## Testing

- **Framework**: plain `#[test]` — `rstest` and `pretty_assertions` are in `Cargo.toml` dev-deps but **not used** (
  removable dependency debt).
- **Location**: `#[cfg(test)] mod tests` blocks at the bottom of each source file. No `tests/` directory. All unit
  tests.
- **Pattern**: Use `tempfile::TempDir` for filesystem tests. Write TOML configs as strings. Call `File::set_modified()`
  to control mtimes in classification tests.
- **Total**: 52 tests across `config.rs` (22), `state.rs` (6), `changes.rs` (16), `sync.rs` (8).
- **Gaps**: No test for `diff::print_diffs`, `status::print_status`, or interactive mode.

### E2E tests

Located in `e2e-tests/`. Tests are written as Deno TypeScript files (`test-*.test.ts`), discovered and run by
`deno test`. Each test file is a self-contained scenario that sets up temporary source/target directories, writes config
files, runs `cfgsync`, and asserts outcomes.

Run with:

```bash
cargo build --release
./e2e-tests/run.sh
```

The binary is auto-discovered from `target/release/` or `target/debug/`. Override with the `CFGSYNC` env var. Additional
arguments are forwarded to `deno test`.

Test files (35 total):
`basic-sync-to-target`, `basic-sync-to-source`, `conflict-detection`, `delete-from-target`, `delete-from-source`,
`permission-warning` (non-root), `status-unchanged-content`, `unchanged-skip`, `chown`, `copy-to-source-owner`,
`diff-conflict`, `identical-untracked`, `ignore-non-matching`, `multi-group-independent`, `multi-group-overlap`,
`multi-group-owner`, `multi-group-per-glob`, `per-glob-no-group-defaults`, `relative-paths`, `schema-json`,
`status-short`, `sync-dry-run`, `hooks`, `hooks-nonroot-owner`, `hooks-dry-run`, `hooks-watch`, `hooks-unchanged`,
`hooks-not-run-on-copy-to-source`, `security-root-target-confirm` (7 tests: confirm yes/no/quit,
not-triggered-by-root-config, triggered-by-group-writable, not-triggered-non-root, hook confirm yes/no/quit).

**Rule**: For every new feature, an e2e test must be added. The e2e test framework should not be changed without good
reason.

## Code conventions

- **Error handling**: All functions return `Result<T, String>` (string errors). `main.rs` prints errors to stderr and
  calls `process::exit(1)`. In `sync.rs`, copy/delete failures are **non-fatal** — printed as warnings, execution
  continues.
- **Config validation**: Eager / fail-fast in `load_config()` — filters must be non-empty, source_dir and target_dir
  must be existing directories, globs must compile.
- **Dead code**: `config_dir` and `glob` (string form) in resolved types have `#[allow(dead_code)]` — stored for future
  use.
- **Serialization**: Config is `Deserialize`-only. State is `Serialize + Deserialize`. Both TOML.
- **Mtimes**: Stored as `i64` Unix timestamps (seconds). `copy_file()` explicitly preserves source mtime on the
  destination after copy.

## State file format

Documented in [docs/algorithm/index.md](docs/algorithm/index.md#21-format-of-the-state-file).

## Edge cases and gotchas

- **Symlinks**: Preserved as symlinks during sync (the symlink target path is replicated). Symlink targets are tracked
  in the state file for change detection. Permission enforcement skips symlinks.
- **Root vs non-root**: Root applies `chmod` + `chown` after sync. Non-root only warns about permission/owner
  mismatches.
- **Dry-run**: No filesystem changes, no state save, no permission enforcement. Summary still prints counts.
- **Interactive (`-i`)**: `[s]ource [t]arget [x]skip [q]uit`. `q` aborts entire sync. Diff shows target→source.
  Non-conflict changes are also processed interactively (duplicated code between interactive and non-interactive paths).
- **File exists on both sides, never tracked** (`classify`): Compares byte contents. If identical → skip. If different →
  `Conflict`.
- **Content-based change detection**: When a tracked file's mtime differs on only one side, `classify` compares byte
  contents before emitting a copy change. If content is identical (e.g., file was touched but not modified), no change
  is emitted. This prevents `status` and `sync` from showing spurious copy operations.
- **State rebuilding bug**: If a file matches multiple filters, it may appear **twice** in the rebuilt state (
  `update_state` iterates filters then walkdir entries; `state.file.clear()` is called once at the top, not per-filter).
- **`Conflict` in `diff` command**: Cannot show an actual diff because the enum only stores `rel_path` (no absolute
  source/target paths).
- **`skipped_perms` counter**: Tracks both true permission skips AND copy/delete failures — misleading in the summary.
- **Hooks**: `hooks.after` on a sync group is a shell command run via `/bin/sh` after files are copied from source to
  target. Runs once per sync cycle (not per file). When running as root, switches to the group's configured owner (or
  config file owner if no owner set). When non-root with owner set, hook is skipped with a warning. Dry-run prints
  `[dry-run] would run hook: ...` without executing. Hook failures are non-fatal (warnings).
- **Security confirmation**: When running as root with a config file not owned by root (or group/other-writable
  even if root-owned), security checks apply per-operation. Groups with an `owner` configured always require
  `WarnOrPrompt` (chown is always privilege escalation). Groups without an `owner` use `ErrorSkip` — the config
  owner's Unix write access to the target path is checked; if absent, an error is printed and the file is skipped
  (no prompt). In interactive mode (`-i`), `WarnOrPrompt` shows a unified diff and prompts `[y]es [n]o [q]uit`;
  in non-interactive mode it warns and skips. `hooks.after` triggers security when the group's `owner` differs
  from the config file owner. Bypassed only when the config is root-owned AND not group/other-writable
  (`mode & 0o022 == 0`).

## Resources

- Config schema: `cfgsync schema` or read `src/schema_doc.toml`
- Algorithm: [docs/algorithm/index.md](docs/algorithm/index.md)
- Help: `cfgsync --help`, `cfgsync sync --help`, `cfgsync status --help`, `cfgsync diff --help`
- GitHub CLI: Use `gh` to get logs from GitHub workflow runs (e.g., `gh run list`, `gh run view`).
