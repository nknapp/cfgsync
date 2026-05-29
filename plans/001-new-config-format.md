# New Configuration Format: `[[sync]]` groups

## Summary

As a dotfile user, I want to define multiple independent sync groups in a single config file so that I can manage files from different source directories, each with their own default permissions/ownership, without needing separate config files and separate cfgsync invocations.

## Status

open

## Design decisions

- **Clean break**: Only the new format is supported. Old configs produce a clear error.
- **String permissions**: Permissions are written as octal strings (`"644"`, `"755"`, `"600"`), parsed to `u32` at config load time. This avoids the `0o644` notation which is TOML-specific and unfamiliar.
- **JSON Schema output**: `cfgsync schema --json` outputs a machine-readable JSON Schema for the config format, auto-generated from the Rust structs using the `schemars` crate with `#[derive(JsonSchema)]`. The existing `cfgsync schema` (no flags) continues to print the human-readable TOML reference.
- **Overlap = error**: A file's relative path must not match globs from more than one sync group. Cross-group overlap is rejected during classification with a descriptive error.
- **Single state file, grouped entries**: `FileEntry` gains `group_index: usize`. State file is still one TOML file; entries are namespaced by group index.
- **Flat status/diff output**: Aggregated totals across all groups. No per-group headers.
- **Fix `Conflict` variant**: Add `abs_src`/`abs_tgt` to `Change::Conflict` so `diff` and interactive mode can show actual diffs.

## Edge Cases

- Old config format is used — must produce a clear error telling the user what changed.
- A sync group has an empty `globs` list.
- The config has zero `[[sync]]` sections.
- Two sync groups have overlapping globs that match the same relative path.
- A `[[sync]]` group points to a nonexistent source or target directory.
- A `[[sync]]` group matches zero files after glob expansion.
- State file from old format (no `group_index` field) is loaded — entries won't deserialize, leading to corrupted-state error (which is acceptable since the suggestion to delete and re-sync works).
- `GlobEntry::Detailed` has `permissions`/`owner` both `None` — should be allowed (treated as glob-only).
- `GlobEntry::Detailed` has `permissions` set — string is validated during config load; overrides group-level defaults.
- `GlobEntry::Simple` string inherits group-level `permissions`/`owner` defaults.
- Group-level `permissions` absent — `GlobEntry` without explicit values means no permission enforcement for that entry.
- Permission string is invalid (e.g., `"abc"`, `"688"`) — rejected during config load with a clear error.
- Permission string has leading zero (`"0755"`) — accepted; `parse_permissions()` handles it.
- `sync::copy_file()` called with `abs_src` and `abs_tgt` from different groups must still work (it's path-agnostic; no change needed).
- Permissions enforcement iterates target dirs per-group — each group's `target_dir` may differ, so glob resolution is per-group.
- `cfgsync schema --json` output is valid JSON Schema that can be consumed by editors/validators.

## Tasks

### Phase 1: Config structs and deserialization (`src/config.rs`)

- [ ] Replace `Config`, `Filter`, `ResolvedConfig`, `ResolvedFilter` with new types:
  - `Config { sync: Vec<SyncGroup> }` — top-level container
  - `SyncGroup { source: String, target: String, #[serde(default)] globs: Vec<GlobEntry>, permissions: Option<String>, owner: Option<String> }` — permissions is an octal string like `"644"`, parsed later
  - `GlobEntry` enum with `#[serde(untagged)]` deserialization: `Simple(String)` and `Detailed { pattern: String, permissions: Option<String>, owner: Option<String> }`
  - `ResolvedConfig { config_dir: PathBuf, sync_groups: Vec<ResolvedSyncGroup>, state_path: PathBuf }`
  - `ResolvedSyncGroup { source_dir: PathBuf, target_dir: PathBuf, globs: Vec<ResolvedGlob>, permissions: Option<u32>, owner: Option<String> }` — permissions parsed to `u32` via `parse_permissions()`
  - `ResolvedGlob { pattern: String, compiled: glob::Pattern, permissions: Option<u32>, owner: Option<String> }` — parsed permissions with per-glob overrides
- [ ] Add `parse_permissions(s: &str) -> Result<u32, String>` helper — validates the string is valid octal digits and fits in `u32`. Accepts strings like `"644"`, `"755"`, `"0755"`, `"0"`. Rejects empty strings and non-octal characters.
- [ ] Rewrite `load_config()`:
  - Deserialize `Config` from TOML
  - Validate: `sync` is non-empty ("at least one [[sync]] group required")
  - Validate: each group's `globs` is non-empty ("each sync group must have at least one glob")
  - Resolve `source`/`target` paths (relative to config_dir) and canonicalize
  - Validate: each resolved source_dir and target_dir is an existing directory
  - Compile each glob pattern; fail early on invalid globs
  - Parse permissions strings via `parse_permissions()`: group-level `permissions` and per-glob `permissions` are parsed from `String` to `u32` during resolution. Reject invalid permission strings with a clear error.
  - Determine `state_path`: `config_path.with_extension("cfgsync.state")` (unchanged)
  - Return `ResolvedConfig { config_dir, sync_groups, state_path }`
- [ ] Update all `load_config()` unit tests:
  - `test_load_config_valid` → new format with one `[[sync]]` group
  - `test_load_config_with_permissions_and_owner` → test both group-level and per-glob overrides
  - `test_load_config_missing_source_dir` → test missing source/target per group
  - `test_load_config_no_filters` → rename to `test_load_config_empty_sync` or `test_load_config_no_globs`
  - `test_load_config_invalid_glob` → test within a `GlobEntry`
  - Add: `test_load_config_no_sync_groups` — empty `[[sync]]`, expect error
  - Add: `test_load_config_empty_globs` — group with `globs = []`, expect error
  - Add: `test_load_config_simple_glob_string` — plain string in globs list
  - Add: `test_load_config_detail_glob_with_overrides` — inline table with permissions/owner
  - Add: `test_parse_permissions_valid` — `"644"`, `"755"`, `"0755"`, `"0"` all parse correctly
  - Add: `test_parse_permissions_invalid` — `""`, `"abc"`, `"688"`, `"999"` all error

### Phase 2: State file with group index (`src/state.rs`)

- [ ] Add `group_index: usize` field to `FileEntry` struct:
  ```rust
  pub struct FileEntry {
      pub group_index: usize,
      pub path: String,
      pub source_mtime: i64,
      pub target_mtime: i64,
  }
  ```
  Annotate with `#[serde(default)]` so deserializing old state files doesn't panic (though they'll fail differently — see edge case).
