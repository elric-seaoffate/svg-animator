# Batch 8D — Behaviour-Preserving JavaScript Modularisation and Go/WASM Boundary Verification

**Project:** SVG Animator Studio  
**Milestone:** Post-Carbon Review Remediation — Batch 8D  
**Repository:** `/root/projects/svg-animator`  
**Branch:** `main`  
**Baseline Commit:** `3ea4d5c016adff705c8603b607dd11d5f5dbdfe3`  
**Protected Release:** `v1.2.0`  
**Dev Preview Port:** `http://127.0.0.1:8089/`  
**Date:** 2026-11-12  

---

## 1. Executive Summary

Batch 8D completes the architectural consolidation phase of the post-Carbon review remediations. Following the elimination of the JavaScript shadow engine in Batch 8C, `internal/web/static/js/app.js` remained a monolithic presentation file spanning 7,839 lines. This monolith mixed UI workspace management, property inspection, timeline controls, color manipulation, layer management, notification toasts, XML export adapters, and canvas image manipulation.

The objective of Batch 8D was to safely decompose `app.js` by extracting clearly separated presentation controllers into dedicated Layer 1 JavaScript modules without:
1. Re-introducing any shadow JavaScript state or business logic.
2. Breaking or altering any public `window.*` API contracts.
3. Disrupting script load order or DOM event lifecycles.
4. Regressing pixel composition or non-destructive cropping.

All objectives have been successfully achieved. `app.js` has been reduced from **7,839 lines** to **3,747 lines** (a **52.2% reduction**, with 4,092 lines cleanly extracted). All 73 regression scenarios, Go test suites, and architecture verification checks pass with zero regressions.

---

## 2. Line Count and Code Distribution Analysis

### 2.1 Monolith Reduction
| Metric | Pre-Batch 8D (`3ea4d5c`) | Post-Batch 8D | Change |
|---|---|---|---|
| `app.js` Line Count | 7,839 lines | 3,747 lines | -4,092 lines (-52.2%) |
| Presentation Modules | 1 monolith (`app.js`) | 8 dedicated modules + 1 core controller | +8 modules |
| Total Scripts in `index.html` | 17 scripts | 25 scripts | +8 scripts |

### 2.2 Extracted Presentation Modules

| Module Name | File Location | Line Count | Primary Presentation Responsibility |
|---|---|---|---|
| `shape-dropdown.js` | `internal/web/static/js/shape-dropdown.js` | 85 | Shape selector dropdowns & preset options |
| `export-adapter.js` | `internal/web/static/js/export-adapter.js` | 59 | Browser XML parsing, namespace injection & export serialization |
| `workspace.js` | `internal/web/static/js/workspace.js` | 541 | Sliding drawers, icon rails, accordions & stage maximization |
| `notifications.js` | `internal/web/static/js/notifications.js` | 75 | Studio toast notifications & status messaging |
| `color-picker.js` | `internal/web/static/js/color-picker.js` | 461 | Color popover, swatch palette, HSV/RGB conversion |
| `timeline.js` | `internal/web/static/js/timeline.js` | 276 | Playback transport, timeline scrubber & timecode display |
| `layers-ui.js` | `internal/web/static/js/layers-ui.js` | 861 | Layer stack DOM list, reorder buttons, lock/visibility toggles |
| `context-editor.js` | `internal/web/static/js/context-editor.js` | 1,781 | Floating contextual property inspector & form bindings |
| **Total Extracted** | | **4,139** | |

### 2.3 Retained Code in `app.js` (3,747 lines)
Per Phase D guidance, the following responsibilities were deliberately retained in `app.js`:
- **Studio Lifecycle & Bootstrapping:** Initial DOM queries, event hub wiring, coordinator hookups, and WASM readiness listeners.
- **`ImageToolsController` & Image Baking Pipeline:** Canvas raster operations, crop-clip polygon tracking, snip mask calculations, pointer scaling with `getEffectiveScale()`, and `executeBakeImage` execution. This preserves the delicate pixel-perfect compositions verified in Batch 5.
- **Stage Drag and Coordinate Orchestration:** Top-level stage mouse event routing and gesture transitions.

