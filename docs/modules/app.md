# Module: `app.js` (`SceneState`, `AppCoordinator`, Export Studios, and Main Studio Controller)

## 1. Purpose
`internal/web/static/js/app.js` initializes the SVG Animator Studio frontend, binds global UI accordions, slider/number input pairs, color pickers, photo dropzone uploads, and standalone SVG/HTML downloads, and exposes backward-compatible global rendering entrypoints (`window.triggerAppRender`, `window.buildFullSVG`, `window.serializeSVGForExport`, `window.getLoadedPhoto`, `window.setLoadedPhoto`, `window.syncUIAfterHistoryRestore`) backed by `window.SceneState` (`js/scene-state.js`) and `window.AppCoordinator` (`js/coordinator.js`).

## 2. Responsibilities by Layer
- **Layer 1 (UI Presentation — `app.js`, `still-export-modal.js`, `export-modal.js`):**
  - Workspace layout management (`window.WorkspaceController`): dual vertical icon rails, independently collapsible sliding drawers (`#leftDrawer`, `#rightDrawer`), responsive drawer backdrop (`#drawerBackdrop`), safe focus restoration on drawer collapse, maximized canvas mode (`#btnMaximizeCanvas` / `Shift+Space`), and keyboard shortcuts (`T`, `N`, `Shift+Space`, `Escape`).
  - True contextual tool panels and expanded inspector layout: `showToolPanel(toolId)` displays only the active tool panel and toggles `.expanded-inspector` on `#leftDrawer` for repeatable object tools (`acc-nodes`, `acc-flows`, `acc-glows`, `acc-ripples`) on wide desktop viewports (>= 1280px) to house the master-detail inspector without crowding the central stage.
  - Accordion expand/collapse (`window.openAccordionById`, `window.toggleAllAccordions`), automatically un-collapsing parent drawers when needed, disambiguating Optics vs. Frame rail buttons, and strictly preserving operational project state without side-effect mutations.
  - Paired `*Slider` and `*Num` synchronization and `#canvasBgColorPicker`/`#canvasGridColorPicker` bindings.
  - Photo upload dropzone (`#uploadDrop`, `#fileInput`) and interactive photo crop mode (`#btnDragPhotoCrop`).
  - Camera reticle toggle buttons (`#btnModeStart`, `#btnModeEnd`) delegating cleanly through `AppCoordinator.selectObject('camera', mode, { skipStageClear: true })`.
  - Master SVG compilation and stage overlay synchronization delegating through `AppCoordinator.updateActiveOverlays()`.
  - Export XML serialization adapter (`window.SVGExportAdapter.serialize(rawSvg)`) encapsulating browser `DOMParser`/`XMLSerializer` for SVG exports.
  - Still export modal (`window.StillExportStudio.readExportOptionsFromDOM`, `renderPreview`, `download`) and Animated export modal (`window.AnimatedExportStudio` / `window.openExportModal`, `generatePreview`, `downloadFinal`).
- **Layer 2 (Application Coordination — `coordinator.js`):**
  - `window.AppCoordinator` manages cross-module selection (`selectObject`, `clearSelection`), waypoint selection (`selectWaypoint`), active overlay synchronization (`updateActiveOverlays`), post-restoration UI refresh (`coordinatePostRestore`), render requests (`requestRender`), history recording (`recordHistoryImmediate`, `recordHistoryDebounced`), and stage snap/dimension queries (`getSnapConfig`, `snapPosition`, `getCanvasDimensions`).
- **Layer 3 (Operational Functionality — `scene-state.js`, `still-export-modal.js`, `export-modal.js`):**
  - `window.SceneState` owns `loadedPhoto`, `controls`, `paperSpecs`, `buildCurrentCanvasState()`, `buildRenderState()`, `buildFullSVG(state, overrides)`, and `serializeSVGForExport(rawSvg)`.
  - `window.ControlStateAdaptor` synchronizes DOM input values with `SceneState.controls`.
  - `window.StillExportStudio` provides pure SMIL evaluation (`solveCubicBezier`, `evaluateSMILAnimate`, `bakeStaticSVGAtTime`) and zero-DOM render config construction (`buildStillRenderConfig`).
  - `window.AnimatedExportStudio` provides zero-DOM export payload construction (`constructExportJobPayload`) and REST client calls (`requestBitmapRender`, `inspectAudioStream`).

## 3. Public Interface (`window.*` Globals)
- `window.WorkspaceController` — Layer 1 workspace layout manager providing `showToolPanel(toolId)`, `toolTitles`, `openLeftDrawer()`, `closeLeftDrawer()`, `toggleLeftDrawer()`, `openRightDrawer()`, `closeRightDrawer()`, `toggleRightDrawer()`, `toggleMaximizedCanvas()`, `setMaximized(bool)`, `syncRailForAccordion(accId)`, `_syncBackdrop()`, `_syncOverlays()`, `lastLeftAccId`, `lastRightAccId`, `_initialized`, `handleKeydown(e)`, and `init()`.
- `window.triggerAppRender()` — Compiles the full SVG via `SceneState` and updates `#svgContainer` and stage overlays.
- `window.buildFullSVG(state, overrides)` — Builds the complete SVG markup string from a render state object and optional layer overrides (`includeNodes`, `includeFlows`, `includeGlows`, `includeRipples`).
- `window.serializeSVGForExport(rawSvg)` — Ensures explicit XML declaration, `xmlns:xlink`, and `xlink:href` attributes on an SVG string (delegates to `SVGExportAdapter.serialize`).
- `window.SVGExportAdapter` — Layer 1 export adapter (`serialize(rawSvg)`) providing browser DOM-backed XML parsing, namespace injection, and XML serialization.
- `window.populateShapeDropdowns()` — Populates `#nodeShapeSelect` and `#presetVal-shape` with all 12 shapes from `ShapeRegistry`.
- `window.ensureShapeInDropdown(selectEl, shapeId)` — Ensures a shape ID (including legacy/unknown shapes) is represented in a dropdown element without mutating underlying data.
- `window.getLoadedPhoto()` / `window.setLoadedPhoto(photoObj)` — Reads or updates `SceneState.loadedPhoto` and refreshes the photo dropzone UI.
- `window.syncUIAfterHistoryRestore()` — Refreshes UI visibility (custom canvas dimensions, camera/optical/frame sections, and preview render) after undo/redo or project load.
- `window.openAccordionById(accId)` / `window.toggleAllAccordions(panelId, expand)` — Expands a specific accordion or toggles all sidebar accordions.
- `window.currentRenderState` — Most recent render state object produced by `SceneState.buildRenderState()`.

## 4. Dependencies
- Depends on `SceneState`, `ControlStateAdaptor`, `AppCoordinator`, `Effects`, `Stage`, `NodePresets`, `DiagramNodes`, `DataFlows`, `Glows`, `Ripples`, `HistoryManager`, `ProjectManager`, `StillExportStudio`, `AnimatedExportStudio`.
