# Stage 16F — Widget/Component Builder, Multi-Action State Mappings & Low-Load Property Completeness Plan

**Status:** Stage 16F — IMPLEMENTED, AWAITING USER ACCEPTANCE (Milestones M1, M2, and M3 Complete & Verified)  
**Scope:** Widget-wide exposed properties controlling multiple independent object behaviours without requiring groups, plus complete Low-Load Effect property exposure in Group & Component Builders.
**Live Showcase on Kiwiberry:** `http://192.168.100.40:8088/component-builder-demo.html`

---

## 0. Audit of Missing & Mislabelled Low-Load Effect Parameters in Groups

Before designing the ungrouped Component Builder, we audited why **Text Box Lite (`text-lite`)** appeared to lack **Text Colour** when inside a Group, and checked all 8 Low-Load Effects (`perimeter-tracer`, `pulse`, `flash`, `flow-lite`, `radar-lite`, `gauge-lite`, `oscilloscope-lite`, `text-lite`) across [`pkg/engine/scene/widget.go`](../pkg/engine/scene/widget.go), [`pkg/engine/scene/group.go`](../pkg/engine/scene/group.go), and [`internal/web/static/js/app.js`](../internal/web/static/js/app.js).

### 0.1 Why Text Box Lite Appeared to Lack "Text Colour" in a Group

Two distinct issues in the current Group Mapping workflow caused this:

1. **Generic `"Effect Colour"` Label Instead of `"Text Colour"`:**
   - In `ObjectPropertyCatalog["lite"]` (`pkg/engine/scene/widget.go:494`) and `fallbackCatalog.lite` (`internal/web/static/js/app.js:2673`), the primary colour property (`color`) is labeled **`Effect Colour`** (`color — Effect Colour (color)`), while `bgColor` is labeled **`Track / Background Colour`** and `borderColor` is labeled **`Border Colour`**.
   - While `ResolveLiteEligibleProperty` (`widget.go:730-935`) customizes labels for `speed`, `strokeWidth` (`Border Thickness (px)`), and `startOffset` (`Arc Offset (%)`) when `kind == "text-lite"`, it never re-labels `color` to **`Text Colour`** or `bgColor` to **`Box Background Colour`**. An author looking for "Text Colour" in the dropdown sees `bgColor` and `borderColor`, but overlooks `color — Effect Colour`.
2. **First-Property Boolean Type Lock in `#groupMappingModal`:**
   - When universal `play` (`type: "boolean"`) was added at index `0` of `ObjectPropertyCatalog["lite"]`, opening `+ Add Mapping` on a group whose first member is a Low-Load Effect automatically selects `play` (`boolean`) as the default property and locks the mapping's derived type to **`boolean`**.
   - In the current Group Mapping dialog, a `boolean` mapping only allows binding to other `boolean` properties (`play`, `visibility`, `showGuide`, `repeat`) and disables `color`, `bgColor`, and `borderColor` as incompatible (`✕ color (color — requires color, incompatible with boolean)`).

### 0.2 Full Audit of All 8 Low-Load Effects (Inspector vs. Group/Widget Exposure)

