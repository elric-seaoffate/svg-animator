# Module: `projects.js` (`window.ProjectManager`)

## 1. Purpose
`internal/web/static/js/projects.js` handles studio project serialization/deserialization (schema version `"1.2.0"`), communication with the Go SQLite REST API (`/api/export/projects*`), thumbnail rasterization, and the Project Library modal UI.

## 2. Responsibilities by Layer
- **Layer 3 (Operational Serialization & REST Client):**
  - `serializeStudioState()` — Produces a schema `1.2.0` state object from `SceneState` / `ControlStateAdaptor`, `NodePresets.getState()`, `DiagramNodes.getState()`, `DataFlows.getState()`, `Glows.getState()`, and `Ripples.getState()`.
  - `applyStudioState(state)` — Restores `SceneState`, DOM controls, and all component operational states with backward-compatible defaults.
  - Pure REST client methods: `fetchProjectsList()`, `fetchProjectById(id)`, `postSaveProject(payload)`, `postDeleteProject(id)`.
- **Layer 1 (Project Library Modal UI):**
  - Binds `#btnOpenProjects`, `#btnCloseProjectsModal`, `#btnSaveCurrentProject`, `#btnNewBlankProject`, `#projectNameInput`, and renders `#projectLibraryGrid`.

## 3. Public Interface (`window.ProjectManager`)
- **Operational API:**
  - `serializeStudioState()`
  - `applyStudioState(state)`
  - `fetchProjectsList()` / `fetchProjectById(id)` / `postSaveProject(payload)` / `postDeleteProject(id)`
  - `generateThumbnailDataUrl()`
- **UI & Compatibility API:**
  - `init()`
  - `openModal()` / `closeModal()`
  - `loadProjectList()`
  - `saveCurrentProject(overwriteId)`
  - `loadProject(id)`
  - `deleteProject(id)`
  - `resetToBlankProject()`
  - `showToast(msg, isError)`

## 4. Dependencies
- Uses `window.SceneState`, `window.ControlStateAdaptor`, `window.AppCoordinator`, `window.HistoryManager`, `window.NodePresets`, `window.DiagramNodes`, `window.DataFlows`, `window.Glows`, and `window.Ripples`.
