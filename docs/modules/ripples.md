# Module: `ripples.js` (`window.Ripples`)

## 1. Purpose
`internal/web/static/js/ripples.js` manages refractive water ripple regions and animated concentric surface rings on the SVG canvas.

## 2. Responsibilities by Layer
- **Layer 3 (Operational Functionality — Zero DOM Dependencies):**
  - Owns `list` array, `counter`, and `activeId`.
  - Pure operational CRUD and state methods: `createRipple(initialProps)`, `updateRipple(id, patch)`, `deleteRipple(id)`, `getRipple(id)`, `getAllRipples()`, `getState()`, `setState(data)`.
  - Pure SVG compilation (`injectIntoSVG(svgString, state)`) injecting Gaussian blur filters, expanding SMIL `<circle>` masks, masked refractive background photo clones (`Effects.buildPhotoElement`), and highlight/shadow rings into `#ripples-layer`.
- **Layer 1 (UI Presentation):**
  - Sidebar ripple list (`renderList`), `#ripple*` property form bindings (`syncEditorUI`), and interactive stage reticle overlay (`updateUIOverlay`).

## 3. Public Interface (`window.Ripples`)
- **Operational API:**
  - `createRipple(initialProps)` / `updateRipple(id, patch)` / `deleteRipple(id)` / `getRipple(id)` / `getAllRipples()`
  - `getState()` / `setState(data)`
  - `injectIntoSVG(svgString, state)`
- **UI & Compatibility API:**
  - `init()`
  - `addRipple(initialProps)` / `removeRipple(id)` / `selectRipple(id)` / `deselectRipple()`
  - `updateActive(key, value)` / `handleStageClick(x, y)`
  - `renderList()` / `syncEditorUI(rp)` / `updateUIOverlay(rp)` / `triggerAppRender()`

## 4. Dependencies
- Uses `window.Effects` (`buildPhotoElement` for refractive photo masks) and `window.AppCoordinator` (selection coordination, render requests, history recording).
