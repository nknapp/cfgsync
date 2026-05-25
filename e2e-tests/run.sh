#!/bin/bash
set -euo pipefail
shopt -s nullglob

E2E_DIR="$(cd "$(dirname "$0")" && pwd)"

# Find binary: prefer explicit arg, then release, then debug
BINARY="${1:-}"
if [ -z "$BINARY" ]; then
    if [ -x "$E2E_DIR/../target/release/cfgsync" ]; then
        BINARY="$E2E_DIR/../target/release/cfgsync"
    elif [ -x "$E2E_DIR/../target/debug/cfgsync" ]; then
        BINARY="$E2E_DIR/../target/debug/cfgsync"
    else
        echo "Binary not found. Build with: cargo build [--release]"
        echo "Usage: $0 [path-to-cfgsync-binary]"
        exit 1
    fi
fi

BINARY="$(cd "$(dirname "$BINARY")" && pwd)/$(basename "$BINARY")"

echo "=== cfgsync e2e tests ==="
echo "binary: $BINARY"
echo

PASS=0
FAIL=0

WORK_BASE="$E2E_DIR/test-tmp"
rm -rf "$WORK_BASE"
mkdir -p "$WORK_BASE"
echo "work dir: $WORK_BASE"

for test_dir in "$E2E_DIR"/*/; do
    test_name="$(basename "$test_dir")"
    if [ ! -f "$test_dir/test.sh" ]; then
        continue
    fi

    rm -rf "$WORK_BASE/$test_name"
    cp -a "$test_dir" "$WORK_BASE/$test_name"
    work="$WORK_BASE/$test_name"

    pushd "$work" > /dev/null
    if output=$(bash test.sh "$BINARY" 2>&1); then
        if echo "$output" | grep -q "^PASS$"; then
            echo "PASS  $test_name"
            PASS=$((PASS + 1))
        else
            echo "FAIL  $test_name  (no PASS marker)"
            echo "      $output"
            FAIL=$((FAIL + 1))
        fi
    else
        echo "FAIL  $test_name  (test script error)"
        echo "      $output"
        FAIL=$((FAIL + 1))
    fi
    popd > /dev/null
done

echo
echo "=== $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
