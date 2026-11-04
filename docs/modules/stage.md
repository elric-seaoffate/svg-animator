# Module: `stage.js` (`window.Stage`)

## 1. Purpose
`internal/web/static/js/stage.js` manages stage viewport geometry, coordinate conversion, grid snapping math, interactive zoom/pan controls, and pointer/reticle placement on the central studio stage.

## 2. Responsibilities by Layer
- **Layer 3 (Operational Math):**
  - `Stage.computeSnappedPct(valPct, axis, snapConfig)` — Pure grid-snapping calculation converting percentage coordinates (`0–100`) to pixel grid increments and back without touching the DOM.
  - `Stage.computeFitScale(viewportW, viewportH, canvasW, canvasH, padding)` — Pure viewport fit-scale calculation.
  - `Stage.rectClientToPct(clientX, clientY, rect)` — Pure client-to-percentage coordinate conversion given a bounding box `{ left, top, width, height }`.
- **Layer 1 (Stage UI & Interaction):**
  - Viewport zoom (`fit`, `100%`, zoom in/out, Ctrl+wheel zoom) and spacebar/middle-mouse panning (`panX`, `panY`).
  - Placement reticle mode (`setPlacementMode`, `clearPlacementMode`, `updateReticleOverlay`) for Camera start/end points, Nodes, Flows, Glows, and Ripples.
  - Stage click/drag selection and deselection routed through `window.AppCoordinator`.

## 3. Public Interface (`window.Stage`)
- **State Properties:** `zoomMode`, `zoomScale`, `panX`, `panY`, `isPanning`, `spaceHeld`, `activePlacement`, `isDraggingReticle`.
- **Operational Math Methods:**
  - `computeSnappedPct(valPct, axis, snapConfig)`
  - `computeFitScale(viewportW, viewportH, canvasW, canvasH, padding)`
  - `rectClientToPct(clientX, clientY, rect)`
- **Compatibility & UI Methods:**
  - `init(triggerRenderCallback)`
  - `snapPctToGrid(valPct, axis)` — Queries `AppCoordinator.getSnapConfig()` and delegates to `computeSnappedPct`.
  - `clientToCanvasPct(clientX, clientY)`
  - `getFitScale()` / `getEffectiveScale()`
  - `setZoom(mode, customScale)` / `applyTransform()`
  - `setPlacementMode(type, targetId)` / `clearPlacementMode()`
  - `updateReticleOverlay()`

## 4. Dependencies
- Uses `window.AppCoordinator` for snap settings, object placement, hit-testing, selection/deselection, render requests, and history recording.
