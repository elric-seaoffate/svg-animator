# Independent Post-Batch 8D Review: JavaScript Modularisation

**Reviewer:** Independent adversarial review (read-only; no application code, tests, builds or binaries modified)
**Repository:** `/root/projects/svg-animator`, branch `main`
**Baseline reviewed:** `b607832963ce538b306180c0ff548347391ead55` (Batch 8D), compared against parent `3ea4d5c`
**Date:** 2026-11-12
**Evidence log:** `docs/architecture/claude-post-batch8d-evidence.log`

---

## 1. Verdict

**The code change itself preserves behaviour.** The eight new modules are a near-verbatim move of parent `app.js` lines 1–4122. The `app.js` region that was kept (parent L4123–7839 → current L28–3747) is byte-identical apart from one added export line (`window.executeBakeImage = executeBakeImage;`). I found **no P0 or P1 runtime defects** introduced by Batch 8D.

**The Batch 8D documentation deliverables are not reliable.** The regression-evidence, dependency-map, authority-verification and modularisation-report documents contain several statements that do not match the repository or the recorded test output. That includes misreported test results. The same report was published to BookStack page 449. This is the most important finding of this review.

| Severity | Confirmed findings |
|---|---|
| P0 | 0 |
| P1 | 1 (evidence integrity: documentation, not runtime) |
| P2 | 2 (documentation accuracy) |
| P3 | 4 (one pre-existing runtime inefficiency carried over unchanged, test coverage overclaim, stale guide, harness/browser load-order difference) |

Areas that need a real browser to verify are listed in §5. **There is no browser on this host** (no `chromium`, `chromium-browser` or `google-chrome`; `verify-runtime.sh` reports RUN-06 NOT VERIFIED). Everything here comes from static analysis plus the mocked Node harness. A passing mocked harness does not prove the real browser loaded all 25 scripts without error.

---

## 2. Method (kept narrow to save quota)

1. **Normalised extraction diff.** I stripped leading/trailing whitespace and blank lines from parent `app.js` L1–4122 and from the concatenated modules, then diffed them (evidence log, "Normalized diff"). The only differences are:
   - IIFE wrappers with `'use strict'`
   - new header comments
   - the `window.*` export block in layers-ui moved to the end
   - `StudioNotification`'s coordinator subscription wrapped in an idempotent `bindCoordinator()`
   - bake-modal callbacks in layers-ui changed to `typeof`-guarded calls
2. **Retained-region diff.** Parent L4123–7839 vs current `app.js` L28–3747: identical except for the `executeBakeImage` export.
3. **Free-identifier scan.** A heuristic script checked each module for calls and references to identifiers it doesn't declare. Only `executeBakeImage` turned up, and it is guarded and resolves to `window.executeBakeImage`.
4. **Strict-mode scan.** The parent `app.js` had no `'use strict'`; the moved code now runs in strict mode. A scan for implicit-global assignments, writes to read-only DOM properties, `delete`, `with` and `arguments.callee` found nothing. I sanity-tested the detector on a synthetic sample first.
5. **Targeted reads.** I read `timeline.js` in full, the Go-dispatch paths in `context-editor.js` and `layers-ui.js`, and the `ImageObjects` / `EngineBridge` image update and delete paths in `engine-bridge.js`.
6. **Existing checks.** I ran the regression harness, `go vet`, `go test`, `verify-architecture.sh` and `git diff --check`.

---

## 3. Confirmed Findings

### F1 — P1 — Batch 8D regression evidence misreports test results (confirmed)

