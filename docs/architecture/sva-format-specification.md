# SVG Animator Studio — Native `.sva` Project Format Specification

## 1. Overview and Purpose

The `.sva` (SVG Animator Project) file format is the official, portable native package format for SVG Animator Studio.

### Fundamental Principle
An `.sva` file is a **complete, durable, self-contained authoring project**. It preserves the entire editable diagram scene, optical effect configurations, timeline animation settings, user-editable object names, relationships, and bundled binary assets (such as background photos and custom graphics).

**The `.sva` format is NOT an exported visual SVG or video file.** Visual export formats (standalone SVG, HTML, WebP, APNG, MP4 with audio) remain read-only presentation outputs generated from the authoritative scene model.

---

## 2. Container Architecture & Identification

### Identification
- **File Extension:** `.sva`
- **MIME Type:** `application/vnd.svg-animator.project+zip`
- **Magic Bytes:** `PK\x03\x04` (standard ZIP container signature)
- **Format Signature:** `"sva"` declared in root `manifest.json`

### Archive Structure
```text
project.sva
├── manifest.json       # Top-level package metadata and asset inventory
├── scene.json          # Authoritative editable scene graph and effect parameters
└── assets/             # Bundled binary resources
    ├── background_photo.jpg
    ├── glow_glow1_custom.png
    └── flow_flow2_custom.svg
```

Entries are written in deterministic order (`manifest.json`, `scene.json`, followed by sorted entries in `assets/`) with normalized UTC modification timestamps.

---

## 3. Specification

### 3.1 Manifest (`manifest.json`)
The manifest identifies the package and catalogs its contents:

```json
{
  "format": "sva",
  "version": "1.0.0",
  "minReaderVersion": "1.0.0",
  "name": "Orchard Plant Topology",
  "description": "Mission critical cooling network diagram",
  "createdAt": "2026-11-09T19:54:00Z",
  "savedAt": "2026-11-09T19:54:00Z",
  "generator": "SVG Animator Studio v1.2.0",
  "scene": "scene.json",
  "assets": [
    {
      "id": "asset-photo-bg",
      "path": "assets/orchard_cooling.png",
      "mime": "image/png",
      "size": 492100,
      "width": 1920,
      "height": 1080,
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    }
  ],
  "metadata": {
    "organization": "Sea of Fate Industrial",
    "tier": 1
  }
}
```

### 3.2 Scene Description (`scene.json`)
Contains the complete Go-owned scene state, all tracked control IDs, presets, and object collections:

- `schemaVersion`: `"1.0.0"`
- `canvas`: Dimensions, duration, playback mode, pattern, background color/transparency.
- `camera`: Camera motion (`ken-burns`, `handheld-drift`, `perspective-tilt`, `static`), duration, loop mode, coordinates, zoom, sway, breathe, tilt.
- `optical`: Optical effect configuration (`focus-pull`, `tilt-shift`, `motion-blur`, `none`), blur radii, focus duration, tilt-shift band coordinates.
- `frame`: Mitered 3D frame settings (style, depth, lighting, shadow, fillet).
- `controls`: Complete map of tracked UI control states for exact UI reproduction.
- `presets`: Active shape preset attributes (`stroke`, `fill`, `fillOpacity`, `strokeWidth`, `strokeStyle`, etc.) and `autoApplyPreset` flag.
- `photo`: Background photo metadata pointing to a package asset in `assets/`.
- `nodes`: Array of diagram nodes (stable `id`, user `name`, `shape`, `text`, `subtext`, coordinates, dimensions, styles, animation, `metadata`).
- `flows`: Array of data flows (stable `id`, user `name`, `fromNodeId`, `toNodeId`, waypoints, curvature, route mode, arrow, speed, timing, asset references, `metadata`).
- `glows`: Array of hotspot/radar pings (stable `id`, user `name`, coordinates, pulse speed, radar rings, asset references, `metadata`).
- `ripples`: Array of refractive water ripples (stable `id`, user `name`, coordinates, inner/outer radii, duration, wave count, refraction index, `metadata`).
- `metadata`: Arbitrary forward-compatible top-level metadata.

---

## 4. Asset Bundling & Security

### Asset Packaging
- Binary image assets (`image/jpeg`, `image/png`, `image/webp`, `image/svg+xml`) are stored un-bloated directly in `assets/`.
- Base64 data URIs from legacy projects are automatically converted to raw binary files during SVA encoding.
- When opening an SVA project, the Go engine verifies asset SHA256 checksums and resolves them into presentation buffers or data URIs for browser display.

### Security Controls & Resource Limits
Package import treats `.sva` files as untrusted external input:
1. **Zip Slip Protection:** Any archive entry starting with `/` or `\` or containing `..` path traversal is rejected immediately (`ErrZipSlipAttempt`).
2. **Symlink Prohibition:** Archive entries with symlink bits set are rejected (`ErrSymlinkNotAllowed`).
3. **Zip Bomb Defense:** Compression ratio is capped at 100:1 for entries over 1 MiB (`ErrZipBombAttempt`).
4. **Aggregate Size Cap:** Total uncompressed archive size is limited to **256 MiB** (`MaxTotalUncompressedBytes`).
5. **Single Entry Cap:** Maximum single file entry is limited to **100 MiB** (`MaxSingleEntryBytes`).
6. **JSON Deserialization Caps:** `manifest.json` is limited to **2 MiB**; `scene.json` is limited to **20 MiB**.
7. **Entry Count Cap:** Maximum 1,000 file entries per archive.

---

## 5. Forward Compatibility & Unknown Metadata

### Versioning Rules
- **Current Version:** `1.0.0`
- **Reader Policy:** A reader matching major version 1 parses the archive. If `minReaderVersion` indicates an unsupported future major version (e.g. `2.0.0`), the parser rejects the package non-destructively with `ErrUnsupportedVersion`.
- **Unknown Metadata Survival:** All `metadata` maps (`Manifest.Metadata`, `SceneData.Metadata`, `Node.Metadata`, `Flow.Metadata`, `Glow.Metadata`, `Ripple.Metadata`) are preserved across round-trips:
  `Open SVA` ➔ `Edit Scene Objects` ➔ `Save SVA` ➔ `Reopen SVA`
  Unknown extensions (such as future Digital Twin telemetry bindings or hardware sensor IDs) survive without truncation or interpretation.

---

## 6. Coexistence with Existing SQLite Persistence

- **SQLite Database:** Continues to store user projects in `studio_library.db` with Schema `1.2.0` JSON.
- **Interchange & Archive:** The `.sva` file serves as the portable, standalone file format for transferring projects between computers, saving offsite backups, and communicating with future native Go applications.
- **Bi-directional Bridge:**
  - Any SQLite project can be exported to `.sva` via `ProjectManager.exportSVAById(id)` or `GET /api/projects/export-sva?id=X`.
  - Any `.sva` file can be imported into the editor via `ProjectManager.importSVA(file)` or `POST /api/projects/import-sva`, and subsequently saved to the SQLite library with "➕ Save as New Project".
