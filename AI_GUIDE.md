# SVG Animator Studio — AI Architecture & Development Guide

> **Purpose:** This file is the concise architectural map and developer onboarding reference for AI coding assistants working on **SVG Animator Studio**. It complements [`AGENTS.md`](AGENTS.md) (which defines permanent project rules, safety constraints, and phase boundaries) by documenting the actual implemented codebase and its module boundaries.

---

## 1. Quick Orientation

- **Core Engine & CLI (`pkg/engine/`, `cmd/svg-animator/`, `cmd/wasm/`, `internal/`):**
  - Portable Go engine (`pkg/engine/`) implementing authoritative scene data models, geometry, path routing, snapping, validation, and export calculations.
  - WebAssembly execution engine (`cmd/wasm/main.go`, `internal/web/static/wasm/engine.wasm`) compiled with `GOOS=js GOARCH=wasm` via `scripts/build-wasm.sh`.
  - HTTP studio server and REST API (`internal/web/server.go`) embedding `internal/web/static/*` via `//go:embed` and serving SQLite persistence (`/api/projects*`) and multi-frame Chromium/FFmpeg rasterization (`/api/export*`).
  - Local SQLite persistence via `modernc.org/sqlite` (`internal/db/sqlite.go`, `studio_library.db`).
- **Frontend Studio (`internal/web/static/`):**
  - Single-page 3-column HTML5/CSS3/ES6+ studio (`index.html`, `css/style.css`, `css/export-modal.css`).
  - WebAssembly engine bridge (`js/engine-bridge.js`, `js/wasm_exec.js`) with versioned command dispatch (`pkg/engine/protocol`) and seamless JavaScript fallbacks.
  - Vanilla JavaScript presentation modules in `internal/web/static/js/` loaded via `<script>` tags in `index.html`.

---

## 2. Go-First WebAssembly Architecture

The application follows the fundamental rule:
`Go Engine (Authoritative)  ──►  WASM Bridge  ──►  JavaScript Browser Adapter  ──►  Browser SVG Engine`

Core principles:
1. **Go is the primary application and animation engine.**
2. **WASM runs the Go engine inside the browser-based editor.**
3. **JavaScript is a thin browser/DOM/SVG presentation adapter.**
4. **The browser renders the SVG.**
5. **Exported SVG files remain standalone and must not require WASM or the editor's JavaScript runtime.**

| Layer | Responsibility | Key Files / Packages |
| :--- | :--- | :--- |
| **Go Engine** | Authoritative models, geometry, path routing, snapping, constraints, timeline evaluation, validation, and serialization. | `pkg/engine/geometry/`, `pkg/engine/scene/`, `pkg/engine/timeline/`, `pkg/engine/protocol/`, `cmd/wasm/` |
| **WASM Bridge** | Platform adapter, runtime instantiation, versioned command dispatch, and metrics. | `internal/web/static/js/engine-bridge.js`, `internal/web/static/js/wasm_exec.js` |
| **Layer 1: UI Presentation** | HTML/CSS, drawer panels, form input listeners, stage pointer/keyboard events, floating inspector, and SVG DOM updates. | `index.html`, `css/*.css`, UI controllers in `app.js`, `stage.js`, `nodes.js`, etc. |
| **Layer 2: Coordination** | Selection coordination, history debouncing, and tool panel synchronization. | `js/coordinator.js` (`window.AppCoordinator`) |
| **Layer 3: Operational JS (Compatibility)** | Built-in JavaScript operational methods acting as graceful fallbacks whenever WebAssembly is not available. | `js/flows.js`, `js/stage.js`, `js/nodes.js`, `js/scene-state.js` |

### 2.1 Object Concepts: Selection ≠ Group ≠ Class/Type ≠ Data Binding

To maintain architectural clarity as the application evolves towards Digital Twin capabilities, four distinct concepts are explicitly separated:

