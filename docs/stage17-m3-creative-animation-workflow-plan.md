# SVG Animator Studio — Stage 17-M3: Creative Animation Workflow Review and Development Plan

- **Programme:** Stage 17 — Core Animation and Presentation Improvements
- **Milestone:** Stage 17-M3 — Creative Animation Authoring, Sequencing, Timing Consistency & Timeline Coordination
- **Author:** Gemini Neon (Planning and Architecture)
- **Baseline Commit:** `409c8eb` on `main` (Stage 17-M2 + Left-Hand Inspector Panel Spacing Fix)
- **Status:** Architectural Review & Development Plan Complete — Awaiting User Scope Approval
- **Stage 16F Status:** Feature Development Complete; Extended User Evaluation Ongoing (No Widget Maker expansion authorised)
- **Camera Rig & Optical Effects Status:** Existing capabilities inventoried below; expansion reserved for a separate post-M3 programme

---

## 1. Verified Source and Git Baseline

| Verification Item | Status | Source Evidence |
| :--- | :--- | :--- |
| **Git Branch & Commit** | `main` @ `409c8eb` | Clean working tree (`git status -s` empty prior to plan generation) |
| **Stage 17-M1 Baseline** | Complete & Verified (`ccbe3be`) | 36/36 decoded pixel-difference checks across 12 animation families × WebP, APNG, MP4 (`scripts/cmd/verify-stage17-m1/main.go`) |
| **Stage 17-M2 Baseline** | Complete & Verified (`409c8eb`) | Live timeline scrubber (`#timelineScrubber`), `MM:SS.mmm / MM:SS.mmm` readout, frame counter, FPS step selector (`12/15/24/30/60`), `-1f` / `+1f` frame stepping (`internal/web/static/js/timeline.js`), 15/15 Chromium checks (`scripts/cmd/verify-stage17-m2/main.go`) |
| **Left Inspector Spacing Fix** | Visually Accepted (`409c8eb`) | Scoped CSS layout in `internal/web/static/css/style.css` across `#acc-nodes`, `#acc-flows`, `#acc-glows`, `#acc-ripples`, and `#acc-lite-effects` |
| **Go Authoritative Scene Models** | Inspected | `pkg/engine/scene/model.go`, `scene.go`, `lite_effect.go`, `preset.go`, `group.go`, `image.go`, `camera.go`, `optics.go`, `pkg/engine/timeline/timeline.go` |
| **Frontend Inspectors & Renderers** | Inspected | `internal/web/static/index.html`, `js/nodes.js`, `js/flows.js`, `js/glows.js`, `js/ripples.js`, `js/lite-effects.js`, `js/effects.js`, `js/timeline.js`, `js/presets.js`, `js/floating-inspector.js` |

---

## 2. Inventory of Existing Creative Animation Controls

A thorough source audit was conducted across all object families, inspector drawers (`#leftDrawer`), floating context editors (`#floatingContextEditor`), and the Go/WASM scene model. The table below distinguishes between **implemented and accessible controls**, **implemented but hidden/non-obvious features**, and **genuine missing capabilities**.

### 2.1 Capability Matrix Across Object Families

