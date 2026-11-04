# Module: `history.js` (`window.HistoryManager`)

## 1. Purpose
`internal/web/static/js/history.js` implements the snapshot-based Undo/Redo stack (`maxDepth: 50`) across all 95 tracked controls, loaded photo state, presets, diagram nodes, data flows, hotspot glows, and water ripples.

## 2. Responsibilities by Layer
- **Layer 3 (Operational Stack & Snapshot Engine):**
  - Owns `undoStack`, `redoStack`, `maxDepth`, `isRestoring`, `debounceTimer`, and `trackedControlIds` (95 DOM control IDs).
  - Captures complete studio state snapshots (`captureSnapshot()`) via `SceneState` / `ControlStateAdaptor` and operational `getState()` APIs on `NodePresets`, `DiagramNodes`, `DataFlows`, `Glows`, and `Ripples`.
  - Applies snapshots (`applySnapshot(snapStr)`) by restoring operational states (`setState()`), synchronizing DOM inputs via `ControlStateAdaptor.syncToDOM()`, and requesting a coordinated UI/render refresh.
- **Layer 1 (Undo/Redo Button & Shortcut UI):**
  - Binds `#btnUndo` and `#btnRedo` click events, `Ctrl/Cmd+Z` / `Ctrl/Cmd+Y` keyboard shortcuts, and updates button `disabled` attributes (`updateButtonsUI()`).

## 3. Public Interface (`window.HistoryManager`)
- `init()`
- `captureSnapshot()` / `applySnapshot(snapStr)`
- `recordImmediate()` / `recordDebounced(delayMs)`
- `undo()` / `redo()`
- `updateButtonsUI()`

## 4. Dependencies
- Uses `window.SceneState`, `window.ControlStateAdaptor`, `window.AppCoordinator`, `window.NodePresets`, `window.DiagramNodes`, `window.DataFlows`, `window.Glows`, and `window.Ripples`.
