# Module: `nodes.js` (`window.DiagramNodes`)

## 1. Purpose
`internal/web/static/js/nodes.js` manages diagram nodes, shapes, text labels, interactive animations, stage selection/resize overlays, and SVG node generation.

## 2. Responsibilities by Layer
- **Layer 3 (Operational Functionality):**
  - Owns `nodes` array, `nodesCounter`, `activeNodeId`, and `selectedNodeIds`.
  - Pure operational CRUD and query methods: `createNode(props)`, `updateNode(id, patch)`, `deleteNode(id)`, `getNode(id)`, `getAllNodes()`, `findNodeAtPct(xPct, yPct, canvasW, canvasH)`, `getNodeEffectiveProps(node)`, `getState()`, `setState(data)`.
  - Pure SVG compilation (`injectIntoSVG(rawSvg, state)`) supporting the 12 implemented shapes (`rounded`, `rect`, `pill`, `textbox`, `callout`, `diamond`, `hexagon`, `parallelogram`, `cylinder`, `cloud`, `circle`, `axes`), multiline text wrapping, gradients, drop shadows, and hover/click animations (`scale`, `lift`, `glow`, `pulse`, `shake`).
- **Layer 1 (UI Presentation):**
  - Sidebar node list (`renderList`), node property editor (`syncEditorUI`, `updateActiveDimBadge`), and stage selection/resize handles (`updateUIOverlay`).

## 3. Public Interface (`window.DiagramNodes`)
- **Operational API:**
  - `createNode(initialProps)` — Creates a node, optionally auto-applying enabled `NodePresets`, without direct DOM reads.
  - `updateNode(id, patch)` — Updates properties on an existing node.
  - `deleteNode(id)` — Removes a node from `nodes`.
  - `getNode(id)` / `getAllNodes()` — Reads node objects.
  - `findNodeAtPct(xPct, yPct, canvasW, canvasH)` — Hit-tests node bounding boxes in percentage coordinates.
  - `getNodeEffectiveProps(node)` — Resolves effective node properties merging `NodePresets` when `node.usePreset` is `true`.
  - `getState()` / `setState(data)` — Serializes and restores operational node state.
  - `injectIntoSVG(rawSvg, state)` — Injects `<defs>` and `#nodesLayer` SVG markup.
- **UI & Compatibility API:**
  - `init(triggerRenderCallback)`
  - `addNode(shapeOverride, customX, customY)`
  - `removeNode(id)`
  - `selectNode(id, addToSelection)`
  - `renderList()` / `syncEditorUI()` / `updateUIOverlay()` / `updateActiveDimBadge()`

## 4. Dependencies
- Uses `window.NodePresets` (`getNodeEffectiveProps`, `applyToNodeObject`) and `window.AppCoordinator` (selection coordination, grid snapping, canvas dimensions, render requests, history recording).
