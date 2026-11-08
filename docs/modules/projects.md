# Module: `projects.js` (`window.ProjectManager`)

## 1. Purpose
`internal/web/static/js/projects.js` handles studio project serialization/deserialization (schema version `"1.2.0"`), communication with the Go SQLite REST API (`/api/export/projects*`), and the Project Library modal UI.

## 2. Responsibilities by Layer
- **Layer 3 (Operational Serialization & REST Client):**
  - `serializeStudioState()` — Produces a schema `1.2.0` JSON string from `SceneState` / `ControlStateAdaptor`, `NodePresets.getState()`, `DiagramNodes.getState()`, `DataFlows.getState()`, `Glows.getState()`, and `Ripples.getState()`. Contains zero direct `document.getElementById` calls (all legacy fallbacks removed in Stage 2.6, resolving `ARCH-04` to PASS).
  - `applyStudioState(schemaJsonStr, options = { coordinate: true })` — Restores `SceneState`, DOM controls (via `ControlStateAdaptor.syncToDOM()`), and all component operational states with backward-compatible defaults, and resets `HistoryManager`. Contains zero direct presentation calls and zero direct DOM queries. Direct callers coordinate via default `options.coordinate !== false`.
  - Pure REST client methods: `fetchProjectsList()`, `fetchProjectById(id)`, `postSaveProject(payload)`, `postDeleteProject(id)`.
- **Layer 1 (Project Library Modal UI & Workflow Coordination):**
  - Binds `#btnOpenProjectsModal`, `#btnQuickSaveProject`, `#btnCloseProjectsTop`, `#btnCloseProjectsBottom`, `#btnSaveProjectOverwrite`, `#btnSaveProjectAsNew`, `#btnNewBlankProject`, `#projectSearchInput`, `Ctrl/Cmd+S` shortcut, and renders `#projectsListContainer`.
  - `loadProject(id)` — Sequences operational restoration first, project metadata update second, and `AppCoordinator.coordinatePostRestore({ source: 'project', projectId: id })` third.
  - `resetToNewProject()` — Resets operational states, updates metadata, and invokes `AppCoordinator.coordinatePostRestore({ source: 'new_project' })`.

## 3. Public Interface (`window.ProjectManager`)
- **Operational API:**
  - `serializeStudioState()`
  - `applyStudioState(schemaJsonStr, options)`
  - `fetchProjectsList()` / `fetchProjectById(id)` / `postSaveProject(payload)` / `postDeleteProject(id)`
  - `escapeHTML(str)`
- **UI & Compatibility API:**
  - `init()`
  - `openModal()` / `closeModal()`
  - `setStatusMessage(msg, isError)` / `updateHeaderBadge()`
  - `refreshProjectsList()` / `renderProjectsList()`
  - `quickSave()` / `saveProject(saveAsNew, silentQuickSave)`
  - `loadProject(id)` / `deleteProject(id)` / `resetToNewProject()`

## 4. Dependencies
- Uses `window.SceneState`, `window.ControlStateAdaptor`, `window.AppCoordinator`, `window.HistoryManager`, `window.NodePresets`, `window.DiagramNodes`, `window.DataFlows`, `window.Glows`, and `window.Ripples`.
