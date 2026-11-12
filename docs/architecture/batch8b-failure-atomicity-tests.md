# Batch 8B — Failure Atomicity and Rejection Verification Suite

**Project:** SVG Animator Studio  
**Batch:** Batch 8B — Authoritative State, Strict Command Contracts and Atomic Commit/Hydration  
**Starting Commit:** `94bf3986f883850ab85fc05050d7063dbbe1d9fa`  
**Test Harness Location:** `scripts/regression-harness.js` (Scenario 71, Tests 1–6)  
**Go Unit Test Suites:** `pkg/engine/scene/image_test.go`, `pkg/engine/protocol/commands_test.go`  

---

## 1. Overview and Objectives

Batch 8B remediates five critical P1 architectural findings identified in the Batch 8A audit (`A8A-001`, `A8A-004`, `A8A-005`, `A8A-009`, and `A8A-010`). A primary requirement of this remediation is **strict failure atomicity**:

1. **Rejection Safety:** If an operation is rejected by the Go engine or validation gates, no partial mutation, half-applied state, or optimistic UI changes may remain.
2. **History Isolation:** Rejected operations must never create undo/redo history entries.
3. **Selection Invariance:** If a requested selection change is rejected by Go, the previous active selection and multi-selection must remain intact without desynchronisation.
4. **Composition Atomicity:** Complex composite actions like Image Bake (`Image.Bake`) and Crop Commit (`Crop.Commit`, `BackgroundCrop.Commit`) must execute as atomic transactions in Go—either succeeding fully or failing completely without corrupting canvas or image state.
5. **Read-Only Hydration:** Visual hydration of presentation state (e.g. background photo DOM wrappers) must never invoke Go state mutating commands or advance the scene revision counter.

This document describes each test case implemented in Scenario 71 and the Go test suites, detailing the failure injection mechanism, expected invariant, and verification output.

---

## 2. Test Case Specifications

### Test 1: A8A-001 Read-Only Presentation Hydration
- **Objective:** Verify that visual hydration (`hydrateLoadedPhoto`) updates the presentation state and DOM without calling the WebAssembly bridge or advancing Go scene revisions.
- **Finding:** A8A-001 (Hydration of photo in presentation layer re-dispatched `SetLoadedPhoto` to Go, triggering unnecessary revisions and mutation loops).
- **Implementation:**
  - `window.hydrateLoadedPhoto(photoObj)` introduced in `scene-state.js` and `app.js`.
  - Historical callers in `history.js`, `projects.js`, and `engine-bridge.js` converted from `setLoadedPhoto` to `hydrateLoadedPhoto`.
- **Test Procedure:**
  1. Record Go scene revision before hydration via `EngineBridge.dispatch('Scene.GetState', {})`.
  2. Record `HistoryManager.undoStack.length`.
  3. Call `window.hydrateLoadedPhoto(samplePhoto)` repeatedly (3 iterations).
  4. Query Go scene revision and history stack length.
- **Verification Invariant:**
  - `revAfterHydrate === revBeforeHydrate`
  - `HistoryManager.undoStack.length === historyLenBeforeHydrate`
- **Result:** **PASS** (Scenario 71, Test 1).

---

### Test 2: A8A-004 Move Selected Nodes Failure Contract and History Invariant
- **Objective:** Ensure that when an object move command is rejected (e.g., node locked or bridge failure), `AppCoordinator.moveSelectedNodes` returns `false` and suppresses history recording.
- **Finding:** A8A-004 (False-success command handling in `AppCoordinator.moveSelectedNodes` unconditionally returning `true` and recording undo history even when Go rejected the transformation).
- **Implementation:**
  - `AppCoordinator.moveSelectedNodes(dx, dy)` checks `res && res.success !== false` for both `Group.Move` and individual `Node.Update` dispatches. Returns `false` if any dispatch fails or if selected nodes are locked.
  - `app.js` checks return boolean before calling `recordHistoryDebounced()`.
- **Test Procedure:**
  1. Create a test node (`text: 'LockedNode'`).
  2. Lock the node via `LayerManager.setLocked('node', id, true)`.
  3. Select the locked node from the layers list (`{ source: 'layers_list' }`).
  4. Record `HistoryManager.undoStack.length`.
  5. Attempt movement: `const res = window.AppCoordinator.moveSelectedNodes(10, 10)`.
- **Verification Invariant:**
  - `assert.strictEqual(res, false)`
  - `assert.strictEqual(HistoryManager.undoStack.length, historyLenBeforeMove)`
- **Result:** **PASS** (Scenario 71, Test 2).

---

### Test 3: A8A-009 Go-Authoritative Selection Rejection
- **Objective:** Verify that selection changes must be validated and accepted by the authoritative Go engine before committing local coordinator state or firing selection events. If rejected, prior selection is preserved.
- **Finding:** A8A-009 (Optimistic selection mutations where JS updated internal selection state before confirming acceptance with Go).
- **Implementation:**
  - `AppCoordinator.selectObject`, `_addToSelectionInternal`, `_toggleObjectSelectionInternal`, and `selectGroup` now invoke `window.EngineBridge.setSelection(type, id)` *before* mutating coordinator internal collections (`selectedObject`, `multiSelection`).
  - If Go returns `success: false` or error, the mutation is aborted, `false` is returned, and prior selection is preserved.
- **Test Procedure:**
  1. Select a valid node (`ValidNode`, id: `s71ValidNode.id`).
  2. Verify active selection is `s71ValidNode.id`.
  3. Attempt to select a non-existent object: `window.AppCoordinator.selectObject('node', 'node-999999')`.
