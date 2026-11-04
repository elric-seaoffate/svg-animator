# Application Layers

SVG Animator Studio's frontend follows a strict three-layer architecture:

```text
Layer 1: UI Presentation  ──►  Layer 2: Application Coordination  ──►  Layer 3: Operational Functionality
```

Dependencies flow strictly downward. Operational modules in Layer 3 never query DOM input elements (`document.getElementById`) or manipulate inspector DOM controls directly.

---

## Layer 1: UI Presentation

### Responsibilities
- Owns HTML markup (`internal/web/static/index.html`) and CSS stylesheets (`css/style.css`, `css/export-modal.css`).
- Attaches DOM event listeners (`input`, `change`, `click`, `pointerdown`, `pointermove`, `pointerup`, `wheel`, `keydown`, `keyup`, `dragover`, `drop`).
- Renders object lists in the left and right sidebar panels (`#nodesListContainer`, `#flowsListContainer`, `#glowsListContainer`, `#ripplesListContainer`, `#projectLibraryGrid`).
- Synchronizes sidebar editor inputs when an object is selected (`syncEditorUI`, `syncAllRowsUI`, `refreshNodeSlider`, etc.).
- Manages interactive stage overlays (`#reticleOverlay`, `#nodeOverlay`, `#flowOverlay`, `#glowOverlay`, `#rippleOverlay`) and modal visibility.
- Translates user actions into calls on `window.AppCoordinator` or component public methods.

### Rules
- UI code must not directly mutate internal operational arrays or construct SVG filter/shape markup.
- All 95 tracked DOM control IDs in `HistoryManager.trackedControlIds` are preserved so existing user workflows, keyboard shortcuts, and history/persistence snapshots continue to operate identically.

---

## Layer 2: Application Coordination (`window.AppCoordinator`)

Implemented in `internal/web/static/js/coordinator.js`.

### Responsibilities
- **Single-Active-Object Selection Coordination:**
  - Ensures selecting a Node, Flow, Glow, Ripple, or Camera reticle cleanly deselects any previously active object across other modules without modules reaching into each other's internal state.
  - Emits `selection:changed` events so UI panels and stage overlays can update.
- **History Recording Coordination:**
  - Provides `recordHistoryImmediate()` for discrete actions (adding/removing objects, preset application, drop placement, drag completion) and `recordHistoryDebounced(delayMs)` for continuous slider/text edits.
  - Respects `HistoryManager.isRestoring` so history restoration never triggers recursive history snapshots.
- **State & Render Coordination:**
  - Synchronizes DOM controls with `SceneState` via `ControlStateAdaptor` during incremental transition.
  - Triggers master SVG preview compilation (`requestRender()`) and notifies UI overlays (`render:completed`).
- **Stage Geometry & Snap Bridge:**
  - Provides `snapPosition(xPct, yPct)` and `getCanvasDimensions()` to operational modules so they never query `#chkSnapToGrid`, `#snapGridSizeNum`, or `#canvasPreview` directly.

### Rules
- `AppCoordinator` must remain a focused coordinator. It does **not** implement SVG generation, path geometry, filter math, or DOM template strings.

---

## Layer 3: Operational Functionality

### Responsibilities
- **Scene & Control State (`window.SceneState`, `window.ControlStateAdaptor` in `js/scene-state.js`):**
  - Owns `loadedPhoto`, `controls` map (all 95 tracked control values + `chkAutoApplyPreset`), `paperSpecs`, `buildCurrentCanvasState()`, `buildRenderState()`, `buildFullSVG(state, overrides)`, and `serializeSVGForExport(rawSvg)`.
- **Optical & Frame SVG Engine (`window.Effects` in `js/effects.js`):**
  - Pure SVG markup builders for background photo, optical filters, camera rig transforms, and 3D mitered frames.
- **Shape Presets (`window.NodePresets` operational API in `js/presets.js`):**
  - Owns preset attribute values (`presetValues`) and enabled flags (`presetEnabled`), plus pure `applyToNodeObject(node)` and `extractFromNodeObject(node)`.
- **Diagram Nodes (`window.DiagramNodes` operational API in `js/nodes.js`):**
  - Owns `nodes` collection and `nodesCounter`, node CRUD, coordinate hit-testing (`findNodeAtPct`), effective property resolution (`getNodeEffectiveProps`), state serialization (`getState`/`setState`), and SVG generation (`injectIntoSVG`).
- **Data Flows (`window.DataFlows` operational API in `js/flows.js`):**
  - Owns `flows` collection and `flowsCounter`, flow CRUD, waypoint manipulation, Bezier/auto-elbow path calculation (`generatePathString`, `getMidpoint`), state serialization (`getState`/`setState`), and SVG generation (`injectIntoSVG`).
- **Hotspot Glows (`window.Glows` operational API in `js/glows.js`):**
  - Owns `glows` collection and `glowsCounter`, glow CRUD, state serialization (`getState`/`setState`), and SVG generation (`injectIntoSVG`).
- **Water Ripples (`window.Ripples` operational API in `js/ripples.js`):**
  - Owns `ripples` collection and `ripplesCounter`, ripple CRUD, displacement filter + ring SVG generation (`injectIntoSVG`), and state serialization (`getState`/`setState`).
- **Stage Math (`window.Stage` operational math in `js/stage.js`):**
  - Pure coordinate conversion (`rectClientToPct`), grid snapping (`computeSnappedPct`), and viewport fit scale (`computeFitScale`).
- **History & Persistence (`window.HistoryManager` in `js/history.js`, `window.ProjectManager` in `js/projects.js`):**
  - Snapshot stack management (`undo`, `redo`, `captureSnapshot`, `applySnapshot`) and schema `1.2.0` project serialization/deserialization + REST API calls.
- **Export Evaluation (`window.StillExportStudio` in `js/still-export-modal.js`, `js/export-modal.js`):**
  - Pure SMIL animation evaluation at arbitrary timestamps (`evaluateSMILAtTime`) and export job payload construction.
