#!/usr/bin/env bash
set -euo pipefail

# Build WASM, then serve the web/ directory.
wasm-pack build crates/pharaoh-web --target web --out-dir ../../web/pkg --release
python3 -m http.server "${PORT:-8080}" -d web
