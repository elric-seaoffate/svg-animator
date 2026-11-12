# Batch 8B — Authoritative State, Strict Command Contracts and Atomic Commit/Hydration

**Project:** SVG Animator Studio  
**Branch:** `main`  
**Starting Commit:** `94bf3986f883850ab85fc05050d7063dbbe1d9fa`  
**Protected Release:** `v1.2.0`  
**Development Preview Server:** `http://127.0.0.1:8089/`  
**BookStack Book ID:** 353 (Remediation Page 447)  
**Date:** 2026-11-12  

---

## 1. Executive Summary

Batch 8B is the primary operational remediation phase following the completed two-pass Carbon architectural review and the Batch 8A read-only authority audit. The mission of this batch was to directly eliminate the five highest-risk **Priority 1 (P1)** architectural authority violations where JavaScript continued to exercise shadow authority, perform optimistic mutations, or execute non-atomic operations:

1. **A8A-001 (P1):** Background mutations caused by presentation hydration.
2. **A8A-004 (P1):** False-success command handling in `AppCoordinator`.
3. **A8A-005 (P1):** Unsafe JS-to-Go whole-scene synchronisation.
4. **A8A-009 (P1):** Optimistic selection changes without confirmed Go acceptance.
5. **A8A-010 (P1):** Non-atomic Crop Commit and Image Bake operations.

All remediations were executed in strict adherence to the project hierarchy (`AGENTS.md`), preserving the fully working Stage 15 features verified by the user in the browser (background cropping, clipping, image baking, persistent groups, undo/redo, and `.sva` persistence).

---

## 2. Root Cause Analysis of Remediated Findings

### A8A-001: Background Mutations Caused by Presentation Hydration
- **Root Cause:** When restoring projects or applying history states, presentation code called `window.setLoadedPhoto(photoObj)`. `setLoadedPhoto` was dual-purposed: it updated the DOM wrapper *and* dispatched `BackgroundPhoto.Set` or `SetBackgroundPhoto` across the WASM bridge to Go. This meant presentation-only rendering triggers were inadvertently mutating the Go engine state, incrementing scene revision counters, and creating cycles of spurious updates.
- **Architectural Violation:** Layer 1 (Presentation) directly mutating Layer 3 (Operational) authoritative engine state during read-only hydration.

### A8A-004: False-Success Command Handling in `AppCoordinator`
- **Root Cause:** Methods such as `AppCoordinator.moveSelectedNodes` dispatched WASM commands (`Group.Move` or `Node.Update`) but unconditionally returned `true` regardless of whether the Go engine accepted or rejected the command. Callers in `app.js` relied on this return value to record undo history (`recordHistoryDebounced()`), causing rejected or locked operations to pollute the undo history with non-functional steps.
- **Architectural Violation:** Failure to observe command contracts; optimistic reporting masking engine validation rejections.

### A8A-005: Unsafe JS-to-Go Whole-Scene Synchronisation
- **Root Cause:** In `projects.js:applyStudioState()`, project restoration invoked `EngineBridge.syncScene()` without providing a snapshot argument. When called without an argument, `syncScene()` fell back to scraping live JavaScript objects and DOM nodes from `window.DiagramNodes`, `window.DiagramFlows`, and form controls. If an asset failed to load or a DOM node was missing, a degraded or incomplete scene state was pushed into Go.
- **Architectural Violation:** Authoritative engine state being overwritten by unreliable presentation scraping instead of verified project data packages.

### A8A-009: Optimistic Selection Changes Without Confirmed Go Acceptance
- **Root Cause:** `AppCoordinator.selectObject`, `_addToSelectionInternal`, and `_toggleObjectSelectionInternal` updated local JavaScript selection collections (`selectedObject`, `multiSelection`) and fired DOM/event updates before dispatching `Selection.Set` across the WASM bridge. If Go rejected the selection (e.g. non-existent object ID or locked target), the UI remained in a desynchronised, phantom selection state.
- **Architectural Violation:** Presentation layer assuming selection authority without authoritative Go engine validation.

### A8A-010: Non-Atomic Crop Commit and Image Bake Operations
- **Root Cause:** In `app.js`, `commitCurrentCrop` and `executeBakeImage` performed multi-step modifications across JavaScript and Go without transaction boundaries. Specifically, `executeBakeImage` deleted the image object in JavaScript (`DiagramImages.removeImage`), pushed an updated background photo to Go, and re-rendered. If any intermediate call failed, the image was lost while the background remained unbaked. Similarly, Crop Commit did not verify the Go command envelope before altering presentation state.
- **Architectural Violation:** Lack of transactional atomicity across composition operations; risk of irreversible data loss.

