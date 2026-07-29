# Fix: `is_changed()` and no-state equality — owner/permissions comparison

## Status

closed — implemented. `is_changed()` compares owner+perms against state. No-state equality checks owner.
8 tests added to `e2e-tests/checked/3-classifications/3-changed-files/`.

## Summary

The algorithm spec (sec 3.1) defines `is_equal(a, b)` as: `a.hash == b.hash AND a.perms == b.perms
AND a.owner == b.owner AND a.type == b.type`. `is_changed(file)` is `file.mtime != state.mtime AND
NOT is_equal(file, state)`.

The implementation omits owner and permissions from both comparisons. This causes metadata-only
changes (owner or perms shift without content change) to be classified as `Clean` instead of
`CopyToTarget` or `CopyToSource`.

## Status

Not started.

## Files affected

| File | Change |
|------|--------|
| `src/changes.rs:451-468` | `is_changed()` — add owner + perms comparison against `state_entry` |
| `src/changes.rs:277-310` | No-state `classify_entry` — add owner comparison to the `UpdateState` vs `Conflict` decision |

## Current behavior

**`is_changed()`** checks only:
1. `file_type` matches state
2. `mtime` differs from state
3. `hash` differs from state

Owner and permissions in the state file are ignored entirely.

**No-state equality** checks:
1. Symlink type matches
2. Hash matches
3. File permissions match (mode & 0o777)

Owner is ignored.

## Required changes

### 1. `is_changed()` (`changes.rs:451`)

Add to the mtime-shortcut check: when `file.mtime == state_mtime`, additionally verify that
permissions and owner also match state. If they don't, the file IS changed.

Add after the hash comparison: if hash matches but perms or owner differ from state, the file
IS changed.

```rust
fn is_changed(file: &DiscoveredFile, abs_path: &Path, state_entry: &FileEntry) -> bool {
    let file_type_str = if file.is_symlink { "symlink" } else { "file" };
    if state_entry.file_type != file_type_str {
        return true;
    }

    let state_mtime = parse_mtime_to_i64(&state_entry.mtime).unwrap_or(0);
    if file.mtime == state_mtime {
        // Same mtime → check perms and owner didn't change from state
        return perms_differ_from_state(abs_path, state_entry)
            || owner_differs_from_state(abs_path, state_entry);
    }

    let file_hash = compute_file_hash(abs_path, file.is_symlink, file.symlink_target.as_deref());
    let Some(file_hash) = file_hash else {
        return true;
    };

    if file_hash != state_entry.hash {
        return true;
    }

    // Hash matches, but check if perms/owner diverged from state
    perms_differ_from_state(abs_path, state_entry)
        || owner_differs_from_state(abs_path, state_entry)
}
```

Helper functions:
- `perms_differ_from_state(path, state_entry)` — returns `true` if file's current mode differs
  from `state_entry.perms` (parsed as octal)
- `owner_differs_from_state(path, state_entry)` — returns `true` if file's current uid:gid
  differs from `state_entry.owner` (parsed as `user:group`)

### 2. No-state equality (`changes.rs:294`)

After checking `src_hash == tgt_hash && perms_equal`, also check that source and target have
the same owner (uid:gid). If they differ → `Conflict` instead of `UpdateState`.

```rust
let owner_equal = file_owner_matches(abs_src, abs_tgt);
if src_hash.is_some() && src_hash == tgt_hash && perms_equal && owner_equal {
    Change::UpdateState { .. }
} else {
    Change::Conflict { .. }
}
```

Helper:
- `file_owner_matches(a, b)` — returns `true` if both files have the same uid and gid.

## E2e tests to add

### B1. Owner change without content change detected as CopyToTarget

```
Setup: source+target both have file.txt with content "hello", tracked in state.
Change: chown target/file.txt to a different owner.
Expected: status shows source -> target: 1 (CopyToTarget because target owner diverges from state).
```

### B1b. Permissions change without content change detected as CopyToSource

```
Setup: source+target both have file.txt with content "hello", tracked in state.
Change: chmod target/file.txt to different perms.
Expected: status shows target -> source: 1 (CopyToSource because target perms diverge from state).
```

### B10. No-state: identical files but different owner → conflict

```
Setup: source/file.txt and target/file.txt with identical content and perms, but different owner.
No state file.
Expected: status shows conflict: 1 (not UpdateState).
```

## Verification

```bash
mise run all-local
```