- **File:** `docs/architecture/batch8d-regression-evidence.md` L18–19, L53–70, L76–91, L96–101. The same claims appear in the Batch 8D handover and in BookStack page 449, which mirrors `batch8d-modularisation-report.md`.
- **What it says vs. what happened:**
  - It reports `verify-architecture.sh` as "10 passed, 0 failed, 0 warnings". The actual output, recorded in `batch8d-implementation-evidence.log` L265 and reproduced in this review's evidence log, is **ARCH-05 = WARNING** (the known `StillExportStudio.bakeStaticSVGAtTime` offscreen-DOM exception).
  - It lists ARCH-01..10 check names that are not the real checks (for example "Shape Registry Centralisation" and "Workspace & Drawer System").
  - It reports `verify-runtime.sh` as "7 passed". The actual result is **RUN-06 = NOT VERIFIED** (no Chromium). RUN descriptions are also wrong: RUN-02 is CLI generation, not WASM compilation, and there is no "database migrations" check.
  - It lists Go tests that do not exist: `TestIndexPageServesExpectedAssets`, `TestProjectAPI`, `TestAssetUploadAndRetrieve`, `TestRenderEndpointValidation`. The real tests are `TestEmbeddedStaticAssetsAndScriptOrder`, `TestPhase1ArchitecturalInvariants`, `TestProjectRESTEndpoints` and `TestSVARESTEndpoints`.
- **Why it matters:** this document is the verification evidence for the batch. Saying there were no warnings and full runtime coverage hides the one standing architectural exception and the fact that headless-browser export was never runtime-verified. Later stages (Stage 16) would be planned on a false baseline.
- **Status:** confirmed by comparing against `batch8d-implementation-evidence.log` and `internal/web/server_test.go`.
- **Minimal fix:** replace §1, §3, §4 and §5 of the regression-evidence document with output copied from the implementation evidence log. Correct the BookStack page the same way.
- **Regression guard:** none in code. Process rule: evidence documents must quote captured output and not paraphrase it.

### F2 — P2 — Dependency map and modularisation report describe a script order and APIs that don't exist (confirmed)

- **Files:**
  - `docs/architecture/batch8d-module-dependency-map.md` §2 (L26–52), §3 API listings (e.g. L86–94, L131, L152, L169), §4 L201
  - `docs/architecture/batch8d-modularisation-report.md` §2.2 line counts and the §3 script block (L60–103), published as BookStack page 449
- **Errors found:**
  - The documented 25-script order includes files that are not in the repository: `state.js`, `objects.js`, `selection.js`, `groups.js`, `layers.js`, `alignment.js`, `clipboard.js`. It also leaves out real ones: `effects.js`, `scene-state.js`, `presets.js`, `nodes.js`, `flows.js`, `glows.js`, `ripples.js`. It puts `coordinator.js` at position 24.
  - **Actual order** (`index.html` L2931–2955): wasm_exec, engine-bridge, effects, scene-state, **coordinator (5)**, stage, shape-registry, presets, nodes, flows, glows, ripples, history, projects, shape-dropdown, export-adapter, workspace, notifications, color-picker, timeline, layers-ui, context-editor, **app (23)**, still-export-modal, export-modal.
  - Documented APIs and DOM IDs that don't exist:
    - `WorkspaceController.isLeftDrawerOpen()` and `toggleStageMaximized()`
    - `FloatingPropertiesEditor.sync(selectedObject)` and `isVisible()`
    - `StudioNotification.success/warning/info/error` (only `show()` and `bindCoordinator()` exist)
    - `#playBtn`, `#pauseBtn`, `#stopBtn`, `#timecodeDisplay` (real: `#btnTimelinePlay`, `#btnTimelineReset`, `#timelineTimeDisplay`)
    - `#customColorPickerPopover` (real: `#customColorPickerModal`)
    - `#notificationToast`
  - `ImageToolsController` is said to be at `app.js` L1,840–2,650. It is actually at L519–2584.
  - The bake commit is documented as `Image.Update`. It actually goes through `EngineBridge.bakeImage` (app.js L246–247).
  - Module line counts are understated. Actual: shape-dropdown 97, notifications 94, color-picker 478, timeline 291, layers-ui 884, workspace 547. "Total extracted 4,139" is wrong.
- **Why it matters:** anyone using the map to reason about load-time dependencies would conclude that `coordinator.js` loads after the presentation controllers. In fact it loads before them, which is why `notifications.js` can subscribe at evaluation time.
- **Status:** confirmed (`ls`, `grep`, `index.html`; see evidence log).
- **Minimal fix:** regenerate §2 of both documents from `index.html`, correct the API lists against the source, and re-publish BookStack 449.

### F3 — P2 — The authority-boundary "verification" cites protocol commands, files and behaviour that don't exist (confirmed)

