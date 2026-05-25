# Remove `file_contents_equal` from `classify()`

## Problem

`cfgsync status` is slow on large directory trees. The `classify()` function
calls `file_contents_equal()` for the `(Some, Some, None)` case — files that
exist on both source and target sides but have never been tracked in state.
This reads both files entirely into memory and compares them byte-by-byte.

On first run (no state file) against large directories like `/etc`, every file
that happens to exist on both sides gets fully read — potentially thousands of
files, each twice.

`status` and `diff` are read-only commands. They shouldn't do heavy I/O.

## Root cause

`file_contents_equal()` in `changes.rs:188-207` reads both files into `Vec<u8>`
and compares. It's only called at line 126 for the `(Some(_s), Some(_t), None)`
match arm.

The intent was: if a file exists on both sides with identical content, treat it
as already-synced (skip it) rather than flagging a conflict. This helps on
first-run scenarios where files were manually copied between source and target.

## Solution

Remove the `file_contents_equal` function and the `use std::io::Read` import.
Change the `(Some, Some, None)` match arm to always emit `Conflict`:

```diff
 (Some(_s), Some(_t), None) => {
-    if file_contents_equal(&abs_src, &abs_tgt) {
-        continue;
-    }
     changes.push(Change::Conflict {
         rel_path: rel_path.to_string(),
     });
 }
```

## Impact

- **Performance**: No more reading file contents during `classify()`. `status`,
  `diff`, and `sync` all benefit — only metadata I/O.
- **Behavior change**: On first run, files that exist on both sides with
  identical content will now show as conflicts instead of being silently
  skipped. The user must resolve them (source-wins, target-wins, or skip).
  After the first sync, the state file records the resolution and the conflict
  won't reappear.
- **Correctness**: No change to the sync algorithm's correctness. The conflict
  resolution path handles this case safely.

## Files to change

- `src/changes.rs`: remove `file_contents_equal()` function, remove
  `use std::io::Read` block inside it, change match arm

## Verification

- `cargo test` — all 25 unit tests must pass
- e2e tests — might need adjusting for `unchanged-skip` test since identical
  files on both sides will now show as conflicts, not skips
- `mise run format-and-test` — must pass