- [ ] Change `State::as_map()` to key by `(usize, String)` instead of `&str`:
  ```rust
  pub fn as_map(&self) -> HashMap<(usize, &str), &FileEntry> {
      self.file.iter().map(|e| ((e.group_index, e.path.as_str()), e)).collect()
  }
  ```
- [ ] Update unit tests in `mod tests`:
  - `test_state_serialize_deserialize`: add `group_index` to entries
  - `test_save_and_load_state`: add `group_index`
  - Add: `test_state_map_lookup_by_group` — insert entries for two different groups with same path, verify both are accessible independently

### Phase 3: Change enum and classify logic (`src/changes.rs`)

- [ ] Add `group_index: usize` to **every** `Change` variant and add `abs_src`/`abs_tgt` to `Conflict`:
  ```rust
  pub enum Change {
      CopyToTarget { group_index: usize, rel_path: String, abs_src: PathBuf, abs_tgt: PathBuf },
      CopyToSource { group_index: usize, rel_path: String, abs_src: PathBuf, abs_tgt: PathBuf },
      Conflict     { group_index: usize, rel_path: String, abs_src: PathBuf, abs_tgt: PathBuf },
      DeleteTarget { group_index: usize, rel_path: String, abs_tgt: PathBuf },
      DeleteSource { group_index: usize, rel_path: String, abs_src: PathBuf },
      Cleanup      { group_index: usize, rel_path: String },
  }
  ```
- [ ] Rewrite `scan_dir()` to accept `&[ResolvedGlob]` instead of `&[ResolvedFilter]`:
  - For each `ResolvedGlob`, use `dir.join(&glob.pattern)` for the glob path (same as before)
  - The per-file overlap check **within** a group still applies: a file must match exactly one glob within its group
  - The error message stays: "file 'X' matches multiple filter globs" (replace "filter" with "globs" in message)