| Object Family | Authoritative Go Model (`pkg/engine/scene/model.go`) | Implemented & UI-Accessible Animation Controls | Implemented in Model / Renderer but Hidden or Non-Obvious in UI | Genuine Missing Capabilities for Creative Authoring |
| :--- | :--- | :--- | :--- | :--- |
| **Diagram Nodes (`DiagramNodes`)** | `Node` (`Anim`, `Play`) | • **Animation** dropdown (`#nodeAnimSelect` / `#fctx-nodeAnimSelect`): `none` (*Static*), `pulse-border` (*Pulse Border*, SMIL opacity `1→0.65→1`), `float` (*Gentle Float*, SMIL translate Y `0→-6→0`), `fade-in` (*Fade In*, SMIL opacity `0→1`, `fill="freeze"`) | • `Play` boolean (`n.play`) exists in Go `Node`, `nodes.js`, and Stage 17-M1/M2 evaluators, but is only toggleable via Widget Maker—**no `Play Animation` checkbox exists in `#nodeEditor` or `#fctx-nodeSection`**. | • **No `Start Delay (s)` (`animDelay`)**: `fade-in`, `pulse-border`, and `float` always start at `t = 0.0s`.<br>• **Hardcoded durations**: `fade-in` is hardcoded to `1.2s`, `pulse-border` to `2.6s`, `float` to `3.2s`—no user duration control.<br>• **Pre-delay visibility gap**: Even if SMIL `begin` were set on `fade-in`, base opacity is `1.0` unless held at `0` during `0 ≤ t < delay`.<br>• **Limited entrance options**: Only `fade-in`; no `scale-in` (pop) or `slide-up` entrance. |
| **Connectors & Data Flows (`DataFlows`)** | `Flow` (`LineStyle`, `Effect`, `Speed`, `Delay`, `EndDelay`, `HideOnDelay`, `Play`) | • **Track Style**: `dashed`, `solid`, `dotted`, `marching`, `double`<br>• **Travelling Payload**: `none`, `orb`, `packet`, `envelope`, `database`, `server`, `cloud`, `lock`, `warning`, `custom`<br>• **Speed (s)**: `0.1..60s` (default `2.0s`)<br>• **Start Delay**: `0..60s`<br>• **End Delay**: `0..60s`<br>• **Pause Mode**: `Hide in pause` (`hideOnDelay`) | • `Play` boolean (`f.play`) is honoured by `flows.js` and timeline scrubbing, but **missing from `#flowEditor` and `#fctx-flowSection`**.<br>• `Start Delay` and `Hide in pause` apply **only to the travelling payload** (`<g class="flow-payload-wrapper">`); the track line (`<path class="flow-track-path">`) is always visible from `t = 0s`. | • **`marching` track line ignores `Speed` and `Start Delay`**: Marching ants are hardcoded to `dur="1s"` starting at `0s`.<br>• **No `Playback Mode` (`loop` vs `once`)**: Travelling payloads always repeat indefinitely (`repeatCount="indefinite"`), whereas users often want a single packet delivery (`once`) from Node A to Node B. |
| **Hotspots & Glows (`Glows`)** | `Glow` (`Shape`, `Mode`, `Rings`, `Speed`, `Delay`, `EndDelay`, `HideOnDelay`, `Play`) | • **Shape**: `circle`, `square`, `radar` (`1..10` rings), `custom`<br>• **Playback**: `pingpong` (*Pulse In & Out*), `linear` (*Fade In*), `once` (*Play Once & Hold*), `static`<br>• **Duration**: `0.1..60s`<br>• **Start Delay**: `0..60s`<br>• **End Delay**: `0..60s`<br>• **Pause Mode**: `Hide in pause` (`hideOnDelay`) | • `Play` boolean (`g.play`) is honoured by `glows.js` and timeline scrubbing, but **missing from `#glowEditor` and `#fctx-glowSection`**.<br>• Glows have the cleanest pre-delay behaviour in the legacy family: base `opacity="0"` (and `r="0"` on radar rings) ensures the glow is genuinely hidden during `0 ≤ t < delay`. | • **No `Play Animation` checkbox in inspector**.<br>• **No 1-click way to sync `Start Delay` with the timeline playhead**. |
| **Liquid Ripples (`Ripples`)** | `Ripple` (`Speed`, `Delay`, `EndDelay`, `Rings`, `InnerRadius`, `OuterRadius`, `Refraction`, `Play`) | • **Duration**: `0.1..60s`<br>• **Start Delay**: `0..60s`<br>• **End Delay**: `0..60s`<br>• **Inner / Outer Radius**, **Rings** (`1..15`), **Thickness**, **Refraction** (`none`, `subtle`, `medium`, `strong`, `shockwave`) | • `Play` boolean (`r.play`) is honoured by `ripples.js` and timeline scrubbing, but **missing from `#rippleEditor` and `#fctx-rippleSection`**. | • **No `Playback Mode` (`loop` vs `once`)**: Ripples always loop indefinitely.<br>• **No `Play Animation` checkbox in inspector**. |
| **Low-Load Effects: `perimeter-tracer`** | `LiteEffect` (`Speed`, `PlaybackMode`, `Direction`, `BurstCount`, `BurstPause`, `PauseBehavior`, `PhaseOffset`, `Delay`, `Play`) | • **Play Animation** checkbox (`#litePlayChk`)<br>• **Motion Mode**: `loop`, `pingpong`, `once`<br>• **Direction**: `cw`, `ccw`<br>• **Speed (Dur s)**: `0.2..30s`<br>• **Burst Cycles**: `0..100`<br>• **Pause (s)**: `0..300s`<br>• **During Pause**: `hide`, `hold` | • `PhaseOffset` (`0..1`) exists in Go `LiteEffect` and `renderPerimeterTracerElement` (`data-tracer-phase`), and `Delay` (`float64`) exists on the Go `LiteEffect` struct, **but `Start Delay (s)` is not exposed in `#liteTracerGroup` or `#fctx-liteTracerGroup`**. | • **No `Start Delay (s)` (`delay`) in UI or evaluator**: A perimeter tracer cannot wait `1.2s` for its host node to fade in before starting its first circuit (`BurstPause` only pauses *after* the first burst completes!). |
| **Low-Load Effects: `pulse`, `flash`, `radar-lite`** | `LiteEffect` (`Period`, `Speed`, `Interval`, `Repeat`, `Rings`, `MinScale`, `MaxScale`, `Delay`, `Play`) | • **Play Animation** checkbox<br>• **`pulse`**: `Min/Max Scale`, `Pulse Period (s)`, `Intensity`<br>• **`flash`**: `Duration (ms)`, `Repeat`, `Interval (s)`, `Intensity`<br>• **`radar-lite`**: `Ring Mode`, `Ring Count`, `Min/Max Scale`, `Cycle Duration` | • Go `LiteEffect` struct already defines `Delay float64` (`json:"delay,omitempty"`) and `PlaybackMode string`, **but `Start Delay (s)` is hidden/unwired for `pulse`, `flash`, and `radar-lite`**. | • **No `Start Delay (s)` (`delay`)** to trigger a flash, pulse, or radar ping at a specific timestamp in an animation sequence. |
| **Low-Load Effects: `flow-lite`** | `LiteEffect` (`Speed`, `Delay`, `EndDelay`, `PlaybackMode`, `Direction`, `StartMode`, `EndMode`, `Play`) | • **Play Animation** checkbox<br>• **Motion Mode**: `loop`, `pingpong`, `once`<br>• **Direction**: `forward`, `reverse`<br>• **Start / End Mode**: `tunnel`, `abrupt`<br>• **Cycle Duration**: `0.2..30s`<br>• **Start Delay (s)**: `0..60s`<br>• **End Delay (s)**: `0..60s` | • Complete timing model (`delay`, `speed`, `endDelay`, `playbackMode`, `tunnel`/`abrupt`), fully supported in live preview, scrubbing, and export. | • Only lacks quick **Set Delay to Playhead** button and multi-object stagger coordination. |
| **Low-Load Effects: `gauge-lite` & `oscilloscope-lite`** | `LiteEffect` (`Value`, `MinValue`, `MaxValue`, `OscMode`, `Speed`, `Direction`, `PlaybackMode`, `Play`) | • **`gauge-lite`**: Data-driven indicator (`0` idle animation by design)<br>• **`oscilloscope-lite`**: `Mode` (`animated`, `static`, `sampled`), `Cycle Duration`, `Scroll Dir` (`forward`, `reverse`) | • `oscilloscope-lite` exposes `playbackMode` in the Stage 16F property catalogue. | • Sufficient for current waveform and telemetry use cases. |
| **Low-Load Effects: `text-lite`** | `LiteEffect` (`TextAnim`, `PlaybackMode`, `ScrollSpeed`, `LinesPerSec`, `TypeSpeed`, `TypeMode`, `TypeRepeat`, `Speed`, `HoldDelay`, `ClearDuration`, `LockOnOff`, `Delay`, `Play`) | • **Play Animation** checkbox<br>• **11 Animation Modes**: `none`, `ticker-h`, `ticker-v`, `stacked-v`, `typewriter`, `fade`, `flash`, `slide`, `blur-in`, `blur-out`, `scramble`<br>• **Playback**: `loop`, `once`, `pingpong`<br>• **3-Phase Timing** on `fade`/`flash`: `Fade Duration (s)`, `Visible Hold (s)`, `Clear Duration (s)`<br>• **Typewriter**: `Rate (chars/s)`, `Sequence`, `Repeat Sequence` | • Go `LiteEffect` already has `Delay float64` (`json:"delay,omitempty"`), **but `text-lite` does NOT expose `Start Delay (s)` in `#liteTextGroup` or `#fctx-liteTextGroup`, nor does `renderTextLiteElement` / `TimelinePlayer._evaluateTextLiteAtTime` / `rasterizer.go` offset `text-lite` by `le.delay`!** | • **Critical Missing Sequencing Control — No `Start Delay (s)` on `text-lite`**: Users cannot schedule a text label, callout, or typewriter caption to appear at `t = 3.5s` after preceding diagram steps finish. During `0 ≤ t < delay`, entrance/animated `text-lite` objects need to remain cleanly hidden (`opacity: 0`) before their entrance begins. |
| **Independent Images (`ImageObjects`) & Object Groups (`ObjectGroups`)** | `ImageObject` (`X`, `Y`, `Width`, `Height`, `Opacity`, `Visible`), `Group` (`Opacity`, `Visible`, `Speed`, `Play`) | • Static placement, opacity, layer ordering, non-destructive crop/snip/bake (`ImageObjects`)<br>• Group-level opacity, visibility, speed multiplier, and play state via Widget Maker (`ObjectGroups`) | • Groups already multiply member Low-Load Effect speeds (`Effective Speed = Master × Group × Member`) and propagate `group-play` in `svg-widget.js`. | • No Studio inspector controls for group or image entrance/idle animations (classified as *Useful Later* below to avoid scope bloat). |

---

## 3. Animation Sequencing Workflow Assessment

To evaluate how a creator builds a multi-step story in SVG Animator today, we traced the canonical sequencing scenario from the assignment prompt:

> **Target Scenario:** *"A diagram node appears, its border glows, a connecting flow starts, and then a text label becomes visible."*
>
> **Desired Timeline (`10.0s` scene):**
> - **Step 1 (`0.0s – 1.2s`):** Source Node (`node-1`) fades in.
> - **Step 2 (`1.2s – 2.2s`):** Source Node's border tracer (`perimeter-tracer` or `Glow`) activates.
> - **Step 3 (`2.0s – 4.0s`):** Connecting Flow (`flow-1` or `flow-lite`) travels from Source Node to Target Node (`node-2`).
> - **Step 4 (`4.0s – 5.0s`):** Target Node (`node-2`) fades in as the flow arrives.
> - **Step 5 (`4.8s – 6.5s`):** Text caption (`text-lite` with `typewriter`, `fade`, or `slide`, `Playback: once`) reveals next to Target Node.

### 3.1 Step-by-Step Authoring Friction in Current Studio (`409c8eb`)

1. **Step 1 — Source Node appears (`0.0s – 1.2s`):**
   - The user selects `node-1` and sets `Animation` to `Fade In`.
   - *Friction:* It works at `t = 0.0s`, **but its `1.2s` duration is hardcoded** (`js/nodes.js:331`). The user cannot make a snappy `0.5s` fade-in or a slow `2.5s` fade-in.
2. **Step 2 — Border glows starting at `1.2s`:**
   - If the user attaches a `Glow` hotspot (`Play Once & Hold` or `Pulse In & Out`), they can set `Start Delay = 1.2s`. Because `glows.js` sets base `opacity="0"`, the glow stays invisible from `0.0s` to `1.2s` and starts at `1.2s`.
   - *Friction:* If the user prefers a crisp Low-Load Effect (`perimeter-tracer`, `pulse`, or `flash`) on the node border instead of a blurred Gaussian `Glow`, **none of `perimeter-tracer`, `pulse`, or `flash` has a `Start Delay (s)` slider!** A `perimeter-tracer` immediately starts orbiting at `t = 0.0s` while the node is still fading in.
