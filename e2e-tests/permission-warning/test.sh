#!/bin/bash
set -euo pipefail
CFGSYNC="${1:?usage: test.sh <path-to-cfgsync-binary>}"

# Set source file with permissive permissions (0o644).
# Filter requires 0o600. Non-root sync should produce a warning.

chmod 644 source/nginx.conf

output="$("$CFGSYNC" sync config.toml 2>&1)" || true

if ! echo "$output" | grep -q -i "Permission warning"; then
    echo "FAIL: expected permission warning in output"
    echo "Got: $output"
    exit 1
fi

echo "PASS"