- [ ] Rewrite `classify()`:
  - Accept `&ResolvedConfig` (now has `sync_groups` instead of single `source_dir`/`target_dir`)
  - **First pass**: Scan all groups. For each group `i`, call `scan_dir(&group.source_dir, &group.globs)` and `scan_dir(&group.target_dir, &group.globs)`. Store results in `Vec<Vec<DiscoveredFile>>`.
  - **Cross-group overlap validation**: Build a `HashMap<String, usize>` mapping `rel_path → group_index`. Iterate all groups' source files; if a rel_path already belongs to a different group, error out: `"File 'X' matches globs in both sync group {A} and sync group {B}. Each file must belong to exactly one group."`. Do the same for target files (same group is OK, different group is error).
  - **Second pass**: For each group, classify its files using the same match logic as current `classify()`, but:
    - Look up state entries using `state_map.get(&(group_index, &rel_path))` (the new two-tuple key)
    - Compute `abs_src` and `abs_tgt` using the group's `source_dir`/`target_dir`
    - Push each change with the group's `group_index`
- [ ] Update `count_changes()` and `ChangeCounts` — no struct change needed, just update match arms for new variant fields.
- [ ] Update all unit tests in `mod tests`:
  - Change `make_config()` → `make_config(sync_groups: Vec<(...)>, state_path)` helper or inline config creation
  - Change `make_filter()` → `make_glob(pattern)` that creates a `ResolvedGlob`
  - Update all 8 existing `test_classify_*` tests to use new types
  - Add: `test_classify_overlapping_groups_error` — two groups with same glob pattern, verify error is returned
  - Add: `test_classify_multiple_groups_independent` — two groups with non-overlapping globs, verify changes from both appear
  - Add: `test_conflict_variant_has_abs_paths` — verify Conflict stores source/target absolute paths

### Phase 4: Sync logic (`src/sync.rs`)

- [ ] Update `run()`:
  - No signature change needed — it already takes `&ResolvedConfig`, `&mut State`, `Vec<Change>`
  - The match arms for each `Change` variant need to destructure the new `group_index` field (can use `..` or `_` until needed by permissions)
  - For `Conflict { abs_src, abs_tgt, .. }` in interactive mode: the paths are now directly available — remove the manual `config.source_dir.join(rel_path)` lines. Use the fields directly.
- [ ] Update `update_state()`:
  - Instead of iterating `config.filters`, iterate `config.sync_groups`
  - For each group `i`, use `group.source_dir` and `group.globs` (the `ResolvedGlob.pattern` field for glob strings)
  - Each pushed `FileEntry` includes `group_index: i`
  - The `seen` set should still de-duplicate within each group, but the deduplication key can stay as `rel_path` (different groups can have same rel_path, but cross-group overlap is prevented by Phase 3)
- [ ] Update `enforce_permissions_root()`:
  - Iterate `config.sync_groups` instead of `config.filters`
  - For each group, for each `ResolvedGlob`, use `group.target_dir` for the glob base path
  - Permission/owner values come from: `glob.permissions` (per-glob override) else `group.permissions` (group default)
  - For owner: `glob.owner` else `group.owner`
- [ ] Update `check_permissions_nonroot()`:
  - Same structural change as `enforce_permissions_root()` — iterate groups, resolve values with per-glob-override precedence
- [ ] Update unit tests:
  - `test_copy_file_preserves_mtime` — unchanged (path-agnostic)
  - `test_copy_file_creates_parent_dirs` — unchanged
  - `test_is_root_returns_bool` — unchanged
  - `test_file_mtime_nonexistent` — unchanged

### Phase 5: Diff and status output (`src/diff.rs`, `src/status.rs`)

