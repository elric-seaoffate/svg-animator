# History and Persistence

## 1. Undo / Redo System (`window.HistoryManager`)

Implemented in `internal/web/static/js/history.js`.

### 1.1 Stack Model and Snapshot Structure
`HistoryManager` maintains two stacks of JSON snapshot strings:
- `HistoryManager.undoStack` (capped at `maxDepth: 50`)
- `HistoryManager.redoStack` (cleared whenever a new snapshot is recorded via `recordImmediate()`)

Each snapshot string produced by `HistoryManager.captureSnapshot()` serializes a flat top-level JSON object:

```json
{
  "controls": {
    "canvasPatternSelect": "blueprint",
    "canvasPresetSelect": "1280x720",
    "canvasWidthInput": "1280",
    "canvasHeightInput": "720",
    "chkSnapToGrid": false,
    "durationSlider": "7",
    "durationNum": "7",
    "cameraMotionSelect": "static",
    "effectSelect": "none",
    "chkModuleFrame": false
  },
  "loadedPhoto": {
    "filename": "photo.jpg",
    "naturalWidth": 1920,
    "naturalHeight": 1080,
    "mime": "image/jpeg",
    "b64": "..."
  },
  "presets": {
    "width": { "enabled": true, "value": 170 },
    "height": { "enabled": false, "value": 80 },
    "fillColor": { "enabled": true, "value": "#161b22" },
    "strokeColor": { "enabled": true, "value": "#58a6ff" },
    "textColor": { "enabled": true, "value": "#e6edf3" },
    "fontSize": { "enabled": true, "value": 15 },
    "fillOpacity": { "enabled": false, "value": 0.92 },
    "strokeWidth": { "enabled": false, "value": 2 },
    "strokeStyle": { "enabled": false, "value": "solid" },
    "shape": { "enabled": false, "value": "rounded" },
    "anim": { "enabled": false, "value": "none" }
  },
  "autoApplyPreset": true,
  "nodes": [ ... ],
  "nodesCounter": 3,
  "flows": [ ... ],
  "flowsCounter": 2,
  "glows": [ ... ],
  "glowsCounter": 0,
  "ripples": [ ... ],
  "ripplesCounter": 0
}
```

### 1.2 Tracked Control IDs (`HistoryManager.trackedControlIds`)
`HistoryManager.trackedControlIds` (mirrored in `SceneState.trackedControlIds`) contains the 95 canonical DOM control IDs, stored as primitive values (`boolean` for checkboxes, `string` for inputs and selects):
- **Canvas, Photo & Grid Snapping (19):** `canvasPatternSelect`, `canvasPresetSelect`, `canvasWidthInput`, `canvasHeightInput`, `photoFitSelect`, `photoCropZoomSlider`, `photoCropZoomNum`, `photoCropXSlider`, `photoCropXNum`, `photoCropYSlider`, `photoCropYNum`, `canvasBgColorPicker`, `canvasBgTransparent`, `canvasGridColorPicker`, `canvasGridSizeSlider`, `canvasGridSizeNum`, `chkSnapToGrid`, `snapGridSizeSlider`, `snapGridSizeNum`
- **Global Playback & Camera Rig (45):** `loopSelect`, `durationSlider`, `durationNum`, `cameraMotionSelect`, `camLoopSelect`, `camDurationSlider`, `camDurationNum`, `staticZoomSlider`, `staticZoomNum`, `staticXSlider`, `staticXNum`, `staticYSlider`, `staticYNum`, `startXZoomSlider`, `startXZoomNum`, `startXSlider`, `startXNum`, `startYSlider`, `startYNum`, `endXZoomSlider`, `endXZoomNum`, `endXSlider`, `endXNum`, `endYSlider`, `endYNum`, `handZoomSlider`, `handZoomNum`, `handXSlider`, `handXNum`, `handYSlider`, `handYNum`, `driftSwaySlider`, `driftSwayNum`, `driftBreatheSlider`, `driftBreatheNum`, `perspZoomSlider`, `perspZoomNum`, `perspXSlider`, `perspXNum`, `perspYSlider`, `perspYNum`, `perspTiltXSlider`, `perspTiltXNum`, `perspTiltYSlider`, `perspTiltYNum`
- **Optical Filters (20):** `effectSelect`, `startBlurSlider`, `startBlurNum`, `endBlurSlider`, `endBlurNum`, `focusDurSlider`, `focusDurNum`, `tsShapeSelect`, `tsPosXSlider`, `tsPosXNum`, `tsPosSlider`, `tsPosNum`, `tsWidthSlider`, `tsWidthNum`, `tsBlurSlider`, `tsBlurNum`, `mbIntSlider`, `mbIntNum`, `mbAngSlider`, `mbAngNum`
- **Mitered 3D Frame (11):** `chkModuleFrame`, `frameStyleSelect`, `frameDepthSlider`, `frameDepthNum`, `chkFrameLighting`, `frameLightDirSelect`, `frameLightIntSlider`, `frameLightIntNum`, `frameShadowSlider`, `frameShadowNum`, `chkFrameFillet`

