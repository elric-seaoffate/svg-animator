# SVG Animator Studio — Batch 8C Architectural Remediation Report
## JavaScript Shadow Engine Elimination and Authoritative Go Scene Evaluation

**Document ID:** `ARCH-DOC-B8C-001`  
**Date:** 2026-11-12  
**Starting Commit:** `db3d45aa82aff8170dc0822a2e44fa0b4527e413`  
**Protected Release:** `v1.2.0`  
**Development Preview:** `http://127.0.0.1:8089/`  
**BookStack:** Book ID `353`, Remediation Page `448`

---

## 1. Executive Summary

Batch 8C represents the completion of the Go/WASM architectural authority remediation initiated by the Batch 8A comprehensive audit. While Batch 8B established atomic mutations, strict validation contracts, and read-only presentation hydration, Batch 8C systematically dismantled the remaining competing JavaScript "shadow engine" and established Go as the sole authority over timeline mathematics, persistent scene state, scene configuration (Canvas, Camera, Optics, Frame), layer reordering, and object identity allocation.

The 7 audit findings remediated in this batch:
1. **`A8A-002` (P1):** Elimination of Go timeline evaluation bypass and competing JavaScript timeline mathematics in `engine-bridge.js`.
2. **`A8A-003` (P1):** Elimination of persistent JavaScript fallback editor engines across all scene object modules (`nodes.js`, `flows.js`, `glows.js`, `ripples.js`, `ImageObjects`, `ObjectGroups`).
3. **`A8A-006` (P2):** Full Go authority established for Canvas, Camera, Optics, and Frame configuration via `Canvas.Update`, `Camera.Update`, `Optics.Update`, and `Frame.Update` protocol commands.
4. **`A8A-007` (P2):** Resolution of hidden object rendering leaks in unlayered fallback SVG generation in `scene-state.js`.
5. **`A8A-008` (P3):** Reconciliation of photo-fit default policy across DOM, state models, and engine presets (`photoFitSelect: 'match'`).
6. **`A8A-011` (P2):** Elimination of JavaScript-only layer list mutations (`_fallbackReorder`) and enforcement of Go authority for all layer reordering operations.
7. **`A8A-012` (P2):** Complete transfer of object ID allocation authority to the Go engine, eliminating autonomous JavaScript ID counters.

All 72 scenarios in the comprehensive regression harness (`scripts/regression-harness.js`) passed with zero errors, and all architectural and runtime verification suites (`verify-architecture.sh`, `verify-runtime.sh`) completed with exit code 0.

---

## 2. Remediated Findings Breakdown

### 2.1 A8A-002: Timeline Evaluation Authority (`P1`)
- **Problem:** `engine-bridge.js` maintained `_evaluateSceneAtTimeJS`, duplicating camera, optics, and particle math. Furthermore, `evaluateSceneAtTime` fell back to JavaScript math if `_sceneSynced` was false or if Go returned an error.
- **Remediation:** 
  - `_sceneSynced` is set to `true` upon WASM engine mount.
  - When the engine is ready, `evaluateSceneAtTime` and `evaluateBatch` invoke Go commands `Timeline.EvaluateSceneAtTime` and `Timeline.EvaluateBatch`.
  - On Go evaluation error, `evaluateSceneAtTime` returns a structured failure envelope (`{ success: false, error: ... }`) and preserves the last valid frame without executing or returning competing JavaScript calculations.
  - Mathematical parity between Go timeline evaluation and analytical reference calculations was verified across camera zoom/pan, optical blur/vignette, flow particle position, and pulse harmonic curves (see `batch8c-timeline-parity-tests.md`).

### 2.2 A8A-003: Elimination of Persistent JS Fallback Engines (`P1`)
- **Problem:** When `EngineBridge.isReady()` returned false, `createNode`, `createFlow`, `createGlow`, `createRipple`, `ImageObjects.createImage`, and `ObjectGroups.createGroup` previously created local objects in JavaScript and allocated local IDs, establishing a shadow state invisible to Go.
- **Remediation:**
  - Removed local object instantiation fallbacks across all object modules.
  - When Go is unmounted or unavailable, object creation is explicitly rejected, returning `null` or `{ success: false, error: 'Go/WASM engine is unavailable' }`.
  - Object creation requires Go engine validation; persistent objects can only be instantiated inside the authoritative Go scene graph.

### 2.3 A8A-006: Canvas, Camera, Optics, and Frame Go Authority (`P2`)
- **Problem:** Canvas dimensions, duration, loop modes, camera parameters, optical effects, and frame borders were treated as presentation-only DOM state in `scene-state.js` without authoritative Go protocol commands.
- **Remediation:**
  - Implemented `Canvas.Get` and `Canvas.Update` commands in `pkg/engine/protocol/commands.go` supporting safe partial updates for `width`, `height`, `duration`, `loop`, `fps`, and `backgroundColor`.
  - Added unit tests in `pkg/engine/protocol/commands_test.go` (`TestDispatchCanvasCommands`).
  - Added `updateCanvas` and `getCanvas` to `EngineBridge`.
  - Wired `commitCurrentSceneConfigToGo()` in `app.js` and `scene-state.js` to dispatch discrete and debounced property changes to Go.
  - Rebuilt `internal/web/static/wasm/engine.wasm` (5.5 MB).

