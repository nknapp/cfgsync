#!/bin/bash
set -euo pipefail
cd actual
chmod 644 source/nginx.conf
output=$("$CFGSYNC" sync config.toml 2>&1) || true

if ! echo "$output" | grep -qi 'Permission warning'; then
    echo "FAIL: expected Permission warning in output"
    echo "Got: $output"
    exit 1
fi

output=$("$CFGSYNC" status config.toml)
expected="source -> target: 0
target -> source: 0
deleted target:   0
deleted source:   0"
test "$output" = "$expected"

cd ..
diff -r --exclude='*.cfgsync.state' expected actual
