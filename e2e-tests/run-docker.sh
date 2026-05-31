#!/usr/bin/env bash

#
# Runs e2e-tests in a docker container
#
set -eu

cd "$(dirname "$0")"

exec docker compose run --build --rm --env CFGSYNC="${CFGSYNC:+/$CFGSYNC}" testbed ./e2e-tests/run.sh
