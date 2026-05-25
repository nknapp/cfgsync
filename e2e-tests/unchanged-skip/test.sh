#!/bin/bash
set -euo pipefail
CFGSYNC="${1:?usage: test.sh <path-to-cfgsync-binary>}"

# Same file with identical content exists on both sides.
# Since contents match, cfgsync should skip (no CopyToTarget/CopyToSource/Conflict).
# The output should show 0 for all change types.

output="$("$CFGSYNC" sync config.toml 2>&1)" || true

# Should report 0 for everything (no changes)
if ! echo "$output" | grep -q "source -> target: 0"; then
    echo "FAIL: expected 0 source->target copies"
    echo "Got: $output"
    exit 1
fi

echo "PASS"
