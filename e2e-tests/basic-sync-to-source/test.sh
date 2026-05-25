#!/bin/bash
set -euo pipefail
CFGSYNC="${1:?usage: test.sh <path-to-cfgsync-binary>}"

# Target has a file, source is empty.
# After sync, the file should be copied to source.

"$CFGSYNC" sync config.toml

if [ ! -f source/data.txt ]; then
    echo "FAIL: expected source/data.txt to exist"
    exit 1
fi

if ! diff -q source/data.txt target/data.txt > /dev/null 2>&1; then
    echo "FAIL: data.txt content mismatch"
    exit 1
fi

echo "PASS"