1. **Selection (`SelectionState{Type, ID, Items}`)**: Transient UI interaction state. Indicates which objects are currently focused, hovered, or marquee-selected in the editor. Not saved to project files.
2. **Persistent Group (`Group{ID, Name, Members, Metadata}`)**: Persistent, named spatial/visual assembly of scene objects (shapes, flows, glows, ripples, images) that moves and transforms together. Flat, single-level hierarchy. Stored in Go scene models, `.sva` packages, SQLite projects, and undo/redo snapshots. Automatically pruned when members are deleted.
3. **Layer Order (`LayerEntry{Type, ID, Visible, Locked}`)**: Authoritative scene-wide stacking order. Bottom-to-top rendering index (0 is bottom-most, N-1 is top-most). Preserved in Go scene models, `.sva` packages, SQLite projects, and undo/redo snapshots. Controlled via `Layer.Get`, `Layer.Set`, `Layer.BringToFront`, `Layer.BringForward`, `Layer.SendBackward`, `Layer.SendToBack`, `Layer.SetVisibility`, `Layer.SetLocked`, and `Layer.GetEffective`.
4. **Independent Image Objects (`Image{ID, Name, X, Y, Width, Height, MaintainAspectRatio, Opacity, AssetRef, Data}`)**: Freely positionable and scalable bitmap/SVG graphic elements. Bundled as discrete files in `.sva` packages under `assets/image_<id>.<ext>` and serialized to SQLite. Managed via `Image.Create`, `Image.Update`, `Image.Delete`, `Image.Get`, `Image.List`.
5. **Class / Type (Planned future phase)**: Semantic category or asset definition (e.g. Pump, Heat Exchanger, Sensor). Defines template attributes, default visual representation, and telemetry port schemas.
6. **Data Binding (Planned future phase)**: Dynamic runtime connection between an external telemetry metric/tag and an object/class visual property (e.g. rotation, flow rate, color alert).

---

## 3. Script Load Order (`internal/web/static/index.html`)

Because the frontend uses browser globals embedded via `//go:embed`, script load order in `index.html` is significant:

1. `js/wasm_exec.js` — Standard Go WebAssembly runtime bootstrap.
2. `js/engine-bridge.js` (`window.EngineBridge`) — Go/WASM engine loader, command dispatcher, and readiness manager.
3. `js/effects.js` (`window.Effects`) — Operational SVG filter, camera rig, and 3D mitered frame builders.
4. `js/scene-state.js` (`window.SceneState`, `window.ControlStateAdaptor`) — Operational canvas/control/photo state and DOM control synchronization adaptor.
5. `js/coordinator.js` (`window.AppCoordinator`) — Central coordination layer for selection, history recording, rendering, and cross-module commands.
6. `js/stage.js` (`window.Stage`) — Stage viewport geometry, grid snapping math, and pointer/wheel/drag interaction.
7. `js/shape-registry.js` (`window.ShapeRegistry`) — Immutable central registry of built-in SVG node shape definitions, default dimensions, and operational SVG markup builders.
8. `js/presets.js` (`window.NodePresets`) — Shape preset parameters (`preset`, `presetKeys`, `autoApplyToNewNodes`) and node preset application.
9. `js/nodes.js` (`window.DiagramNodes`) — Diagram node state, CRUD API, SVG generation (`injectIntoSVG`), and node list/overlay UI.
10. `js/flows.js` (`window.DataFlows`) — Data flow connector state, CRUD/waypoint API, path math, SVG generation, and flow UI.
11. `js/glows.js` (`window.Glows`) — Hotspot/radar ping state, CRUD API, SVG generation, and glow UI.
12. `js/ripples.js` (`window.Ripples`) — Refractive water ripple state, CRUD API, displacement filter/ring SVG generation, and ripple UI.
13. `js/history.js` (`window.HistoryManager`) — Undo/redo snapshot stacks (`undoStack`, `redoStack`, `maxDepth: 50`) and `trackedControlIds` (95 DOM controls).
14. `js/projects.js` (`window.ProjectManager`) — Schema `1.2.0` project serialization/deserialization, `/api/export/projects*` (and `/api/projects*`) REST client, and library modal UI.
15. `js/app.js` — Main initialization, UI panel/accordion bindings, control listeners, dynamic shape dropdown population, and master preview compilation (`window.triggerRender`, `window.buildFullSVG`, `window.syncUIAfterHistoryRestore`).
16. `js/still-export-modal.js` (`window.StillExportStudio`) — Still render configuration (`buildStillRenderConfig`), time-scrubbed SMIL frame evaluation (`bakeStaticSVGAtTime`, `evaluateSMILAnimate`), and still/print export modal.
17. `js/export-modal.js` (`window.AnimatedExportStudio`) — Animated export payload builder (`constructExportJobPayload`) and multi-frame export modal (`POST /api/render`, progress polling, media downloads).

