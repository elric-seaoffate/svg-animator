# SVG Animator Studio — Go/WASM Architectural Authority Audit

**Document Identifier:** `DOC-ARCH-BATCH8A-AUTHORITY-AUDIT`  
**Audit Batch:** Batch 8A (Post-Carbon Remediation)  
**Execution Type:** STRICTLY READ-ONLY ARCHITECTURAL AUDIT  
**Baseline Commit:** `61ca201e42d9f4672aca75f9f8f42e3c02ddb073`  
**Protected Release:** `v1.2.0`  
**Audited System:** SVG Animator Studio (Go Backend/WASM Engine + HTML5/CSS3/Vanilla JS Studio)  
**Date:** 2026-11-12  

---

## 1. Executive Summary & Verdict

### 1.1 The Architectural Mandate
According to the permanent project development rules (`AGENTS.md`), the core architectural principle of SVG Animator Studio is:

$$\text{Go Engine (Authoritative)} \longrightarrow \text{WASM Bridge} \longrightarrow \text{JavaScript Browser Adapter} \longrightarrow \text{Browser SVG Engine}$$

**Go is the primary application and animation engine. JavaScript is a browser adapter and SVG presenter.** All persistent scene models, object lifecycles, coordinate calculations, group transformations, history snapshots, and timeline evaluations belong authoritatively in Go.

### 1.2 Audit Verdict: Partially Compliant with Critical Authority Leaks
Following the completion of Batches 0 through 7, a thorough, evidence-based audit of the four primary frontend coordination files (`scene-state.js`, `coordinator.js`, `engine-bridge.js`, and `app.js`) and the authoritative Go protocol (`pkg/engine/protocol/commands.go`) reveals that while **Go engine capabilities are exceptionally mature** (117 typed protocol commands, deep history, robust mathematical validation, zero test failures), **the frontend presentation layer has not fully surrendered operational authority to Go**.

Specifically, this audit has confirmed **12 distinct architectural violations** (`A8A-001` through `A8A-012`), including:
1. **Hydration-Induced State Mutations (`A8A-001`):** Calling read-only UI hydration functions (e.g. `setLoadedPhoto`) during history undo/redo or project loading dispatches mutation commands (`Background.Set`) across the bridge, advancing Go scene revisions and dirtying clean state.
2. **Timeline Evaluation Bypass (`A8A-002`):** In fresh editor sessions, `_sceneSynced` is `false`, causing the timeline player to completely bypass Go's WebAssembly evaluator (`Timeline.EvaluateSceneAtTime`) and execute 380 lines of shadow JavaScript timeline interpolation instead.
3. **Shadow Fallback Persistence (`A8A-003`, `A8A-011`):** JavaScript maintains independent in-memory collections (`ImageObjects.list`, `ObjectGroups.list`, `LayerManager.list`) with fallback algorithms that mutate local state when WASM is unready, creating objects invisible to the Go engine.
4. **False-Success Return Contracts (`A8A-004`):** High-level presentation coordinators (such as `AppCoordinator.moveSelectedNodes` and `app.js:commitCurrentCrop`) fail to verify the success status of Go commands, treating rejected operations as successful and recording invalid history snapshots.
5. **Destructive Snapshot Scraping (`A8A-005`):** `EngineBridge.syncScene()` scrapes 9 disparate JavaScript arrays and DOM form elements to assemble a full scene snapshot, passing it to `Scene.SetState` and risking overwriting newer Go engine data.
6. **Non-Atomic Multi-Step Workflows (`A8A-010`):** Operations like Image Baking perform multi-step uncoupled mutations across JavaScript and Go without transaction semantics or rollback protection.

### 1.3 Stage 16 Readiness Recommendation
**Stage 16 (Digital Twin Presenter & Live Telemetry) must NOT begin until Batches 8B and 8C are completed.** Introducing external real-time data streams into an architecture where timeline evaluation can silently fall back to JavaScript and where command failure contracts are ignored would result in severe split-brain state corruption.

---

## 2. Audit Scope & Methodology