3. **Step 3 — Connecting flow travels (`2.0s – 4.0s`):**
   - If using `flow-lite`, the user sets `Start Delay = 2.0s`, `Cycle Duration = 2.0s`, and `Motion Mode = Play Once`. The flow stays hidden in its start tunnel until `2.0s`, crosses to the destination by `4.0s`, and finishes cleanly.
   - *Friction on legacy `DataFlows`:* If the user uses a legacy `DataFlow` (for orthogonal routing, arrowheads, or a travelling packet icon), setting `Start Delay = 2.0s` and `Speed = 2.0s` delays the **packet icon** until `2.0s`, **but**:
     - There is no `Play Once` mode on `DataFlows`—unless the user hacks `End Delay = 60s`, the packet keeps looping every `2.0s`.
     - If `Style = Marching Ants`, the track line marches continuously from `t = 0.0s` at a hardcoded `1.0s` period, ignoring both `Start Delay` and `Speed`.
4. **Step 4 — Second Diagram Node (`node-2`) appears when the flow arrives at `4.0s`:**
   - **Blocked today.** `DiagramNodes` (`#nodeEditor` / `#fctx-nodeSection`) has **no `Start Delay` property**. Setting `node-2` to `Fade In` makes `node-2` fade in at `t = 0.0s`, four seconds before the flow reaches it!
5. **Step 5 — Text label (`text-lite`) becomes visible at `4.8s`:**
   - **Blocked today.** Even though `text-lite` has 11 rich animation modes (`typewriter`, `fade`, `slide`, `blur-in`, `scramble`, etc.) and `Playback = Play Once`, **`text-lite` has no `Start Delay (s)` control**. Every `text-lite` object starts animating at `t = 0.0s`.
6. **Inspecting and Tuning the Sequence on the Timeline:**
   - With Stage 17-M2, the user can scrub the `#timelineScrubber` to `00:04.000` to see where the flow payload is.
   - *Friction:* Once the playhead is sitting at `00:04.000`, the user must mentally read `00:04.000`, open the target object's inspector, find the `Start Delay` slider, and manually type or drag `4.0`. And when an object is selected, `#acc-playback` gives no visual indication of when that object's delay ends or when its active cycle runs.

---

## 4. Entrance, Idle, and Exit Capability Assessment

| Phase | Purpose in Storytelling & Diagrams | Current Status Across Object Families | Assessment & Architectural Recommendation |
| :--- | :--- | :--- | :--- |
| **1. Pre-Start State (`0 ≤ t < Start Delay`)** | Hold an object invisible (for entrances) or at rest (for idle effects) until its scheduled cue time. | • **Works cleanly:** `Glows` (base `opacity=0`), `Ripples` (base `stroke-opacity=0`), `flow-lite` (hidden before `delay`), `DataFlows` payload (`visibility="hidden"` when `hideOnDelay=true`).<br>• **Missing:** `DiagramNodes`, `text-lite`, `perimeter-tracer`, `pulse`, `flash`, `radar-lite`. | **Critical for Stage 17-M3.** Adding `Start Delay` requires deterministic pre-delay behaviour: entrance effects (`fade-in`, `scale-in`, `slide-up`, `text-lite` with `fade`/`typewriter`/`slide`/`blur-in`/`scramble`, and tracer/pulse/flash/radar) must remain hidden or at their initial frame during `0 ≤ t < delay`, including when scrubbing backwards to `t = 0`. |
| **2. Entrance Animation (`once` after `Start Delay`)** | Introduce a node, connector, or label into the scene at a chosen timestamp and leave it visible (`fill="freeze"`). | • **`DiagramNodes`**: Has `fade-in`, but hardcoded to `t=0s, dur=1.2s`.<br>• **`text-lite`**: Has `fade`, `typewriter` (`once`/`hold`), `slide`, `blur-in`, `scramble` with `Playback: once`, but hardcoded to `t=0s` (no `Start Delay`).<br>• **`Glows` & `flow-lite`**: Support `once` + `Start Delay`. | **High-value, low-complexity fix for Stage 17-M3.** Giving `DiagramNodes` configurable `AnimDelay` (`0..60s`), `AnimDuration` (`0.2..30s`), and two additional lightweight SMIL entrance presets (`scale-in` and `slide-up`), plus giving `text-lite` `Start Delay (s)` (`0..60s`), unlocks full node + flow + text entrance choreography. |
| **3. Idle / Continuous Animation (`loop` / `pingpong` after `Start Delay`)** | Keep active elements alive (pulsing borders, orbiting tracers, flowing telemetry, radar pings, tickers). | • Supported across all families, though `DiagramNodes` (`pulse-border`, `float`) and `LiteEffects` (`perimeter-tracer`, `pulse`, `flash`, `radar-lite`, `text-lite`) lack `Start Delay`, and `DataFlows` lacks `once` vs `loop`. | **Include in Stage 17-M3.** Allowing idle effects to respect `Start Delay (s)` lets an idle effect begin *after* an object enters, and adding `Playback Mode` (`loop` / `once`) to `DataFlows` lets packets either deliver once or stream continuously. |
| **4. Exit Animation** | Fade or clear an object after a hold period. | • **`text-lite`**: Already supports 3-phase cycles (`Fade Duration` → `Visible Hold` → `Clear Duration`) and `typewriter` (`delete` / `delete-forward`), as well as `blur-out`.<br>• **`Glows` & `flow-lite`**: Support `pingpong` and `hideOnDelay`.<br>• **`DiagramNodes`**: No dedicated exit phase after an entrance. | **Keep simple in Stage 17-M3.** `text-lite`, `Glows`, and `flow-lite` already handle temporary callouts and clearing. Adding a separate multi-phase Entrance + Idle + Exit state machine to every `DiagramNode` would complicate both the UI and standalone SMIL export; defer dedicated node exit phases to *Useful Later*. |

---

## 5. Timing-Control Consistency Findings

### 5.1 Current Terminology Fragmentation

Across `#leftDrawer` and `#floatingContextEditor`, identical timing concepts currently use five different labels:

| Concept | Current Labels in Sidebar (`index.html`) | Current Labels in Floating Inspector (`js/floating-inspector.js`) | Proposed Standardised Label (Stage 17-M3) |
| :--- | :--- | :--- | :--- |
| **Animation Enabled Toggle** | `Play Animation` (only in `#liteEditorControls`) | `Play Animation` (only in `#fctx-liteSection`) | **`Play Animation`** (exposed across Nodes, Flows, Glows, Ripples, and Low-Load Effects) |
| **Active / Cycle Duration** | • Flows: `Speed (s)`<br>• Glows / Ripples: `Duration`<br>• Tracer: `Speed (Dur s)`<br>• Pulse: `Pulse Period (s)`<br>• Flow/Radar/Osc Lite: `Cycle Duration`<br>• Text Lite: `Fade Duration (s)` | • Flows: `Speed (s)`<br>• Glows / Ripples: `Duration (s)`<br>• Tracer: `Speed (s)`<br>• Pulse: `Period (s)`<br>• Flow/Radar/Osc Lite: `Cycle Duration (s)`<br>• Text Lite: `Fade Duration (s)` | **`Duration (s)`** for one-shot / general animations (Nodes, Flows, Glows, Ripples, Tracer) and **`Cycle Duration (s)`** for periodic waveforms (`pulse`, `flow-lite`, `radar-lite`, `oscilloscope-lite`), keeping `text-lite`'s context-sensitive `Fade Duration (s)` / `Fade-In Duration (s)`. |
| **Initial Cue Offset** | • Flows / Glows / Ripples: `Start Delay`<br>• Flow Lite: `Start Delay (s)` | • Flows / Glows / Ripples / Flow Lite: `Start Delay (s)` | **`Start Delay (s)`** (uniformly across Nodes, Flows, Glows, Ripples, and Low-Load Effects, paired with a compact **`⏱`** *"Set to Playhead"* button) |
| **Post-Cycle Pause** | • Flows / Glows / Ripples: `End Delay`<br>• Flow Lite: `End Delay (s)`<br>• Tracer: `Pause (s)` | • Flows / Glows / Ripples / Flow Lite: `End Delay (s)`<br>• Tracer: `Burst Pause (s)` | **`End Delay (s)`** (or **`Burst Pause (s)`** on multi-cycle Burst Tracer) |
| **Looping Behaviour** | • Scene Timeline: `Overall Scene Playback Mode`<br>• Glows: `Playback`<br>• Tracer / Flow Lite: `Motion Mode`<br>• Text Lite: `Playback` | • Glows / Text Lite: `Playback`<br>• Tracer / Flow Lite: `Motion` | **`Playback Mode`** (`Loop`, `Play Once`, `Ping-Pong`, plus family-specific options like `Glows` `Linear` / `Static`) |

