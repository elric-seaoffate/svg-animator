# Module: `stage.js` (`window.Stage`)

## 1. Purpose
`internal/web/static/js/stage.js` manages stage viewport geometry, coordinate conversion, grid snapping math, interactive zoom/pan controls, and pointer/reticle placement on the central studio stage.

## 2. Responsibilities by Layer
- **Layer 3 (Operational Viewport & Coordinate Math — Zero DOM Dependencies):**
  - `Stage.computeSnappedPosition(xPct, yPct, snapConfig)` — Pure 2D grid-snapping calculation converting percentage coordinates (`0–100`) to pixel grid increments and back without touching the DOM.
  - `Stage.computeSnappedPct(valPct, axis, snapConfig)` — Pure single-axis grid-snapping helper.
  - `Stage.computeFitScale(viewportW, viewportH, canvasW, canvasH, padding)` — Pure viewport fit-scale calculation.
  - `Stage.rectClientToPct(clientX, clientY, rect)` — Pure client-to-percentage coordinate conversion given a bounding box `{ left, top, width, height }`.
- **Layer 1 (Stage UI & Interaction):**
  - Viewport zoom (`fit`, `100%`, zoom in/out, Ctrl+wheel zoom) and spacebar/middle-mouse panning (`panX`, `panY`).
  - Camera placement reticle mode (`setActive`, `clearActive`, `updateReticles`) and interactive drag handling for Nodes, Flows, Glows, Ripples, and Photo Crop.
  - Stage click/drag selection and deselection routed through `window.AppCoordinator`.

## 3. Public Interface (`window.Stage`)
- **State Properties:** `activePlacement`, `isDragging`, `isPanningStage`, `isDraggingPhotoCrop`, `dragPhotoCropEnabled`, `spacePressed`, `canvasWidth`, `canvasHeight`, `zoomMode`, `zoomScale`, `panX`, `panY`.
- **Operational Math Methods:**
  - `computeSnappedPosition(xPct, yPct, snapConfig)`
  - `computeSnappedPct(valPct, axis, snapConfig)`
  - `computeFitScale(viewportW, viewportH, canvasW, canvasH, padding)`
  - `rectClientToPct(clientX, clientY, rect)`
- **Compatibility & UI Methods:**
  - `init(onPlaceCallback, onFileLoadedCallback)` / `initZoomControls()`
  - `snapPctToGrid(xPct, yPct)` — Queries `AppCoordinator.getSnapConfig()` and delegates to `computeSnappedPosition`.
  - `clientToCanvasPct(clientX, clientY)`
  - `getFitScale()` / `getEffectiveScale()` / `setManualZoomPct(pct)` / `syncOverlayBounds(canvasW, canvasH)`
  - `setActive(target)` / `clearActive()` / `updateReticles(sX, sY, eX, eY)`
  - `loadFile(file, callback)`

## 4. Dependencies
- Uses `window.AppCoordinator` for snap settings, selection coordination, render requests, and history recording.
- Interacts with `window.DataFlows` via `setActiveWaypointIndex(idx)` during waypoint drag interaction.