---

## 3. Implemented Architectural Remediations

### 3.1 Read-Only Hydration Isolation (`A8A-001`)
- **Engine Bridge & Scene State Separation:**
  - Implemented `hydrateLoadedPhoto(photoObj)` in `scene-state.js` and exposed via `window.hydrateLoadedPhoto`.
  - Added support for `{ hydrateOnly: true }` and `{ skipBridge: true }` options in `SceneState.setLoadedPhoto`.
  - In `app.js`, `window.setLoadedPhoto` routes calls containing `{ hydrateOnly: true }` directly to `hydrateLoadedPhoto`.
- **Caller Migration:**
  - Replaced all historical hydration call sites in `internal/web/static/js/history.js` (line 300), `projects.js` (lines 227 & 740), and `engine-bridge.js` (line 1754) with `hydrateLoadedPhoto`.
- **Verification Invariant:** Hydrating presentation state does not invoke `EngineBridge.dispatch`, does not increment the Go scene revision counter, and does not record undo history.

### 3.2 Strict Command Contracts in `AppCoordinator` (`A8A-004`)
- **Validation and Return Value Propagation:**
  - Updated `AppCoordinator.moveSelectedNodes(dx, dy)` to inspect the result envelope of every WASM dispatch. If any command returns `res && res.success === false`, or if all selected objects are locked, `moveSelectedNodes` immediately returns `false`.
  - Updated `app.js` (drag interaction completion) to check:
    ```javascript
    const moved = window.AppCoordinator.moveSelectedNodes(dx, dy);
    if (moved) {
      recordHistoryDebounced();
    }
    ```
- **Verification Invariant:** Moving locked or non-existent nodes returns `false` and records zero undo history entries.

### 3.3 Explicit Project Restoration Snapshot (`A8A-005`)
- **Scraping Elimination:**
  - In `projects.js:applyStudioState(state, options)`, constructed an explicit, well-formed project scene snapshot directly from the incoming project state (`state.nodes`, `state.flows`, `state.glows`, `state.ripples`, `state.images`, `state.canvas`, `state.camera`, `state.groups`, `state.layers`, `state.photo`).
  - Passed this explicit snapshot to `window.EngineBridge.syncScene(projectSnapshot)` as an atomic operation.
- **Verification Invariant:** Restoring a project synchronizes the verified package state directly into Go without querying or scraping browser DOM elements.

### 3.4 Go-Authoritative Selection Rejection (`A8A-009`)
- **Pre-Commit Validation:**
  - Modified `AppCoordinator.selectObject`, `_addToSelectionInternal`, `_toggleObjectSelectionInternal`, `_setMultiSelectionInternal`, and `selectGroup`.
  - Before modifying local coordinator state or activating module panels, the coordinator dispatches `window.EngineBridge.setSelection(type, id)` (or `Selection.Set`).
  - If the Go engine rejects the selection (`res.success === false` or `error`), the coordinator aborts the update, preserves the prior selection, and returns `false`.
  - In `internal/web/static/js/engine-bridge.js`, ensured `setSelection` returns a typed error envelope `{ success: false, error: ... }` on failure rather than `null`.
- **Verification Invariant:** Invalid or non-existent object IDs are rejected; prior selection remains active.

### 3.5 Atomic Image Bake and Crop Commit (`A8A-010`)
- **Go Engine Implementation (`pkg/engine/scene/image.go`):**
  - Added atomic method:
    ```go
    func (s *Scene) BakeImage(imageID, mode, bakedData string, canvasW, canvasH int) (*BakeImageResult, error)
    ```
  - Validates image existence, checks locking status (`cannot bake locked image`), and validates baked payload.
  - Updates the active scene's background photo (`s.Photo`) with the baked pixel data and dimensions.
  - If `mode == "remove"`, deletes the image object from `s.Images` and cleans up group and layer memberships.
  - If `mode == "keep"`, marks the image as invisible or preserves it per configuration.
  - Increments the scene revision counter once atomically.
- **Protocol Command Dispatcher (`pkg/engine/protocol/commands.go`):**
  - Added `ImageBakeRequest` and `ImageBakeResponse` types.
  - Added `"Image.Bake"` dispatch case in `DispatchCommand`.