- **File:** `docs/architecture/batch8d-authority-boundary-verification.md` §3 table (L30–48) and §4 (L55–66).
- **Errors found:**
  - Commands with zero references in `pkg/`, `cmd/` or the JS: `Layer.Reorder`, `Selection.Move`, `Group.Dissolve`, `SVA.Encode`, `SVA.Decode`. Real reorder commands are `Layer.BringToFront`, `Layer.BringForward`, `Layer.SendBackward` and `Layer.SendToBack`. `.sva` packing does not use protocol commands with those names.
  - Go files that don't exist: `scene/nodes.go`, `scene/canvas.go`, `scene/layers.go`, `scene/flows.go`, etc. Real files: `scene/layer.go`, `scene/flow.go`, `scene/scene.go`, …
  - It says the Canvas, Camera, Optics and Frame inspectors live in `context-editor.js`. That file has **zero** references to those commands. They are dispatched from `engine-bridge.js` L774/806/838/854 and driven by settings controls in `app.js`.
  - §4.2 says inputs "await confirmation before notifying presentation layers". This is not true for several handlers (see F4): `requestRender()` and `recordHistory*()` run whatever the command returned.
- **Why it matters:** the document reads as an audit but was not derived from code. The underlying conclusion, that the extracted modules hold no shadow state, is supported by this review (§4). The document's evidence for it is not.
- **Status:** confirmed.
- **Minimal fix:** rewrite the trace table from real call sites, or mark the document superseded by this review.

### F4 — P3 — Image inspector edits send Image.Update twice; image delete sends Image.Delete twice (confirmed; pre-existing, moved unchanged)

- **Files and lines:**
  - `context-editor.js` L1346–1349, L1385–1387, L1413–1415, L1427–1429
  - `layers-ui.js` L638–639, L681–682, L718–719, L731–732, L758–759
- **Production call path:** an image inspector input event calls `window.ImageObjects.updateImage(id, patch)`, which dispatches `Image.Update` (engine-bridge.js L3469–3487). The handler then calls `window.EngineBridge.updateImage(id, patch)`, which dispatches `Image.Update` again (L1468–1481), and then calls `AppCoordinator.requestRender()` / `recordHistoryDebounced()` without checking the result. For delete, `ImageObjects.deleteImage` succeeds and the follow-up `EngineBridge.deleteImage` always fails with "not found", logging `[EngineBridge] Command failed (Image.Delete)` (engine-bridge.js L188).
- **Why it's a defect:**
  - Redundant WASM round-trips on every slider input.
  - A guaranteed spurious console error on every image delete.
  - Edits rejected by Go still trigger render and history. The render rebuilds from Go state, so the canvas stays correct and **this is not a false-success mutation of the scene**. However, the inspector field keeps showing the rejected value, and an unchanged snapshot is recorded.
  - Because history is recorded explicitly via `History.Record`, the double dispatch does **not** create extra undo entries.
- **Status:** confirmed statically. The inspector-desync symptom needs browser verification. This is **not a Batch 8D regression**: the code is identical in `3ea4d5c`.
- **Minimal fix:** call only `ImageObjects.updateImage` / `deleteImage` and gate render, history and overlay updates on a non-null or true return. On failure, re-sync the inspector from `ImageObjects.getImage(id)`.
- **Regression test:** with a mocked `EngineBridge.dispatch`, assert exactly one `Image.Update` per inspector input and one `Image.Delete` per delete. Assert that no history record is made when the dispatch is rejected.

### F5 — P3 — The idempotency claim for CustomColorPicker and FloatingPropertiesEditor isn't tested, and CustomColorPicker.init is not idempotent (confirmed)

- **Files:**
  - `color-picker.js` L33: `init()` has no `_initialized` guard and calls `addEventListener` unconditionally at L47–51, L67–103
  - `scripts/regression-harness.js` L9009–9018: Scenario 73 Test 2 only exercises `WorkspaceController` and `TimelinePlayer`
