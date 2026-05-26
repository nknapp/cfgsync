#!/bin/bash
set -euo pipefail

cd actual
output=$("$CFGSYNC" status config.toml)
if ! echo "$output" | grep -qE 'conflicts:\s+1'; then
    echo "FAIL: expected conflict in status, got: $output"
    exit 1
fi

if "$CFGSYNC" sync config.toml 2>/dev/null ; then
    echo "FAIL: expected sync to fail"
    exit 1
fi

cd ..
diff -r --exclude='*.cfgsync.state' expected actual