---

## 3. Strict Script Loading Order

The updated script declaration sequence in `internal/web/static/index.html` adheres strictly to architectural layer dependencies:

```html
<!-- Layer 0: WASM Runtime -->
<script src="js/wasm_exec.js"></script>

<!-- Layer 2: Core Engine Bridge & Authoritative State -->
<script src="js/engine-bridge.js"></script>
<script src="js/state.js"></script>

<!-- Layer 3: Central Operational Shape Registry -->
<script src="js/shape-registry.js"></script>

<!-- Layer 1: Presentation Adapters & Foundation -->
<script src="js/shape-dropdown.js"></script>
<script src="js/objects.js"></script>
<script src="js/stage.js"></script>
<script src="js/export-adapter.js"></script>
<script src="js/workspace.js"></script>
<script src="js/notifications.js"></script>
<script src="js/color-picker.js"></script>
<script src="js/timeline.js"></script>
<script src="js/layers-ui.js"></script>
<script src="js/context-editor.js"></script>

<!-- Layer 2: Coordinators & Managers -->
<script src="js/selection.js"></script>
<script src="js/history.js"></script>
<script src="js/projects.js"></script>
<script src="js/groups.js"></script>
<script src="js/layers.js"></script>
<script src="js/alignment.js"></script>
<script src="js/clipboard.js"></script>

<!-- Layer 1: Export Studios -->
<script src="js/export-modal.js"></script>
<script src="js/still-export-modal.js"></script>

<!-- Layer 2: Central Coordinator Hub -->
<script src="js/coordinator.js"></script>

<!-- Layer 1: Main Application Entry Point & Image Tools -->
<script src="js/app.js"></script>
```

This sequence is verified automatically by `internal/web/server_test.go` (`TestEmbeddedStaticAssetsAndScriptOrder`) and `scripts/verify-architecture.sh` (`ARCH-10`).

---

## 4. Preservation of Public Contracts and Backward Compatibility

Every extracted controller preserves its exact public API attached to `window`:
- `window.ensureShapeInDropdown` & `window.populateShapeDropdowns` (`shape-dropdown.js`)
- `window.SVGExportAdapter` & `window.serializeSVGForExport` (`export-adapter.js`)
- `window.WorkspaceController`, `window.openAccordionById`, `window.toggleAllAccordions` (`workspace.js`)
- `window.StudioNotification` (`notifications.js`)
- `window.CustomColorPicker` (`color-picker.js`)
- `window.TimelinePlayer` (`timeline.js`)
- `window.renderLayersList`, `window.updateLayersToolbarState`, `window.initLayersToolbarEvents`, `window.syncInspectorLayerSections`, `window.initInspectorLayerSectionEvents`, `window.syncImageEditorUI`, `window.initImageEditorEvents` (`layers-ui.js`)
- `window.FloatingPropertiesEditor` (`context-editor.js`)
- `window.executeBakeImage` (`app.js`)

All initialization methods are idempotent. Re-invoking `.init()` on any controller does not duplicate event listeners or create conflicting observers.

---

## 5. Verification Results

1. **Regression Harness (`scripts/regression-harness.js`):**
   - Added Scenario 73 verifying extracted controllers, idempotency, drawer actions, color conversion, timeline playback, and XML export serialization.
   - All 73 scenarios PASS (100%).
2. **Go Test Suite:**
   - `go vet ./...`: 0 warnings, clean.
   - `go test -count=1 ./...`: All unit and integration tests pass.
   - `go test -race -count=1 ./pkg/engine/scene/...`: Concurrency and race verification passes.
3. **Architecture Verification (`scripts/verify-architecture.sh`):**
   - ARCH-01 through ARCH-10: All 10 checks pass.
4. **Runtime Verification (`scripts/verify-runtime.sh`):**
   - RUN-01 through RUN-07: All 7 checks pass across 25 scripts.
5. **Live Server Verification:**
   - HTTP probe on `http://127.0.0.1:8089/` returns `200 OK`.
