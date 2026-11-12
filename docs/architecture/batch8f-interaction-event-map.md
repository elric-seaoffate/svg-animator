# SVG Animator Studio — Post-Carbon Remediation
## Batch 8F Interaction Event Map: Snip, Extract and Crop Overlay Pipelines

**Date:** 2026-11-12  
**Milestone:** Batch 8F  
**Scope:** Stage pointer routing, overlay hit-testing, and banner bar button dispatch

---

## 1. DOM Hierarchy & CSS Pointer Events Topology

```
#previewBox (.preview-wrapper, pointer-events: auto, cursor: crosshair)
│
├── #svgContainer (pointer-events: auto)
│   └── svg#mainSvg
│       └── rect#bgPhotoRect (rendered photo background)
│
├── #stageOverlayLayer (.stage-overlay-layer, pointer-events: auto during crop/clip, otherwise none)
│   │
│   └── svg#trajectorySvg (.trajectory-overlay, pointer-events: auto during crop/clip, otherwise none)
│       │
│       ├── g#cropOverlayGroup (display: block/none, pointer-events: auto)
│       │   ├── path#cropDimMask (fill: rgba(0,0,0,0.55), pointer-events: none)
│       │   ├── rect#cropBoxRect (fill: rgba(88,166,255,0.08), pointer-events="all", cursor: move)
│       │   ├── rect.crop-handle#cropHandle-nw (pointer-events="all", cursor: nwse-resize)
│       │   ├── rect.crop-handle#cropHandle-n  (pointer-events="all", cursor: ns-resize)
│       │   ├── rect.crop-handle#cropHandle-ne (pointer-events="all", cursor: nesw-resize)
│       │   ├── rect.crop-handle#cropHandle-e  (pointer-events="all", cursor: ew-resize)
│       │   ├── rect.crop-handle#cropHandle-se (pointer-events="all", cursor: nwse-resize)
│       │   ├── rect.crop-handle#cropHandle-s  (pointer-events="all", cursor: ns-resize)
│       │   ├── rect.crop-handle#cropHandle-sw (pointer-events="all", cursor: nesw-resize)
│       │   └── rect.crop-handle#cropHandle-w  (pointer-events="all", cursor: ew-resize)
│       │
│       ├── g#clipOverlayGroup (display: block/none, pointer-events: auto)
│       │   ├── path#clipDimMask (fill: rgba(0,0,0,0.45), pointer-events: none)
│       │   ├── rect#clipBoxRect (fill: rgba(56,211,159,0.08), pointer-events="all", cursor: move)
│       │   └── rect.clip-handle#clipHandle-* (pointer-events="all", cursor: directional)
│       │
│       └── rect#bgExtractBox (fill: rgba(88,166,255,0.2), stroke: #58a6ff, pointer-events: none)
│
├── #cropBar (.stage-banner-bar, z-index: 20, pointer-events: auto)
│   ├── #btnApplyCrop (✓ Apply Crop)
│   ├── #btnResetCropInBar (⟲ Reset)
│   └── #btnCancelCrop (✕ Cancel)
│
├── #clipBar (.stage-banner-bar, z-index: 20, pointer-events: auto)
│   ├── #btnApplyClip
│   ├── #btnResetClipInBar
│   └── #btnCancelClip
│
└── #bgExtractBar (.stage-banner-bar, z-index: 20, pointer-events: auto)
    ├── #btnConfirmExtract (✓ Extract Image)
    └── #btnCancelExtract (✕ Cancel)
```

---

## 2. Event Routing & State Transition Sequences

### 2.1 Snip / Extract Image Sequence (Problem A)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Preview as #previewBox
    participant Stage as window.Stage
    participant Banner as #bgExtractBar / #btnConfirmExtract
    participant Drawer as #leftDrawer / #btnCaptureSelectedArea
    participant ImgTools as window.ImageToolsController
    participant Engine as window.EngineBridge

    User->>Stage: Activate Background Snip (startBgExtractMode)
    Stage->>Banner: Display #bgExtractBar (flex)
    Stage->>Banner: Disable #btnConfirmExtract (disabled: true)
    
    User->>Preview: pointerdown (X1, Y1 on background)
    Note over Preview,Stage: Ignored if target is in .stage-banner-bar
    Stage->>Stage: isDraggingBgExtract = true, bgExtractStartCanvas = (X1, Y1)
    
    User->>Preview: pointermove (drag across canvas)
    Stage->>Stage: Calculate bgExtractBox {x, y, w, h}
    Stage->>Banner: Enable #btnConfirmExtract if w>=10 && h>=10
    Stage->>Drawer: Enable #btnCaptureSelectedArea if w>=10 && h>=10
    
    User->>Preview: pointerup (release drag)
    Stage->>Stage: isDraggingBgExtract = false, retain bgExtractBox
    
    alt User clicks floating "✓ Extract Image"
        User->>Banner: click #btnConfirmExtract
        Banner->>Stage: confirmBgExtractMode()
    else User clicks drawer "📸 Capture Selected Area"
        User->>Drawer: click #btnCaptureSelectedArea
        Drawer->>ImgTools: captureSelectedArea()
        ImgTools->>Stage: confirmBgExtractMode()
    end
    
    Stage->>ImgTools: confirmBgSnip(box, { silent: true })
    ImgTools->>ImgTools: Render preview canvas in drawer card
    Stage->>Stage: executeBackgroundExtraction(box)
    Stage->>Engine: createImage(imgPayload)
    Engine-->>Stage: Image created (authoritative Go scene)
    Stage->>Stage: LayerManager.addEntry + HistoryManager.recordImmediate + triggerRender
    Stage->>User: Toast: Created "Background Snip N". Drag to reposition.