> [!IMPORTANT]
> **Non-Destructive Label Alignment Rule:** Standardising user-visible `<label>` text and adding missing timing inputs must **never** rename existing DOM input IDs (`#flowSpeed`, `#glowSpeed`, `#liteSpeed`, etc.) or JSON schema keys (`speed`, `delay`, `endDelay`, `playbackMode`), because `HistoryManager.trackedControlIds`, `ProjectManager`, `.sva` files, and Stage 16F Widget parameters depend on those exact identifiers.

---

## 6. Timeline Integration Opportunities (Building on Stage 17-M2)

Stage 17-M2 added a deterministic timeline scrubber (`#timelineScrubber`), `MM:SS.mmm / MM:SS.mmm` display, frame counter, and `-1f` / `+1f` frame buttons inside `#acc-playback`. However, `#acc-playback` currently knows nothing about the **currently selected canvas object**.

Without turning `#acc-playback` into a complex video-editor multitrack timeline, two lightweight integrations will transform how users sequence animations:

### 6.1 Compact "Selected Object Timing Strip & Diagnostic Pill" in `#acc-playback`

When a user selects any animated object (`Node`, `Flow`, `Glow`, `Ripple`, or `LiteEffect`), display a slim, single-row **Object Timing Strip** directly beneath the frame controls in `#acc-playback`:

```
┌──────────────────────────────────────────────────────────────────┐
│ Target: text-lite-1 (Typewriter • Once)       [● Waiting 02.40s] │
│ ░░░░░░░░░░░████████████████████───────────────────────────────── │
│ Delay: 2.4s   Active: 2.4s–4.8s (2.4s)          Scene: 15.0s     │
└──────────────────────────────────────────────────────────────────┘
```

- **Visual Interval Bar:** A thin (`6px` tall) horizontal progress track aligned with the `0..duration` scrubber above it, colour-coded into:
  - **Pre-Start Delay segment** (`0 .. delay`, muted amber/slate hatch)
  - **Active Animation cycle** (`delay .. delay + activeDur`, accent cyan/blue bar)
  - **End Delay / Hold / Repeat tail** (`delay + activeDur .. duration`, subtle dotted repeat or hold bar)
- **Live Playhead State Diagnostic Pill:** Clearly tells the user what the selected object is doing *at the current playhead timestamp* (`TimelinePlayer.currentTime`):
  - `⏸ Stopped (Play Off)` — when `play === false`
  - `⏳ Waiting (starts at 00:02.400)` — when `currentTime < delay` (immediately explaining why an entrance object is currently hidden!)
  - `▶ Active (Cycle 1 • 45%)` — when inside the active animation window
  - `⏸ End Pause (resumes at 00:06.000)` — when inside `endDelay` / `burstPause`
  - `✔ Completed (Holding)` — when a `once` animation has finished and is holding its final state

### 6.2 One-Click "Set Start Delay to Playhead" (`⏱ At Playhead`)

Next to every `Start Delay (s)` label across `#leftDrawer` and `#floatingContextEditor` (and inside the `#acc-playback` Selected Object Timing Strip), provide a compact **`⏱ At Playhead`** action button:

1. The user drags `#timelineScrubber` (or steps with `-1f` / `+1f`) until they see Flow 1 reach Node 2 (say at `00:03.400`).
2. The user clicks Node 2 (or its `text-lite` label) and clicks **`⏱ At Playhead`**.
3. The object's `Start Delay (s)` is immediately set to `3.4s`, synced to the Go engine, recorded in `HistoryManager`, and re-evaluated at the current playhead.

---

## 7. Animation Reuse and Coordination Findings

### 7.1 Current State of Presets, Duplication, Copy/Paste, and Groups

1. **Shape Presets (`pkg/engine/scene/preset.go`, `js/presets.js`):**
   - Currently stores `shape`, `width`, `height`, `rx`, `color`, `glowColor`, `strokeWidth`, `fillOpacity`, `textColor`, and `anim` (`string`).
   - *Gap:* Once `DiagramNodes` gains `animDur` and `animDelay`, `NodePreset` in Go and JS should persist `animDur` and `animDelay` so saving a custom animated node preset preserves its timing.
2. **Duplication (`Ctrl+D`) and Copy/Paste (`Ctrl+C` / `Ctrl+V`):**
   - Verified in `pkg/engine/scene/clipboard.go` and `js/coordinator.js`: duplicating or copy-pasting any `Node`, `Flow`, `Glow`, `Ripple`, or `LiteEffect` preserves all animation and timing properties (`speed`, `delay`, `endDelay`, `playbackMode`, `textAnim`, etc.).
3. **Coordinating Multiple Objects (The Stagger / Align Gap):**
   - When a user creates 5 diagram nodes, 4 flows, or 5 `text-lite` bullet points and wants them to appear one after another (`0.0s`, `0.5s`, `1.0s`, `1.5s`, `2.0s`), they currently have to click each object individually and type `0`, `0.5`, `1.0`, `1.5`, `2.0`.
   - Adding a lightweight **Multi-Select Timing Bar** (`Match Delay`, `Set All to Playhead`, and `Stagger +Δt` in selection order) inside the existing multi-selection toolbars (`#nodeMultiSelectToolbar`, `#flowMultiSelectToolbar`, `#glowMultiSelectToolbar`, `#rippleMultiSelectToolbar`, `#liteMultiSelectToolbar`, and `#fctx-multiBar`) solves multi-object choreography while writing standard per-object `delay` / `animDelay` values to the Go engine in a single undoable history transaction.

---

## 8. Prioritised, Bounded Stage 17-M3 Proposal

### 8.1 Classification of Candidate Improvements

