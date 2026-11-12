# SVG Animator Studio — Post-Carbon Remediation
## Batch 8F Regression Tests: Snip, Extract and Background Crop Interaction Verification

**Date:** 2026-11-12  
**Milestone:** Batch 8F  
**Scope:** Automated scenario coverage, assertion matrix, and verification logs

---

## 1. Scenario 75 Test Specification

Scenario 75 was added to `scripts/regression-harness.js` to ensure permanent prevention of user-reported regressions across Snip/Extract and Crop interactions.

### 1.1 Test 1: Snip / Extract Execution Parity & Non-Inert Floating Button
- **Preconditions:**
  - Background photo loaded into scene and Go engine via `window.setLoadedPhoto` and `EngineBridge.setBackground`.
- **Steps & Invariants Tested:**
  1. `Stage.startBgExtractMode()` sets `isExtractingBg = true` and shows `#bgExtractBar`.
  2. `#btnConfirmExtract` is initially disabled (`disabled === true`).
  3. Simulating canvas drag (`pointerdown` at (100, 100), `pointermove` to (400, 300), `pointerup`) sets `bgExtractBox` to valid dimensions (>= 10×10 px).
  4. Both `#btnConfirmExtract` (floating button) and `#btnCaptureSelectedArea` (drawer button) are dynamically enabled (`disabled === false`).
  5. **Banner Bar Guard Invariant:** Clicking `#btnConfirmExtract` does not fire stage dragging or wipe `bgExtractBox` to 0×0.
  6. **Execution Parity:** Invoking `confirmBgExtractMode()` calls:
     - `window.executeBackgroundExtraction(box)` with exact coordinates to create the Image Object in the Go engine.
     - `window.ImageToolsController.confirmBgSnip(box, { silent: true })` to populate the preview card without competing notification toasts.
  7. Extraction mode cleanly exits (`isExtractingBg === false`, `#bgExtractBar` hidden).

### 1.2 Test 2: Background Crop Selection, Translation & Handle Manipulation
- **Preconditions:**
  - Background photo loaded (`1280×720`).
- **Steps & Invariants Tested:**
  1. `Stage.startBackgroundCropMode()` sets `isCroppingImage = true`, `isCroppingBackground = true`, shows `#cropOverlayGroup`, and adds class `crop-mode-active` to `#previewBox`.
  2. `#stageOverlayLayer.style.pointerEvents` is set to `'auto'` during crop.
  3. **Drag-to-Select Invariant (Full-size box):** Dragging across the canvas activates `cropDragMode = 'select'`, updating `Stage.cropBox` clamped to image bounds.
  4. **Drag-to-Move Invariant (Interior click):** Clicking the interior of `#cropBoxRect` activates `cropDragMode = 'move'`, translating `cropBox` by delta while preserving dimensions.
  5. **Handle Manipulation Invariant (Resize click):** Clicking `.crop-handle#cropHandle-se` activates `cropDragMode = 'se'`, resizing width and height proportionately.
  6. **Apply Crop Dispatch Invariant:** `Stage.applyCropMode()` dispatches `EngineBridge.cropBackground(cropData)` with matching final coordinates, exits crop mode (`isCroppingImage === false`), removes `crop-mode-active`, and restores `#stageOverlayLayer.style.pointerEvents = 'none'`.

---

## 2. Test Execution Results Matrix

| Test Suite / Script | Command | Expected Outcome | Actual Result | Status |
|---|---|---|---|---|
| **Go Engine & Package Vet** | `go vet ./...` | Exit code 0, no diagnostic warnings | Exit code 0 | **PASS** |
| **Go Unit Tests** | `go test -count=1 ./...` | All packages pass | 11 packages ok | **PASS** |
| **Go Scene Race Detector** | `go test -race -count=1 ./pkg/engine/scene/...` | 0 data races detected | 0 races, 1.046s | **PASS** |
| **Static Architecture Scan** | `bash scripts/verify-architecture.sh` | 9 PASS, 1 accepted WARNING (ARCH-05) | 9 PASS, 1 WARNING | **PASS** |
| **Runtime & Deployment Scan** | `bash scripts/verify-runtime.sh` | 6 PASS, 1 expected NOT VERIFIED (RUN-06) | 6 PASS, 1 NOT VERIFIED | **PASS** |
| **Regression Harness** | `node scripts/regression-harness.js` | Scenarios 1–75 pass, REG-01..03 pass | All 75 Scenarios PASS | **PASS** |
| **Git Diff Whitespace Check** | `git diff --check` | Exit code 0, no whitespace errors | Exit code 0 | **PASS** |
| **Dev Server HTTP Health** | `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8089/` | HTTP 200 | HTTP 200 | **PASS** |
