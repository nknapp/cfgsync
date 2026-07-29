# Additional E2E Edge Case Tests

## Summary

Add e2e tests for algorithm scenarios not covered by existing tests or the feature-specific
plans above. These are standalone tests that don't require implementation changes.

## Status

Not started.

## Tests to add

### B8. Stale group in state file

```
Setup: State file has a file entry with group = "./nonexistent" (a target dir path that
no longer matches any sync group).
Source and target dirs exist with matching files.

Expected: cfgsync status runs successfully (exit 0), ignores the stale state entry.
The stale entry should not cause an error or be included in change classification.
```

### B9. File type change with state (symlink → regular file on source)

```
Setup: source+target both have link.txt as a symlink to "hello", tracked in state as symlink.
Change: Delete source/link.txt, write source/link.txt as a regular file with content "hello".
Expected: status shows source -> target: 1 (CopyToTarget, type change detected).
```

### B10. File type change with state (regular file → symlink on target)

```
Setup: source+target both have link.txt as a regular file, tracked in state as file.
Change: Replace target/link.txt with a symlink.
Expected: status shows target -> source: 1 (CopyToSource, type change detected).
```

### B11. Interactive conflict resolution preserves configured permissions

```
Setup: source+target both have file.txt with different content, tracked in state.
Config has file_perms = "private".
Run: cfgsync sync -i, choose [t]arget (CopyToTarget).

Expected: After sync, target/file.txt has content from source and perms = 600 (private preset).
State file tracks the file with perms = "600".
```

### B12. File matching multiple globs within same group → error

```
Setup: Single sync group with two globs that overlap (e.g., "*.conf" and "*.{conf,txt}").
Source has file.conf.

Expected: cfgsync exits with error about multiple globs matching the same file.
```

Note: B12 might already be covered by a unit test in `changes.rs` (`test_glob_respects_glob`
only tests filtering, not overlap detection). Verify if `seen` HashSet in `scan_dir` handles
this — it does (line 576-581 of `changes.rs`), so this test validates the e2e error message.

## Priority order

1. B8 (stale group) — simplest, validates robustness
2. B9 + B10 (file type changes) — extends existing symlink tests
3. B11 (interactive perms) — covers interactive mode edge case
4. B12 (intra-group glob overlap) — valid but low priority (unit test might already cover it)

## Verification

```bash
mise run all-local
```
