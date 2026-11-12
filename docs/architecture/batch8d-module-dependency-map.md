# Batch 8D — Module Dependency and Contract Map

**Project:** SVG Animator Studio  
**Milestone:** Post-Carbon Review Remediation — Batch 8D  
**Baseline Commit:** `3ea4d5c`  
**Date:** 2026-11-12  

---

## 1. Overview

Batch 8D decomposed `internal/web/static/js/app.js` (initially 7,839 lines) into 8 dedicated presentation modules located in `internal/web/static/js/`. The core application script was reduced to 3,747 lines (a 52.2% reduction, removing 4,092 lines).

Per the architectural directives:
- **Go/WASM is the sole authoritative engine**: no business logic or state models were introduced in JavaScript.
- **Strict script dependency order**: modules are loaded sequentially via `index.html` and verified by `internal/web/server_test.go` and `scripts/verify-architecture.sh`.
- **Public `window.*` contracts preserved**: all existing signatures, methods, and DOM interactions remain 100% backward compatible.
- **ImageToolsController retained in `app.js`**: canvas raster manipulation and crop-clip orchestration remain co-located with application boot.

---

## 2. Global Script Loading Order

The authoritative loading sequence declared in `internal/web/static/index.html` consists of 25 script tags:

| Position | Script File | Architectural Layer | Primary Responsibility |
|---|---|---|---|
| 1 | `js/wasm_exec.js` | Layer 0 (Go Runtime) | Go WebAssembly browser runtime adapter |
| 2 | `js/engine-bridge.js` | Layer 2 (Engine Bridge) | WASM lifecycle, protocol dispatch & command routing |
| 3 | `js/state.js` | Layer 2 (Scene State) | Authoritative state caching & Go readback synchronization |
| 4 | `js/shape-registry.js` | Layer 3 (Shape Registry) | Parametric SVG shape catalog & SVG element builders |
| 5 | `js/shape-dropdown.js` | Layer 1 (UI Presentation) | Shape dropdown population & preset sync |
| 6 | `js/objects.js` | Layer 1 (DOM Presentation) | SVG element generation, markers & defs rendering |
| 7 | `js/stage.js` | Layer 1 (Stage Interaction) | Pan, zoom, marquee selection & stage viewport coordinate math |
| 8 | `js/export-adapter.js` | Layer 1 (Export Adapter) | XML validation, xlink injection & export serialization |
| 9 | `js/workspace.js` | Layer 1 (UI Presentation) | Drawer collapse/expand, accordions & maximized stage |
| 10 | `js/notifications.js` | Layer 1 (UI Presentation) | Studio toast notifications & status messages |
| 11 | `js/color-picker.js` | Layer 1 (UI Presentation) | Palette manager, HSV/RGB color conversion & inputs |
| 12 | `js/timeline.js` | Layer 1 (UI Presentation) | Playback transport, scrubbing & timecode display |
| 13 | `js/layers-ui.js` | Layer 1 (UI Presentation) | Layer stack list, ordering, visibility, lock toggles & image UI sync |
| 14 | `js/context-editor.js` | Layer 1 (UI Presentation) | Floating contextual properties inspector & form controls |
| 15 | `js/selection.js` | Layer 2 (Coordination) | Multi-selection bounding box, drag handles & transform overlays |
| 16 | `js/history.js` | Layer 2 (Coordination) | Undo/redo stack management & Go command dispatch |
| 17 | `js/projects.js` | Layer 2 (Coordination) | SQLite project persistence & native `.sva` packaging |
| 18 | `js/groups.js` | Layer 2 (Coordination) | Mixed-type persistent grouping, ungrouping & member bounds |
| 19 | `js/layers.js` | Layer 2 (Coordination) | Layer ordering, z-index management & object visibility queries |
| 20 | `js/alignment.js` | Layer 2 (Coordination) | Multi-object alignment & distribution calculations |
| 21 | `js/clipboard.js` | Layer 2 (Coordination) | Persistent object copying, pasting & connector remapping |
| 22 | `js/export-modal.js` | Layer 1 (UI Presentation) | Animated video/GIF/WebP export configuration modal |
| 23 | `js/still-export-modal.js` | Layer 1 (UI Presentation) | High-resolution still image & print export modal |
| 24 | `js/coordinator.js` | Layer 2 (Coordination) | Central event hub & inter-module coordination |
| 25 | `js/app.js` | Layer 1 (UI Presentation) | Studio initialization, event bindings & ImageToolsController |

