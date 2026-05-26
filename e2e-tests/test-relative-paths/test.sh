#!/bin/bash
set -euo pipefail

cd actual
"$CFGSYNC" sync subdir/config.toml
output=$("$CFGSYNC" status subdir/config.toml)
expected="source -> target: 0
target -> source: 0
deleted target:   0
deleted source:   0"
test "$output" = "$expected"
cd ..
diff -r --exclude='*.cfgsync.state' expected actual