| Category | Candidate Improvement | Classification | Rationale |
| :--- | :--- | :--- | :--- |
| **E1** | **`Start Delay (s)` & Pre-Delay Visibility for `text-lite` and Low-Load Effects (`perimeter-tracer`, `pulse`, `flash`, `radar-lite`)** | **Essential (Stage 17-M3)** | Fixes the #1 sequencing blocker: allows text callouts, tracers, pulses, flashes, and radar pings to start at any scheduled timestamp (`0..60s`) and remain cleanly hidden/at rest prior to `Start Delay` during live playback, scrubbing, and export. |
| **E2** | **Configurable Timing (`Start Delay`, `Duration`, `Playback Mode`) & Entrance Presets (`scale-in`, `slide-up`) for `DiagramNodes` + `DataFlows` `once`/Marching Fix** | **Essential (Stage 17-M3)** | Fixes the #2 sequencing blocker: allows diagram nodes to enter (`fade-in`, `scale-in`, `slide-up`) or animate (`pulse-border`, `float`) at any scheduled `Start Delay` and `Duration`, and lets `DataFlows` payloads run `once` or `loop` while making `marching` tracks respect `Speed` and `Start Delay`. |
| **E3** | **Playhead-Assisted Timing Workflow (`#acc-playback` Selected Object Timing Strip, Live Status Pill & `⏱ At Playhead` Button)** | **Essential (Stage 17-M3)** | Connects Stage 17-M2's scrubber directly to animation authoring: users see why an object is waiting/active/holding at the current frame and can snap any object's `Start Delay` to the playhead with one click. |
| **E4** | **Inspector Timing Label Consistency, Universal `Play Animation` (`play`) Checkbox Parity & Multi-Select Stagger/Align Tool** | **Essential (Stage 17-M3)** | Harmonises timing labels across all inspectors, exposes the existing `play` boolean in Node/Flow/Glow/Ripple inspectors, extends `NodePreset` with timing fields, and adds 1-click multi-selection delay alignment & `+Δt` staggering. |
| **U1** | **Entrance / Idle Animations on Independent `ImageObjects` and Whole `ObjectGroups`** | **Useful Later** | Valuable for photo collages and composite cards, but requires new SMIL/CSS wrapper conventions on `<g class="scene-group">` and `<image>` objects; better evaluated after core object sequencing lands. |
| **U2** | **Dedicated Multi-Phase (Entrance → Idle → Exit) State Machine on Every `DiagramNode`** | **Useful Later** | Right now a node can either enter (`fade-in` / `scale-in` / `slide-up`) or run an idle effect (`pulse-border` / `float`), or combine a node entrance with an overlay `perimeter-tracer` / `Glow`. A 3-slot node animation mixer is unnecessary complexity for M3. |
| **U3** | **Custom Per-Object Cubic-Bézier Easing Curve Editor** | **Useful Later** | Standard SMIL/CSS easing presets are sufficient for diagram and telemetry workflows. |
| **O1** | **Full Multitrack Video-Editor Keyframe Timeline UI** | **Out of Scope** | Explicitly prohibited by project guardrails; would clutter the maximized canvas stage. |
| **O2** | **Node-Based Animation Scripting / Automation Graph** | **Out of Scope** | Explicitly prohibited by project guardrails. |
| **O3** | **Widget Maker / Stage 16F Expansion** | **Out of Scope** | Stage 16F is feature-frozen under extended user evaluation. |
| **O4** | **Camera Rig & Optical Effects Feature Expansion** | **Out of Scope for M3** | Inventoried in Section 10 and reserved for a separate post-M3 programme. |

---

### 8.2 Detailed Specification for Each Essential Stage 17-M3 Feature

#### Feature E1 — `Start Delay (s)` & Pre-Delay Visibility for `text-lite` and Low-Load Effects

1. **Scope & User Workflow:**
   - Expose **`Start Delay (s)`** (`delay`, range `0.0 .. 60.0s`, step `0.1s`, default `0.0s`) in both `#leftDrawer` (`#acc-lite-effects`) and `#floatingContextEditor` (`#fctx-liteSection`) for:
     - `text-lite` (whenever `textAnim !== 'none'`)
     - `perimeter-tracer`
     - `pulse`
     - `flash`
     - `radar-lite`
     - (`flow-lite` already exposes `#liteDelay` / `#fctx-liteDelay`; reuse the exact same authoritative `le.delay` property!)
   - **Pre-Delay Behaviour (`0 ≤ t < le.delay`):**
     - **`text-lite`:** When `le.delay > 0` and `textAnim !== 'none'`, the `<g data-lite-kind="text-lite" data-lite-delay="...">` element remains hidden (`opacity: 0`) during `0 ≤ t < le.delay`. At `t = le.delay`, the text animation (`typewriter`, `fade`, `slide`, `blur-in`, `scramble`, `ticker-h`, `ticker-v`, `stacked-v`, `flash`, `blur-out`) begins from frame 0 (`localTime = t - le.delay`).
     - **`perimeter-tracer`, `pulse`, `flash`, `radar-lite`:** When `le.delay > 0`, CSS animations set `animation-delay: ${le.delay}s; animation-fill-mode: both;` (and for `perimeter-tracer` / `flash` / `radar-lite`, hold opacity at `0` prior to `le.delay`; for `pulse`, hold resting scale `minScale` prior to `le.delay`).
2. **Go Engine vs Frontend Ownership:**
   - **Go Engine (`pkg/engine/scene/model.go`, `pkg/engine/scene/lite_effect.go`):** `LiteEffect.Delay` (`float64`, `json:"delay,omitempty"`) **already exists** in `pkg/engine/scene/model.go:484`! Ensure `sanitizeLiteEffect` in `pkg/engine/scene/lite_effect.go` clamps `Delay` to `[0, 60]` across all kinds (not just `flow-lite`).
   - **Frontend Renderer (`internal/web/static/js/lite-effects.js`):** Emit `data-lite-delay="${delay}"` on rendered Low-Load Effect SVG groups and apply `animation-delay: ${delay}s` (or negative offset during paused scrubbing).
3. **Timeline Scrubbing, Frame Stepping & Export Compatibility:**
   - **`TimelinePlayer` (`internal/web/static/js/timeline.js`):**
     - In `_evaluateTextLiteAtTime(g, timeSec)`: read `delay = parseFloat(g.getAttribute('data-lite-delay') || '0')`. If `delay > 0 && timeSec < delay`, set `g.style.opacity = '0'` (recorded in `_saveInlineStyle` so resuming restores cleanly) and return early. Otherwise pass `effectiveTime = Math.max(0, timeSec - delay)` into the existing `text-lite` evaluators (`typewriter`, `fade`, `flash`, `ticker-h`, `ticker-v`, `stacked-v`, `slide`, `blur-in`, `blur-out`, `scramble`).
     - In `_seekCssAnimations(svg, timeSec)`: for CSS-animated Low-Load Effects (`pulse`, `flash`, `perimeter-tracer`, `radar-lite`), incorporate `data-lite-delay` so that for `timeSec < delay`, the element holds its pre-delay resting/hidden state instead of wrapping negative modular time!
   - **Export Rasterizer (`internal/rasterizer/rasterizer.go`):**
     - Apply the exact same `delay = parseFloat(g.getAttribute('data-lite-delay') || '0')` pre-delay check (`t < delay`) and `effectiveTime = t - delay` offset in `scrubberJS` so WebP, APNG, and MP4 exports match live scrubbing frame-for-frame.
4. **Persistence (`.sva`, SQLite, Standalone SVG):**
   - Fully backward-compatible: existing projects have `delay: 0` (omitted in JSON), which evaluates identically to `409c8eb`.

---

#### Feature E2 — Configurable Timing & Entrance Presets for `DiagramNodes` + `DataFlows` Timing Parity

1. **Scope & User Workflow:**
   - **`DiagramNodes` Timing & Entrances:**
     - Expand the `Animation` dropdown (`#nodeAnimSelect` / `#fctx-nodeAnimSelect`) from 4 options to 6 options:
       - `none` — *Static (Locked)*
       - `fade-in` — *Entrance: Fade In*
       - `scale-in` — *Entrance: Pop / Scale In* (new: opacity `0→1` + scale `0.75→1.0` around node center)
       - `slide-up` — *Entrance: Slide Up & Fade* (new: opacity `0→1` + translate Y `+18→0`)
       - `pulse-border` — *Idle: Pulse Border*
       - `float` — *Idle: Gentle Float*
     - When `Animation !== 'none'`, reveal three compact timing controls in `#nodeEditor` and `#fctx-nodeSection`:
       - **`Duration (s)`** (`animDur`, range `0.2 .. 30.0s`, default `1.2s` for entrances, `2.6s` for `pulse-border`, `3.2s` for `float`)
       - **`Start Delay (s)`** (`animDelay`, range `0.0 .. 60.0s`, default `0.0s`, with **`⏱`** *Set to Playhead* button)
       - **`Playback Mode`** (`animLoop`: `once` vs `loop` — defaults to `once` for `fade-in`/`scale-in`/`slide-up` and `loop` for `pulse-border`/`float`)
     - **Clean Pre-Delay State for Node Entrances:** When a node uses `fade-in`, `scale-in`, or `slide-up` with `animDelay > 0`, the node group `<g class="diagram-node">` renders with initial `opacity="0"` and its SMIL `<animate attributeName="opacity" from="0" to="1" begin="${animDelay}s" dur="${animDur}s" fill="freeze" />`, so the node (and its text label) is completely hidden during `0 ≤ t < animDelay` and smoothly enters at `t = animDelay`!
   - **`DataFlows` Timing Parity:**
     - Add **`Playback Mode`** (`playbackMode`: `loop` *Continuous Loop* vs `once` *Single Delivery*) to `DataFlows` (`#flowEditor` and `#fctx-flowSection`). When set to `once`, the travelling payload (`orb`, `packet`, `envelope`, etc.) waits for `Start Delay`, traverses the path once over `Duration (s)`, and hides on arrival (`fill="freeze"`).
     - Fix `lineStyle === 'marching'` in `internal/web/static/js/flows.js` so the marching ants `<animate attributeName="stroke-dashoffset">` uses `dur="${f.speed || 1}s"` and `begin="${f.delay || 0}s"` instead of hardcoded `dur="1s"`.
