# ADR-002: Focused Application Coordination Layer (`window.AppCoordinator`)

- **Status:** Accepted (Phase 1)
- **Date:** 2026-11-04

## Context
Previously, selecting an object in one module (for example `DiagramNodes.selectNode`) directly mutated the active selection fields of sibling modules (`DataFlows.activeFlowId = null`, `Glows.activeGlowId = null`, `Ripples.activeRippleId = null`), called sibling UI methods (`DataFlows.renderList()`, `Glows.updateUIOverlay()`), and called `window.openAccordionById(...)`. Similarly, `Stage` pointer listeners reached directly into `DiagramNodes.nodes` and `DataFlows.flows`.

## Decision
Introduce a focused coordination module, `internal/web/static/js/coordinator.js` (`window.AppCoordinator`), responsible strictly for:
- Coordinating single-active-object selection (`selectObject(type, id, options)`, `clearSelection()`, `getActiveSelection()`) across `node`, `flow`, `glow`, `ripple`, and `camera`.
- Coordinating `HistoryManager` recording (`recordHistoryImmediate()`, `recordHistoryDebounced(delayMs)`).
- Coordinating render requests (`requestRender()`) and stage overlay refreshes (`refreshAllOverlays()`).
- Providing a clean operational bridge for stage grid snapping (`snapPosition(xPct, yPct)`, `getSnapConfig()`) and canvas dimensions (`getCanvasDimensions()`).
- Providing lightweight event pub/sub (`on`, `off`, `emit`).

`AppCoordinator` is explicitly prohibited from becoming a "god object": all SVG construction, geometry calculation, and object CRUD remain inside their respective operational modules.

## Consequences
- Sibling object modules (`DiagramNodes`, `DataFlows`, `Glows`, `Ripples`) no longer mutate each other's selection state or call each other's UI methods directly.
- Adding new selectable object types or changing selection UI behavior in Phases 3–4 requires updating only `AppCoordinator` and UI listeners.
