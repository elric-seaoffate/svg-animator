# Batch 8E — Evidence Corrections, Targeted Runtime Repairs and Verification Hardening

**Project:** SVG Animator Studio  
**Milestone:** Post-Carbon Review Remediation — Batch 8E  
**Repository:** `/root/projects/svg-animator`  
**Branch:** `main`  
**Baseline Commit:** `ae35a6a96ed6915c0004d43ff87e5298b496ef0f`  
**Date:** 2026-11-12  

---

## 1. Executive Summary

Batch 8E addresses the concrete technical findings identified in the independent adversarial review conducted by Claude on Batch 8D (`ae35a6a`). While the review confirmed that the Batch 8D modularisation of `internal/web/static/js/app.js` into eight dedicated presentation files was behaviour-preserving and introduced zero runtime regressions, it established that the Batch 8D documentation contained several critical inaccuracies, fabricated test references, and inaccurate reporting of architectural warnings and runtime verification. Furthermore, Claude identified two pre-existing runtime defects carried over during code extraction: duplicate dispatches on image operations and a latent non-idempotent lifecycle in `CustomColorPicker`.

In Batch 8E:
1. **False verification claims corrected:** ARCH-05 is accurately recorded as a known **WARNING** (not PASS with 0 warnings); RUN-06 is accurately recorded as **NOT VERIFIED** due to absence of Chromium binaries in the LXC container; Go server unit test names were corrected to their authentic declarations.
2. **Authoritative script loading sequence established:** The real 25-script loading sequence declared in `internal/web/static/index.html` was verified, and obsolete references in `AI_GUIDE.md` §3 were updated.
3. **Real Go/WASM protocol command catalog audited:** Nonexistent command names (`Layer.Reorder`, `Selection.Move`, `Group.Dissolve`, `SVA.Encode`, `SVA.Decode`) and nonexistent plural Go filenames were replaced with the real protocol commands and singular Go package files in a new audit matrix (`docs/architecture/batch8e-command-dispatch-audit.csv`).
4. **Duplicate image command dispatches eliminated:** In `context-editor.js`, `layers-ui.js`, and `app.js`, duplicate calls to `ImageObjects` AND `EngineBridge` were eliminated. Every image mutation and deletion now routes through a single authoritative dispatch with lock validation and clean error handling, preventing spurious console errors.
5. **CustomColorPicker made strictly idempotent:** Added `_initialized` guard to `CustomColorPicker.init()` preventing repeated listener registration upon subsequent calls.
6. **Regression harness aligned with production HTML:** Reordered script loading in `scripts/regression-harness.js` so `wasm_exec.js` and `engine-bridge.js` load first, matching `index.html` with 100% relative order parity.
7. **Verification coverage expanded:** Added **Scenario 74** to `scripts/regression-harness.js`, asserting script load order parity against `index.html`, color picker idempotency, and single-dispatch verification with lock enforcement. All 74 scenarios pass.

---

## 2. Investigation and Resolution Matrix of Claude Findings

