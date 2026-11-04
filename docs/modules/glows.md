# Module: `glows.js` (`window.Glows`)

## 1. Purpose
`internal/web/static/js/glows.js` manages pulsating hotspot glows, radar sweep pings, and custom graphic overlays on the SVG canvas.

## 2. Responsibilities by Layer
- **Layer 3 (Operational Functionality):**
  - Owns `glows` array, `glowsCounter`, and `activeGlowId`.
  - Pure operational CRUD and state methods: `createGlow(initialProps)`, `updateGlow(id, patch)`, `deleteGlow(id)`, `getGlow(id)`, `getState()`, `setState(data)`.
  - Pure SVG compilation (`injectIntoSVG(rawSvg, state)`) generating radial glow gradients, blur filters, pulsating SMIL `<animate>` / `<animateTransform>` circles, radar ping rings, and custom embedded graphics in `#glowsLayer`.
- **Layer 1 (UI Presentation):**
  - Sidebar glow list (`renderList`), `#glow*` property form bindings, custom graphic `FileReader` upload, and interactive stage reticle overlay (`updateUIOverlay`).

## 3. Public Interface (`window.Glows`)
- **Operational API:**
  - `createGlow(initialProps)` / `updateGlow(id, patch)` / `deleteGlow(id)` / `getGlow(id)`
  - `getState()` / `setState(data)`
  - `injectIntoSVG(rawSvg, state)`
- **UI & Compatibility API:**
  - `init(triggerRenderCallback)`
  - `addGlow(customX, customY)` / `removeGlow(id)` / `selectGlow(id)`
  - `renderList()` / `updateUIOverlay()`

## 4. Dependencies
- Uses `window.AppCoordinator` (selection coordination, grid snapping, render requests, history recording).
