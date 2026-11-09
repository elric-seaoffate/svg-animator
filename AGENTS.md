# SVG Animator Studio — Project-Wide AI Development Rules

## 1. Purpose and authority

You are an AI development agent working on **SVG Animator Studio**.

This file defines the permanent development rules, architectural principles, and working practices for this project.

These instructions apply to all development tasks, including:

- Bug fixes
- Refactoring
- New features
- UI development
- Architecture changes
- API development
- Performance improvements
- Testing
- Documentation
- Database and project-format changes

These rules apply regardless of which AI coding assistant is working on the project.

### Instruction hierarchy

Use the following order when determining what to do:

1. **Project-wide rules (`AGENTS.md`):** Defines permanent project-wide rules, safety constraints, and architectural direction.
2. **Additional agent rules (`.agents/rules/`):** More specific project rules, where present.
3. **Architecture & development guide (`AI_GUIDE.md`):** When present, describes the actual implemented architecture and development guidance.
4. **Task-specific instructions:** The current task-specific prompt defines the scope of the current task.
5. **Existing project documentation:** Detailed documentation in `docs/` and `README.md`.
6. **Existing implementation:** Established conventions in the actual codebase.

A task-specific prompt defines what work to perform, but it must **not** silently override the project safety, security, compatibility, architectural, or repository-protection rules in this file.

If instructions conflict, stop, explain the conflict clearly, and ask for clarification before proceeding with potentially destructive changes. Do not silently disregard these rules.

### AI agent startup procedure

At the beginning of each new task or session:

1. Read `AGENTS.md`.
2. Read `AI_GUIDE.md` if it exists.
3. Read any applicable additional agent rules (such as `.agents/rules/` or `.github/agents/`).
4. Inspect the current Git branch (`git branch --show-current`) and working tree status (`git status`).
5. Inspect the relevant implementation files before proposing or making changes.
6. Do not assume that previous conversation context is still available or that previous work was completed—always verify against the current repository state.

---

## 2. Project identity, current state, and development roadmap

**SVG Animator Studio** is an SVG-based diagram creation, network topology, and photo animation studio. It is built as a self-hosted **Go** backend and CLI tool (`cmd/svg-animator/`, `internal/`) that embeds a vanilla **HTML/CSS/JavaScript** frontend (`internal/web/static/`) via `//go:embed`.

### Current implemented baseline (as of v1.1.x)

The application currently consists of:

- **Go Backend & CLI** (`cmd/svg-animator/main.go`, `internal/`):
  - Embedded HTTP studio server and REST API (`internal/web/server.go`).
  - Local SQLite persistence via `modernc.org/sqlite` (`internal/db/sqlite.go`, `studio_library.db`) storing `projects` (with `schema_json` version `1.2.0`) and `assets`.
  - Backend SVG/HTML template generation and optical/camera effect pipelines (`internal/generator/`, `internal/effects/`).
  - Headless Chromium (`chromedp`) and FFmpeg multi-frame bitmap/video rasterization (`internal/rasterizer/rasterizer.go`).
- **Frontend Web Studio** (`internal/web/static/`):
  - Single-page 3-column studio layout (`index.html`, `css/style.css`, `css/export-modal.css`).
  - Vanilla JavaScript modules attached to `window`:
    - `app.js` — Main initialization, UI accordions, form bindings, keyboard shortcuts, and master SVG preview compilation (`window.triggerRender`).
    - `stage.js` (`window.Stage`) — Interactive stage viewport, zoom/pan, grid snapping, reticle placement, and drag handling.
    - `nodes.js` (`window.DiagramNodes`) — Diagram shapes, text, selection, and SVG node rendering.
    - `presets.js` (`window.NodePresets`) — Shape preset attributes and batch application.
    - `flows.js` (`window.DataFlows`) — Connectors, Bezier/orthogonal routing, and animated payloads.
    - `glows.js` (`window.Glows`) — Pulsating hotspots, custom graphics, and radar pings.
    - `ripples.js` (`window.Ripples`) — Refractive water ripple displacement effects.
    - `effects.js` (`window.Effects`) — Client-side SVG filter, camera rig, and 3D mitered frame builders.
    - `history.js` (`window.HistoryManager`) — Snapshot-based undo/redo stack (`maxDepth: 50`).
    - `projects.js` (`window.ProjectManager`) — Project serialization/deserialization and `/api/projects` integration.
    - `export-modal.js` & `still-export-modal.js` (`window.StillExportStudio`) — Animated (WebP, APNG, MP4 with audio) and still/print (PNG, WebP, JPEG, SVG, HTML) export studios.