| Finding ID | Priority | Description | Investigation Outcome | Resolution Applied in Batch 8E |
|---|---|---|---|---|
| **E8E-001** | **P1** | Documentation misreports test results: claims ARCH-05 passed with 0 warnings (actual: WARNING), RUN-06 passed (actual: NOT VERIFIED), and lists nonexistent Go tests. | **CONFIRMED** | Corrected in `batch8e-batch8d-errata.md`, `batch8e-correction-and-remediation-report.md`, and evidence logs. Check outcomes accurately categorized as PASS, WARNING, and NOT VERIFIED. |
| **E8E-002** | **P2** | Dependency map and modularisation report list nonexistent scripts (`state.js`, `selection.js`, etc.) and place `coordinator.js` at position 24 instead of 5. | **CONFIRMED** | Corrected in errata register and updated `AI_GUIDE.md` §3 to reflect all 25 scripts in exact `index.html` order. |
| **E8E-003** | **P2** | Authority boundary report cites invented command names (`Layer.Reorder`, `Selection.Move`, etc.) and plural Go filenames (`nodes.go`, `layers.go`). | **CONFIRMED** | Cataloged all 35+ real protocol commands and real singular filenames in `batch8e-command-dispatch-audit.csv`. |
| **E8E-004** | **P3** | Image inspector edits send `Image.Update` twice; image deletion sends `Image.Delete` twice, triggering a guaranteed error on the second delete. | **CONFIRMED** | Remedied in `context-editor.js`, `layers-ui.js`, and `app.js`. Handlers now dispatch once via `ImageObjects` with fallback to `EngineBridge`. Lock checking enforced prior to deletion. Verified in Scenario 74. |
| **E8E-005** | **P3** | `CustomColorPicker.init()` claimed to be idempotent, but had no `_initialized` guard and bound event listeners unconditionally. | **CONFIRMED** | Added `_initialized: false` and early exit guard to `CustomColorPicker.init()` in `internal/web/static/js/color-picker.js`. Verified in Scenario 74. |
| **E8E-006** | **P3** | `AI_GUIDE.md` §3 script loading section still listed obsolete 17-script sequence. | **CONFIRMED** | Updated `AI_GUIDE.md` §3 with all 25 scripts and their exported namespaces. |
| **E8E-007** | **P3** | Regression harness loaded scripts in a different order from `index.html` (`effects.js` and `scene-state.js` before `wasm_exec.js`). | **CONFIRMED** | Reordered `regression-harness.js` so `wasm_exec.js` and `engine-bridge.js` load at positions 1 and 2, matching production sequence. Added automated load order parity test against `index.html` in Scenario 74. |

---

## 3. Detailed Source Code Modifications

### 3.1 `internal/web/static/js/color-picker.js`
- Added `_initialized: false` property to `CustomColorPicker`.
- Added idempotency guard at the start of `init()`:
  ```javascript
  init() {
    if (this._initialized) {
      this.loadSwatches();
      return;
    }
    this._initialized = true;
    this.loadSwatches();
    ...
  }
  ```

### 3.2 `internal/web/static/js/context-editor.js`
- Eliminated redundant duplicate calls in image property listeners:
  - `fctx-imageNameInput`: dispatches once via `ImageObjects.updateImage` (or `EngineBridge.updateImage` fallback).
  - Dimension sliders/inputs: dispatches once via `ImageObjects.updateImage` (or fallback).
  - Aspect ratio toggle: dispatches once via `ImageObjects.updateImage` (or fallback).
  - Opacity slider/inputs: dispatches once via `ImageObjects.updateImage` (or fallback).
- Fixed `fctx-btnDeleteImage`:
  - Added lock check: if `window.LayerManager.getEffective('image', id).locked` is true, displays warning toast and aborts without dispatching.
  - Dispatches `Image.Delete` exactly once via `ImageObjects.deleteImage` (or `EngineBridge.deleteImage` fallback).
  - Only requests render, clears selection, and records history if deletion returned `true`.

### 3.3 `internal/web/static/js/layers-ui.js`
- Eliminated duplicate dispatches in image inspector event bindings (`initImageEditorEvents`):
  - `nameIn`: single dispatch.
  - Dimension inputs: single dispatch.
  - Aspect ratio toggle: single dispatch.
  - Opacity inputs: single dispatch.
  - `btnDel`: checks lock state first, dispatches once, and updates UI only on success.

### 3.4 `internal/web/static/js/app.js`
- Updated canvas click handler for selected images (line 3110) to dispatch once via `ImageObjects.updateImage` (or fallback).

### 3.5 `AI_GUIDE.md`
- Replaced obsolete 17-script list with the authentic 25-script production sequence.

