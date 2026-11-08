# Phase 2: Component APIs & Shape Registry — Progress Log

This document records the progress, verification checkpoints, test results, and outstanding technical debt for **Phase 2 (Component APIs & Shape Registry)** of the SVG Animator Studio modernization roadmap.

---

## 1. Stage Progress & Git Milestones

| Stage | Description | Status | Primary Commit(s) | Key Deliverables |
| :--- | :--- | :---: | :---: | :--- |
| **Stage 2.1** | Immutable SVG Shape Registry | **Complete** | [`f229c89`](https://127.0.0.1:3000/nigel/svg-animator/commit/f229c89) | Created `internal/web/static/js/shape-registry.js` with 12 frozen shape builders; decoupled shape SVG generation from `nodes.js`. |
| **Stage 2.2** | UI Shape Selection Integration | **Complete** | [`c1155bc`](https://127.0.0.1:3000/nigel/svg-animator/commit/c1155bc) | Implemented `populateShapeDropdowns` and `ensureShapeInDropdown` in `app.js`; dynamic dropdown population for `#nodeShapeSelect` and `#presetVal-shape`; unknown shape fallback preservation. |
| **Stage 2.3** | Targeted Component APIs | **Complete** | *In Review* | Standardized `DataFlows.setActiveWaypointIndex`, `NodePresets.resetToDefaults`, component deselect sync with `AppCoordinator`, and removed temporary runtime monkey-patching in `app.js`. |
| **Stage 2.4** | Restoration/UI Refresh Decoupling | **Planned** | *Pending* | Decouple direct presentation calls from `HistoryManager` and `ProjectManager` (remediating architectural warning `ARCH-06`). |

---

## 2. Automated Verification Results

All automated test suites were executed on commit `c1155bc` and verified passing:

1. **JavaScript Regression Harness (`node scripts/regression-harness.js`):**
   - **Status: PASS**
   - `REG-02 PASS`: Stage 1 & 2 operational state, pure geometry math, shape presets, CRUD operations, and immutable Shape Registry API verified.
   - `REG-03 PASS`: Stage 3 & 4 object selection coordination, undo/redo history depth (50 snapshots), schema `1.2.0` serialization/deserialization, full SVG compilation, and UI shape dropdown integration verified.
2. **Go Backend Validation (`go vet ./...` & `go test ./...`):**
   - **Status: PASS**
   - `go vet ./...`: Zero issues reported across all packages (`cmd/`, `internal/db`, `internal/effects`, `internal/generator`, `internal/rasterizer`, `internal/web`).
   - `go test ./...`: All unit tests passed cleanly using isolated temporary SQLite databases (`t.TempDir()`).
3. **Architecture Verification Suite (`bash scripts/verify-architecture.sh`):**
   - **Status: PASS with 6 known legacy warnings** (zero fatal violations).

### Outstanding Architecture Technical Debt (6 Legacy Warnings)
The static architecture verification suite evaluates 10 rules. Six known architectural warnings remain as documented technical debt; **none of these warnings have been resolved yet**:
- `ARCH-02 (WARNING)`: [`SceneState.serializeSVGForExport`](../../internal/web/static/js/scene-state.js) depends on browser Web APIs (`DOMParser`/`XMLSerializer`).
- `ARCH-04 (WARNING)`: Legacy `document.getElementById` fallback branches remain in Layer 3 snapshot/serialization methods in [`history.js`](../../internal/web/static/js/history.js) and [`projects.js`](../../internal/web/static/js/projects.js).
- `ARCH-05 (WARNING)`: [`StillExportStudio.bakeStaticSVGAtTime`](../../internal/web/static/js/still-export-modal.js) uses an offscreen DOM sandbox for SVG path geometry measurements.
- `ARCH-06 (WARNING)`: Layer 3 restore/recording methods in [`HistoryManager`](../../internal/web/static/js/history.js) and [`ProjectManager`](../../internal/web/static/js/projects.js) directly invoke Layer 1 UI presentation routines (`syncUIAfterHistoryRestore`, `syncAllRowsUI`, `deselectAllNodes`). *(Targeted for decoupling in Stage 2.4)*.
- `ARCH-07 (WARNING)`: [`stage.js`](../../internal/web/static/js/stage.js) and [`app.js`](../../internal/web/static/js/app.js) contain direct cross-module state mutations or direct peer Layer 1 UI refresh calls alongside `AppCoordinator` delegation.
- `HistoryManager`/`ProjectManager` Layer 3 methods directly calling presentation methods.

---

## 3. Manual Browser Smoke Test Results (8 November 2026)

A manual browser smoke test was conducted against the live studio binary (`./svg-animator -datadir /tmp/svg-animator-smoke -port 8088`) running in an isolated test environment.

### Verified Functionality
- **Application Startup & Canvas:**
  - HTTP server started cleanly on `http://localhost:8088`.
  - Embedded static assets served without 404s or console syntax errors.
  - Background image loading and procedural canvas patterns (Blueprint, Dot Matrix, Graph Paper) rendered properly.
- **Shape Registry & Dropdown Integration:**
  - All 12 registered shape options populated dynamically into both `#nodeShapeSelect` (Node Properties) and `#presetVal-shape` (Node Presets).
  - Selecting each shape type rendered the corresponding SVG geometry immediately on the live stage canvas.
- **Node Properties & Styling:**
  - Editing node text (including multi-line pipe `|` delimiters), fill color, stroke color, stroke width, opacity, and font sizes functioned interactively.
  - Shape idle animations (`pulse-border`, `float`, `fade-in`) evaluated and animated smoothly on stage.
- **Presets & Snapping:**
  - "Copy to preset" correctly captured properties from selected nodes.
  - "Snap to preset" dialog selectively applied preset attributes to target nodes.
- **Canvas Auxiliary Layers:**
  - Data flow connectors rendered correctly with both Direct Bezier and 90-degree orthogonal routing.
  - Hotspots and pulsating glows rendered with correct coordinates.
  - Liquid ripples rendered refractive displacement effects on stage.

---

## 4. Deferred Test-Environment Observations

During smoke testing in the browser-based `code-server` reverse proxy testbed, two observations were made:
1. **MP3 Audio Upload for MP4 Video Export:** Audio file selection did not complete the upload pipeline.
2. **Save Project HTTP 413 (Payload Too Large):** Saving a project with large embedded image assets resulted in an HTTP 413 response from the proxy layer.

### Classification & Disposition
- **Deferred:** These behaviors are characteristic of the reverse-proxy payload size limits and streaming constraints present in the containerized `code-server` development environment.
- **Not Application Defects:** They are not classified as confirmed application codebase defects at this stage.
- **Action Plan:** Verification of MP3 audio upload and large project payload saving is deferred pending testing on a standard host environment (native Linux / Windows deployment without proxy payload restrictions). No application source code was modified.

---

## 5. Stage 2.3 Implementation Details

Stage 2.3 standardized component APIs, resolved transitional state mutations, and cleaned up temporary integration hooks:

1. **`DataFlows.setActiveWaypointIndex(index)` & `getActiveWaypointIndex()`:**
   - Added explicit, validated setter in `flows.js` (`Layer 3`). Validates integer parsing and bounds checking against active flow nodes.
   - Migrated `stage.js:199` pointer grab from direct internal state mutation (`window.DataFlows.activeNodeIdx = idx`) to `window.DataFlows.setActiveWaypointIndex(idx)`, eliminating transitional state mutation (`OBS-01`).
2. **`NodePresets.resetToDefaults()`:**
   - Added pure Layer 3 method resetting all 11 preset parameters to baseline defaults and resetting `autoApplyToNewNodes = true`.
   - Wired into `projects.js:resetToNewProject()` so new blank projects reset presets.
   - Wired into `projects.js:applyStudioState()` and `history.js:applySnapshot()` so legacy or partial payloads omitting presets reset presets to defaults (`FINDING-P1-03`).
3. **`NodePresets.init()` Programmatic Precedence:**
   - Inverted DOM sync so programmatic `this.autoApplyToNewNodes` drives `#chkAutoApplyPreset.checked`, preventing default DOM attribute values from overwriting programmatic configuration (`FINDING-P1-02`).
4. **`AppCoordinator` Selection Deselect Synchronization:**
   - Updated `deselectNode()`, `deselectFlow()`, `deselectGlow()`, and `deselectRipple()` to clear `AppCoordinator.activeSelection` when their respective object type was active, preventing selection staleness (`OBS-02`).
5. **Removal of Stage 2.2 Monkey-Patching in `app.js`:**
   - Removed `hookShapeDropdownSync()` from `app.js`.
   - Integrated `window.ensureShapeInDropdown` directly into `DiagramNodes.syncEditorUI()` and `NodePresets.syncRowUI('shape')`.

---

## 6. Next Steps

1. **Stage 2.4 — Restoration/UI Refresh Decoupling:**
   - Decouple `HistoryManager` and `ProjectManager` from direct Layer 1 presentation method calls (`syncAllRowsUI`, `deselect*`, `syncUIAfterHistoryRestore`, `updateButtonsUI`).
   - Route restoration notifications cleanly through `AppCoordinator` event subscriptions (`history:restored`, `project:loaded`), eliminating architectural warning `ARCH-06`.