In the current baseline, frontend modules combine UI event listeners, direct DOM queries (`document.getElementById`), state mutation, and SVG generation within the same objects.

### Intended long-term objectives and development roadmap

The long-term objective is to evolve SVG Animator Studio into a well-structured, modular application with a clear separation between its user interface and its underlying operational functionality, while maintaining accurate documentation (`AI_GUIDE.md`, `docs/`, and BookStack logs) so future AI assistants and human developers can understand and extend the project reliably.

The modernisation roadmap is structured into strict phases:

- **Phase 1 — Architectural separation**
  - Separate UI presentation from application coordination and operational functionality.
  - Keep the existing UI visually and behaviourally unchanged.
  - Preserve existing functionality, DOM input IDs, history, persistence, and compatibility.
  - Do not introduce the redesigned workspace or new UI layouts.
- **Phase 2 — Component APIs and Shape Registry**
  - Convert operational component functionality into complete, consistent, well-defined public APIs.
  - Introduce the central operational **Shape Registry** and reusable SVG shape/component definitions.
  - Keep UI concerns strictly out of operational modules.
- **Phase 3 — Workspace redesign**
  - Introduce the **Blender-style workspace layout** (vertical icon rails, configurable sliding side drawers, and a maximized central stage).
- **Phase 4 — Contextual property inspectors**
  - Introduce **context-sensitive floating property popups and inspectors** connected to the established component APIs.
- **Phase 5 — Integration and regression testing**
  - Verify the integrated architecture and all existing functionality end-to-end (rendering, animations, presets, undo/redo, project save/load, SQLite persistence, keyboard shortcuts, and still/video exports).

### Strict phase boundaries

These phases define architectural and product boundaries, not permission to implement all of them in a single task.

Only implement features that belong to the current task and approved development phase. **Do not implement features from later phases while working on an earlier phase unless explicitly instructed.**

---

## 3. Understand before changing

Never assume you understand the application simply because you have inspected one or two files.

Before modifying existing functionality:

- Inspect the relevant source files (both frontend JS/HTML/CSS and backend Go where applicable).
- Read the relevant project documentation.
- Trace how the functionality is called.
- Identify dependencies and side effects across `window.*` globals and DOM elements.
- Identify which other features could be affected.
- Understand how state, history (`HistoryManager`), persistence (`ProjectManager` / SQLite), and rendering (`triggerRender`) interact.
- Identify existing compatibility requirements.
- Determine how the change can be tested.

For changes involving shared architecture or core functionality, inspect the wider application before editing.

Do not make assumptions about:

- What a function or module does based solely on its name or filename.
- Whether a module is independent.
- Whether an existing API or global method can be changed safely.
- Whether a DOM element or input ID is unused (remember that `HistoryManager.trackedControlIds`, `ProjectManager`, and `app.js` rely on exact DOM IDs).
- Whether a state variable can be removed.
- Whether a feature is obsolete.

Search for all usages before changing or removing functions, properties, event handlers, DOM IDs, or public interfaces.

If something is unclear, investigate it or ask before making a potentially breaking decision.

---

## 4. Architecture principles

The frontend application must progressively move towards three clearly separated layers.

### Layer 1: UI presentation

Responsible for:

- HTML and CSS (`index.html`, `css/`).
- DOM elements, panels, drawers, modals, and toolbars.
- User interaction and event listeners.
- Form inputs, sliders, pickers, and checkboxes.
- Visual selection indicators and stage overlays.
- Property inspectors.
- Displaying application state.
- Translating user interaction into application commands.

The UI must not directly manipulate internal operational data.

The UI must not contain the underlying implementation of shapes, effects, animation, or SVG generation.

### Layer 2: Application coordination

Responsible for:

- Receiving UI commands.
- Coordinating application operations across modules.
- Managing selection and active objects.
- Coordinating history operations (`HistoryManager`).
- Managing application state transitions.
- Coordinating updates between modules.
- Triggering rendering and UI notifications.
- Enforcing application-level rules.

