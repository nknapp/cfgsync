---
name: update-dependencies
description: Update project dependencies across all ecosystems (Rust, Deno, Mise, GitHub Actions, Docker). Runs outdated.ts, then applies each update one at a time with test/lint verification and per-dependency commits.
license: MIT
compatibility: opencode
---

## Goal

**`outdated.ts` must report an empty `outdated` object when the process is complete.** Every dependency
across all ecosystems (Rust, Deno, Mise, GitHub Actions, Docker) should be at the latest available version
that passes tests and linters. Version constraints in `Cargo.toml`, `deno.json`, `mise.toml`, etc. must
be pinned to the actual resolved version so that renovate's lookup sees nothing to upgrade.

## What I do

I orchestrate updating all dependencies in a cfgsync-style project. I run the discovery script, then apply
each update one at a time, running tests and linters after each change and committing as I go.

After every batch of changes, re-run `./outdated.ts` to confirm progress toward the goal. At the end,
the output must show `"outdated": {}`.

## When to use me

Use me when a user says anything like:
- "update all dependencies"
- "check for outdated packages and upgrade them"
- "bring dependencies up to date"
- any mention of dependency updates, outdated crates, or package upgrades

## How to use me

### Phase 0: Discovery

1. Run `./outdated.ts` from the project root (the directory containing `renovate.json`) and capture the JSON output.
2. Parse the `outdated` object. Its keys are renovate manager names: `cargo`, `deno`, `mise`, `github-actions`, `dockerfile`.

### Phase 1: Apply updates (one at a time)

Process each update **individually**. For each dependency:

1. **Apply the upgrade**:
   - **Rust (cargo)**: Edit `Cargo.toml` version constraint, then run `cargo update -p <crate>`.
   - **Deno**: Edit `deno.json` constraint.
   - **Mise**: Edit `mise.toml` version, then run `mise install <tool>@<new_version>`.
   - **GitHub Actions**: Edit workflow YAML files. Change `uses: <action>@vX` to `uses: <action>@vX.Y.Z`.
   - **Docker**: Edit Dockerfile. Update the base image tag.

2. **Verify**:
    ```bash
    cargo build --release
    mise run all-local
    ```

3. **Fix issues** — If compilation or tests fail:
   - Read the error messages carefully.
   - Adapt the code to the new API/tool behavior.
   - Re-run verification.
   - If the upgrade is too invasive or breaks too much, **revert it** and skip.

4. **Commit**:
   ```bash
   git add -A
   git commit -m "chore: upgrade {manager} {name} from {old} to {new}"
   ```

### Order of operations

Prioritize the order that minimizes cascading breakage:

1. **Dev dependencies first** (they don't affect production builds)
2. **Leaf dependencies** (packages that nothing else depends on)
3. **Core dependencies last** (widely-used packages like `serde`, `clap`)

### Skipping upgrades

Skip an upgrade if:
- The update is less than 3 days old (already filtered by `outdated.ts` via `minimumReleaseAge`)
- The upgrade introduces breaking changes that cannot be reasonably fixed
- Tests cannot be made to pass after reasonable effort

For skipped upgrades, add a comment in the commit message explaining why:
```bash
git commit -m "chore: skip {dep} upgrade to {new} — {reason}"
```

### Test and lint commands

Always use these from the project root:

```bash
mise run all-local          # run all tests and linters
```

### Docker note

Docker base images cannot be automatically verified for updates via the registry API without pulling. For `debian:bookworm-slim`:
- Check the Debian release cycle for new point releases of bookworm.
- If a new point release exists, update the image tag and rebuild the e2e Docker test:
  ```bash
  cd e2e-tests && docker compose build --no-cache && ./run-docker.sh
```
