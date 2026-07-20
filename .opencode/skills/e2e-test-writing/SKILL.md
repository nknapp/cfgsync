---
name: e2e-test-writing
description: Rules for writing e2e tests for cfgsync — covers test location, scope, and structure for classification, validation, and hook tests.
license: MIT
compatibility: opencode
override: AGENTS.md
---

## Override: AGENTS.md verification rule

**When only `*.test.ts` files have changed** (and no source code, config, or other files), the AGENTS.md requirement to run `mise run all-local` is overridden. Instead, run the Docker-based e2e test suite filtered to the current test:

```bash
./e2e-tests/run-docker.sh <test-file-name>
```

The argument is the full test file name (e.g. `target-file-changed.test.ts`), not a partial pattern. No `--` separator.

This is sufficient because:
- Test-only changes cannot break the build, lints, or unit tests (those only run against Rust source)
- `mise run all-local` is heavyweight (builds the full Rust project, runs all lints and unit tests) and is wasted on test-only edits
- The Docker runner gives the most realistic CI-like environment for e2e tests

Before finishing, also run Deno lint and format on the changed test files:

```bash
deno fmt e2e-tests/to-check/...  # format the test files
deno lint e2e-tests/to-check/... # lint the test files
```

**Condition**: This override only applies when `git diff --name-only` (or the equivalent working-tree check) shows changes exclusively in `e2e-tests/` files matching `*.test.ts`. If any non-test file has changed (including `e2e-tests/lib/`, scripts, or any Rust source), the full `mise run all-local` from AGENTS.md still applies.

## What I do

Provides rules for writing e2e tests for cfgsync: where to place them, what scope each test should cover, and what structure to follow.

## When to use me

Use this skill whenever you are adding a new e2e test for cfgsync. The test logic in `e2e-tests/lib/` (TestBed, config helpers, assertion helpers) is the building-block API — use it as shown in existing tests.

## Test location

Store tests in `e2e-tests/to-check/` for later human review. Use the following subfolder structure matching the "checked" folder:

| Category | Subfolder | Applies to |
|----------|-----------|------------|
| Good-path file classification tests | `classification/` | Scenarios primarily exercising step "3. Find and classify files" in `docs/algorithm/index.md` |
| Feasibility validation tests | `validation/<action-name>/` | Scenarios exercising step "4. Validate action feasibility", one folder per validated action (e.g. `CopyToTarget/`, `DeleteFromState/`) |
| Hook execution tests | `hooks/` | Scenarios checking hook execution or non-execution |

When in doubt between categories, prefer the more specific one.

## Test scope

### Classification tests ("good path")

Tests must follow this structure in order:

1. **Setup** — call `TestBed.create(t, spec)` with a `configToml` and `files` array. Use `faketime` if mtime manipulation is needed. Apply additional file modifications (e.g., `writeTextFile`, `deleteFile`) after setup. Advance faketime where needed.
2. **Test `status`** — run `cfgsync --config <cfg> status`, assert output with `testbed.assertOutput()`.
3. **Test `status --short`** — run `cfgsync --config <cfg> status --short`, assert output.
4. **Test `diff`** — run `cfgsync --config <cfg> diff`, assert output (or use `getStdout()` with partial checks if output is dynamic).
5. **Test `sync`** — run `cfgsync --config <cfg> sync`, assert output and final filesystem state with `testbed.assertTestDir()`.

### Validation tests

Tests must follow this structure in order:

1. **Setup** — call `TestBed.create(t, spec)` and any additional modifications.
2. **Test `status`** — run `cfgsync --config <cfg> status`, assert output.
3. **Test `status --short`** — run `cfgsync --config <cfg> status --short`, assert output.
4. **Test `sync`** — run `cfgsync --config <cfg> sync`, assert output and final filesystem state.

### Hook tests

Tests must follow this structure:

1. **Setup** — call `TestBed.create(t, spec)` and any additional modifications.
2. **Test `sync`** — run `cfgsync --config <cfg> sync`, assert output including hook-related messages.

Hook tests only need to test sync (the hook execution side effect), not status or diff.

## Conventions

- Import helpers from `@/lib/index.ts` (`CONFIG_TOML`, `STATE_FILE`, `deindent`, `TestBed`)
- Use `deindent` for multi-line strings (config TOML, expected output)
- Use `DENO_TEST_PERMISSIONS` env var or Deno's `--allow-all` (already configured in `deno.json`)
- Name test files descriptively with `test-<what>.test.ts` or `<scenario>.test.ts`
- Use `testbed.assertTestDir()` to verify final filesystem state after sync
- Use `testbed.assertOutput()` for exact stdout/stderr/code matching
- Use `testbed.getStdout()` / `testbed.getStderr()` for partial or dynamic output checks (e.g., diff with absolute paths)

## Diff output assertions

When asserting `cfgsync diff` output, follow these patterns.

### Setup

- **Always set `env: { TZ: "UTC" }`** on the `testbed.run()` call — mtime timestamps in diff headers are timezone-dependent.
- **Destructure `testDir`** from `TestBed.create(t, spec)` — diff output contains absolute paths that must match the test directory.

```typescript
const { testbed, testDir } = await TestBed.create(t, { ... });
```

### Exact match with `deindent`

Use `deindent` when no line has trailing whitespace that matters. Use `${"\t"}` for the tab between path and mtime:

```typescript
await testbed.run({ args: ["--config", "config.toml", "diff"]});
testbed.assertOutput({
  code: 0,
  stdout: deindent`
    === file.txt (target -> source) ===
    --- ${testDir}/target/file.txt${"\t"}2020-01-01 00:00:00.000000000 +0000
    +++ ${testDir}/source/file.txt${"\t"}2020-01-01 00:00:00.000000000 +0000
    @@ -1 +1 @@
    -old content
    +new content
  `,
  stderr: "",
});
```

### Files without trailing newlines

When a file does not end with `\n`, the unified diff includes `\ No newline at end of file` after the relevant `-` or `+` line. Use `\\` to produce a literal backslash in the `deindent` template literal:

```typescript
    @@ -1 +1 @@
    -v2
    \\ No newline at end of file
    +v1
    \\ No newline at end of file
```

### Missing file (empty mtime)

When the source file is missing (CopyToSource with no source), the `+++` line has an empty mtime (just a trailing tab). `deindent` strips trailing whitespace, so use string concatenation instead:

```typescript
    stdout: `=== file.txt (target -> source) ===\n` +
      `--- ${testDir}/target/file.txt\t2020-01-01 00:00:00.000000000 +0000\n` +
      `+++ ${testDir}/source/file.txt\t\n` +
      `@@ -1 +1 @@\n` +
      `-from target\n` +
      `+(file missing)\n` +
      `\\ No newline at end of file`,
```

### Change variant → diff header mapping

| Change variant | Header line | `---` file (old) | `+++` file (new) |
|---|---|---|---|
| `CopyToTarget` | `=== <path> (source -> target) ===` | source | target |
| `CopyToSource` | `=== <path> (target -> source) ===` | target | source |
| `Conflict` | `=== <path> (CONFLICT) ===` | source | target |
| `DeleteTarget` | `=== <path> (would be deleted from target) ===` | *(no diff body)* | |
| `DeleteSource` | `=== <path> (would be deleted from source) ===` | *(no diff body)* | |

Refer to existing tests in `e2e-tests/checked/classifications/` for examples of the patterns described above.