---

## 4. Implementation Status Map

| Capability | Status | Location |
| :--- | :--- | :--- |
| Go HTTP server, SQLite `projects` & `assets` DB, Chromium/FFmpeg rasterizer | **Implemented** | `cmd/svg-animator/`, `internal/` |
| Go Core Engine & WebAssembly Runtime Foundation | **Implemented** | `pkg/engine/`, `cmd/wasm/`, `scripts/build-wasm.sh` |
| WebAssembly Engine Bridge & Command Dispatcher | **Implemented** | `internal/web/static/js/engine-bridge.js`, `wasm/engine.wasm` |
| Flow Path Geometry & Grid Snapping Migration (Slice 1) | **Implemented** | `pkg/engine/geometry/`, `js/flows.js`, `js/stage.js` |
| Go Scene Model, Timeline & Batched Frame Evaluation (Slice 2) | **Implemented (WASM Stage 2)** | `pkg/engine/scene/`, `pkg/engine/timeline/`, `engine-bridge.js`, `app.js` |
| Go Shape Registry, Presets & Diagram Node Engine | **Implemented (WASM Stage 3)** | `pkg/engine/geometry/shapes.go`, `pkg/engine/scene/preset.go`, `nodes.js` |
| Go Flow Connectors, Waypoint CRUD & Path Engine | **Implemented (WASM Stage 4)** | `pkg/engine/geometry/flow_geom.go`, `pkg/engine/scene/flow.go`, `flows.js` |
| Go Hotspot Glows & Radar Ping Engine | **Implemented (WASM Stage 5)** | `pkg/engine/scene/glow.go`, `pkg/engine/protocol/`, `glows.js` |
| Go Refractive Water Ripple Engine | **Implemented (WASM Stage 6)** | `pkg/engine/scene/ripple.go`, `pkg/engine/protocol/`, `ripples.js` |
| Go Camera, Optics & 3D Frame Effect Engines | **Implemented (WASM Stage 7)** | `pkg/engine/scene/camera.go`, `optics.go`, `frame.go`, `pkg/engine/timeline/evaluator.go`, `effects.js` |
| Go Authoritative Scene State, Selection, History & Object Naming | **Implemented (WASM Stage 8)** | `pkg/engine/scene/selection.go`, `history.go`, `model.go`, `protocol/`, `engine-bridge.js`, `coordinator.js`, `index.html` |
| Native .sva Project Format & Asset Packaging | **Implemented (WASM Stage 9)** | `pkg/engine/sva/`, `pkg/engine/protocol/`, `internal/web/server.go`, `js/engine-bridge.js`, `js/projects.js`, `index.html` |
| SVA Background Asset Packaging & Restoration Repair | **Implemented (v1.2.0)** | `pkg/engine/sva/decoder.go`, `encoder.go`, `effects.js`, `projects.js` |
| Post-Migration Consolidation & Stable Release | **Implemented (v1.2.0)** | `cmd/svg-animator/`, `docs/`, `scripts/`, release packaging |
| Multi-Selection, Alignment, Distribution & Colour Tool | **Implemented (Stage 12)** | `pkg/engine/scene/transform.go`, `selection.go`, `protocol/`, `coordinator.js`, `app.js` |
| Persistent Object Groups, Integrated Duplication & Copy/Paste | **Implemented (Stage 13 & Repair)** | `pkg/engine/scene/group.go`, `clipboard.go`, `sva/`, `protocol/`, `coordinator.js`, `engine-bridge.js`, `stage.js`, `nodes.js`, `flows.js`, `glows.js`, `ripples.js`, `app.js` |
| Unified Layer Management & Independent Image Objects | **Implemented (Stage 14)** | `pkg/engine/scene/layer.go`, `image.go`, `protocol/`, `sva/`, `engine-bridge.js`, `coordinator.js`, `app.js`, `stage.js` |
| Three-layer frontend separation (`SceneState`, `ControlStateAdaptor`, `AppCoordinator`) | **Implemented (Phase 1)** | `internal/web/static/js/scene-state.js`, `coordinator.js` |
| Operational APIs & UI separation across `presets`, `nodes`, `flows`, `glows`, `ripples`, `stage`, `history`, `projects`, `app`, export modals | **Implemented (Phase 1)** | `internal/web/static/js/*.js` |
| Immutable SVG Shape Registry (`window.ShapeRegistry`) | **Implemented (Stage 2.1)** | `internal/web/static/js/shape-registry.js` (commit `f229c89`) |
| Dynamic UI Shape Dropdown Integration & Fallbacks | **Implemented (Stage 2.2)** | `internal/web/static/js/app.js` (commit `c1155bc`) |
| Targeted Component Public APIs | **Implemented (Stage 2.3)** | Standardized Layer 3 operational interfaces across modules (commit `2b6b17e`) |
| Restoration & UI Refresh Decoupling | **Implemented (Stage 2.4)** | Decoupled Layer 3 restoration in `HistoryManager` & `ProjectManager` via `AppCoordinator.coordinatePostRestore` and `history:changed` (commit `92aa87d`) |
| Peer UI Refresh Decoupling (ARCH-07) | **Implemented (Stage 2.5)** | Centralized selection, waypoint selection (`DataFlows.selectWaypoint`), and active overlay coordination via `AppCoordinator.updateActiveOverlays()` (commit `7337a08`) |
| Architecture Boundary Cleanup (ARCH-04 & ARCH-02) | **Implemented (Stage 2.6)** | Removed Layer 3 DOM fallbacks in `HistoryManager` & `ProjectManager` (ARCH-04 PASS); relocated browser-dependent SVG serialization to Layer 1 `window.SVGExportAdapter` in `app.js` (ARCH-02 PASS); retained offscreen geometry sandbox in `StillExportStudio` (ARCH-05 deferred) |
| Workspace Foundation, Icon Rails & Sliding Drawers | **Implemented (Stage 3.1)** | Dual vertical icon rails (`.icon-rail-left`, `.icon-rail-right`), collapsible sliding drawers (`#leftDrawer`, `#rightDrawer`), maximized canvas mode, rail sync, and keyboard navigation in `internal/web/static/` (commit `01415e8`) |
| Workspace Interaction & Responsive Layout Refinement | **Implemented (Stage 3.2)** | Responsive viewport profiles (desktop, compact, tablet slide-over, mobile narrow), drawer section memory, idempotent controller init, centralized overlay sync, and focus-visible polish in `internal/web/static/` |
| Context-sensitive floating property editor & Select None | **Implemented (Phase 4)** | Draggable `#floatingContextEditor`, right-click targeting, optical effect hit testing, blank canvas deselect, and escape clearing |

