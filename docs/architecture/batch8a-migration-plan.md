# SVG Animator Studio — Post-Carbon Go/WASM Authority Migration Plan

**Document Identifier:** `DOC-ARCH-BATCH8A-MIGRATION-PLAN`  
**Audit Batch:** Batch 8A (Post-Carbon Remediation)  
**Status:** CANONICAL MIGRATION ROADMAP  
**Baseline Commit:** `61ca201e42d9f4672aca75f9f8f42e3c02ddb073`  
**Target Release:** Post-v1.2.0 Hardening & Stage 16 Prerequisite  
**Date:** 2026-11-12  

---

## 1. Executive Summary & Migration Strategy

The Batch 8A audit confirmed that SVG Animator Studio possesses a powerful, highly capable Go/WASM authoritative engine (`pkg/engine/`), implementing 117 protocol commands with extensive test coverage. However, the frontend JavaScript layers (`scene-state.js`, `coordinator.js`, `engine-bridge.js`, `app.js`) retain remnants of a legacy architecture:
1. **Hydration side-effects:** Read-only presentation hydration dispatches mutation commands back across the WASM bridge, advancing Go scene revisions during undo/redo and project loading.
2. **Ignored Command Contracts:** High-level JavaScript presentation methods frequently discard Go return envelopes, producing false-success states when Go operations are rejected.
3. **Shadow Fallback Engines:** JavaScript maintains parallel persistent collections (`ImageObjects.list`, `ObjectGroups.list`) and a 380-line shadow timeline evaluator that silently bypasses Go on fresh editor sessions.
4. **Non-Atomic Operations:** Multi-step workflows like Image Baking and Background Cropping perform uncoupled bridge dispatches, risking partial failures and split-brain corruption.

### The Phased Strategy

To eliminate these violations without destabilizing the working studio or breaking existing user workflows, remediation is divided into three focused, sequential batches:

```
┌────────────────────────────────────────────────────────┐
│ Batch 8A: Read-Only Authority Audit (COMPLETED)        │
│ 12 Violations Registered, 437 Functions Cataloged      │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Batch 8B: State Authority, Contracts & Commit Ordering │
│ • Decouple Hydration from Mutation (A8A-001)           │
│ • Enforce Bridge Return Status Checking (A8A-004)       │
│ • Eliminate Destructive Snapshot Scraping (A8A-005)    │
│ • Authoritative Selection Synchronization (A8A-009)    │
│ • Atomic Image.Bake & Crop Commit Contracts (A8A-010)  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Batch 8C: Timeline, Geometry & Fallback Elimination    │
│ • Remove _sceneSynced Timeline Bypass (A8A-002)        │
│ • Deprecate In-Memory Shadow Fallbacks (A8A-003, 011)  │
│ • Go Authority for Camera/Optics Controls (A8A-006)    │
│ • Fix Unlayered Rendering Visibility Bypass (A8A-007)  │
│ • Harmonize Canvas Framing Defaults (A8A-008)          │
│ • Canonical Go ID Allocation (A8A-012)                 │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Batch 8D: Presentation & UI Modularisation             │
│ • Decompose app.js (6,700 lines) into UI Controllers   │
│ • Strictly Pure Presentation Layer (No Business Logic) │
│ • Verification Baseline for Stage 16 Readiness         │
└────────────────────────────────────────────────────────┘
```

---

## 2. Batch 8B — State Authority, Command Contracts & Atomic Commit Ordering

### 2.1 Scope & Findings Addressed
- `A8A-001` (P1) — Conflation of read-only presentation hydration with state mutation (`setLoadedPhoto`).
- `A8A-004` (P1) — AppCoordinator false-success return and unchecked bridge command results.
- `A8A-005` (P1) — Destructive scene snapshot scraping in `syncScene()`.
- `A8A-009` (P1) — Optimistic, fire-and-forget selection mutations in AppCoordinator.
- `A8A-010` (P1) — Non-atomic multi-step image bake and crop commit mutations.

