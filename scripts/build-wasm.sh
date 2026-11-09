#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

if ! command -v go >/dev/null 2>&1; then
  echo "[ERROR] Go toolchain not found in PATH." >&2
  exit 1
fi

DEST_DIR="internal/web/static/wasm"
DEST_FILE="${DEST_DIR}/engine.wasm"
mkdir -p "$DEST_DIR"

echo ">> Compiling Go WebAssembly engine (GOOS=js GOARCH=wasm cmd/wasm -> ${DEST_FILE})..."
GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o "$DEST_FILE" ./cmd/wasm

if [ -f "$DEST_FILE" ]; then
  FILE_SIZE=$(ls -lh "$DEST_FILE" | awk '{print $5}')
  echo ">> WebAssembly build successful: ${DEST_FILE} (${FILE_SIZE})"
else
  echo "[ERROR] WebAssembly build failed: output file not found." >&2
  exit 1
fi
