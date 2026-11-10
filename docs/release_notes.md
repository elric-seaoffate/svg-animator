# SVG Animator Studio — Release Notes

## Release v1.2.0 (Stable Release & Architecture Consolidation)

**SVG Animator Studio v1.2.0** represents a major architectural milestone, completing the transition from a JavaScript-heavy browser studio to an authoritative **Go-first application powered by an embedded WebAssembly execution engine**.

### What's New in v1.2.0

1. **Go-First WebAssembly Architecture (`pkg/engine/` & `cmd/wasm/`):**
   - The Go engine is now authoritative for scene data models, object mutations, geometry math, flow path routing, grid snapping, preset application, and deterministic timeline evaluation.
   - Compiled to WebAssembly (`internal/web/static/wasm/engine.wasm`), running seamlessly in the browser with transparent JavaScript fallbacks.
   - Stable, versioned command dispatch protocol (`pkg/engine/protocol`, version `1.0.0`).

2. **Native `.sva` Project Format (`pkg/engine/sva/`):**
   - Self-contained, portable ZIP-based archive format (`format: sva`, version `1.0.0`).
   - Manifest with SHA-256 asset checksums, canonical scene data (`scene.json`), and bundled binary image assets (`assets/`).
   - Transactional import/export with Zip-Slip path traversal defense and resource limit enforcement.
   - Fully repaired and verified background image asset packaging and restoration.

3. **Go-Owned Scene State, History, Selection & Naming:**
   - Canonical selection identity and validation in Go.
   - Authoritative 50-step undo/redo command stack with discrete immediate capture and continuous slider debouncing.
   - User-editable object names for Nodes, Flows, Glows, and Ripples, cleanly separated from visual diagram labels and badge text.

4. **Responsive Blender-Style Workspace:**
   - Dual vertical icon rails (`.icon-rail-left`, `.icon-rail-right`) for rapid drawer navigation.
   - Collapsible sliding drawers (`#leftDrawer`, `#rightDrawer`) with memory and maximized canvas mode.
   - Context-sensitive floating property inspector (`#floatingContextEditor`) with draggable header and live synchronization.
   - User-approved interaction patterns: right-click properties, blank canvas click deselect, escape priority, and 35/65 inspector proportions.

5. **Operational Shape Registry:**
   - Single source of truth for 12 parametric SVG node shapes implemented in Go (`pkg/engine/geometry/shapes.go`) and JS (`shape-registry.js`).
   - Dynamic shape dropdown population and centralized SVG builder functions.

6. **Animation Architecture Separation:**
   - **Independent Object Animations:** Connectors (Flows), Hotspots (Glows), and Liquid Ripples animate continuously and independently of the global transport.
   - **Global Scene Playback:** Camera motion (Ken Burns, Perspective Tilt, Handheld Drift) and Optical effects (Focus Pull, Tilt-Shift, Motion Blur) follow the transport controls (`Play`, `Pause`, `Stop`, `Seek`).
   - Standalone SVG exports remain 100% self-contained using declarative SMIL and CSS `@keyframes` with zero runtime dependencies.

7. **Binary Self-Containment & Version Reporting:**
   - Embedded HTML, CSS, JavaScript, and WebAssembly engine compiled directly into the binary via `//go:embed`.
   - New `-version` CLI flag reporting application version, Git commit, build date, protocol version, and SVA format version.

---

## Release v1.1.0

SVG Animator Studio is a powerful, self-hosted web application and CLI tool designed for creating interactive vector diagrams, animated network topologies, and dynamic photo effects. It combines a Go-based backend rasterization engine with a pure HTML/JS/CSS frontend, allowing users to build complex, animated architectures that can be exported as lightweight standalone HTML/SVG files or fully rendered Animated WebP/APNG bitmaps.

## Core Modules

* **Canvas & Background:** Start with a blank procedural canvas (Blueprint, Dot Matrix, Graph Paper) configured to standard Print/Screen aspect ratios (A4, 1080p, 4K), or upload a photo with full crop, pan, and stretch fitting controls.
* **Diagram Shapes & Text (Nodes):** A unified freestyle shape editor supporting rectangles, cylinders, clouds, decision diamonds, and more. Shapes support custom fill, strokes, drop shadows, and multi-line text. The **Shape Preset & Snap** system allows you to define global theme attributes (e.g., width, colors, font size) and apply them selectively to multiple shapes for rapid, uniform diagramming.
* **Connectors & Data Flows:** Draw relationships between nodes using Direct Bezier curves or 90-degree Orthogonal (Z-step, L-step) routing. Connectors support animated "marching ants" lines, directional arrowheads, midpoint text badges, and traveling payloads (e.g., data packets, glowing orbs, server icons, envelopes) with adjustable speed, delays, and cubic-bezier easing.
* **Hotspots & Glows:** Highlight specific areas with pulsating glows, square blocks, custom graphics, or expanding multi-ring radar pings.
* **Liquid Ripples:** Add refractive, distorting water ripple effects to background images.
* **Camera Rig & Motion:** Wrap the entire canvas in a 3D hardware-accelerated camera rig. Choose from a static locked-off shot, Ken Burns (pan and zoom), Perspective Tilt (3D space rotation), or an organic harmonic Handheld Drift.
* **Optical Effects & Framing:** Apply cinematic optical shaders including depth-of-field Focus Pulls, Tilt-Shift miniature focal bands, and Directional Motion Blur.
* **Dual Export Studio:**clear
  * **Interactive Vector:** Export directly to standalone `.svg` or fully responsive `.html` files that retain infinite resolution and small file sizes.
  * **Still Image & Print:** Rasterize flat snapshots (PNG, WebP, JPEG) at up to 600 DPI for high-resolution print workflows.
  * **Animated Bitmap:** Leverage headless Chromium and FFmpeg to rasterize multi-frame animations into Animated WebP or APNG formats at up to 60fps.

## System Prerequisites

To build and run SVG Animator Studio, your system requires:
1. **Go (1.20+)**: To compile the web server and CLI tool.
2. **Chrome / Chromium**: Required by the headless rasterization engine (`chromedp`) to capture bitmap frames.
3. **FFmpeg**: Required to encode the captured frame sequences into Animated WebP and APNG files.

---

## Installation & Compilation

SVG Animator Studio is written in Go, meaning the frontend assets (HTML, CSS, JS) are securely embedded directly into the final binary via `//go:embed`. You only need to compile a single executable file.

### Linux / macOS
1. Clone the repository and navigate to the project root.
2. Make the script executable: `chmod +x build_and_run.sh`
3. Run the script:
   ```bash
   ./build_and_run.sh
   ```

### Windows
1. Open PowerShell or Command Prompt in the project root.
2. Run the batch script:
   ```cmd
   build_and_run.bat
   ```

Access the studio by opening your web browser to `http://localhost:8088`.

---

## Cross-Compiling for Release Distribution
You can easily build binaries for both operating systems from a single machine using Go's cross-compilation environment variables.

To compile the **Windows** release from a Linux machine:
```bash
GOOS=windows GOARCH=amd64 go build -o release/svg-animator-windows-amd64.exe ./cmd/svg-animator/main.go
```

To compile the **Linux** release from a Windows or Linux machine:
```bash
GOOS=linux GOARCH=amd64 go build -o release/svg-animator-linux-amd64 ./cmd/svg-animator/main.go
```