- **Claims affected:** `batch8d-authority-boundary-verification.md` §4.4 and `batch8d-regression-evidence.md` §2 item 2 say all four controllers are verified idempotent.
- **Runtime impact:** none today. Production calls `CustomColorPicker.init()` once (`app.js` L3727). `FloatingPropertiesEditor.init()` does have a guard (context-editor.js L27).
- **Minimal fix:** correct the documents. Optionally add a `_initialized` guard to `CustomColorPicker.init()` in a future fix batch.
- **Regression test:** call `CustomColorPicker.init()` twice against a counting `addEventListener` stub and assert listeners are bound once.

### F6 — P3 — AI_GUIDE.md script-load-order section is stale (confirmed)

- **File:** `AI_GUIDE.md` §3 still lists 17 scripts and says shape dropdown population and accordion bindings live in `app.js`.
- **Why it matters:** `AGENTS.md` puts `AI_GUIDE.md` third in the instruction hierarchy as the implemented-architecture map.
- **Minimal fix:** add the eight modules at positions 15–22 and update the `app.js` description.

### F7 — P3 — Harness load order differs from the browser (confirmed; pre-existing)

- **File:** `scripts/regression-harness.js` L78–80 and L133–152.
- **What differs:** the harness loads `effects.js`, `scene-state.js` and `coordinator.js` **before** `wasm_exec.js` and `engine-bridge.js`. The browser loads `engine-bridge.js` first. The eight Batch 8D modules and `app.js` are loaded in the same relative order as the browser (L807–817, L1375–1376).
- **Why it matters:** the harness cannot catch an evaluation-time dependency of `coordinator.js` / `scene-state.js` on `EngineBridge`. No such dependency was observed, so this limits the harness's value as evidence and is not a live defect.
- **Minimal fix:** reorder the harness loads to match `index.html`, or add a harness assertion that compares its load list against `index.html`.

---

## 4. Explicit No-Finding Results

| Area checked | Result | Basis |
|---|---|---|
| Undefined globals at script evaluation time | **No finding** | All 8 modules are IIFEs whose top level only assigns `window.*` objects and functions. The one evaluation-time call, `StudioNotification.bindCoordinator()`, needs `AppCoordinator`, which is defined by `coordinator.js` at position 5. |
| Bare-name callers of formerly script-global functions | **No finding** | `populateShapeDropdowns()`, `syncInspectorLayerSections()`, `syncImageEditorUI()` and `renderLayersList()` are called bare in `app.js` L3608–3746 inside `DOMContentLoaded`, and resolve through `window.*`. Every parent top-level function in the moved range is exported to `window`. |
| Inline HTML handlers | **No finding** | `index.html` inline handlers reference `window.toggleAllAccordions` (defined, workspace.js L518) and export-modal globals that this batch didn't touch. |
| Duplicate `DOMContentLoaded` handlers | **No finding** | Only `app.js` L2629, `still-export-modal.js` L863 and `export-modal.js` L972, all unchanged from the parent. None of the new modules adds one. |
| Repeated event registration | **No finding (new)** | `init*()` call sites are unchanged. `TimelinePlayer.init()` is called twice (app.js L3619 and L3729), as in the parent, and is guarded. See F5 for the color picker. |
| Duplicate implementations / `window.*` redefinitions | **No finding (new)** | No `window.X =` is defined in both a new module and `app.js`. The existing `window.triggerRender` duplication (app.js L477 / coordinator.js L13) predates Batch 8D. |
| Lost `this` bindings / closure scope | **No finding** | No moved code depended on the `DOMContentLoaded` closure: every extracted item was top-level in the parent. Detached-callback patterns use arrow functions (e.g. timeline.js L176). |
| Strict-mode semantic change | **No finding** (residual risk, §5) | No implicit globals, read-only writes, `with`, `delete` or `arguments.callee`. |
| Static assets | **No finding** | RUN-04 (in the Batch 8D log) served all 25 `/js/*.js` files byte-identical. `TestEmbeddedStaticAssetsAndScriptOrder` passes. |
| Shadow scene state in extracted modules | **No finding** | No module keeps its own arrays of nodes, flows, glows, ripples, images, layers or groups, or its own ID counters. Reads go through `DiagramNodes` / `DataFlows` / `Glows` / `Ripples` / `ImageObjects` / `LayerManager` / `AppCoordinator` getters. |
| Selection / group / layer ownership | **No finding** | Mutations go through `AppCoordinator.*` (selection, groups, reorder) and `LayerManager.setVisibility/setLocked`. |
| Camera / Optics / Frame configuration | **No finding** | None of the modules dispatches these commands. `timeline.js` only applies Go-evaluated frame transforms to the DOM. |
| Timeline evaluation | **No finding** | `TimelinePlayer.evaluateAndApply` calls `EngineBridge.evaluateSceneAtTime` and returns without a JS fallback if it is unavailable (timeline.js L180–186). `requestAnimationFrame` scheduling stays in the browser, as `AGENTS.md` Rule E requires. |
| Independent Flow/Glow/Ripple animation while Play Scene is paused | **No finding** | `pause()` / `stop()` only cancel the transport rAF and never pause SVG SMIL. `applyFrameToDOM` touches only `.camera-rig`, `#cameraStage3D` and the optics-filter `<animate>` elements. |
| Crop/Bake to authoritative Go commit | **No finding** | `executeBakeImage` was not moved and still commits through `EngineBridge.bakeImage` (atomic). layers-ui bake buttons resolve it through `window.executeBakeImage`. |
| Project load to UI hydration | **No finding (static)** | The hydration call sites in `app.js` / `projects.js` are unchanged, and the extracted sync functions are exported under the same names. |
| Export serialization | **No finding** | The `SVGExportAdapter` body is identical to the parent. |
| Keyboard shortcuts | **No finding** | The workspace keyboard handling moved verbatim. The `app.js` `DOMContentLoaded` key handling is unchanged. |