---

## 3. Extracted Module Dependency and Contract Matrix

### 3.1 `shape-dropdown.js`
- **Location:** `internal/web/static/js/shape-dropdown.js` (85 lines)
- **Layer:** Layer 1 (UI Presentation)
- **Public API:**
  - `window.ensureShapeInDropdown(selectEl, shapeId)`: Ensures a specific shape ID exists as an option in a `<select>` element.
  - `window.populateShapeDropdowns()`: Populates all shape selection dropdowns (`#nodeShapeSelect`, `#floatingNodeShape`, etc.) from `window.ShapeRegistry`.
- **Inbound Dependencies:**
  - `window.ShapeRegistry`: Source of authoritative shape identifiers, names, and categories.
  - DOM elements: `select` dropdown elements.
- **Outbound Callers:**
  - `app.js`: Calls `window.populateShapeDropdowns()` during studio bootstrap.
  - `context-editor.js`: Calls `window.ensureShapeInDropdown()` when inspecting node shapes.

### 3.2 `export-adapter.js`
- **Location:** `internal/web/static/js/export-adapter.js` (59 lines)
- **Layer:** Layer 1 (Export Presentation Adapter)
- **Public API:**
  - `window.SVGExportAdapter.serialize(rawSvg)`: Validates SVG markup using `DOMParser`, ensures root `xmlns:xlink` namespace, resolves `[href]` to `xlink:href`, and serializes with XML header.
  - `window.serializeSVGForExport(rawSvg)`: Top-level adapter delegating to `SVGExportAdapter.serialize`.
- **Inbound Dependencies:**
  - Browser XML APIs: `window.DOMParser`, `window.XMLSerializer`.
- **Outbound Callers:**
  - `export-modal.js`: Serializes SVG payloads for animated exports.
  - `still-export-modal.js`: Serializes SVG snapshots for rasterization and print export.

### 3.3 `workspace.js`
- **Location:** `internal/web/static/js/workspace.js` (541 lines)
- **Layer:** Layer 1 (UI Presentation)
- **Public API:**
  - `window.WorkspaceController`: Controller object managing workspace layout.
    - `init()`: Idempotently attaches drawer toggles, icon rail interactions, and keyboard shortcuts.
    - `toggleLeftDrawer(open)`: Expands or collapses the left drawer panel.
    - `toggleRightDrawer(open)`: Expands or collapses the right drawer panel.
    - `toggleStageMaximized()`: Toggles maximized stage mode.
    - `isLeftDrawerOpen()`: Returns current left drawer visibility state.
    - `isRightDrawerOpen()`: Returns current right drawer visibility state.
    - `isStageMaximized()`: Returns current stage maximization state.
  - `window.openAccordionById(headerId)`: Expands an accordion section by its header DOM ID.
  - `window.toggleAllAccordions(expand)`: Expands or collapses all accordion sections in the studio.
- **Inbound Dependencies:**
  - DOM elements: `#leftDrawer`, `#rightDrawer`, `#leftRail`, `#rightRail`, `.accordion-header`, `.accordion-body`.
- **Outbound Callers:**
  - `app.js`: Initializes `WorkspaceController.init()` during app bootstrap.
  - Keyboard shortcuts in `app.js`: Dispatches maximize (`M`) or panel toggle commands.

