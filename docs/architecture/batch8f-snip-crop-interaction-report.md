# SVG Animator Studio — Post-Carbon Remediation
## Batch 8F Architecture Report: Snip, Extract and Background Crop Interaction Integrity

**Date:** 2026-11-12  
**Baseline Commit:** `26bceb5`  
**Milestone:** Batch 8F — Snip, Extract and Background Crop Interaction Repair  
**Protected Release:** `v1.2.0`  
**Author:** SVG Animator Studio Development Agent

---

## 1. Executive Summary

During hands-on browser validation following Batches 8B–8E, two concrete user-facing regressions were identified in the interactive photo manipulation pipelines:

1. **Problem A — Snip / Extract Image:**
   - In background snip mode, dragging across the canvas defines a rectangular selection and displays a floating stage banner bar (`#bgExtractBar`) with a primary confirmation button labelled **"✓ Extract Image"** (`#btnConfirmExtract`).
   - Clicking this floating button appeared inert: the selection box disappeared, but no extracted image object was instantiated on the canvas or added to the scene.
   - Conversely, clicking **"📸 Capture Selected Area"** (`#btnCaptureSelectedArea`) in the accordion drawer successfully captured the pixels into the preview workspace.
2. **Problem B — Background Crop Interaction:**
   - Activating the background Crop tool displayed a crop bounding box over the canvas, but the cursor remained a crosshair and the bounding box could not be selected, grabbed, translated, or interactively resized using the mouse.
   - Although programmatic and drawer-driven crop operations still produced crop versions, the direct manipulation experience on the canvas was unusable.

Batch 8F conducted an exhaustive investigation across the presentation DOM, SVG overlay geometry, and browser pointer event pipelines. The underlying root causes were isolated, repaired, and validated across automated test suites without compromising Go/WASM engine authority or the non-destructive crop-commit pipeline.

---

## 2. Root Cause Analysis

### 2.1 Problem A: Inert Floating "✓ Extract Image" Button

Three compounding defects rendered `#btnConfirmExtract` ineffective:

1. **Pointer Event Interception by the Preview Wrapper:**
   - `#bgExtractBar` is rendered as a child of `#previewBox` (`.preview-wrapper`).
   - In `internal/web/static/js/stage.js`, the `pointerdown` event listener on `this.previewBox` lacked a guard for `.stage-banner-bar`.
   - When the user clicked `#btnConfirmExtract`, `pointerdown` bubbled to `previewBox`.
   - Because `this.isExtractingBg` was active, `stage.js` treated the click as the initiation of a *new* extraction drag, immediately resetting `this.bgExtractBox` to `{ x: pt.x, y: pt.y, w: 0, h: 0 }` and invoking `setPointerCapture`.
   - Consequently, when `confirmBgExtractMode()` executed, `this.bgExtractBox.w < 10` caused it to abort silently via `cancelBgExtractMode()`.
2. **Asymmetric Contract in `confirmBgExtractMode()`:**
   - In `stage.js:2269`, `confirmBgExtractMode()` conditionally checked:
     ```javascript
     if (window.ImageToolsController && typeof window.ImageToolsController.confirmBgSnip === 'function') {
       window.ImageToolsController.confirmBgSnip(box);
     } else if (typeof window.executeBackgroundExtraction === 'function') {
       window.executeBackgroundExtraction(box);
     }
     ```
   - Because `window.ImageToolsController.confirmBgSnip` was always defined, `window.executeBackgroundExtraction(box)` was never reached.
   - `confirmBgSnip(box)` only rendered the captured pixels into the hidden offscreen canvas in `#leftDrawer` (`#imageToolsPreviewCanvas`), without creating an Image Object on the canvas stage.
   - When the drawer was collapsed or closed, the user observed no visual response whatsoever.
3. **Mismatched Drawer Control ID in Dynamic Enablement:**
   - In `stage.js:873`, dragging the extraction box updated `document.getElementById('btnConfirmBgSnip')` rather than the visible drawer button `document.getElementById('btnCaptureSelectedArea')`.

### 2.2 Problem B: Non-Interactive Background Crop Bounding Box

Three architectural friction points blocked direct canvas manipulation during background crop:

1. **Missing Drag-to-Select Behavior:**
   - When background crop was initiated via `Stage.startBackgroundCropMode()`, the initial `cropBox` spanned the entire uncropped image (`100% × 100%`).
   - When the box spanned 100% of the image bounds (`init.w === ob.w`), the translation formula `newX = Math.max(ob.left, Math.min(ob.left + ob.w - init.w, init.x + dx))` locked `newX` to `ob.left`.
   - Furthermore, `pointerdown` in `stage.js` only listened for clicks directly on `.crop-handle` or `#cropBoxRect`. Clicking anywhere on the photo or stage hit an immediate `return;`.
   - The user had no mechanism to drag out a new crop rectangle with the crosshair cursor.
2. **Hit-Testing and Sub-Pixel Opacity Transparency:**
   - `#cropBoxRect` was defined in `index.html` with `fill="rgba(88, 166, 255, 0.001)"`.
   - In 8-bit RGBA color space, an alpha of `0.001` rounds to `0/255`, causing browser rendering engines (Chromium/WebKit) to treat the fill as unpainted during pointer hit testing.
   - Furthermore, `#cropBoxRect` and the 8 handles lacked explicit SVG presentation attributes (`pointer-events="all"`), relying solely on inline CSS styles inside an SVG subtree.
