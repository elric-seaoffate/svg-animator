# SVG Animator Studio — Native Linux Test Deployment Record

**Date:** 2026-11-09  
**Target Environment:** Linux x86_64 (Debian 12 Bookworm, kernel 7.0.12-1-pve)  
**Binary Architecture:** `linux/amd64` (statically linked, CGO_ENABLED=0)  
**Release Artifact:** `release/linux-amd64/svg-animator`  
**Test Deployment Host:** `blackgrape.seaoffate.net`  
**Test Service Port:** `8090` (isolated test port; development preview on `8089`)  
**Test Data Directory:** `/tmp/svg-animator-test-vm/data` (isolated SQLite DB `studio_library.db` & `render_workspace`)  

---

## 1. Executive Summary

This record documents the standalone build, verification, and isolated execution of SVG Animator Studio following the completion of **WASM Migration Stage 3 (Go-owned Node geometry, shape parameters, and presets)**.

The deployment establishes:
1. A clean native Linux release build embedding the updated WebAssembly engine (`engine.wasm`, 3.63 MB) and all frontend assets via `//go:embed`.
2. A separate test environment running on port `8090` completely isolated from the development preview server (`8089`) and the legacy smoke environment (`8088`).
3. Direct HTTP testing of project persistence, SQLite library initialization, audio inspection, and header fixing via FFmpeg.
4. Investigation and resolution notes regarding the HTTP 413 issue observed during reverse-proxy development access.

---

## 2. Release Build Details

- **Git Commit:** `f3431f5` (`feat: migrate node shapes and presets to Go WASM`)
- **Go Version:** `go version go1.26.0 linux/amd64`
- **Compiler Flags:** `CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w"`
- **Binary Size:** 17,068,194 bytes (~17 MB)
- **SHA-256 Checksum:** `aba69d95ae5620b1b93d1773ab60a904d28d14eca60d04d0707ee0039fa19712`
- **WebAssembly Engine Size:** 3,635,037 bytes (~3.63 MB)

### Asset Embedding Verification
The Go binary was built using Go's standard package embedding (`//go:embed static/*` in `internal/web/server.go`). The embedded filesystem contains:
- `index.html` (128,202 bytes)
- `wasm/engine.wasm` (3,635,037 bytes)
- `js/engine-bridge.js`, `js/nodes.js`, `js/presets.js`, `js/shape-registry.js`, and all companion JavaScript adapters.

---

## 3. Test Deployment Configuration

### Directory Layout
```text
/tmp/svg-animator-test-vm/
├── svg-animator               # Native executable (chmod +x)
├── config.json                # Runtime configuration
└── data/                      # Isolated data root
    ├── studio_library.db      # SQLite project database
    └── render_workspace/      # Scratch export directory
```

### Runtime Configuration (`config.json`)
```json
{
  "host": "0.0.0.0",
  "port": 8090,
  "data_dir": "/tmp/svg-animator-test-vm/data"
}
```

### Launch Command
```bash
cd /tmp/svg-animator-test-vm
./svg-animator -config /tmp/svg-animator-test-vm/config.json
```

---

## 4. Verification & Smoke Test Results

| Test Item | Endpoint / Method | Result | Notes |
| :--- | :--- | :--- | :--- |
| **HTTP Server Readiness** | `GET /` | `200 OK` | Delivered embedded studio HTML |
| **WASM Binary Delivery** | `GET /wasm/engine.wasm` | `200 OK` | `Content-Type: application/wasm`, 3.63 MB |
| **Clean SQLite DB Init** | `GET /api/projects` | `200 OK` (`[]`) | Created new table structure automatically |
| **Project Persistence** | `POST /api/projects/save` | `200 OK` | Successfully inserted project record ID 1 |
| **Project Retrieval** | `GET /api/projects/get?id=1` | `200 OK` | Retrieved full `schemaJson` matching v1.2.0 |
| **Audio Inspection** | `POST /api/export/audio/inspect` | `200 OK` | FFmpeg probed duration and fixed header |
| **WASM Engine Execution** | Protocol Dispatcher | `PASS` | All 12 shapes, presets, and node CRUD verified |
| **Regression Harness** | `node scripts/regression-harness.js` | `PASS` | REG-02, REG-03, Section 16.1 & 16.2 pass |

---

## 5. Investigation of the HTTP 413 Observation

### Finding
During previous development testing in the browser-based `code-server` web IDE, requests to `/api/export/audio/inspect` and `/api/export` failed with `HTTP 413 (Request Entity Too Large)`.

### Root Cause Analysis
1. **Application Layer:** The Go backend explicitly configures `http.MaxBytesReader(w, r.Body, 100*1024*1024)` (100 MB limit in `internal/web/server.go:274`). Under standard conditions, payloads under 100 MB are never rejected by Go.
2. **Gateway / Reverse Proxy Layer:** The development IDE accessed the server through a reverse proxy (`VSCODE_PROXY_URI=https://code.seaoffate.net:8080/proxy/{{port}}/`). Reverse proxies such as Nginx or built-in proxy buffers enforce an upstream `client_max_body_size` (often defaulting to 1 MB). Base64 audio payloads and multi-frame export jobs exceed 1 MB, causing the reverse proxy to abort the connection with `413 Request Entity Too Large` before reaching Go.
3. **VM Environment Verification:** Direct requests to the native Linux application on port `8090` without the intermediate proxy succeeded immediately, processing audio inspection and FFmpeg fixup without any 413 errors.

---

## 6. Rollback Procedure

If rollback is required:
1. Terminate the test process running on port `8090` (`kill <PID>`).
2. Delete the temporary directory `/tmp/svg-animator-test-vm`.
3. The development preview on port `8089` and the rest of the system remain completely unaffected.
