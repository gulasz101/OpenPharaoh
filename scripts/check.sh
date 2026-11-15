#!/usr/bin/env bash
set -euo pipefail

# Step 1: Check for game files in the repository.
if git ls-files | grep -Eiq '\.(sg2|sg3|555|map|sav|smk|wav|mp3|eng|pak)$'; then
    echo "ERROR: Game files found in repository!"
    git ls-files | grep -Ei '\.(sg2|sg3|555|map|sav|smk|wav|mp3|eng|pak)$'
    exit 1
fi

# Step 2: Format check.
echo "==> cargo fmt --all --check"
cargo fmt --all --check

# Step 3: Clippy.
echo "==> cargo clippy --workspace --all-targets -- -D warnings"
cargo clippy --workspace --all-targets -- -D warnings

# Step 4: Tests.
echo "==> cargo test --workspace"
cargo test --workspace

# Step 5: Build WASM.
echo "==> wasm-pack build crates/pharaoh-web --target web --out-dir ../../web/pkg --release"
wasm-pack build crates/pharaoh-web --target web --out-dir ../../web/pkg --release

echo ""
echo "CHECK OK"
