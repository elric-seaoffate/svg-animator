# Module Development Guide

## 1. Layer Separation Pattern

Every frontend module in `internal/web/static/js/` must enforce the three-layer separation:

```text
Layer 1: UI Presentation  ──►  Layer 2: AppCoordinator  ──►  Layer 3: Operational Functionality
```

### Layer 3: Operational Methods (Zero DOM Access)
Operational methods must:
- Accept plain JavaScript arguments (`props`, `patch`, `state`, `width`, `height`).
- Never call `document.getElementById`, `document.querySelector`, or read `.value` / `.checked` from DOM elements.
- Never manipulate DOM classes, inline styles, or `.innerHTML`.
- Return plain data objects, booleans, or SVG markup strings.
- Expose `getState()` and `setState(data)` for `HistoryManager` and `ProjectManager`.

### Layer 2: Coordination Calls (`window.AppCoordinator`)
When an operation requires cross-module coordination:
- **Selection:** Call `AppCoordinator.selectObject('node', id)` instead of directly mutating `DataFlows.activeFlowId = null` or `Glows.activeGlowId = null`.
- **Snapping:** Call `AppCoordinator.snapPosition(xPct, yPct)` instead of querying `#chkSnapToGrid` or calling `Stage` DOM methods directly.
- **Rendering:** Call `AppCoordinator.requestRender()` (or the injected `triggerRenderCallback`).
- **History:** Call `AppCoordinator.recordHistoryImmediate()` or `AppCoordinator.recordHistoryDebounced(300)`.

### Layer 1: UI Presentation Methods
UI methods (`init`, `renderList`, `syncEditorUI`, `updateUIOverlay`) may:
- Attach DOM listeners to sidebar controls and stage overlays.
- Read input values and pass them into operational methods (`this.updateNode(id, patch)`).
- Render HTML lists and stage overlay handles based on operational state (`this.getState()`, `this.getNode(id)`).

---

## 2. Preserving Compatibility

When refactoring or extending an existing module:
1. Search all callers across `internal/web/static/` (`grep` for the method/property name in both `.js` and `index.html`).
2. Keep existing public method signatures (`addNode`, `removeNode`, `selectNode`, `addFlow`, `removeFlow`, `selectFlow`, `addGlow`, `removeGlow`, `selectGlow`, `addRipple`, `removeRipple`, `selectRipple`, `injectIntoSVG`) working as thin UI/compatibility wrappers over the operational API.
3. Update the corresponding module documentation in `docs/modules/<module>.md`.
