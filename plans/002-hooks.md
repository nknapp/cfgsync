# Hooks

## Summary

As a cfgsync user, I want to configure shell commands (hooks) that execute after files are synced from source to target, so that I can automatically restart or reload services (e.g., nginx, systemd) when their configuration files change.

## Status

open

## Edge Cases

- **Empty/whitespace-only hook command**: Should be treated as "no hook" — silently skip.
- **Hook command not found**: `/bin/sh` prints "command not found" to stderr and exits with 127. cfgsync warns and continues.
- **Hook command returns non-zero**: Warn with exit code, increment failure counter, continue sync.
- **Hook killed by signal**: `/bin/sh` exits with 128+signal. Treated same as non-zero exit (no exit code available, report "terminated by signal").
- **No CopyToTarget in a group**: Hook does NOT execute (the user intends "after files are copied").
- **Multiple groups with hooks, only some have CopyToTarget**: Only groups with at least one CopyToTarget execute their hook.
- **Hook in interactive mode**: Conflict resolutions that choose "keep source" count as CopyToTarget → hook runs for that group.
- **Hook in dry-run mode**: Print `[dry-run] would run hook: <command>` but do not execute. No child process spawned.
- **Non-root + group has owner set**: Hook is SKIPPED entirely (a warning is emitted). The reasoning: without root, ownership cannot be enforced, so restarting a service that expects a specific owner could be dangerous.
- **Non-root + no owner set**: Hook runs as the current (non-root) user without any user switching.
- **Root + owner specified but user/group lookup fails**: Warn and skip hook. Do not fall back to running as current user.
- **Root + no owner specified → run as config file owner**: If config file metadata can't be read, warn and skip hook.
- **Root + user switching**: Uses `std::os::unix::process::CommandExt::uid()` / `gid()` (no fork+setuid needed). If the target uid/gid is the same as the current process, no switching happens (no-op).
- **Hook modifies files tracked by cfgsync**: Fine — state is rebuilt from filesystem AFTER hooks execute, so any mtime changes caused by the service restart are correctly captured.
- **Concurrent hook output**: Hook stdout/stderr are inherited from the parent process — they appear interleaved with cfgsync's own output in real time.
- **Watch mode**: Watch mode (`--watch`) calls `sync::run()` on every cycle, so hooks execute automatically. Initial sync always runs hooks. Subsequent cycles run hooks only if files were copied to target in that cycle. Debouncing (1s) means rapid changes batch into one hook execution per group. Not an edge case per se — just automatic compatibility — but worth an e2e test to verify the initial sync + a follow-up change both trigger hooks.

## Tasks

- [ ] **Add `HooksConfig` struct and integrate into config pipeline** (`src/config.rs`)
  - Add `#[derive(Debug, Deserialize, Clone, JsonSchema)] pub struct HooksConfig { pub after: Option<String> }`
  - Add `#[serde(default)] pub hooks: HooksConfig` field to `SyncGroup`
  - Add `pub hook_after: Option<String>` field to `ResolvedSyncGroup`
  - In `load_config()`, pass through: `hook_after: group.hooks.after.clone()`
  - Add unit tests: config with `hooks = { after = "..." }`, config with no hooks, config with empty after string

- [ ] **Add `resolve_owner_uid_gid()` helper and refactor `apply_chown()`** (`src/sync.rs`)
  - Extract owner-spec parsing (split on `:`, user/group lookup) from `apply_chown()` into a new `fn resolve_owner_uid_gid(owner_spec: &str) -> Result<(Option<Uid>, Option<Gid>), String>`
  - Rewrite `apply_chown()` to call `resolve_owner_uid_gid()` and then `nix::unistd::chown()`
  - This avoids duplicating the same parsing logic for hook user-switching

- [ ] **Implement hook execution in sync loop** (`src/sync.rs`)
  - Add `hook_failures: usize` field to `SyncOutcome`
  - During the change-processing loops (both non-interactive and interactive), collect `group_index` into a `HashSet<usize>` whenever a `CopyToTarget` is successfully executed. For conflicts resolved to `t` (keep source → copy source to target), also insert the `group_index`.
  - After permission enforcement (`enforce_permissions_root` / `check_permissions_nonroot`) and before state update, iterate groups in the set and call `run_hook_for_group()`.
  - In dry-run mode: skip the `if !dry_run` block entirely but still iterate the set to print `[dry-run] would run hook: <command>`.
  - Print `running hook: <command>` before execution.
  - Hook failures are non-fatal: print `Warning: hook '<command>' exited with code N` (or `terminated by signal`) and increment `outcome.hook_failures`.
  - Add `hook_failures` line to summary output (only when > 0).
  - **Watch mode**: No additional code needed — `watch.rs:run_sync_cycle()` calls `sync::run()`, so hooks fire automatically on every sync cycle. Initial sync always triggers hooks; debounced follow-up cycles trigger hooks only if files were copied to target.

