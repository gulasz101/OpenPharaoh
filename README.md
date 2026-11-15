# OpenPharaoh Web

A Rust/WebAssembly port of the [OpenPharaoh](https://github.com/gulasz101/OpenPharaoh) engine that runs in your browser.

## Your own game files — nothing redistributed

This project **does not include** any Pharaoh game assets. You must supply your own copy (GOG or physical). The browser reads your local files with the File API and sends nothing to any server.

## Getting started

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/)
- A copy of Pharaoh installed somewhere on your machine

### Building & running

```bash
# Run the full check suite (format, clippy, tests, WASM build)
scripts/check.sh

# Build WASM and start a local dev server
scripts/serve.sh   # serves http://localhost:8080 by default
```

Then open your browser to `http://localhost:8080` and drop your Pharaoh installation folder onto the page.

## Project structure

| Path | Purpose |
|------|---------|
| `crates/pharaoh-assets/` | Pure-Rust library for game asset parsing (no WASM deps) |
| `crates/pharaoh-web/` | WebAssembly crate (`cdylib`) — the browser-facing layer |
| `web/` | Static HTML / JS / CSS that loads the WASM module |
| `scripts/check.sh` | Gate script: format, clippy, tests, WASM build |
| `scripts/serve.sh` | Build + serve for local development |

## License

GPL-3.0. See [LICENSE](LICENSE) for details.
