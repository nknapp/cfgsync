---
name: astgrep-refactor
description: Use ast-grep (sg) for structural code refactoring across TypeScript and Rust files. Prefer sg over sed/regex for renaming, restructuring, and pattern-based changes.
license: MIT
compatibility: opencode
---

## What I do

I instruct the agent to use `ast-grep` (`sg`) for all structural refactoring tasks instead of ad-hoc
`sed`, `grep`, or manual edits. `sg` understands AST patterns, so renames, signature changes, and
restructuring are reliable and don't suffer from regex false positives.

## When to use me

Use me when a user asks for:

- Renaming a function, variable, type, class, or method across the codebase
- Changing a function signature (adding/removing/reordering parameters)
- Replacing a pattern with a structural equivalent (e.g., `const x = await f()` → `const { x } = await f()`)
- Migrating test patterns or API usage across many files
- Any bulk change where regex/sed would be fragile or ambiguous

## How to use me

### The `sg` command

```bash
sg -p '<pattern>' -r '<replacement>' <files...>
```

- `-p` / `--pattern`: the AST pattern to match (use `$$$` for wildcard, `$VAR` for captures)
- `-r` / `--rewrite`: the replacement pattern using captured variables
- `-l` / `--lang`: language hint (e.g., `typescript`, `rust`)
- `--interactive`: review each change before applying
- `--update`: write changes to disk (without this, only prints matches)
- `-U` / `--update-all`: write changes to all matching files

### Pattern syntax quick reference

| Syntax | Meaning |
|--------|---------|
| `$$$` | Match any number of nodes (including none) |
| `$$$A` | Match any number of nodes, bind to meta-variable `A` |
| `$VAR` | Match a single AST node, bind to `VAR` |
| `$VAR$` | Match any AST node including its children, bind to `VAR` |
| `$$$` | Match any number of nodes in a list |
| `"..."` | Match a string literal value |

### Examples

Rename a method call:
```bash
sg -p 'testbed.setMtime($$$)' -r 'testbed.utime($$$)' e2e-tests/
```

Change async destructure pattern:
```bash
sg -p 'const testbed = await TestBed.create($$$)' \
   -r 'const { testbed } = await TestBed.create($$$)' \
   -l typescript e2e-tests/
```

Remove an argument from a function call:
```bash
sg -p 'createDirOrFile($A, $B, $C)' -r 'createDirOrFile($A, $B)' src/
```

### Workflow

1. **Preview first** — run `sg -p '...'` without `-U` to see what matches
2. **Review matches** — verify only intended sites are matched
3. **Apply** — add `-U` to write changes, or use `--interactive` for per-match review
4. **Verify** — run `mise run all-local` after every batch of changes

### Language auto-detection

`sg` usually detects the language from file extensions. For ambiguous files or inline code snippets,
pass `-l <lang>` explicitly:

```bash
sg -p '...' -l rust src/
sg -p '...' -l typescript e2e-tests/
```

### Dry-run / no-write mode

Always preview without `-U` first:

```bash
# Preview only
sg -p 'const $X = await f($$$)' e2e-tests/*.test.ts

# Apply after confirming
sg -p 'const $X = await f($$$)' -r 'const { $X } = await f($$$)' -U e2e-tests/*.test.ts
```

### When NOT to use sg

- Simple string replacements with no structural context (use `sed`)
- Changes to TOML/YAML/JSON config files (use `sed` or manual edits)
- Single-line edits in a known file (use `edit` tool directly)
