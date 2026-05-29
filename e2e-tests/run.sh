#!/usr/bin/env bash

set -eu

cd "$( dirname "$( readlink -f "$0")" )"

function find_cfg_sync() {
  PATH="../target/release:../target/debug:${PATH}" which cfgsync
}

export CFGSYNC="$(realpath "${CFGSYNC:-$(find_cfg_sync)}")"
deno test --allow-write --allow-sys --allow-read --allow-env --allow-run