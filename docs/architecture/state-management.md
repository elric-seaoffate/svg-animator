# State Management

## 1. State Ownership Matrix

Every piece of application state has a single authoritative operational owner:

| State Domain | Authoritative Owner | Key Data Structures |
| :--- | :--- | :--- |
| **Canvas, Optical Filters, Camera Rig, 3D Frame, Snap Controls, Loaded Photo** | `window.SceneState` (`js/scene-state.js`) | `SceneState.loadedPhoto` (`null` or `{ filename, naturalWidth, naturalHeight, mime, b64 }`), `SceneState.currentImage`, `SceneState.currentRenderState`, `SceneState.controls` (flat map of primitive `string`/`boolean` values for the 95 `trackedControlIds` + `chkAutoApplyPreset`), `SceneState.trackedControlIds` (95 IDs), `SceneState.paperSpecs` |
| **Active Selection & Placement Reticle Coordination** | `window.AppCoordinator` (`js/coordinator.js`) | `activeSelection` (`{ type, id }`), coordinating mutual exclusion across `DiagramNodes.activeId`, `DataFlows.activeId`, `Glows.activeId`, `Ripples.activeId`, and `Stage.clearActive()` |
| **Shape Presets** | `window.NodePresets` (`js/presets.js`) | `preset` (11 keys mapping to `{ enabled, value }`), `presetKeys`, `autoApplyToNewNodes` (`boolean`) |
| **Diagram Nodes** | `window.DiagramNodes` (`js/nodes.js`) | `list` (array of node objects), `counter` (`number`), `activeId` (`number \| null`) |
| **Data Flows** | `window.DataFlows` (`js/flows.js`) | `list` (array of flow objects with free percentage waypoints `nodes: [{ x, y }, ...]`), `counter` (`number`), `activeId` (`number \| null`), `activeNodeIdx` (`number`) |
| **Hotspot Glows & Pings** | `window.Glows` (`js/glows.js`) | `list` (array of glow objects), `counter` (`number`), `activeId` (`number \| null`) |
| **Refractive Water Ripples** | `window.Ripples` (`js/ripples.js`) | `list` (array of ripple objects), `counter` (`number`), `activeId` (`number \| null`) |
| **Stage Viewport Transform** | `window.Stage` (`js/stage.js`) | `zoomMode`, `zoomScale`, `panX`, `panY`, `activePlacement` (`'start' \| 'end'`) |
| **Undo / Redo Stack** | `window.HistoryManager` (`js/history.js`) | `undoStack` (`maxDepth: 50`), `redoStack`, `isRestoring`, `debounceTimer`, `trackedControlIds` (`95` DOM control IDs) |

### Serialized Project & History State Structure (`v1.2.0`)
Both `HistoryManager.captureSnapshot()` and `ProjectManager.serializeStudioState()` use flat top-level keys:
- `version`: `"1.2.0"` (included in `ProjectManager.serializeStudioState()`)
- `controls`: flat map of the 95 `trackedControlIds` to primitive values (`boolean` for checkboxes, `string` for inputs/selects)
- `loadedPhoto`: `null` or `{ filename, naturalWidth, naturalHeight, mime, b64 }`
- `presets`: deep-cloned `NodePresets.preset` object (`11` preset keys)
- `autoApplyPreset`: boolean (`NodePresets.autoApplyToNewNodes`)
- `nodes` (array) and `nodesCounter` (integer)
- `flows` (array) and `flowsCounter` (integer)
- `glows` (array) and `glowsCounter` (integer)
- `ripples` (array) and `ripplesCounter` (integer)

---

## 2. Incremental DOM-to-State Synchronization (`ControlStateAdaptor`)

Because the existing 3-column UI binds 95 form controls (`HistoryManager.trackedControlIds`) and UI listeners/tests may inspect or mutate DOM inputs directly, Phase 1 uses `window.ControlStateAdaptor` (`js/scene-state.js`) to keep `SceneState.controls` and the DOM synchronized:

- **`ControlStateAdaptor.syncFromDOM(controlIds)`:**
  Reads current primitive values (`el.checked` boolean for checkboxes, `el.value` string for inputs/selects) from the DOM into `SceneState.controls` (plus `#chkAutoApplyPreset` when present) and returns the snapshot map.
- **`ControlStateAdaptor.syncToDOM(controlsMap)`:**
  Writes each key in `controlsMap` into `SceneState.controls` and updates the corresponding DOM element (`el.checked` for checkboxes, `el.value` for inputs/selects).
- **`ControlStateAdaptor.setPairValue(baseId, val)`:**
  Updates paired `<baseId>Slider` and `<baseId>Num` values in both `SceneState.controls` and the DOM.

This guarantees:
1. Operational builders (`SceneState.buildCurrentCanvasState()`, `SceneState.buildRenderState()`, `SceneState.buildFullSVG()`, `HistoryManager.captureSnapshot()`, `ProjectManager.serializeStudioState()`) read control values from `SceneState`.
2. Any UI change or DOM input mutation is synced into `SceneState` before rendering or snapshot capture.
3. Restoring a history snapshot or saved project updates `SceneState` and DOM inputs via `ControlStateAdaptor.syncToDOM()`, followed by `window.syncUIAfterHistoryRestore()` to refresh paired numeric displays and panel visibility.

---

## 3. Predictable State Transition Lifecycle

State modifications follow a 7-step lifecycle coordinated through `AppCoordinator`:

1. **Receive Command:** User event or programmatic API call invokes a UI handler or operational method.
2. **Validate Request:** Operational method validates parameters (e.g., object existence, numeric bounds, valid coordinates).
3. **Apply Operation:** Operational state (`SceneState`, `DiagramNodes`, `DataFlows`, `Glows`, `Ripples`, `NodePresets`) is updated.
4. **Synchronize Selection:** When selection changes via `AppCoordinator.selectObject(type, id)`, competing selections on other object modules are cleared.
5. **Trigger Render:** `AppCoordinator.requestRender()` (or `window.triggerRender()`) syncs controls, compiles the SVG via `SceneState.buildFullSVG()`, and updates `#canvasPreview`.
6. **Notify UI:** Stage overlays (`updateUIOverlay`) and sidebar lists/editors refresh to reflect the updated state.
7. **Record History:** `AppCoordinator.recordHistoryImmediate()` or `recordHistoryDebounced()` captures a snapshot on `HistoryManager.undoStack` (unless `HistoryManager.isRestoring` is `true`).
