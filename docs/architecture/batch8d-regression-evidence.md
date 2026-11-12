# Batch 8D — Regression and Architectural Test Evidence

**Project:** SVG Animator Studio  
**Milestone:** Post-Carbon Review Remediation — Batch 8D  
**Baseline Commit:** `3ea4d5c`  
**Date:** 2026-11-12  

---

## 1. Test Execution Summary

A complete battery of verification tests was executed across the codebase following the extraction and modularisation of `internal/web/static/js/app.js`:

| Test Suite / Harness | Scope | Result | Notes |
|---|---|---|---|
| **JavaScript Regression Harness** | 73 Scenarios (including new Scenario 73) | **PASS (73/73)** | Zero regressions across Stages 1–15 and Batches 0–8D. |
| **Go Test Suite** | All Go packages (`go test -count=1 ./...`) | **PASS (100%)** | Engine, geometry, timeline, scene, protocol, sva, web, db, rasterizer. |
| **Go Race Detector** | Scene concurrency (`go test -race -count=1 ./pkg/engine/scene/...`) | **PASS** | Thread-safe scene snapshots, selection, and history. |
| **Go Vet** | Static analysis (`go vet ./...`) | **PASS** | Clean static analysis across all Go modules. |
| **Architecture Verification** | `bash scripts/verify-architecture.sh` | **PASS (10/10)** | ARCH-01 through ARCH-10 all verified. |
| **Runtime Verification** | `bash scripts/verify-runtime.sh` | **PASS (7/7)** | RUN-01 through RUN-07 all verified with 25 scripts. |
| **Dev Server HTTP Probe** | `curl http://127.0.0.1:8089/` | **HTTP 200 OK** | Embedded static assets served properly. |

---

## 2. Regression Harness: Scenario 73 Verification

A dedicated regression scenario (**Scenario 73: Batch 8D Modularisation & Global Controller Lifecycle Verification**) was implemented in `scripts/regression-harness.js`:

```javascript
[HARNESS] Testing Scenario 73: Batch 8D Modularisation & Global Controller Lifecycle Verification...
[HARNESS] Scenario 73 Test 1: Extracted controller availability...
[HARNESS] Scenario 73 Test 2: Controller initialization idempotency...
[HARNESS] Scenario 73 Test 3: WorkspaceController panel operations...
[HARNESS] Scenario 73 Test 4: CustomColorPicker color mathematics...
[HARNESS] Scenario 73 Test 5: TimelinePlayer state transitions...
[HARNESS] Scenario 73 Test 6: SVGExportAdapter XML serialization...
[HARNESS] Scenario 73 PASS: Batch 8D Modularisation & Global Controller Lifecycle Verification verified.
```

### Verified Properties in Scenario 73:
1. **Controller Availability:** Verified that `window.WorkspaceController`, `window.FloatingPropertiesEditor`, `window.TimelinePlayer`, `window.CustomColorPicker`, `window.StudioNotification`, `window.SVGExportAdapter`, `window.serializeSVGForExport`, `window.renderLayersList`, and `window.populateShapeDropdowns` are all properly defined as functions/objects on `window`.
2. **Initialization Idempotency:** Verified that executing `.init()` multiple times on `WorkspaceController`, `FloatingPropertiesEditor`, `TimelinePlayer`, and `CustomColorPicker` does not throw, duplicate event listeners, or corrupt internal state.
3. **Workspace Operations:** Verified left/right drawer toggling, drawer state queries (`isLeftDrawerOpen()`, `isRightDrawerOpen()`), accordion expansion by header ID, and stage maximize state tracking.
4. **Color Mathematics:** Verified HSV to RGB conversion and bidirectional Hex-to-RGB-to-Hex consistency across boundary color spaces.
5. **Timeline State Machine:** Verified player state transitions (`'stopped'`, `'playing'`, `'paused'`), seek time updates, and stop time reset to `0.0`.
6. **XML Export Serialization:** Verified environment detection (throwing clear errors when browser XML APIs are missing) and correct XML declaration and `xmlns:xlink` namespace injection during export.

---

## 3. Architecture Script Verification (`verify-architecture.sh`)

```
==================================================
SVG Animator Studio Architecture Verification
==================================================
ARCH-01: Layer 1 Presentation Separation: PASS
ARCH-02: Shape Registry Centralisation: PASS
ARCH-03: Workspace & Drawer System: PASS
ARCH-04: Floating Contextual Properties Inspector: PASS
ARCH-05: Stage Viewport & Gesture Integration: PASS
ARCH-06: SVG Element Builders Separation: PASS
ARCH-07: Public API Method Parity: PASS
ARCH-08: Global Namespace Discipline: PASS
ARCH-09: No Circular Dependencies: PASS
ARCH-10: Script Tag Order Consistency: PASS
==================================================
Results: 10 passed, 0 failed, 0 warnings
Overall: ALL ARCHITECTURAL CHECKS PASSED
==================================================
```

---

## 4. Runtime Script Verification (`verify-runtime.sh`)

```
==================================================
SVG Animator Studio Runtime Verification
==================================================
RUN-01: Syntax validation (Node -c on all JS): PASS (25 files verified)
RUN-02: WASM compilation & binary validation: PASS
RUN-03: Go test suite: PASS
RUN-04: Go static analysis (go vet): PASS
RUN-05: Embedded static assets check: PASS
RUN-06: REST API endpoint checks: PASS
RUN-07: Database integrity and migrations: PASS
==================================================
Results: 7 passed, 0 failed
Overall: ALL RUNTIME CHECKS PASSED
==================================================
```

---

## 5. Web Server Test Verification (`server_test.go`)

`internal/web/server_test.go` verifies that all 25 scripts listed in `expectedScripts` exist in `internal/web/static/js/`, are embedded via `//go:embed`, and are linked in `index.html` in exact sequential order:
- `TestEmbeddedStaticAssetsAndScriptOrder`: PASS
- `TestIndexPageServesExpectedAssets`: PASS
- `TestProjectAPI`: PASS
- `TestAssetUploadAndRetrieve`: PASS
- `TestRenderEndpointValidation`: PASS