- [ ] **Implement `execute_hook()` function** (`src/sync.rs`)
  - Signature: `fn execute_hook(hook_cmd: &str, config: &ResolvedConfig, group_index: usize) -> Result<(), String>`
  - Use `std::process::Command::new("/bin/sh").arg("-c").arg(hook_cmd)` — do NOT configure stdout/stderr so they inherit from the parent (pass-through behavior).
  - If `is_root()`:
    - Resolve target uid/gid: if group.owner is set → use `resolve_owner_uid_gid()`; else → stat `config.config_path` and use its uid/gid via `nix::unistd::Uid::from_raw()` / `Gid::from_raw()`.
    - Apply uid/gid via `std::os::unix::process::CommandExt::uid()` / `gid()`.
  - Call `cmd.status()` and check exit status. Return `Ok(())` on success, `Err(...)` with exit code or "terminated by signal" on failure.
  - Edge cases handled: no user switching when non-root, graceful failure on user lookup errors.

- [ ] **Update config schema documentation** (`src/schema_doc.toml`)
  - Add `hooks = { after = "systemctl reload nginx" }` as a commented example line in the `[[sync]]` block.

- [ ] **Add unit tests** (`src/sync.rs`, `src/config.rs`)
  - `config.rs`: test `load_config` with `hooks = { after = "echo hello" }` → `ResolvedSyncGroup.hook_after == Some("echo hello")`
  - `config.rs`: test `load_config` without hooks → `hook_after == None`
  - `config.rs`: test `load_config` with `hooks = {}` → `hook_after == None`
  - `sync.rs`: test `execute_hook` with `/bin/true` → `Ok(())`
  - `sync.rs`: test `execute_hook` with `/bin/false` → `Err(...)` containing exit code
  - `sync.rs`: test `execute_hook` with nonexistent command → `Err(...)` containing spawn error
  - `sync.rs`: test `run_hook_for_group` is skipped when non-root and group.owner is set (mock `is_root()` if possible, or test the gate condition indirectly)

- [ ] **Add e2e test: basic hook execution** (`e2e-tests/test-hooks.test.ts`)
  - Set up source file, config with `hooks = { after = "touch ./target/hook-ran" }` (relative path works since `cwd` is the temp dir)
  - Run `cfgsync --config config.toml sync`
  - Assert `target/hook-ran` marker file exists
  - Assert exit code 0, stdout contains `running hook:` and `copied ... -> target`, no hook errors

- [ ] **Add e2e test: hook skipped when non-root with owner** (`e2e-tests/test-hooks-nonroot-owner.test.ts`)
  - Set up source file, config with `owner = "root:root"` and `hooks = { after = "touch ./target/hook-ran" }`
  - Run without `sudo: true` (i.e., as non-root)
  - Assert `target/hook-ran` does NOT exist
  - Assert stderr contains warning about skipping hook
  - Assert exit code 0 (sync completes without error)

- [ ] **Add e2e test: hook in dry-run mode** (`e2e-tests/test-hooks-dry-run.test.ts`)
  - Set up source file, config with `hooks = { after = "echo hello" }`
  - Run `cfgsync --config config.toml sync --dry-run`
  - Assert stdout contains `[dry-run] would run hook: echo hello`
  - Assert the hook was NOT actually executed (no "hello" in output — or use a marker-file approach instead of echo)

- [ ] **Add e2e test: hooks in watch mode** (`e2e-tests/test-hooks-watch.test.ts`)
  - Set up source file, config with `hooks = { after = "touch ./hook-initial-ran" }`. Hook touches different marker files based on `__CYCLE__` to distinguish initial vs subsequent runs. Alternative: use a hook that appends to a log file and check its line count.
  - Spawn `cfgsync --config config.toml sync --watch` (long-running process)
  - Wait for `Running initial sync!` and `Done!` on stderr (pattern from watch output)
  - Assert `hook-initial-ran` marker file exists (hook fired on initial sync)
  - Modify source file to trigger a re-sync cycle, wait for hook marker file (or log line) from the second cycle
  - Stop the process, verify both initial and follow-up hook executions
  - Follows the same `testBed.spawn()` + `child.waitForStderr()` pattern as existing watch e2e tests

- [ ] **Update `AGENTS.md`**
  - Add `hooks` to the data flow description: mention that after permission enforcement, hooks run for groups with CopyToTarget operations
  - Add `hook_after: Option<String>` to the `ResolvedSyncGroup` field listing
  - Add a line about hooks in the "Edge cases and gotchas" section: non-root + owner skips hooks
  - Increment version if needed (already at 0.4.0 in Cargo.toml, AGENTS.md says 0.3.0 — fix AGENTS.md to 0.4.0)

- [ ] **Update `README.md`**
  - Add `hooks` row to the Sync group options table: `hooks.after` — optional string, shell command run via `/bin/sh` after files are copied from source to target
  - Add a subsection under "Sync execution flow" documenting hook execution order (after permission enforcement, before state save) and user-switching behavior
  - Add note that hooks are skipped during dry-run

## Findings

<!-- Discovered during implementation. Leave empty initially. -->
