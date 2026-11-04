# SVG Animator Studio — Phase 1: Architectural Refactoring and UI/Function Separation

## Your Role

You are acting as the lead software architect and senior JavaScript developer responsible for refactoring an existing application called SVG Animator Studio.

The existing application is stored in a self-hosted Gitea repository.

The application has been developed primarily with AI assistance, and the codebase has grown to a size that makes it increasingly difficult for AI coding assistants to understand, maintain and extend reliably.

Your task is to refactor the existing application into a clean, modular architecture that separates the user interface from the underlying application functionality.

This is the first stage of a larger modernisation project.

You must work carefully, incrementally and systematically. Preserving existing functionality is more important than introducing new functionality.

---

# 1. Overall Modernisation Plan

The project will follow this development sequence:

**Phase 0 — AI Development Infrastructure**
- Establish architectural documentation.
- Establish coding conventions.
- Establish module documentation standards.
- Establish API documentation standards.
- Establish development and testing procedures.

**Phase 1 — Architectural Separation**
- Separate UI presentation and interaction from operational functionality.
- Introduce a clear application coordination layer.
- Refactor existing modules to remove unnecessary DOM dependencies.
- Preserve existing application behaviour.
- Document the new architecture.

**Phase 2 — Complete Component APIs**
- Convert operational components into consistent, well-defined APIs.
- Establish consistent methods, events and data structures.
- Develop the Shape Registry as part of the node API.
- Document all public component APIs.

**Phase 3 — Blender-Style UI Redesign**
- Introduce vertical icon rails.
- Introduce sliding flyout drawers.
- Maximise the central canvas.
- Create the workspace controller.

**Phase 4 — Contextual Property Inspectors**
- Introduce floating contextual property windows.
- Allow objects to be edited directly from the canvas.
- Connect the inspectors to the established component APIs.

**Phase 5 — Integration and Regression Testing**
- Verify functionality, persistence, history, keyboard shortcuts and exports.

Your current assignment is **Phase 1 only**, together with the documentation and development infrastructure needed to support it.

Do not begin Phase 2, 3 or 4 implementation work unless explicitly instructed.

---

# 2. First: Understand the Existing Application

Before changing any code, inspect the complete Gitea repository.

Do not assume that previous architectural descriptions accurately represent every part of the current implementation.

Inspect the actual source code and establish:

- The current directory structure.
- Application entry points.
- JavaScript module loading and dependencies.
- How application state is managed.
- How DOM elements are accessed and manipulated.
- How event listeners are registered.
- How nodes, flows, glows and ripples are created and modified.
- How SVG generation and rendering work.
- How the stage and canvas are managed.
- How effects and animations work.
- How presets are applied.
- How undo and redo operate.
- How projects are saved and loaded.
- How SQLite persistence is implemented.
- How still-image and video exports work.
- How keyboard shortcuts are implemented.

Pay particular attention to:

- `app.js`
- `nodes.js`
- `flows.js`
- `glows.js`
- `ripples.js`
- `effects.js`
- `stage.js`
- `presets.js`
- `history.js`
- `projects.js`
- `index.html`
- `css/style.css`

Also inspect other files and modules that participate in these processes.

Do not limit your inspection to this list.

## Produce an initial architecture assessment

Before modifying code, document:

1. Existing application architecture.
2. Existing module responsibilities.
3. Dependencies between modules.
4. Which modules directly access the DOM.
5. Which modules combine UI and operational responsibilities.
6. How state currently flows through the application.
7. How history and persistence depend on existing structures.
8. Potential refactoring risks.
9. A proposed refactoring sequence.

Identify the existing public interfaces and data structures that must be preserved.

Do not invent functionality or assume that a module behaves in a particular way without inspecting its implementation.

---

# 3. Target Architecture

The objective is to establish three distinct architectural layers.

## A. UI Presentation Layer

The UI layer is responsible for how the user interacts with the application.

Responsibilities include:

- DOM elements and layout.
- Buttons, inputs, menus and controls.
- Event listeners for user interaction.
- Displaying application state.
- Updating controls when application state changes.
- Managing UI-specific state such as open panels and selected tools.

The UI layer must not directly manipulate operational component data.

It should communicate with the application through defined commands and interfaces.

The existing interface should remain visually unchanged during Phase 1.

## B. Application Coordination Layer

Introduce a clear application coordination layer between the UI and operational components.

This layer is responsible for:

- Receiving commands from the UI.
- Coordinating operations between functional components.
- Managing application-level selection state.
- Coordinating updates and rendering.
- Coordinating undo and redo operations.
- Coordinating project operations.
- Publishing application state changes and selection events.
- Providing a consistent interface for the UI to use.

For example, a UI control changing a node's fill colour should request an application operation rather than modifying the node directly.

Conceptually:

`updateSelectedNode({ fillColor: "#3388ff" })`

The application coordination layer should then coordinate the relevant node update, rendering and history operations.

Do not introduce unnecessary abstraction or a complicated framework. Use a straightforward architecture appropriate to the existing application.