---

## 5. Twelve Core AI Development Rules

1. **Understand before changing:** Inspect the relevant module doc in `docs/modules/` and source files before editing.
2. **Respect layer boundaries:** Follow `UI → Application Coordination → Operational Functionality`. Operational methods must never call `document.getElementById` or manipulate DOM elements directly.
3. **Preserve compatibility:** Keep all existing `window.*` globals, method names, and all 95 `HistoryManager.trackedControlIds` intact during Phase 1/2 work.
4. **Protect project persistence:** Preserve `schema_json` version `"1.2.0"` and backward-compatible fallbacks in `ProjectManager.applyStudioState()`.
5. **Respect history semantics:** Record discrete operations immediately (`recordHistoryImmediate`) and continuous slider/text edits with debounce (`recordHistoryDebounced`), and never record while `HistoryManager.isRestoring` is `true`.
6. **Never touch production DB during tests:** Never run CLI queries or tests directly against `./studio_library.db`; always use `t.TempDir()` in Go tests.
7. **Maintain embedded build compatibility:** Any new frontend asset under `internal/web/static/` must be tested with `BUILD_ONLY=1 ./build_and_run.sh` and `go test ./...`.
8. **Respect architectural scope:** Core migration phases (Phases 1–4, WASM Stages 1–9, and native `.sva` packaging) are fully implemented. Do not introduce speculative Digital Twin, telemetry, or unapproved UI changes without explicit instructions.
9. **Keep documentation accurate:** Update `docs/modules/` and `docs/architecture/` whenever module APIs or responsibilities change. Never document planned features as implemented.
10. **Maintain BookStack logs:** Record major checkpoints and architectural milestones in BookStack Book ID `353` (`svg-animator-project-log`) using credentials from `/root/.config/svg-animator/bookstack.env` without ever exposing tokens.
11. **Protect Git remotes:** Treat `gitea` (`https://127.0.0.1:3000/nigel/svg-animator.git`) as authoritative; do not push or merge without user instruction.
12. **Verify every change:** Run `go vet ./...`, `go test ./...`, and `BUILD_ONLY=1 ./build_and_run.sh` before concluding any code change.