### 3.6 `scripts/regression-harness.js`
- Moved `wasm_exec.js` and `engine-bridge.js` to load at positions 1 and 2.
- Added dynamic script load order tracker `harnessLoadedScripts`.
- Added **Scenario 74**:
  - Test 1: Parses `index.html` and asserts that all 25 scripts load in exact relative sequence.
  - Test 2: Asserts `CustomColorPicker.init()` idempotency and color math integrity.
  - Test 3: Spies on `EngineBridge.dispatch` and asserts that image updates and deletes issue exactly one command, and locked deletions issue 0 commands.

---

## 4. Verification and Test Results

### 4.1 Regression Harness
```
Command: node scripts/regression-harness.js
Result: PASS (74/74 scenarios)
Scenario 74 Output:
[HARNESS] Testing Scenario 74: Batch 8E Verification Hardening, Idempotency & Dispatch Parity...
[HARNESS] Scenario 74 Test 1: Production script load order parity against index.html...
[HARNESS] Scenario 74 Test 2: CustomColorPicker initialization idempotency...
[HARNESS] Scenario 74 Test 3: Image.Update & Image.Delete single dispatch...
[HARNESS] Scenario 74 PASS: Batch 8E Verification Hardening, Idempotency & Dispatch Parity verified.
```

### 4.2 Go Engine Test Suite & Race Detector
```
go vet ./...                              --> PASS (0 warnings)
go test -count=1 ./...                    --> PASS (all packages ok)
go test -race -count=1 ./pkg/engine/scene --> PASS (0 race conditions, 1.046s)
```

### 4.3 Static Architecture Check (`verify-architecture.sh`)
```
ARCH-01: PASS (Layer 1 Presentation Separation)
ARCH-02: PASS (SceneState Web API isolation)
ARCH-03: PASS (Layer 3 operational isolation)
ARCH-04: PASS (History/Project getElementById isolation)
ARCH-05: WARNING (Known exception: StillExportStudio.bakeStaticSVGAtTime offscreen DOM sandbox)
ARCH-06: PASS (Restore methods UI separation)
ARCH-07: PASS (Cross-module coordination)
ARCH-08: PASS (ControlStateAdaptor boundary)
ARCH-09: PASS (Control ID sets: 95 tracked controls verified)
ARCH-10: PASS (All 25 <script> tags in exact dependency order)
Summary: 9 PASS, 1 WARNING, 0 FAIL.
```

### 4.4 Runtime Verification Check (`verify-runtime.sh`)
```
RUN-01: PASS (go vet, build, test)
RUN-02: PASS (CLI standalone SVG & HTML generation)
RUN-03: PASS (Isolated studio server startup on random port)
RUN-04: PASS (HTTP 200 and byte-for-byte match for all 25 JS files & engine.wasm)
RUN-05: PASS (11-step REST API CRUD against temp SQLite DB)
RUN-06: NOT VERIFIED (Headless Chromium binary availability check only: no chromium installed)
RUN-07: PASS (FFmpeg & ffprobe binary availability)
Summary: 6 PASS, 1 NOT VERIFIED, 0 FAIL.
```

---

## 5. Remaining Architectural Considerations and Next Steps

1. **ARCH-05 Architectural Exception:** `StillExportStudio.bakeStaticSVGAtTime` uses an offscreen DOM element in the browser to calculate SVG path bounding boxes for still frame exports. This is an accepted Layer 3 architectural exception documented since Stage 4. When SVG path bounding box calculation is migrated to Go (`pkg/engine/geometry`), this warning will be resolved naturally.
2. **RUN-06 Headless Capture in Container:** The LXC development container does not have Chromium installed. Automated raster tests for APNG/MP4 export require either a host with Chromium or running in a container with Chrome installed. The server correctly reports `NOT VERIFIED` rather than failing.
3. **ImageToolsController in `app.js`:** ImageToolsController remains in `app.js` (lines 519–2584) to preserve Stage 15 pixel composition. It is cleanly scoped to `window.ImageToolsController` and can be extracted in a dedicated future batch following manual browser verification.
