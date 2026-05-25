#!/bin/bash
set -euo pipefail

cd actual
"$CFGSYNC" sync config.toml 2>/dev/null || true
cd ..
diff -r --exclude='*.cfgsync.state' expected actual
