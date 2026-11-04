# Module: `app.js` (`SceneState`, `AppCoordinator`, and Main Studio Controller)

## 1. Purpose
`internal/web/static/js/app.js` initializes the SVG Animator Studio frontend, binds global UI accordions, slider/number input pairs, color pickers, photo dropzone uploads, and keyboard shortcuts, and exposes backward-compatible global rendering entrypoints (`window.triggerAppRender`, `window.buildFullSVG`, `window.serializeSVGForExport`, `window.getLoadedPhoto`, `window.setLoadedPhoto`, `window.syncUIAfterHistoryRestore`) backed by `window.SceneState` (`js/scene-state.js`) and `window.AppCoordinator` (`js/coordinator.js`).

## 2. Responsibilities by Layer
- **Layer 1 (UI Presentation — `app.js`):**
  - Accordion expand/collapse (`window.openAccordionById`, `window.toggleAllAccordions`).
  - Paired `*Slider` and `*Num` synchronization and `#canvasBgColorPicker`/`#canvasBgColorHex` bindings.
  - Photo upload dropzone (`#photoDropzone`, `#photoFileInput`) and `#btnClearPhoto`.
  - Camera reticle toggle buttons (`#btnPlaceCamStart`, `#btnPlaceCamEnd`).
  - Global keyboard shortcuts (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`, `Delete`/`Backspace` for selected objects, `Escape`).
- **Layer 2 (Application Coordination — `coordinator.js`):**
  - `window.AppCoordinator` manages cross-module selection, render requests, history recording, and stage snap/dimension queries.
- **Layer 3 (Operational Functionality — `scene-state.js`):**
  - `window.SceneState` owns `loadedPhoto`, `controls`, `paperSpecs`, `buildCurrentCanvasState()`, `buildRenderState()`, `buildFullSVG(state, overrides)`, and `serializeSVGForExport(rawSvg)`.
  - `window.ControlStateAdaptor` synchronizes DOM input values with `SceneState.controls`.

## 3. Public Interface (`window.*` Globals)
- `window.triggerAppRender()` — Compiles the full SVG via `SceneState` and updates `#canvasPreview` and stage overlays.
- `window.buildFullSVG(state, overrides)` — Builds the complete SVG markup string from a render state object and optional export overrides (`width`, `height`, `disableFrame`, `transparentBg`).
- `window.serializeSVGForExport(rawSvg)` — Ensures explicit `xmlns`, `xmlns:xlink`, `width`, and `height` attributes on an SVG string for standalone/raster export.
- `window.getLoadedPhoto()` / `window.setLoadedPhoto(photoObj)` — Reads or updates `SceneState.loadedPhoto` and refreshes the photo dropzone UI.
- `window.syncUIAfterHistoryRestore()` — Refreshes UI visibility (custom canvas dimensions, camera/frame sections, object lists, and stage overlays) after undo/redo or project load.
- `window.openAccordionById(itemId)` / `window.toggleAllAccordions()` — Expands a specific accordion or toggles all sidebar accordions.
- `window.currentRenderState` — Most recent render state object produced by `SceneState.buildRenderState()`.

## 4. Dependencies
- Depends on `SceneState`, `ControlStateAdaptor`, `AppCoordinator`, `Effects`, `Stage`, `NodePresets`, `DiagramNodes`, `DataFlows`, `Glows`, `Ripples`, `HistoryManager`, `ProjectManager`.