---

## 6. Detailed Documentation Index

- **Architecture (`docs/architecture/`):**
  - [`overview.md`](docs/architecture/overview.md) — End-to-end system architecture (Go backend + embedded JS studio).
  - [`application-layers.md`](docs/architecture/application-layers.md) — Detailed responsibilities of Layer 1 (UI), Layer 2 (`AppCoordinator`), and Layer 3 (Operational).
  - [`data-flow.md`](docs/architecture/data-flow.md) — User input, state mutation, SVG compilation, history capture, and export flows.
  - [`dependency-map.md`](docs/architecture/dependency-map.md) — Module load order and allowed inter-module dependencies.
  - [`state-management.md`](docs/architecture/state-management.md) — Ownership of scene, control, selection, and object collection states.
  - [`history-and-persistence.md`](docs/architecture/history-and-persistence.md) — Undo/redo snapshot mechanics and SQLite `v1.2.0` project format.
  - [`phase2-progress.md`](docs/architecture/phase2-progress.md) — Phase 2 milestone logs, test reports, and roadmap.
  - [`phase3-progress.md`](docs/architecture/phase3-progress.md) — Phase 3 workspace redesign progress, drawer architecture, and verification.
  - [`sva-format-specification.md`](docs/architecture/sva-format-specification.md) — Native `.sva` project package layout, manifest schema, security limits, and Go serialization.
- **Modules (`docs/modules/`):**
  - [`app.md`](docs/modules/app.md) | [`stage.md`](docs/modules/stage.md) | [`presets.md`](docs/modules/presets.md) | [`nodes.md`](docs/modules/nodes.md) | [`shape-registry.md`](docs/modules/shape-registry.md) | [`flows.md`](docs/modules/flows.md) | [`glows.md`](docs/modules/glows.md) | [`ripples.md`](docs/modules/ripples.md) | [`effects.md`](docs/modules/effects.md) | [`history.md`](docs/modules/history.md) | [`projects.md`](docs/modules/projects.md)
- **Development Guides (`docs/development/`):**
  - [`coding-conventions.md`](docs/development/coding-conventions.md) | [`module-development-guide.md`](docs/development/module-development-guide.md) | [`testing-requirements.md`](docs/development/testing-requirements.md) | [`adding-new-features.md`](docs/development/adding-new-features.md)
- **Architecture Decision Records (`docs/decisions/`):**
  - [`ADR-001-architectural-separation.md`](docs/decisions/ADR-001-architectural-separation.md)
  - [`ADR-002-application-coordination.md`](docs/decisions/ADR-002-application-coordination.md)
  - [`ADR-003-state-ownership.md`](docs/decisions/ADR-003-state-ownership.md)
