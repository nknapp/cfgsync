#!/bin/bash
set -euo pipefail

cd actual
"$CFGSYNC" sync config.toml
cd ..
diff -r --exclude='*.cfgsync.state' expected actual
