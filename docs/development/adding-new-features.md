# Adding New Features

## 1. Respect Approved Phase Boundaries

Before implementing any new feature, verify that it belongs to the currently approved development phase in [`AGENTS.md`](../../AGENTS.md):
- **Phase 1:** Architectural separation (`UI → AppCoordinator → Operational`), preserving existing UI and behaviour.
- **Phase 2:** Standardized Component APIs and central operational **Shape Registry**.
- **Phase 3:** Blender-style workspace layout (vertical icon rails, sliding drawers, maximized stage).
- **Phase 4:** Context-sensitive floating property inspectors.
- **Phase 5:** End-to-end integration and regression testing.

Do not prematurely introduce features from a later phase while working on an earlier phase.

---

## 2. Step-by-Step Feature Workflow

When adding a new feature or property:

1. **Layer 3 — Operational State & SVG Builder First:**
   - Add the property default and validation to the owning operational module (`SceneState`, `DiagramNodes`, `DataFlows`, `Glows`, `Ripples`, `NodePresets`, or `Effects`).
   - Ensure `getState()` and `setState(data)` include the property with a safe backward-compatible fallback for older saved projects (`v1.2.0`).
   - Implement the SVG generation logic inside `injectIntoSVG` or `Effects.build` with zero DOM queries.
2. **Layer 2 — Coordination (`AppCoordinator`):**
   - If the feature involves selection, placement reticles, or cross-module updates, wire it through `AppCoordinator`.
3. **Layer 1 — UI Presentation:**
   - Bind any new HTML controls in the module's UI `init()` method.
   - If a new global canvas/effect control is added, register its ID in `HistoryManager.trackedControlIds` and `SceneState`.
   - Trigger `AppCoordinator.requestRender()` and `AppCoordinator.recordHistoryImmediate()` / `recordHistoryDebounced(300)`.
4. **Tests & Documentation:**
   - Update `docs/modules/<module>.md` and `AI_GUIDE.md` if public interfaces changed.
   - Run `go vet ./...`, `go test -v ./...`, and `BUILD_ONLY=1 ./build_and_run.sh`.
