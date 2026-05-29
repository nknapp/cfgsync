#!/usr/bin/env bash

set -eu

cd "$( dirname "$( readlink -f "$0")" )"

PROJECT_DIR="$( realpath .. )"
E2E_TEST_DIR="${E2E_TEST_DIR:-${PROJECT_DIR}/e2e-tests/_tmp/}"

function find_cfg_sync() {
  PATH="${PROJECT_DIR}/target/release:${PROJECT_DIR}/target/debug:${PATH}" which cfgsync
}

if [[ ! "${CFGSYNC:-}" ]] ; then
  CFGSYNC="$(find_cfg_sync)"
else
  CFGSYNC="${PROJECT_DIR}/${CFGSYNC}"
fi


export CFGSYNC E2E_TEST_DIR

deno test --config deno.json --frozen --allow-write --allow-sys --allow-read --allow-env --allow-run --allow-net "$@"