This layer connects the UI with the operational functionality.

### Layer 3: Operational functionality

Responsible for:

- Creating, reading, updating, and deleting objects (nodes, flows, glows, ripples, presets).
- Shape geometry and coordinate calculations.
- SVG construction and filter/effect definitions.
- Animation calculations.
- Visual effects and camera transforms.
- Data transformations.
- Component-specific functionality.
- Serialization and deserialization.
- Operational validation.

Operational modules must not depend on the presentation layer.

### The fundamental rule

`Go Engine (Authoritative)  ──►  WASM Bridge  ──►  JavaScript Browser Adapter  ──►  Browser SVG Engine`

**Go is the authoritative application engine. JavaScript is a browser adapter and SVG presenter.**

All future features must follow this rule unless there is an explicitly documented browser-specific reason not to.

#### Target ownership

1. **Go engine (`pkg/engine/`, `internal/`):**
   - Scene and object data models
   - Object creation, update, and deletion operations
   - Geometry, path routing, and bounding box math
   - Animation timelines, duration, and frame steps
   - Interpolation and easing calculations
   - Connector flow calculations and waypoint routing
   - Glow and hotspot pulse/radar calculations
   - Ripple refraction and wave displacement calculations
   - Camera effect calculations (Ken Burns, drift, tilt)
   - Object constraints and operational validation
   - Scene serialization models (including future native `.sva` format)
   - Export planning and frame sequencing
   - Deterministic scene evaluation at a requested timestamp
   - Authoritative state transitions and undoable commands

2. **JavaScript browser adapter (`internal/web/static/js/`):**
   - DOM access and tree synchronization
   - SVG element creation, update, and removal
   - Browser mouse, pointer, and keyboard event listening
   - Stage viewport transform, drag tracking, and scroll/zoom gestures
   - Focus, keyboard shortcuts, and accessibility (a11y) behavior
   - File drag-and-drop selection and blob downloads
   - ResizeObserver and window layout observation
   - `requestAnimationFrame` scheduling and playback loop coordination
   - Browser-native display and platform APIs
   - Forwarding user commands to the Go engine
   - Applying Go-generated presentation updates to the SVG DOM

3. **Browser SVG engine:**
   - Native rasterization and rendering of SVG geometry
   - Gradients, filters, masks, clip paths, and optical compositing
   - Native declarative SVG/CSS animations where appropriate

Do not put new object rules, effect algorithms, or scene-state business logic into JavaScript merely because it is convenient.

#### SVG and WebAssembly distinctions

- **SVG rendering is performed natively by the browser.** The Go/WASM engine evaluates scene behavior and generates scene descriptions, geometry attributes, or presentation patches; the JavaScript adapter applies those patches to the live SVG DOM.
- **Go/WASM is not automatically executable inside an independently opened SVG file.** Standalone SVG export must explicitly support declarative SVG/CSS animation (SMIL / CSS `@keyframes`) or provide another appropriate export strategy (such as pre-rendered MP4/WebP/APNG).
- The live studio must not rely on exporting a browser-specific Go/WASM runtime into a normal SVG document. Avoid promising universal SVG playback for effects that genuinely require an active application runtime.

#### Permanent rules for future features

- **Rule A — Extend existing Go components first:** Before implementing any feature:
  1. Identify the existing Go engine component responsible for it.
  2. Inspect that component's public contract.
  3. Extend the existing model and operations where appropriate.
  4. Reuse the established WASM bridge (`window.EngineBridge`).
  5. Add only the minimal JavaScript required for browser presentation.
  Do not invent a new parallel feature framework without documented justification.
- **Rule B — One source of truth:** There must not be competing independent JavaScript and Go implementations of the same feature. During migration, existing JavaScript implementations may temporarily act as compatibility fallbacks. Each migrated subsystem must have:
  - One clearly designated authoritative implementation.
  - A documented fallback strategy, if required.
  - Equivalence and parity tests.
  - A defined retirement plan for obsolete JavaScript logic.
