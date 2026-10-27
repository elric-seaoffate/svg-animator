#!/bin/bash
set -e

echo "=> Compiling SVG Animator Studio for Linux/macOS..."

# Ensure dependencies are tidy
go mod tidy

# Build the binary
go build -o svg-animator ./cmd/svg-animator/main.go

echo "=> Build successful! Binary created: ./svg-animator"
echo "=> Starting Web Studio on http://localhost:8088 ..."
echo "   (Press Ctrl+C to stop the server)"

# Run the server
./svg-animator -serve :8088
