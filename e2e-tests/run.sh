#!/usr/bin/env bash
set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

: "${CFGSYNC:=$SCRIPT_DIR/../target/release/cfgsync}"
export CFGSYNC

deno test --config deno.json --frozen \
  --allow-write --allow-sys --allow-read --allow-env --allow-run --allow-net \
  .
