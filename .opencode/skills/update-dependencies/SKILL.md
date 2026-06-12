---
name: update-dependencies
description: Update project dependencies across all ecosystems (Rust, Deno, Mise, GitHub Actions, Docker). Runs outdated.ts, upgrades minor versions in bulk, then major versions one-at-a-time with test/lint verification and per-dependency commits.
license: MIT
compatibility: opencode
---

## Goal

**`outdated.ts` must report an empty `outdated` object when the process is complete.** Every dependency
across all ecosystems (Rust, Deno, Mise, GitHub Actions, Docker) should be at the latest available version
that passes tests and linters. Version constraints in `Cargo.toml`, `deno.json`, `mise.toml`, etc. must
be pinned to the actual resolved version so that renovate's lookup sees nothing to upgrade.

## What I do

I orchestrate updating all dependencies in a cfgsync-style project. I run the discovery script, classify updates
by ecosystem and severity (minor vs major), check version age, apply minor updates in bulk, then major updates
one at a time, running tests and linters after each change and committing as I go.

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
2. Parse the `outdated` object. It has keys: `rust`, `deno`, `mise`, `github_actions`, `docker`.
3. For each entry in each ecosystem, classify as **minor** or **major**:

   | Ecosystem | Minor upgrade | Major upgrade |
   |---|---|---|
   | **Rust** | `kind: "updating"` (compatible, same major) | `kind: "unchanged"` with different major in `latest` |
   | **Deno** | Same major constraint (e.g., `@1` staying within `1.x`) | Different major constraint |
   | **Mise** | Same major version prefix | Different major version prefix |
   | **GitHub Actions** | Same major tag prefix (e.g., `v4` → `v4.2.0`) | Different major tag prefix (e.g., `v4` → `v5`) |
   | **Docker** | Tag unchanged, image refreshed | Tag change (e.g., `bookworm` → `trixie`) |

### Phase 1: Version age check

Before upgrading to any version, verify it is at least 3 days old **(unless the update fixes a known CVE)**.

**Rust crate age** — Query crates.io:
```bash
curl -s "https://crates.io/api/v1/crates/{crate_name}/{version}" | jq '.version.created_at'
```
The `created_at` field is ISO 8601. Compare to the current date; skip if less than 3 days old.

**GitHub Action age** — Use gh CLI:
```bash
gh api "repos/{owner}/{repo}/releases/tags/{tag}" --jq '.published_at'
```

**Deno, Mise, Docker** — Age checks are optional for these. If the registry does not expose release dates easily, proceed without the age check but note it.

**CVE check** — If an update is less than 3 days old but addresses a CVE, apply it anyway. Use:
```bash
cargo audit  # for Rust
```

### Phase 2: Minor version upgrades (all at once)

Upgrade all minor updates across all ecosystems first, as a single batch.

**Rust**:
```bash
cargo update -p <crate_name>
```
No `Cargo.toml` changes needed for minor updates.

**Deno**:
```bash
cd e2e-tests && deno outdated --update
```
Or manually edit `deno.json` / `deno.lock`.

**Mise**:
```bash
mise install <tool>@<new_version>
```
Then update `mise.toml` with the new version string.

**GitHub Actions**:
Edit the workflow YAML files directly. Change `uses: <action>@vX` to `uses: <action>@vX.Y.Z` (or the next minor within the same major).

**Docker**:
Edit the Dockerfile. Update the base image tag if a newer minor release is available within the same major OS version.

After applying all minor upgrades:

1. Run `cargo build --release` to verify compilation.
2. Run `mise run all-local` to run all tests and linters.
3. If anything fails, fix the issues **in code** before continuing.
4. Once everything passes, commit:
   ```bash
   git add -A
   git commit -m "chore: update all minor dependencies"
   ```

### Phase 3: Major version upgrades (one at a time)

Process major upgrades **individually** across all ecosystems. For each dependency:

1. **Apply the upgrade**:
   - **Rust**: Edit `Cargo.toml` version constraint (e.g., `"0.30"` → `"0.31"`), then run `cargo update -p <crate>`.
   - **Deno**: Edit `deno.json` constraint.
   - **Mise**: Edit `mise.toml` version.
   - **GitHub Actions**: Edit workflow YAML.
   - **Docker**: Edit Dockerfile.

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
   git commit -m "chore: upgrade {ecosystem} {dependency_name} from {old} to {new}"
   ```

### Test and lint commands

Always use these from the project root:

```bash
cargo build --release       # verify compilation
mise run all-local          # run all tests and linters
```

Equivalent to running:
```bash
cargo fmt
cargo clippy -- -D warnings
cargo test
cargo build --release
```

### E2E tests

If major changes were made (especially for crates with large API changes), also run:
```bash
./e2e-tests/run.sh
```

### Order of operations

When upgrading one-at-a-time in Phase 3, prioritize the order that minimizes cascading breakage:

1. **Dev dependencies first** (they don't affect production builds)
2. **Leaf dependencies** (crates that nothing else depends on)
3. **Core dependencies last** (widely-used crates like `serde`, `clap`)

### Skipping upgrades

Skip an upgrade if:
- The new version is less than 3 days old and has no CVE fix
- The upgrade introduces breaking changes that cannot be reasonably fixed
- Tests cannot be made to pass after reasonable effort

For skipped upgrades, add a comment in the commit message explaining why:
```bash
git commit -m "chore: skip {dep} upgrade to {new} — {reason}"
```

### Docker note

Docker base images cannot be automatically verified for updates via the registry API without pulling. For `debian:bookworm-slim`:
- Check the Debian release cycle for new point releases of bookworm.
- If a new point release exists, update the image tag and rebuild the e2e Docker test:
  ```bash
  cd e2e-tests && docker compose build --no-cache && ./run-docker.sh
  ```
