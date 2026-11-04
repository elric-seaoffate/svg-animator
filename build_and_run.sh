#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

mkdir -p bin release render_workspace

# Ensure default config.json exists in working directory
if [ ! -f "config.json" ]; then
  cat << 'EOF' > config.json
{
  "host": "0.0.0.0",
  "port": 8088,
  "data_dir": "."
}
EOF
  echo ">> Created default config.json"
fi

echo ">> Tidying Go module dependencies..."
go mod tidy

echo ">> Building Linux binary (./svg-animator and ./bin/svg-animator-linux)..."
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o ./bin/svg-animator-linux ./cmd/svg-animator/main.go
cp -f ./bin/svg-animator-linux ./svg-animator
chmod +x ./svg-animator ./bin/svg-animator-linux

if [ "${BUILD_WINDOWS:-0}" = "1" ]; then
  echo ">> Cross-compiling Windows binary (./bin/svg-animator-windows.exe)..."
  CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o ./bin/svg-animator-windows.exe ./cmd/svg-animator/main.go
fi

if [ "${BUILD_ONLY:-0}" = "1" ]; then
  echo ">> Build complete (BUILD_ONLY=1). Skipping server start."
  exit 0
fi

echo ">> Starting SVG Animator Studio..."
exec ./svg-animator "$@"