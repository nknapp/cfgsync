# Fix: `last_sync` timestamp in state file

## Summary

The algorithm spec (sec 5.3, `UpdateState`) says: "Update the mtime of both files to the
newest of both mtimes and set this time in the state as `last_sync`."

Currently `update_state()` sets `state.last_sync = crate::time::now()` — the current
wall-clock time — instead of the maximum mtime across all synced files.

## Status

Not started.

## Files affected

| File | Change |
|------|--------|
| `src/sync.rs:629` | `update_state()` — compute `last_sync` from file mtimes instead of `now()` |

## Current behavior

```rust
state.last_sync = crate::time::now();
state.file.clear();
// ... rebuild file entries ...
```

Each file entry gets `mtime_val = src_mtime.max(tgt_mtime)`, but the global `last_sync` is
wall-clock time.

## Required changes

Track the maximum mtime seen across all rebuilt file entries, and use that for `last_sync`.

```rust
let mut max_mtime: i64 = 0;

// Inside the file rebuild loop:
if src_mtime > 0 || tgt_mtime > 0 || is_symlink {
    let mtime_val = src_mtime.max(tgt_mtime);
    max_mtime = max_mtime.max(mtime_val);
    // ... create FileEntry with mtime_str ...
}

// After rebuilding all entries:
state.last_sync = if max_mtime > 0 {
    DateTime::from_timestamp_millis(max_mtime)
        .unwrap_or(crate::time::now())
} else {
    crate::time::now()
};
```

Edge case: if no files were synced and no files exist on disk (empty sync), fall back to `now()`.

## E2e test to add

### B6. State file `last_sync` reflects file mtimes

```
Setup: source has file.txt. Fake time at 2024-01-01T00:00:00Z.
Sync runs. Read the state file.
Expected: state.last_sync == "2024-01-01T00:00:00.000Z" (the file's mtime, not wall-clock).
```

## Verification

```bash
mise run all-local
```
