# Module: `nodes.js` (`window.DiagramNodes`)

## 1. Purpose
`internal/web/static/js/nodes.js` manages diagram nodes, shapes, text labels, interactive animations, stage selection overlays, and SVG node generation.

## 2. Responsibilities by Layer
- **Layer 3 (Operational Functionality — Zero DOM Dependencies):**
  - Owns `list` array, `counter`, and `activeId`.
  - Pure operational CRUD and query methods: `createNode(initialProps)`, `updateNode(id, patch)`, `deleteNode(id)`, `getNode(id)`, `getAllNodes()`, `findNodeAtPct(xPct, yPct, canvasW, canvasH)`, `getNodeEffectiveProps(node)`, `getState()`, `setState(data)`, `escapeXML(str)`.
  - Pure SVG compilation (`injectIntoSVG(svgString, state)`) supporting all 12 implemented shapes (`rounded`, `rect`, `pill`, `textbox`, `callout`, `diamond`, `hexagon`, `parallelogram`, `cylinder`, `cloud`, `circle`, `axes`), multiline pipe-separated (`|`) text, subtext, drop shadows, and SMIL animations (`pulse-border`, `float`, `fade-in`).
- **Layer 1 (UI Presentation):**
  - Sidebar node list (`renderList`), node property editor (`syncEditorUI`, `updateActiveDimBadge`), and stage selection bounding box (`updateUIOverlay`).

## 3. Public Interface (`window.DiagramNodes`)
- **Operational API:**
  - `createNode(initialProps)` — Creates a node, optionally auto-applying enabled `NodePresets` and grid snapping via `AppCoordinator.snapPosition`, without direct DOM reads.
  - `updateNode(id, patch)` — Updates properties on an existing node.
  - `deleteNode(id)` — Removes a node from `list`.
  - `getNode(id)` / `getAllNodes()` — Reads node objects.
  - `findNodeAtPct(xPct, yPct, canvasW, canvasH)` — Hit-tests node bounding boxes in percentage coordinates.
  - `getNodeEffectiveProps(node)` — Resolves effective node properties with safe defaults.
  - `getState()` / `setState(data)` — Serializes and restores operational node state (`{ nodes, nodesCounter, activeId }`).
  - `injectIntoSVG(svgString, state)` — Injects `<defs>` and `#nodes-layer` SVG markup.
- **UI & Compatibility API:**
  - `init()`
  - `addNode(initialProps)` / `removeNode(id)`
  - `selectNode(id, openAccordion)` / `deselectNode()`
  - `updateActive(key, value)` / `handleStageClick(x, y)`
  - `renderList()` / `syncEditorUI(node)` / `updateUIOverlay(node)` / `updateActiveDimBadge(node)` / `refreshAfterChange()` / `triggerAppRender()`

## 4. Dependencies
- Uses `window.NodePresets` (`applyToNodeObject`) and `window.AppCoordinator` (selection coordination, grid snapping, canvas dimensions, render requests, history recording).
