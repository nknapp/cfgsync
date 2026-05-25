#!/bin/bash
set -euo pipefail
CFGSYNC="${1:?usage: test.sh <path-to-cfgsync-binary>}"

# Config has glob "*.txt" only.
# Source has hello.txt (matches) and skip-me.conf (does not match).
# Target has data.txt (matches) and no-sync.conf (does not match).
# After sync:
#   - hello.txt should be copied source -> target
#   - data.txt should be copied target -> source
#   - skip-me.conf should NOT appear in target
#   - no-sync.conf should NOT appear in source

"$CFGSYNC" sync config.toml

# Verify matching files were synced
if [ ! -f target/hello.txt ]; then
    echo "FAIL: target/hello.txt should exist after sync"
    exit 1
fi

if [ ! -f source/data.txt ]; then
    echo "FAIL: source/data.txt should exist after sync"
    exit 1
fi

# Verify non-matching files were ignored (source -> target)
if [ -f target/skip-me.conf ]; then
    echo "FAIL: target/skip-me.conf should NOT exist (does not match glob)"
    exit 1
fi

# Verify non-matching files were ignored (target -> source)
if [ -f source/no-sync.conf ]; then
    echo "FAIL: source/no-sync.conf should NOT exist (does not match glob)"
    exit 1
fi

echo "PASS"