- **Rule C — No direct browser dependencies inside the core:** The core Go engine (`pkg/engine/`) must not depend on HTML elements, browser event objects, CSS selectors, JavaScript DOM nodes, or browser-only APIs (`document`, `window`, `localStorage`). Use portable Go types for scene models and computations. Isolate browser/WASM-specific functionality in platform adapters.
- **Rule D — Avoid a giant bridge interface:** Create typed, stable, versioned commands and responses (`pkg/engine/protocol`). Prefer commands describing user intent (e.g. `CreateObject`, `UpdateObject`, `SelectObject`, `ClearSelection`, `EvaluateScene`, `GenerateFlowPath`, `ValidateScene`). Avoid exposing large collections of unrelated global JavaScript functions. Avoid passing live DOM objects across the WASM boundary. Use efficient structured JSON messages or typed buffers.
- **Rule E — No arbitrary per-object WASM calls on every frame:** Design frame evaluation so the engine can process scene state and animation time in suitably sized batches. Keep `requestAnimationFrame` scheduling in the browser adapter. Measure boundary overhead before deciding where to split computations. Do not automatically move trivial DOM operations into WASM.
- **Rule F — Every new feature needs an architecture decision note:** Before writing code, record:
  1. Which Go module owns the feature.
  2. Which existing model it extends.
  3. Which commands or calculations it adds.
  4. What browser adapter changes are unavoidable.
  5. How the new behavior is tested.
  6. Whether any obsolete JavaScript code can be retired.
  For ordinary additions, this should be a short implementation note, not a prolonged design ceremony.
- **Rule G — Do not rebuild the UI:** The existing responsive workspace and contextual editing behavior are approved. Preserve:
  - Right-click Properties for Nodes, Flows, Glows, and Ripples.
  - Right-click blank canvas to deselect.
  - Select None behavior (blank canvas click, Escape priority, sidebar deselect buttons).
  - Left-click placement and dragging.
  - Double-click editing.
  - Floating Properties editor.
  - 35/65 inspector proportions and 420px/460px drawer widths.
  - Node resize clipping fix.
  The migration must preserve functionality, not trigger another presentation redesign.

#### Standard development checklists

##### New feature checklist
1. [ ] Identify Go domain owner (`pkg/engine/`).
2. [ ] Define data models and validation in portable Go code.
3. [ ] Add unit tests in Go (`go test ./pkg/engine/...`).
4. [ ] Define versioned command/response in `pkg/engine/protocol`.
5. [ ] Expose through WASM bridge in `cmd/wasm/main.go` and `engine-bridge.js`.
6. [ ] Connect JavaScript adapter for DOM presentation and user events.
7. [ ] Verify JavaScript fallback behavior when WASM is unavailable.
8. [ ] Verify regression harness (`node scripts/regression-harness.js`).

##### Migration completion checklist
1. [ ] Go implementation covers 100% of the operational logic for the subsystem.
2. [ ] Automated Go tests verify boundary conditions, math, and data structures.
3. [ ] JavaScript adapter delegates directly to `window.EngineBridge`.
4. [ ] Numerical parity verified between Go and legacy JS calculations.
5. [ ] Legacy JavaScript operational code marked for retirement or safely retired.
6. [ ] Architecture checks and regression suite pass with zero regressions.

---

## 5. Module independence and APIs

All functional modules should progressively become independent, understandable components.

When developing or modifying a module:

- Give it a clearly defined responsibility.
- Define its public interface.
- Keep implementation details private where practical.
- Avoid unnecessary dependencies on other modules.
- Avoid direct access to another module's private internal state.
- Avoid circular dependencies.
- Pass required information through parameters or defined interfaces.
- Return useful results.
- Report errors in a consistent and understandable way.
- Document its public API.

Do not expose internal arrays, objects, or mutable state unnecessarily.

Where appropriate, provide methods for:

- Creating objects.
- Reading objects.
- Updating objects.
- Deleting objects.
- Validating data.
- Serializing data.
- Restoring data.
- Rendering or generating output.

These methods must reflect the actual responsibility of the component. Do not create artificial wrapper APIs that fail to improve separation or clarity.

### Compatibility

Before changing an existing public interface:

1. Find all callers across the codebase.
2. Identify the effects of the change.
3. Determine whether compatibility wrappers are appropriate during transition.
4. Update affected callers.
5. Update documentation.
6. Test the affected functionality.

Avoid breaking working functionality just to achieve a theoretically cleaner design.

---

## 6. State management

Application state must have clearly understood ownership.

Do not allow unrelated modules to maintain competing versions of the same state.

Avoid:

- Uncontrolled global variables.
- Direct manipulation of another module's internal state.
- Duplicate copies of important object data.
- Hidden side effects.
- UI form elements becoming the only source of truth for operational data.

The application coordination layer should manage communication between state owners.

Where practical, state changes should follow a predictable process:

1. Receive a command.
2. Validate the request.
3. Apply the operation.
4. Update relevant state.
5. Record the operation in history when appropriate.
6. Trigger rendering or other required updates.
7. Notify the UI.

Do not assume every intermediate operation needs to create a history entry. Follow the established history semantics (e.g., immediate recording on discrete changes vs. debounced recording on continuous slider/text inputs, and suppressing recording while `HistoryManager.isRestoring` is true).

---

## 7. History, persistence, and project compatibility

Undo/redo and project persistence are critical application capabilities.

Never make changes to object creation, modification, deletion, or restoration without considering their impact on history and persistence.

Preserve:

- Existing undo behaviour (`HistoryManager.undo()`).
- Existing redo behaviour (`HistoryManager.redo()`).
- Correct restoration of object state and ID counters (`nodesCounter`, `flowsCounter`, `glowsCounter`, `ripplesCounter`).
- Correct selection behaviour and UI synchronization after restoration.
- Correct handling of dependent objects (such as flows connected to nodes via `fromNodeId` / `toNodeId`).
- Existing project saving and loading behaviour (`ProjectManager.serializeStudioState()` / `applyStudioState()`).

Project persistence must remain reliable. Do not casually change:

- SQLite database schemas in `internal/db/sqlite.go` (`projects` and `assets` tables).
- REST endpoints in `internal/web/server.go` (`/api/projects`, `/api/render`, etc.).
- Project serialization format (`schema_json` structure and `version: "1.2.0"`).
- Tracked control IDs (`HistoryManager.trackedControlIds`).
- Existing saved data structures.
- Export payload formats.

Any necessary changes to data formats must be deliberate, documented, and tested, with backward-compatible migration or fallback logic so existing saved projects in `studio_library.db` remain loadable. Never discard existing project data to simplify implementation.

---

## 8. SVG, rendering, and animation

SVG generation and rendering are core operational responsibilities, not UI responsibilities.

When modifying SVG generation or rendering (either in frontend JS modules or Go packages `internal/generator/` and `internal/effects/`):

- Preserve existing SVG output structure where possible.
- Preserve object relationships (e.g., node coordinates and attached flow endpoints).
- Preserve SVG element IDs, `<defs>`, filters, gradients, and `url(#...)` references where required.
- Preserve SVG attributes, SMIL `<animate>` / `<animateMotion>` / `<animateTransform>` elements, and CSS keyframe animation behaviour.
- Avoid duplicate SVG elements or colliding `<defs>` IDs.
- Avoid unnecessary DOM reconstruction.
- Avoid introducing rendering side effects into unrelated modules.
- Ensure compatibility with both live browser preview and headless Chromium frame capture (`StillExportStudio` time-scrubbing and `internal/rasterizer/`).

When changing animation or effects, verify that the change does not unintentionally affect other animation systems. Test both individual functionality and its interaction with the wider application.

---

## 9. Shape Registry

The **Shape Registry** is a central part of the intended architecture (planned for Phase 2).

Note: At present, node shapes (`rounded`, `rect`, `pill`, `cylinder`, `diamond`, `hexagon`, `cloud`, `actor`, `note`, `callout`) are hardcoded inside `DiagramNodes` (`internal/web/static/js/nodes.js`) and `<select id="nodeShapeSelect">` in `index.html`.

When implemented in its approved phase, the Shape Registry will be an operational capability that provides a consistent way to discover and work with available shapes and their capabilities, including:

- Shape identifier and display name.
- Category and description.
- Default properties and available property definitions.
- Preview information.
- Creation or SVG builder functionality.
- Relevant metadata.

The UI should consume Registry information rather than maintain a separate, duplicated definition of available shapes.

**Do not implement or redesign the Shape Registry unless it is within the current approved task or development phase.**

---

## 10. User interface principles

The current UI is a 3-column studio layout with collapsible accordion panels (`leftPanel`, central stage, `rightPanel`) and modal dialogs for Project Library, Animated Export, and Still Export.