| Low-Load Effect (`kind`) | Currently Exposed Properties | Missing or Mislabelled Properties to Add / Fix in M1 |
| :--- | :--- | :--- |
| **`text-lite`** (Text Box Lite) | `play`, `text`, `color`, `bgColor`, `borderColor`, `opacity`, `visibility`, `speed`, `scrollSpeed`, `typeSpeed`, `strokeWidth`, `startOffset`, `direction`, `playbackMode`, `showGuide` | **Fix labels:** `color` → **Text Colour**, `bgColor` → **Box Background Colour**.<br>**Add missing:** `bgOpacity` (Box Fill Opacity `0..1`), `fontSize` (Font Size `8..120 px`), `letterSpacing` (`-2..20 px`), `padding` (`0..60 px`), `curvature` (`-100..100`), `linesPerSec` (Vertical Scroll Speed `0.1..20 lines/s`), `lineSpacing` (`0.8..3.0×`), `holdDelay` (Visible / On Hold `0..30 s`), `clearDuration` (Clear / Off Duration `0..30 s`), `typeMode` (`once`/`hold`/`delete`/`delete-forward`), `typeRepeat` (`boolean`), `textAnim` (Text Effect mode enum). |
| **`radar-lite`** (Radar Ping Lite) | `play`, `color`, `opacity`, `visibility`, `speed`, `period`, `strokeWidth`, `scale` (`maxScale`), `showGuide` | **Fix labels:** `color` → **Ping Ring Colour**, `showGuide` → **Centre Dot Visibility**, `scale` → **Max Expansion Scale**.<br>**Add missing:** `rings` (Ring Count `1..6`), `minScale` (Inner Start Scale `0.05..2.0`). |
| **`pulse`** (Pulse Lite) | `play`, `color`, `opacity`, `visibility`, `speed`, `period`, `scale` (`maxScale`), `intensity`, `armThickness` | **Fix labels:** `scale` → **Max Pulse Scale**.<br>**Add missing:** `minScale` (Min Pulse Scale `0.2..2.0`), `strokeWidth` (Ring Stroke Width `0.5..20 px` for `ring` variant—currently excluded by `isLiteEffectPropertySupportedByKind`). |
| **`flow-lite`** (Flow Lite) | `play`, `color`, `opacity`, `visibility`, `speed`, `period`, `strokeWidth`, `dashLength`, `gapLength`, `dotSize`, `direction`, `playbackMode`, `showGuide` | **Add missing:** `delay` (Start Delay `0..60 s`), `endDelay` (End Delay `0..60 s`), `startMode` (`tunnel`/`abrupt`), `endMode` (`tunnel`/`abrupt`), `curvature` (Global Path Curvature `-100..100`). |
| **`gauge-lite`** (Gauge / Level Lite) | `play`, `color`, `bgColor`, `value`, `minValue`, `maxValue`, `opacity`, `visibility`, `strokeWidth`, `segments`, `direction`, `showGuide` | **Fix labels:** `color` → **Gauge Fill Colour**, `bgColor` → **Track Background Colour**, `showGuide` → **Show Numeric Readout**.<br>**Add missing:** `labelText` (Gauge Label Text `text`), `unit` (Unit Suffix `text`, e.g. `%`, `°C`). |
| **`oscilloscope-lite`** (Oscilloscope Lite) | `play`, `color`, `bgColor`, `opacity`, `visibility`, `speed`, `period`, `strokeWidth`, `segments`, `startOffset`, `intensity`, `direction`, `samples`, `showGuide` | **Fix labels:** `color` → **Waveform Trace Colour**, `bgColor` → **Screen Background Colour**, `showGuide` → **Show Graticule Grid**.<br>**Add missing:** `playbackMode` (`static`/`animated`/`sampled`—currently excluded by `isLiteEffectPropertySupportedByKind`). |
| **`perimeter-tracer`** (Perimeter Tracer) | `play`, `color`, `opacity`, `visibility`, `speed`, `period`, `strokeWidth`, `segments`, `lineGapRatio`, `startOffset`, `direction`, `playbackMode`, `burstCycles`, `pauseSeconds`, `pauseVisibility`, `showGuide` | **Add missing:** `segmentStyle` (Cap / Segment Style: `solid`, `rounded`, `dashed`). |
| **`flash`** (Flash Lite) | `play`, `color`, `opacity`, `visibility`, `intensity`, `armThickness`, `trigger`, `duration`, `repeat`, `repeatInterval` | Complete (all 10 inspector properties exposed). |

---

## 1. Objective & Architectural Fit

