#!/usr/bin/env bash

set -eu

cd "$( dirname "${BASH_SOURCE[0]}" )"

PROJECT_DIR="$( cd .. && pwd )"
if [[ "${CFGSYNC:+x}" ]] ; then
  export CFGSYNC="${PROJECT_DIR}/${CFGSYNC}"
fi

deno test --config deno.json --frozen --allow-write --allow-sys --allow-read --allow-env --allow-run --allow-net "$@"