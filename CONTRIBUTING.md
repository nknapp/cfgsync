# Contributing to cfgsync

## Prerequisites

- **Rust toolchain**: `1.96.0` (managed by mise)
- **x86_64-unknown-linux-musl target**: required for static builds (`rustup target add x86_64-unknown-linux-musl`)
- **Deno**: required for e2e tests

## Setup

```bash
git clone https://github.com/nknapp/cfgsync.git
cd cfgsync
mise install
```

## Building

```bash
cargo build --release --target x86_64-unknown-linux-musl
```

## Testing

Run unit tests:

```bash
cargo test
```

Run e2e tests (requires a release build first):

```bash
cargo build --release
./e2e-tests/run.sh
```

Run everything (CI equivalent):

```bash
mise run all-local
```

## Code style

- Format: `cargo fmt`
- Lint: `cargo clippy -- -D warnings`
- Commit messages follow [conventional commits](https://www.conventionalcommits.org/)

## Making changes

1. Create a descriptive branch (e.g. `feat/add-watch-mode`, `fix/state-rebuild-dup`)
2. Make changes on the branch
3. Run `mise run all-local` to verify everything passes
4. Commit with a conventional commit message
5. Push the branch to origin
6. Create a pull request via `gh pr create`

## Pull request process

- Every new feature must include an e2e test
- All CI checks must pass before merging
- PRs are squash-merged into `main`

## GitHub token

To use `gh` locally (push branches, create PRs, view workflow runs), create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new?target_name=nknapp&contents=write&pull_requests=write&metadata=read) with **Contents: write**, **Pull requests: write**, and **Metadata: read** for the `nknapp/cfgsync` repository.

Authenticate with:

```bash
gh auth login --with-token < ~/.config/gh/token
```
