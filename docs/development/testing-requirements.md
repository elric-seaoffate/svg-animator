# Testing and Verification Requirements

## 1. Automated Go Build & Test Suite

Before committing any change, run the full verification suite from `/root/projects/svg-animator`:

```bash
# 1. Static analysis
go vet ./...

# 2. Automated unit & integration tests (SQLite CRUD, REST APIs, embedded static assets)
go test -v ./...

# 3. Embedded binary build verification
BUILD_ONLY=1 ./build_and_run.sh
```

### Critical Rule for Database Testing
- **Never** run tests or `sqlite3` CLI commands directly against the repository's tracked `./studio_library.db` file (doing so triggers WAL checkpoints that modify `studio_library.db-shm` and `studio_library.db-wal`).
- Always use `t.TempDir()` in Go tests (`db.InitDB(t.TempDir())`) or a temporary `-data-dir` in `/tmp`.

---

## 2. Architectural & Functional Verification Checklist

Every Phase 1 architectural change must verify:

1. **Layer Separation:**
   - Operational methods (`create*`, `update*`, `delete*`, `getState`, `setState`, `injectIntoSVG`, `buildRenderState`, `buildFullSVG`, `evaluateSMILAtTime`) contain zero `document.getElementById` calls.
2. **Embedded Static Server Integrity:**
   - Every `<script src="js/...">` referenced in `internal/web/static/index.html` exists in the embedded filesystem and is served with `HTTP 200` by `internal/web/server.go`.
3. **History & Persistence Compatibility:**
   - All 95 `HistoryManager.trackedControlIds` are preserved.
   - Project `schema_json` version `"1.2.0"` round-trips cleanly through `ProjectManager` and SQLite (`SaveProject`, `GetProject`, `ListProjects`, `DeleteProject`).
4. **Object & SVG Output Parity:**
   - Nodes (`DiagramNodes`), Presets (`NodePresets`), Flows (`DataFlows`), Glows (`Glows`), Ripples (`Ripples`), Optical filters & 3D frames (`Effects`), and Stage snapping/zooming (`Stage`) preserve all existing properties and SVG output structure.
