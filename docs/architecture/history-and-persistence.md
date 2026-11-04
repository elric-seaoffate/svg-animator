# History and Persistence

## 1. Undo / Redo System (`window.HistoryManager`)

Implemented in `internal/web/static/js/history.js`.

### 1.1 Snapshot Structure
Each entry on `HistoryManager.stack` (`maxDepth: 50`) is a JSON string representing:

```json
{
  "controls": {
    "canvasSizePreset": { "type": "select-one", "value": "photo" },
    "chkSnapToGrid": { "type": "checkbox", "checked": false },
    "exposureSlider": { "type": "range", "value": "0" },
    "exposureNum": { "type": "number", "value": "0" }
  },
  "loadedPhoto": {
    "dataUrl": "data:image/png;base64,...",
    "width": 1920,
    "height": 1080,
    "name": "photo.png"
  },
  "presets": {
    "presetValues": { ... },
    "presetEnabled": { ... }
  },
  "nodes": {
    "nodes": [ ... ],
    "nodesCounter": 3,
    "activeNodeId": "node-1"
  },
  "flows": {
    "flows": [ ... ],
    "flowsCounter": 2,
    "activeFlowId": null
  },
  "glows": {
    "glows": [ ... ],
    "glowsCounter": 0,
    "activeGlowId": null
  },
  "ripples": {
    "ripples": [ ... ],
    "ripplesCounter": 0,
    "activeRippleId": null
  }
}
```

### 1.2 Tracked Control IDs (`HistoryManager.trackedControlIds`)
`HistoryManager.trackedControlIds` contains the 95 canonical DOM control IDs covering:
- **Canvas & Background:** `canvasSizePreset`, `canvasOrientation`, `canvasDpiSelect`, `canvasCustomWidth`, `canvasCustomHeight`, `canvasBgColorPicker`, `canvasBgColorHex`, `chkSnapToGrid`, `snapGridSizeSlider`, `snapGridSizeNum`
- **Optical Filters & Color Grading:** `chkOpticalEnable`, `exposureSlider`/`Num`, `contrastSlider`/`Num`, `saturationSlider`/`Num`, `temperatureSlider`/`Num`, `tintSlider`/`Num`, `sepiaSlider`/`Num`, `hueRotateSlider`/`Num`, `blurSlider`/`Num`, `sharpenSlider`/`Num`, `vignetteSlider`/`Num`, `vignetteRadiusSlider`/`Num`, `aberrationSlider`/`Num`, `grainSlider`/`Num`, `grainFreqSlider`/`Num`, `chkGrainAnimate`
- **Camera Rig & Pan/Zoom:** `chkCameraEnable`, `cameraDurationSlider`/`Num`, `cameraEasingSelect`, `chkCameraPingPong`, `cameraStartScaleSlider`/`Num`, `cameraStartXSlider`/`Num`, `cameraStartYSlider`/`Num`, `cameraStartRotSlider`/`Num`, `cameraEndScaleSlider`/`Num`, `cameraEndXSlider`/`Num`, `cameraEndYSlider`/`Num`, `cameraEndRotSlider`/`Num`
- **Mitered 3D Frame:** `chkFrameEnable`, `frameStyleSelect`, `frameWidthSlider`/`Num`, `frameDepthSlider`/`Num`, `frameBevelSlider`/`Num`, `framePrimaryColorPicker`/`Hex`, `frameAccentColorPicker`/`Hex`, `frameMatWidthSlider`/`Num`, `frameMatColorPicker`/`Hex`, `frameLightAngleSlider`/`Num`, `frameLightIntensitySlider`/`Num`, `frameShadowBlurSlider`/`Num`, `frameShadowOpacitySlider`/`Num`, `chkFrameAnimateLight`, `frameLightSpeedSlider`/`Num`

### 1.3 Recording Semantics
- **Immediate Recording (`recordImmediate` / `AppCoordinator.recordHistoryImmediate`):** Used for discrete actions (adding/deleting objects, selecting shapes/dropdowns, toggling checkboxes, completing stage drag operations, applying presets).
- **Debounced Recording (`recordDebounced` / `AppCoordinator.recordHistoryDebounced`):** Used for continuous `input` events on sliders, color pickers, and text fields (default 300ms debounce).
- **Deduplication:** `pushSnapshot(snap)` compares the serialized JSON against `stack[pointer]` and skips pushing if identical.
- **Restoration Guard:** While `applySnapshot(snap)` runs, `HistoryManager.isRestoring` is set to `true` so UI synchronization and re-rendering do not push new snapshots.

---

## 2. Project Persistence (`window.ProjectManager` & SQLite)

Implemented in `internal/web/static/js/projects.js` and `internal/db/sqlite.go`.

### 2.1 Schema Version `1.2.0`
`ProjectManager.serializeStudioState()` produces a JSON document with `version: "1.2.0"`:

```json
{
  "version": "1.2.0",
  "savedAt": "2026-11-04T08:00:00.000Z",
  "controls": {
    "...95 trackedControlIds...": { ... },
    "chkAutoApplyPreset": { "type": "checkbox", "checked": true }
  },
  "loadedPhoto": { ... },
  "presets": {
    "presetValues": { ... },
    "presetEnabled": { ... }
  },
  "nodes": {
    "nodes": [ ... ],
    "nodesCounter": 0
  },
  "flows": {
    "flows": [ ... ],
    "flowsCounter": 0
  },
  "glows": {
    "glows": [ ... ],
    "glowsCounter": 0
  },
  "ripples": {
    "ripples": [ ... ],
    "ripplesCounter": 0
  }
}
```

### 2.2 Backward Compatibility Guarantees
- `ProjectManager.applyStudioState(state)` gracefully handles missing keys or older project structures by falling back to empty arrays (`[]`) and computing ID counters (`nodesCounter`, `flowsCounter`, `glowsCounter`, `ripplesCounter`) from either saved counters or array lengths.
- All REST endpoints (`/api/export/projects`, `/api/export/projects/get`, `/api/export/projects/save`, `/api/export/projects/delete` and their `/api/projects*` aliases) and SQLite tables (`projects`, `assets`) remain strictly unchanged.