2. **Go Engine vs Frontend Ownership:**
   - **Go Engine (`pkg/engine/scene/model.go`, `pkg/engine/scene/node.go`, `pkg/engine/scene/flow.go`, `pkg/engine/scene/preset.go`):**
     - Add optional fields to `Node` (and `NodePatch`, `NodePreset`):
       - `AnimDur float64` (`json:"animDur,omitempty"`)
       - `AnimDelay float64` (`json:"animDelay,omitempty"`)
       - `AnimLoop string` (`json:"animLoop,omitempty"`) — `"once"` or `"loop"`
     - Add optional field to `Flow` (and `FlowPatch`):
       - `PlaybackMode string` (`json:"playbackMode,omitempty"`) — `"loop"` (default) or `"once"`
   - **Frontend (`internal/web/static/js/nodes.js`, `js/flows.js`, `js/presets.js`, `js/floating-inspector.js`):**
     - Emit declarative SMIL animations using `n.animDur`, `n.animDelay`, and `n.animLoop`. Because these compile to standard SVG SMIL (`<animate>` and `<animateTransform>`), **standalone SVG exports and `svg.setCurrentTime(t)` scrubbing in `TimelinePlayer` and `rasterizer.go` automatically evaluate them forwards and backwards without custom JS evaluators!**

---

#### Feature E3 — Playhead-Assisted Timing Workflow (`#acc-playback` Timing Strip & `⏱ At Playhead`)

1. **Scope & User Workflow:**
   - **Selected Object Timing Strip in `#acc-playback` (`internal/web/static/index.html`, `js/timeline.js`):**
     - When a single animated object (`node`, `flow`, `glow`, `ripple`, or `lite`) is selected, display `#timelineSelectedObjectBar` inside `#acc-playback` immediately below the frame controls.
     - Displays:
       1. **Object Name & Mode summary** (e.g. `node-2 • Fade In (Once)` or `text-lite-1 • Typewriter (Once)`).
       2. **Live Status Diagnostic Badge** at `TimelinePlayer.currentTime` (`Waiting (starts at 00:02.400)`, `Active (62%)`, `End Pause`, `Completed (Holding)`, or `Stopped (Play Off)`).
       3. **Mini Visual Timing Bar** normalized to `0 .. sceneDuration` showing the object's `[Pre-Delay]` → `[Active Window]` → `[Pause / Loop / Hold]` intervals relative to the playhead position.
       4. **Quick **`⏱ Delay = Playhead`** button** directly on the timing strip so the user can set the selected object's `Start Delay` without even scrolling the left drawer.
   - **`⏱` ("Set to Playhead") Quick Action on Inspector `Start Delay` Fields:**
     - Add a compact icon/text button (`⏱ Playhead`, tooltip *"Set Start Delay to current Timeline playhead time"*) next to the `Start Delay (s)` label in `#nodeEditor`, `#flowEditor`, `#glowEditor`, `#rippleEditor`, `#liteEditorControls`, and `#floatingContextEditor`.
     - Clicking it sets the control value to `Number(TimelinePlayer.getCurrentTime().toFixed(2))` and dispatches the normal input/change handler (syncing to Go and recording history).

---

#### Feature E4 — Inspector Label Consistency, Universal `Play Animation` Checkbox Parity & Multi-Select Stagger/Align