### 2.1 Audited Codebase Artifacts
The audit examined 437 functions across four core frontend files, spanning 13,858 lines of JavaScript, along with the authoritative Go protocol and engine packages:
- `internal/web/static/js/scene-state.js` (650 lines) — Canvas render state aggregation and DOM control cache.
- `internal/web/static/js/coordinator.js` (914 lines) — Application coordination, selection, history, and rendering triggers.
- `internal/web/static/js/engine-bridge.js` (4,264 lines) — WebAssembly bridge, fallback engines, and typed dispatchers.
- `internal/web/static/js/app.js` (6,700 lines) — Studio UI presentation, DOM event handlers, crop tool, and modal logic.
- `pkg/engine/protocol/commands.go` (3,320 lines) — 117 authoritative Go protocol command dispatchers.
- `pkg/engine/scene/` (6,500+ lines) — Go scene models, history stack, group hierarchy, and layer storage.
- `pkg/engine/timeline/` (1,200+ lines) — Deterministic timeline evaluation engine.

### 2.2 Audit Rules & Invariants
- **Strictly Read-Only:** No application source code, tests, binaries, or databases were modified.
- **Verification Harness Baseline:** All tests were verified prior to audit and confirmed 100% passing:
  - `go vet ./...` (exit 0)
  - `go test -count=1 ./...` (exit 0)
  - `go test -race -count=1 ./pkg/engine/scene/...` (exit 0)
  - `node scripts/regression-harness.js` (70 / 70 PASS)
  - `bash scripts/verify-architecture.sh` (exit 0)

---

## 3. Register of Confirmed Authority Violations

The audit investigated 12 specific violation hypotheses (`A8A-001` through `A8A-012`). All 12 were **CONFIRMED** by direct source inspection and call graph tracing.

| Finding ID | Severity | Category | Target File & Line | Summary Description |
| :--- | :--- | :--- | :--- | :--- |
| **A8A-001** | **P1** | Hydration & Background Mutation | `scene-state.js:137` | `setLoadedPhoto` emits `Background.Set` during read-only hydration, bumping Go revision on Undo/Redo. |
| **A8A-002** | **P1** | Timeline Evaluation Bypass | `engine-bridge.js:2535` | `_sceneSynced` gates Go evaluation; fresh editor sessions run 380 lines of shadow JS timeline math. |
| **A8A-003** | **P1** | Persistent Fallback Engine | `engine-bridge.js:3402` | `ImageObjects` & `ObjectGroups` maintain shadow persistent arrays when WASM is not ready. |
| **A8A-004** | **P1** | False-Success Return Contracts | `coordinator.js:762` | `moveSelectedNodes` returns `true` unconditionally, ignoring Go errors and recording bad history. |
| **A8A-005** | **P1** | Destructive Scene Sync | `engine-bridge.js:2511` | `syncScene()` scrapes 9 JS arrays/DOM states and dispatches `Scene.SetState`, risking clobbering Go state. |
| **A8A-006** | **P2** | Camera/Optics Control Authority | `scene-state.js:319` | `buildRenderState` scrapes camera and optics from DOM on every frame, bypassing Go engine model. |
| **A8A-007** | **P2** | Visibility Bypass in Rendering | `scene-state.js:435` | Fallback unlayered rendering loop in `buildFullSVG` renders objects without checking `.visible`. |
| **A8A-008** | **P3** | Inconsistent Canvas Defaults | `scene-state.js:508` | `getDefaultControls` defaults `photoFitSelect` to `'contain'`, conflicting with `'match'` in `index.html`. |
| **A8A-009** | **P1** | Optimistic Selection Authority | `coordinator.js:215` | `selectObject` mutates selection locally and ignores `Selection.Set` response envelope from Go. |
| **A8A-010** | **P1** | Non-Atomic Bake & Crop Commit | `app.js:4264, 5607` | `executeBakeImage` and `commitCurrentCrop` execute uncoupled multi-step mutations without atomic rollback. |
| **A8A-011** | **P2** | Unchecked Layer Reordering | `engine-bridge.js:4232` | `LayerManager._fallbackReorder` mutates local list when WASM is unready, bypassing Go layers. |
| **A8A-012** | **P2** | Duplicate Object ID Counters | `nodes.js:34` | JavaScript object modules pre-allocate IDs with local counters before sending `Create` commands to Go. |

---

## 4. Deep-Dive Analysis of Primary Findings

