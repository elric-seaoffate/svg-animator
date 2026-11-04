# Coding Conventions

## 1. Technology Stack & Tooling
- **Backend & CLI:** Go (`1.25.0` toolchain in `go.mod`), formatted with `gofmt` and checked with `go vet ./...`.
- **Frontend Studio:** Vanilla JavaScript (ES6+), HTML5 (`internal/web/static/index.html`), and CSS3 (`internal/web/static/css/`).
- **Embedded Assets:** All frontend assets live under `internal/web/static/` and are embedded into the Go binary via `//go:embed static/*` in `internal/web/server.go`.
- **No Unapproved Frameworks or Bundlers:** Do not add npm bundlers, React/Vue, or Python production scripts.

## 2. JavaScript Style & Naming Conventions
- **Indentation:** 2 spaces across JS, HTML, and CSS.
- **Global Namespace Pattern:** Modules attach a well-defined object to `window` (e.g., `window.SceneState`, `window.AppCoordinator`, `window.DiagramNodes`, `window.DataFlows`, `window.Glows`, `window.Ripples`, `window.NodePresets`, `window.Stage`, `window.Effects`, `window.HistoryManager`, `window.ProjectManager`, `window.StillExportStudio`).
- **Clear Section Headers:** Within each module file, clearly separate:
  1. **State & Configuration**
  2. **Layer 3: Operational API (Zero DOM Dependencies)**
  3. **Layer 1: UI Presentation & DOM Bindings**
- **Descriptive Naming:**
  - Operational CRUD methods use explicit verbs: `createNode`, `updateNode`, `deleteNode`, `getNode`, `getState`, `setState`.
  - Percentage coordinates use `Pct` suffixes (`xPct`, `yPct`, `startXPct`, `endXPct`) to distinguish them from pixel coordinates (`px`).
- **Error Handling:**
  - Guard all optional DOM lookups (`if (!el) return;`) in Layer 1 UI code.
  - Validate inputs in Layer 3 operational methods and return safe defaults (`null`, `false`, or empty arrays) rather than throwing uncaught exceptions during render loops.

## 3. HTML & DOM Conventions
- **Preserve Tracked Control IDs:** All 95 DOM input IDs in `HistoryManager.trackedControlIds` (plus `#chkAutoApplyPreset`) must remain intact so history snapshots and project serialization remain 100% compatible.
- **Paired Controls:** Slider (`*Slider`) and numeric (`*Num`) inputs must stay synchronized via `ControlStateAdaptor` and UI input listeners.
