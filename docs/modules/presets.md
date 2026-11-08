# Module: `presets.js` (`window.NodePresets`)

## 1. Purpose
`internal/web/static/js/presets.js` manages default node style preset parameters (`preset`), per-parameter enablement flags (`enabled`), and batch or per-node preset application/extraction.

## 2. Responsibilities by Layer
- **Layer 3 (Operational Functionality — Zero DOM Dependencies):**
  - Owns `presetKeys` (11 keys: `width`, `height`, `fillColor`, `strokeColor`, `textColor`, `fontSize`, `fillOpacity`, `strokeWidth`, `strokeStyle`, `shape`, `anim`).
  - Owns `preset` (`{ [key]: { enabled, value } }`) and `autoApplyToNewNodes`.
  - Pure operational methods: `getState()`, `setState(data)`, `resetToDefaults()`, `setPresetParam(key, value, enabled)`, `setAllEnabled(enabled)`, `applyToNodeObject(node)`, and `extractFromNodeObject(node)`.
- **Layer 1 (UI Presentation):**
  - Binds `#presetChk-*`, `#presetVal-*Slider`/`Num`, `#presetVal-*`, and `#chkAutoApplyPreset`.
  - Binds batch action buttons (`#btnSnapNodeToPreset`, `#btnCopyNodeToPreset`, `#btnPresetApplySelected`, `#btnPresetApplyAll`, `#btnPresetSetAll`, `#btnPresetUnsetAll`).
  - Synchronizes preset panel DOM rows (`syncRowUI(key)`, `syncAllRowsUI()`).

## 3. Public Interface (`window.NodePresets`)
- **Operational API:**
  - `getState()` — Returns deep-cloned `{ preset, autoApplyToNewNodes }`.
  - `setState(data)` — Restores operational preset state (accepting either `{ preset, autoApplyToNewNodes }` or a direct `preset` map).
  - `resetToDefaults()` — Resets all preset parameters back to standard defaults and resets `autoApplyToNewNodes` to `true`.
  - `setPresetParam(key, value, enabled)` — Updates a preset value and/or enabled flag without touching the DOM.
  - `setAllEnabled(enabled)` — Enables or disables all 11 preset parameters.
  - `applyToNodeObject(node)` — Applies enabled preset parameters to a node object and returns whether any field changed.
  - `extractFromNodeObject(node)` — Copies all 11 preset keys from a source node object into `preset`.
- **UI & Compatibility API:**
  - `init()`
  - `syncRowUI(key)` / `syncAllRowsUI()`
  - `applyToActiveNode()` / `applyToAllNodes()` / `copyFromActiveNode()`

## 4. Dependencies
- Uses `window.AppCoordinator` and `window.DiagramNodes` public API for applying presets to active/all nodes and recording history.
