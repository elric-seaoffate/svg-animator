# State Management

## 1. State Ownership Matrix

Every piece of application state has a single authoritative operational owner:

| State Domain | Authoritative Owner | Key Data Structures |
| :--- | :--- | :--- |
| **Canvas, Optical Filters, Camera Rig, 3D Frame, Snap Controls, Loaded Photo** | `window.SceneState` (`js/scene-state.js`) | `SceneState.loadedPhoto` (`{ dataUrl, width, height, name }`), `SceneState.controls` (95 tracked controls + `chkAutoApplyPreset`), `SceneState.paperSpecs` |
| **Active Selection & Placement Reticle Coordination** | `window.AppCoordinator` (`js/coordinator.js`) | `activeSelection` (`{ type, id }`), synchronized with `Stage.activePlacement`, `DiagramNodes.activeNodeId`, `DataFlows.activeFlowId`, `Glows.activeGlowId`, `Ripples.activeRippleId` |
| **Shape Presets** | `window.NodePresets` (`js/presets.js`) | `presetValues` (17 shape/text/shadow/gradient properties), `presetEnabled` (boolean map per property), `autoApplyToNewNodes` |
| **Diagram Nodes** | `window.DiagramNodes` (`js/nodes.js`) | `nodes` array, `nodesCounter`, `activeNodeId`, `selectedNodeIds` |
| **Data Flows** | `window.DataFlows` (`js/flows.js`) | `flows` array, `flowsCounter`, `activeFlowId`, `activeWaypointIdx` |
| **Hotspot Glows & Pings** | `window.Glows` (`js/glows.js`) | `glows` array, `glowsCounter`, `activeGlowId` |
| **Refractive Water Ripples** | `window.Ripples` (`js/ripples.js`) | `ripples` array, `ripplesCounter`, `activeRippleId` |
| **Stage Viewport Transform** | `window.Stage` (`js/stage.js`) | `zoomMode`, `zoomScale`, `panX`, `panY`, `activePlacement` |
| **Undo / Redo Stack** | `window.HistoryManager` (`js/history.js`) | `stack` array (`maxDepth: 50`), `pointer`, `isRestoring` |

---

## 2. Incremental DOM-to-State Synchronization (`ControlStateAdaptor`)

Because the existing 3-column UI binds 95 form controls (`HistoryManager.trackedControlIds`) and external callers/tests may inspect or mutate DOM inputs directly, Phase 1 uses `window.ControlStateAdaptor` (`js/scene-state.js`) to keep `SceneState.controls` and the DOM in lockstep:

- **`ControlStateAdaptor.syncFromDOM(controlIds)`:**
  Reads current values (`checked` for checkboxes, `.value` for inputs/selects) from the DOM into `SceneState.controls`.
- **`ControlStateAdaptor.syncToDOM(controlsMap)`:**
  Writes a controls map back to DOM elements and synchronizes paired `*Slider` / `*Num` controls and display badges.

This guarantees:
1. Operational builders (`SceneState.buildRenderState()`, `SceneState.buildFullSVG()`, `HistoryManager.captureSnapshot()`, `ProjectManager.serializeStudioState()`) read from `SceneState` rather than querying `document.getElementById` directly.
2. Any UI change or programmatic DOM change is reflected in `SceneState` before rendering or history capture.
3. Restoring a history snapshot or saved project updates `SceneState` first and then synchronizes all DOM inputs via `ControlStateAdaptor.syncToDOM()`.

---

## 3. Predictable State Transition Lifecycle

All state modifications follow a 7-step lifecycle coordinated through `AppCoordinator`:

1. **Receive Command:** User event or programmatic API call invokes a UI handler or operational method.
2. **Validate Request:** Operational method validates parameters (e.g., node existence, numeric bounds, valid coordinates).
3. **Apply Operation:** Operational state (`SceneState`, `nodes`, `flows`, `glows`, `ripples`, `presets`) is updated.
4. **Synchronize Selection:** If selection changes, `AppCoordinator.selectObject(type, id)` clears competing selections across other modules.
5. **Trigger Render:** `AppCoordinator.requestRender()` compiles the SVG via `SceneState.buildFullSVG()` and updates `#canvasPreview`.
6. **Notify UI:** Stage overlays (`updateUIOverlay`) and sidebar lists/inspectors refresh to reflect the new state.
7. **Record History:** `AppCoordinator.recordHistoryImmediate()` or `recordHistoryDebounced()` captures a snapshot on `HistoryManager` (unless `HistoryManager.isRestoring` is `true`).
