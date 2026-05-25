#!/bin/bash
set -euo pipefail
CFGSYNC="${1:?usage: test.sh <path-to-cfgsync-binary>}"

# Source has two files, target is empty.
# After sync, both should appear in target with identical content.

"$CFGSYNC" sync config.toml

# Verify target now has the files
if [ ! -f target/hello.txt ] || [ ! -f target/subdir/deep.txt ]; then
    echo "FAIL: expected files in target/"
    exit 1
fi

if ! diff -q source/hello.txt target/hello.txt > /dev/null 2>&1; then
    echo "FAIL: hello.txt content mismatch"
    exit 1
fi

if ! diff -q source/subdir/deep.txt target/subdir/deep.txt > /dev/null 2>&1; then
    echo "FAIL: deep.txt content mismatch"
    exit 1
fi

# State file should exist
if [ ! -f config.cfgsync.state ]; then
    echo "FAIL: state file not created"
    exit 1
fi

echo "PASS"