---

## 5. Requires Browser Verification (not defects)

1. **Strict mode on the moved code.** Static scans are clean, but a strict-only `TypeError` on an untested branch would show up only at runtime. Open each inspector type (Node, Flow, Glow, Ripple, Image, Group, multi-select), the color picker (including the EyeDropper path), layers toggles, the workspace drawers and shortcuts, and timeline play/pause/scrub, with DevTools set to break on exceptions.
2. **Console cleanliness on load.** Confirm no `ReferenceError` occurs while the 25 scripts load in order, which the mocked harness cannot prove.
3. **F4 inspector desync** when Go rejects an image patch.

---

## 6. P2 Maintainability: What Remains in `app.js` (3,747 lines)

- **`ImageToolsController` (L519–2584, about 2,065 lines).** This is the largest remaining block. It was kept deliberately (Batch 5 pixel-composition sensitivity). It is a good candidate for a separate `image-tools.js` **after** browser verification of crop, clip, snip and bake, because it is self-contained on `window.ImageToolsController` and has explicit `window.syncImageTools*` exports (L2585–2610).
- **Bake / background-extraction helpers (L28–518).** These include `renderBackgroundToOffscreenCanvas`, the bake modal, `executeBakeImage`, `executeBackgroundExtraction` and `matchCanvasToPhoto`. They form one coherent raster pipeline and should move with `ImageToolsController`, not separately.
- **`DOMContentLoaded` body (L2629–3747).** This holds control listeners, the canvas preset and orientation UI, downloads and boot sequencing. Splitting it would mean introducing new init contracts. It is not recommended just to cut line count.
- **Carry-over for a future authority batch, not maintainability:** `app.js` L3614 writes `HistoryManager.undoStack = ['initial-state']` directly after WASM init. This predates Batch 8D and is outside its scope; it is noted only for whoever next reviews history ownership.

---

## 7. Tests Run (this review)

| Command | Result |
|---|---|
| `node scripts/regression-harness.js` | exit 0; REG-02 and REG-03 PASS, Scenario 73 PASS (mocked DOM / `DOMParser`) |
| `go vet ./...` | exit 0 |
| `go test -count=1 ./...` | all packages ok |
| `bash scripts/verify-architecture.sh` | ARCH-01..04, 06..10 PASS; **ARCH-05 WARNING** (known exception) |
| `git diff --check` | clean |
| Real browser | **not available** (no Chromium / Chrome on host) |

I did not rebuild, restart services, touch ports 8088/8090 or modify databases.