```

### 2.2 Background Crop Interactive Selection, Translation & Resizing (Problem B)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Preview as #previewBox
    participant Stage as window.Stage
    participant Overlay as #cropOverlayGroup
    participant CropBar as #cropBar
    participant Drawer as #cropRegionX/Y/W/H
    participant Engine as window.EngineBridge

    User->>Stage: Activate Crop Tool (startBackgroundCropMode)
    Stage->>Stage: isCroppingImage=true, isCroppingBackground=true
    Stage->>Preview: classList.add('crop-mode-active')
    Stage->>Overlay: Show #cropOverlayGroup, set stageOverlayLayer pointer-events: auto
    Stage->>CropBar: Show #cropBar
    
    alt 1. Selection Drag (Click on canvas / uncropped full-size image)
        User->>Preview: pointerdown (canvas coords)
        Stage->>Stage: cropDragMode = 'select', startCanvas = pt
        User->>Preview: pointermove (drag rectangle)
        Stage->>Stage: Update cropBox {x, y, w, h} clamped to cropOrigBounds
        Stage->>Stage: updateCropOverlayUI()
        Stage->>Drawer: syncFromStageCrop()
        User->>Preview: pointerup
        Stage->>Stage: cropDragMode = null (commit new cropBox)
    else 2. Translation Drag (Click on #cropBoxRect interior)
        User->>Preview: pointerdown on #cropBoxRect
        Stage->>Stage: cropDragMode = 'move', cropDragStart = {clientX, clientY, box}
        User->>Preview: pointermove
        Stage->>Stage: Translate cropBox {x + dx, y + dy} clamped to bounds
        Stage->>Stage: updateCropOverlayUI()
        Stage->>Drawer: syncFromStageCrop()
        User->>Preview: pointerup
        Stage->>Stage: cropDragMode = null
    else 3. Handle Resizing (Click on .crop-handle)
        User->>Preview: pointerdown on #cropHandle-[nw/n/ne/e/se/s/sw/w]
        Stage->>Stage: cropDragMode = handleId (e.g. 'se')
        User->>Preview: pointermove
        Stage->>Stage: Resize cropBox according to handle axis
        Stage->>Stage: updateCropOverlayUI()
        Stage->>Drawer: syncFromStageCrop()
        User->>Preview: pointerup
        Stage->>Stage: cropDragMode = null
    end
    
    User->>CropBar: click #btnApplyCrop (or press Enter)
    CropBar->>Stage: applyCropMode()
    Stage->>Engine: EngineBridge.cropBackground(cropData)
    Stage->>Stage: matchCanvasToPhoto() + recordImmediate() + requestRender()
    Stage->>Preview: classList.remove('crop-mode-active'), stageOverlayLayer pointer-events: none
    Stage->>CropBar: Hide #cropBar
```

---

## 3. DOM & State Variable Reference Table

| Target Feature | DOM ID / Selector | Event Listener | Active State Variables | Invoked Action / Pipeline |
|---|---|---|---|---|
| **Snip Confirm (Floating)** | `#btnConfirmExtract` | `click` | `isExtractingBg: true`, `bgExtractBox` | `Stage.confirmBgExtractMode()` → `confirmBgSnip(box, {silent:true})` + `executeBackgroundExtraction(box)` |
| **Snip Cancel (Floating)** | `#btnCancelExtract` | `click` | `isExtractingBg: true` | `Stage.cancelBgExtractMode()` (hides `#bgExtractBar`, resets box) |
| **Snip Drawer Capture** | `#btnCaptureSelectedArea` | `click` | `isExtractingBg: true` | `ImageToolsController.captureSelectedArea()` → `Stage.confirmBgExtractMode()` |
| **Snip Drag Start** | `#previewBox` | `pointerdown` | `isExtractingBg: true` | `isDraggingBgExtract = true`, `bgExtractBox = {x, y, 0, 0}` (guarded against `.stage-banner-bar`) |
| **Snip Drag Move** | `#previewBox` | `pointermove` | `isDraggingBgExtract: true` | Updates `bgExtractBox`, updates `#bgExtractCoordsLabel`, enables `#btnConfirmExtract` & `#btnCaptureSelectedArea` (w>=10 && h>=10) |
| **Crop Drag-to-Select** | `#previewBox` | `pointerdown` | `isCroppingImage: true`, `isFullBox: true` or canvas click | `cropDragMode = 'select'`, stores `startCanvas` |
| **Crop Move Interior** | `#cropBoxRect` | `pointerdown` | `isCroppingImage: true`, `isFullBox: false` | `cropDragMode = 'move'`, stores `cropDragStart.box` |
| **Crop Handle Resize** | `.crop-handle` | `pointerdown` | `isCroppingImage: true` | `cropDragMode = handleId` (e.g. `se`, `nw`), stores `cropDragStart.box` |
| **Crop Pointermove** | `#previewBox` | `pointermove` | `cropDragMode: 'select'\|'move'\|handleId` | Updates `Stage.cropBox`, invokes `updateCropOverlayUI()` and `syncImageToolsFromCrop()` |
| **Crop Apply** | `#btnApplyCrop` / `#btnApplyCropInTools` | `click` | `isCroppingBackground: true`, `cropBox` | `Stage.applyCropMode()` → `EngineBridge.cropBackground(cropData)` |
| **Crop Cancel** | `#btnCancelCrop` / `#btnCancelCropInTools` | `click` | `isCroppingImage: true` | `Stage.cancelCropMode()` (restores overlay pointer-events to `none`, removes `crop-mode-active`) |
