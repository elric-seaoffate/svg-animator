# Stage 17-M2: Animation Timeline Scrubbing and Frame Stepping

**Project:** SVG Animator Studio  
**Programme:** Stage 17 — Core Animation and Rendering  
**Milestone:** Stage 17-M2 — Core Animation Timeline Controls  
**Status:** `Stage 17-M2 — IMPLEMENTED, AWAITING USER VISUAL ACCEPTANCE`

---

## 1. Overview & Architectural Design

Stage 17-M2 transforms the existing **Scene & Export Timeline** panel (`#acc-playback`) and `window.TimelinePlayer` ([`internal/web/static/js/timeline.js`](file:///root/projects/svg-animator/internal/web/static/js/timeline.js)) into a full-scene deterministic animation scrubber and single-frame stepper.

Rather than introducing a separate playback engine or mutating authored scene models, `window.TimelinePlayer` evaluates the live Studio `#svgContainer` DOM at any requested timestamp $t \in [0, D]$ (both **forwards** and **backwards**) while keeping Go/WASM (`window.EngineBridge`) as the sole authoritative owner of scene state, history, camera transforms, and optical filter parameters.

---

## 2. Implemented Controls & User Interface (`#acc-playback`)

Inside the **Scene & Export Timeline** accordion (`#acc-playback` in [`internal/web/static/index.html`](file:///root/projects/svg-animator/internal/web/static/index.html)):

1. **Transport & Single-Frame Stepping Bar:**
   - **Play / Pause / Resume (`#btnTimelinePlay`):** Starts or resumes playback from the current playhead timestamp, or pauses at the exact current frame.
   - **Previous Frame (`#btnTimelinePrevFrame`, `◀ -1f`):** Pauses playback (if active) and steps backward by exactly one frame interval ($\Delta t = 1 / \text{FPS}$) using frame-index arithmetic.
   - **Next Frame (`#btnTimelineNextFrame`, `+1f ▶`):** Pauses playback (if active) and steps forward by exactly one frame interval ($\Delta t = 1 / \text{FPS}$) using frame-index arithmetic.
   - **Stop / Reset (`#btnTimelineReset`, `⏮ Reset`):** Stops playback, returns the playhead to `00:00.000` (`Frame 0`), and restores the initial resting state of the scene.
2. **High-Resolution Playhead Scrubber (`#timelineScrubber`):**
   - `step="0.001"` continuous range slider spanning `0` to the configured **Overall Scene / Export Duration** (`#durationSlider`).
   - Dragging (`pointerdown` / `input`) automatically pauses live playback and locks out independent `requestAnimationFrame` advancement while the user scrubs forwards or backwards.
3. **Formatted Time & Frame Readout:**
   - **Time Display (`#timelineTimeDisplay`):** Formatted as `MM:SS.mmm / MM:SS.mmm` (e.g., `00:07.500 / 00:15.000`).
   - **Frame Counter (`#timelineFrameDisplay`):** Displays `Frame <current> / <total>` (e.g., `Frame 225 / 450` at `30 FPS`).
   - **Step Rate Selector (`#timelinePreviewFpsSelect`):** Configurable preview frame-stepping rate (`12 FPS`, `15 FPS`, `24 FPS`, `30 FPS` default, `60 FPS`). Excluded from `HistoryManager.trackedControlIds` so changing preview step resolution never dirties undo history.

---

## 3. Frame-Index-Based Stepping & Zero Cumulative Drift

To prevent cumulative floating-point drift during repeated single-frame steps (e.g. stepping `30` times at `30 FPS` where $1/30 = 0.0333333...$), `TimelinePlayer.stepFrame(deltaFrames)` computes integer frame indices:

$$\text{currentFrameIndex} = \text{round}(t_{\text{display}} \times \text{previewFps})$$
$$\text{nextFrameIndex} = \text{clamp}(\text{currentFrameIndex} + \Delta f,\; 0,\; \text{round}(D \times \text{previewFps}))$$
$$t_{\text{target}} = \frac{\text{nextFrameIndex}}{\text{previewFps}}$$

Stepping forward `30` frames at `30 FPS` lands on exact `Frame 30` (`t = 1.0000 s`), and stepping backward `30` frames lands on exact `Frame 0` (`t = 0.0000 s`).

---

## 4. Deterministic Forward & Backward Evaluation Across All Animation Families

Whenever `TimelinePlayer.evaluateAndApply(timeSec)` runs (during live `requestAnimationFrame` playback, scrubber dragging, `+1f` / `-1f` frame stepping, or scene redraws):

1. **Embedded Wall-Clock Script Suppression in Studio Canvas:**
   - `window.SceneState.buildFullSVG(state, { omitEmbeddedBurstScript: true })` omits the standalone `<script>` tag when rendering into the Studio's `#svgContainer` (while continuing to include it in standalone SVG/HTML exports), and `window.LiteEffects.bindBurstSchedulers` defers to `TimelinePlayer` so asynchronous `setTimeout` loops never conflict with the playhead.
2. **Camera Rig & Optical Shaders (Go/WASM Authoritative):**
   - `window.EngineBridge.evaluateSceneAtTime(evalSec)` evaluates `ken-burns`, `handheld-drift`, `perspective-tilt`, `focus-pull`, `tilt-shift`, and `motion-blur` in Go/WASM and applies the resulting transform and `feGaussianBlur` `stdDeviation` to `#svgContainer`.
3. **CSS Keyframe Animations (Web Animations API):**
   - `container.getAnimations({ subtree: true })` pauses and seeks every active CSS animation (`anim.currentTime = ms`) across `perimeter-tracer`, `pulse`, `flash`, `flow-lite`, `radar-lite`, `oscilloscope-lite`, and `text-lite` (`ticker-h`, `ticker-v`, `stacked-v`, `fade`, `flash`, `slide`).
   - `ticker-h` elements are calibrated once per DOM render using `txtEl.getComputedTextLength()` so horizontal scroll distance and duration match the rendered glyphs without mutating authored state.
4. **Declarative SVG SMIL Animations:**
   - `svg.pauseAnimations()` and `svg.setCurrentTime(sec)` seek all SMIL animations (`DiagramNodes` `pulse-border`/`float`/`fade-in`, `DataFlows` `marching` tracks and 9 `<animateMotion>` payloads with `delay`/`endDelay`, `Glows` `circle`/`square`/`custom`/`radar` rings, and `Ripples` crests).
5. **SMIL Inside `<filter>` and `<mask>`:**
   - `_evaluateFilterAndMaskSMILAtTime(container, sec)` deterministically interpolates `from`/`to`/`values`/`keyTimes`/`keySplines` (including cubic-Bézier spline solving) on `filter animate` (`text-lite` `blur-in`/`blur-out`) and `mask animate` (`<mask id="rippleMask-*">` expanding rings), restoring initial attributes when scrubbing backwards prior to `begin`.
6. **Low-Load Effects Burst-Pause & Multi-Segment Flow Delays:**
   - `_evaluateBurstCyclesAtTime(node, ms)` evaluates `[data-burst-cycles]` elements (`perimeter-tracer` burst-pause, repeating `flash`, and multi-segment `flow-lite` with `delay` + `endDelay`) as a pure function of `ms`, computing `(ms - startDelayMs) % (activeMs + pauseMs)` and seeking each segment's Web Animation with its `--sva-phase-ratio` offset. Scrubbing backwards across a pause or delay boundary immediately restores the exact earlier visibility and dash offset.
7. **Text Lite `typewriter` & `scramble` Forward and Backward Restoration:**
   - `_evaluateTextLiteAtTime(group, ms)` evaluates `targetNode.textContent` as a pure function of `ms` using `Intl.Segmenter` grapheme clusters:
     - In `typewriter` (`once`, `hold`, `delete` backwards, `delete-forward`, `typeRepeat`), scrubbing backwards from the delete phase into the hold phase causes deleted trailing or leading characters to reappear immediately; scrubbing backwards into the typing phase removes later characters in reverse order.
     - In `scramble`, scrubbing backwards from the decoded hold state into the scramble window restores the exact deterministic cipher string at that timestamp.
8. **Authored Scene Non-Mutation:**
   - Scrubbing, stepping, playing, pausing, and resetting only update live DOM presentation attributes inside `#svgContainer` and **never** mutate `DiagramNodes`, `DataFlows`, `Glows`, `Ripples`, `LiteEffects`, `ImageObjects`, `SceneState`, `EngineBridge`, or `HistoryManager`.

---

## 5. Companion UI/CSS Fix: Left Inspector & Node Panel Spacing and Scrollbar Elimination

In addition to Stage 17-M2, the left-hand object inspector panels (`Nodes` `#acc-nodes`, `Flows` `#acc-flows`, `Glows` `#acc-glows`, `Ripples` `#acc-ripples`, and `Low-Load Effects` `#acc-lite-effects`) were audited and corrected in [`internal/web/static/css/style.css`](file:///root/projects/svg-animator/internal/web/static/css/style.css) and [`internal/web/static/index.html`](file:///root/projects/svg-animator/internal/web/static/index.html):

- **Root Cause Identified:** At viewports `1280px–1439px`, `.drawer.left-drawer.expanded-inspector:not(.collapsed)` activated the 2-column split inspector grid (`7fr` master / `13fr` detail) at `min-width: 1280px`, but a later `@media (max-width: 1439px)` rule overrode `--drawer-width` back down to `340px`, compressing `.inspector-detail-column` to `184px–196px` while child `.slider-row` (`input[type="range"]` default `129px` intrinsic min-width) and `.layer-reorder-btn-row` required `234px–244px`.
- **Corrections Applied:**
  - Enforced explicit `width: 420px; min-width: 420px; max-width: 420px;` on `.drawer.left-drawer.expanded-inspector:not(.collapsed)` at `@media (min-width: 1280px)` (and `460px` at `min-width: 1600px`).
  - Added `overflow-x: hidden; overflow-y: auto; scrollbar-width: thin;` on `.drawer .panel`, `.compact-instance-list`, and `.inspector-detail-column`, and increased horizontal panel padding to `0.75rem 0.9rem` (~`16px` breathing room).
  - Set `flex: 1 1 0%; width: 100%; min-width: 36px;` on `input[type="range"]` inside inspector rows and `grid-template-columns: repeat(4, minmax(0, 1fr))` on `.layer-reorder-btn-row`.
  - Added layout-neutral `:hover` and `:focus` rules (`outline: none; box-shadow: inset 0 0 0 1px rgba(88, 166, 255, 0.35);`) so hovering or focusing controls never shifts layout dimensions or triggers horizontal scrollbars.
