# ADR-003: Incremental Operational State Ownership (`SceneState` & `ControlStateAdaptor`)

- **Status:** Accepted (Phase 1)
- **Date:** 2026-11-04

## Context
In the baseline implementation, `app.js` `render()`, `HistoryManager.captureSnapshot()`, and `ProjectManager.serializeStudioState()` treated the DOM itself as the primary state store for all 95 canvas, optical filter, camera rig, 3D frame, and grid-snap controls (`document.getElementById(id).value` / `.checked`). Replacing DOM controls abruptly would risk breaking existing slider/number synchronization, history snapshots, and saved `v1.2.0` projects.

## Decision
Introduce `internal/web/static/js/scene-state.js` containing:
1. **`window.SceneState`:** Owns operational scene state (`loadedPhoto`, `controls` map for all 95 tracked controls + `chkAutoApplyPreset`, `paperSpecs`, `buildCurrentCanvasState()`, `buildRenderState()`, `buildFullSVG(state, overrides)`, and `serializeSVGForExport(rawSvg)`).
2. **`window.ControlStateAdaptor`:** Bridges the existing DOM inputs and `SceneState.controls` via `syncFromDOM(controlIds)` and `syncToDOM(controlsMap)`.

Alongside `SceneState`, each collection module (`NodePresets`, `DiagramNodes`, `DataFlows`, `Glows`, `Ripples`) exposes pure operational `getState()` and `setState(data)` methods so `HistoryManager` and `ProjectManager` never inspect internal arrays directly.

## Consequences
- `SceneState.buildRenderState()` and `SceneState.buildFullSVG()` operate on plain JavaScript state objects rather than scraping DOM elements.
- `HistoryManager` and `ProjectManager` preserve exact byte-for-byte snapshot and schema `1.2.0` compatibility while delegating state ownership to `SceneState` and component `getState()`/`setState()` APIs.