### 3.4 `notifications.js`
- **Location:** `internal/web/static/js/notifications.js` (75 lines)
- **Layer:** Layer 1 (UI Presentation)
- **Public API:**
  - `window.StudioNotification.show(message, type, duration)`: Displays a styled toast notification (`info`, `success`, `warning`, `error`).
  - `window.StudioNotification.info(message, duration)`: Info helper.
  - `window.StudioNotification.success(message, duration)`: Success helper.
  - `window.StudioNotification.warning(message, duration)`: Warning helper.
  - `window.StudioNotification.error(message, duration)`: Error helper.
- **Inbound Dependencies:**
  - DOM element: `#notificationToast` or dynamically created toast container.
  - `window.AppCoordinator`: Idempotently listens to `studio:notification` events.
- **Outbound Callers:**
  - `projects.js`, `app.js`, `context-editor.js`, `clipboard.js`, `layers-ui.js`.

### 3.5 `color-picker.js`
- **Location:** `internal/web/static/js/color-picker.js` (461 lines)
- **Layer:** Layer 1 (UI Presentation)
- **Public API:**
  - `window.CustomColorPicker`: Modular color calculation and palette controller.
    - `init()`: Binds color inputs, swatch triggers, and popup palette.
    - `open(triggerElement, initialColor, onColorChange)`: Opens color popover attached to trigger.
    - `close()`: Closes the active color popover.
    - `hexToRgb(hex)`: Converts `#RRGGBB` or `#RGB` string to `{ r, g, b }`.
    - `rgbToHex(r, g, b)`: Converts RGB integers to hex string.
    - `hsvToRgb(h, s, v)`: Converts HSV floats to `{ r, g, b }`.
    - `rgbToHsv(r, g, b)`: Converts RGB integers to `{ h, s, v }`.
- **Inbound Dependencies:**
  - DOM elements: `#customColorPickerPopover`, palette swatches, slider inputs.
- **Outbound Callers:**
  - `context-editor.js`: Color selection for nodes, flows, glows, and frame borders.
  - `app.js`: Stage background color and grid color inputs.

### 3.6 `timeline.js`
- **Location:** `internal/web/static/js/timeline.js` (276 lines)
- **Layer:** Layer 1 (UI Presentation)
- **Public API:**
  - `window.TimelinePlayer`: Presentation playback transport.
    - `status`: Property returning current playback status (`'stopped'`, `'playing'`, `'paused'`).
    - `currentTime`: Current presentation timestamp in seconds.
    - `duration`: Scene duration in seconds.
    - `init()`: Binds timeline scrubber, play/pause/stop buttons, and time inputs.
    - `play()`: Initiates playback loop via `requestAnimationFrame`.
    - `pause()`: Suspends playback loop at current time.
    - `stop()`: Halts playback and resets time to `0.0`.
    - `seek(timeInSeconds)`: Evaluates scene presentation at specific time.
- **Inbound Dependencies:**
  - `window.EngineBridge`: Dispatches `Timeline.EvaluateSceneAtTime` to Go WASM engine.
  - `window.SceneState`: Receives authoritative evaluated scene state patches.
  - DOM elements: `#timelineScrubber`, `#playBtn`, `#pauseBtn`, `#stopBtn`, `#timecodeDisplay`.
- **Outbound Callers:**
  - `app.js`: Initializes `window.TimelinePlayer.init()`.

### 3.7 `layers-ui.js`
- **Location:** `internal/web/static/js/layers-ui.js` (861 lines)
- **Layer:** Layer 1 (UI Presentation)
- **Public API:**
  - `window.renderLayersList()`: Rebuilds the visual layer stack in the right drawer `#layersListContainer`.
  - `window.updateLayersToolbarState()`: Synchronizes enable/disable state of layer ordering buttons.
  - `window.initLayersToolbarEvents()`: Binds layer move up/down/top/bottom, lock, and hide buttons.
  - `window.syncInspectorLayerSections()`: Synchronizes layer selection in property inspectors.
  - `window.initInspectorLayerSectionEvents()`: Binds layer assignments from inspector dropdowns.
  - `window.syncImageEditorUI()`: Synchronizes image properties and crop status in inspector.
  - `window.initImageEditorEvents()`: Binds image crop, fit, and filter control inputs.