1. **Scope & User Workflow:**
   - **Universal `Play Animation` (`play`) Checkbox in All Animated Inspectors:**
     - Add a **`Play Animation`** checkbox (`#nodePlayChk`, `#flowPlayChk`, `#glowPlayChk`, `#ripplePlayChk` and their `#fctx-*` floating inspector counterparts) at the top of the animation section for `DiagramNodes`, `DataFlows`, `Glows`, and `Ripples`, matching `#litePlayChk` on Low-Load Effects.
     - Wire each checkbox to the existing `play` boolean on `Node`, `Flow`, `Glow`, and `Ripple` in the Go engine.
   - **Harmonised Timing Labels:**
     - Align user-facing labels to **`Duration (s)`** / **`Cycle Duration (s)`**, **`Start Delay (s)`**, **`End Delay (s)`**, and **`Playback Mode`** across `#leftDrawer` and `#floatingContextEditor` while keeping all DOM IDs and JSON fields untouched.
   - **Multi-Select Timing Alignment & Stagger (`Match Delay` / `Stagger +Δt`):**
     - When 2 or more objects of an animated family (`Nodes`, `Flows`, `Glows`, `Ripples`, or `LiteEffects`) are selected, display a compact **Sequence Timing** row in the multi-select toolbar (`#nodeMultiSelectToolbar`, `#flowMultiSelectToolbar`, `#glowMultiSelectToolbar`, `#rippleMultiSelectToolbar`, `#liteMultiSelectToolbar`, and `#fctx-multiBar`):
       - **Base Start:** `First Selected` or `Playhead`
       - **Step ($\Delta t$):** numeric input (`0.0 .. 30.0s`, default `0.5s`)
       - **`Equalize`** button (sets all selected objects' `Start Delay` to the base start time, $\Delta t = 0$)
       - **`Stagger +Δt`** button (sets object $i$'s `Start Delay` to $\text{baseDelay} + i \times \Delta t$ in selection order, wrapped in a single undoable `HistoryManager` step).

---

## 9. Implementation-Ready Hydrogen Assignment Prompt for Stage 17-M3

The following self-contained prompt is ready to assign to **Hydrogen** once the user approves the Stage 17-M3 scope:

````markdown
# Antigravity / Hydrogen — Stage 17-M3: Creative Animation Sequencing, Timing Consistency and Playhead Coordination

**Project:** SVG Animator Studio  
**Programme:** Stage 17 — Core Animation and Presentation Improvements  
**Milestone:** Stage 17-M3 — Creative Animation Authoring & Sequencing  
**Approved Plan:** `docs/stage17-m3-creative-animation-workflow-plan.md`  
**Current Baseline:** Verify `main` HEAD (`409c8eb` or docs commit) before proceeding  
**Authorisation:** Implementation, automated & Chromium verification, deployment, and documentation  
**Approach:** One integrated development session with internal checkpoints M3-A through M3-D and one final user acceptance review

## 1. Objective

Implement the approved Stage 17-M3 Essential creative animation workflow improvements so users can author multi-step animated sequences across Diagram Nodes, Connectors/Data Flows, Glows, Ripples, Low-Load Effects, and Text Lite using clear, consistent timing controls and direct playhead coordination.

### Strict Scope Boundaries

- **Do NOT modify or expand Widget Maker / Component Builder (Stage 16F is feature-frozen).**
- **Do NOT build a multitrack video-editor keyframe timeline or node-based animation scripting system.**
- **Do NOT expand Camera Rig or Optical Effects (reserved for a separate post-M3 programme).**
- **Preserve all existing DOM control IDs and `.sva` / SQLite backward compatibility.**

## 2. Internal Checkpoints

### Checkpoint M3-A — Go Engine Models & Authoritative Timing Extensions (E1 & E2)
1. **`LiteEffect` Start Delay (`pkg/engine/scene/lite_effect.go`):**
   - Ensure `LiteEffect.Delay` (`0..60s`) is validated and preserved across all Low-Load Effect kinds (`text-lite`, `perimeter-tracer`, `pulse`, `flash`, `radar-lite`, `flow-lite`).
2. **`DiagramNodes` Timing & Entrances (`pkg/engine/scene/model.go`, `node.go`, `preset.go`):**
   - Add `AnimDur float64` (`json:"animDur,omitempty"`), `AnimDelay float64` (`json:"animDelay,omitempty"`), and `AnimLoop string` (`json:"animLoop,omitempty"`) to `Node`, `NodePatch`, and `NodePreset`.
   - Support node animation modes `none`, `fade-in`, `scale-in`, `slide-up`, `pulse-border`, and `float`.
3. **`DataFlows` Playback Mode (`pkg/engine/scene/model.go`, `flow.go`):**
   - Add `PlaybackMode string` (`json:"playbackMode,omitempty"`, `"loop"` or `"once"`) to `Flow` and `FlowPatch`.
4. Rebuild `internal/web/static/wasm/engine.wasm` and verify Go unit tests pass (`go test ./...`).

### Checkpoint M3-B — Rendering, Pre-Delay Visibility, Scrubbing & Export Parity (E1 & E2)
1. **Low-Load Effects & `text-lite` Start Delay (`internal/web/static/js/lite-effects.js`, `js/timeline.js`, `internal/rasterizer/rasterizer.go`):**
   - Emit `data-lite-delay` on rendered Low-Load Effect SVG groups.
   - For `text-lite` with `delay > 0` and `textAnim !== 'none'`, keep the element hidden (`opacity: 0`) during `0 <= t < delay` and offset active evaluation by `effectiveTime = t - delay` in live playback, `TimelinePlayer._evaluateTextLiteAtTime`, and `rasterizer.go` `scrubberJS`.
   - For `perimeter-tracer`, `pulse`, `flash`, and `radar-lite` with `delay > 0`, apply `animation-delay` and pre-delay resting/hidden state in live CSS playback, `TimelinePlayer._seekCssAnimations`, and `rasterizer.go` `scrubberJS`.
2. **`DiagramNodes` Declarative SMIL Entrances & Timing (`internal/web/static/js/nodes.js`, `js/presets.js`):**
   - Render `fade-in`, `scale-in`, `slide-up`, `pulse-border`, and `float` using `animDur` (`0.2..30s`), `animDelay` (`0..60s`), and `animLoop` (`once` vs `loop`).
   - Ensure entrance modes (`fade-in`, `scale-in`, `slide-up`) with `animDelay > 0` hold base `opacity="0"` during `0 <= t < animDelay` and freeze at full visibility after completion (`fill="freeze"`).
3. **`DataFlows` Single-Delivery Mode & Marching Track Timing (`internal/web/static/js/flows.js`):**
   - Support `playbackMode: "once"` vs `"loop"` on travelling flow payloads.
   - Make `lineStyle === 'marching'` honour `f.speed` and `f.delay`.

### Checkpoint M3-C — Inspector Controls, Playhead Coordination & Multi-Select Stagger (E1, E2, E3, E4)
1. **Inspector Controls (`internal/web/static/index.html`, `js/floating-inspector.js`, `js/app.js`):**
   - Expose `Start Delay (s)` (`0..60s`) for `text-lite`, `perimeter-tracer`, `pulse`, `flash`, and `radar-lite` in both `#leftDrawer` and `#floatingContextEditor`.
   - Expose `Duration (s)`, `Start Delay (s)`, and `Playback Mode` for `DiagramNodes` (when `Animation !== 'none'`).
   - Expose `Playback Mode` (`Loop` / `Play Once`) for `DataFlows`.
   - Add the `Play Animation` (`play`) checkbox to `#nodeEditor`, `#flowEditor`, `#glowEditor`, `#rippleEditor`, and their `#fctx-*` floating inspector sections.
   - Harmonise user-facing timing labels (`Duration (s)` / `Cycle Duration (s)`, `Start Delay (s)`, `End Delay (s)`, `Playback Mode`) without changing existing DOM IDs.
2. **Playhead Coordination (`#acc-playback` Selected Object Timing Strip & `⏱` Buttons):**
   - Add the compact **Selected Object Timing Strip** (`#timelineSelectedObjectBar`) inside `#acc-playback` showing the selected animated object's name, normalized `[Delay | Active | Hold/Loop]` visual bar, live playhead state badge (`Waiting`, `Active`, `End Pause`, `Completed`, `Stopped`), and quick `⏱ Delay = Playhead` button.
   - Add compact `⏱` (*Set Start Delay to Playhead*) buttons beside `Start Delay (s)` controls in `#leftDrawer` and `#floatingContextEditor`.
3. **Multi-Select Timing Alignment & Stagger:**
   - Add a compact **Sequence Timing** control row (`Equalize Delay` and `Stagger +Δt` in selection order) to the multi-selection toolbars (`#nodeMultiSelectToolbar`, `#flowMultiSelectToolbar`, `#glowMultiSelectToolbar`, `#rippleMultiSelectToolbar`, `#liteMultiSelectToolbar`, `#fctx-multiBar`), committing updates in a single undoable history transaction.

### Checkpoint M3-D — Verification, Representative Multi-Step Scene & Deployment
1. Run `go test ./...`, `node scripts/regression-harness.js`, `go run ./scripts/cmd/verify-stage17-m1`, and `go run ./scripts/cmd/verify-stage17-m2`.
2. Build and run a dedicated Chromium verification harness (`scripts/cmd/verify-stage17-m3/main.go`) that loads a representative multi-step sequence:
   - **Step 1 (`0.0s – 1.0s`):** Node 1 (`fade-in`, `animDelay: 0`, `animDur: 1.0`).
   - **Step 2 (`1.0s – 2.5s`):** Node 1 border `perimeter-tracer` (`delay: 1.0`, `speed: 1.5`).
   - **Step 3 (`1.5s – 3.5s`):** Connecting `DataFlow` or `flow-lite` (`delay: 1.5`, `speed: 2.0`, `playbackMode: "once"`).
   - **Step 4 (`3.5s – 4.5s`):** Node 2 (`scale-in`, `animDelay: 3.5`, `animDur: 1.0`).
   - **Step 5 (`4.5s – 6.5s`):** Text caption `text-lite` (`typewriter` or `fade`, `delay: 4.5`, `playbackMode: "once"`).
   - Verify via headless Chromium and decoded media export that at `t = 0.5s`, Node 2 and Text Lite are invisible (`opacity = 0`); at `t = 2.5s`, the flow is mid-transit while Node 2 and Text Lite remain invisible; at `t = 4.0s`, Node 2 is scaling in while Text Lite is still invisible; and at `t = 5.5s`, Node 1, Node 2, and Text Lite are visible and scrubbing backwards to `t = 0.2s` cleanly hides Node 2, the flow payload, the tracer, and Text Lite again.
3. Deploy to Kiwiberry (`http://192.168.100.40:8088/`), update BookStack documentation, commit, push, and stop for user visual acceptance.
````

---

## 10. Existing Camera Rig and Optical Effects Capability Inventory (Post-M3 Reference)

As instructed, Camera Rig and Optical Effects were audited in [`pkg/engine/scene/camera.go`](file:///root/projects/svg-animator/pkg/engine/scene/camera.go), [`pkg/engine/scene/optics.go`](file:///root/projects/svg-animator/pkg/engine/scene/optics.go), and [`internal/web/static/js/effects.js`](file:///root/projects/svg-animator/internal/web/static/js/effects.js), and are kept **strictly separate from Stage 17-M3**.

### 10.1 Current Implemented Camera Rig, Optical Effects & Presentation Frame Capabilities

| Subsystem | Authoritative Go Model (`pkg/engine/scene/model.go`) | Implemented Modes & Controls | How It Renders in SVG (`js/effects.js`) | Current Limitations (Reserved for Post-M3 Programme) |
| :--- | :--- | :--- | :--- | :--- |
| **Camera Rig (`#acc-camera`)** | `CameraConfig` (`Mode`, `Speed`, `Intensity`, `OriginX`, `OriginY`, `PanX`, `PanY`, `TiltX`, `TiltY`, `ZoomScale`) | • **`static`**: Fixed viewport<br>• **`ken-burns`**: Slow Cinema Zoom (`ZoomScale` `0.2..3.0×`, `OriginX/Y` focal crosshair, `PanX/Y` `-50..50%`, `Speed` `1..60s`)<br>• **`handheld-drift`**: Organic 5-point translational & rotational sway (`Intensity` `0.1..3.0`, `Speed` `1..60s`)<br>• **`perspective-tilt`**: 2.5D skew/scale simulation (`TiltX/Y` `-45..45°`, `ZoomScale`, `OriginX/Y`, `Speed`) | Wraps the inner stage in `<g id="camera-rig-wrapper">` with declarative SMIL `<animateTransform type="translate\|scale\|rotate\|skewX\|skewY" repeatCount="indefinite" keySplines="..." />`. | • **Always loops across a single global cycle (`dur = Speed`) with no `Start Delay`, `Hold`, or `Play Once` mode**.<br>• **Single focal origin**: Cannot move from Focal Point A (e.g. Node 1 at `t=1s`) to Focal Point B (Node 2 at `t=5s`).<br>• **`perspective-tilt` approximation**: Uses 2D SVG `skewX`/`skewY` + cosine scale rather than true homography or layered parallax. |
| **Optical Effects (`#acc-optics`)** | `OpticsConfig` (`Mode`, `Speed`, `Intensity`, `Angle`, `FocalY`, `FocalSpan`, `BlurRadius`) | • **`none`**: Sharp focus<br>• **`focus-pull`**: Rack Focus Blur (`BlurRadius` `0..50px` oscillating via SMIL `<animate attributeName="stdDeviation">` over `Speed` `1..60s`)<br>• **`tilt-shift`**: Miniature Depth of Field (sharp horizontal band at `FocalY` `0..100%`, `FocalSpan` `5..80%`, feathered SVG `<mask id="optics-dof-mask">` over blurred duplicate `<use href="#scene-content-master">`, optionally drifting by `±8%`)<br>• **`motion-blur`**: Directional Speed Blur (`Angle` `0..360°`, `BlurRadius` split into anisotropic `stdDeviation="dx dy"`) | Injects `<filter id="optics-rack-focus">`, `<filter id="optics-motion-blur">`, or dual-pass `<use href="#scene-content-master" filter="url(#optics-dof-blur)" mask="url(#optics-dof-mask)">` around `#scene-content-master`. | • **Whole-scene only**: Always applies to `#scene-content-master` as a whole; cannot selectively defocus background layers while keeping foreground callout nodes sharp.<br>• **Continuous ping-pong oscillation only**: `focus-pull` continuously blurs and unblurs (`0 → maxBlur → 0`); cannot execute a timed rack-focus transition (e.g. "pull focus from blurred to sharp between `0.0s` and `1.5s` and hold sharp").<br>• **Heavy filter cost on `tilt-shift`**: Dual-pass `<use href="#scene-content-master">` duplicates the full scene DOM inside a `200%×200%` Gaussian blur filter. |
| **Presentation Frame (`#acc-frame`)** | `FrameConfig` (`Enabled`, `Width`, `Radius`, `Color`, `Margin`, `Depth`, `Style`) | • Styles: `solid`, `double`, `neon`, `polaroid`, `cinema`<br>• Configurable border width, corner radius, margin, drop-shadow depth, and colour. | Static overlay `<g id="presentation-frame-layer">` rendered outside `#camera-rig-wrapper` so the frame remains stationary while the camera moves inside it. | • Purely static framing overlay (works well with Camera Rig today). |

### 10.2 Post-M3 Programme Recommendation: Single Programme vs Separate Milestones

**Recommendation:** Address Camera Rig and Optical Effects as **one dedicated post-M3 programme (*Stage 18 — Cinematic Camera & Optical Directing*) split into two sequential milestones (`Stage 18-M1` and `Stage 18-M2`)**:

1. **Why keep them in one coordinated programme:** Camera moves (`ken-burns`, focal pan/zoom) and optical depth-of-field (`focus-pull`, `tilt-shift`, `motion-blur`) both operate on the master scene wrapper (`#camera-rig-wrapper` and `#scene-content-master`), share the same focal coordinates (`OriginX/Y`, `FocalY`), and are used together when directing cinematic diagram walk-throughs or photo animations.
2. **Why execute them in two separate milestones:**
   - **Stage 18-M1 — Timed Camera Directing & Multi-Stop Focal Moves:** Add `Start Delay`, `Hold Duration`, and `Playback Mode` (`once`, `pingpong`, `loop`) to Camera Rig, plus support for **2-to-4 sequential Camera Stops** (Waypoints $A \to B \to C$ with configurable dwell/transit times) so a camera can zoom into Subsystem A, hold while its nodes animate, and pan across to Subsystem B.
   - **Stage 18-M2 — Timed Optical Transitions & Foreground Focus Isolation:** Add timed one-shot/delayed rack-focus transitions (e.g. blur-to-sharp entrance or blur-on-callout) and optional foreground layer exemption so high-priority overlay labels or nodes can remain razor-sharp over a blurred background without full-scene `<use>` duplication overhead.

---

## 11. BookStack Documentation Location

- **Book:** *SVG-Animator Project Log* (Book ID `353`)
- **Page:** Root Page `526` — *Stage 17 — Core Animation Export Audit, Timeline Scrubbing & Creative Workflow Plan (M1–M3)* (`https://bookstack.seaoffate.net/books/svg-animator-project-log/page/stage-17-core-animation-export-audit-timeline-scrubbing-frame-stepping-m1-m2`)
- **Repository Plan Path:** [`docs/stage17-m3-creative-animation-workflow-plan.md`](file:///root/projects/svg-animator/docs/stage17-m3-creative-animation-workflow-plan.md)

---

## 12. Known Architectural Risks and Unresolved Decisions

| # | Architectural Risk / Decision Point | Mitigation Strategy in Stage 17-M3 |
| :--- | :--- | :--- |
| **1** | **SMIL Pre-Delay Visibility Trap (`begin="2.0s"` leaves element at base opacity `1.0` from `0.0s` to `2.0s`)** | For `DiagramNodes` entrance animations (`fade-in`, `scale-in`, `slide-up`) when `animDelay > 0`, render the `<g class="diagram-node">` with base `opacity="0"` (or prepend `<set attributeName="opacity" to="0" begin="0s" end="${animDelay}s" />`) so `svg.setCurrentTime(t)` at any `0 ≤ t < animDelay` deterministically hides the node in live preview, backward scrubbing, and standalone SVG export. |
| **2** | **CSS Negative `animation-delay` Modular Wrapping During Scrubbing (`TimelinePlayer._seekCssAnimations`)** | In Stage 17-M2, `_seekCssAnimations` uses `animation-delay: -${timeSec}s` with `animation-play-state: paused`. When an effect has a positive authored `Start Delay` (`d > 0`), the net CSS delay at playhead `t` is `d - t`. When `t < d`, `d - t` is **positive**, so a paused CSS animation with `animation-fill-mode: both` (or `backwards`) naturally holds its `0%` keyframe! `_seekCssAnimations` and `rasterizer.go` must compute `netDelay = authoredDelay - timeSec` and set `animation-fill-mode: both` so pre-delay frames never wrap into the middle of a cycle. |
| **3** | **Backward Compatibility of `.sva` Projects and `HistoryManager.trackedControlIds`** | All new Go fields (`AnimDur`, `AnimDelay`, `AnimLoop` on `Node`; `PlaybackMode` on `Flow`) use `omitempty` and sensible defaults (`1.2s`/`2.6s`/`3.2s`, `delay: 0`, `loop`/`once`) when absent. All existing DOM input IDs remain unchanged; new controls (`#nodeAnimDur`, `#nodeAnimDelay`, `#nodeAnimLoop`, `#nodePlayChk`, etc.) are appended to `HistoryManager.trackedControlIds`. |
| **4** | **Clarification Decision for User Review** | Does the user want the 4 Essential clusters (**E1** `text-lite` & Low-Load Effect `Start Delay`, **E2** `DiagramNodes` timing + `scale-in`/`slide-up` entrances + `DataFlows` `once`/marching timing, **E3** `#acc-playback` Selected Object Timing Strip + `⏱ At Playhead` buttons, and **E4** universal `Play Animation` checkbox + timing label consistency + multi-select `Stagger +Δt`) implemented together as Stage 17-M3? |