### 4.1 Finding A8A-001 — Conflation of Hydration and Mutation
- **Location:** `internal/web/static/js/scene-state.js:137-156` and `internal/web/static/js/app.js:6656-6668`
- **Mechanism:** `SceneState.setLoadedPhoto(photo)` is designed to update the UI photo reference. However, lines 145–154 immediately dispatch `EngineBridge.setBackground()` which emits `Background.Set` across the bridge to Go (`commands.go:3087`).
- **Failure Scenario:** When `HistoryManager.undo()` restores a background change, it calls `window.setLoadedPhoto()`. This causes a read-only undo operation to dispatch a new `Background.Set` mutation to Go, bumping the scene revision from $N$ to $N+1$ instead of restoring $N-1$. Similarly, during project loading (`projects.js:227`), redundant `Background.Set` commands are emitted.
- **Architectural Violation:** Layer 1 (Presentation) directly triggers operational state mutations during a state restoration lifecycle.

### 4.2 Finding A8A-002 — Timeline Frame Evaluation Bypass
- **Location:** `internal/web/static/js/engine-bridge.js:2535-2560`
- **Mechanism:** `evaluateSceneAtTime(t)` contains the following gate:
  ```javascript
  if (this.isReady() && this._sceneSynced) {
    const res = this.dispatch('Timeline.EvaluateSceneAtTime', { time: t });
    if (res && res.success) return res;
  }
  return this._evaluateSceneAtTimeJS(t);
  ```
  `_sceneSynced` is initialized to `false` and is ONLY set to `true` inside `syncScene()`, which is called exclusively during project loading (`projects.js:339`).
- **Failure Scenario:** In any fresh editor session where the user begins creating nodes, glows, or flows without loading an existing saved project, `_sceneSynced` remains `false`. As a result, the editor runs `_evaluateSceneAtTimeJS()` (380 lines of duplicate JavaScript Bezier math), completely bypassing Go's authoritative WASM evaluator.
- **Architectural Violation:** Rule B (One Source of Truth) is broken; competing shadow evaluators produce subtle divergences in easing and interpolation curves between editor preview and backend video exports.

### 4.3 Finding A8A-004 — False-Success Return Contracts in Coordination Layer
- **Location:** `internal/web/static/js/coordinator.js:762-790`
- **Mechanism:** `AppCoordinator.moveSelectedNodes(deltaX, deltaY)` handles group and multi-node dragging. At line 772:
  ```javascript
  if (this.activeGroup) {
    window.EngineBridge.moveGroup(this.activeGroup.id, deltaX, deltaY);
    // return status never checked
  }
  ...
  return true; // Unconditionally returns true!
  ```
- **Failure Scenario:** If the group is locked in Go (`pkg/engine/scene/group.go:185`), `moveGroup` returns `{ success: false, error: "group is locked" }`. Because `moveSelectedNodes` ignores this result and returns `true`, the UI caller proceeds to trigger history snapshot recording and visual overlay refreshes, leaving the user with an inconsistent history stack and no error notification.
- **Architectural Violation:** Layer 2 fails to enforce the operational command contract returned by Layer 3.

### 4.4 Finding A8A-005 — Destructive Scene Snapshot Scraping
- **Location:** `internal/web/static/js/engine-bridge.js:2511-2534`
- **Mechanism:** `syncScene()` calls `buildCurrentSceneSnapshot()` which scrapes 9 separate in-memory JavaScript lists (`DiagramNodes.list`, `FlowConnectors.list`, `GlowEffects.list`, `RippleEffects.list`, `ImageObjects.list`, `ObjectGroups.list`, `LayerManager.list`, etc.) and dispatches `Scene.SetState`.
- **Failure Scenario:** If any JavaScript list is momentarily incomplete, unhydrated, or out of sync (for example, following a partial bridge operation or asynchronous asset load), calling `syncScene()` forces Go to replace its validated internal scene graph with the incomplete JavaScript snapshot.
- **Architectural Violation:** The downstream presentation adapter dictates the authoritative state of the upstream Go engine.

### 4.5 Finding A8A-010 — Non-Atomic Multi-Step Workflows
- **Location:** `internal/web/static/js/app.js:4264-4310` (`executeBakeImage`)
- **Mechanism:** Baking an image to the canvas background executes three separate, uncoupled operations:
  1. `setLoadedPhoto()` -> dispatches `Background.Set`
  2. `ImageObjects.deleteImage()` -> dispatches `Image.Delete`
  3. `HistoryManager.recordImmediate()` -> dispatches `History.RecordSnapshot`
