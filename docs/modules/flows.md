# Module: `flows.js` (`window.DataFlows`)

## 1. Purpose
`internal/web/static/js/flows.js` manages animated data flow connectors between coordinates or diagram nodes, waypoint routing (`straight`, `bezier`, `elbow`), custom payload graphics, stage handle overlays, and SVG path/animation generation.

## 2. Responsibilities by Layer
- **Layer 3 (Operational Functionality):**
  - Owns `flows` array, `flowsCounter`, `activeFlowId`, and `activeWaypointIdx`.
  - Pure operational CRUD and waypoint methods: `createFlow(initialProps)`, `updateFlow(id, patch)`, `deleteFlow(id)`, `getFlow(id)`, `addWaypoint(flowId, xPct, yPct, insertIdx)`, `removeWaypoint(flowId, wpIdx)`, `updateWaypoint(flowId, wpIdx, patch)`, `getState()`, `setState(data)`.
  - Pure path geometry & SVG generation: `getFlowEndpoints(flow, width, height)`, `generatePathString(flow, width, height)`, `getMidpoint(flow, width, height)`, and `injectIntoSVG(rawSvg, state)`.
- **Layer 1 (UI Presentation):**
  - Sidebar flow list (`renderList`), node endpoint dropdown refresh (`refreshNodeSlider`), custom payload file upload (`FileReader`), and interactive stage handles (`updateUIOverlay`).

## 3. Public Interface (`window.DataFlows`)
- **Operational API:**
  - `createFlow(initialProps)` / `updateFlow(id, patch)` / `deleteFlow(id)` / `getFlow(id)`
  - `addWaypoint(flowId, xPct, yPct, insertIdx)` / `removeWaypoint(flowId, wpIdx)` / `updateWaypoint(flowId, wpIdx, patch)`
  - `getFlowEndpoints(flow, width, height)` / `generatePathString(flow, width, height)` / `getMidpoint(flow, width, height)`
  - `getState()` / `setState(data)`
  - `injectIntoSVG(rawSvg, state)`
- **UI & Compatibility API:**
  - `init(triggerRenderCallback)`
  - `addFlow(fromNodeId, toNodeId, customStartX, customStartY, customEndX, customEndY)`
  - `removeFlow(id)` / `selectFlow(id)`
  - `renderList()` / `refreshNodeSlider()` / `updateUIOverlay()`

## 4. Dependencies
- Uses `window.DiagramNodes` (resolving attached `fromNodeId`/`toNodeId` perimeter ports) and `window.AppCoordinator` (selection coordination, grid snapping, render requests, history recording).
