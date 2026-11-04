# Module: `flows.js` (`window.DataFlows`)

## 1. Purpose
`internal/web/static/js/flows.js` manages animated data flow connectors, multi-waypoint routing (`curve`, `ortho-hv`, `ortho-vh`, `ortho-mid`), payload graphics (`orb`, `packet`, `envelope`, `database`, `server`, `cloud`, `lock`, `warning`, `custom`, `line-only`), stage waypoint handle overlays, and SVG path/animation generation.

## 2. Responsibilities by Layer
- **Layer 3 (Operational Functionality — Zero DOM Dependencies):**
  - Owns `list` array, `counter`, `activeId`, and `activeNodeIdx`.
  - Pure operational CRUD and waypoint methods: `createFlow(initialProps)`, `updateFlow(id, patch)`, `deleteFlow(id)`, `getFlow(id)`, `getAllFlows()`, `addWaypoint(flowId, x, y)`, `removeWaypoint(flowId, waypointIdx)`, `updateWaypoint(flowId, waypointIdx, x, y)`, `getState()`, `setState(data)`, `escapeXML(str)`.
  - Pure path geometry & SVG generation: `generatePathString(nodes, curvature, width, height, routeMode)`, `getMidpoint(nodes, curvature, width, height)`, and `injectIntoSVG(svgString, stateOrWidth, heightArg)`.
- **Layer 1 (UI Presentation):**
  - Sidebar flow list (`renderList`), flow property editor (`syncEditorUI`, `refreshNodeSlider`), custom payload file upload (`FileReader`), and interactive stage waypoint reticles (`updateUIOverlay`).

## 3. Public Interface (`window.DataFlows`)
- **Operational API:**
  - `createFlow(initialProps)` / `updateFlow(id, patch)` / `deleteFlow(id)` / `getFlow(id)` / `getAllFlows()`
  - `addWaypoint(flowId, x, y)` / `removeWaypoint(flowId, waypointIdx)` / `updateWaypoint(flowId, waypointIdx, x, y)`
  - `generatePathString(nodes, curvature, width, height, routeMode)` / `getMidpoint(nodes, curvature, width, height)`
  - `getState()` / `setState(data)`
  - `injectIntoSVG(svgString, stateOrWidth, heightArg)`
- **UI & Compatibility API:**
  - `init()`
  - `addFlow(initialProps)` / `removeFlow(id)` / `selectFlow(id)` / `deselectFlow()`
  - `addNodeToActive()` / `dropNodeFromActive()`
  - `updateActive(key, value)` / `handleStageClick(x, y)`
  - `renderList()` / `syncEditorUI(f)` / `refreshNodeSlider(f)` / `updateUIOverlay()` / `triggerAppRender()`

## 4. Dependencies
- Uses `window.AppCoordinator` (selection coordination, canvas dimensions, render requests, history recording).
