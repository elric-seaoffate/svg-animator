# SVG Animator Studio — AI Architecture & Development Guide

> **Purpose:** This file is the concise architectural map and developer onboarding reference for AI coding assistants working on **SVG Animator Studio**. It complements [`AGENTS.md`](AGENTS.md) (which defines permanent project rules, safety constraints, and phase boundaries) by documenting the actual implemented codebase and its module boundaries.

---

## 1. Quick Orientation

- **Backend & CLI (`cmd/svg-animator/main.go`, `internal/`):**
  - Written in Go (`go 1.25.0`, `modernc.org/sqlite`, `chromedp/chromedp`).
  - `internal/web/server.go` embeds `internal/web/static/*` via `//go:embed static/*` and serves the studio UI plus REST APIs for SQLite project persistence (`/api/projects*` and `/api/export/projects*`) and multi-frame headless Chromium + FFmpeg export (`/api/export*`).
  - `internal/db/sqlite.go` manages `studio_library.db` (`projects` and `assets` tables).
- **Frontend Studio (`internal/web/static/`):**
  - Single-page 3-column HTML5/CSS3/ES6+ studio (`index.html`, `css/style.css`, `css/export-modal.css`).
  - Vanilla JavaScript modules in `internal/web/static/js/` loaded via `<script>` tags in `index.html` and attached to `window.*`.

---

## 2. Three-Layer Frontend Architecture

The frontend architecture is structured around three distinct layers with a strict one-way dependency rule:

```text
Layer 1: UI Presentation  ──►  Layer 2: Application Coordination  ──►  Layer 3: Operational Functionality
```

| Layer | Responsibility | Key Files / Globals |
| :--- | :--- | :--- |
| **Layer 1: UI Presentation** | HTML/CSS, accordion panels, form input listeners, DOM list rendering, stage pointer/keyboard listeners, and modal dialogs. | `index.html`, `css/*.css`, UI controllers inside `app.js`, `stage.js`, `presets.js`, `nodes.js`, `flows.js`, `glows.js`, `ripples.js`, `projects.js`, `still-export-modal.js`, `export-modal.js` |
| **Layer 2: Application Coordination** | Receives UI commands, coordinates single-active-object selection across all object types, coordinates `HistoryManager` recording, synchronizes `ControlStateAdaptor` <-> `SceneState`, triggers rendering, and emits UI notifications. | `js/coordinator.js` (`window.AppCoordinator`) |
| **Layer 3: Operational Functionality** | Pure state ownership, CRUD operations, geometry/coordinate math, SVG filter/node/flow/glow/ripple/frame generation, history stack management (`undoStack`/`redoStack`), project JSON serialization (`v1.2.0`), and SMIL frame evaluation. Operational CRUD, math, and SVG builders do not query DOM inputs directly (`ControlStateAdaptor` bridges the 95 tracked DOM controls). | `js/scene-state.js` (`window.SceneState`, `window.ControlStateAdaptor`), `js/effects.js` (`window.Effects`), and operational APIs on `NodePresets`, `DiagramNodes`, `DataFlows`, `Glows`, `Ripples`, `Stage`, `HistoryManager`, `ProjectManager`, `StillExportStudio`, `AnimatedExportStudio` |

---

## 3. Script Load Order (`internal/web/static/index.html`)

Because the frontend uses browser globals embedded via `//go:embed`, script load order in `index.html` is significant:

1. `js/effects.js` (`window.Effects`) — Operational SVG filter, camera rig, and 3D mitered frame builders.
2. `js/scene-state.js` (`window.SceneState`, `window.ControlStateAdaptor`) — Operational canvas/control/photo state and DOM control synchronization adaptor.
3. `js/coordinator.js` (`window.AppCoordinator`) — Central coordination layer for selection, history recording, rendering, and cross-module commands.
4. `js/stage.js` (`window.Stage`) — Stage viewport geometry, grid snapping math, and pointer/wheel/drag interaction.
5. `js/presets.js` (`window.NodePresets`) — Shape preset parameters (`preset`, `presetKeys`, `autoApplyToNewNodes`) and node preset application.
6. `js/nodes.js` (`window.DiagramNodes`) — Diagram node state, CRUD API, SVG generation (`injectIntoSVG`), and node list/overlay UI.
7. `js/flows.js` (`window.DataFlows`) — Data flow connector state, CRUD/waypoint API, path math, SVG generation, and flow UI.
8. `js/glows.js` (`window.Glows`) — Hotspot/radar ping state, CRUD API, SVG generation, and glow UI.
9. `js/ripples.js` (`window.Ripples`) — Refractive water ripple state, CRUD API, displacement filter/ring SVG generation, and ripple UI.
10. `js/history.js` (`window.HistoryManager`) — Undo/redo snapshot stacks (`undoStack`, `redoStack`, `maxDepth: 50`) and `trackedControlIds` (95 DOM controls).
11. `js/projects.js` (`window.ProjectManager`) — Schema `1.2.0` project serialization/deserialization, `/api/export/projects*` (and `/api/projects*`) REST client, and library modal UI.
12. `js/app.js` — Main initialization, UI panel/accordion bindings, control listeners, and master preview compilation (`window.triggerRender`, `window.buildFullSVG`, `window.syncUIAfterHistoryRestore`).
13. `js/still-export-modal.js` (`window.StillExportStudio`) — Still render configuration (`buildStillRenderConfig`), time-scrubbed SMIL frame evaluation (`bakeStaticSVGAtTime`, `evaluateSMILAnimate`), and still/print export modal.
14. `js/export-modal.js` (`window.AnimatedExportStudio`) — Animated export payload builder (`constructExportJobPayload`) and multi-frame export modal (`POST /api/render`, progress polling, media downloads).

