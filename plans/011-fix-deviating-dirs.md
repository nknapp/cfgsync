# Fix: Deviating directories — check optional expected permissions

## Summary

The algorithm spec (sec 1) says a deviating entry has:
- `path` (no glob)
- `optional expected permission`
- `optional expected owner`

Currently `check_one_deviating_directory()` only checks `expected_owner`. The `permissions` field
on `DeviatingEntry` exists but is never compared.

The existing e2e test (`deviating-dir-config.test.ts`) is in `wrong/` because it expects no
warnings — it should warn about mismatching owner.

## Status

Not started.

## Files affected

| File | Change |
|------|--------|
| `src/config.rs` | `DeviatingEntry` / `ResolvedDeviatingEntry` — check if `permissions` field exists |
| `src/sync.rs:1221-1259` | `check_deviating_directories()` / `check_one_deviating_directory()` — add permission check |

## Current behavior

`ResolvedDeviatingEntry` has:
```rust
pub path: PathBuf,
pub owner: Option<String>,
```

No `permissions` field. The TOML config schema (schema_doc.toml) shows `permissions` as an
optional field on `deviating` entries, but it's not deserialized.

## Required changes

### 1. Add `permissions` field to deviating entry type

In `config.rs`, add `permissions: Option<String>` to the config struct and
`permissions: Option<u32>` (parsed octal) to the resolved struct.

### 2. Deserialize and validate the field

Accept octal strings like `"755"` and `"644"` as valid permission values.

### 3. Check permissions in `check_one_deviating_directory()`

```rust
fn check_one_deviating_directory(
    dir_path: &Path,
    expected_owner: &Option<String>,
    expected_perms: &Option<u32>,
) {
    // ... existing metadata/dir checks ...

    if let Some(owner_spec) = expected_owner
        && !owner_spec_matches(&metadata, owner_spec)
    {
        eprintln!("Warning: deviating directory '{}' is owned by {}, expected '{}' ...",
            dir_path.display(), format_actual_owner(&metadata), owner_spec);
    }

    // NEW: permission check
    if let Some(expected_mode) = expected_perms {
        use std::os::unix::fs::PermissionsExt;
        let actual_mode = metadata.permissions().mode() & 0o777;
        if actual_mode != *expected_mode {
            eprintln!("Warning: deviating directory '{}' has perms {:o}, expected {:o} ...",
                dir_path.display(), actual_mode, expected_mode);
        }
    }
}
```

### 4. Move `deviating-dir-config.test.ts` from `wrong/` to `to-check/`

After the fix, the test should pass with the correct warnings. Add a second test case that
sets both `owner` and `permissions` on the deviating entry and verifies both warnings appear.

## E2e test

Update and rewrite the existing `wrong/deviating-dir-config.test.ts`:
- Test 1: Deviating directory with wrong owner → warning
- Test 2: Deviating directory with wrong permissions → warning
- Test 3: Deviating directory with both wrong → both warnings

## Verification

```bash
mise run all-local
```