The future UI direction (planned for Phases 3 and 4) is a **Blender-inspired workspace** featuring:

- A maximized central working stage.
- Vertical icon rails and tool/object panels.
- Configurable sliding side drawers.
- Context-sensitive floating property inspectors.
- A consistent visual hierarchy and efficient access to frequently used tools.

The interface should be modular and consume application functionality through defined interfaces.

### Preserve existing functionality

Do not assume that architectural refactoring or a UI task permits the removal of existing functionality.

Before moving or replacing any control:

1. Identify what it does.
2. Identify its associated events and behaviour.
3. Identify its existing DOM input IDs.
4. Identify its relationship with `HistoryManager` and `ProjectManager`.
5. Ensure equivalent functionality remains available.

**Existing form input IDs must be preserved during architectural refactoring (Phase 1)** unless an approved change explicitly requires otherwise.

Do not redesign the interface or introduce visual changes during a task that is only intended to separate UI from operational functionality.

---

## 11. Code quality and conventions

Write code that is understandable and maintainable by both humans and AI coding assistants.

Requirements:

- **Technology stack:** Use Go (`1.20+` / `go.mod` toolchain) for backend/CLI code and vanilla JavaScript (ES6+), HTML5, and CSS3 for the embedded frontend.
- **Avoid Python in production code.**
- **Embedded assets:** Remember that `internal/web/server.go` embeds `internal/web/static/*` using `//go:embed`. Any new or modified frontend files must remain compatible with the embedded filesystem and `<script>` load order in `internal/web/static/index.html` (and must be compiled into the Go binary when testing the built executable).
- Follow existing language and formatting conventions (`gofmt` for Go; clean, readable 2-space indented JS/HTML/CSS) unless there is an approved reason to change them.
- Use descriptive variable and function names.
- Keep functions focused on a clear responsibility and avoid unnecessarily large functions.
- Avoid duplicated functionality and unexplained magic numbers or strings.
- Avoid unnecessary abstractions.
- Handle errors explicitly in both Go and JavaScript.
- Remove obsolete code only after verifying it is no longer used anywhere in the repository.
- Avoid leaving dead code, temporary debugging statements, or unfinished implementations.
- Add comments where they explain *why* something is done, not merely *what* the code does.
- Do not introduce a new frontend framework, external JS library, or complex build bundler without establishing a clear need and obtaining explicit approval.

---

## 12. Documentation requirements

Documentation is part of the implementation, not an optional activity after development.

Keep documentation accurate and aligned with the actual code.

### Current vs. target documentation structure

Currently, the repository contains `README.md`, deployment guides (`Linux_Binary_Deployment_Guide.md`, `Windows_Binary_Deployment_Guide.md`), and `docs/` (`project_structure.txt`, `release_notes.md`, `refactorPrompt.md`).

As architectural refactoring progresses, the project must progressively establish and maintain:

- `AI_GUIDE.md` — Concise starting point and architectural map for AI coding assistants.
- `docs/architecture/` — System design, application layers, data flow, dependency map, state management, and history/persistence.
- `docs/modules/` — Individual module responsibilities and implemented public interfaces.
- `docs/development/` — Coding conventions, module development guide, and testing guidance.
- `docs/decisions/` — Architecture Decision Records (ADRs) and their reasoning.

When changing functionality:

- Update relevant module and API documentation.
- Update architecture documentation if dependencies or responsibilities change.
- Update development instructions where necessary.
- Record significant architectural decisions.

**Never document an API, module, endpoint, or capability that does not exist. Never claim a feature is implemented when it is only planned.**

Clearly distinguish between:

- **Implemented**
- **Partially implemented**
- **Planned**
- **Deprecated**

Keep `AI_GUIDE.md` aligned with the real codebase when it is created or updated, and keep it concise enough to be a useful entry point, linking to detailed files under `docs/` rather than duplicating everything.

### BookStack Project Log

The BookStack integration is an intentional, permanent part of the SVG Animator Studio development workflow, established so AI development agents can maintain structured project documentation and logs alongside the repository. Do not remove or disable the BookStack integration.

Use the designated SVG Animator Studio **BookStack** book(s) (`https://notes.seaoffate.net/books/svg-animator-project-log`, Book ID `353`, Slug `svg-animator-project-log`) to record:

- Significant project milestones.
- Architectural decisions.
- Completed development phases.
- Refactoring progress.
- Testing results and verification reports.
- Important issues and outstanding work.

When working with BookStack:

1. **Inspect before writing:** Before creating or updating entries, inspect the existing BookStack book/chapter/page structure (`GET /api/books/353`) and follow its organisation.
2. **Avoid duplicates:** Update existing pages where appropriate and avoid creating unnecessary duplicate pages or books.
3. **Verify writes:** Always verify that BookStack API creates/updates succeeded (`HTTP 200`).
4. **Credential security:** Authentication credentials for the BookStack REST API (`BOOKSTACK_URL`, `BOOKSTACK_BOOK_ID`, `BOOKSTACK_BOOK_SLUG`, `BOOKSTACK_TOKEN_ID`, and `BOOKSTACK_TOKEN_SECRET`) are stored locally outside the repository in `/root/.config/svg-animator/bookstack.env` (permissions `0600`). Source that file when making API calls (`Authorization: Token ${BOOKSTACK_TOKEN_ID}:${BOOKSTACK_TOKEN_SECRET}`).
5. **Strict secret protection:** **Never** expose, display, print, or copy credential values in documentation, terminal output, Git commits, or reports. Do not change, regenerate, or relocate credentials without explicit approval.

---

## 13. Testing and verification

Never assume code works simply because it has been written or compiles.

Note: The repository currently has no automated `_test.go` or JavaScript unit test files. Building and verification rely on Go build checks (`go build ./...`, `go vet ./...`), running the server, and functional verification. Where practical, introduce targeted automated tests as modules are refactored.

Where relevant to the change, verify:

- Go compilation (`go build ./cmd/svg-animator` or `./build_and_run.sh` with `BUILD_ONLY=1`).
- Module functionality and API behaviour.
- Integration with other modules.
- UI interaction and browser console error checks.
- Object creation, selection, modification, and deletion (nodes, flows, glows, ripples).
- Presets (`NodePresets`).
- Undo and redo (`HistoryManager`).
- Project saving, loading, and SQLite persistence (`ProjectManager` / `studio_library.db`).
- Live SVG output and animation playback.
- Still-image exports (`StillExportStudio`) and animated video/bitmap exports (noting whether headless Chrome and FFmpeg are available in the environment).

Do not claim that tests passed unless they were actually executed.

If a test cannot be run, state clearly:

1. What could not be tested.
2. Why it could not be tested.
3. What verification remains necessary.

Do not conceal failures.

---

## 14. Git and change management

The self-hosted **Gitea** repository is the primary and authoritative source-control location for SVG Animator Studio. Always verify configured remotes (`git remote -v`) rather than assuming their existence or purpose (a secondary `github` remote is currently configured in this workspace).

Use Git carefully.

Before making changes:

- Check and report the current branch (`git branch --show-current`).
- Run and report `git status` to check the working tree state.
- Inspect existing uncommitted or untracked changes.
- Identify the current project baseline.
- Confirm that you are working on the intended branch.

Never overwrite the user's uncommitted work. Never discard changes simply because they are inconvenient. Never push, force-push, delete branches, or perform destructive Git operations without explicit approval.

Do not:

- Push (`git push`) without explicit approval when instructed to wait for review.
- Force-push (`git push --force`).
- Rewrite shared history.
- Reset the repository to an earlier state (`git reset --hard`).
- Delete branches without approval.
- Remove untracked files without approval.
- Overwrite existing backups or SQLite databases (`studio_library.db`).

Use a dedicated feature or refactoring branch for substantial development tasks where appropriate rather than committing large refactors directly to `main`, unless explicitly instructed otherwise. Make small, logical commits with meaningful messages.

Do not commit secrets, credentials, API keys, or private configuration. Do not put Gitea credentials, BookStack tokens, SSH private keys, or access tokens in source files, commit messages, or documentation.

Never assume that a local commit has been pushed to Gitea. Verify all Git operations explicitly.

---

## 15. Security and operational safety

Treat the development environment and project data carefully.

Do not:

- Expose credentials, passwords, SSH keys, or access tokens.
- Hardcode passwords or tokens in code, scripts, or documentation.
- Disable security controls to make a feature work.
- Execute destructive commands without understanding their consequences.
- Modify server configuration unnecessarily.
- Modify unrelated services running on the host/LXC.
- Change SQLite database contents (`studio_library.db`) without understanding the impact.

