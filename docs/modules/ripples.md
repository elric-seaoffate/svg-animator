# Module: `ripples.js` (`window.Ripples`)

## 1. Purpose
`internal/web/static/js/ripples.js` manages refractive water ripple displacement regions and animated concentric surface rings on the SVG canvas.

## 2. Responsibilities by Layer
- **Layer 3 (Operational Functionality):**
  - Owns `ripples` array, `ripplesCounter`, and `activeRippleId`.
  - Pure operational CRUD and state methods: `createRipple(initialProps)`, `updateRipple(id, patch)`, `deleteRipple(id)`, `getRipple(id)`, `getState()`, `setState(data)`.
  - Pure SVG compilation (`injectIntoSVG(rawSvg, state)`) injecting `<feTurbulence>` + `<feDisplacementMap>` filter definitions, masked refractive background clones, and expanding SMIL `<ellipse>` rings into `#ripplesLayer`.
- **Layer 1 (UI Presentation):**
  - Sidebar ripple list (`renderList`), `#ripple*` property form bindings, and interactive stage ellipse/center overlay (`updateUIOverlay`).

## 3. Public Interface (`window.Ripples`)
- **Operational API:**
  - `createRipple(initialProps)` / `updateRipple(id, patch)` / `deleteRipple(id)` / `getRipple(id)`
  - `getState()` / `setState(data)`
  - `injectIntoSVG(rawSvg, state)`
- **UI & Compatibility API:**
  - `init(triggerRenderCallback)`
  - `addRipple(customX, customY)` / `removeRipple(id)` / `selectRipple(id)`
  - `renderList()` / `updateUIOverlay()`

## 4. Dependencies
- Uses `window.AppCoordinator` (selection coordination, grid snapping, render requests, history recording).
