# Module: `glows.js` (`window.Glows`)

## 1. Purpose
`internal/web/static/js/glows.js` manages pulsating hotspot glows, radar sweep pings, and custom graphic overlays on the SVG canvas.

## 2. Responsibilities by Layer
- **Layer 3 (Operational Functionality — Zero DOM Dependencies):**
  - Owns `list` array, `counter`, and `activeId`.
  - Pure operational CRUD and state methods: `createGlow(initialProps)`, `updateGlow(id, patch)`, `deleteGlow(id)`, `getGlow(id)`, `getAllGlows()`, `getState()`, `setState(data)`.
  - Pure SVG compilation (`injectIntoSVG(svgString, width, height)`) generating radial glow gradients, blur filters, pulsating SMIL `<animate>` circles/squares, radar ping rings, and custom embedded graphics in `#glows-layer`.
- **Layer 1 (UI Presentation):**
  - Sidebar glow list (`renderList`), `#glow*` property form bindings (`syncEditorUI`, `syncShapeVisibilityUI`), custom graphic `FileReader` upload, and interactive stage reticle overlay (`updateUIOverlay`).

## 3. Public Interface (`window.Glows`)
- **Operational API:**
  - `createGlow(initialProps)` / `updateGlow(id, patch)` / `deleteGlow(id)` / `getGlow(id)` / `getAllGlows()`
  - `getState()` / `setState(data)`
  - `injectIntoSVG(svgString, width, height)`
- **UI & Compatibility API:**
  - `init()`
  - `addGlow(initialProps)` / `removeGlow(id)` / `selectGlow(id)` / `deselectGlow()`
  - `updateActive(key, value)` / `handleStageClick(x, y)`
  - `renderList()` / `syncEditorUI(glow)` / `syncShapeVisibilityUI(shape)` / `updateUIOverlay(glow)` / `triggerAppRender()`

## 4. Dependencies
- Uses `window.AppCoordinator` (selection coordination, render requests, history recording).