### 2.4 A8A-007: Unlayered SVG Rendering Visibility Enforcement (`P2`)
- **Problem:** In `scene-state.js:buildFullSVG`, unlayered fallback rendering loops iterated over nodes, flows, glows, and ripples without checking effective visibility (`LayerManager.getEffective`). Hidden objects were erroneously included in the generated SVG markup.
- **Remediation:**
  - Added `LayerManager.getEffective(type, id).visible` checks in all unlayered object loops of `buildFullSVG`.
  - Hidden objects are completely omitted from generated SVG markup.

### 2.5 A8A-008: Canonical Photo-Fit Policy Reconciliation (`P3`)
- **Problem:** `scene-state.js:getDefaultControls()` hardcoded `photoFitSelect: 'contain'`, conflicting with the canonical default `'match'` defined in `index.html` and `app.js`.
- **Remediation:**
  - Reconciled `scene-state.js:getDefaultControls()` to set `photoFitSelect: 'match'`.
  - Verified that all new projects and control state initializations canonically apply the `'match'` crop policy.

### 2.6 A8A-011: Layer Reordering Go Engine Authority (`P2`)
- **Problem:** `LayerManager` in `engine-bridge.js` retained `_fallbackReorder` which manipulated local array indices when Go was unmounted, allowing shadow reordering without Go validation.
- **Remediation:**
  - Removed `_fallbackReorder`.
  - `bringToFront`, `sendToBack`, `bringForward`, and `sendBackward` require an active Go engine.
  - When Go is unavailable, layer reordering returns `{ success: false, error: 'Go/WASM engine is unavailable' }`.
  - Corrected `projects.js` and `history.js` project restoration to pass `{ skipBridge: true }` during atomic multi-module state resets so layers are validated atomically with restored objects during `Scene.Sync`.

### 2.7 A8A-012: Go-Owned Object Identifier Allocation (`P2`)
- **Problem:** `DiagramNodes.counter`, `DataFlows.counter`, `Glows.counter`, `Ripples.counter`, `ImageObjects.counter`, and `ObjectGroups.counter` allocated IDs in JavaScript prior to or independent of Go.
- **Remediation:**
  - Removed JavaScript ID counters as authoritative generators.
  - Persistent IDs are allocated authoritatively by Go's `activeScene.Create*` methods and returned across the protocol boundary.
  - Presentation modules receive and store Go-allocated IDs without local ID generation.

---

## 3. Verification & Compliance Evidence

### 3.1 Verification Execution Summary
The complete test and verification suite was executed and recorded in `docs/architecture/batch8c-implementation-evidence.log`:

| Check | Target / Command | Scenarios / Steps | Exit Code | Result |
|:---|:---|:---:|:---:|:---:|
| **Go Vet** | `go vet ./...` | Whole Go codebase | 0 | **PASS** |
| **Go Tests** | `go test -count=1 ./...` | All packages | 0 | **PASS** |
| **Race Detector** | `go test -race -count=1 ./pkg/engine/scene/...` | Scene concurrency | 0 | **PASS** |
| **Regression Harness** | `node scripts/regression-harness.js` | 72 scenarios | 0 | **PASS** |
| **Architecture Audit** | `bash scripts/verify-architecture.sh` | ARCH-01 to ARCH-10 | 0 | **PASS** |
| **Runtime & HTTP** | `bash scripts/verify-runtime.sh` | RUN-01 to RUN-07 | 0 | **PASS** |
| **Git Diff Check** | `git diff --check` | Whitespace/formatting | 0 | **PASS** |
| **Dev Preview** | `curl -s http://127.0.0.1:8089/` | Port 8089 | 0 | **PASS (200 OK)** |

### 3.2 Regression Harness Scenario 72 Verification
Scenario 72 was added to `scripts/regression-harness.js` specifically verifying Batch 8C:
- **Test 1:** Go Timeline Authority verified (`evaluateSceneAtTime` reports controlled error and preserves last valid frame; no fallback to JS math).
- **Test 2:** Persistent JS fallbacks eliminated (Node, Flow, Glow, Ripple, Image, Group creation rejected when Go is unavailable).
- **Test 3:** Go authority over Canvas, Camera, Optics, and Frame verified (`updateCanvas`, `updateCamera`, `updateOptics`, `updateFrame`).
- **Test 4:** Layer visibility in SVG rendering verified (hidden unlayered objects omitted from SVG).
- **Test 5:** Reconciled `photoFitSelect: 'match'` canonical default verified.
- **Test 6:** Layer reorder Go engine authority verified (operations fail with clear error when Go is unavailable).
- **Test 7:** Go-owned ID allocation verified (Node ID matches Go engine allocation).

---

## 4. Architectural Boundaries Preserved

1. **Working Features Preserved:** Stage 15 non-destructive cropping, background extraction, image baking, dedicated crop clip & snip workspace, object-local clipping, unified layer management, independent image objects, persistent groups, duplication, copy/paste with flow remapping, multi-selection, alignment, distribution, and `.sva` packaging remain fully functional.
2. **Layer Separation:** Presentation layer (Layer 1) delegates user actions to AppCoordinator (Layer 2), which coordinates commands to Go engine (Layer 3) via EngineBridge.
3. **No Unapproved Redesign:** No UI layout changes or refactorings outside the 7 audited findings were performed. Batch 8D (modularization of `app.js`) and Stage 16 remain cleanly separated.