- **WebAssembly Bridge Integration (`internal/web/static/js/engine-bridge.js`):**
  - Added `window.EngineBridge.bakeImage(imageId, mode, bakedDataUrl, canvasW, canvasH)`.
  - Updated `_applyBackgroundUpdate` to handle blank initial canvases safely.
- **Frontend Atomic Workflow (`internal/web/static/js/app.js`):**
  - Refactored `executeBakeImage(imgObj, mode)` to delegate entirely to `EngineBridge.bakeImage`. Only after Go returns `{ success: true }` does the UI update DOM elements and clear local state.
  - Refactored `commitCurrentCrop()` to evaluate the response envelope of `EngineBridge.commitCrop` and `commitBackgroundCrop` before altering local state.
- **Verification Invariant:** Any failure in the bake or crop pipeline leaves image objects and canvas backgrounds in their original, uncorrupted state.

---

## 4. Verification and Test Results

### 4.1 Automated Command Verification

```bash
# 1. Static Analysis
$ go vet ./...
Exit: 0

# 2. Complete Go Unit Tests
$ go test -count=1 ./...
ok  	gitea.seaoffate.net/blackgrape/svg-animator/internal/db	0.031s
ok  	gitea.seaoffate.net/blackgrape/svg-animator/internal/generator	0.007s
ok  	gitea.seaoffate.net/blackgrape/svg-animator/internal/rasterizer	0.014s
ok  	gitea.seaoffate.net/blackgrape/svg-animator/internal/web	0.077s
ok  	gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry	0.002s
ok  	gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/protocol	0.010s
ok  	gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/scene	0.008s
ok  	gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/sva	0.700s
ok  	gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/timeline	0.002s
Exit: 0

# 3. Go Race Detector on Authoritative Scene Engine
$ go test -race -count=1 ./pkg/engine/scene/...
ok  	gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/scene	1.030s
Exit: 0

# 4. Architecture Verification Script
$ bash scripts/verify-architecture.sh
Exit: 0 (All ARCH-01 through ARCH-10 checks pass)

# 5. Runtime & Isolated Persistence Verification
$ bash scripts/verify-runtime.sh
Exit: 0 (All RUN-01 through RUN-07 checks pass; protected database metadata unchanged)

# 6. Whitespace and Git Hygiene Check
$ git diff --check
Exit: 0

# 7. Comprehensive Regression Test Harness (71 Scenarios)
$ node scripts/regression-harness.js
[HARNESS] Testing Scenario 71: Batch 8B Authority Remediation, Strict Contracts & Atomic Operations...
[HARNESS] Scenario 71 Test 1: A8A-001 Read-only presentation hydration...
[HARNESS] Scenario 71 Test 2: A8A-004 moveSelectedNodes failure contract...
[HARNESS] Scenario 71 Test 3: A8A-009 Go-authoritative selection rejection...
[HARNESS] Scenario 71 Test 4: A8A-010 Atomic Image Bake failure rejection...
[HARNESS] Scenario 71 Test 5: A8A-010 Atomic Image Bake success...
[HARNESS] Scenario 71 Test 6: A8A-005 Project restore explicit snapshot...
[HARNESS] Scenario 71 PASS: Batch 8B Authority Remediation, Strict Contracts & Atomic Operations verified.
Exit: 0
```

### 4.2 Dev Server Verification
- Development server running on daemon port `:8089` verified via `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8089/` -> `200`.

---

## 5. Artifacts and Deliverables Produced

1. **`docs/architecture/batch8b-authority-remediation-report.md`**: This comprehensive architectural report.
2. **`docs/architecture/batch8b-command-contract-matrix.csv`**: Full command contract specifications for all operations in scope (request/response envelopes, failure modes, error keys, history impact, and caller verification).
3. **`docs/architecture/batch8b-failure-atomicity-tests.md`**: Specification and invariants for failure atomicity test suite.
4. **`docs/architecture/batch8b-implementation-evidence.log`**: Complete execution traces for baseline, implementation, and final verification.
5. **BookStack Documentation**: Remediation documentation published to Book ID 353 (Page 447).

---

## 6. Conclusion and Next Steps

Batch 8B has restored strict Go engine authority across all five targeted P1 areas without introducing regressions into the verified Stage 15 user experience. All remaining P2 and P3 audit findings (`A8A-002`, `A8A-003`, `A8A-006`, `A8A-007`, `A8A-008`, `A8A-011`, and `A8A-012`) are scheduled for remediation in Batch 8C.
