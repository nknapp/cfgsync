#!/bin/bash -x
set -euo pipefail

cd actual
"$CFGSYNC" sync subdir/config.toml
cd ..
diff -r --exclude='*.cfgsync.state' expected actual