3. **Overlay Layer Pointer Event Masking:**
   - `#stageOverlayLayer` (`.stage-overlay-layer`) is styled in CSS with `pointer-events: none`.
   - While `this.trajectorySvg.style.pointerEvents = 'auto'` was toggled on, `#stageOverlayLayer` remained `pointer-events: none`, causing inconsistent pointer capture and cursor presentation across browser environments.
   - Explicit CSS cursor declarations (`cursor: move`, `cursor: nwse-resize`, etc.) were missing for active crop mode.

---

## 3. Implemented Repairs

### 3.1 Banner Bar Pointerdown Exclusion (`stage.js`)
Added a strict guard at the beginning of `previewBox`'s `pointerdown` listener:
```javascript
// Floating banner bar buttons should NOT trigger stage/canvas drag interactions
if (e.target && e.target.closest && e.target.closest('.stage-banner-bar')) {
  return;
}
```
This guarantees that clicks on floating action buttons (`#btnConfirmExtract`, `#btnCancelExtract`, `#btnApplyCrop`, `#btnResetCropInBar`, `#btnCancelCrop`) are cleanly delivered to button click handlers without corrupting active drag coordinates or stage state.

### 3.2 Unified Snip / Extract Execution Parity (`stage.js` & `app.js`)
1. **Dual Action in `confirmBgExtractMode()`:**
   `Stage.confirmBgExtractMode()` now orchestrates both the preview workspace update and the authoritative Image Object creation:
   ```javascript
   confirmBgExtractMode() {
     if (!this.isExtractingBg || !this.bgExtractBox || this.bgExtractBox.w < 10 || this.bgExtractBox.h < 10) {
       this.cancelBgExtractMode();
       return;
     }
     const box = Object.assign({}, this.bgExtractBox);
     this.cancelBgExtractMode();
     if (window.ImageToolsController && typeof window.ImageToolsController.confirmBgSnip === 'function') {
       window.ImageToolsController.confirmBgSnip(box, { silent: true });
     }
     if (typeof window.executeBackgroundExtraction === 'function') {
       window.executeBackgroundExtraction(box);
     }
   }
   ```
2. **Notification De-Duplication (`opts.silent`):**
   `ImageToolsController.confirmBgSnip(box, opts)` was updated to support `{ silent: true }`, suppressing duplicate preview notifications while allowing `executeBackgroundExtraction` to display the authoritative success toast: `Created "Background Snip N". Drag to reposition.`
3. **Synchronized Drawer Enablement:**
   `stage.js` now enables both `#btnConfirmExtract` and `#btnCaptureSelectedArea` when `w >= 10 && h >= 10`.

### 3.3 Interactive Crop Selection, Translation, and Resizing (`stage.js`, `index.html`, `style.css`)
1. **Interactive Crop Drag-to-Select (`cropDragMode === 'select'`):**
   - In `stage.js` `pointerdown`, if the user clicks when the crop box is full-size, or clicks anywhere outside the handles and unmaxed crop box:
     - `this.cropDragMode = 'select'` is activated.
     - On `pointermove`, a new rectangular crop region is dragged out, clamped cleanly to `cropOrigBounds`.
     - On `pointerup`, if the dragged region is at least `10×10` px, the new crop box is established. Taps/clicks (< 6px displacement) safely preserve the existing crop box.
2. **Interactive Translation & Handle Manipulation:**
   - When the crop box is smaller than the image, clicking `#cropBoxRect` activates `this.cropDragMode = 'move'`, translating the box across the image.
   - Clicking any of the 8 handles (`#cropHandle-[nw|n|ne|e|se|s|sw|w]`) activates directional resizing, updating `cropBox` and synchronizing the drawer in real time.
3. **SVG Hit-Testing & Overlay Pointer Events:**
   - `#cropBoxRect` fill was updated to `rgba(88, 166, 255, 0.08)`, providing a visible translucent highlight that guarantees painted hit testing in all browsers.
   - Explicit `pointer-events="all"` SVG attributes were added to `#cropBoxRect`, all 8 `.crop-handle` rects, `#clipBoxRect`, and all 8 `.clip-handle` rects.
   - `Stage.startCropMode` and `Stage.startClipMode` now enable `stageOverlayLayer.style.pointerEvents = 'auto'`, restoring `'none'` on cancellation.
4. **CSS Cursor Rules:**
   - Added scoped CSS rules under `.preview-wrapper.crop-mode-active` and `.preview-wrapper.clip-mode-active` ensuring `cursor: move` over the bounding box, `cursor: crosshair` across the canvas, and exact directional resize cursors over all 8 handles.

---

## 4. Verification and Non-Destructive Invariants

- **Engine Authority Preserved:** All background crop applications continue to dispatch via `EngineBridge.cropBackground(cropData)`.
- **Pixel Baking & Export Fidelity:** Crop version creation, canvas matching (`matchCanvasToPhoto`), and rasterization pipelines remain unchanged.
- **Regression Suite:** Added Scenario 75 covering Snip / Extract execution parity and background crop interactive selection, translation, and resizing.
- **Full Quality Gate:** Passed all Go unit tests (`100%`), race detector (`pkg/engine/scene`), architecture checks (`9 PASS, 1 WARNING ARCH-05`), runtime checks (`6 PASS, 1 NOT VERIFIED RUN-06`), and full regression harness (`REG-01, REG-02, REG-03 PASS`).