### 2.2 Target Files & Modifications
1. **`internal/web/static/js/scene-state.js` & `app.js`:**
   - Decouple `setLoadedPhoto` into `setLoadedPhoto(photo, options)` where `options.skipBridgeDispatch = true` during project load and history restore.
   - Introduce `hydrateBackgroundPresentation(photo)` dedicated purely to DOM label and thumbnail updates.
2. **`internal/web/static/js/coordinator.js`:**
   - Refactor `moveSelectedNodes()` to verify `res && res.success`. If Go rejects the move (e.g. locked object), return `false` and suppress history recording.
   - Refactor `selectObject()` to await or verify `EngineBridge.setSelection()`, reconciling `this.activeSelection` from the authoritative Go envelope.
3. **`internal/web/static/js/engine-bridge.js` & `projects.js`:**
   - Deprecate `buildCurrentSceneSnapshot()` scraping of DOM/arrays.
   - Restrict `Scene.SetState` dispatch strictly to project load (`ProjectManager.loadProject`) and `.sva` restoration.
4. **`pkg/engine/protocol/commands.go` & `app.js`:**
   - Introduce atomic protocol command `Image.Bake`:
     ```go
     type ImageBakeRequest struct {
         ImageID scene.StringID `json:"id"`
         CanvasW float64        `json:"canvasWidth"`
         CanvasH float64        `json:"canvasHeight"`
     }
     ```
   - In `app.js:executeBakeImage()`, replace the 3-step sequence (`setBackground` -> `deleteImage` -> `recordImmediate`) with a single `EngineBridge.bakeImage()` call.
   - In `app.js:commitCurrentCrop()`, assert `res && res.success` before updating UI crop controls or clearing drag boxes.

### 2.3 Verification & Phase Gates
- **Automated Go Tests:** Add `TestDispatchImageBakeAtomic` and `TestDispatchSelectionContract` to `commands_test.go`.
- **Harness Verification:** Run `node scripts/regression-harness.js` (all 70 scenarios must pass).
- **Manual Verification:**
  - Verify Undo of background change does not advance Go scene revision counter.
  - Verify Bake Image on locked image fails gracefully with visible UI error and leaves original image intact.
  - Verify selecting locked node does not update `AppCoordinator.activeSelection`.

---

## 3. Batch 8C — Timeline, Geometry & Fallback Elimination

### 3.1 Scope & Findings Addressed
- `A8A-002` (P1) — Timeline frame evaluation bypassing Go WASM due to `_sceneSynced` gate.
- `A8A-003` (P1) — Parallel in-memory persistence fallback engines in `ImageObjects` and `ObjectGroups`.
- `A8A-006` (P2) — Camera, optics, and frame configurations scraping DOM on every frame.
- `A8A-007` (P2) — Unlayered object rendering in `buildFullSVG` bypassing layer visibility.
- `A8A-008` (P3) — Inconsistent photo fit defaults (`contain` vs `match`).
- `A8A-011` (P2) — `LayerManager._fallbackReorder` mutating local arrays when WASM is unready.
- `A8A-012` (P2) — Pre-allocation of object IDs via JavaScript counter variables.

### 3.2 Target Files & Modifications
1. **`internal/web/static/js/engine-bridge.js`:**
   - Remove `_sceneSynced` requirement from `evaluateSceneAtTime()`. Ensure that once `isReady()` is true, all timeline evaluations route exclusively to Go `Timeline.EvaluateSceneAtTime`.
   - Remove the 380-line shadow JS timeline evaluator (`_evaluateSceneAtTimeJS`) or gate it behind an explicit debug flag.
   - Remove offline shadow persistence in `ImageObjects.list` and `ObjectGroups.list`. If `!this.isReady()`, persistent mutating operations must throw or return `{ success: false, error: "Engine not ready" }`.
   - Remove `LayerManager._fallbackReorder()`.