## C. Operational Layer

The operational layer owns the application's actual functionality and data.

Responsibilities include:

- Data models and object state.
- Object creation, modification and deletion.
- Geometry and coordinate calculations.
- SVG generation.
- Rendering operations.
- Animation and effects.
- Presets and reusable configurations.
- Serialisation and deserialisation.
- Operational history integration.
- Project data operations.

Operational modules must not depend on specific UI elements, DOM IDs, panel layouts or presentation modules.

Where an operational module genuinely needs to interact with the SVG stage or rendering surface, provide an appropriate stage/rendering interface rather than allowing arbitrary UI dependencies.

---

# 4. Refactoring Requirements

Refactor the existing modules incrementally.

The purpose is to separate responsibilities, not to rewrite the entire application unnecessarily.

For each module:

1. Identify its existing responsibilities.
2. Identify which code belongs to UI presentation.
3. Identify which code belongs to operational functionality.
4. Identify dependencies on other modules.
5. Move or extract responsibilities into the appropriate layer.
6. Establish clear interfaces between the layers.
7. Preserve existing behaviour.
8. Update documentation.
9. Test the affected functionality.

## Important: Do not simply move all UI code into a new file

The objective is genuine separation of responsibilities.

For example, moving every event listener into `ui.js` while leaving the operational modules dependent on DOM elements does not achieve the required architecture.

Similarly, operational modules should not query form inputs to determine their data.

UI controls should display and submit data. Operational modules should own and manipulate the underlying data.

## Preserve compatibility

The following must continue working:

- Existing object creation and editing.
- Node selection and manipulation.
- Flow creation and routing.
- Glow and ripple functionality.
- Existing SVG rendering.
- Animation and playback.
- Presets.
- Undo and redo.
- Keyboard shortcuts.
- Project save and load.
- SQLite persistence.
- Existing saved project compatibility.
- Still-image exports.
- Video exports.

Preserve existing form input IDs and expected values during this phase wherever possible.

Do not change the existing UI layout.

Do not introduce the Blender-style interface.

Do not introduce floating property inspectors.

Do not add new shape types or other unrelated features.

---

# 5. Application State, History and Persistence

These are particularly sensitive areas of the application.

Before refactoring them, understand how they currently work.

## Application state

Establish clear ownership of operational state.

Avoid maintaining multiple independent copies of the same object data.

The application should have an identifiable source of truth for nodes, flows, glows and ripples.

UI controls should reflect that state rather than becoming alternative owners of it.

## History

Preserve the existing `HistoryManager` behaviour.

All meaningful operational changes must continue to be recorded correctly.

Avoid recording duplicate history entries when a single logical operation triggers multiple internal updates.

Undo and redo must restore the correct application state and update the UI accordingly.

## Projects and SQLite

Preserve the existing project serialisation format wherever possible.

Do not casually rename fields, change object structures or alter database schemas.

If a change to the data format is genuinely necessary, document the reason and implement a backward-compatible migration or conversion mechanism.

Existing projects must remain loadable.

---

# 6. Establish the Documentation Structure

Documentation is a required deliverable of this refactoring.

Create or update documentation inside the Gitea repository so that future developers and AI coding assistants can understand the architecture without having to analyse the entire source codebase.

Use Markdown files.

Create a structure along these lines, adapting it to the existing repository where appropriate:

```text
docs/
    architecture/
        overview.md
        application-layers.md
        data-flow.md
        dependency-map.md
        state-management.md
        history-and-persistence.md

    modules/
        app.md
        nodes.md
        flows.md
        glows.md
        ripples.md
        effects.md
        stage.md
        presets.md
        history.md
        projects.md

    development/
        coding-conventions.md
        module-development-guide.md
        testing-requirements.md
        adding-new-features.md

    decisions/
        ADR-001-architectural-separation.md
        ADR-002-application-coordination.md
        ADR-003-state-ownership.md
```

Only create documents that are relevant to the actual implementation.

Do not create documentation that describes functionality which has not been implemented.

## Required documentation

### `AI_GUIDE.md`

Create a master instruction file at the repository root.

It must explain:

- What SVG Animator Studio does.
- The architectural layers.
- Where modules belong.
- How modules communicate.
- Where application state is owned.
- How history works.
- How persistence works.
- How to develop new modules.
- How to test changes.
- Which architectural rules must not be violated.

This file will be supplied to future AI coding assistants as their primary project instruction.

### `architecture/overview.md`

Explain the overall application architecture and how its layers interact.

### `architecture/application-layers.md`

Describe the responsibilities of the UI, application coordination and operational layers.

Include examples of appropriate and inappropriate dependencies.

### `architecture/data-flow.md`

Explain how a typical user action moves through the application.

For example:

UI interaction → Application command → Operational component → State update → Rendering → History → UI notification.

Adjust this sequence to reflect the actual implementation.

### `architecture/dependency-map.md`

Document the relationships and dependencies between the actual modules.

### `architecture/state-management.md`

Document where operational state is owned, how it is updated and how the UI receives updates.