---

## 4. Implementation Status Map

| Capability | Status | Location |
| :--- | :--- | :--- |
| Go HTTP server, SQLite `projects` & `assets` DB, Chromium/FFmpeg rasterizer | **Implemented** | `cmd/svg-animator/`, `internal/` |
| Three-layer frontend separation (`SceneState`, `ControlStateAdaptor`, `AppCoordinator`) | **Implemented (Phase 1)** | `internal/web/static/js/scene-state.js`, `coordinator.js` |
| Operational APIs & UI separation across `presets`, `nodes`, `flows`, `glows`, `ripples`, `stage`, `history`, `projects`, `app`, export modals | **Implemented (Phase 1)** | `internal/web/static/js/*.js` |
| Central Shape Registry & standardized Phase 2 component event/data schemas | **Planned (Phase 2)** | Currently 12 hardcoded shapes in `DiagramNodes` (`nodes.js`) and `#nodeShapeSelect` (`index.html`) |
| Blender-style workspace (icon rails, sliding drawers, maximized stage) | **Planned (Phase 3)** | Currently 3-column studio layout (`leftPanel`, `stageArea`, `rightPanel`) |
| Context-sensitive floating property inspectors | **Planned (Phase 4)** | Currently accordion property sections in `leftPanel` / `rightPanel` |

---

## 5. Twelve Core AI Development Rules

1. **Understand before changing:** Inspect the relevant module doc in `docs/modules/` and source files before editing.
2. **Respect layer boundaries:** Follow `UI → Application Coordination → Operational Functionality`. Operational methods must never call `document.getElementById` or manipulate DOM elements directly.
3. **Preserve compatibility:** Keep all existing `window.*` globals, method names, and all 95 `HistoryManager.trackedControlIds` intact during Phase 1/2 work.
4. **Protect project persistence:** Preserve `schema_json` version `"1.2.0"` and backward-compatible fallbacks in `ProjectManager.applyStudioState()`.
5. **Respect history semantics:** Record discrete operations immediately (`recordHistoryImmediate`) and continuous slider/text edits with debounce (`recordHistoryDebounced`), and never record while `HistoryManager.isRestoring` is `true`.
6. **Never touch production DB during tests:** Never run CLI queries or tests directly against `./studio_library.db`; always use `t.TempDir()` in Go tests.
7. **Maintain embedded build compatibility:** Any new frontend asset under `internal/web/static/` must be tested with `BUILD_ONLY=1 ./build_and_run.sh` and `go test ./...`.
8. **Respect phase boundaries:** Do not introduce Phase 2 (Shape Registry), Phase 3 (Blender layout), or Phase 4 (floating inspectors) changes unless explicitly instructed.
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
- **Modules (`docs/modules/`):**
  - [`app.md`](docs/modules/app.md) | [`stage.md`](docs/modules/stage.md) | [`presets.md`](docs/modules/presets.md) | [`nodes.md`](docs/modules/nodes.md) | [`flows.md`](docs/modules/flows.md) | [`glows.md`](docs/modules/glows.md) | [`ripples.md`](docs/modules/ripples.md) | [`effects.md`](docs/modules/effects.md) | [`history.md`](docs/modules/history.md) | [`projects.md`](docs/modules/projects.md)
- **Development Guides (`docs/development/`):**
  - [`coding-conventions.md`](docs/development/coding-conventions.md) | [`module-development-guide.md`](docs/development/module-development-guide.md) | [`testing-requirements.md`](docs/development/testing-requirements.md) | [`adding-new-features.md`](docs/development/adding-new-features.md)
- **Architecture Decision Records (`docs/decisions/`):**
  - [`ADR-001-architectural-separation.md`](docs/decisions/ADR-001-architectural-separation.md)
  - [`ADR-002-application-coordination.md`](docs/decisions/ADR-002-application-coordination.md)
  - [`ADR-003-state-ownership.md`](docs/decisions/ADR-003-state-ownership.md)
