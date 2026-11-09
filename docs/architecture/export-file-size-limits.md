# SVG Animator Studio — Export File-Size Audit & Technical Limit Report

**Date:** 2026-11-09  
**Scope:** Complete inspection of export paths, HTTP handlers, rasterizer pipelines, browser blobs, and media encoders.

---

## 1. Executive Summary

A comprehensive audit of SVG Animator Studio's client-side exporters, HTTP handlers, headless Chromium rasterization pipeline, and FFmpeg encoding streams reveals:

> **No application-enforced maximum on generated export file sizes.**  
> Completed media files (MP4, Animated WebP, APNG, PNG, JPEG, SVG, HTML) are streamed chunk-by-chunk directly from disk to the HTTP client using standard `io.Copy`. The application code imposes no artificial cap (such as 100 MB or 1 GB) on the output file size.

The application **does** enforce a **100 MB limit on incoming HTTP request payloads** (including audio uploads, base64 background images, and JSON export manifests) to safeguard host memory.

---

## 2. Quantitative Summary of Limits

| Limit Category | Value / Ceiling | Enforcement Point | Technical Nature |
| :--- | :--- | :--- | :--- |
| **Max Incoming HTTP Request Body** | `100 MB` (104,857,600 bytes) | `internal/web/server.go` (`http.MaxBytesReader`) | Explicit application rule |
| **Max Audio Upload Size** | `~70–75 MB` raw (`100 MB` base64) | `POST /api/export/audio/inspect` | Configured request ceiling |
| **Max Background Image Asset** | `~70–75 MB` raw (`100 MB` base64) | `POST /api/projects/save` & `/api/export` | Configured request ceiling |
| **Max Generated Output File Size** | **No application limit** | Direct disk-to-socket `io.Copy` | Unbounded (disk/format bounded) |
| **Max Browser Blob Download** | Host RAM / Browser Heap | Browser JavaScript `window.fetch().blob()` | Client environment bounded |
| **Max Render Duration** | 30 minutes | `internal/rasterizer/rasterizer.go` context timeout | Practical pipeline timeout |
| **Intermediate Frame Disk Usage** | `0 MB` | Direct RAM pipe to FFmpeg stdin | Architectural guarantee |

---

## 3. Format-by-Format Analysis

### 3.1 Standalone Vector & Markup Formats (SVG, HTML)
- **Generation Method:** Client-side JavaScript DOM/XML assembly (`window.SVGExportAdapter`, `window.buildFullSVG`, `generator.BuildStandaloneHTML`).
- **Delivery Mechanism:** Direct browser `Blob` download (`new Blob([markup], { type: 'image/svg+xml' })` and `URL.createObjectURL(blob)`).
- **Application Limit:** **None**.
- **Theoretical Limit:** Browser V8 heap string limit (typically 512 MB to 1 GB per string).
- **Practical Tested Size:** Verified with diagrams up to 15–20 MB of pure SVG markup with hundreds of complex shapes, filters, and embedded fonts.

### 3.2 Still & Print Raster Formats (PNG, JPEG, Still WebP)
- **Generation Method:** Client-side HTML5 `<canvas>` rasterization in `StillExportStudio` (`still-export-modal.js`).
- **Delivery Mechanism:** Canvas `toBlob(...)` triggering browser download anchor.
- **Application Limit:** **None**.
- **Container / Browser Limits:**
  - Modern Chromium browsers limit HTML5 canvas dimensions to **16,384 × 16,384 pixels** (maximum area 268,435,456 pixels).
  - Maximum output file size is bounded by client memory required to buffer the uncompressed canvas pixel buffer (`width × height × 4 bytes`). For a 16K image, this requires ~1 GB of RAM during rasterization.

### 3.3 Animated WebP (`.webp`)
- **Generation Method:** Headless Chromium screenshotting piped in RAM to FFmpeg using `-vcodec libwebp -lossless 0 -qscale 80`.
- **Delivery Mechanism:** Server writes `output.webp` to temporary render workspace; streamed to client via `io.Copy`.
- **Application Limit:** **None**.
- **Format / Container Limit:**
  - The WebP container specification (RIFF-based) restricts dimensions to **16,383 × 16,383 pixels**.
  - RIFF headers use 32-bit unsigned chunk sizes, establishing a theoretical maximum container size of **4 GB**.