In addition, `#chkAutoApplyPreset` is synchronized via `NodePresets.autoApplyToNewNodes` and serialized as the top-level boolean field `autoApplyPreset`.

### 1.3 Recording and Restoration Semantics
- **Immediate Recording (`HistoryManager.recordImmediate()` / `AppCoordinator.recordHistoryImmediate()`):** Used for discrete actions (adding/deleting objects, changing selects/checkboxes, completing stage drag operations, applying presets).
- **Debounced Recording (`HistoryManager.recordDebounced(delayMs = 280)` / `AppCoordinator.recordHistoryDebounced()`):** Used for continuous `input` events on sliders, color pickers, and text fields.
- **Deduplication:** `recordImmediate()` compares the newly captured JSON string against `this.undoStack[this.undoStack.length - 1]` and skips pushing if identical.
- **Restoration Guard:** While `applySnapshot(snapStr)` runs inside a `try / finally` block, `HistoryManager.isRestoring` is set to `true` so UI synchronization and re-rendering do not record new snapshots.

---

## 2. Project Persistence (`window.ProjectManager` & SQLite)

Implemented in `internal/web/static/js/projects.js` and `internal/db/sqlite.go`.

### 2.1 Schema Version `1.2.0`
`ProjectManager.serializeStudioState()` returns a JSON string with `version: "1.2.0"` and flat top-level arrays and counters:

```json
{
  "version": "1.2.0",
  "controls": {
    "canvasPatternSelect": "blueprint",
    "canvasPresetSelect": "1280x720",
    "canvasWidthInput": "1280",
    "canvasHeightInput": "720"
  },
  "loadedPhoto": null,
  "presets": {
    "width": { "enabled": true, "value": 170 },
    "height": { "enabled": false, "value": 80 },
    "fillColor": { "enabled": true, "value": "#161b22" },
    "strokeColor": { "enabled": true, "value": "#58a6ff" },
    "textColor": { "enabled": true, "value": "#e6edf3" },
    "fontSize": { "enabled": true, "value": 15 },
    "fillOpacity": { "enabled": false, "value": 0.92 },
    "strokeWidth": { "enabled": false, "value": 2 },
    "strokeStyle": { "enabled": false, "value": "solid" },
    "shape": { "enabled": false, "value": "rounded" },
    "anim": { "enabled": false, "value": "none" }
  },
  "autoApplyPreset": true,
  "nodes": [ ... ],
  "nodesCounter": 0,
  "flows": [ ... ],
  "flowsCounter": 0,
  "glows": [ ... ],
  "glowsCounter": 0,
  "ripples": [ ... ],
  "ripplesCounter": 0
}
```

Project creation and modification timestamps (`created_at`, `updated_at`) are stored at the SQLite `projects` table row level (`internal/db/sqlite.go`), while any optional `timestamp` property present inside a `schema_json` document is safely ignored by `ProjectManager.applyStudioState()`.

### 2.2 Backward Compatibility Guarantees
- `ProjectManager.applyStudioState(schemaJsonStr)` accepts either a JSON string or a parsed object, falls back to empty arrays (`[]`) when collections are omitted, defaults `autoApplyToNewNodes` to `true` when `autoApplyPreset` is absent, and computes ID counters (`nodesCounter`, `flowsCounter`, `glowsCounter`, `ripplesCounter`) safely using `Math.max(savedCounter, maxId)`.
- All REST endpoints (`/api/export/projects`, `/api/export/projects/get`, `/api/export/projects/save`, `/api/export/projects/delete` and their `/api/projects*` aliases) and SQLite tables (`projects`, `assets`) remain unchanged.
