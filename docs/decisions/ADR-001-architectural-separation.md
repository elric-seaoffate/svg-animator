# ADR-001: Three-Layer Frontend Architectural Separation

- **Status:** Accepted (Phase 1)
- **Date:** 2026-11-04

## Context
In the v1.1.x baseline of SVG Animator Studio, the frontend JavaScript modules (`app.js`, `stage.js`, `presets.js`, `nodes.js`, `flows.js`, `glows.js`, `ripples.js`, `history.js`, `projects.js`, `still-export-modal.js`, `export-modal.js`) combined DOM event listeners, direct `document.getElementById` input queries, cross-module state mutation, and SVG generation within the same methods. This tight coupling made it difficult to modify UI controls or extend component APIs without risking regressions in undo/redo (`HistoryManager`), project persistence (`ProjectManager`), or SVG rendering.

## Decision
Refactor the frontend architecture into three strictly ordered layers:
1. **Layer 1: UI Presentation** — HTML, CSS, DOM event listeners, sidebar list rendering, and stage overlays.
2. **Layer 2: Application Coordination (`window.AppCoordinator`)** — Command routing, single-active-object selection coordination, history recording triggers, and render coordination.
3. **Layer 3: Operational Functionality** — Pure state ownership (`SceneState` and component state collections), CRUD operations, coordinate/snap math, and SVG generation (`Effects.build` and `injectIntoSVG`) with zero direct DOM input queries.

During Phase 1, all existing `window.*` globals, method names, and all 95 `HistoryManager.trackedControlIds` are preserved via compatibility wrappers so the existing 3-column studio UI and saved SQLite projects continue to work without regressions.

## Consequences
- Operational methods can be invoked programmatically by future Phase 2 Component APIs, Phase 3 Blender-style drawers, and Phase 4 floating property inspectors without duplicating logic or scraping DOM inputs.
- Existing HTML inline handlers (`onclick="window.DiagramNodes.selectNode(...)"`) and saved `v1.2.0` projects remain 100% compatible.
