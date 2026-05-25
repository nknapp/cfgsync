#!/bin/bash
set -euo pipefail
CFGSYNC="${1:?usage: test.sh <path-to-cfgsync-binary>}"

# Same file exists on both sides with different content.
# Without --interactive, sync should abort and report conflicts.

output="$("$CFGSYNC" sync config.toml 2>&1)" || true

if ! echo "$output" | grep -q -i "conflict"; then
    echo "FAIL: expected conflict message in output"
    echo "Got: $output"
    exit 1
fi

# Neither file should have been overwritten
if [ "$(cat source/conflict.txt)" != "source version" ]; then
    echo "FAIL: source file was modified"
    exit 1
fi
if [ "$(cat target/conflict.txt)" != "target version" ]; then
    echo "FAIL: target file was modified"
    exit 1
fi

echo "PASS"