- **Practical Limit:** Host RAM and disk space in `<data_dir>/render_workspace`.

### 3.4 Animated PNG (`.apng`)
- **Generation Method:** Headless Chromium screenshots piped in RAM to FFmpeg using `-f apng`.
- **Delivery Mechanism:** Server writes `output.png` to temporary workspace; streamed via `io.Copy`.
- **Application Limit:** **None**.
- **Format / Container Limit:** PNG specification uses 32-bit chunk length fields (4 GB theoretical limit).
- **Practical Limit:** APNG uses lossless deflate compression; multi-minute animations at high framerates generate large files (hundreds of MBs).

### 3.5 High-Definition Video (`.mp4`)
- **Generation Method:** Headless Chromium screenshots piped to FFmpeg using `libx264` (`-preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart`) with optional `aac` audio muxing.
- **Delivery Mechanism:** Server writes `output.mp4` to temporary workspace; streamed via `io.Copy`.
- **Application Limit:** **None**.
- **Format / Container Limit:** Modern MP4 (ISO/IEC 14496-12) with 64-bit chunk offset atoms (`co64`) supports files up to **16 Exabytes**.
- **Practical Tested Size:** Multi-gigabyte video renders are fully supported provided the host has sufficient disk space in `render_workspace`.

### 3.6 GIF Format Note
- **Status:** **Not implemented as an export format**.
- The studio deliberately standardizes on modern Animated WebP and APNG (offering 24-bit color, alpha transparency, and superior compression over legacy 256-color GIF).

---

## 4. Delivery Architecture & Bottleneck Inspection

```text
[Browser Editor]
       │
       │  HTTP POST /api/export (JSON Manifest, <= 100 MB)
       ▼
[Go Server: internal/web/server.go]
       │  http.MaxBytesReader checks payload <= 100 MB
       │  Writes temporary index.html to render_workspace
       ▼
[Headless Chromium: chromedp]
       │  Evaluates animation timestamps (35ms settle time)
       │  Captures uncompressed PNG frames in memory
       │  Zero intermediate disk writes (0 MB disk usage for raw frames)
       ▼
[RAM MultiWriter Pipe] ────────► [FFmpeg stdin]
                                       │
                                       │  Encodes WebP / APNG / MP4
                                       ▼
                                [output.mp4 on disk]
                                       │
                                       │  io.Copy(w, file) — chunked HTTP streaming
                                       ▼
                                [Browser fetch().blob()]
```

### Key Architectural Findings:
1. **Zero-Disk Frame Pipeline:** SVG Animator Studio streams rendered screenshot buffers directly through in-memory pipes to FFmpeg's standard input. Raw PNG frame captures never touch disk, preventing disk exhaustion during long exports.
2. **Chunked Output Streaming:** Outputs are served directly using `io.Copy(w, file)` without buffering the entire completed video in Go memory. A 2 GB video stream consumes only a few kilobytes of Go server buffer during transfer.
3. **Browser Reception Bottleneck:** In `export-modal.js`, the completed media is received via `await response.blob()`. Very large downloads (> 2 GB) can exhaust 32-bit browser process memory.

---

## 5. Investigation of Reverse-Proxy HTTP 413 Observation

### The Finding
During earlier testing inside browser-based web IDE environments (such as `code-server` or web dev proxies), requests to `/api/export/audio/inspect` and `/api/export` failed with:
```text
HTTP 413 Request Entity Too Large
```

### Root Cause Confirmation
1. **Go Backend:** The Go application explicitly accepts up to **100 MB** (`http.MaxBytesReader(w, r.Body, 100*1024*1024)` in lines 274, 394, 549 of `internal/web/server.go`). It did not reject the payloads.
2. **Reverse Proxy Layer:** In reverse-proxy development environments (e.g. Nginx or VS Code web proxy), the default `client_max_body_size` is typically **1 MB**. When audio files or project snapshots exceed 1 MB, the reverse proxy aborts the connection with HTTP 413 before the bytes reach the Go binary.
3. **VM Verification:** Direct connections to the native SVG Animator Studio executable on native Linux (e.g. `kiwiberry` or direct localhost testing on port 8090) confirm that audio files and project payloads up to 100 MB succeed immediately without any HTTP 413 errors.