- **Inbound Dependencies:**
  - `window.SceneState`: Reads authoritative layer objects and order.
  - `window.EngineBridge`: Dispatches `Layer.Reorder`, `Layer.SetVisibility`, `Layer.SetLocked` to Go.
  - `window.AppCoordinator`: Listens for selection and scene mutation events.
  - DOM elements: `#layersListContainer`, `#layerMoveUpBtn`, `#layerMoveDownBtn`, `#layerLockBtn`.
- **Outbound Callers:**
  - `app.js`: Invokes UI initialization and sync hooks on state hydration.
  - `context-editor.js`: Invokes `syncInspectorLayerSections()`.

### 3.8 `context-editor.js`
- **Location:** `internal/web/static/js/context-editor.js` (1,781 lines)
- **Layer:** Layer 1 (UI Presentation)
- **Public API:**
  - `window.FloatingPropertiesEditor`: Contextual properties editor controller.
    - `init()`: Binds all property inspector inputs, tabs, and drag handles.
    - `sync(selectedObject)`: Hydrates inspector form controls from selected object data.
    - `show(objectType, screenX, screenY)`: Positions and displays floating inspector.
    - `hide()`: Closes the inspector.
    - `isVisible()`: Returns inspector display state.
- **Inbound Dependencies:**
  - `window.EngineBridge`: Dispatches authoritative update commands (`Node.Update`, `Flow.Update`, `Glow.Update`, `Ripple.Update`, `Canvas.Update`, `Camera.Update`, `Optics.Update`, `Frame.Update`).
  - `window.SceneState`: Reads authoritative properties of selected objects.
  - `window.CustomColorPicker`: Color selection bindings.
  - `window.ensureShapeInDropdown`: Populates node shape dropdowns.
  - DOM elements: `#floatingContextEditor`, `#propTabs`, property input fields.
- **Outbound Callers:**
  - `app.js`: Initializes `FloatingPropertiesEditor.init()`.
  - `coordinator.js`: Triggers `FloatingPropertiesEditor.sync()` on selection change.

---

## 4. Retained Presentation Controller in `app.js`

### `ImageToolsController` & Image Baking Pipeline
- **Retained in:** `internal/web/static/js/app.js` (Lines 1,840–2,650)
- **Rationale (Phase D Architectural Guidance):**
  - Image manipulation operations (interactive canvas crop clipping, snip masks, pointer scaling with `getEffectiveScale()`, and `executeBakeImage`) are deeply coupled with live stage canvas rendering contexts, drag gesture listeners, and base64 image decoding.
  - Retaining `ImageToolsController` in `app.js` prevents subtle regression in pixel-perfect composition verified during Batch 5.
- **Exported Contract:**
  - `window.executeBakeImage`: Explicitly attached to `window` for test harness invocation (`Scenario 68 Test 5`, `Scenario 71 Test 4 & 5`).
- **Authority Boundary:**
  - When image baking completes, the resulting baked bitmap is submitted to the Go engine via `EngineBridge.send('Image.Update', { id, href: bakedBase64, ... })`. The Go engine validates schema, dimensions, and updates authoritative scene state.

---

## 5. Script Verification Summary

The modularisation was verified through automated checks:
1. `internal/web/server_test.go` (`TestEmbeddedStaticAssetsAndScriptOrder`): Verified all 25 files exist in `internal/web/static/js/` and are embedded and served in exact sequence.
2. `scripts/verify-architecture.sh`:
   - ARCH-01..09: Confirmed Layer 1 presentation boundaries and strict delegation to `EngineBridge`.
   - ARCH-10: Confirmed exact script order matches `index.html`.
3. `scripts/verify-runtime.sh`: Confirmed all 25 scripts are syntactically valid via `node -c` and runtime dependencies are satisfied.
4. `scripts/regression-harness.js`: Added Scenario 73 verifying extracted controllers, initialization idempotency, state transitions, and XML export adapter. All 73 scenarios PASS.