The development environment uses `code-server` and `Gitea`. Do not attempt to administer Gitea or code-server unless the task specifically requires it. Use the existing Git configuration and repository remotes.

---

## 16. Working with large codebases and AI context limits

SVG Animator Studio has over 12,000 lines of code across Go and frontend assets.

Do not attempt to understand or refactor the entire application by blindly loading every source file into a single context window.

Instead:

1. Start with `AGENTS.md` and `AI_GUIDE.md` (once created).
2. Read the relevant architecture and module documentation in `docs/`.
3. Identify the specific modules involved in the task.
4. Trace their dependencies.
5. Inspect the relevant source files selectively.
6. Expand the investigation only when dependencies require it.
7. Keep a written record of significant findings.
8. Update documentation so future sessions do not need to rediscover the same information.

Do not assume that previous conversation context is still available. Do not rely on undocumented knowledge from earlier AI sessions. The repository and its documentation must remain the source of truth.

When context becomes limited or a session reaches a checkpoint, create a concise handover containing:

- The task being performed.
- Work completed.
- Files changed.
- Decisions made.
- Tests performed and their results.
- Outstanding problems.
- Exact next steps.

---

## 17. Development workflow

For significant tasks, follow this workflow:

### Before implementation

1. Read `AGENTS.md` and `AI_GUIDE.md` (when present).
2. Read relevant architecture and module documentation.
3. Inspect the repository state (`git status`, branch).
4. Understand the existing implementation of the affected components.
5. Identify dependencies and risks.
6. Establish the scope of the task.
7. Propose an implementation plan before making broad changes.

### During implementation

1. Work in small, logical steps.
2. Make focused changes.
3. Preserve existing functionality and compatibility.
4. Follow the three-layer architecture principles.
5. Test as changes are made.
6. Update documentation alongside code.
7. Report significant discoveries or unexpected problems immediately.

### After implementation

1. Review all modified files (`git diff`, `git status`).
2. Check for accidental unrelated changes.
3. Run appropriate build and verification checks.
4. Verify important existing functionality.
5. Update repository documentation and log the update in the BookStack project log (`book_id: 353`, `slug: "svg-animator-project-log"`).
6. Summarise the completed work and list any outstanding issues.
7. Report the Git status and commit information accurately.

Do not perform a wholesale rewrite when incremental refactoring is possible.

---

## 18. Scope control and decision-making

Work only within the scope of the current task.

Do not:

- Add unrelated features.
- Redesign unrelated UI.
- Replace working functionality unnecessarily.
- Change technologies or add external dependencies without approval.
- Refactor unrelated modules simply because they appear untidy.
- Introduce speculative functionality from later phases.
- Make irreversible architectural decisions without documenting them.

When you discover an issue outside the task scope:

1. Record it.
2. Explain its potential impact.
3. Recommend whether it should be addressed now or later.

Do not silently expand the task.

If a significant decision has multiple viable approaches, explain the alternatives and recommend one before making an irreversible change. Prefer the simplest solution that supports the long-term architecture.

---

## 19. Communication and reporting

Communicate clearly, concisely, and accurately.

Before substantial changes, explain what you intend to change.

When reporting progress, always distinguish clearly between work that is:

- **Inspected**
- **Planned**
- **Implemented**
- **Tested**
- **Verified**
- **Committed**
- **Pushed**

Do not describe planned work as completed. Do not claim that an architecture is decoupled merely because files have been moved. Explain meaningful architectural changes and their consequences.

If something breaks or cannot be verified, report it immediately rather than hiding it or working around it without explanation. If you are uncertain, say so.

---

## 20. Final guiding principle

The primary objective is not simply to make SVG Animator Studio work today. It is to make the application progressively easier to understand, maintain, test, and extend.

Every significant change should move the project towards:

- Clear responsibilities.
- Independent operational modules.
- Well-defined APIs.
- Controlled state management.
- Reliable history and persistence.
- A modular UI.
- Accurate documentation.
- Predictable behaviour.
- Maintainability by both humans and AI coding assistants.

**Understand the existing application before changing it. Preserve working behaviour. Separate responsibilities properly. Document what actually exists. Test what you change.**

These principles apply to every future development task in SVG Animator Studio.
