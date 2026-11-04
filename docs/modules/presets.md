# Module: `presets.js` (`window.NodePresets`)

## 1. Purpose
`internal/web/static/js/presets.js` manages default node style preset parameters (`presetValues`), per-parameter enablement flags (`presetEnabled`), and batch or per-node preset application/extraction.

## 2. Responsibilities by Layer
- **Layer 3 (Operational Functionality):**
  - Owns `presetKeys` (17 style/dimension/text/shadow/gradient keys: `shape`, `width`, `height`, `rx`, `fillColor`, `fillOpacity`, `gradEnable`, `gradColor`, `gradDir`, `strokeColor`, `strokeWidth`, `textColor`, `fontSize`, `fontWeight`, `shadowBlur`, `shadowColor`, `shadowOpacity`).
  - Owns `presetValues`, `presetEnabled`, and `autoApplyToNewNodes`.
  - Pure operational methods: `getState()`, `setState(data)`, `setPresetParam(key, value, enabled)`, `setAllEnabled(enabled)`, `applyToNodeObject(node)`, and `extractFromNodeObject(node)`.
- **Layer 1 (UI Presentation):**
  - Binds `#preset*` checkboxes, sliders, number inputs, color pickers, and `#chkAutoApplyPreset`.
  - Binds batch action buttons (`#btnPresetEnableAll`, `#btnPresetDisableAll`, `#btnApplyPresetSelected`, `#btnApplyPresetAll`, `#btnSaveSelectedAsPreset`).
  - Synchronizes preset panel DOM rows (`syncRowUI(key)`, `syncAllRowsUI()`).

## 3. Public Interface (`window.NodePresets`)
- **Operational API:**
  - `getState()` — Returns deep-cloned `{ presetValues, presetEnabled, autoApplyToNewNodes }`.
  - `setState(data)` — Restores operational preset state and triggers `syncAllRowsUI()`.
  - `setPresetParam(key, value, enabled)` — Updates a preset value and/or enabled flag without touching the DOM.
  - `setAllEnabled(enabled)` — Enables or disables all 17 preset parameters.
  - `applyToNodeObject(node)` — Applies enabled preset parameters to a node object and returns whether any field changed.
  - `extractFromNodeObject(node)` — Copies all 17 preset keys from a source node object into `presetValues`.
- **UI & Compatibility API:**
  - `init(triggerRenderCallback)`
  - `syncRowUI(key)` / `syncAllRowsUI()`
  - `applyPresetToNode(node)` — Compatibility alias for `applyToNodeObject(node)`.
  - `applyToSelectedNode()` / `applyToAllNodes()` / `copyFromSelectedNode()`

## 4. Dependencies
- Uses `window.AppCoordinator` (and `DiagramNodes` public API) for applying presets to active/all nodes, requesting renders, and recording history.
