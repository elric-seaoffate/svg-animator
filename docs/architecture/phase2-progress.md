# Phase 2: Component APIs & Shape Registry — Progress Log

This document records the progress, verification checkpoints, test results, and outstanding technical debt for **Phase 2 (Component APIs & Shape Registry)** of the SVG Animator Studio modernization roadmap.

---

## 1. Stage Progress & Git Milestones

| Stage | Description | Status | Primary Commit(s) | Key Deliverables |
| :--- | :--- | :---: | :---: | :--- |
| **Stage 2.1** | Immutable SVG Shape Registry | **Complete** | [`f229c89`](https://127.0.0.1:3000/nigel/svg-animator/commit/f229c89) | Created `internal/web/static/js/shape-registry.js` with 12 frozen shape builders; decoupled shape SVG generation from `nodes.js`. |
| **Stage 2.2** | UI Shape Selection Integration | **Complete** | [`c1155bc`](https://127.0.0.1:3000/nigel/svg-animator/commit/c1155bc) | Implemented `populateShapeDropdowns` and `ensureShapeInDropdown` in `app.js`; dynamic dropdown population for `#nodeShapeSelect` and `#presetVal-shape`; unknown shape fallback preservation. |
| **Stage 2.3** | Targeted Component APIs | **Complete** | [`2b6b17e`](https://127.0.0.1:3000/nigel/svg-animator/commit/2b6b17e) | Standardized `DataFlows.setActiveWaypointIndex`, `NodePresets.resetToDefaults`, component deselect sync with `AppCoordinator`, and removed temporary runtime monkey-patching in `app.js`. |
| **Stage 2.4** | Restoration/UI Refresh Decoupling | **Complete** | [`92aa87d`](https://127.0.0.1:3000/nigel/svg-animator/commit/92aa87d) | Decoupled Layer 3 restoration in `HistoryManager` and `ProjectManager` via `AppCoordinator.coordinatePostRestore` and `history:changed`, resolving `ARCH-06` to PASS. |
| **Stage 2.5** | Peer UI Refresh Decoupling | **Complete** | [`7337a08`](https://127.0.0.1:3000/nigel/svg-animator/commit/7337a08) | Centralized selection, waypoint selection (`DataFlows.selectWaypoint`), and active overlay coordination via `AppCoordinator.updateActiveOverlays()`, resolving `ARCH-07` to PASS. |
| **Stage 2.6** | Architecture Boundary Cleanup | **Complete** | *In Review* | Removed Layer 3 DOM fallbacks in `HistoryManager` and `ProjectManager` (resolving `ARCH-04` to PASS); relocated browser-dependent SVG serialization to Layer 1 `window.SVGExportAdapter` (resolving `ARCH-02` to PASS); deferred `ARCH-05` offscreen geometry sandbox. Warnings reduced to 1. |

---

## 2. Automated Verification Results

All automated test suites were executed and verified passing:

1. **JavaScript Regression Harness (`node scripts/regression-harness.js`):**
   - **Status: PASS**
   - `REG-02 PASS`: Stage 1 & 2 operational state, pure geometry math, shape presets, CRUD operations, and immutable Shape Registry API verified.
   - `REG-03 PASS`: Stage 3 & 4 object selection coordination, undo/redo history depth (50 snapshots), schema `1.2.0` serialization/deserialization, full SVG compilation, UI shape dropdown integration, Stage 2.4 restoration/refresh decoupling, Stage 2.5 peer decoupling, and Stage 2.6 `SVGExportAdapter` XML serialization and error handling verified.
2. **Go Backend Validation (`go vet ./...` & `go test ./...`):**
   - **Status: PASS**
   - `go vet ./...`: Zero issues reported across all packages (`cmd/`, `internal/db`, `internal/effects`, `internal/generator`, `internal/rasterizer`, `internal/web`).
   - `go test ./...`: All unit tests passed cleanly using isolated temporary SQLite databases (`t.TempDir()`).
3. **Architecture Verification Suite (`bash scripts/verify-architecture.sh`):**
   - **Status: PASS with 1 known architectural exception** (zero fatal violations; 9 rules PASS, `ARCH-05` WARNING).

### Outstanding Architecture Technical Debt (1 Known Architectural Exception)
The static architecture verification suite evaluates 10 rules. Exactly one documented architectural exception remains:
- `ARCH-05 (WARNING)`: [`StillExportStudio.bakeStaticSVGAtTime`](../../internal/web/static/js/still-export-modal.js) uses an offscreen DOM sandbox for SVG path geometry measurements. This exception is intentionally deferred to preserve 100% SVG still and print export fidelity.

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

## 6. Stage 2.4 Implementation Details

Stage 2.4 decoupled Layer 3 operational restoration and recording routines from Layer 1 presentation methods, resolving architectural warning `ARCH-06` to PASS:

1. **`AppCoordinator.coordinatePostRestore(options)`:**
   - Centralized post-restoration UI synchronization in Layer 2.
   - Unconditionally clears selections across all modules (`deselectNode`, `deselectFlow`, `deselectGlow`, `deselectRipple`, `Stage.clearActive`) and re-renders sidebar lists.
   - Synchronizes preset rows (`NodePresets.syncAllRowsUI`).
   - Requests UI panel synchronization and master SVG preview compilation (`window.syncUIAfterHistoryRestore` / `requestRender`).
   - Emits `'state:restored'` event with `{ source, projectId }`.
2. **`HistoryManager` Event-Driven History Stack Notifications:**
   - Added pure Layer 3 method `notifyStackChange()` emitting `'history:changed'` with `{ canUndo, canRedo, undoCount, redoCount }`.
   - `HistoryManager.init()` (Layer 1) subscribes to `'history:changed'` and `'state:restored'` to update `#btnUndo` and `#btnRedo` disabled states (`updateButtonsUI()`).
   - Removed direct `updateButtonsUI()` calls from Layer 3 `recordImmediate()` and `applySnapshot()`.
3. **Decoupled `HistoryManager.applySnapshot()`:**
   - Stripped all direct Layer 1 presentation calls (`syncAllRowsUI`, `deselect*`, `syncUIAfterHistoryRestore`, `updateButtonsUI`) from `applySnapshot()`, confining it strictly to operational state restoration across `SceneState`, `ControlStateAdaptor`, `NodePresets`, `DiagramNodes`, `DataFlows`, `Glows`, and `Ripples`.
   - `undo()` and `redo()` invoke `applySnapshot()`, notify stack change, and then coordinate presentation via `AppCoordinator.coordinatePostRestore({ source: 'undo' | 'redo' })`.
4. **Decoupled `ProjectManager.applyStudioState()`, `loadProject()`, and `resetToNewProject()`:**
   - Stripped direct Layer 1 presentation calls from `applyStudioState()`, preserving pure operational deserialization and history baseline capture. Direct callers coordinate via default `options.coordinate !== false`.
   - In `loadProject(id)`, sequenced operational restoration first, project metadata update second, and `coordinatePostRestore({ source: 'project', projectId: id })` third, eliminating premature UI refresh with stale metadata.
   - In `resetToNewProject()`, operational state is reset, metadata updated, and `coordinatePostRestore({ source: 'new_project' })` invoked cleanly.
5. **Technical Debt Disposition for `ControlStateAdaptor.syncToDOM()`:**
   - Confirmed as an intentional transitional adaptor bridge for the 95 tracked controls recognized by `ARCH-08 (PASS)`.
   - Explicitly documented as independent technical debt deferred to Phase 3 (Workspace Redesign) when inspector panels replace form controls.

---

## 7. Stage 2.5 Implementation Details

Stage 2.5 decoupled peer UI refresh routines and cross-module presentation coupling across `stage.js` and `app.js`, eliminating all 13 violations of architectural rule `ARCH-07` and converting its status to **PASS** (reducing repository architecture warnings from four to three):

1. **`AppCoordinator.selectObject(type, id, options)` Bidirectional Coordination:**
   - Extended `selectObject()` in `coordinator.js` to support stage-initiated selection alongside module-initiated selection.
   - When stage clicks initiate selection (e.g. clicking a node shape on the stage canvas), `AppCoordinator` validates and invokes `DiagramNodes.selectNode(id, false)`, deselects other active modules, sets `activeSelection`, opens the target accordion, and emits `'selection:changed'`.
   - When module lists initiate selection, passing `{ skipStageClear: true, skipModuleSelect: true }` avoids redundant re-entrant calls while preserving unified single-active-object exclusivity.
   - Re-entrancy guard `_isCoordinatingSelection: true` ensures deterministic execution and prevents recursion.
2. **`DataFlows.selectWaypoint(index)` & `AppCoordinator.selectWaypoint(index)`:**
   - Added public Layer 1 API `DataFlows.selectWaypoint(index)`: validates index against active flow via `setActiveWaypointIndex(index)`, synchronizes sidebar slider and number controls (`refreshNodeSlider(f)`), refreshes reticle overlays (`updateUIOverlay()`), and returns boolean success.
   - Added `AppCoordinator.selectWaypoint(index)` as the coordinator entry point.
   - Updated `stage.js` waypoint handle click listener (`[data-flow-node-idx]`) to delegate through `AppCoordinator.selectWaypoint(idx)`.
   - Updated `flowNodeSlider` input event listener in `flows.js` to use `this.selectWaypoint(e.target.value)`.
3. **Centralized Active Overlay Coordination (`AppCoordinator.updateActiveOverlays()`):**
   - Added `AppCoordinator.updateActiveOverlays()` to coordinate active overlay synchronization across `DiagramNodes`, `DataFlows`, `Glows`, and `Ripples` using their public Layer 1 methods without cross-module querying.
   - Updated Stage `ResizeObserver` callback in `stage.js` to delegate overlay repositioning exclusively through `AppCoordinator.updateActiveOverlays()`.
   - Updated master `render()` in `app.js` to delegate active overlay refresh exclusively through `AppCoordinator.updateActiveOverlays()`.
4. **Removal of Obsolete Peer Fallback Code in `app.js`:**
   - Removed 8 dead fallback calls (`deselectNode`, `deselectFlow`, `deselectGlow`, `deselectRipple`) in `#btnModeStart` and `#btnModeEnd` click listeners in `app.js`. `AppCoordinator` is guaranteed initialized as script #3 and natively manages deselecting other objects.
5. **Architectural Verification:**
   - `ARCH-07` now reports **PASS** with zero flagged lines (`stage.js state_mutation=[]`, `stage.js ui_calls=[]`, `app.js ui_refresh_calls=[]`).
   - Repository architecture warnings reduced from 4 to 3 (`ARCH-02`, `ARCH-04`, `ARCH-05`).

---

## 8. Stage 2.6 Implementation Details

Stage 2.6 executed the architecture boundary cleanup, eliminating two architecture warnings (`ARCH-04` and `ARCH-02`) and reducing total remaining warnings to a single documented exception (`ARCH-05`):

1. **ARCH-04 Remediation (Removal of Layer 3 DOM Fallbacks):**
   - In `internal/web/static/js/history.js`: removed fallback `else` branches in `captureSnapshot()` and `applySnapshot()`, and removed direct DOM queries for `#chkAutoApplyPreset`. All control reads/writes are bridged purely through `ControlStateAdaptor.syncFromDOM()`, `syncToDOM()`, and `NodePresets.getState()` / `setState()`.
   - In `internal/web/static/js/projects.js`: removed fallback `else` branches in `serializeStudioState()` and `applyStudioState()`, and removed direct DOM queries for `#chkAutoApplyPreset`.
   - Layer 3 snapshot and serialization methods now contain zero `document.getElementById` calls, resulting in `ARCH-04 PASS` (0 violations).
2. **ARCH-02 Remediation (Relocation of XML Serialization):**
   - Defined `window.SVGExportAdapter` in `internal/web/static/js/app.js` (Layer 1 Export Adapter).
   - `SVGExportAdapter.serialize(rawSvg)` encapsulates browser `DOMParser`, `parsererror` verification, `xmlns:xlink` namespace declaration injection, `href` -> `xlink:href` attribute normalization, and `XMLSerializer` output with standard XML prolog.
   - Refactored Layer 3 `SceneState.serializeSVGForExport(rawSvg)` to delegate to `window.SVGExportAdapter.serialize(rawSvg)` when available, throwing a clear explanatory error if invoked outside a browser/adapter environment.
   - Preserved backward-compatible `window.serializeSVGForExport(rawSvg)` global delegating to `SVGExportAdapter`.
   - Result: `ARCH-02 PASS` (0 browser Web API violations in Layer 3 `SceneState`).
3. **ARCH-05 Intentional Deferral (Preserving Export Geometry Fidelity):**
   - Evaluated `StillExportStudio.bakeStaticSVGAtTime()` offscreen DOM sandbox.
   - Retained the sandbox to preserve 100% SVG path measurement (`getTotalLength()`, `getPointAtLength()`) and font metrics fidelity required for still/print export rendering.
   - Formally documented as the sole remaining architectural exception (`ARCH-05 WARNING`).
4. **Architectural Verification:**
   - Architecture suite reports **9 PASS**, **1 WARNING** (`ARCH-05`), 0 FAIL.

---

## 9. Next Steps

1. **Phase 2 Completion Review:**
   - Consolidated independent review of Stage 2.6 implementation.
   - Controlled commit and push of Stage 2.6 to `main`.
2. **Phase 3 — Workspace Redesign (Planned):**
   - Introduce Blender-style workspace layout (icon rails, sliding drawers, maximized stage).
   - Modernize property inspectors and retire legacy DOM form adaptors (`ControlStateAdaptor`).
