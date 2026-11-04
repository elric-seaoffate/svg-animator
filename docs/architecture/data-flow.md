# Data Flow

## 1. Interactive Control & Object Update Flow

When a user interacts with a sidebar input or drags an object on the stage:

```mermaid
sequenceDiagram
    participant User as User / DOM Event
    participant UI as Layer 1: UI Controller
    participant Coord as Layer 2: AppCoordinator
    participant Ops as Layer 3: Operational Module / SceneState
    participant Hist as Layer 3: HistoryManager

    User->>UI: Input change / Stage drag / Button click
    UI->>Ops: Update operational state (e.g., updateNode / syncFromDOM)
    UI->>Coord: requestRender() & recordHistoryImmediate()/Debounced()
    Coord->>Ops: SceneState.buildRenderState() & SceneState.buildFullSVG()
    Ops-->>Coord: Compiled SVG string + renderState
    Coord->>UI: Inject SVG into #canvasPreview & update stage overlays
    Coord->>Hist: Record snapshot (immediately or after 300ms debounce)
```

---

## 2. Master SVG Compilation Pipeline (`SceneState.buildFullSVG`)

Every render cycle constructs the complete SVG document through a deterministic operational pipeline:

1. **Canvas & Control State Resolution (`SceneState.buildRenderState()`):**
   - Resolves canvas width/height (from photo aspect ratio or selected ISO/ANSI/social/architectural paper preset and DPI).
   - Reads normalized optical filter, camera rig, and 3D mitered frame parameters from `SceneState.controls`.
2. **Base SVG & Frame Construction (`Effects.build(renderState)`):**
   - Generates `<svg viewBox="...">`, base `<defs>` (color grading, blur, vignette, chromatic aberration, film grain filters), camera rig `<g>`, background photo or canvas `<rect>`, and 3D mitered frame polygons.
3. **Refractive Water Ripples (`Ripples.injectIntoSVG`):**
   - Injects `<filter id="ripple-disp-...">` displacement maps into `<defs>`, applies filter chains to the background image, and injects animated concentric ripple rings into `#ripplesLayer`.
4. **Diagram Nodes (`DiagramNodes.injectIntoSVG`):**
   - Resolves effective node properties (`getNodeEffectiveProps(node)` merging `NodePresets` when `usePreset` is true).
   - Injects node drop-shadow filters/gradients into `<defs>` and renders shape geometry (`rounded`, `rect`, `pill`, `textbox`, `callout`, `diamond`, `hexagon`, `parallelogram`, `cylinder`, `cloud`, `circle`, `axes`), text spans, and hover/click animations into `#nodesLayer`.
5. **Data Flows (`DataFlows.injectIntoSVG`):**
   - Resolves endpoint coordinates (percentage or attached `fromNodeId`/`toNodeId` perimeter ports) and waypoint paths (`generatePathString`).
   - Injects marker arrowheads and glow filters into `<defs>`, renders base/animated track `<path>` elements, and attaches `<animateMotion>` payloads into `#flowsLayer`.
6. **Hotspot Glows (`Glows.injectIntoSVG`):**
   - Injects radial gradients and blur filters into `<defs>` and renders pulsating orbs, radar sweep rings, or custom graphics into `#glowsLayer`.

---

## 3. Undo/Redo & Project Persistence Flow

### Undo / Redo (`HistoryManager`)
1. `HistoryManager.captureSnapshot()` collects:
   - `controls`: Map of all 95 `trackedControlIds` via `ControlStateAdaptor` / `SceneState`.
   - `loadedPhoto`: Cloned photo descriptor from `SceneState`.
   - `presets`, `nodes`, `flows`, `glows`, `ripples`: Operational state snapshots via each module's `getState()`.
2. On `undo()` or `redo()`, `HistoryManager.applySnapshot(snap)` sets `isRestoring = true`, restores each operational module via `setState()`, updates DOM inputs via `ControlStateAdaptor.syncToDOM()`, triggers `AppCoordinator.requestRender()`, refreshes UI lists/accordions, and resets `isRestoring = false`.

### Project Save / Load (`ProjectManager`)
1. `ProjectManager.serializeStudioState()` constructs a schema `version: "1.2.0"` JSON object containing `controls` (plus `chkAutoApplyPreset`), `loadedPhoto`, `presets`, `nodes`, `flows`, `glows`, and `ripples`.
2. `POST /api/export/projects/save` persists `name`, `thumbnail` (data URL), and `schema_json` in SQLite (`studio_library.db`).
3. Loading a project fetches the record via `GET /api/export/projects/get?id=...`, parses `schema_json`, calls `ProjectManager.applyStudioState(state)`, and resets `HistoryManager` with the loaded project as the initial baseline snapshot.

---

## 4. Export Flows

### Still / Print Export (`StillExportStudio`)
1. Generates raw SVG at the target paper/canvas dimensions using `SceneState.buildFullSVG(state, overrides)`.
2. Parses the SVG into an offscreen DOM fragment and runs `StillExportStudio.evaluateSMILAtTime(svgEl, targetTimeSec)` to bake active `<animate>`, `<animateTransform>`, and `<animateMotion>` attributes at `t = targetTimeSec`.
3. Exports standalone `.svg`, standalone `.html`, or rasterizes to high-DPI `.png`, `.webp`, or `.jpg` via an HTML5 `<canvas>`.

### Animated Video / WebP / APNG Export (`export-modal.js`)
1. Serializes the current live SVG via `SceneState.serializeSVGForExport(rawSvg)` and collects duration, FPS, resolution, format (`webp`, `apng`, `mp4`, `bundle`), and optional audio track parameters.
2. Sends `POST /api/export` to the Go backend (`internal/web/server.go`), which launches headless Chromium (`internal/rasterizer/`) and FFmpeg while streaming progress via `GET /api/export/progress?jobId=...`.