- [ ] Update `diff::print_diffs()`:
  - Match on `Conflict { abs_src, abs_tgt, rel_path, .. }` and call `print_unified_diff()` (target→source direction, same as interactive mode's `eprint_diff`) instead of printing the unhelpful "both sides modified independently" message
- [ ] `status::print_status()` — no changes needed. `count_changes()` already returns aggregated counts across all groups.

### Phase 6: Schema doc and JSON schema (`src/schema.rs`, `src/schema_doc.toml`, `src/main.rs`, `Cargo.toml`)

- [ ] Add `schemars` dependency to `Cargo.toml`:
  ```toml
  schemars = "0.8"
  ```
- [ ] Add `#[derive(JsonSchema)]` to `Config`, `SyncGroup`, and `GlobEntry` in `src/config.rs`. Every field and enum variant must carry `#[schemars(description = "...")]` so the generated JSON Schema has a `description` for every property. For `permissions` fields, also add `#[schemars(regex(pattern = "^[0-7]{3,4}$"))]` to restrict to valid octal strings. Example:
  ```rust
  #[derive(JsonSchema)]
  pub struct SyncGroup {
      #[schemars(description = "Path to the source directory (files are read from here)")]
      pub source: String,
      #[schemars(description = "Path to the target directory (files are written here)")]
      pub target: String,
      #[schemars(description = "Default owner (user:group) applied to synced files")]
      #[serde(default)]
      pub owner: Option<String>,
      #[schemars(description = "Default permissions as an octal string (e.g. \"644\", \"755\")", regex(pattern = "^[0-7]{3,4}$"))]
      #[serde(default)]
      pub permissions: Option<String>,
      #[schemars(description = "Glob patterns defining which files to sync. Each entry is either a plain glob string or an object with per-glob overrides.")]
      pub globs: Vec<GlobEntry>,
  }
  ```
- [ ] Update `src/main.rs`:
  - Change `Commands::Schema` to accept an optional `--json` flag:
    ```rust
    Commands::Schema {
        /// Output JSON Schema instead of human-readable TOML reference
        #[arg(long)]
        json: bool,
    }
    ```
  - Update the match arm: `Commands::Schema { json } => schema::print_schema(json)`
- [ ] Update `src/schema.rs`:
  - `pub fn print_schema(json: bool)` — if `json`, call `schemars::schema_for!(Config)` and serialize as pretty JSON to stdout. If not `json`, print the embedded TOML doc as before.
- [ ] Rewrite `src/schema_doc.toml` entirely to reflect the new format:
  ```toml
  # cfgsync configuration
  #
  # Each [[sync]] section defines one sync group with its
  # own source directory, target directory, and glob patterns.

  [[sync]]
  source = "/home/user/dotfiles"
  target = "/etc"
  # owner = "root:root"         # optional group default
  # permissions = "644"          # optional group default (octal string)
  globs = [
      "nginx/*.conf",
      { pattern = "ssh/sshd_config", permissions = "600" },
      "**/*.service",
  ]
  ```
  Include comments explaining relative path resolution, the `GlobEntry` variants, precedence of per-glob overrides vs. group defaults, and the octal string format for permissions.

### Phase 7: E2E test updates (`e2e-tests/`)

- [ ] Update all existing `config.toml` files in `original/` directories to new format:
  - `test-basic-sync-to-target/original/config.toml`
  - `test-basic-sync-to-source/original/config.toml` (if it exists)
  - `test-conflict-detection/original/config.toml`
  - `test-delete-from-target/original/config.toml`
  - `test-delete-from-source/original/config.toml`
  - `test-permission-warning/original/config.toml`
  - `test-unchanged-skip/original/config.toml`
  - `test-relative-paths/original/subdir/config.toml`
  - `test-ignore-non-matching/original/config.toml`
  - `test-identical-untracked/original/config.toml`
- [ ] Each config conversion follows this pattern:
  ```toml
  [[sync]]
  source = "./source"
  target = "./target"
  globs = ["**/*.txt"]
  ```
  (or `**/*.conf`, or whatever the original filter was)
  For permission-warning test, add `permissions = "600"` at the group level.
- [ ] Add new e2e test `test-multi-group/`:
  - Two `[[sync]]` groups with different source dirs and non-overlapping globs
  - Verify files from both groups are synced
  - Verify status shows correct combined counts
  - Verify state file contains entries for both groups (with different `group_index` values)
- [ ] Add new e2e test `test-overlapping-groups-error/`:
  - Two `[[sync]]` groups with overlapping globs (same regex)
  - Verify cfgsync prints clear error and exits non-zero
- [ ] Run full e2e suite: `cargo build --release && ./e2e-tests/run.sh`

### Phase 8: Final validation

- [ ] Run `cargo clippy -- -D warnings` — fix any lints across all changed files
- [ ] Run `cargo fmt` — format all changed files
- [ ] Run `mise run format-and-test` — ensure everything passes

## Findings

<!-- Discovered during implementation. Leave empty initially. -->
