#!/usr/bin/env bash
set -eu

PROJECT_ROOT="$(pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -n "${CFGSYNC:-}" ]; then
  case "$CFGSYNC" in
    /*) ;;  # already absolute
    *) CFGSYNC="$PROJECT_ROOT/$CFGSYNC" ;;
  esac
else
  CFGSYNC="$SCRIPT_DIR/../target/release/cfgsync"
fi
export CFGSYNC

cd "$SCRIPT_DIR"

deno test --config deno.json --frozen \
  --allow-write --allow-sys --allow-read --allow-env --allow-run --allow-net \
  .