### `architecture/history-and-persistence.md`

Explain the existing history and persistence mechanisms and how they interact with the new architecture.

### Module documentation

Document each refactored module:

- Its responsibility.
- Its public methods and interfaces.
- Its dependencies.
- Its state ownership.
- Its events or notifications.
- Its interaction with history and persistence.
- Any compatibility considerations.

Document actual implemented methods, not proposed methods.

### `development/module-development-guide.md`

Explain how a future developer or AI assistant should create or modify a module without breaking the architectural separation.

### `development/testing-requirements.md`

Document how to test new and modified functionality.

---

# 7. Rules for AI-Assisted Development

The architecture must make future AI-assisted development easier and more predictable.

Establish these rules in `AI_GUIDE.md`:

1. Always inspect the relevant API and module documentation before changing code.
2. Do not assume that a method exists without checking the implementation.
3. Do not bypass the application coordination layer.
4. Do not access another component's private internal state.
5. Do not manipulate operational data directly from UI code.
6. Do not introduce DOM dependencies into operational modules.
7. Do not duplicate existing functionality.
8. Do not invent alternative state-management or history mechanisms.
9. Update documentation whenever a public interface or module responsibility changes.
10. Add or update tests for all meaningful functionality changes.
11. Prefer small, targeted changes over large rewrites.
12. Report missing functionality or architectural problems rather than creating undocumented workarounds.

Future AI coding assistants must be able to work on an individual module using its documentation and the relevant application interfaces, without needing to ingest the entire repository.

---

# 8. Git and Gitea Workflow

Use the existing Gitea repository as the source of truth.

Before making changes:

- Check the current branch.
- Check for uncommitted changes.
- Identify the current baseline.
- Do not overwrite or discard existing work.

Create a dedicated feature branch for the architectural refactoring if the repository workflow allows it.

Use small, logical commits.

Do not commit directly to the main branch unless explicitly instructed.

Each logical refactoring stage should be independently reviewable and, where possible, reversible.

Do not rewrite repository history.

Do not delete existing files until their functionality has been accounted for and their replacements have been tested.

---

# 9. Testing and Validation

Testing must happen throughout the refactoring, not just at the end.

Before changing code, establish what testing tools and existing tests are available.

Where practical, create baseline tests for existing behaviour before refactoring.

After each significant module change, test the affected functionality.

At the end of Phase 1, verify:

- The application starts successfully.
- Existing UI functionality remains available.
- Nodes can be created, selected, modified and deleted.
- Flows can be created, modified and deleted.
- Glows and ripples continue working.
- SVG rendering works.
- Animation and playback work.
- Presets work.
- Undo and redo work.
- Keyboard shortcuts work.
- Projects can be saved and loaded.
- SQLite persistence works.
- Still-image exports work.
- Video exports work.
- Existing saved projects remain compatible.

Run the tests actually available in the repository.

Do not claim tests have passed if they have not been run.

If a test cannot be run, explain why.

---

# 10. Working Method — Important

Do not attempt to refactor the entire application in one enormous change.

Work in controlled stages.

For each stage:

1. Explain what you intend to change.
2. Identify the affected files.
3. Explain the existing dependencies.
4. Make the smallest appropriate changes.
5. Run relevant tests.
6. Review the resulting code.
7. Update documentation.
8. Report what has been completed.
9. Identify outstanding issues.

If the context window or token budget becomes a limitation, stop at a clean checkpoint.

At that checkpoint, provide:

- Completed work.
- Files modified.
- Architectural decisions made.
- Tests completed and their results.
- Outstanding work.
- Exact next steps.
- Documentation updated.

Do not leave the repository in a partially implemented or inconsistent state simply to finish a larger task.

---

# 11. Phase 1 Completion Criteria

Phase 1 is complete only when:

- UI presentation and operational functionality are genuinely separated.
- An application coordination layer exists and is being used.
- Operational modules no longer depend unnecessarily on UI elements.
- Existing application behaviour is preserved.
- History and persistence continue to work.
- The existing UI remains functional and visually unchanged.
- The new architecture is documented.
- `AI_GUIDE.md` exists and accurately describes the implementation.
- Module responsibilities and dependencies are documented.
- The project has a clear foundation for Phase 2 API development.

Do not mark Phase 1 complete merely because new folders or documentation files have been created.

The separation must exist in the actual working code.

---

# 12. Your First Actions

Start by inspecting the Gitea repository and producing the architecture assessment described in Section 2.

Do not immediately start rewriting files.

First establish what exists, what is coupled, what needs to change and how to preserve compatibility.

Then propose a detailed, ordered implementation plan for Phase 1.

Once that plan is clear, proceed incrementally with the refactoring, using the Git workflow and testing requirements above.

Your priority is to leave SVG Animator Studio with a clean, understandable and documented architecture that Gemini and other AI coding assistants can work with reliably in future.

**Remember: This phase is about separating the existing UI from the existing functionality. It is not a UI redesign, feature expansion or wholesale rewrite.**