Design an integrated **Component Builder** within the existing SVG Animator **Widget Maker** that allows an author to:
1. Define widget-wide exposed properties with arbitrary user-chosen names (`MouseOver`, `Running`, `Selected`, `Alarm`, `OperatingState`, `CPU`, `Label`, etc.).
2. Drive multiple independent object properties and animation lifecycle behaviours across the canvas from a **single exposed property update** (`setParameter("MouseOver", true)`), **without requiring the target objects to be grouped**.
3. Map a single state (such as `MouseOver = true` vs `MouseOver = false`, or an enumeration choice) to heterogeneous target values and actions across different objects (for example, changing a Text Box Lite's text colour to blue, showing an indicator graphic, and starting a Perimeter Tracer animation all at once).

### Reuse of Existing Facilities (Zero Parallel Runtime)
- **Scene & Manifest Storage:** Reuse `Scene.parameters` (`[]WidgetParameter` in `pkg/engine/scene/model.go`) and `WidgetManifest` (`schemaVersion: 1`). No second parameter list or competing manifest format is introduced.
- **Target & Constraint Resolution:** Reuse `ObjectPropertyCatalog`, `ResolveLiteEligibleProperty`, and `ResolveMemberEligiblePropertyLocked` (`pkg/engine/scene/widget.go`) so every action target is validated against the actual domain bounds (`min`, `max`, `step`, `options`, colour format) of the destination property.
- **Runtime Execution:** Extend `SVGWidget.mount()`, `setParameter()`, and `setParameters()` in `internal/web/static/js/svg-widget.js` to evaluate conditional/value-mapped `targets[]` bindings atomically.
- **History & Persistence:** Because Component Builder properties are stored in `Scene.parameters`, they automatically participate in Go `History` (`maxDepth: 50`), `.sva` archives, SQLite `projects.schema_json`, and SQLite `components.definition_json`.

---

## 2. Primary Acceptance Example — `MouseOver` Button Widget

Consider a compact `200 × 50` button widget containing three **ungrouped** canvas objects:
- `lite-1`: **Text Box Lite** (`name: "btn-label"`, normal text colour `#f8fafc`, normal box background `#0f172a`)
- `node-1` (or `lite-2`): **Indicator Shape / Pulse** (`name: "btn-led"`, normal fill `#334155`)
- `lite-3`: **Perimeter Tracer** (`name: "btn-border-tracer"`, authored with `play: false`, `playbackMode: "loop"`)

The author opens **Component Builder** and creates one Boolean property:
- **Name:** `MouseOver`
- **Type:** `boolean`
- **Default:** `false`

| Condition Branch | Target Object (Ungrouped) | Target Property / Action | Value Applied |
| :--- | :--- | :--- | :--- |
| **`When MouseOver = true`** | `lite-1` (`btn-label`) | `color` (Text Colour) | `"#3b82f6"` (Blue) |
| **`When MouseOver = true`** | `lite-1` (`btn-label`) | `bgColor` (Box Background) | `"#1e3a8a"` (Deep Blue) |
| **`When MouseOver = true`** | `node-1` (`btn-led`) | `fill` (Fill Colour) | `"#38bdf8"` (Active Cyan) |
| **`When MouseOver = true`** | `lite-3` (`btn-border-tracer`) | Animation Action: `play` | `true` (Start / Restart from 0) |
| **`When MouseOver = false`** | `lite-1` (`btn-label`) | `color` (Text Colour) | `"#f8fafc"` (Normal White) |
| **`When MouseOver = false`** | `lite-1` (`btn-label`) | `bgColor` (Box Background) | `"#0f172a"` (Normal Dark) |
| **`When MouseOver = false`** | `node-1` (`btn-led`) | `fill` (Fill Colour) | `"#334155"` (Inactive Slate) |
| **`When MouseOver = false`** | `lite-3` (`btn-border-tracer`) | Animation Action: `stop_reset` | `false` (Stop & Reset to Frame 0) |

Calling `widget.setParameter("MouseOver", true)` executes all four `true` actions atomically in one call. Calling `widget.setParameter("MouseOver", false)` executes all four `false` actions atomically, restoring the exact inactive colours and stopping/resetting the animation.

---

## 3. Data Model & Exported Manifest Representation

### 3.1 Extending `WidgetTargetBinding` (`pkg/engine/scene/model.go`)

Extend `WidgetTargetBinding` with three optional, backward-compatible fields (`When`, `Action`, `Value`):

```go
// WidgetTargetBinding maps an exposed parameter (or conditional state branch) to a specific object property or animation action.
type WidgetTargetBinding struct {
	Target   string `json:"target"`             // Canonical target ID (e.g. "lite-1", "node-2", "flow-1") — no group required
	Property string `json:"property"`           // Target visual property (e.g. "color", "bgColor", "fill", "visibility", "play")
	When     string `json:"when,omitempty"`     // "" / "always" (pass-through), "true", "false", or enum option string
	Action   string `json:"action,omitempty"`   // "" / "set" (default), "play", "pause", "resume", "stop_reset", "enable", "disable"
	Value    any    `json:"value,omitempty"`    // Explicit value to apply when condition matches (nil = pass incoming parameter value)
}
```

### 3.2 Extending `WidgetParameter` for Component-Level Properties

```go
type WidgetParameter struct {
	Name         string                `json:"name"`                   // User-defined name, e.g. "MouseOver", "Alarm", "CPU"
	Label        string                `json:"label,omitempty"`        // Human-friendly display title
	Type         string                `json:"type"`                   // "boolean", "number", "text", "color", "enum", "speed"
	Default      any                   `json:"default"`                // Authored default value
	Target       string                `json:"target"`                 // "root" for ungrouped component properties (or first target ID)
	Property     string                `json:"property"`               // Canonical primary property (e.g. "play", "value", "color", "state")
	Targets      []WidgetTargetBinding `json:"targets,omitempty"`      // 1..N conditional or pass-through action bindings
	EventTrigger string                `json:"eventTrigger,omitempty"` // Optional domestic trigger: "" (none) or "hover" (mouseenter/mouseleave)
	Min          *float64              `json:"min,omitempty"`
	Max          *float64              `json:"max,omitempty"`
	Step         *float64              `json:"step,omitempty"`
	Unit         string                `json:"unit,omitempty"`
	Options      []string              `json:"options,omitempty"`
	Description  string                `json:"description,omitempty"`
}
```

### 3.3 Why This Preserves Stage 16C/16E & Digital Twin Compatibility
1. **100% Backward-Compatible JSON Schema (`schemaVersion: 1`):**
   - Existing direct parameters (`Targets: nil`) and Stage 16E group fan-out parameters (`When: ""`, `Action: ""`, `Value: nil`) work unchanged.
   - When `Value == nil` and `When == ""`, `svg-widget.js` passes the incoming parameter value directly to `tb.Target` / `tb.Property` (existing Stage 16E pass-through behaviour).
   - When `When` is specified (`"true"`, `"false"`, or an enum option value), `svg-widget.js` filters `p.Targets` to those matching `String(coercedValue)` (plus any `"always"` bindings) and applies each binding's `tb.Value` (or `tb.Action`) to `tb.Target` / `tb.Property`.
2. **Constraint Consistency Enforcement:**
   - For pass-through bindings (`Value == nil`), the parent parameter's `Type`, `Min`, `Max`, and `Options` must intersect compatibly with every pass-through target (existing Stage 16E rules).
   - For value-mapped conditional bindings (`When != ""` and `Value != nil`), the parent parameter is validated against its own type (`boolean` or `enum`), while **each individual action's `tb.Value` is validated against `tb.Target`'s eligible property definition (`ResolveMemberEligiblePropertyLocked`)**! For example, if an action targets `lite-1.fontSize`, `tb.Value` must be a finite number in `[8, 120]`; if it targets `lite-1.color`, `tb.Value` must be a valid CSS/hex colour.

---

## 4. Animation Lifecycle Actions Across All Engines

Different SVG animation mechanisms in SVG Animator have distinct runtime capabilities. The Component Builder will expose 6 clear animation actions and map them deterministically per target kind:

| Animation Action | `Property` / `Action` | CSS Low-Load Effects (`perimeter-tracer`, `pulse`, `flash`, `flow-lite`, `radar-lite`, `oscilloscope-lite`, `text-lite` CSS modes) | JS-Scheduled `text-lite` (`typewriter`, `scramble`, `stacked-v`) & Burst Timers | SMIL Effects (`node`, `flow`, `glow`, `ripple`, `text-lite` blur) |
| :--- | :--- | :--- | :--- | :--- |
| **Play (Start / Restart)** | `property: "play"`, `action: "play"`, `value: true` | Sets `data-lite-play="true"`, restores `animation-name`, forces reflow so CSS keyframes start cleanly from `0s`, sets `animation-play-state: running`. | Calls `setTextLitePlayState(el, true, false, true)`: resets `charIndex = 0` and starts grapheme reveal timer from the beginning. | Restores cached `data-sva-orig-dur` / `repeatCount`, sets `data-play-animation="true"`, calls `anim.beginElement()`. |
| **Pause (Freeze In-Place)** | `property: "play"`, `action: "pause"`, `value: false` | Keeps `animation-name` intact and sets `animation-play-state: paused` on `.lite-payload` so the animation freezes at its current visual frame. | Sets `ctrl.isPaused = true` and clears active step timeout while keeping the partially typed text on screen. | *Limitation noted below:* SMIL lacks per-element pause without pausing the whole `<svg>` time container; falls back to freezing current presentation attribute or stopping cleanly. |
| **Resume (Continue from Pause)** | `property: "play"`, `action: "resume"`, `value: true` | If paused, sets `animation-play-state: running` without resetting `animation-name` (continues smoothly from paused frame). | Clears `ctrl.isPaused = false` and schedules next step from current `ctrl.charIndex`. | Calls `beginElement()` if stopped. |
| **Stop and Reset** | `property: "play"`, `action: "stop_reset"`, `value: false` | Sets `data-lite-play="false"`, `animation-name: none`, `animation-play-state: paused`, returning element to deterministic frame 0 resting state. | Calls `setTextLitePlayState(el, false, false, false)`: halts timer and restores full static `ctrl.currentText`. | Sets `data-play-animation="false"`, caches original `dur`/`repeatCount`, sets `repeatCount="0"` / `endElement()`, restoring base static geometry. |
| **Enable (Show & Play)** | `property: "play"`, `action: "enable"`, `value: true` | Sets `visibility="visible"` (`style.visibility = "visible"`) AND executes **Play**. | Sets `visibility="visible"` AND executes **Play**. | Sets `visibility="visible"` AND executes **Play**. |
| **Disable (Stop & Hide)** | `property: "play"`, `action: "disable"`, `value: false` | Executes **Stop and Reset** AND sets `visibility="hidden"` (`style.visibility = "hidden"`). | Executes **Stop and Reset** AND sets `visibility="hidden"`. | Executes **Stop and Reset** AND sets `visibility="hidden"`. |

> **Documented SMIL Per-Element Pause Limitation:** Native SVG SMIL (`<animate>`, `<animateTransform>`, `<animateMotion>`) only supports `svgElement.pauseAnimations()` at the root `<svg>` time-container level, not per individual `<g>` element. Therefore, in the Component Builder UI, **`Pause` (freeze mid-cycle)** and **`Resume`** are offered for all CSS and JS-scheduled Low-Load Effects (and for whole-widget `root` operatingState), while SMIL targets (`node`, `flow`, `glow`, `ripple`) offer **`Play`**, **`Stop and Reset`**, **`Enable`**, and **`Disable`**. Zero continuous JS `requestAnimationFrame` loops are introduced.

---

## 5. Deterministic State Restoration & Lifecycle Rules

1. **Explicit False-State Actions (Auto-Populated for Convenience):**
   - When an author adds a `When TRUE` action in Component Builder (e.g. `lite-1.color = "#3b82f6"`), Component Builder offers a one-click **"Sync Inactive (False) State from Current Canvas Defaults"** button (enabled by default for new rows) that automatically creates the corresponding `When FALSE` action pre-filled with the object's current authored value (`lite-1.color = "#f8fafc"`, `lite-3.play = stop_reset`).
   - The author can freely edit any `When FALSE` action so returning to `false` can either restore the original authored appearance or switch to an alternate inactive palette.
2. **Initial Mount (`SVGWidget.mount()`):**
   - Before applying any manifest parameters, `mount()` snapshots each targeted element's authored attributes (`fill`, `stroke`, `color`, `bgColor`, `borderColor`, `opacity`, `visibility`, `play`, `text`, etc.) into a per-instance `authoredStateMap`.
   - `mount()` then applies every parameter's `default` value (`_initialMount: true`), executing the matching `When` branch (`"false"` when `MouseOver` defaults to `false`).
3. **Idempotent Repeated Updates (`true → true` or `false → false`):**
   - When `setParameter("MouseOver", true)` is called and `currentValues["MouseOver"]` is **already** `true` (after initial mount), `setParameters()` treats the update as a no-op unless `{ force: true }` is passed. This prevents a running loop or one-shot typewriter animation from restarting from frame 0 when the host polls or re-sends `true`.
4. **Rapid Transitions (`true ↔ false ↔ true`):**
   - All actions in a branch execute synchronously in a single DOM turn. Any pending `TextLiteController` timer or burst-pause timeout on a targeted element is cleared immediately before the new state's action runs.
5. **Viewport Visibility Suspension (`IntersectionObserver`):**
   - When a widget scrolls off-screen, `applySuspensionState()` pauses active CSS/JS/SMIL animations without altering `currentValues["MouseOver"]` or `data-lite-play`.
   - When scrolled back into view, `applySuspensionState()` only resumes elements whose current state has `data-lite-play !== "false"` and `data-play-animation !== "false"`. An animation stopped by `MouseOver = false` remains stopped across scroll suspension/resumption.
6. **Multi-Instance Isolation:**
   - Every mounted widget instance maintains its own isolated `currentValues`, `authoredStateMap`, `textLiteControllers`, and scoped DOM prefix (`<instanceId>__`). Updating `MouseOver` on Instance A never touches Instance B.

---

## 6. Component Builder User Interface Workflow

Rather than squeezing multi-action state tables into the narrow right-hand inspector drawer, we will integrate Component Builder into the **Widget Maker** drawer with a dedicated spacious modal (`#componentBuilderModal`, styled consistently with `#groupMappingModal`):

1. **Widget Maker Drawer Entry Point (`#componentBuilderSection`):**
   - Located in the right-hand **Widget Maker** drawer right below **Component Library**.
   - Displays a summary card for each Component Property (e.g. `MouseOver (boolean) — 4 True actions, 4 False actions`) with an **Interactive Preview Toggle** (e.g. a live `False / True` switch or dropdown right on the card so the author can test `MouseOver` on the live Studio canvas with one click!) and an **`Edit`** button.
   - A prominent **`+ New Component Property (Multi-Action)`** button opens `#componentBuilderModal`.
2. **Spacious `#componentBuilderModal` Layout:**
   - **Header & Metadata Bar:**
     - **Property Name:** e.g. `MouseOver` (validated against `^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$`).
     - **Display Label:** e.g. `Mouse Over State`.
     - **Property Type:** `Boolean (True / False States)`, `Choice / Enum (Multi-State)`, `Number`, `Colour`, `Text`.
     - **Default Value:** e.g. `false` (for Boolean), or default option/number/colour.
     - **Optional Domestic Hover Trigger (for Boolean):** Checkbox `"Also trigger automatically on mouse hover (mouseenter / mouseleave) in standalone preview"`.
   - **Condition State Tabs:**
     - For **Boolean**: **`🟢 When TRUE (Active State)`** tab and **`⚪ When FALSE (Inactive / Restore State)`** tab, plus a **`⇄ Auto-Fill False Actions from Canvas Defaults`** button.
     - For **Choice / Enum**: One tab per declared choice (e.g. `normal`, `warning`, `critical`).
     - For **Number / Colour / Text**: Direct pass-through or fixed value actions across multiple ungrouped targets.
   - **Action List Table (for the active tab):**
     - Each row contains:
       1. **Target Object Dropdown:** Lists **all objects on the canvas** (`Text Box Lite #1 — btn-label`, `Node #1 — btn-led`, `Perimeter Tracer #3 — btn-border`, etc.)—**no group required**.
       2. **Property / Behaviour Dropdown:** Dynamically filtered to properties supported by that specific object and LiteEffect `kind` (with corrected labels like `color — Text Colour`, `bgColor — Box Background Colour`, `play — Animation: Play / Start`, `play:stop_reset — Animation: Stop & Reset`, `play:pause — Animation: Pause`, `play:resume — Animation: Resume`).
       3. **Target Value Control:** Context-sensitive colour picker (`type="color"` + hex input), boolean toggle, enum selector, or numeric input with live min/max/step validation hint.
       4. **Row Controls:** Move Up (`↑`), Move Down (`↓`), and Remove (`✕`).
     - **`+ Add Action to This State`** button to add as many actions as needed (including multiple properties on the same object).
   - **Live Canvas Preview Bar & Validation Footer:**
     - A live **`Preview State on Canvas: [ FALSE ] [ TRUE ]`** toggle inside the modal lets the author test both states on the live stage before clicking **Save Component Property**.

---

## 7. Browser Event Integration Recommendation (`mouseenter` / `mouseleave`)

- **Distinction:** `MouseOver` is an **exposed component state property** (`setParameter("MouseOver", true/false)`), not a raw DOM event. External consumers (Digital Twin, Sentinel-PVE dashboards, host scripts) can drive `MouseOver` programmatically at any time.
- **Recommendation for First Implementation:** Include a lightweight, **opt-in** `eventTrigger: "hover"` flag on Boolean component properties (unchecked by default for Digital Twin telemetry components, checked when authoring interactive buttons like the `MouseOver` example).
  - When `eventTrigger === "hover"` is enabled on a parameter and `mount()` is called (unless disabled via `options.interactiveTriggers === false`), `svg-widget.js` binds `mouseenter` → `handle.setParameter(param.name, true)` and `mouseleave` → `handle.setParameter(param.name, false)` on the widget root `<svg>`.
  - This requires ~15 lines in `svg-widget.js`, uses zero ` <script>` tags inside the SVG (preserving 100% Digital Twin safe-SVG compliance), and makes the exported `demo.html` and Component Builder preview respond naturally to both mouse hover AND `setParameter("MouseOver", true/false)`.

---

## 8. Persistence, Dangling-Target Safety & Undo/Redo

- **Scene, `.sva`, and SQLite Persistence:** Because `WidgetTargetBinding` (`When`, `Action`, `Value`) and `WidgetParameter` (`Label`, `EventTrigger`) are serialized as standard JSON fields inside `Scene.parameters` (and `CompositeDef.Parameters`), they round-trip automatically through `.sva` files, SQLite `projects.schema_json`, SQLite `components.definition_json`, and Go `History` (`Undo` / `Redo`).
- **Object Deletion & Renaming Safety:**
  - In `pkg/engine/scene/scene.go` (`pruneParametersForTargetLocked`), deleting any scene object (`node`, `flow`, `glow`, `ripple`, `image`, `lite`, `group`) will now also strip any `WidgetTargetBinding` referencing that deleted object from `p.Targets`.
  - If a component property has all of its `p.Targets` pruned because every target object was deleted, `ValidateWidgetExport` blocks broken export with a clear diagnostic, and Component Builder highlights the property with a `⚠️ No valid targets remaining` badge so the author can re-bind or delete it.

---

## 9. Implementation Milestones (M1 → M2 → M3)

We recommend an integrated three-milestone implementation programme with internal verification checkpoints after each milestone and one consolidated user acceptance session:

### Milestone M1 — Low-Load Property Completeness & Boolean Multi-Action State Mappings
- **Scope:**
  1. Fix all missing and mislabelled Low-Load Effect properties in `ObjectPropertyCatalog["lite"]`, `ResolveLiteEligibleProperty`, `isLiteEffectPropertySupportedByKind`, `getDrawerWidgetPropDefs`, `getSupportedPropertiesForMember`, and `svg-widget.js` (including `text-lite` **Text Colour** / **Box Background Colour** / `bgOpacity` / `fontSize` / `letterSpacing` / `padding` / `curvature` / `linesPerSec` / `lineSpacing` / `holdDelay` / `clearDuration` / `typeMode` / `typeRepeat` / `textAnim`, `radar-lite` `rings` / `minScale`, `pulse` `minScale` / `strokeWidth`, `flow-lite` `delay` / `endDelay` / `startMode` / `endMode` / `curvature`, `gauge-lite` `labelText` / `unit`, `oscilloscope-lite` `playbackMode`, `perimeter-tracer` `segmentStyle`).
  2. Fix `#groupMappingModal` default property selection so opening it on a Low-Load Effect does not lock the mapping type to `boolean` unless the user picks a boolean property.
  3. Extend `WidgetTargetBinding` (`When`, `Action`, `Value`) and `WidgetParameter` (`Label`, `EventTrigger`) in Go (`pkg/engine/scene/`), protocol (`pkg/engine/protocol/`), and `svg-widget.js`.
  4. Support ungrouped Boolean component properties with separate `When: "true"` and `When: "false"` action sets targeting multiple properties across unrelated canvas objects.
- **Verification Checkpoint:** Go unit tests verifying all 8 Low-Load Effect property catalogues + multi-action Boolean state validation and SVA/SQLite round-trip.

### Milestone M2 — Animation Lifecycle Actions, Component Builder UI & Live Preview
- **Scope:**
  1. Implement `play`, `pause`, `resume`, `stop_reset`, `enable`, and `disable` animation actions in `svg-widget.js` across CSS Low-Load Effects, JS-scheduled `TextLiteController`, and SMIL objects, plus idempotent repeated-value guards and `authoredStateMap` snapshotting on mount.
  2. Build the **Component Builder** section in Widget Maker and the spacious `#componentBuilderModal` (with `When TRUE` / `When FALSE` tabs, auto-populate false actions from canvas defaults, action reordering/deletion, live canvas preview toggle, and optional `hover` trigger).
- **Verification Checkpoint:** Node regression harness scenarios verifying `MouseOver = true / false`, repeated updates, rapid transitions, pause/resume/stop_reset, and viewport suspension/resumption.

### Milestone M3 — Typed Properties (`Enum`, `Number`, `Color`, `Text`), Export Hardening & Browser Acceptance
- **Scope:**
  1. Extend Component Builder to support `Enum / Choice` (per-option action tabs), `Number`, `Color`, and `Text` component properties with target constraint validation.
  2. Harden target-deletion pruning (`pruneParametersForTargetLocked`), `ValidateWidgetExport`, and `widget-runtime-manifest.json` generation.
  3. Build and verify the primary **`MouseOver` Button Widget** acceptance demonstration in headless Chromium (`0` leftover browser processes) and deploy the verified build to Kiwiberry `:8088`.
- **Completion Criteria:** All Go tests, Node regression scenarios, and headless Chromium gates pass; `MouseOver` button widget responds identically in Studio preview and exported `SVGWidget.mount()` runtime.

---

## 10. Explicit Exclusions

To keep Component Builder focused, maintainable, and safe:
- **No general-purpose visual scripting or expression language** (no arbitrary boolean logic trees, loops, variables, or user-authored JS code blocks).
- **No continuous JavaScript `requestAnimationFrame` polling loop** for state transitions.
- **No weakening of Digital Twin `840ae5d` safe-SVG or manifest security validation.**

---

## 11. Implementation-Ready Prompt for Hydrogen

Once you review and approve this plan, you can authorise implementation with the following prompt (or simply reply **"Approved, proceed with M1–M3"**):

```markdown
Authorised to implement Stage 16F (Widget/Component Builder, Multi-Action State Mappings & Low-Load Property Completeness) across Milestones M1, M2, and M3 as specified in docs/stage16f-component-builder-plan.md:

1. M1: Fix all missing and mislabelled Low-Load Effect properties (including Text Box Lite Text Colour / Box Background Colour and all 8 Low-Load kinds) in both Group Mappings and Component Builder, prevent #groupMappingModal from auto-locking new mappings to boolean, and extend WidgetParameter / WidgetTargetBinding with When, Action, Value, Label, and EventTrigger in Go and svg-widget.js.
2. M2: Implement animation lifecycle actions (play, pause, resume, stop_reset, enable, disable), idempotent repeated-state guards, authored-state snapshotting on mount, the spacious #componentBuilderModal UI with True/False state tabs, auto-populated False restoration actions, live Studio canvas preview toggle, and optional hover (mouseenter/mouseleave) trigger.
3. M3: Support Enum/Choice, Number, Color, and Text component properties with target constraint validation, target-deletion pruning, updated widget-runtime-manifest.json, Go unit tests, Node regression harness scenarios, and headless Chromium verification of the ungrouped MouseOver button widget example (confirming 0 leftover Chromium processes), then deploy the verified build to Kiwiberry :8088.
```

---

## 12. Stage 16F Implementation Record & Sentinel-PVE (`fleet1.svg`) Compatibility Review

### 12.1 Milestones M1–M3 & Common Browser Events Playground
- **M1–M3 Implementation (`cdbf815`, `56cff44`):**
  - Exposed all **63 verified runtime properties** across all 8 Low-Load Effects (`text-lite` `color` → **Text Colour** and `bgColor` → **Box Background Colour**, plus `bgOpacity`, `fontSize`, `letterSpacing`, `padding`, `curvature`, `linesPerSec`, `lineSpacing`, `holdDelay`, `clearDuration`, `typeMode`, `typeRepeat`, `textAnim`, `rings`, `minScale`, `delay`, `endDelay`, `startMode`, `endMode`, `segmentStyle`, `labelText`, `unit`, and `oscilloscope-lite` `playbackMode`) and Image objects (`src` → **Image / Icon Source**).
  - Implemented ungrouped multi-action state mappings (`When`, `Action`, `Value`, `EventTrigger`) on `Target: "root"`, 6 animation lifecycle actions (`play`, `stop_reset`, `pause`, `resume`, `enable`, `disable`), two-phase atomic validation, idempotent repeated-value guards, target-deletion pruning, `#componentBuilderModal`, and the 6-card **Common Browser Events Playground** in `/component-builder-demo.html` and exported `demo.html`.

### 12.2 Sentinel-PVE (`fleet1.svg`) Compatibility & Raster Optimisation Review
Using the uploaded `200 × 50` button fixture [`demos/Stage-16F-Widget-Export/fleet1.svg`](../demos/Stage-16F-Widget-Export/fleet1.svg) (`1,205,248` bytes):

1. **CSS Root-ID Rewriting & Re-Isolation Fix (`svg-widget.js` & `pkg/engine/scene/widget.go`):**
   - **Root Cause:** `fleet1.svg` was exported via **Export Reusable SVG Widget**, so its root `<svg>` already had `id="sva-widget-widget-626997"` and its `<style>` selectors already started with `#sva-widget-widget-626997`. When `SVGWidget.mount()` re-isolated `fleet1.svg` for a new instance (`instA`), `idMap` treated the old root ID as a child element ID and `scopeCSSRules` prepended a second root ID, producing `#sva-widget-instA #instA__sva-widget-widget-626997 .sva-lite-radar-anim` (which matched nothing in the DOM). In addition, `\bid\s*=` matched the hyphen boundary in `data-lite-id` and `data-image-id`.
   - **Correction:** `isolateSVGString` (JS) and `IsolateSVGWidget` (Go) now match only whitespace-preceded `(\s)id\s*=`, detect any pre-existing root `<svg id="...">` and `data-sva-widget-instance`, strip the previous instance prefix when remapping child IDs and `@keyframes`, normalize `data-*-id` attributes, and strip any existing leading `#sva-widget-*` prefix in `scopeCSSRules` before applying `#${rootId}`.

2. **Animation Reliability (`perimeter-tracer` & `radar-lite`):**
   - Verified in live Chromium (`window.getComputedStyle`) that `lite-4` (`radar-lite`) cleanly resolves `animationName: "<instanceId>__sva-lite-radar"` on `MouseOver = true` and `"none"` on `MouseOver = false` (calling `node.style.removeProperty('animation-name')` when `data-orig-inline-anim` is empty so scoped CSS class rules apply without inline specificity conflicts), and `lite-3` (`perimeter-tracer`) resolves `animationName: "<instanceId>__sva-lite-trace-cw"` on `Selected = true` and `"none"` on `Selected = false`.

3. **Embedded Raster-Image Optimisation & 1× / 2× / 3× Display-Size Bake Options:**
   - **Duplicate Base64 Elimination:** `SVGExportAdapter.serialize` (`export-adapter.js`), `ImageObjects.renderImageElement` (`engine-bridge.js`), and `OptimizeSVGWidgetRasterImages` (`pkg/engine/scene/widget_raster.go`) no longer duplicate `href="data:image/..."` into `xlink:href="data:image/..."`.
   - **Non-Destructive Export-Time Raster Policy (`#widgetExportImagePolicySelect` in Export Studio & `OptimizeSVGWidgetRasterImages`):**
     - Supports `2x` (**2× Display Size (HiDPI — Default)**), `1x` (**1× Display Size**), `3x` (**3× Display Size**), and `original` (**Original Source Resolution — Deduplicated**), using premultiplied-alpha area-averaging downsampling that never upscales smaller images and preserves full PNG RGBA transparency without modifying the Studio project's source image.
     - Measured `fleet1.svg` (`572 × 572` PNG displayed at `49 × 49`) size reduction:
       - Raw uploaded `fleet1.svg`: **`1,205,248` bytes (`1.21 MB`)**
       - `original` (deduplicated `href`, full `572 × 572` px): **`610,960` bytes (`596.6 KB`, 49.3% reduction)**
       - `3x` (`147 × 147` px Ultra HiDPI): **`65,144` bytes (`63.6 KB`, 94.6% reduction)**
       - `2x` (`98 × 98` px Default HiDPI): **`39,200` bytes (`38.3 KB`, 96.7% reduction)**
       - `1x` (`49 × 49` px Exact Display Size): **`23,224` bytes (`22.7 KB`, 98.1% reduction)**
   - **Studio Image Inspector Bake / Downsample Options (`#btnDownsampleImage` & `#commitCropResolutionSelect`):**
     - Added **`📐 Bake / Downsample Resolution (1×/2×/3×)...`** to the Image Inspector and **`#commitCropResolutionSelect`** to `#commitCropModal`, enabling authors to explicitly bake an imported image in the project to `1× Display Size`, `2× Display Size`, `3× Display Size` (only enabled when source > 2× display size; never upscales), or `Original Source Resolution`.

4. **Reusable Component Content (`Label` Text & `Icon` Image Source):**
   - Added `src` (`Type: "text"`, `Label: "Image / Icon Source"`) to `ObjectPropertyCatalog["image"]`, `VerifiedRuntimeProperties()` (`widget-runtime-manifest.json` v`1.2.1`, 63 verified properties), `ValidateWidgetParameter` (guarded by `ValidateSafeImageSource` rejecting `javascript:`, `vbscript:`, `file:`, and non-image `data:` URIs), and `svg-widget.js` (`case 'src':`, preserving `data-orig-href` when `src` is empty).
   - Added 1-click **`+ Expose Label Text`** (`#btnCbModalQuickLabel`) and **`+ Expose Icon / Image`** (`#btnCbModalQuickIcon`) preset buttons in `#componentBuilderModal`.

5. **Browser Event Handling Semantics:**
   - Defined and verified `hover` (`mouseenter` → `true`, `mouseleave` → `false`, auto-selected for new `MouseOver` properties and supported by convention fallback on boolean `MouseOver` parameters unless `eventTrigger === "none"`), `press` (`pointerdown`/`mousedown` → `true`, `pointerup`/`mouseup`/`pointerleave`/`pointercancel` → `false`), `click` (`click` toggle `true`/`false`), `focus` (`focus`/`blur`), and `dblclick`, with complete listener teardown in `unmount()`.

