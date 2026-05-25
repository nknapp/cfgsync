#!/bin/bash
set -euo pipefail
CFGSYNC="${1:?usage: test.sh <path-to-cfgsync-binary>}"

# First sync: copy delete-me.txt from target to source
"$CFGSYNC" sync config.toml
if [ ! -f source/delete-me.txt ]; then
    echo "FAIL: first sync did not create source/delete-me.txt"
    exit 1
fi

# Delete from target
rm target/delete-me.txt

# Second sync: source should be deleted
"$CFGSYNC" sync config.toml
if [ -f source/delete-me.txt ]; then
    echo "FAIL: source/delete-me.txt should have been deleted"
    exit 1
fi

echo "PASS"
