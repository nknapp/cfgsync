#!/usr/bin/env bash
set -eu
cd "$(dirname "$(readlink -f "$0")")"

echo "Building cfgsync binary..."
(cd .. && cargo build --release)

echo "Running e2e tests in Docker..."
exec docker compose up --build --exit-code-from testbed
