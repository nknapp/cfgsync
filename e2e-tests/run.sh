#!/usr/bin/env bash

set -eu

cd "$( dirname "$( readlink -f "$0")" )/.."

function find_cfg_sync() {
  PATH="/target/release:/target/debug:${PATH}" which cfgsync
}

CFGSYNC="$(realpath "${CFGSYNC:-$(find_cfg_sync)}")"
E2E_TEST_DIR="$(realpath ./e2e-tests/_tmp )/"
export CFGSYNC E2E_TEST_DIR

cd e2e-tests

deno test --allow-write --allow-sys --allow-read --allow-env --allow-run "$@"