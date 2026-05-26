#!/bin/bash
set -euo pipefail

cd actual
"$CFGSYNC" sync config.toml 2>/dev/null || true
output=$("$CFGSYNC" status config.toml)
expected="source -> target: 0
target -> source: 0
deleted target:   0
deleted source:   0"
test "$output" = "$expected"
cd ..
diff -r --exclude='*.cfgsync.state' expected actual