- **Failure Scenario:** If step 2 fails (e.g. image locked or bridge communication glitch), the background has already been replaced by the rasterized photo, but the foreground image remains on the stage. Furthermore, history records an intermediate split-brain state.
- **Architectural Violation:** Multi-primitive transactions lack ACID properties and rollback mechanisms across the bridge boundary.

---

## 5. JavaScript Function Inventory Summary

The audit scanned 437 functions across the four primary frontend modules, classifying each by its architectural layer and compliance status (persisted in `docs/architecture/batch8a-js-function-inventory.csv`):

```
Total Audited Functions: 437
├── Layer 1: UI Presentation (app.js, DOM adaptors)
│   ├── Compliant DOM Event / Viewport Handlers: 278 (63.6%)
│   └── Violations (Direct state mutation, unhandled contracts): 31 (7.1%)
├── Layer 2: Application Coordination (coordinator.js, scene-state.js)
│   ├── Compliant Orchestration / Notification: 48 (11.0%)
│   └── Violations (Optimistic selection, unverified returns): 14 (3.2%)
└── Layer 3: Bridge & Adapter (engine-bridge.js)
    ├── Compliant Typed Command Dispatchers: 42 (9.6%)
    └── Violations (Shadow persistence, fallback math, array scraping): 24 (5.5%)
```

---

## 6. Go Protocol Command Coverage Summary

A complete line-by-line audit of `pkg/engine/protocol/commands.go` (persisted in `docs/architecture/batch8a-go-command-coverage.md`) verified:
- **Total Go Protocol Commands:** 117
- **Commands Dispatched by JavaScript Bridge:** 113 (96.6%)
- **Orphaned / Uncalled Go Commands:** 4 (3.4%)
  - `Scene.UpdateFlow` (L1224) — Deprecated; replaced by `Flow.Update`.
  - `Scene.RemoveFlow` (L1232) — Deprecated; replaced by `Flow.Delete`.
  - `Node.Get` (L1428) — Unused; presentation reads full snapshots.
  - `Image.CropVersionCreate` (L2890) — Unused; presentation uses `Image.Crop` directly.
- **Lock & Invariant Enforcement:** Over 90% of mutating commands in Go strictly verify object and layer lock states (`activeScene.IsLocked(...)`) and return explicit error envelopes.

---

## 7. Migration Roadmap & Batch Definitions

To safely rectify these findings without disrupting the working studio, the following remediation schedule is established (detailed in `docs/architecture/batch8a-migration-plan.md`):

1. **Batch 8B — State Authority, Command Contracts & Atomic Commit Ordering:**
   - Decouple read-only presentation hydration from Go mutation dispatch (`A8A-001`).
   - Check return envelopes across all `AppCoordinator` and `app.js` bridge dispatches (`A8A-004`).
   - Reconcile selection authoritatively from Go `Selection.Set` response (`A8A-009`).
   - Implement atomic `Image.Bake` protocol command and transactional crop commit (`A8A-010`).
   - Eliminate snapshot scraping in `syncScene()` (`A8A-005`).
2. **Batch 8C — Timeline, Geometry & Fallback Elimination:**
   - Remove `_sceneSynced` gate so Go evaluator runs on fresh page load (`A8A-002`).
   - Deprecate shadow fallback engines in `ImageObjects`, `ObjectGroups`, and `LayerManager` (`A8A-003`, `A8A-011`).
   - Authoritative Go camera/optics state, eliminate per-frame DOM scraping (`A8A-006`).
   - Fix unlayered object rendering visibility check in `buildFullSVG` (`A8A-007`).
   - Harmonize canvas defaults (`A8A-008`).
   - Canonical Go object ID allocation (`A8A-012`).
3. **Batch 8D — Presentation & UI Modularisation:**
   - Decompose `app.js` (6,700 lines) into pure UI controllers (`stage-viewport.js`, `toolbar-controller.js`, `context-editor.js`, `crop-overlay-controller.js`, `timeline-ui-controller.js`).
   - Ensure strictly unidirectional flow: User Event -> Coordinator -> Go Engine -> Presentation Update.

---

## 8. Conclusion

SVG Animator Studio possesses a rock-solid, production-grade Go engine. The remaining architectural defects reside entirely in the lingering legacy JavaScript presentation layers that continue to duplicate state, bypass the WASM evaluator on fresh sessions, and ignore Go error contracts. 

Executing Batches 8B, 8C, and 8D according to the roadmap will complete the vision of `AGENTS.md` and establish an uncompromising, bulletproof foundation for Stage 16.
