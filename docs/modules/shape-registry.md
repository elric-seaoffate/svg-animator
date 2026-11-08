# Module: `shape-registry.js` (`window.ShapeRegistry`)

## 1. Purpose
`internal/web/static/js/shape-registry.js` provides an immutable central catalog of built-in SVG node shape definitions, default dimensions, and operational SVG markup generators. It decouples shape geometry definitions from node lifecycle and presentation logic.

## 2. Responsibilities by Layer
- **Layer 3 (Operational Functionality — Zero DOM Dependencies):**
  - Owns the immutable catalog of 12 built-in SVG node shapes.
  - Complete DOM independence: contains no `document.*` queries, DOM manipulations, or element bindings.
  - Immutability guarantees: freezes all internal definitions (`Object.freeze`) and exposes read-only query methods.
  - Pure SVG generation: each shape provides a `buildSVG(eff, w, h, hw, hh, commonStyle, n)` builder returning pure SVG element strings (`<rect>`, `<path>`, `<circle>`, `<polyline>`).

## 3. Public Interface (`window.ShapeRegistry`)
The registry object is frozen and exposes four read-only query methods:

- `get(id)` — Returns the frozen shape definition object for the specified `id` string, or `null` if not found.
- `has(id)` — Returns `true` if a shape with the specified string `id` is registered, otherwise `false`.
- `getAll()` — Returns a shallow copy array of all 12 frozen shape definition objects.
- `getIds()` — Returns a shallow copy array of all 12 registered shape string IDs.

### Shape Definition Schema
Each registered shape definition object contains:
- `id` (`string`): Unique shape identifier.
- `displayName` (`string`): Human-readable name used for UI dropdown options.
- `category` (`string`): Semantic grouping (`basic`, `flowchart`, `annotation`, `data`, `cloud`, `dataviz`).
- `defaultWidth` (`number`): Default pixel width for newly placed shapes.
- `defaultHeight` (`number`): Default pixel height for newly placed shapes.
- `buildSVG(eff, w, h, hw, hh, commonStyle, n)` (`function`): Pure function returning the SVG markup for the shape geometry.

## 4. Built-In Shapes Catalog
The registry includes 12 built-in shapes:

| Shape ID | Display Name | Category | Default Size | Primary SVG Element |
| :--- | :--- | :--- | :---: | :--- |
| `rounded` | Rounded Card / Service Box | `basic` | 170 × 80 | `<rect rx="12">` |
| `rect` | Rectangle / Process Box | `basic` | 170 × 80 | `<rect rx="2">` |
| `pill` | Pill / Stadium Terminal | `flowchart` | 170 × 80 | `<rect rx="min(hw,hh)">` |
| `textbox` | Floating Text Label Only | `annotation` | 170 × 80 | `<rect fill="transparent">` |
| `callout` | Callout Note / Annotation | `annotation` | 170 × 80 | `<path>` (folded bottom-left notch) |
| `diamond` | Decision Diamond / Gateway | `flowchart` | 140 × 90 | `<path>` (rhombus) |
| `hexagon` | Hexagon / Preparation Block | `flowchart` | 170 × 80 | `<polygon>` (6-vertex) |
| `parallelogram` | Parallelogram / Data Input | `data` | 170 × 80 | `<polygon>` (slanted parallelogram) |
| `cylinder` | Cylinder / Database Storage | `data` | 140 × 90 | `<path>` + `<ellipse>` (3D drum) |
| `cloud` | Cloud Service / Network Domain | `cloud` | 170 × 85 | `<path>` (compound cubic Bezier arcs) |
| `circle` | Circle / Hub Node | `basic` | 100 × 100 | `<circle>` |
| `axes` | Graph X/Y Coordinate Axes | `dataviz` | 170 × 80 | `<rect>` + `<line>` grid + `<polyline>` axes |

## 5. Dependencies & Consumers
- **Operational Dependencies:** Zero external module dependencies. Loaded at position 5 in `internal/web/static/index.html`.
- **Consumers:**
  - `DiagramNodes.injectIntoSVG(svgString, state)`: Layer 3 operational consumer delegating shape geometry rendering to `ShapeRegistry.get(node.shape)`.
  - `app.js` (`window.populateShapeDropdowns`): Layer 1 UI presentation consumer dynamically populating `#nodeShapeSelect` and `#presetVal-shape` selectors.
