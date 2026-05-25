#!/bin/bash
set -euo pipefail
shopt -s nullglob


function usage() {
  cat <<USAGE

      Usage: $0 [test-dir]

      Run the e2e-test in <cfg-sync> [test-dir]. If test dir is not given, run all tests.

      Environment variables
        CFG_SYNC - optional path to the "cfgsync" executable to use for the test.

USAGE
}

if [[ " $* " =~ " --help " ]] ; then
  usage
  exit 1
fi

ORIG_PWD="$PWD"
cd "$( dirname "$( readlink -f "$0" )" )/.."


function find_cfg_sync() {
  PATH="./target/release/:./target/debug/:${PATH}" which cfgsync
}

export CFGSYNC="$(realpath "${CFGSYNC:-$(find_cfg_sync)}")"


if [[ $# -gt 0 ]] ; then
  TESTS=("e2e-tests/$1")
else
  TESTS=(e2e-tests/test-*)
fi

echo "=== cfgsync e2e tests ==="
echo "binary: $CFGSYNC"
echo

PASS=0
FAIL=0


for i in "${TESTS[@]}" ; do
  rm -rf "$i/actual"
  cp -ar "$i/original" "$i/actual"
  pushd "$i" >/dev/null
  if output=$(bash test.sh 2>&1); then
    echo "✅ PASS $i"
    PASS=$((PASS + 1))
  else
    echo "❌ FAIL  $i"
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


