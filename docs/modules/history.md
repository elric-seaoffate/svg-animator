# Module: `history.js` (`window.HistoryManager`)

## 1. Purpose
`internal/web/static/js/history.js` implements the snapshot-based Undo/Redo stack (`maxDepth: 50`) across all 95 tracked controls, loaded photo state, presets, diagram nodes, data flows, hotspot glows, and water ripples.

## 2. Responsibilities by Layer
- **Layer 3 (Operational Stack & Snapshot Engine):**
  - Owns `undoStack`, `redoStack`, `maxDepth`, `isRestoring`, `debounceTimer`, and `trackedControlIds` (95 DOM control IDs).
  - Captures complete studio state snapshots (`captureSnapshot()`) via `SceneState` / `ControlStateAdaptor` and operational `getState()` APIs on `NodePresets`, `DiagramNodes`, `DataFlows`, `Glows`, and `Ripples`.
  - Applies snapshots (`applySnapshot(snapStr)`) by restoring operational states (`setState()`) and synchronizing DOM inputs via `ControlStateAdaptor.syncToDOM()`. Contains zero direct presentation calls.
  - Emits history stack change notifications (`notifyStackChange()`) via `AppCoordinator.emit('history:changed', ...)`.
- **Layer 1 (Undo/Redo Button & Shortcut UI):**
  - Binds `#btnUndo` and `#btnRedo` click events, `Ctrl/Cmd+Z` / `Ctrl/Cmd+Y` keyboard shortcuts.
  - Subscribes to `AppCoordinator.on('history:changed')` and `'state:restored'` to update button `disabled` attributes (`updateButtonsUI()`).

## 3. Public Interface (`window.HistoryManager`)
- **Operational API (Layer 3):**
  - `captureSnapshot()` / `applySnapshot(snapStr)`
  - `recordImmediate()` / `recordDebounced(delayMs)`
  - `notifyStackChange()`
- **UI & Coordination API (Layer 1):**
  - `init()`
  - `undo()` / `redo()`
  - `updateButtonsUI(e)`

## 4. Dependencies
- Uses `window.SceneState`, `window.ControlStateAdaptor`, `window.AppCoordinator`, `window.NodePresets`, `window.DiagramNodes`, `window.DataFlows`, `window.Glows`, and `window.Ripples`.