- **Verification Invariant:**
  - `assert.strictEqual(selectBogusRes, false)`
  - `assert.strictEqual(AppCoordinator.getActiveSelection().id, s71ValidNode.id)` (prior selection preserved).
- **Result:** **PASS** (Scenario 71, Test 3).

---

### Test 4: A8A-010 Atomic Image Bake Failure Rejection
- **Objective:** Verify that an invalid or rejected Bake operation (e.g. attempting to bake a locked image object) fails atomically without deleting the image object or modifying the background photo.
- **Finding:** A8A-010 (Non-atomic Crop Commit and Image Bake operations where JS deleted images or modified DOM before confirming Go persistence).
- **Implementation:**
  - `pkg/engine/scene/image.go`: `s.BakeImage(imageID, mode, bakedData, canvasW, canvasH)` enforces strict validation (image existence, lock status, non-empty baked payload).
  - If locked, returns `fmt.Errorf("cannot bake locked image %s", imageID)` and makes zero state mutations.
  - `app.js:executeBakeImage` calls `EngineBridge.bakeImage(...)` and evaluates `res && res.success` before updating DOM or deleting local objects.
- **Test Procedure:**
  1. Create an image object (`B8 Locked Image`).
  2. Lock the image: `LayerManager.setLocked('image', img.id, true)`.
  3. Record loaded background photo via `getLoadedPhoto()`.
  4. Call `executeBakeImage(img, 'remove')`.
- **Verification Invariant:**
  - `assert.ok(ImageObjects.getImage(img.id))` (image must NOT be deleted).
  - `assert.deepStrictEqual(getLoadedPhoto(), bgBeforeBake)` (background photo must remain unchanged).
- **Result:** **PASS** (Scenario 71, Test 4).

---

### Test 5: A8A-010 Atomic Image Bake Success
- **Objective:** Verify that a valid Bake operation atomically commits the baked background and applies the requested lifecycle mode (`'remove'` or `'keep'`) in a single Go transaction.
- **Test Procedure:**
  1. Unlock the image: `LayerManager.setLocked('image', img.id, false)`.
  2. Call `executeBakeImage(img, 'remove')`.
  3. Verify image object deletion and background photo update.
- **Verification Invariant:**
  - `assert.strictEqual(ImageObjects.getImage(img.id), null)`
  - `assert.ok(getLoadedPhoto())`
  - `assert.strictEqual(getLoadedPhoto().filename, 'baked_background.png')`
- **Result:** **PASS** (Scenario 71, Test 5).

---

### Test 6: A8A-005 Project Restore and Scene Sync Isolation
- **Objective:** Verify that calling `triggerRender()` or restoring a project does not execute unconditional scraping or advance the Go scene revision.
- **Finding:** A8A-005 (Unconditional scene synchronization where JS scraped DOM/arrays and pushed state to Go).
- **Implementation:**
  - In `projects.js:applyStudioState`, an explicit project snapshot is constructed and synced once via `syncScene(projectSnapshot)` instead of scraping DOM.
  - Presentation rendering calls `triggerRender()` without triggering `syncScene()`.
- **Test Procedure:**
  1. Query Go scene revision: `revBeforeRestore = EngineBridge.dispatch('Scene.GetState', {}).revision`.
  2. Call `window.triggerRender()`.
  3. Query Go scene revision: `revAfterRender = EngineBridge.dispatch('Scene.GetState', {}).revision`.
- **Verification Invariant:**
  - `assert.strictEqual(revAfterRender, revBeforeRestore)`
- **Result:** **PASS** (Scenario 71, Test 6).

---

## 3. Go Engine Unit & Race Test Suite

In addition to harness integration testing in `scripts/regression-harness.js`, the Go engine was augmented with atomic test coverage:

1. **`pkg/engine/scene/image_test.go:TestBakeImageAtomic`**:
   - Tests successful image baking with `'remove'` mode (verifying image is removed from `s.Images`, photo is updated with baked data and dimensions, and revision increments exactly once).
   - Tests successful image baking with `'keep'` mode (verifying image remains present in `s.Images` and photo is updated).
   - Tests rejection when image ID does not exist (`image not found: non-existent`).
   - Tests rejection when image is locked (`cannot bake locked image img-locked`), verifying that neither `s.Images` nor `s.Photo` is altered.
   - Tests rejection when baked data is empty (`baked data cannot be empty`).
2. **`pkg/engine/protocol/commands_test.go:TestDispatchImageBakeProtocol`**:
   - Tests command dispatch via `protocol.DispatchCommand(s, "Image.Bake", ...)` with JSON payloads.
   - Verifies response envelope `{ success: true, ... }` and typed error envelopes on validation failure.
3. **Race Condition Verification**:
   - Verified via `go test -race -count=1 ./pkg/engine/scene/...` (PASS, 0 race warnings).

---

## 4. Test Execution Summary

| Test Suite / Script | Target Scope | Status | Notes |
|:---|:---|:---:|:---|
| `go test ./pkg/engine/scene/...` | `TestBakeImageAtomic`, locks, state transitions | **PASS** | Exit code 0, 0.008s |
| `go test -race ./pkg/engine/scene/...` | Thread safety, concurrency | **PASS** | Exit code 0, 1.030s |
| `go test ./pkg/engine/protocol/...` | `Image.Bake` protocol envelope | **PASS** | Exit code 0, 0.010s |
| `scripts/regression-harness.js` | Scenarios 1–71 (Scenario 71 Tests 1–6) | **PASS** | Exit code 0 |
| `scripts/verify-architecture.sh` | ARCH-01 – ARCH-10 Layer boundaries | **PASS** | Exit code 0 |
| `scripts/verify-runtime.sh` | RUN-01 – RUN-07 Studio runtime & DB | **PASS** | Exit code 0, DB unchanged |