2. **`internal/web/static/js/scene-state.js`:**
   - Update `buildRenderState()` to accept authoritative camera and optics models from Go scene snapshot rather than scraping DOM inputs on every frame.
   - In `buildFullSVG()`, add `LayerManager.getEffective(id).visible` check to the unlayered fallback loop (lines 435–475).
   - Harmonize `photoFitSelect` default in `getDefaultControls()` to `'match'`.
3. **`internal/web/static/js/nodes.js` & `flows.js`:**
   - Remove optimistic JS counter pre-allocation (`node-${this.counter}`). Let Go assign the canonical sequential ID and return it to JavaScript.

### 3.3 Verification & Phase Gates
- **Automated Tests:** Add regression test asserting `EngineBridge.getActiveEngineName()` returns `'WASM'` on fresh launch during playback.
- **Visual Tests:** Verify unlayered node with `visible: false` is excluded from exported SVG.
- **Harness:** Zero regressions across all 70 test scenarios.

---

## 4. Batch 8D — Presentation & UI Modularisation

### 4.1 Scope & Architecture
With all persistent state, history, selection, geometry, and timeline calculations strictly owned by Go/WASM, `app.js` (currently 6,700 lines) can safely be decomposed into lightweight, presentation-only UI controllers.

### 4.2 Modular Decomposition Plan
```
internal/web/static/js/
├── app.js                         (Application bootstrap & event wiring: ~500 lines)
├── presentation/
│   ├── stage-viewport.js          (Pan, zoom, drag gesture listening: ~800 lines)
│   ├── toolbar-controller.js      (Top & side button rail click handlers: ~600 lines)
│   ├── context-editor.js          (Floating property inspector DOM syncing: ~900 lines)
│   ├── crop-overlay-controller.js (Crop rect bounding box & drag handles: ~650 lines)
│   ├── timeline-ui-controller.js  (Playhead dragging, scrubber DOM, play/pause: ~750 lines)
│   └── modal-controller.js        (Settings, hotkey help, confirmation modals: ~500 lines)
```

### 4.3 Boundaries & Invariants
- **No Domain Logic:** Presentation controllers must not contain shape math, path routing, or object state caching.
- **Unidirectional Delegation:** UI events -> `AppCoordinator` -> `EngineBridge` -> Go WASM Engine -> Response / Patch -> UI Presenter.
- **Preserved DOM IDs:** All existing HTML element IDs and CSS selectors remain identical to preserve compatibility.

---

## 5. Risk Assessment & Mitigation Table

| Risk | Severity | Affected Phase | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Breaking Undo/Redo during Hydration Refactor** | High | Batch 8B | Strict protocol isolation: test that `History.Undo` does not emit `Background.Set` or advance scene revision counter. |
| **Stall on Editor Launch if Go WASM fails** | Medium | Batch 8C | Display an explicit, non-destructive modal banner if WASM fails to load, rather than silently running a broken shadow JS engine. |
| **Export Divergence during Camera State Migration** | Medium | Batch 8C | Run pixel-parity still export comparison against protected `v1.2.0` baseline before and after change. |
| **Event Listener Regressions during Modularisation** | Medium | Batch 8D | Decompose `app.js` one controller at a time; run full 70-scenario harness after extracting each controller. |

---

## 6. Definition of Done for Authority Remediation

The migration is complete and the architecture is compliant when:
1. All 12 findings in `docs/architecture/batch8a-authority-violation-register.csv` are marked `RESOLVED`.
2. `EngineBridge.getActiveEngineName()` returns `'WASM'` unconditionally across all editor sessions.
3. No shadow persistent object arrays exist in JavaScript.
4. Presentation hydration does not advance the Go scene revision.
5. `app.js` is decomposed into modular controllers under 1,000 lines each.
6. All Go unit tests, race tests, and regression harnesses pass with zero failures.
