#!/bin/bash
set -euo pipefail
CFGSYNC="${1:?usage: test.sh <path-to-cfgsync-binary>}"

# First sync: copy remove-me.txt to target
"$CFGSYNC" sync config.toml
if [ ! -f target/remove-me.txt ]; then
    echo "FAIL: first sync did not create target/remove-me.txt"
    exit 1
fi

# Delete from source
rm source/remove-me.txt

# Second sync: target should be deleted
"$CFGSYNC" sync config.toml
if [ -f target/remove-me.txt ]; then
    echo "FAIL: target/remove-me.txt should have been deleted"
    exit 1
fi

echo "PASS"
