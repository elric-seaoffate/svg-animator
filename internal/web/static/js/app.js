/**
 * Main Studio UI Controller & Initialization (`app.js`)
 *
 * Layer 1 (UI Presentation & Control Bindings):
 *   - Accordion expand/collapse (`window.openAccordionById`, `window.toggleAllAccordions`)
 *   - Canvas preset, orientation, background pattern, and photo crop UI bindings
 *   - Paired slider/number input synchronization and settings panel listeners
 *   - Standalone SVG/HTML download handlers
 *   - Shape Registry UI dropdown population (`window.populateShapeDropdowns`)
 *
 * Delegates Layer 2 coordination to `window.AppCoordinator` (`coordinator.js`)
 * and Layer 3 scene state / SVG compilation to `window.SceneState` (`scene-state.js`).
 */


// =========================================================================
// Extracted Presentation Modules (Batch 8D Modularisation):
//   - js/shape-dropdown.js   (window.ensureShapeInDropdown, window.populateShapeDropdowns)
//   - js/export-adapter.js   (window.SVGExportAdapter, window.serializeSVGForExport)
//   - js/workspace.js        (window.WorkspaceController, window.openAccordionById, window.toggleAllAccordions)
//   - js/notifications.js    (window.StudioNotification)
//   - js/color-picker.js     (window.CustomColorPicker)
//   - js/timeline.js         (window.TimelinePlayer)
//   - js/layers-ui.js        (window.renderLayersList, window.updateLayersToolbarState, etc.)
//   - js/context-editor.js   (window.FloatingPropertiesEditor)
// =========================================================================

function renderBackgroundToOffscreenCanvas(canvasW, canvasH, callback) {
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = canvasW;
  bgCanvas.height = canvasH;
  const ctx = bgCanvas.getContext('2d');
  if (!ctx) {
    callback(null);
    return;
  }

  const patSelect = document.getElementById('canvasPatternSelect');
  const pat = patSelect ? patSelect.value : 'blueprint';
  const loadedPhoto = (window.getLoadedPhoto && typeof window.getLoadedPhoto === 'function')
    ? window.getLoadedPhoto()
    : (window.SceneState ? window.SceneState.getLoadedPhoto() : null);

  const photoSrc = loadedPhoto ? (loadedPhoto.dataUrl || loadedPhoto.src || loadedPhoto.dataURL || loadedPhoto.url || (loadedPhoto.b64 ? ('data:' + (loadedPhoto.mime || 'image/png') + ';base64,' + loadedPhoto.b64) : '')) : '';

  if (pat === 'photo' && photoSrc) {
    const isTrans = document.getElementById('canvasBgTransparent')?.checked;
    const bgColor = document.getElementById('canvasBgColorPicker')?.value || '#0d1117';
    if (!isTrans) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvasW, canvasH);
    }
    const img = new Image();
    if (!photoSrc.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      const fitSelect = document.getElementById('photoFitSelect');
      const fitMode = fitSelect ? fitSelect.value : 'match';
      const crop = loadedPhoto.crop;
      const hasCrop = crop && crop.enabled !== false && (
        (crop.sourceWidth || crop.width) > 0 &&
        (crop.sourceHeight || crop.height) > 0
      );
      const cropW = hasCrop ? (crop.sourceWidth || crop.width) : 0;
      const cropH = hasCrop ? (crop.sourceHeight || crop.height) : 0;
      const imgNatW = img.naturalWidth || loadedPhoto.naturalWidth || img.width || canvasW;
      const imgNatH = img.naturalHeight || loadedPhoto.naturalHeight || img.height || canvasH;
      const sx = hasCrop ? Math.max(0, Math.min(imgNatW - 1, Number(crop.sourceX || 0))) : 0;
      const sy = hasCrop ? Math.max(0, Math.min(imgNatH - 1, Number(crop.sourceY || 0))) : 0;
      const sw = hasCrop ? Math.max(1, Math.min(imgNatW - sx, Number(cropW))) : imgNatW;
      const sh = hasCrop ? Math.max(1, Math.min(imgNatH - sy, Number(cropH))) : imgNatH;

      if (fitMode === 'contain') {
        const scale = Math.min(canvasW / sw, canvasH / sh);
        const rw = sw * scale;
        const rh = sh * scale;
        const ox = (canvasW - rw) / 2;
        const oy = (canvasH - rh) / 2;
        ctx.drawImage(img, sx, sy, sw, sh, ox, oy, rw, rh);
      } else if (fitMode === 'stretch') {
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvasW, canvasH);
      } else if (fitMode === 'cover') {
        const zoomVal = parseInt(document.getElementById('photoCropZoomNum')?.value || '100', 10) / 100;
        const cropX = parseInt(document.getElementById('photoCropXNum')?.value || '50', 10) / 100;
        const cropY = parseInt(document.getElementById('photoCropYNum')?.value || '50', 10) / 100;
        const baseScale = Math.max(canvasW / sw, canvasH / sh) * Math.max(1.0, zoomVal);
        const rw = sw * baseScale;
        const rh = sh * baseScale;
        const ox = -(Math.max(0, rw - canvasW) * cropX);
        const oy = -(Math.max(0, rh - canvasH) * cropY);
        ctx.drawImage(img, sx, sy, sw, sh, ox, oy, rw, rh);
      } else { // match / default
        const scale = Math.max(canvasW / sw, canvasH / sh);
        const rw = sw * scale;
        const rh = sh * scale;
        const ox = (canvasW - rw) / 2;
        const oy = (canvasH - rh) / 2;
        ctx.drawImage(img, sx, sy, sw, sh, ox, oy, rw, rh);
      }
      callback(bgCanvas);
    };
    img.onerror = () => {
      ctx.fillStyle = '#161b22';
      ctx.fillRect(0, 0, canvasW, canvasH);
      callback(bgCanvas);
    };
    img.src = photoSrc;
  } else {
    const isTrans = document.getElementById('canvasBgTransparent')?.checked;
    const bgColor = document.getElementById('canvasBgColorPicker')?.value || '#0d1117';
    if (!isTrans) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvasW, canvasH);
    }
    const gridColor = document.getElementById('canvasGridColorPicker')?.value || '#1e293b';
    const gridSize = parseInt(document.getElementById('canvasGridSizeNum')?.value || '40', 10) || 40;

    if (pat === 'blueprint' || pat === 'graph') {
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      for (let x = 0; x <= canvasW; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, canvasH);
        ctx.stroke();
      }
      for (let y = 0; y <= canvasH; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(canvasW, y + 0.5);
        ctx.stroke();
      }
    } else if (pat === 'dots') {
      ctx.fillStyle = gridColor;
      for (let x = gridSize / 2; x < canvasW; x += gridSize) {
        for (let y = gridSize / 2; y < canvasH; y += gridSize) {
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (pat === 'dark-radial') {
      const grad = ctx.createRadialGradient(canvasW / 2, canvasH / 2, 50, canvasW / 2, canvasH / 2, Math.max(canvasW, canvasH) / 1.4);
      grad.addColorStop(0, '#1c2128');
      grad.addColorStop(1, '#0d1117');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvasW, canvasH);
    }
    callback(bgCanvas);
  }
}

window.openBakeModal = function(img) {
  if (!img) return;
  window._bakeTargetImage = img;
  const nameEl = document.getElementById('bakeModalImageName');
  if (nameEl) nameEl.textContent = `"${img.name || img.filename || img.id}"`;
  const modal = document.getElementById('bakeConfirmModal');
  if (modal) modal.style.display = 'flex';
};

window.closeBakeModal = function() {
  window._bakeTargetImage = null;
  const modal = document.getElementById('bakeConfirmModal');
  if (modal) modal.style.display = 'none';
};

function executeBakeImage(img, mode) {

  if (!img) return;

  const layerMeta = (window.LayerManager && typeof window.LayerManager.getEffective === 'function')
    ? window.LayerManager.getEffective('image', img.id)
    : { locked: false, visible: true };
  if (layerMeta.locked) {
    window.closeBakeModal();
    if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
      window.AppCoordinator.showNotification(`Cannot bake locked image "${img.name || img.id}". Unlock it first.`, 'warning');
    }
    return;
  }
  if (layerMeta.visible === false || img.visible === false) {
    window.closeBakeModal();
    if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
      window.AppCoordinator.showNotification(`Cannot bake hidden image "${img.name || img.id}". Make it visible first.`, 'warning');
    }
    return;
  }

  const imgSrc = img.dataUrl || img.dataURL || img.src || img.data || img.assetRef || (img.b64 ? ('data:' + (img.mime || 'image/png') + ';base64,' + img.b64) : '') || '';
  if (!imgSrc) {
    window.closeBakeModal();
    if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
      window.AppCoordinator.showNotification('Cannot bake image: missing image asset data.', 'error');
    }
    return;
  }

  const canvasW = (window.Stage && window.Stage.canvasWidth) || 1280;
  const canvasH = (window.Stage && window.Stage.canvasHeight) || 720;

  renderBackgroundToOffscreenCanvas(canvasW, canvasH, (bgCanvas) => {
    if (!bgCanvas) return;
    const ctx = bgCanvas.getContext('2d');
    if (!ctx) return;

    const imgEl = new Image();
    if (!imgSrc.startsWith('data:')) {
      imgEl.crossOrigin = 'anonymous';
    }
    imgEl.onload = () => {
      ctx.save();
      const op = typeof img.opacity === 'number' ? img.opacity : 1.0;
      ctx.globalAlpha = Math.max(0, Math.min(1, op));

      const cx = (img.x / 100) * canvasW;
      const cy = (img.y / 100) * canvasH;
      const dw = Number(img.width) || 200;
      const dh = Number(img.height) || 150;
      const dx = cx - dw / 2;
      const dy = cy - dh / 2;

      if (img.clip && img.clip.enabled && img.clip.width > 0 && img.clip.height > 0) {
        ctx.beginPath();
        ctx.rect(dx + Number(img.clip.x || 0), dy + Number(img.clip.y || 0), Number(img.clip.width), Number(img.clip.height));
        ctx.clip();
      }

      if (img.crop && img.crop.enabled && img.crop.sourceWidth > 0 && img.crop.sourceHeight > 0) {
        ctx.drawImage(
          imgEl,
          img.crop.sourceX, img.crop.sourceY, img.crop.sourceWidth, img.crop.sourceHeight,
          dx, dy, dw, dh
        );
      } else {
        ctx.drawImage(imgEl, dx, dy, dw, dh);
      }
      ctx.restore();

      const bakedDataUrl = bgCanvas.toDataURL('image/png');

      let bakeSuccess = false;
      let bakeError = null;

      if (window.EngineBridge && typeof window.EngineBridge.bakeImage === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.bakeImage(img.id, mode, bakedDataUrl, canvasW, canvasH);
        if (res && res.success) {
          bakeSuccess = true;
          const b64 = bakedDataUrl.replace(/^data:image\/png;base64,/, '');
          const bakedPhoto = {
            filename: (res.background && res.background.filename) || 'baked_background.png',
            mime: (res.background && res.background.mime) || 'image/png',
            b64: (res.background && res.background.b64) || b64,
            dataUrl: (res.background && (res.background.src || res.background.data)) || bakedDataUrl,
            src: (res.background && (res.background.src || res.background.data)) || bakedDataUrl,
            data: (res.background && (res.background.data || res.background.src)) || bakedDataUrl,
            naturalWidth: (res.background && res.background.naturalWidth) || canvasW,
            naturalHeight: (res.background && res.background.naturalHeight) || canvasH,
            crop: (res.background && res.background.crop) || null,
            cropVersions: (res.background && res.background.cropVersions) || [{ id: 'original', name: 'Original', sourceX: 0, sourceY: 0, sourceWidth: canvasW, sourceHeight: canvasH }],
            activeCropVersionId: (res.background && res.background.activeCropVersionId) || 'original'
          };
          if (typeof window.hydrateLoadedPhoto === 'function') {
            window.hydrateLoadedPhoto(bakedPhoto);
          } else if (typeof window.setLoadedPhoto === 'function') {
            window.setLoadedPhoto(bakedPhoto, { hydrateOnly: true });
          }
          if (mode === 'keep') {
            img.visible = false;
            if (window.ImageObjects && typeof window.ImageObjects.updateImage === 'function') {
              window.ImageObjects.updateImage(img.id, { visible: false });
            }
          }
        } else {
          bakeError = (res && res.error) || 'Failed to bake image in Go engine';
        }
      } else {
        // Fallback for offline presentation without WASM
        const b64 = bakedDataUrl.replace(/^data:image\/png;base64,/, '');
        const newPhoto = {
          filename: 'baked_background.png',
          mime: 'image/png',
          b64: b64,
          dataUrl: bakedDataUrl,
          src: bakedDataUrl,
          data: bakedDataUrl,
          naturalWidth: canvasW,
          naturalHeight: canvasH
        };
        if (typeof window.hydrateLoadedPhoto === 'function') {
          window.hydrateLoadedPhoto(newPhoto);
        } else if (typeof window.setLoadedPhoto === 'function') {
          window.setLoadedPhoto(newPhoto, { hydrateOnly: true });
        }
        if (mode === 'remove') {
          if (window.ImageObjects) window.ImageObjects.deleteImage(img.id);
          if (window.AppCoordinator) window.AppCoordinator.clearSelection();
        } else {
          if (window.LayerManager && typeof window.LayerManager.setVisibility === 'function') {
            window.LayerManager.setVisibility('image', img.id, false);
          }
          if (window.ImageObjects) window.ImageObjects.updateImage(img.id, { visible: false });
        }
        bakeSuccess = true;
      }

      window.closeBakeModal();

      if (!bakeSuccess) {
        if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
          window.AppCoordinator.showNotification(`Cannot bake image: ${bakeError || 'operation failed'}.`, 'error');
        }
        return;
      }

      const patSelect = document.getElementById('canvasPatternSelect');
      if (patSelect) patSelect.value = 'photo';
      const fitSelect = document.getElementById('photoFitSelect');
      if (fitSelect) fitSelect.value = 'match';
      const wInput = document.getElementById('canvasWidthInput');
      const hInput = document.getElementById('canvasHeightInput');
      if (wInput) wInput.value = canvasW;
      if (hInput) hInput.value = canvasH;

      if (window.HistoryManager) {
        window.HistoryManager.recordImmediate();
      }
      if (typeof window.triggerRender === 'function') {
        window.triggerRender();
      }
      if (typeof window.syncImageEditorUI === 'function') {
        window.syncImageEditorUI();
      }
      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        const msg = mode === 'remove'
          ? `Baked "${img.name || img.id}" into background and removed image object.`
          : `Baked "${img.name || img.id}" into background and set image object to hidden.`;
        window.AppCoordinator.showNotification(msg, 'success');
      }
    };
    imgEl.onerror = () => {
      window.closeBakeModal();
      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        window.AppCoordinator.showNotification('Failed to load image asset for baking.', 'error');
      }
    };
    imgEl.src = imgSrc;
  });
}

window.executeBakeImage = executeBakeImage;

window.executeBackgroundExtraction = function(box) {
  if (!box || box.w < 10 || box.h < 10) {
    if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
      window.AppCoordinator.showNotification('Extraction region too small. Drag a larger rectangle (at least 10×10 px).', 'warning', 3000);
    }
    return;
  }
  const canvasW = (window.Stage && window.Stage.canvasWidth) || 1280;
  const canvasH = (window.Stage && window.Stage.canvasHeight) || 720;

  renderBackgroundToOffscreenCanvas(canvasW, canvasH, (bgCanvas) => {
    if (!bgCanvas) {
      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        window.AppCoordinator.showNotification('Failed to render background for extraction.', 'error', 3000);
      }
      return;
    }

    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = Math.round(box.w);
    sliceCanvas.height = Math.round(box.h);
    const sCtx = sliceCanvas.getContext('2d');
    if (!sCtx) {
      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        window.AppCoordinator.showNotification('Failed to create slice context for extraction.', 'error', 3000);
      }
      return;
    }

    sCtx.drawImage(
      bgCanvas,
      Math.round(box.x), Math.round(box.y), Math.round(box.w), Math.round(box.h),
      0, 0, Math.round(box.w), Math.round(box.h)
    );

    const dataUrl = sliceCanvas.toDataURL('image/png');
    if (!dataUrl || dataUrl.length < 50) {
      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        window.AppCoordinator.showNotification('Extraction produced invalid image data.', 'error', 3000);
      }
      return;
    }

    const xPct = ((box.x + box.w / 2) / canvasW) * 100;
    const yPct = ((box.y + box.h / 2) / canvasH) * 100;

    window._bgSnipCounter = (window._bgSnipCounter || 0) + 1;
    const extractName = `Background Snip ${window._bgSnipCounter}`;
    const filename = `bg_snip_${window._bgSnipCounter}.png`;

    const imgPayload = {
      name: extractName,
      filename: filename,
      mime: 'image/png',
      src: dataUrl,
      data: dataUrl,
      x: Math.round(xPct * 1000) / 1000,
      y: Math.round(yPct * 1000) / 1000,
      width: Math.round(box.w),
      height: Math.round(box.h),
      naturalWidth: Math.round(box.w),
      naturalHeight: Math.round(box.h),
      maintainAspectRatio: true,
      opacity: 1.0,
      visible: true,
      locked: false
    };

    let created = null;
    if (window.EngineBridge && typeof window.EngineBridge.createImage === 'function' && window.EngineBridge.isReady()) {
      const res = window.EngineBridge.createImage(imgPayload);
      created = (res && res.image) ? res.image : res;
    } else if (window.ImageObjects) {
      created = window.ImageObjects.createImage(imgPayload);
    }

    if (!created || !created.id) {
      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        window.AppCoordinator.showNotification('Failed to create Image Object from extracted region.', 'error', 3000);
      }
      return;
    }

    if (window.LayerManager && typeof window.LayerManager.addEntry === 'function') {
      window.LayerManager.addEntry('image', created.id);
    }
    if (window.LayerManager && typeof window.LayerManager.syncFromEngine === 'function') {
      window.LayerManager.syncFromEngine();
    }

    if (window.HistoryManager) {
      window.HistoryManager.recordImmediate();
    }
    if (typeof window.triggerRender === 'function') {
      window.triggerRender();
    }
    if (window.AppCoordinator) {
      window.AppCoordinator.selectObject('image', created.id, { openAccordionId: 'acc-image-tools' });
      window.AppCoordinator.requestRender();
      window.AppCoordinator.updateActiveOverlays();
      window.AppCoordinator.showNotification(
        `Created "${extractName}". Drag to reposition.`,
        'success',
        4000
      );
    }
    if (typeof window.syncImageEditorUI === 'function') {
      window.syncImageEditorUI();
    }
    if (typeof window.renderLayersList === 'function') {
      window.renderLayersList();
    }
    if (window.ImageToolsController && typeof window.ImageToolsController.showResult === 'function') {
      window.ImageToolsController.showResult(created);
    }
    if (typeof window.syncImageToolsUI === 'function') {
      window.syncImageToolsUI();
    }
  });
};

// Ensure global window.triggerRender is defined across all presentation scripts
if (typeof window !== 'undefined') {
  window.triggerRender = function() {
    if (window.AppCoordinator && typeof window.AppCoordinator.requestRender === 'function') {
      window.AppCoordinator.requestRender();
    } else if (typeof window.triggerAppRender === 'function') {
      window.triggerAppRender();
    }
  };
}

window.matchCanvasToPhoto = function() {
  const loadedPhoto = (window.getLoadedPhoto && typeof window.getLoadedPhoto === 'function')
    ? window.getLoadedPhoto()
    : (window.SceneState ? window.SceneState.getLoadedPhoto() : null);
  if (!loadedPhoto) return;
  const crop = loadedPhoto.crop;
  const hasCrop = crop && crop.enabled !== false && (
    (crop.sourceWidth || crop.width) > 0 &&
    (crop.sourceHeight || crop.height) > 0
  );
  const targetW = hasCrop ? (crop.sourceWidth || crop.width) : (loadedPhoto.naturalWidth || 1280);
  const targetH = hasCrop ? (crop.sourceHeight || crop.height) : (loadedPhoto.naturalHeight || 720);
  const wIn = document.getElementById('canvasWidthInput');
  const hIn = document.getElementById('canvasHeightInput');
  if (wIn) wIn.value = Math.round(targetW);
  if (hIn) hIn.value = Math.round(targetH);
  if (window.SceneState && window.SceneState.controls) {
    window.SceneState.controls.canvasWidthInput = String(Math.round(targetW));
    window.SceneState.controls.canvasHeightInput = String(Math.round(targetH));
  }
  const fitSel = document.getElementById('photoFitSelect');
  if (fitSel) fitSel.value = 'match';
  if (window.SceneState && window.SceneState.controls) {
    window.SceneState.controls.photoFitSelect = 'match';
  }
  if (typeof syncPresetDropdownFromInputs === 'function') syncPresetDropdownFromInputs();
  if (typeof updateOrientationAndPaperUI === 'function') updateOrientationAndPaperUI();
  if (typeof syncBackgroundUIVisibility === 'function') syncBackgroundUIVisibility();
  if (typeof render === 'function') render();
  else if (window.triggerRender) window.triggerRender();
  if (typeof recordImmediate === 'function') recordImmediate();
};

window.ImageToolsController = {
  clipSnipSource: 'background', // 'background' | 'image'
  currentMode: 'crop',          // Legacy compatibility
  lastExtractedResult: null,
  _imageCache: new Map(),
  _snipDebounce: null,
  _previewData: null,          // { dataUrl, w, h, naturalWidth, naturalHeight, name, xPct, yPct }
  _snipCounter: 0,
  _clipCounter: 0,

  clearCache() {
    this._imageCache.clear();
  },

  _getBackgroundPhoto() {
    return (window.getLoadedPhoto && typeof window.getLoadedPhoto === 'function')
      ? window.getLoadedPhoto()
      : (window.SceneState ? window.SceneState.getLoadedPhoto() : null);
  },

  init() {
    this._bindEvents();
    this.syncUI();
  },

  setClipSnipSource(source) {
    if (source !== 'background' && source !== 'image') return;
    this.clipSnipSource = source;
    if (window.Stage) {
      if (window.Stage.isClippingImage) window.Stage.cancelClipMode();
      if (window.Stage.isExtractingBg) window.Stage.cancelBgExtractMode();
    }
    this.syncUI();
  },

  // Legacy setMode for compatibility
  setMode(mode) {
    if (!['crop', 'clip', 'snip'].includes(mode)) return;
    this.currentMode = mode;
    if (mode === 'clip') {
      this.clipSnipSource = 'image';
    } else if (mode === 'snip') {
      this.clipSnipSource = 'background';
    }
    if (window.Stage) {
      if (window.Stage.isCroppingImage) window.Stage.cancelCropMode();
      if (window.Stage.isClippingImage) window.Stage.cancelClipMode();
      if (window.Stage.isExtractingBg) window.Stage.cancelBgExtractMode();
    }
    this.syncUI();
  },

  _bindEvents() {
    // --- TOP SECTION: CLIP & SNIP BINDINGS ---
    const btnSrcBg = document.getElementById('btnSourceBg');
    if (btnSrcBg && !btnSrcBg._hasBound) {
      btnSrcBg._hasBound = true;
      btnSrcBg.addEventListener('click', () => this.setClipSnipSource('background'));
    }

    const btnSrcImg = document.getElementById('btnSourceImage');
    if (btnSrcImg && !btnSrcImg._hasBound) {
      btnSrcImg._hasBound = true;
      btnSrcImg.addEventListener('click', () => this.setClipSnipSource('image'));
    }

    const btnStartCS = document.getElementById('btnStartClipSnip');
    if (btnStartCS && !btnStartCS._hasBound) {
      btnStartCS._hasBound = true;
      btnStartCS.addEventListener('click', () => this.startClipSnip());
    }

    const btnCapArea = document.getElementById('btnCaptureSelectedArea');
    if (btnCapArea && !btnCapArea._hasBound) {
      btnCapArea._hasBound = true;
      btnCapArea.addEventListener('click', () => this.captureSelectedArea());
    }

    const btnCancelCS = document.getElementById('btnCancelClipSelection');
    if (btnCancelCS && !btnCancelCS._hasBound) {
      btnCancelCS._hasBound = true;
      btnCancelCS.addEventListener('click', () => this.cancelClipSelection());
    }

    const btnCreateFromPrev = document.getElementById('btnCreateImageFromPreview');
    if (btnCreateFromPrev && !btnCreateFromPrev._hasBound) {
      btnCreateFromPrev._hasBound = true;
      btnCreateFromPrev.addEventListener('click', () => this.createImageFromPreview());
    }

    const btnExpPng = document.getElementById('btnExportClipPng');
    if (btnExpPng && !btnExpPng._hasBound) {
      btnExpPng._hasBound = true;
      btnExpPng.addEventListener('click', () => this.exportPreviewDirect('png'));
    }

    const btnExpJpeg = document.getElementById('btnExportClipJpeg');
    if (btnExpJpeg && !btnExpJpeg._hasBound) {
      btnExpJpeg._hasBound = true;
      btnExpJpeg.addEventListener('click', () => this.exportPreviewDirect('jpeg'));
    }

    const btnExpWebp = document.getElementById('btnExportClipWebp');
    if (btnExpWebp && !btnExpWebp._hasBound) {
      btnExpWebp._hasBound = true;
      btnExpWebp.addEventListener('click', () => this.exportPreviewDirect('webp'));
    }

    const btnDiscardPrev = document.getElementById('btnDiscardPreview');
    if (btnDiscardPrev && !btnDiscardPrev._hasBound) {
      btnDiscardPrev._hasBound = true;
      btnDiscardPrev.addEventListener('click', () => this.discardPreview());
    }

    const btnApplyClipToOrig = document.getElementById('btnApplyClipToOriginal');
    if (btnApplyClipToOrig && !btnApplyClipToOrig._hasBound) {
      btnApplyClipToOrig._hasBound = true;
      btnApplyClipToOrig.addEventListener('click', () => this.applyClipToOriginal());
    }

    const btnResetAppliedClip = document.getElementById('btnResetAppliedClip');
    if (btnResetAppliedClip && !btnResetAppliedClip._hasBound) {
      btnResetAppliedClip._hasBound = true;
      btnResetAppliedClip.addEventListener('click', () => this.resetAppliedClip());
    }

    // Clip Region coordinate inputs
    const onClipInput = () => this._onClipInputChange();
    ['clipRegionX', 'clipRegionY', 'clipRegionW', 'clipRegionH'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el._hasBound) {
        el._hasBound = true;
        el.addEventListener('input', onClipInput);
        el.addEventListener('change', onClipInput);
      }
    });

    // Result card buttons
    const btnSelRes = document.getElementById('btnToolSelectResult');
    if (btnSelRes && !btnSelRes._hasBound) {
      btnSelRes._hasBound = true;
      btnSelRes.addEventListener('click', () => {
        if (this.lastExtractedResult && this.lastExtractedResult.id && window.AppCoordinator) {
          window.AppCoordinator.selectObject('image', this.lastExtractedResult.id);
          window.AppCoordinator.updateActiveOverlays();
        }
      });
    }

    const btnShowLayers = document.getElementById('btnToolShowInLayers');
    if (btnShowLayers && !btnShowLayers._hasBound) {
      btnShowLayers._hasBound = true;
      btnShowLayers.addEventListener('click', () => {
        if (window.WorkspaceController) {
          window.WorkspaceController.showToolPanel('acc-layers');
        }
        if (this.lastExtractedResult && this.lastExtractedResult.id) {
          setTimeout(() => {
            const row = document.querySelector(`.layer-item[data-layer-id="${this.lastExtractedResult.id}"]`);
            if (row) {
              row.scrollIntoView({ block: 'nearest' });
              row.classList.add('layer-row-selected');
            }
          }, 60);
        }
      });
    }

    // --- BOTTOM SECTION: CROP IMAGE BINDINGS ---
    const btnStartC = document.getElementById('btnStartCrop');
    if (btnStartC && !btnStartC._hasBound) {
      btnStartC._hasBound = true;
      btnStartC.addEventListener('click', () => this.startCrop());
    }

    const btnApplyC = document.getElementById('btnApplyCropInTools');
    if (btnApplyC && !btnApplyC._hasBound) {
      btnApplyC._hasBound = true;
      btnApplyC.addEventListener('click', () => this.applyCrop());
    }

    const btnCancelC = document.getElementById('btnCancelCropInTools');
    if (btnCancelC && !btnCancelC._hasBound) {
      btnCancelC._hasBound = true;
      btnCancelC.addEventListener('click', () => this.cancelCrop());
    }

    const btnEditC = document.getElementById('btnEditCurrentCrop');
    if (btnEditC && !btnEditC._hasBound) {
      btnEditC._hasBound = true;
      btnEditC.addEventListener('click', () => this.editCurrentCrop());
    }

    const btnResetC = document.getElementById('btnResetCropToOriginal');
    if (btnResetC && !btnResetC._hasBound) {
      btnResetC._hasBound = true;
      btnResetC.addEventListener('click', () => this.resetCropToOriginal());
    }

    const btnCropMatch = document.getElementById('btnCropMatchCanvas');
    if (btnCropMatch && !btnCropMatch._hasBound) {
      btnCropMatch._hasBound = true;
      btnCropMatch.addEventListener('click', () => {
        const fitSel = document.getElementById('photoFitSelect');
        if (fitSel) fitSel.value = 'match';
        if (window.SceneState && window.SceneState.controls) {
          window.SceneState.controls.photoFitSelect = 'match';
        }
        if (typeof window.matchCanvasToPhoto === 'function') {
          window.matchCanvasToPhoto();
        }
      });
    }

    // Quick Crop Preset Buttons (Full Height, Full Width, Full Image)
    const btnFullH = document.getElementById('btnCropFullHeight');
    if (btnFullH && !btnFullH._hasBound) {
      btnFullH._hasBound = true;
      btnFullH.addEventListener('click', () => this.setCropFullHeight());
    }
    const btnFullW = document.getElementById('btnCropFullWidth');
    if (btnFullW && !btnFullW._hasBound) {
      btnFullW._hasBound = true;
      btnFullW.addEventListener('click', () => this.setCropFullWidth());
    }
    const btnFullImg = document.getElementById('btnCropFullImage');
    if (btnFullImg && !btnFullImg._hasBound) {
      btnFullImg._hasBound = true;
      btnFullImg.addEventListener('click', () => this.setCropFullImage());
    }

    const btnMatchPhoto = document.getElementById('btnMatchPhotoSize');
    if (btnMatchPhoto && !btnMatchPhoto._hasBoundMatch) {
      btnMatchPhoto._hasBoundMatch = true;
      btnMatchPhoto.addEventListener('click', () => {
        if (typeof window.matchCanvasToPhoto === 'function') {
          window.matchCanvasToPhoto();
        }
      });
    }

    // Crop Region coordinate inputs
    const onCropInput = () => this._onCropInputChange();
    ['cropRegionX', 'cropRegionY', 'cropRegionW', 'cropRegionH', 'toolRegionX', 'toolRegionY', 'toolRegionW', 'toolRegionH'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el._hasBound) {
        el._hasBound = true;
        el.addEventListener('input', onCropInput);
        el.addEventListener('change', onCropInput);
      }
    });

    // Commit Crop Modal
    const btnCommitTrigger = document.getElementById('btnCommitCropModalTrigger');
    if (btnCommitTrigger && !btnCommitTrigger._hasBound) {
      btnCommitTrigger._hasBound = true;
      btnCommitTrigger.addEventListener('click', () => this.openCommitCropModal());
    }

    const btnCommitClose = document.getElementById('btnCommitCropModalClose');
    if (btnCommitClose && !btnCommitClose._hasBound) {
      btnCommitClose._hasBound = true;
      btnCommitClose.addEventListener('click', () => this.closeCommitCropModal());
    }

    const btnCommitCancel = document.getElementById('btnCommitCropCancel');
    if (btnCommitCancel && !btnCommitCancel._hasBound) {
      btnCommitCancel._hasBound = true;
      btnCommitCancel.addEventListener('click', () => this.closeCommitCropModal());
    }

    const btnCommitPreserve = document.getElementById('btnCommitCropPreserve');
    if (btnCommitPreserve && !btnCommitPreserve._hasBound) {
      btnCommitPreserve._hasBound = true;
      btnCommitPreserve.addEventListener('click', () => this.commitCurrentCrop(false));
    }

    const btnCommitDiscard = document.getElementById('btnCommitCropDiscard');
    if (btnCommitDiscard && !btnCommitDiscard._hasBound) {
      btnCommitDiscard._hasBound = true;
      btnCommitDiscard.addEventListener('click', () => this.commitCurrentCrop(true));
    }

    // Bake
    const btnBake = document.getElementById('btnToolBake');
    if (btnBake && !btnBake._hasBound) {
      btnBake._hasBound = true;
      btnBake.addEventListener('click', () => {
        const sel = window.AppCoordinator ? window.AppCoordinator.getActiveSelection() : null;
        if (sel && sel.type === 'image' && sel.id && window.ImageObjects) {
          const img = window.ImageObjects.getImage(sel.id);
          if (img && typeof window.openBakeModal === 'function') {
            window.openBakeModal(img);
          }
        }
      });
    }

    // Import buttons
    ['btnCropImportImage', 'btnToolsImportImage'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el._hasBound) {
        el._hasBound = true;
        el.addEventListener('click', () => {
          const fileIn = document.getElementById('inputImportImageObject');
          if (fileIn) fileIn.click();
        });
      }
    });

    // Legacy Button Bindings for test harness parity
    const btnLegacySelect = document.getElementById('btnToolSelectOnCanvas');
    if (btnLegacySelect && !btnLegacySelect._hasBound) {
      btnLegacySelect._hasBound = true;
      btnLegacySelect.addEventListener('click', () => this.startCrop());
    }
    const btnLegacyApply = document.getElementById('btnToolApply');
    if (btnLegacyApply && !btnLegacyApply._hasBound) {
      btnLegacyApply._hasBound = true;
      btnLegacyApply.addEventListener('click', () => this.applyCrop());
    }
    const btnLegacyCancel = document.getElementById('btnToolCancel');
    if (btnLegacyCancel && !btnLegacyCancel._hasBound) {
      btnLegacyCancel._hasBound = true;
      btnLegacyCancel.addEventListener('click', () => this.cancelCrop());
    }
    const btnLegacyReset = document.getElementById('btnToolReset');
    if (btnLegacyReset && !btnLegacyReset._hasBound) {
      btnLegacyReset._hasBound = true;
      btnLegacyReset.addEventListener('click', () => this.resetCropToOriginal());
    }
    const btnLegacyStartClip = document.getElementById('btnStartClip');
    if (btnLegacyStartClip && !btnLegacyStartClip._hasBound) {
      btnLegacyStartClip._hasBound = true;
      btnLegacyStartClip.addEventListener('click', () => {
        this.clipSnipSource = 'image';
        this.startClipSnip();
      });
    }
    const btnLegacyStartSnip = document.getElementById('btnStartBgSnip');
    if (btnLegacyStartSnip && !btnLegacyStartSnip._hasBound) {
      btnLegacyStartSnip._hasBound = true;
      btnLegacyStartSnip.addEventListener('click', () => {
        this.clipSnipSource = 'background';
        this.startClipSnip();
      });
    }
    const btnLegacyConfirmClip = document.getElementById('btnConfirmClipArea');
    if (btnLegacyConfirmClip && !btnLegacyConfirmClip._hasBound) {
      btnLegacyConfirmClip._hasBound = true;
      btnLegacyConfirmClip.addEventListener('click', () => this.captureSelectedArea());
    }
    const btnLegacyConfirmSnip = document.getElementById('btnConfirmBgSnip');
    if (btnLegacyConfirmSnip && !btnLegacyConfirmSnip._hasBound) {
      btnLegacyConfirmSnip._hasBound = true;
      btnLegacyConfirmSnip.addEventListener('click', () => this.captureSelectedArea());
    }
  },

  syncUI() {
    const sel = (window.AppCoordinator && typeof window.AppCoordinator.getActiveSelection === 'function')
      ? window.AppCoordinator.getActiveSelection()
      : null;
    const isImageSelected = sel && sel.type === 'image' && sel.id !== null;
    const currentImg = isImageSelected && window.ImageObjects ? window.ImageObjects.getImage(sel.id) : null;

    // --- 1. TOP SECTION (Clip & Snip) SYNC ---
    const btnSrcBg = document.getElementById('btnSourceBg');
    const btnSrcImg = document.getElementById('btnSourceImage');
    if (btnSrcBg) btnSrcBg.classList.toggle('active', this.clipSnipSource === 'background');
    if (btnSrcImg) btnSrcImg.classList.toggle('active', this.clipSnipSource === 'image');

    const srcTitle = document.getElementById('clipSnipSourceTitle');
    const srcDims = document.getElementById('clipSnipSourceDims');
    const btnStartCS = document.getElementById('btnStartClipSnip');
    const clipMaskRow = document.getElementById('clipMaskOriginalRow');

    const cw = (window.Stage && window.Stage.canvasWidth) || 1280;
    const ch = (window.Stage && window.Stage.canvasHeight) || 720;

    if (this.clipSnipSource === 'background') {
      const patSelect = document.getElementById('canvasPatternSelect');
      const bgType = patSelect ? patSelect.value : 'pattern';
      if (srcTitle) srcTitle.textContent = `Canvas Background (${bgType})`;
      if (srcDims) srcDims.textContent = `${cw} × ${ch} px`;
      if (btnStartCS) {
        btnStartCS.disabled = false;
        btnStartCS.textContent = '📸 Select Background Region';
      }
      if (clipMaskRow) clipMaskRow.style.display = 'none';
      this._syncSnipInputs();
    } else {
      if (currentImg) {
        if (srcTitle) srcTitle.textContent = currentImg.name || `Image ${currentImg.id}`;
        if (srcDims) srcDims.textContent = `${Math.round(currentImg.width)} × ${Math.round(currentImg.height)} px`;
        if (btnStartCS) {
          btnStartCS.disabled = false;
          btnStartCS.textContent = '✏️ Start Clipping Image';
        }
        if (clipMaskRow) clipMaskRow.style.display = 'block';
        this._syncClipInputs(currentImg);
      } else {
        if (srcTitle) srcTitle.textContent = 'No Image Selected';
        if (srcDims) srcDims.textContent = 'Select an image on canvas or layers, or switch to Background';
        if (btnStartCS) {
          btnStartCS.disabled = true;
          btnStartCS.textContent = '✏️ Start Clipping Image (No Image Selected)';
        }
        if (clipMaskRow) clipMaskRow.style.display = 'none';
      }
    }

    const isStageSelecting = window.Stage && (window.Stage.isClippingImage || window.Stage.isExtractingBg);
    const btnCapture = document.getElementById('btnCaptureSelectedArea');
    const btnCancelCS = document.getElementById('btnCancelClipSelection');
    if (btnCapture) btnCapture.disabled = !isStageSelecting;
    if (btnCancelCS) btnCancelCS.disabled = !isStageSelecting;

    this._syncPreviewButtons();

    // --- 2. BOTTOM SECTION (Crop Background) SYNC ---
    const cropBgName = document.getElementById('cropBackgroundName');
    const cropBgDims = document.getElementById('cropBackgroundDims');
    const cropNoBgWarn = document.getElementById('cropNoBackgroundWarning');
    const cropName = document.getElementById('cropSelectedImageName');
    const cropDims = document.getElementById('cropSelectedImageDims');
    const cropNoImgWarn = document.getElementById('cropNoImageWarning');
    const btnStartC = document.getElementById('btnStartCrop');
    const btnApplyC = document.getElementById('btnApplyCropInTools');
    const btnCancelC = document.getElementById('btnCancelCropInTools');
    const btnEditC = document.getElementById('btnEditCurrentCrop');
    const btnResetC = document.getElementById('btnResetCropToOriginal');
    const btnCommitC = document.getElementById('btnCommitCropModalTrigger');
    const btnBakeC = document.getElementById('btnToolBake');

    const photo = this._getBackgroundPhoto();
    const hasPhoto = !!(photo && (photo.src || photo.b64 || photo.dataUrl || photo.naturalWidth));

    if (hasPhoto) {
      const bgTitle = photo.filename || 'Background Photo';
      const nw = photo.naturalWidth || 1280;
      const nh = photo.naturalHeight || 720;
      const dimsStr = `Original: ${Math.round(nw)} × ${Math.round(nh)} px`;

      if (cropBgName) cropBgName.textContent = bgTitle;
      if (cropBgDims) cropBgDims.textContent = dimsStr;
      if (cropName) cropName.textContent = bgTitle;
      if (cropDims) cropDims.textContent = dimsStr;
      if (cropNoBgWarn) cropNoBgWarn.style.display = 'none';
      if (cropNoImgWarn) cropNoImgWarn.style.display = 'none';

      if (btnStartC) btnStartC.disabled = false;
      if (btnApplyC) btnApplyC.disabled = false;
      if (btnCancelC) btnCancelC.disabled = !(window.Stage && window.Stage.isCroppingImage);
      if (btnEditC) btnEditC.disabled = false;
      const btnCropMatch = document.getElementById('btnCropMatchCanvas');
      if (btnCropMatch) btnCropMatch.disabled = false;

      const isCropped = !!(photo.crop && photo.crop.enabled);
      if (btnResetC) btnResetC.disabled = !isCropped;
      if (btnCommitC) btnCommitC.disabled = !isCropped;
      if (btnBakeC) btnBakeC.disabled = !currentImg;

      this._renderBackgroundCropVersionsList(photo);
      this._syncBackgroundCropInputs(photo);

      // Diagnostic readout reflecting actual source and crop state
      const diagSourceDims = document.getElementById('diagSourceDims');
      const diagCropValues = document.getElementById('diagCropValues');
      if (diagSourceDims) {
        diagSourceDims.textContent = `${Math.round(nw)} × ${Math.round(nh)} px`;
      }
      if (diagCropValues) {
        if (photo.crop && photo.crop.enabled && photo.crop.sourceWidth > 0 && photo.crop.sourceHeight > 0) {
          const cx = Math.round(photo.crop.sourceX || 0);
          const cy = Math.round(photo.crop.sourceY || 0);
          const cw = Math.round(photo.crop.sourceWidth);
          const ch = Math.round(photo.crop.sourceHeight);
          diagCropValues.textContent = `X: ${cx}, Y: ${cy}, W: ${cw}, H: ${ch}`;
        } else {
          diagCropValues.textContent = 'Full bounds (uncropped)';
        }
      }

      const btnFullH = document.getElementById('btnCropFullHeight');
      const btnFullW = document.getElementById('btnCropFullWidth');
      const btnFullImg = document.getElementById('btnCropFullImage');
      if (btnFullH) btnFullH.disabled = false;
      if (btnFullW) btnFullW.disabled = false;
      if (btnFullImg) btnFullImg.disabled = false;
    } else {
      if (cropBgName) cropBgName.textContent = 'No Background Image';
      if (cropBgDims) cropBgDims.textContent = '—';
      if (cropName) cropName.textContent = 'No Background Image';
      if (cropDims) cropDims.textContent = '—';
      if (cropNoBgWarn) cropNoBgWarn.style.display = 'block';
      if (cropNoImgWarn) cropNoImgWarn.style.display = 'none';

      const diagSourceDims = document.getElementById('diagSourceDims');
      const diagCropValues = document.getElementById('diagCropValues');
      if (diagSourceDims) diagSourceDims.textContent = '—';
      if (diagCropValues) diagCropValues.textContent = '—';

      const btnFullH = document.getElementById('btnCropFullHeight');
      const btnFullW = document.getElementById('btnCropFullWidth');
      const btnFullImg = document.getElementById('btnCropFullImage');
      if (btnFullH) btnFullH.disabled = true;
      if (btnFullW) btnFullW.disabled = true;
      if (btnFullImg) btnFullImg.disabled = true;

      if (btnStartC) btnStartC.disabled = true;
      if (btnApplyC) btnApplyC.disabled = true;
      if (btnCancelC) btnCancelC.disabled = true;
      if (btnEditC) btnEditC.disabled = true;
      const btnCropMatch = document.getElementById('btnCropMatchCanvas');
      if (btnCropMatch) btnCropMatch.disabled = true;
      if (btnResetC) btnResetC.disabled = true;
      if (btnCommitC) btnCommitC.disabled = true;
      if (btnBakeC) btnBakeC.disabled = true;

      this._clearCropVersionsList();
    }

    // Mirror legacy card/label aliases
    const legacyName = document.getElementById('imageToolsSelectedName');
    if (legacyName && (cropBgName || cropName)) legacyName.textContent = (cropBgName || cropName).textContent;
    const legacyDims = document.getElementById('imageToolsOriginalDims');
    if (legacyDims && (cropBgDims || cropDims)) legacyDims.textContent = (cropBgDims || cropDims).textContent;
    const legacyRegTitle = document.getElementById('imageToolsRegionTitle');
    if (legacyRegTitle) {
      legacyRegTitle.textContent = (this.currentMode === 'clip') ? 'Clip Boundary' : ((this.currentMode === 'snip') ? 'Background Region' : 'Crop Region');
    }
    const btnClipMode = document.getElementById('btnModeClip');
    const btnSnipMode = document.getElementById('btnModeSnip');
    const btnCropMode = document.getElementById('btnModeCrop');
    if (btnClipMode) btnClipMode.classList.toggle('active', this.currentMode === 'clip');
    if (btnSnipMode) btnSnipMode.classList.toggle('active', this.currentMode === 'snip');
    if (btnCropMode) btnCropMode.classList.toggle('active', this.currentMode === 'crop');
  },

  _syncPreviewButtons() {
    const btnCreate = document.getElementById('btnCreateImageFromPreview');
    const btnPng = document.getElementById('btnExportClipPng');
    const btnJpeg = document.getElementById('btnExportClipJpeg');
    const btnWebp = document.getElementById('btnExportClipWebp');
    const btnDiscard = document.getElementById('btnDiscardPreview');
    const btnLegacyExport = document.getElementById('btnExportPreview');

    const hasPreview = !!(this._previewData && this._previewData.dataUrl);
    if (btnCreate) btnCreate.disabled = !hasPreview;
    if (btnPng) btnPng.disabled = !hasPreview;
    if (btnJpeg) btnJpeg.disabled = !hasPreview;
    if (btnWebp) btnWebp.disabled = !hasPreview;
    if (btnDiscard) btnDiscard.disabled = !hasPreview;
    if (btnLegacyExport) btnLegacyExport.disabled = !hasPreview;
  },

  // --- CROP WORKFLOW METHODS ---
  startCrop() {
    const photo = this._getBackgroundPhoto();
    if (!photo) {
      if (window.AppCoordinator) {
        window.AppCoordinator.showNotification('Add a background image in Canvas & Background to enable cropping.', 'warning', 2500);
      }
      return;
    }
    if (window.Stage) {
      window.Stage.startBackgroundCropMode();
    }
    this.syncUI();
  },

  applyCrop() {
    if (window.Stage && window.Stage.isCroppingImage) {
      window.Stage.applyCropMode();
      return;
    }

    const photo = this._getBackgroundPhoto();
    if (!photo) return;

    const parseCoord = (id1, id2, def) => {
      const v1 = document.getElementById(id1)?.value;
      if (v1 !== undefined && v1 !== null && v1 !== '') {
        const n = parseInt(v1, 10);
        if (!isNaN(n)) return n;
      }
      const v2 = document.getElementById(id2)?.value;
      if (v2 !== undefined && v2 !== null && v2 !== '') {
        const n = parseInt(v2, 10);
        if (!isNaN(n)) return n;
      }
      return def;
    };

    const x = Math.max(0, parseCoord('cropRegionX', 'toolRegionX', 0));
    const y = Math.max(0, parseCoord('cropRegionY', 'toolRegionY', 0));
    const w = Math.max(1, parseCoord('cropRegionW', 'toolRegionW', 10));
    const h = Math.max(1, parseCoord('cropRegionH', 'toolRegionH', 10));

    const vCount = (photo.cropVersions ? photo.cropVersions.filter(v => v.id && v.id.startsWith('crop-')).length : 0);
    const versionName = `Crop ${vCount + 1}`;

    const cropData = {
      enabled: true,
      sourceX: x,
      sourceY: y,
      sourceWidth: w,
      sourceHeight: h
    };

    if (window.EngineBridge && typeof window.EngineBridge.cropBackground === 'function') {
      window.EngineBridge.cropBackground(cropData, versionName);
    }

    const fitSel = document.getElementById('photoFitSelect');
    const fitMode = fitSel ? fitSel.value : 'match';
    if (fitMode === 'match' && typeof window.matchCanvasToPhoto === 'function') {
      window.matchCanvasToPhoto();
    } else {
      if (window.HistoryManager) window.HistoryManager.recordImmediate();
      if (window.AppCoordinator && typeof window.AppCoordinator.requestRender === 'function') {
        window.AppCoordinator.requestRender();
      } else if (typeof window.triggerAppRender === 'function') {
        window.triggerAppRender();
      }
    }
    if (window.AppCoordinator) {
      window.AppCoordinator.showNotification(`Applied background ${versionName}.`, 'success', 2500);
    }
    this.syncUI();
  },

  cancelCrop() {
    if (window.Stage && window.Stage.isCroppingImage) {
      window.Stage.cancelCropMode();
    }
    this.syncUI();
  },

  editCurrentCrop() {
    const photo = this._getBackgroundPhoto();
    if (photo && window.Stage) {
      window.Stage.startBackgroundCropMode();
    }
    this.syncUI();
  },

  resetCropToOriginal() {
    if (window.Stage && window.Stage.isCroppingImage) {
      window.Stage.cancelCropMode();
    }
    if (window.EngineBridge && typeof window.EngineBridge.resetBackgroundCrop === 'function') {
      window.EngineBridge.resetBackgroundCrop();
    }
    const fitSel = document.getElementById('photoFitSelect');
    const fitMode = fitSel ? fitSel.value : 'match';
    if (fitMode === 'match' && typeof window.matchCanvasToPhoto === 'function') {
      window.matchCanvasToPhoto();
    } else {
      if (window.HistoryManager) window.HistoryManager.recordImmediate();
      if (window.AppCoordinator && typeof window.AppCoordinator.requestRender === 'function') {
        window.AppCoordinator.requestRender();
      } else if (typeof window.triggerAppRender === 'function') {
        window.triggerAppRender();
      }
    }
    if (window.AppCoordinator) {
      window.AppCoordinator.showNotification('Background crop reset to Original.', 'info', 2500);
    }
    this.syncUI();
  },

  _renderBackgroundCropVersionsList(photo) {
    const listEl = document.getElementById('cropVersionsList') || document.getElementById('imageToolsPreviousCropsList');
    const currentLbl = document.getElementById('cropCurrentVersionLabel');
    const legacyLbl = document.getElementById('imageToolsCurrentCropLabel');
    if (!listEl) return;
    listEl.innerHTML = '';

    const natW = photo.naturalWidth || 1280;
    const natH = photo.naturalHeight || 720;

    if (!photo.cropVersions || !photo.cropVersions.length) {
      photo.cropVersions = [{
        id: 'original',
        name: 'Original',
        sourceX: 0,
        sourceY: 0,
        sourceWidth: natW,
        sourceHeight: natH
      }];
      photo.activeCropVersionId = 'original';
    }

    const activeId = photo.activeCropVersionId || 'original';
    const activeVer = photo.cropVersions.find((v) => v.id === activeId) || photo.cropVersions[0];
    const activeText = `Active: ${activeVer ? activeVer.name : 'Original'}`;
    if (currentLbl) currentLbl.textContent = activeText;
    if (legacyLbl) legacyLbl.textContent = activeText;

    photo.cropVersions.forEach((ver) => {
      const pill = document.createElement('div');
      pill.className = 'crop-version-pill' + (ver.id === activeId ? ' active' : '');
      pill.setAttribute('data-version-id', ver.id);
      if (pill.dataset) pill.dataset.versionId = ver.id;

      const info = document.createElement('div');
      info.className = 'crop-version-info';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'crop-version-name';
      nameSpan.textContent = ver.name || ver.id;

      const dimsSpan = document.createElement('span');
      dimsSpan.className = 'crop-version-dims';
      const w = Math.round(ver.sourceWidth || 0);
      const h = Math.round(ver.sourceHeight || 0);
      dimsSpan.textContent = `${w} × ${h} px` + (ver.id === 'original' ? ' (full)' : '');

      info.appendChild(nameSpan);
      info.appendChild(dimsSpan);
      pill.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'crop-version-actions';

      const btnRename = document.createElement('button');
      btnRename.type = 'button';
      btnRename.className = 'crop-version-btn';
      btnRename.title = 'Rename crop version';
      btnRename.textContent = '✏️';
      btnRename.addEventListener('click', (e) => {
        e.stopPropagation();
        this.renameBackgroundCropVersion(ver);
      });
      actions.appendChild(btnRename);

      if (ver.id !== 'original') {
        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'crop-version-btn crop-version-del';
        btnDel.title = 'Delete crop version';
        btnDel.textContent = '✕';
        btnDel.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteBackgroundCropVersion(ver);
        });
        actions.appendChild(btnDel);
      }

      pill.appendChild(actions);

      pill.addEventListener('click', () => {
        this.selectBackgroundCropVersion(ver);
      });

      listEl.appendChild(pill);
    });
  },

  selectBackgroundCropVersion(ver) {
    if (!ver) return;
    if (window.EngineBridge && typeof window.EngineBridge.selectBackgroundCropVersion === 'function') {
      window.EngineBridge.selectBackgroundCropVersion(ver.id);
    }
    const fitSel = document.getElementById('photoFitSelect');
    const fitMode = fitSel ? fitSel.value : 'match';
    if (fitMode === 'match' && typeof window.matchCanvasToPhoto === 'function') {
      window.matchCanvasToPhoto();
    } else {
      if (window.HistoryManager) window.HistoryManager.recordImmediate();
      if (window.AppCoordinator && typeof window.AppCoordinator.requestRender === 'function') {
        window.AppCoordinator.requestRender();
      } else if (typeof window.triggerAppRender === 'function') {
        window.triggerAppRender();
      }
    }
    if (window.AppCoordinator) {
      window.AppCoordinator.showNotification(`Switched to crop "${ver.name}".`, 'info', 2000);
    }
    this.syncUI();
  },

  renameBackgroundCropVersion(ver) {
    if (!ver) return;
    const newName = prompt('Enter new name for crop version:', ver.name);
    if (newName && newName.trim() && newName.trim() !== ver.name) {
      const cleanName = newName.trim();
      if (window.EngineBridge && typeof window.EngineBridge.renameBackgroundCropVersion === 'function') {
        window.EngineBridge.renameBackgroundCropVersion(ver.id, cleanName);
      }
      if (window.HistoryManager) window.HistoryManager.recordImmediate();
      this.syncUI();
    }
  },

  deleteBackgroundCropVersion(ver) {
    if (!ver || ver.id === 'original') return;
    if (window.EngineBridge && typeof window.EngineBridge.deleteBackgroundCropVersion === 'function') {
      window.EngineBridge.deleteBackgroundCropVersion(ver.id);
    }
    if (window.HistoryManager) window.HistoryManager.recordImmediate();
    if (window.AppCoordinator && typeof window.AppCoordinator.requestRender === 'function') {
      window.AppCoordinator.requestRender();
    } else if (typeof window.triggerAppRender === 'function') {
      window.triggerAppRender();
    }
    if (window.AppCoordinator) {
      window.AppCoordinator.showNotification(`Deleted crop "${ver.name}".`, 'info', 2000);
    }
    this.syncUI();
  },

  _syncBackgroundCropInputs(photo) {
    const rx = document.getElementById('cropRegionX');
    const ry = document.getElementById('cropRegionY');
    const rw = document.getElementById('cropRegionW');
    const rh = document.getElementById('cropRegionH');

    let x = 0, y = 0, w = photo.naturalWidth || 1280, h = photo.naturalHeight || 720;
    if (photo.crop && photo.crop.enabled && photo.crop.sourceWidth > 0 && photo.crop.sourceHeight > 0) {
      x = photo.crop.sourceX || 0;
      y = photo.crop.sourceY || 0;
      w = photo.crop.sourceWidth;
      h = photo.crop.sourceHeight;
    }

    if (rx) rx.value = Math.round(x);
    if (ry) ry.value = Math.round(y);
    if (rw) rw.value = Math.round(w);
    if (rh) rh.value = Math.round(h);

    const tx = document.getElementById('toolRegionX');
    const ty = document.getElementById('toolRegionY');
    const tw = document.getElementById('toolRegionW');
    const th = document.getElementById('toolRegionH');
    if (tx) tx.value = Math.round(x);
    if (ty) ty.value = Math.round(y);
    if (tw) tw.value = Math.round(w);
    if (th) th.value = Math.round(h);
  },

  _renderCropVersionsList(img) {
    const listEl = document.getElementById('cropVersionsList') || document.getElementById('imageToolsPreviousCropsList');
    const currentLbl = document.getElementById('cropCurrentVersionLabel');
    const legacyLbl = document.getElementById('imageToolsCurrentCropLabel');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!img.cropVersions || !img.cropVersions.length) {
      const nw = img.naturalWidth || img.width || 200;
      const nh = img.naturalHeight || img.height || 150;
      img.cropVersions = [{
        id: 'original',
        name: 'Original',
        sourceX: 0,
        sourceY: 0,
        sourceWidth: nw,
        sourceHeight: nh,
        width: img.width || nw,
        height: img.height || nh,
        x: img.x,
        y: img.y,
        origX: img.x,
        origY: img.y,
        origWidth: img.width || nw,
        origHeight: img.height || nh
      }];
      img.activeCropVersionId = 'original';
    }

    const activeId = img.activeCropVersionId || 'original';
    const activeVer = img.cropVersions.find((v) => v.id === activeId) || img.cropVersions[0];
    const activeText = `Active: ${activeVer ? activeVer.name : 'Original'}`;
    if (currentLbl) currentLbl.textContent = activeText;
    if (legacyLbl) legacyLbl.textContent = activeText;

    img.cropVersions.forEach((ver) => {
      const pill = document.createElement('div');
      pill.className = 'crop-version-pill' + (ver.id === activeId ? ' active' : '');
      pill.setAttribute('data-version-id', ver.id);
      if (pill.dataset) pill.dataset.versionId = ver.id;

      const info = document.createElement('div');
      info.className = 'crop-version-info';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'crop-version-name';
      nameSpan.textContent = ver.name || ver.id;

      const dimsSpan = document.createElement('span');
      dimsSpan.className = 'crop-version-dims';
      const w = Math.round(ver.width || ver.sourceWidth || 0);
      const h = Math.round(ver.height || ver.sourceHeight || 0);
      dimsSpan.textContent = `${w} × ${h} px` + (ver.id === 'original' ? ' (base)' : '');

      info.appendChild(nameSpan);
      info.appendChild(dimsSpan);
      pill.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'crop-version-actions';

      const btnRename = document.createElement('button');
      btnRename.type = 'button';
      btnRename.className = 'crop-version-btn';
      btnRename.title = 'Rename crop version';
      btnRename.textContent = '✏️';
      btnRename.addEventListener('click', (e) => {
        e.stopPropagation();
        this.renameCropVersion(img, ver);
      });
      actions.appendChild(btnRename);

      if (ver.id !== 'original') {
        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'crop-version-btn crop-version-del';
        btnDel.title = 'Delete crop version';
        btnDel.textContent = '✕';
        btnDel.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteCropVersion(img, ver);
        });
        actions.appendChild(btnDel);
      }

      pill.appendChild(actions);

      pill.addEventListener('click', () => {
        this.selectCropVersion(img, ver);
      });

      listEl.appendChild(pill);
    });
  },

  _clearCropVersionsList() {
    const listEl = document.getElementById('cropVersionsList') || document.getElementById('imageToolsPreviousCropsList');
    if (listEl) listEl.innerHTML = '';
    const currentLbl = document.getElementById('cropCurrentVersionLabel');
    if (currentLbl) currentLbl.textContent = 'Active: —';
    const legacyLbl = document.getElementById('imageToolsCurrentCropLabel');
    if (legacyLbl) legacyLbl.textContent = 'Active: —';
  },

  selectCropVersion(img, ver) {
    if (!img || !ver) return;
    if (window.EngineBridge && typeof window.EngineBridge.selectCropVersion === 'function' && window.EngineBridge.isReady()) {
      window.EngineBridge.selectCropVersion(img.id, ver.id);
    } else if (window.ImageObjects && typeof window.ImageObjects.selectCropVersion === 'function') {
      window.ImageObjects.selectCropVersion(img.id, ver.id);
    }
    if (window.HistoryManager) window.HistoryManager.recordImmediate();
    if (window.AppCoordinator && typeof window.AppCoordinator.requestRender === 'function') {
      window.AppCoordinator.requestRender();
    } else if (typeof window.triggerAppRender === 'function') {
      window.triggerAppRender();
    }
    if (window.AppCoordinator) {
      window.AppCoordinator.selectObject('image', img.id, { openAccordionId: 'acc-image-tools' });
      window.AppCoordinator.updateActiveOverlays();
      window.AppCoordinator.showNotification(`Switched to crop "${ver.name}".`, 'info', 2000);
    }
    if (typeof window.syncImageEditorUI === 'function') window.syncImageEditorUI();
    this.syncUI();
  },

  renameCropVersion(img, ver) {
    if (!img || !ver) return;
    const newName = prompt('Enter new name for crop version:', ver.name);
    if (newName && newName.trim() && newName.trim() !== ver.name) {
      const cleanName = newName.trim();
      if (window.EngineBridge && typeof window.EngineBridge.renameCropVersion === 'function' && window.EngineBridge.isReady()) {
        window.EngineBridge.renameCropVersion(img.id, ver.id, cleanName);
      } else if (window.ImageObjects && typeof window.ImageObjects.renameCropVersion === 'function') {
        window.ImageObjects.renameCropVersion(img.id, ver.id, cleanName);
      }
      if (window.HistoryManager) window.HistoryManager.recordImmediate();
      this.syncUI();
    }
  },

  deleteCropVersion(img, ver) {
    if (!img || !ver || ver.id === 'original') return;
    if (window.EngineBridge && typeof window.EngineBridge.deleteCropVersion === 'function' && window.EngineBridge.isReady()) {
      window.EngineBridge.deleteCropVersion(img.id, ver.id);
    } else if (window.ImageObjects && typeof window.ImageObjects.deleteCropVersion === 'function') {
      window.ImageObjects.deleteCropVersion(img.id, ver.id);
    }
    if (window.HistoryManager) window.HistoryManager.recordImmediate();
    if (window.AppCoordinator && typeof window.AppCoordinator.requestRender === 'function') {
      window.AppCoordinator.requestRender();
    } else if (typeof window.triggerAppRender === 'function') {
      window.triggerAppRender();
    }
    if (window.AppCoordinator) {
      window.AppCoordinator.selectObject('image', img.id, { openAccordionId: 'acc-image-tools' });
      window.AppCoordinator.updateActiveOverlays();
      window.AppCoordinator.showNotification(`Deleted crop "${ver.name}".`, 'info', 2000);
    }
    if (typeof window.syncImageEditorUI === 'function') window.syncImageEditorUI();
    this.syncUI();
  },

  openCommitCropModal() {
    const sel = window.AppCoordinator?.getActiveSelection();
    const hasImageSelected = !!(sel && sel.type === 'image' && sel.id && window.ImageObjects && window.ImageObjects.getImage(sel.id));
    const resRow = document.getElementById('commitCropResolutionRow');
    const resSelect = document.getElementById('commitCropResolutionSelect');
    const resSummary = document.getElementById('commitCropResSummary');
    if (hasImageSelected) {
      const img = window.ImageObjects.getImage(sel.id);
      const modal = document.getElementById('commitCropModal');
      const nameEl = document.getElementById('commitCropModalImageName');
      if (nameEl) nameEl.textContent = img.name || `Image ${img.id}`;
      if (resRow) resRow.style.display = 'block';
      if (resSelect) {
        const dispW = Math.max(1, Math.round(Number(img.width) || 49));
        const dispH = Math.max(1, Math.round(Number(img.height) || 49));
        const srcW = Math.max(1, Math.round((img.crop && img.crop.enabled && img.crop.sourceWidth > 0) ? img.crop.sourceWidth : (Number(img.naturalWidth) || dispW)));
        const srcH = Math.max(1, Math.round((img.crop && img.crop.enabled && img.crop.sourceHeight > 0) ? img.crop.sourceHeight : (Number(img.naturalHeight) || dispH)));
        const calcDims = (mult) => {
          const tw = Math.ceil(dispW * mult);
          const th = Math.ceil(dispH * mult);
          if (srcW <= tw && srcH <= th) return { w: srcW, h: srcH, capped: true };
          const sc = Math.min(tw / srcW, th / srcH);
          return { w: Math.max(1, Math.round(srcW * sc)), h: Math.max(1, Math.round(srcH * sc)), capped: false };
        };
        const d1 = calcDims(1);
        const d2 = calcDims(2);
        const d3 = calcDims(3);
        const can3x = (srcW > dispW * 2 || srcH > dispH * 2);
        resSelect.innerHTML = [
          `<option value="1x">1× Display Size (${d1.w} × ${d1.h} px — Smallest File Size)</option>`,
          `<option value="2x" selected>2× Display Size (${d2.w} × ${d2.h} px — HiDPI Recommended)</option>`,
          `<option value="3x"${can3x ? '' : ' disabled'}>3× Display Size (${d3.w} × ${d3.h} px${can3x ? ' — Ultra HiDPI' : ' — Source ≤ 2× Display Size'})</option>`,
          `<option value="original">Original Source Pixel Resolution (${srcW} × ${srcH} px)</option>`
        ].join('');
        const updateSummary = () => {
          if (!resSummary) return;
          const v = resSelect.value;
          const chosen = v === '1x' ? d1 : (v === '2x' ? d2 : (v === '3x' ? d3 : { w: srcW, h: srcH }));
          resSummary.textContent = `Source: ${srcW} × ${srcH} px (Display: ${dispW} × ${dispH} px) → Baked Raster: ${chosen.w} × ${chosen.h} px`;
        };
        resSelect.onchange = updateSummary;
        updateSummary();
      }
      if (modal) modal.style.display = 'flex';
      return;
    }
    const photo = this._getBackgroundPhoto();
    if (photo && photo.crop && photo.crop.enabled) {
      const modal = document.getElementById('commitCropModal');
      const nameEl = document.getElementById('commitCropModalImageName');
      if (nameEl) nameEl.textContent = photo.filename || 'Canvas Background Photo';
      if (resRow) resRow.style.display = 'none';
      if (modal) modal.style.display = 'flex';
      return;
    }
    if (photo) {
      if (window.AppCoordinator) window.AppCoordinator.showNotification('Background has no active crop to commit.', 'warning', 2500);
      return;
    }
    if (window.AppCoordinator) window.AppCoordinator.showNotification('Select an image or add a cropped background to commit crop.', 'warning', 2500);
  },

  closeCommitCropModal() {
    const modal = document.getElementById('commitCropModal');
    if (modal) modal.style.display = 'none';
  },

  commitCurrentCrop(discardVersions = false) {
    const sel = window.AppCoordinator?.getActiveSelection();
    const isImageSelected = !!(sel && sel.type === 'image' && sel.id && window.ImageObjects && window.ImageObjects.getImage(sel.id));

    if (isImageSelected) {
      const img = window.ImageObjects.getImage(sel.id);
      const resPolicy = document.getElementById('commitCropResolutionSelect')?.value || 'original';
      const origDisplayW = Number(img.width) || 0;
      const origDisplayH = Number(img.height) || 0;
      this._extractCroppedImageDataUrl(img, (res) => {
        this.closeCommitCropModal();
        if (!res || !res.dataUrl) {
          if (window.AppCoordinator) window.AppCoordinator.showNotification('Failed to commit crop: could not extract pixels.', 'error', 3000);
          return;
        }

        const keepDisplayDims = (resPolicy === '1x' || resPolicy === '2x' || resPolicy === '3x') && origDisplayW > 0 && origDisplayH > 0;
        const commitOptions = {
          src: res.dataUrl,
          newSrc: res.dataUrl,
          naturalWidth: res.sw,
          naturalHeight: res.sh,
          width: keepDisplayDims ? origDisplayW : res.sw,
          height: keepDisplayDims ? origDisplayH : res.sh,
          discardVersions: !!discardVersions
        };

        let commitSuccess = false;
        let commitError = null;

        if (window.EngineBridge && typeof window.EngineBridge.commitCrop === 'function' && window.EngineBridge.isReady()) {
          const cRes = window.EngineBridge.commitCrop(img.id, commitOptions);
          if (cRes && cRes.success) {
            commitSuccess = true;
          } else {
            commitError = (cRes && cRes.error) || 'Failed to commit crop in Go engine';
          }
        } else if (window.ImageObjects && typeof window.ImageObjects.commitCrop === 'function') {
          const cRes = window.ImageObjects.commitCrop(img.id, commitOptions);
          commitSuccess = !!cRes;
        }

        if (!commitSuccess) {
          if (window.AppCoordinator) window.AppCoordinator.showNotification(`Cannot commit crop: ${commitError || 'operation failed'}.`, 'error', 3500);
          return;
        }

        if (window.HistoryManager) window.HistoryManager.recordImmediate();
        if (window.AppCoordinator && typeof window.AppCoordinator.requestRender === 'function') {
          window.AppCoordinator.requestRender();
        } else if (typeof window.triggerAppRender === 'function') {
          window.triggerAppRender();
        }
        if (window.AppCoordinator) {
          window.AppCoordinator.selectObject('image', img.id, { openAccordionId: 'acc-image-tools' });
          window.AppCoordinator.updateActiveOverlays();
          window.AppCoordinator.showNotification(
            discardVersions ? `Image baked (${res.sw}×${res.sh} px): previous versions discarded.` : `Image baked (${res.sw}×${res.sh} px): base asset updated.`,
            'success',
            3000
          );
        }
        if (typeof window.syncImageEditorUI === 'function') window.syncImageEditorUI();
        this.syncUI();
      }, resPolicy);
      return;
    }

    const photo = this._getBackgroundPhoto();
    if (photo) {
      const crop = photo.crop;
      const hasCrop = crop && crop.enabled !== false && (
        (crop.sourceWidth || crop.width) > 0 &&
        (crop.sourceHeight || crop.height) > 0
      );
      if (!hasCrop) {
        this.closeCommitCropModal();
        if (window.AppCoordinator) window.AppCoordinator.showNotification('Background has no active crop to commit.', 'warning', 2500);
        return;
      }
      if (!discardVersions) {
        this.closeCommitCropModal();
        if (window.AppCoordinator) {
          window.AppCoordinator.showNotification(
            'Cannot commit background crop while preserving versions. Choose "Discard Previous Versions" to bake the crop, or use crop versions.',
            'warning',
            4000
          );
        }
        return;
      }

      this._extractCroppedImageDataUrl(photo, (res) => {
        this.closeCommitCropModal();
        if (!res || !res.dataUrl) {
          if (window.AppCoordinator) window.AppCoordinator.showNotification('Failed to commit crop: could not extract pixels.', 'error', 3000);
          return;
        }

        const newB64 = res.dataUrl.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

        let bgCommitSuccess = false;
        let bgCommitError = null;

        if (window.EngineBridge && typeof window.EngineBridge.commitBackgroundCrop === 'function' && window.EngineBridge.isReady()) {
          const bgRes = window.EngineBridge.commitBackgroundCrop({ newB64: res.dataUrl, discardVersions: true });
          if (bgRes && bgRes.success) {
            bgCommitSuccess = true;
          } else {
            bgCommitError = (bgRes && bgRes.error) || 'Failed to commit background crop in Go engine';
          }
        } else {
          bgCommitSuccess = true;
        }

        if (!bgCommitSuccess) {
          if (window.AppCoordinator) window.AppCoordinator.showNotification(`Cannot commit background crop: ${bgCommitError || 'operation failed'}.`, 'error', 3500);
          return;
        }

        photo.b64 = newB64;
        photo.src = res.dataUrl;
        photo.dataUrl = res.dataUrl;
        photo.dataURL = res.dataUrl;
        photo.data = res.dataUrl;
        photo.naturalWidth = res.sw;
        photo.naturalHeight = res.sh;
        photo.crop = null;
        photo.cropVersions = [{ id: 'original', name: 'Original', sourceX: 0, sourceY: 0, sourceWidth: res.sw, sourceHeight: res.sh }];
        photo.activeCropVersionId = 'original';

        if (typeof window.hydrateLoadedPhoto === 'function') {
          window.hydrateLoadedPhoto(photo);
        } else if (typeof window.setLoadedPhoto === 'function') {
          window.setLoadedPhoto(photo, { hydrateOnly: true });
        }

        if (window.matchCanvasToPhoto && typeof window.matchCanvasToPhoto === 'function') {
          const fitSelect = document.getElementById('photoFitSelect');
          if (fitSelect && fitSelect.value === 'match') {
            window.matchCanvasToPhoto();
          }
        }

        if (window.HistoryManager) window.HistoryManager.recordImmediate();
        if (window.AppCoordinator && typeof window.AppCoordinator.requestRender === 'function') {
          window.AppCoordinator.requestRender();
        } else if (typeof window.triggerAppRender === 'function') {
          window.triggerAppRender();
        }
        if (window.AppCoordinator) {
          window.AppCoordinator.showNotification('Background crop baked into new base image and previous versions discarded.', 'success', 2500);
        }
        this.syncUI();
      });
      return;
    }

    this.closeCommitCropModal();
    if (window.AppCoordinator) window.AppCoordinator.showNotification('Select an image or add a background to commit crop.', 'warning', 2500);
  },

  _syncCropInputs(img) {
    let srcX = 0, srcY = 0;
    let srcW = img.naturalWidth || img.width || 200;
    let srcH = img.naturalHeight || img.height || 150;

    if (window.Stage && window.Stage.isCroppingImage && window.Stage.cropBox && window.Stage.cropOrigBounds) {
      const b = window.Stage.cropBox;
      const ob = window.Stage.cropOrigBounds;
      const scaleX = (img.naturalWidth || img.width) / ob.w;
      const scaleY = (img.naturalHeight || img.height) / ob.h;
      srcX = Math.round(Math.max(0, (b.x - ob.left) * scaleX));
      srcY = Math.round(Math.max(0, (b.y - ob.top) * scaleY));
      srcW = Math.max(10, Math.min(img.naturalWidth || img.width, Math.round(b.w * scaleX)));
      srcH = Math.max(10, Math.min(img.naturalHeight || img.height, Math.round(b.h * scaleY)));
    } else if (img.crop && img.crop.enabled && img.crop.sourceWidth > 0 && img.crop.sourceHeight > 0) {
      srcX = Math.round(img.crop.sourceX);
      srcY = Math.round(img.crop.sourceY);
      srcW = Math.round(img.crop.sourceWidth);
      srcH = Math.round(img.crop.sourceHeight);
    }

    const ix = document.getElementById('cropRegionX');
    const iy = document.getElementById('cropRegionY');
    const iw = document.getElementById('cropRegionW');
    const ih = document.getElementById('cropRegionH');
    if (ix && document.activeElement !== ix) ix.value = Math.round(srcX);
    if (iy && document.activeElement !== iy) iy.value = Math.round(srcY);
    if (iw && document.activeElement !== iw) iw.value = Math.round(srcW);
    if (ih && document.activeElement !== ih) ih.value = Math.round(srcH);

    // Sync legacy inputs
    const tx = document.getElementById('toolRegionX');
    const ty = document.getElementById('toolRegionY');
    const tw = document.getElementById('toolRegionW');
    const th = document.getElementById('toolRegionH');
    if (tx) tx.value = Math.round(srcX);
    if (ty) ty.value = Math.round(srcY);
    if (tw) tw.value = Math.round(srcW);
    if (th) th.value = Math.round(srcH);
  },

  syncFromStageCrop() {
    if (window.Stage && window.Stage.isCroppingBackground && window.Stage.cropBox && window.Stage.cropOrigBounds) {
      const b = window.Stage.cropBox;
      const ob = window.Stage.cropOrigBounds;
      const scaleX = ob.w / ob.natW;
      const scaleY = ob.h / ob.natH;
      let srcX = Math.round((b.x - ob.left) / scaleX);
      let srcY = Math.round((b.y - ob.top) / scaleY);
      let srcW = Math.round(b.w / scaleX);
      let srcH = Math.round(b.h / scaleY);

      if (Math.abs(b.x - ob.left) <= 1.5 || srcX <= 1) srcX = 0;
      if (Math.abs(b.y - ob.top) <= 1.5 || srcY <= 1) srcY = 0;
      if (Math.abs((b.x + b.w) - (ob.left + ob.w)) <= 1.5 || (srcX + srcW >= ob.natW - 1)) srcW = ob.natW - srcX;
      if (Math.abs((b.y + b.h) - (ob.top + ob.h)) <= 1.5 || (srcY + srcH >= ob.natH - 1)) srcH = ob.natH - srcY;

      srcX = Math.max(0, Math.min(ob.natW - 1, srcX));
      srcY = Math.max(0, Math.min(ob.natH - 1, srcY));
      srcW = Math.max(1, Math.min(ob.natW - srcX, srcW));
      srcH = Math.max(1, Math.min(ob.natH - srcY, srcH));

      const rx = document.getElementById('cropRegionX');
      const ry = document.getElementById('cropRegionY');
      const rw = document.getElementById('cropRegionW');
      const rh = document.getElementById('cropRegionH');
      if (rx && document.activeElement !== rx) rx.value = srcX;
      if (ry && document.activeElement !== ry) ry.value = srcY;
      if (rw && document.activeElement !== rw) rw.value = srcW;
      if (rh && document.activeElement !== rh) rh.value = srcH;

      const tx = document.getElementById('toolRegionX');
      const ty = document.getElementById('toolRegionY');
      const tw = document.getElementById('toolRegionW');
      const th = document.getElementById('toolRegionH');
      if (tx) tx.value = srcX;
      if (ty) ty.value = srcY;
      if (tw) tw.value = srcW;
      if (th) th.value = srcH;

      const diagCropValues = document.getElementById('diagCropValues');
      if (diagCropValues) {
        diagCropValues.textContent = `X: ${srcX}, Y: ${srcY}, W: ${srcW}, H: ${srcH} (live)`;
      }
      return;
    }
    const sel = window.AppCoordinator?.getActiveSelection();
    if (sel && sel.type === 'image' && window.ImageObjects) {
      const img = window.ImageObjects.getImage(sel.id);
      if (img) this._syncCropInputs(img);
    }
  },

  _onCropInputChange() {
    const parseCoord = (id1, id2, def) => {
      const v1 = document.getElementById(id1)?.value;
      if (v1 !== undefined && v1 !== null && v1 !== '') {
        const n = parseInt(v1, 10);
        if (!isNaN(n)) return n;
      }
      const v2 = document.getElementById(id2)?.value;
      if (v2 !== undefined && v2 !== null && v2 !== '') {
        const n = parseInt(v2, 10);
        if (!isNaN(n)) return n;
      }
      return def;
    };

    const x = Math.max(0, parseCoord('cropRegionX', 'toolRegionX', 0));
    const y = Math.max(0, parseCoord('cropRegionY', 'toolRegionY', 0));
    const w = Math.max(1, parseCoord('cropRegionW', 'toolRegionW', 10));
    const h = Math.max(1, parseCoord('cropRegionH', 'toolRegionH', 10));

    const tx = document.getElementById('toolRegionX');
    const ty = document.getElementById('toolRegionY');
    const tw = document.getElementById('toolRegionW');
    const th = document.getElementById('toolRegionH');
    if (tx) tx.value = x;
    if (ty) ty.value = y;
    if (tw) tw.value = w;
    if (th) th.value = h;

    if (window.Stage && window.Stage.isCroppingImage && window.Stage.cropOrigBounds) {
      const ob = window.Stage.cropOrigBounds;
      const nw = ob.natW || 1280;
      const nh = ob.natH || 720;
      const scaleX = ob.w / nw;
      const scaleY = ob.h / nh;
      window.Stage.cropBox = {
        x: ob.left + x * scaleX,
        y: ob.top + y * scaleY,
        w: Math.min(ob.w - (x * scaleX), w * scaleX),
        h: Math.min(ob.h - (y * scaleY), h * scaleY)
      };
      window.Stage.updateCropOverlayUI();

      const diagCropValues = document.getElementById('diagCropValues');
      if (diagCropValues) {
        diagCropValues.textContent = `X: ${x}, Y: ${y}, W: ${w}, H: ${h} (editing)`;
      }
    }
  },

  setCropFullHeight() {
    const photo = this._getBackgroundPhoto();
    if (!photo) return;
    const nh = photo.naturalHeight || 720;
    const ry = document.getElementById('cropRegionY');
    const rh = document.getElementById('cropRegionH');
    const ty = document.getElementById('toolRegionY');
    const th = document.getElementById('toolRegionH');
    if (ry) ry.value = 0;
    if (rh) rh.value = Math.round(nh);
    if (ty) ty.value = 0;
    if (th) th.value = Math.round(nh);

    if (window.Stage && window.Stage.isCroppingImage && window.Stage.cropOrigBounds) {
      const ob = window.Stage.cropOrigBounds;
      window.Stage.cropBox.y = ob.top;
      window.Stage.cropBox.h = ob.h;
      window.Stage.updateCropOverlayUI();
      this.syncFromStageCrop();
    }
  },

  setCropFullWidth() {
    const photo = this._getBackgroundPhoto();
    if (!photo) return;
    const nw = photo.naturalWidth || 1280;
    const rx = document.getElementById('cropRegionX');
    const rw = document.getElementById('cropRegionW');
    const tx = document.getElementById('toolRegionX');
    const tw = document.getElementById('toolRegionW');
    if (rx) rx.value = 0;
    if (rw) rw.value = Math.round(nw);
    if (tx) tx.value = 0;
    if (tw) tw.value = Math.round(nw);

    if (window.Stage && window.Stage.isCroppingImage && window.Stage.cropOrigBounds) {
      const ob = window.Stage.cropOrigBounds;
      window.Stage.cropBox.x = ob.left;
      window.Stage.cropBox.w = ob.w;
      window.Stage.updateCropOverlayUI();
      this.syncFromStageCrop();
    }
  },

  setCropFullImage() {
    const photo = this._getBackgroundPhoto();
    if (!photo) return;
    const nw = photo.naturalWidth || 1280;
    const nh = photo.naturalHeight || 720;
    const rx = document.getElementById('cropRegionX');
    const ry = document.getElementById('cropRegionY');
    const rw = document.getElementById('cropRegionW');
    const rh = document.getElementById('cropRegionH');
    const tx = document.getElementById('toolRegionX');
    const ty = document.getElementById('toolRegionY');
    const tw = document.getElementById('toolRegionW');
    const th = document.getElementById('toolRegionH');
    if (rx) rx.value = 0;
    if (ry) ry.value = 0;
    if (rw) rw.value = Math.round(nw);
    if (rh) rh.value = Math.round(nh);
    if (tx) tx.value = 0;
    if (ty) ty.value = 0;
    if (tw) tw.value = Math.round(nw);
    if (th) th.value = Math.round(nh);

    if (window.Stage && window.Stage.isCroppingImage && window.Stage.cropOrigBounds) {
      const ob = window.Stage.cropOrigBounds;
      window.Stage.cropBox = {
        x: ob.left,
        y: ob.top,
        w: ob.w,
        h: ob.h
      };
      window.Stage.updateCropOverlayUI();
      this.syncFromStageCrop();
    }
  },

  // --- CLIP & SNIP WORKFLOW METHODS ---
  startClipSnip() {
    if (this.clipSnipSource === 'image') {
      const sel = window.AppCoordinator?.getActiveSelection();
      if (sel && sel.type === 'image' && sel.id && window.Stage) {
        window.Stage.startClipMode(sel.id);
      } else if (window.AppCoordinator) {
        window.AppCoordinator.showNotification('Select an image on the canvas or layers to clip.', 'warning', 2500);
      }
    } else {
      if (window.Stage && typeof window.Stage.startBgExtractMode === 'function') {
        window.Stage.startBgExtractMode();
      }
    }
    this.syncUI();
  },

  captureSelectedArea() {
    if (window.Stage && window.Stage.isClippingImage) {
      window.Stage.confirmClipAreaMode();
    } else if (window.Stage && window.Stage.isExtractingBg) {
      window.Stage.confirmBgExtractMode();
    } else {
      if (this.clipSnipSource === 'image') {
        this.confirmClipAreaFromActive();
      } else {
        this.confirmBgSnipFromActive();
      }
    }
  },

  cancelClipSelection() {
    if (window.Stage) {
      if (window.Stage.isClippingImage) window.Stage.cancelClipMode();
      if (window.Stage.isExtractingBg) window.Stage.cancelBgExtractMode();
    }
    this.syncUI();
  },

  confirmClipArea(img, clipRect) {
    if (!img || !clipRect || clipRect.w < 10 || clipRect.h < 10) return;
    this._clipCounter++;
    this._extractClippedImageDataUrl(img, clipRect, (res) => {
      if (!res || !res.dataUrl) {
        if (window.AppCoordinator) window.AppCoordinator.showNotification('Failed to capture clipped area.', 'error', 3000);
        return;
      }

      this._previewData = {
        dataUrl: res.dataUrl,
        w: Math.round(clipRect.w),
        h: Math.round(clipRect.h),
        naturalWidth: Math.round(res.sw),
        naturalHeight: Math.round(res.sh),
        name: `${img.name || 'Image'} Clip ${this._clipCounter}`,
        xPct: img.x,
        yPct: img.y
      };

      const nameIn = document.getElementById('imageToolsPreviewName');
      if (nameIn) nameIn.value = this._previewData.name;

      this._drawPreviewCanvasFromDataUrl(res.dataUrl, res.sw, res.sh);
      this._updatePreviewMeta(clipRect.w, clipRect.h, `Clipped area from "${img.name || 'Image'}"`);
      this._syncPreviewButtons();

      if (window.AppCoordinator) {
        window.AppCoordinator.showNotification('Clipped area captured to preview. Click Create Image Object or Export.', 'success', 3000);
      }
    });
  },

  confirmClipAreaFromActive() {
    const sel = window.AppCoordinator?.getActiveSelection();
    if (!sel || sel.type !== 'image' || !sel.id || !window.ImageObjects) {
      if (window.AppCoordinator) window.AppCoordinator.showNotification('Select an image to clip.', 'warning', 2500);
      return;
    }
    const img = window.ImageObjects.getImage(sel.id);
    if (!img) return;

    const x = Math.max(0, parseInt(document.getElementById('clipRegionX')?.value, 10) || 0);
    const y = Math.max(0, parseInt(document.getElementById('clipRegionY')?.value, 10) || 0);
    const w = Math.max(10, parseInt(document.getElementById('clipRegionW')?.value, 10) || 10);
    const h = Math.max(10, parseInt(document.getElementById('clipRegionH')?.value, 10) || 10);
    this.confirmClipArea(img, { x, y, w, h });
  },

  confirmBgSnip(box, opts = {}) {
    if (!box || box.w < 10 || box.h < 10) return;
    this._snipCounter++;
    this._extractBackgroundSnipDataUrl(box, (res) => {
      if (!res || !res.dataUrl) {
        if (window.AppCoordinator) window.AppCoordinator.showNotification('Failed to capture background snip.', 'error', 3000);
        return;
      }

      const cw = (window.Stage && window.Stage.canvasWidth) || 1280;
      const ch = (window.Stage && window.Stage.canvasHeight) || 720;
      const centerX = box.x + box.w / 2;
      const centerY = box.y + box.h / 2;
      const xPct = Math.round(((centerX / cw) * 100) * 1000) / 1000;
      const yPct = Math.round(((centerY / ch) * 100) * 1000) / 1000;

      this._previewData = {
        dataUrl: res.dataUrl,
        w: Math.round(res.sw),
        h: Math.round(res.sh),
        naturalWidth: Math.round(res.sw),
        naturalHeight: Math.round(res.sh),
        name: `Background Snip ${this._snipCounter}`,
        xPct,
        yPct
      };

      const nameIn = document.getElementById('imageToolsPreviewName');
      if (nameIn) nameIn.value = this._previewData.name;

      this._drawPreviewCanvasFromDataUrl(res.dataUrl, res.sw, res.sh);
      this._updatePreviewMeta(res.sw, res.sh, `Background snip (${Math.round(res.sw)} × ${Math.round(res.sh)} px)`);
      this._syncPreviewButtons();

      if (!opts || !opts.silent) {
        if (window.AppCoordinator) {
          window.AppCoordinator.showNotification('Background snip captured to preview. Click Create Image Object or Export.', 'success', 3000);
        }
      }
    });
  },

  confirmBgSnipFromActive() {
    const x = Math.max(0, parseInt(document.getElementById('clipRegionX')?.value, 10) || 0);
    const y = Math.max(0, parseInt(document.getElementById('clipRegionY')?.value, 10) || 0);
    const w = Math.max(10, parseInt(document.getElementById('clipRegionW')?.value, 10) || 10);
    const h = Math.max(10, parseInt(document.getElementById('clipRegionH')?.value, 10) || 10);
    this.confirmBgSnip({ x, y, w, h });
  },

  createImageFromPreview() {
    if (!this._previewData || !this._previewData.dataUrl) return;

    const nameIn = document.getElementById('imageToolsPreviewName');
    const objectName = (nameIn && nameIn.value.trim()) ? nameIn.value.trim() : this._previewData.name;

    const imgPayload = {
      name: objectName,
      src: this._previewData.dataUrl,
      data: this._previewData.dataUrl,
      filename: objectName.toLowerCase().replace(/[^a-z0-9_-]/g, '-') + '.png',
      mime: 'image/png',
      x: this._previewData.xPct !== undefined ? this._previewData.xPct : 50.0,
      y: this._previewData.yPct !== undefined ? this._previewData.yPct : 50.0,
      width: Math.round(this._previewData.w),
      height: Math.round(this._previewData.h),
      naturalWidth: Math.round(this._previewData.naturalWidth || this._previewData.w),
      naturalHeight: Math.round(this._previewData.naturalHeight || this._previewData.h),
      maintainAspectRatio: true,
      opacity: 1.0,
      visible: true,
      locked: false
    };

    let created = null;
    if (window.EngineBridge && typeof window.EngineBridge.createImage === 'function' && window.EngineBridge.isReady()) {
      const res = window.EngineBridge.createImage(imgPayload);
      created = (res && res.image) ? res.image : res;
    } else if (window.ImageObjects) {
      created = window.ImageObjects.createImage(imgPayload);
    }

    if (!created || !created.id) {
      if (window.AppCoordinator) window.AppCoordinator.showNotification('Failed to create Image Object from preview.', 'error', 3000);
      return;
    }

    if (window.LayerManager && typeof window.LayerManager.addEntry === 'function') {
      window.LayerManager.addEntry('image', created.id);
    }
    if (window.LayerManager && typeof window.LayerManager.syncFromEngine === 'function') {
      window.LayerManager.syncFromEngine();
    }

    if (window.HistoryManager) window.HistoryManager.recordImmediate();
    if (window.AppCoordinator && typeof window.AppCoordinator.requestRender === 'function') {
      window.AppCoordinator.requestRender();
    } else if (typeof window.triggerAppRender === 'function') {
      window.triggerAppRender();
    }

    if (window.AppCoordinator) {
      window.AppCoordinator.selectObject('image', created.id, { openAccordionId: 'acc-image-tools' });
      window.AppCoordinator.updateActiveOverlays();
      window.AppCoordinator.showNotification(`Created Image Object "${created.name}".`, 'success', 3500);
    }
    if (typeof window.syncImageEditorUI === 'function') window.syncImageEditorUI();
    if (typeof window.renderLayersList === 'function') window.renderLayersList();

    this.showResult(created);
    this.syncUI();
  },

  exportPreviewDirect(format = 'png') {
    if (!this._previewData || !this._previewData.dataUrl) return;

    const mimeMap = {
      png: 'image/png',
      jpeg: 'image/jpeg',
      jpg: 'image/jpeg',
      webp: 'image/webp'
    };
    const mime = mimeMap[format] || 'image/png';
    const ext = format === 'jpeg' ? 'jpg' : format;

    const nameIn = document.getElementById('imageToolsPreviewName');
    const baseName = (nameIn && nameIn.value.trim()) ? nameIn.value.trim() : (this._previewData.name || 'preview-export');
    const cleanFilename = baseName.replace(/[^a-zA-Z0-9_\-\. ]/g, '').replace(/\s+/g, '_') + '.' + ext;

    const img = new Image();
    img.onload = () => {
      const offscreen = document.createElement('canvas');
      offscreen.width = this._previewData.w;
      offscreen.height = this._previewData.h;
      const ctx = offscreen.getContext('2d');
      if (format === 'jpeg' || format === 'jpg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, offscreen.width, offscreen.height);
      }
      ctx.drawImage(img, 0, 0);
      const exportUrl = offscreen.toDataURL(mime, 0.95);

      const link = document.createElement('a');
      link.download = cleanFilename;
      link.href = exportUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (window.AppCoordinator) {
        window.AppCoordinator.showNotification(`Exported ${cleanFilename}`, 'success', 2500);
      }
    };
    img.src = this._previewData.dataUrl;
  },

  // Legacy exportPreview
  exportPreview() {
    const fmt = document.getElementById('selPreviewExportFormat')?.value || 'png';
    this.exportPreviewDirect(fmt);
  },

  discardPreview() {
    this._previewData = null;
    this._clearPreview();
    this._syncPreviewButtons();
    if (window.AppCoordinator) {
      window.AppCoordinator.showNotification('Preview discarded.', 'info', 1800);
    }
  },

  applyClipToOriginal() {
    if (window.Stage && window.Stage.isClippingImage) {
      window.Stage.applyClipMode();
    } else {
      const sel = window.AppCoordinator?.getActiveSelection();
      if (sel && sel.type === 'image' && window.ImageObjects) {
        const img = window.ImageObjects.getImage(sel.id);
        if (img) {
          const x = Math.max(0, parseInt(document.getElementById('clipRegionX')?.value, 10) || 0);
          const y = Math.max(0, parseInt(document.getElementById('clipRegionY')?.value, 10) || 0);
          const w = Math.max(10, parseInt(document.getElementById('clipRegionW')?.value, 10) || 10);
          const h = Math.max(10, parseInt(document.getElementById('clipRegionH')?.value, 10) || 10);
          window.ImageObjects.clipImage(img.id, { x, y, width: w, height: h });
          if (window.HistoryManager) window.HistoryManager.recordImmediate();
          if (window.AppCoordinator && typeof window.AppCoordinator.requestRender === 'function') {
            window.AppCoordinator.requestRender();
          } else if (typeof window.triggerAppRender === 'function') {
            window.triggerAppRender();
          }
          if (window.AppCoordinator) window.AppCoordinator.showNotification('Clip mask applied to original image.', 'success', 2500);
        }
      }
    }
  },

  resetAppliedClip() {
    const sel = window.AppCoordinator?.getActiveSelection();
    if (sel && sel.type === 'image' && window.ImageObjects) {
      window.ImageObjects.resetClip(sel.id);
      if (window.HistoryManager) window.HistoryManager.recordImmediate();
      if (window.AppCoordinator && typeof window.AppCoordinator.requestRender === 'function') {
        window.AppCoordinator.requestRender();
      } else if (typeof window.triggerAppRender === 'function') {
        window.triggerAppRender();
      }
      if (window.AppCoordinator) window.AppCoordinator.showNotification('Clip mask reset.', 'info', 2500);
      this.syncUI();
    }
  },

  _syncClipInputs(img) {
    let clipX = 0, clipY = 0;
    let clipW = Math.round(img.width || 200);
    let clipH = Math.round(img.height || 150);

    if (window.Stage && window.Stage.isClippingImage && window.Stage.clipBox && window.Stage.clipOrigBounds) {
      const b = window.Stage.clipBox;
      const ob = window.Stage.clipOrigBounds;
      clipX = Math.round(Math.max(0, b.x - ob.left));
      clipY = Math.round(Math.max(0, b.y - ob.top));
      clipW = Math.round(b.w);
      clipH = Math.round(b.h);
    } else if (img.clip && img.clip.enabled && img.clip.width > 0 && img.clip.height > 0) {
      clipX = Math.round(img.clip.x);
      clipY = Math.round(img.clip.y);
      clipW = Math.round(img.clip.width);
      clipH = Math.round(img.clip.height);
    }

    const ix = document.getElementById('clipRegionX');
    const iy = document.getElementById('clipRegionY');
    const iw = document.getElementById('clipRegionW');
    const ih = document.getElementById('clipRegionH');
    if (ix && document.activeElement !== ix) ix.value = Math.round(clipX);
    if (iy && document.activeElement !== iy) iy.value = Math.round(clipY);
    if (iw && document.activeElement !== iw) iw.value = Math.round(clipW);
    if (ih && document.activeElement !== ih) ih.value = Math.round(clipH);
  },

  _syncSnipInputs() {
    const cw = (window.Stage && window.Stage.canvasWidth) || 1280;
    const ch = (window.Stage && window.Stage.canvasHeight) || 720;

    let x = 0, y = 0, w = Math.round(cw / 2), h = Math.round(ch / 2);
    if (window.Stage && window.Stage.bgExtractBox && window.Stage.bgExtractBox.w >= 10 && window.Stage.bgExtractBox.h >= 10) {
      const b = window.Stage.bgExtractBox;
      x = Math.round(b.x);
      y = Math.round(b.y);
      w = Math.round(b.w);
      h = Math.round(b.h);
    } else {
      const rx = parseInt(document.getElementById('clipRegionX')?.value, 10);
      const ry = parseInt(document.getElementById('clipRegionY')?.value, 10);
      const rw = parseInt(document.getElementById('clipRegionW')?.value, 10);
      const rh = parseInt(document.getElementById('clipRegionH')?.value, 10);
      if (!isNaN(rx) && !isNaN(ry) && rw >= 10 && rh >= 10) {
        x = rx; y = ry; w = rw; h = rh;
      }
    }

    const ix = document.getElementById('clipRegionX');
    const iy = document.getElementById('clipRegionY');
    const iw = document.getElementById('clipRegionW');
    const ih = document.getElementById('clipRegionH');
    if (ix && document.activeElement !== ix) ix.value = Math.round(x);
    if (iy && document.activeElement !== iy) iy.value = Math.round(y);
    if (iw && document.activeElement !== iw) iw.value = Math.round(w);
    if (ih && document.activeElement !== ih) ih.value = Math.round(h);
  },

  syncFromStageClip() {
    const sel = window.AppCoordinator?.getActiveSelection();
    if (sel && sel.type === 'image' && window.ImageObjects) {
      const img = window.ImageObjects.getImage(sel.id);
      if (img) this._syncClipInputs(img);
    }
  },

  syncFromStageSnip() {
    this._syncSnipInputs();
  },

  _onClipInputChange() {
    const x = Math.max(0, parseInt(document.getElementById('clipRegionX')?.value, 10) || 0);
    const y = Math.max(0, parseInt(document.getElementById('clipRegionY')?.value, 10) || 0);
    const w = Math.max(10, parseInt(document.getElementById('clipRegionW')?.value, 10) || 10);
    const h = Math.max(10, parseInt(document.getElementById('clipRegionH')?.value, 10) || 10);

    if (this.clipSnipSource === 'image') {
      const sel = window.AppCoordinator?.getActiveSelection();
      if (sel && sel.type === 'image' && window.ImageObjects) {
        const img = window.ImageObjects.getImage(sel.id);
        if (img && window.Stage && window.Stage.isClippingImage && window.Stage.clipOrigBounds) {
          const ob = window.Stage.clipOrigBounds;
          window.Stage.clipBox = {
            x: ob.left + x,
            y: ob.top + y,
            w: Math.min(ob.w - x, w),
            h: Math.min(ob.h - y, h)
          };
          window.Stage.updateClipOverlayUI();
        }
      }
    } else {
      if (window.Stage) {
        window.Stage.bgExtractBox = { x, y, w, h };
        const boxEl = document.getElementById('bgExtractBox');
        if (boxEl) {
          boxEl.setAttribute('x', x.toFixed(1));
          boxEl.setAttribute('y', y.toFixed(1));
          boxEl.setAttribute('width', w.toFixed(1));
          boxEl.setAttribute('height', h.toFixed(1));
          boxEl.style.display = 'block';
        }
        const lbl = document.getElementById('bgExtractCoordsLabel');
        if (lbl) lbl.innerText = `${x}, ${y} (${w} × ${h} px)`;
        const btn = document.getElementById('btnConfirmExtract');
        if (btn) btn.disabled = (w < 10 || h < 10);
        const btnDrawer = document.getElementById('btnCaptureSelectedArea');
        if (btnDrawer) btnDrawer.disabled = (w < 10 || h < 10);
      }
    }
  },

  _drawPreviewCanvasFromDataUrl(dataUrl, w, h) {
    const canvas = document.getElementById('imageToolsPreviewCanvas');
    if (!canvas || !dataUrl) return;
    const img = new Image();
    img.onload = () => {
      this._drawCentered(img, canvas, 0, 0, w, h);
    };
    img.src = dataUrl;
  },

  _drawCentered(src, canvas, sx, sy, sw, sh) {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.drawImage !== 'function') return;
    const cw = canvas.width || 320;
    const ch = canvas.height || 180;
    if (typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, cw, ch);

    if (sw <= 0 || sh <= 0) return;

    if (typeof ctx.fillRect === 'function') {
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, cw, ch);
    }

    const scale = Math.min((cw - 16) / sw, (ch - 16) / sh);
    const dw = Math.round(sw * scale);
    const dh = Math.round(sh * scale);
    const dx = Math.round((cw - dw) / 2);
    const dy = Math.round((ch - dh) / 2);

    ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);

    if (typeof ctx.strokeRect === 'function') {
      ctx.strokeStyle = '#38d39f';
      ctx.lineWidth = 1;
      ctx.strokeRect(dx, dy, dw, dh);
    }
  },

  _updatePreviewMeta(w, h, note) {
    const dims = document.getElementById('clipPreviewDims');
    const legacyDims = document.getElementById('imageToolsPreviewDims');
    const noteEl = document.getElementById('imageToolsPreviewNote');
    const msg = document.getElementById('imageToolsPreviewEmptyMsg');
    const text = `${Math.round(w)} × ${Math.round(h)} px`;
    if (dims) dims.textContent = text;
    if (legacyDims) legacyDims.textContent = text;
    if (noteEl) noteEl.textContent = note;
    if (msg) msg.style.display = 'none';
  },

  _clearPreview(msgText) {
    const canvas = document.getElementById('imageToolsPreviewCanvas');
    if (canvas && typeof canvas.getContext === 'function') {
      const ctx = canvas.getContext('2d');
      if (ctx && typeof ctx.clearRect === 'function') {
        ctx.clearRect(0, 0, canvas.width || 320, canvas.height || 180);
      }
    }
    const dims = document.getElementById('clipPreviewDims');
    const legacyDims = document.getElementById('imageToolsPreviewDims');
    const noteEl = document.getElementById('imageToolsPreviewNote');
    const msg = document.getElementById('imageToolsPreviewEmptyMsg');
    if (dims) dims.textContent = '—';
    if (legacyDims) legacyDims.textContent = '—';
    if (noteEl) noteEl.textContent = 'No region captured yet';
    if (msg) {
      msg.textContent = msgText || 'Capture an area to preview';
      msg.style.display = 'block';
    }
  },

  _getImageElement(img, cb) {
    if (!img) { cb(null); return; }
    const src = img.dataUrl || img.dataURL || img.src || img.data || img.assetRef || (img.b64 ? ('data:' + (img.mime || 'image/png') + ';base64,' + img.b64) : '') || '';
    if (!src) { cb(null); return; }
    if (this._imageCache.has(src)) {
      const cached = this._imageCache.get(src);
      if (cached.complete && cached.naturalWidth > 0) {
        cb(cached);
        return;
      }
    }
    if (typeof Image === 'undefined') { cb(null); return; }
    const el = new Image();
    el.onload = () => {
      this._imageCache.set(src, el);
      cb(el);
    };
    el.onerror = () => cb(null);
    el.src = src;
  },

  _extractCroppedImageDataUrl(img, cb, resolutionPolicy = 'original') {
    this._getImageElement(img, (imgEl) => {
      if (!imgEl) { cb(null); return; }
      const nw = Math.max(imgEl.naturalWidth || 0, img.naturalWidth || img.width || 0) || 800;
      const nh = Math.max(imgEl.naturalHeight || 0, img.naturalHeight || img.height || 0) || 600;
      let sx = 0, sy = 0, sw = nw, sh = nh;
      if (img.crop && img.crop.enabled && img.crop.sourceWidth > 0 && img.crop.sourceHeight > 0) {
        sx = Math.max(0, Math.min(nw - 1, img.crop.sourceX));
        sy = Math.max(0, Math.min(nh - 1, img.crop.sourceY));
        sw = Math.max(1, Math.min(nw - sx, img.crop.sourceWidth));
        sh = Math.max(1, Math.min(nh - sy, img.crop.sourceHeight));
      }
      let outW = Math.round(sw);
      let outH = Math.round(sh);
      const dispW = Number(img.width) || 0;
      const dispH = Number(img.height) || 0;
      if ((resolutionPolicy === '1x' || resolutionPolicy === '2x' || resolutionPolicy === '3x') && dispW > 0 && dispH > 0) {
        const mult = resolutionPolicy === '1x' ? 1 : (resolutionPolicy === '3x' ? 3 : 2);
        const maxW = Math.ceil(dispW * mult);
        const maxH = Math.ceil(dispH * mult);
        // Never upscale an image that is already smaller than or equal to the target bake size
        if (sw > maxW || sh > maxH) {
          const scale = Math.min(maxW / sw, maxH / sh);
          outW = Math.max(1, Math.round(sw * scale));
          outH = Math.max(1, Math.round(sh * scale));
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, outW, outH);
      }
      const dataUrl = canvas.toDataURL(img.mime || 'image/png');
      cb({ dataUrl, sw: outW, sh: outH });
    });
  },

  _extractClippedImageDataUrl(img, clipRect, cb) {
    this._getImageElement(img, (imgEl) => {
      if (!imgEl) { cb(null); return; }
      const nw = imgEl.naturalWidth || img.width;
      const nh = imgEl.naturalHeight || img.height;
      const scaleX = nw / (img.width || nw);
      const scaleY = nh / (img.height || nh);

      let baseSx = 0, baseSy = 0;
      if (img.crop && img.crop.enabled) {
        baseSx = img.crop.sourceX;
        baseSy = img.crop.sourceY;
      }

      const sx = Math.max(0, Math.min(nw - 1, baseSx + clipRect.x * scaleX));
      const sy = Math.max(0, Math.min(nh - 1, baseSy + clipRect.y * scaleY));
      const sw = Math.max(1, Math.min(nw - sx, clipRect.w * scaleX));
      const sh = Math.max(1, Math.min(nh - sy, clipRect.h * scaleY));

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(sw);
      canvas.height = Math.round(sh);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, sw, sh);
      const dataUrl = canvas.toDataURL(img.mime || 'image/png');
      cb({ dataUrl, sw, sh });
    });
  },

  _extractBackgroundSnipDataUrl(box, cb) {
    const cw = (window.Stage && window.Stage.canvasWidth) || 1280;
    const ch = (window.Stage && window.Stage.canvasHeight) || 720;
    if (typeof window.renderBackgroundToOffscreenCanvas === 'function') {
      window.renderBackgroundToOffscreenCanvas(cw, ch, (bgCanvas) => {
        if (!bgCanvas) { cb(null); return; }
        const sx = Math.max(0, Math.min(cw - 1, box.x));
        const sy = Math.max(0, Math.min(ch - 1, box.y));
        const sw = Math.max(1, Math.min(cw - sx, box.w));
        const sh = Math.max(1, Math.min(ch - sy, box.h));

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(sw);
        canvas.height = Math.round(sh);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bgCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
        const dataUrl = canvas.toDataURL('image/png');
        cb({ dataUrl, sw, sh });
      });
    } else {
      cb(null);
    }
  },

  showResult(imgObj) {
    if (!imgObj) return;
    this.lastExtractedResult = imgObj;
    const card = document.getElementById('imageToolsResultCard');
    const nameEl = document.getElementById('imageToolsResultName');
    const detEl = document.getElementById('imageToolsResultDetails');
    const thumb = document.getElementById('imageToolsResultThumb');

    if (nameEl) nameEl.textContent = imgObj.name || `Image ${imgObj.id}`;
    if (detEl) {
      const w = Math.round(imgObj.width || 0);
      const h = Math.round(imgObj.height || 0);
      const mime = (imgObj.mime || 'image/png').replace('image/', '').toUpperCase();
      detEl.textContent = `${w} × ${h} px • ${mime}`;
    }

    if (thumb && (imgObj.src || imgObj.data) && typeof thumb.getContext === 'function' && typeof Image !== 'undefined') {
      const tImg = new Image();
      tImg.onload = () => {
        const tCtx = thumb.getContext('2d');
        if (tCtx && typeof tCtx.drawImage === 'function') {
          if (typeof tCtx.clearRect === 'function') tCtx.clearRect(0, 0, thumb.width || 56, thumb.height || 42);
          tCtx.drawImage(tImg, 0, 0, thumb.width || 56, thumb.height || 42);
        }
      };
      tImg.src = imgObj.src || imgObj.data;
    }

    if (card) card.style.display = 'block';
  },

  // Legacy method aliases for backwards compatibility
  startCanvasSelection() {
    if (this.currentMode === 'crop') {
      this.startCrop();
    } else {
      this.startClipSnip();
    }
  },

  applyAction() {
    if (this.currentMode === 'crop') {
      this.applyCrop();
    } else {
      this.captureSelectedArea();
    }
  },

  cancelAction() {
    if (this.currentMode === 'crop') {
      this.cancelCrop();
    } else {
      this.cancelClipSelection();
    }
  },

  resetAction() {
    if (this.currentMode === 'crop') {
      this.resetCropToOriginal();
    } else {
      this.discardPreview();
    }
  },

  _onInputChange() {
    this._onCropInputChange();
  }
};

window.syncImageToolsUI = function() {
  if (window.ImageToolsController && typeof window.ImageToolsController.syncUI === 'function') {
    window.ImageToolsController.syncUI();
  }
};

window.syncImageToolsFromCrop = function() {
  if (window.ImageToolsController && typeof window.ImageToolsController.syncFromStageCrop === 'function') {
    window.ImageToolsController.syncFromStageCrop();
  }
};

window.syncImageToolsFromClip = function() {
  if (window.ImageToolsController && typeof window.ImageToolsController.syncFromStageClip === 'function') {
    window.ImageToolsController.syncFromStageClip();
  }
};

window.syncImageToolsFromSnip = function() {
  if (window.ImageToolsController && typeof window.ImageToolsController.syncFromStageSnip === 'function') {
    window.ImageToolsController.syncFromStageSnip();
  }
};

// =========================================================================
// =========================================================================
// Accordion Overview: Widget Parameters (External Controls)
// =========================================================================
function getDrawerWidgetPropDefs(type, targetId = '', liteKind = '') {
  if (window.EngineBridge && typeof window.EngineBridge.getEligibleWidgetProperties === 'function') {
    const list = window.EngineBridge.getEligibleWidgetProperties(type, targetId, liteKind);
    if (Array.isArray(list) && list.length > 0) {
      return list.map(item => ({
        prop: item.property || item.Property,
        label: item.label || item.Label,
        type: item.type || item.Type,
        desc: item.description || item.Description,
        min: item.min !== undefined ? item.min : item.Min,
        max: item.max !== undefined ? item.max : item.Max,
        step: item.step !== undefined ? item.step : item.Step,
        default: item.default !== undefined ? item.default : item.Default,
        options: item.options || item.Options
      }));
    }
  }
  const fallbackCatalog = {
    node: [
      { prop: 'fill', label: 'Fill Colour', type: 'color', desc: 'Primary interior fill color of node shape' },
      { prop: 'stroke', label: 'Border Stroke', type: 'color', desc: 'Outline and border stroke color' },
      { prop: 'opacity', label: 'Opacity (0..1)', type: 'number', min: 0, max: 1, step: 0.05, desc: 'Transparency level from 0.0 to 1.0' },
      { prop: 'visibility', label: 'Visibility (Toggle)', type: 'boolean', desc: 'Toggle visibility of this node' },
      { prop: 'play', label: 'Play Animation', type: 'boolean', desc: 'Start or stop the node shape animation (pulse-border, float, fade-in)' },
      { prop: 'text', label: 'Label Text', type: 'text', desc: 'Primary text label rendered inside the node' }
    ],
    flow: [
      { prop: 'stroke', label: 'Line Colour', type: 'color', desc: 'Connector line and particle stroke color' },
      { prop: 'speed', label: 'Flow Speed', type: 'speed', min: 0.1, max: 10, step: 0.1, desc: 'Movement speed of particles along this specific flow line (0.1 to 10.0)' },
      { prop: 'opacity', label: 'Opacity (0..1)', type: 'number', min: 0, max: 1, step: 0.05, desc: 'Opacity of the flow connector track' },
      { prop: 'visibility', label: 'Visibility (Toggle)', type: 'boolean', desc: 'Shows or hides this flow connector' },
      { prop: 'play', label: 'Play Animation', type: 'boolean', desc: 'Start or stop flow connector line and traveling payload animation' }
    ],
    glow: [
      { prop: 'color', label: 'Glow Colour', type: 'color', desc: 'Accent color of the glow and beacon pulse' },
      { prop: 'opacity', label: 'Glow Intensity (0..1)', type: 'number', min: 0, max: 1, step: 0.05, desc: 'Brilliance and intensity of the optical glow pulse' },
      { prop: 'visibility', label: 'Visibility (Toggle)', type: 'boolean', desc: 'Switches the optical hotspot glow on or off' },
      { prop: 'play', label: 'Play Animation', type: 'boolean', desc: 'Start or stop hotspot glow pulse or radar ping animation' }
    ],
    ripple: [
      { prop: 'color', label: 'Wave Crest Colour', type: 'color', desc: 'Stroke color of the propagating ripple rings' },
      { prop: 'opacity', label: 'Wave Opacity (0..1)', type: 'number', min: 0, max: 1, step: 0.05, desc: 'Wave crest opacity from 0.0 to 1.0' },
      { prop: 'visibility', label: 'Visibility (Toggle)', type: 'boolean', desc: 'Switches the animated expanding ripple wave on or off' },
      { prop: 'play', label: 'Play Animation', type: 'boolean', desc: 'Start or stop expanding liquid ripple wave animation' }
    ],
    image: [
      { prop: 'src', label: 'Image / Icon Source', type: 'text', desc: 'Image source URL or data:image/... URI for runtime icon/image substitution' },
      { prop: 'opacity', label: 'Image Opacity (0..1)', type: 'number', min: 0, max: 1, step: 0.05, desc: 'Opacity of the image layer' },
      { prop: 'visibility', label: 'Visibility (Toggle)', type: 'boolean', desc: 'Shows or hides this image object' }
    ],
    group: [
      { prop: 'opacity', label: 'Group Opacity (0..1)', type: 'number', min: 0, max: 1, step: 0.05, default: 1.0, desc: 'Opacity of the group (0.0 to 1.0)' },
      { prop: 'visibility', label: 'Visibility (Toggle)', type: 'boolean', default: true, desc: 'Shows or hides this group' },
      { prop: 'play', label: 'Play Animation', type: 'boolean', default: true, desc: 'Start or stop all animations inside this group' },
      { prop: 'speed', label: 'Group Animation Speed (0.1..10x)', type: 'speed', min: 0.1, max: 10, step: 0.1, default: 1.0, desc: 'Playback speed multiplier for all animations inside this group (0.1 to 10.0)' }
    ],
    lite: [
      { prop: 'color', label: 'Effect / Text Colour', type: 'color', desc: 'Primary text, stroke, or fill colour of the low-load effect' },
      { prop: 'bgColor', label: 'Box / Track Background Colour', type: 'color', desc: 'Background track, screen, or text box fill colour' },
      { prop: 'borderColor', label: 'Border Colour', type: 'color', desc: 'Container border or arc guide colour for Text Box Lite' },
      { prop: 'bgOpacity', label: 'Box Fill Opacity (0..1)', type: 'number', min: 0, max: 1, step: 0.05, desc: 'Background box fill opacity for Text Box Lite (0.0 to 1.0)' },
      { prop: 'play', label: 'Play Animation', type: 'boolean', desc: 'Start or stop the low-load effect animation (independent of playbackMode: once plays once when true, loop plays continuously while true)' },
      { prop: 'text', label: 'Text Content', type: 'text', desc: 'Displayed text content for Text Box Lite (immediate update on static text, cycle-boundary handover on animated text)' },
      { prop: 'labelText', label: 'Gauge Label Text', type: 'text', desc: 'Displayed label text for Gauge / Level Lite' },
      { prop: 'unit', label: 'Unit Suffix', type: 'text', desc: 'Displayed unit suffix for Gauge / Level Lite (e.g. %, RPM, °C)' },
      { prop: 'value', label: 'Gauge Value', type: 'number', step: 0.5, desc: 'Current numeric value for Gauge / Level Lite indicators' },
      { prop: 'minValue', label: 'Gauge Min Value', type: 'number', step: 1, desc: 'Minimum numeric domain bound for Gauge / Level Lite' },
      { prop: 'maxValue', label: 'Gauge Max Value', type: 'number', step: 1, desc: 'Maximum numeric domain bound for Gauge / Level Lite' },
      { prop: 'opacity', label: 'Opacity (0..1)', type: 'number', min: 0, max: 1, step: 0.05, desc: 'Transparency of the low-load effect (0.0 to 1.0)' },
      { prop: 'visibility', label: 'Visibility (Toggle)', type: 'boolean', desc: 'Toggle visibility of the low-load effect' },
      { prop: 'speed', label: 'Cycle Duration / Speed', type: 'speed', min: 0.1, max: 30, step: 0.1, desc: 'Cycle duration in seconds (0.2 to 30.0 s) or playback speed multiplier (0.1 to 10.0)' },
      { prop: 'scrollSpeed', label: 'Ticker Scroll Speed (px/s)', type: 'number', min: 10, max: 600, step: 5, desc: 'Linear scroll speed in SVG px/s for Text Box Lite tickers (10 to 600)' },
      { prop: 'typeSpeed', label: 'Typing Rate (chars/s)', type: 'number', min: 1, max: 120, step: 1, desc: 'Character reveal rate in graphemes/s for Text Box Lite typewriter, scramble, and overtype (1 to 120)' },
      { prop: 'strokeWidth', label: 'Stroke Width', type: 'number', min: 0, max: 32, step: 0.5, desc: 'Stroke or border thickness in px' },
      { prop: 'dashLength', label: 'Dash / Segment Length', type: 'number', min: 2, max: 400, step: 1, desc: 'Flow Lite dash or single segment length in px (2 to 400)' },
      { prop: 'gapLength', label: 'Gap Spacing', type: 'number', min: 2, max: 300, step: 1, desc: 'Flow Lite clear gap between segments in px (2 to 300)' },
      { prop: 'dotSize', label: 'Dot Diameter', type: 'number', min: 1, max: 32, step: 0.5, desc: 'Flow Lite dot diameter in px for dotted pattern (1 to 32)' },
      { prop: 'delay', label: 'Start Delay (s)', type: 'number', min: 0, max: 30, step: 0.1, desc: 'Flow Lite start delay in seconds (0 to 30)' },
      { prop: 'endDelay', label: 'End Delay (s)', type: 'number', min: 0, max: 30, step: 0.1, desc: 'Flow Lite end delay in seconds (0 to 30)' },
      { prop: 'startMode', label: 'Start Endpoint Mode', type: 'enum', options: ['tunnel', 'abrupt'], desc: 'Flow Lite start endpoint transition mode' },
      { prop: 'endMode', label: 'End Endpoint Mode', type: 'enum', options: ['tunnel', 'abrupt'], desc: 'Flow Lite end endpoint transition mode' },
      { prop: 'segments', label: 'Segments', type: 'number', min: 1, max: 32, step: 1, desc: 'Number of segments or waveform cycles' },
      { prop: 'lineGapRatio', label: 'Line:Gap Ratio', type: 'text', desc: 'Repeating segment pattern ratio (e.g. 1:3)' },
      { prop: 'segmentStyle', label: 'Segment Style', type: 'enum', options: ['solid', 'rounded', 'dashed', 'dots', 'fading-tail'], desc: 'Perimeter Tracer segment visual style' },
      { prop: 'rings', label: 'Ring Count', type: 'number', min: 1, max: 6, step: 1, desc: 'Number of staggered expanding radar rings (1 to 6)' },
      { prop: 'curvature', label: 'Curvature (-100..100%)', type: 'number', min: -100, max: 100, step: 5, desc: 'Arc or path curvature percentage (-100 to +100)' },
      { prop: 'direction', label: 'Direction', type: 'enum', options: ['cw', 'ccw', 'forward', 'reverse'], desc: 'Travel direction' },
      { prop: 'startOffset', label: 'Start Offset (%)', type: 'number', min: 0, max: 100, step: 1, desc: 'Perimeter starting phase offset, arc offset, or oscilloscope baseline' },
      { prop: 'playbackMode', label: 'Motion Mode', type: 'enum', options: ['loop', 'pingpong', 'once'], desc: 'Playback mode (loop, pingpong, once)' },
      { prop: 'burstCycles', label: 'Cycles Per Burst', type: 'number', min: 0, max: 100, step: 1, desc: 'Circuits per burst before pausing (0 = continuous)' },
      { prop: 'pauseSeconds', label: 'Pause Duration (s)', type: 'number', min: 0, max: 300, step: 0.5, desc: 'Pause duration in seconds between bursts (0 to 300)' },
      { prop: 'pauseVisibility', label: 'Pause Behaviour', type: 'enum', options: ['hide', 'hold'], desc: 'Visibility during burst pause (hide or hold)' },
      { prop: 'showGuide', label: 'Guide Visibility', type: 'boolean', desc: 'Show or hide static perimeter boundary guide or radar centre dot' },
      { prop: 'scale', label: 'Max Scale', type: 'number', min: 0.2, max: 3.0, step: 0.05, desc: 'Maximum pulse/radar expansion scale multiplier (0.2 to 3.0)' },
      { prop: 'minScale', label: 'Min / Start Scale', type: 'number', min: 0.05, max: 2.0, step: 0.05, desc: 'Minimum pulse or inner radar start scale multiplier' },
      { prop: 'period', label: 'Cycle Duration / Period (s)', type: 'number', min: 0.2, max: 30, step: 0.1, desc: 'Cycle duration in seconds (0.2 to 30.0)' },
      { prop: 'intensity', label: 'Intensity / Amplitude', type: 'number', min: 0, max: 1, step: 0.05, desc: 'Peak pulse/flash/oscilloscope amplitude' },
      { prop: 'armThickness', label: 'Arm Thickness', type: 'number', min: 1, max: 20, step: 0.5, desc: 'Independent cross/star arm thickness in SVG units (1 to 20)' },
      { prop: 'samples', label: 'Waveform Samples', type: 'text', desc: 'Bounded numeric sample sequence (2 to 64 comma-separated values) for Oscilloscope Lite sampled mode' },
      { prop: 'trigger', label: 'Flash Trigger', type: 'number', min: 0, max: 1000000, step: 1, desc: 'Incrementing or changing this value triggers a single-shot Flash Lite pulse' },
      { prop: 'duration', label: 'Flash Duration (ms)', type: 'number', min: 20, max: 1000, step: 10, desc: 'Flash duration in milliseconds (20 to 1000 ms)' },
      { prop: 'repeat', label: 'Flash Repeat', type: 'boolean', desc: 'Repeat flash periodically instead of single-shot' },
      { prop: 'repeatInterval', label: 'Repeat Interval (s)', type: 'number', min: 0.2, max: 60, step: 0.1, desc: 'Interval in seconds between repeated flashes (0.2 to 60)' },
      { prop: 'fontSize', label: 'Font Size (px)', type: 'number', min: 8, max: 120, step: 1, desc: 'Text Box Lite font size in px (8 to 120)' },
      { prop: 'letterSpacing', label: 'Letter Spacing (px)', type: 'number', min: -2, max: 20, step: 0.5, desc: 'Text Box Lite letter spacing in px (-2 to 20)' },
      { prop: 'padding', label: 'Interior Padding (px)', type: 'number', min: 0, max: 60, step: 1, desc: 'Text Box Lite interior padding in px (0 to 60)' },
      { prop: 'linesPerSec', label: 'Vertical Scroll Rate (lines/s)', type: 'number', min: 0.1, max: 20, step: 0.1, desc: 'Text Box Lite vertical scroll rate in lines/s (0.1 to 20)' },
      { prop: 'lineSpacing', label: 'Line Spacing (x)', type: 'number', min: 0.8, max: 3.0, step: 0.05, desc: 'Text Box Lite line spacing multiplier (0.8 to 3.0)' },
      { prop: 'holdDelay', label: 'Hold Duration (s)', type: 'number', min: 0, max: 30, step: 0.1, desc: 'Text Box Lite visible hold duration in seconds (0 to 30)' },
      { prop: 'clearDuration', label: 'Clear / Off Duration (s)', type: 'number', min: 0, max: 30, step: 0.1, desc: 'Text Box Lite clear or blink off duration in seconds (0 to 30)' },
      { prop: 'typeMode', label: 'Typewriter Sequence', type: 'enum', options: ['once', 'hold', 'delete', 'delete-forward'], desc: 'Text Box Lite typewriter sequence mode' },
      { prop: 'typeRepeat', label: 'Repeat Sequence', type: 'boolean', desc: 'Repeat complete Text Box Lite typewriter sequence' },
      { prop: 'textAnim', label: 'Text Animation Style', type: 'enum', options: ['none', 'ticker-h', 'ticker-v', 'stacked-v', 'typewriter', 'fade', 'flash', 'slide', 'blur-in', 'blur-out', 'scramble'], desc: 'Text Box Lite active animation style' }
    ],
    root: [
      { prop: 'playbackRate', label: 'Master Speed', type: 'speed', min: 0.1, max: 5.0, step: 0.1, desc: 'Master playback rate multiplier for the entire widget' },
      { prop: 'visibility', label: 'Widget Visibility', type: 'boolean', desc: 'Master visibility toggle for the entire widget' },
      { prop: 'operatingState', label: 'Operating State', type: 'enum', options: ['running', 'paused', 'stopped'], desc: 'Lifecycle operating state of the widget' }
    ]
  };
  return fallbackCatalog[type] || [];
}
const drawerWidgetPropDefs = new Proxy({}, {
  get(target, prop) {
    return getDrawerWidgetPropDefs(prop);
  }
});

function getObjectPropValue(type, id, prop) {
  if (type === 'node' && window.DiagramNodes) {
    const node = window.DiagramNodes.getNode(id);
    if (node) {
      switch (prop) {
        case 'fill': return node.fillColor || '#161b22';
        case 'stroke': return node.strokeColor || '#58a6ff';
        case 'opacity': return node.fillOpacity !== undefined ? node.fillOpacity : 0.92;
        case 'visibility': return true;
        case 'play': return node.play !== false;
        case 'text': return node.text || 'Node';
      }
    }
  } else if (type === 'flow' && window.DataFlows) {
    const flow = window.DataFlows.getFlow(id);
    if (flow) {
      switch (prop) {
        case 'stroke':
        case 'color': return flow.color || '#00ffcc';
        case 'opacity': return flow.opacity !== undefined ? flow.opacity : 1.0;
        case 'visibility': return true;
        case 'play': return flow.play !== false;
        case 'speed': return flow.speed !== undefined ? flow.speed : 2.0;
      }
    }
  } else if (type === 'glow' && window.Glows) {
    const glow = window.Glows.getGlow(id);
    if (glow) {
      switch (prop) {
        case 'color':
        case 'fill': return glow.color || '#ff0044';
        case 'opacity': return glow.opacity !== undefined ? glow.opacity : 1.0;
        case 'visibility': return true;
        case 'play': return glow.play !== false;
      }
    }
  } else if (type === 'ripple' && window.Ripples) {
    const ripple = window.Ripples.getRipple(id);
    if (ripple) {
      switch (prop) {
        case 'color':
        case 'stroke': return ripple.color || '#ffffff';
        case 'opacity': return ripple.opacity !== undefined ? ripple.opacity : 0.4;
        case 'visibility': return true;
        case 'play': return ripple.play !== false;
      }
    }
  } else if (type === 'image' && window.ImageObjects) {
    const img = window.ImageObjects.getImage(id);
    if (img) {
      switch (prop) {
        case 'src': return img.src || img.data || img.dataUrl || '';
        case 'opacity': return img.opacity !== undefined ? img.opacity : 1.0;
        case 'visibility': return img.visible !== false;
      }
    }
  } else if (type === 'group') {
    switch (prop) {
      case 'opacity': return 1.0;
      case 'visibility': return true;
      case 'play': return true;
      case 'speed': return 1.0;
    }
  } else if (type === 'lite' && window.LiteEffects) {
    const le = window.LiteEffects.getLiteEffect(id);
    if (le) {
      switch (prop) {
        case 'play': return le.play !== false;
        case 'text': return le.labelText !== undefined ? le.labelText : 'System Ready';
        case 'color': return le.color || (le.kind === 'text-lite' ? '#f8fafc' : '#38bdf8');
        case 'bgColor': return le.bgColor || (le.kind === 'oscilloscope-lite' ? '#0b1322' : (le.kind === 'text-lite' ? '#0f172a' : '#1e293b'));
        case 'borderColor': return le.borderColor || '#38bdf8';
        case 'value': return le.value !== undefined ? le.value : 65;
        case 'minValue': return le.minValue !== undefined ? le.minValue : 0;
        case 'maxValue': return le.maxValue !== undefined ? le.maxValue : 100;
        case 'opacity': return le.opacity !== undefined ? le.opacity : ((le.kind === 'gauge-lite' || le.kind === 'oscilloscope-lite' || le.kind === 'text-lite') ? 1.0 : 0.9);
        case 'visibility': return le.visible !== false;
        case 'speed':
          if (le.kind === 'flow-lite') return le.speed !== undefined ? le.speed : 2.0;
          if (le.kind === 'oscilloscope-lite') return le.speed !== undefined ? le.speed : 2.4;
          if (le.kind === 'perimeter-tracer') return le.speed !== undefined ? le.speed : 3.0;
          if (le.kind === 'text-lite') return le.speed !== undefined ? le.speed : 0.8;
          return 1.0;
        case 'scrollSpeed': return le.scrollSpeed !== undefined ? le.scrollSpeed : 90;
        case 'typeSpeed': return le.typeSpeed !== undefined ? le.typeSpeed : 14;
        case 'strokeWidth': return le.strokeWidth !== undefined ? le.strokeWidth : (le.kind === 'flow-lite' ? 3.0 : (le.kind === 'radar-lite' ? 2.0 : (le.kind === 'oscilloscope-lite' ? 2.2 : (le.kind === 'text-lite' ? 1.5 : (le.kind === 'gauge-lite' ? (le.variant === 'ring' ? 8.0 : 2.0) : 2.5)))));
        case 'dashLength': return le.dashLength !== undefined ? le.dashLength : (le.variant === 'single' ? 36 : 18);
        case 'gapLength': return le.gapLength !== undefined ? le.gapLength : 14;
        case 'dotSize': return le.dotSize !== undefined ? le.dotSize : 5;
        case 'segments': return le.segments !== undefined ? le.segments : (le.kind === 'gauge-lite' ? 10 : 2);
        case 'lineGapRatio': return le.lineGapRatio || '1:3';
        case 'direction': return le.direction || ((le.kind === 'flow-lite' || le.kind === 'gauge-lite' || le.kind === 'oscilloscope-lite' || le.kind === 'text-lite') ? 'forward' : 'cw');
        case 'startOffset': return le.startOffset !== undefined ? le.startOffset : ((le.kind === 'oscilloscope-lite' || le.kind === 'text-lite') ? 50 : 0);
        case 'playbackMode': return le.playbackMode || 'loop';
        case 'burstCycles': return le.burstCycles !== undefined ? le.burstCycles : 0;
        case 'pauseSeconds': return le.pauseSeconds !== undefined ? le.pauseSeconds : 0;
        case 'pauseVisibility': return le.pauseVisibility || 'hide';
        case 'showGuide': return le.showGuide !== false;
        case 'scale': return le.maxScale !== undefined ? le.maxScale : (le.kind === 'radar-lite' ? 1.0 : 1.15);
        case 'period':
          if (le.kind === 'flow-lite' || le.kind === 'oscilloscope-lite' || le.kind === 'perimeter-tracer') {
            return le.speed !== undefined ? le.speed : (le.kind === 'flow-lite' ? 2.0 : (le.kind === 'oscilloscope-lite' ? 2.4 : 3.0));
          }
          return le.period !== undefined ? le.period : (le.kind === 'radar-lite' ? 2.4 : 1.8);
        case 'intensity': return le.intensity !== undefined ? le.intensity : ((le.kind === 'flash' || le.kind === 'oscilloscope-lite') ? 0.75 : 0.85);
        case 'samples': return le.samples || '0, 0.4, 0.9, 0.3, -0.5, -0.9, -0.2, 0.6, 1.0, 0.2, -0.4, 0';
        case 'armThickness': return le.armThickness !== undefined ? le.armThickness : 3.0;
        case 'trigger': return 0;
        case 'duration': return Math.round((Number(le.dur) || 0.10) * 1000);
        case 'repeat': return Boolean(le.repeat);
        case 'repeatInterval': return le.repeatInterval !== undefined ? le.repeatInterval : 2.0;
        case 'bgOpacity': return le.bgOpacity !== undefined ? le.bgOpacity : 0.85;
        case 'fontSize': return le.fontSize !== undefined ? le.fontSize : 18;
        case 'letterSpacing': return le.letterSpacing !== undefined ? le.letterSpacing : 0;
        case 'padding': return le.padding !== undefined ? le.padding : 12;
        case 'curvature': return le.curvature !== undefined ? le.curvature : 0;
        case 'linesPerSec': return le.linesPerSec !== undefined ? le.linesPerSec : 1.5;
        case 'lineSpacing': return le.lineSpacing !== undefined ? le.lineSpacing : 1.35;
        case 'holdDelay': return le.holdDelay !== undefined ? le.holdDelay : 1.5;
        case 'clearDuration': return le.clearDuration !== undefined ? le.clearDuration : 0.6;
        case 'typeMode': return le.typeMode || 'hold';
        case 'typeRepeat': return le.typeRepeat !== false;
        case 'textAnim': return le.textAnim || 'none';
        case 'rings': return le.rings !== undefined ? le.rings : 3;
        case 'minScale': return le.minScale !== undefined ? le.minScale : (le.kind === 'radar-lite' ? 0.15 : 0.85);
        case 'delay': return le.delay !== undefined ? le.delay : 0;
        case 'endDelay': return le.endDelay !== undefined ? le.endDelay : 0;
        case 'startMode': return le.startMode || 'tunnel';
        case 'endMode': return le.endMode || 'tunnel';
        case 'segmentStyle': return le.segmentStyle || 'solid';
        case 'labelText': return le.labelText || '';
        case 'unit': return le.unit !== undefined ? le.unit : '%';
      }
    }
  }
  return '';
}

window.getSupportedPropertiesForMember = getSupportedPropertiesForMember;
window.getObjectPropValue = getObjectPropValue;
window.renderWidgetPropertyCards = function(containerEl, sel, statusMsgEl) {
  if (!containerEl || !sel || !sel.type || sel.id === null) return;
  containerEl.innerHTML = '';

  let objName = sel.name || '';
  let objDisplayName = sel.name || `${sel.type} #${sel.id}`;
  let liteKind = '';
  if (sel.type === 'node' && window.DiagramNodes) {
    const n = window.DiagramNodes.getNode(sel.id);
    if (n) {
      if (!objName) objName = n.name || n.text || '';
      objDisplayName = n.name ? `${n.name} (#${sel.id})` : (n.text ? `${n.text} (#${sel.id})` : `Node #${sel.id}`);
    }
  } else if (sel.type === 'flow' && window.DataFlows) {
    const f = window.DataFlows.getFlow(sel.id);
    if (f) {
      if (!objName) objName = f.name || '';
      objDisplayName = f.name ? `${f.name} (#${sel.id})` : `Flow #${sel.id}`;
    }
  } else if (sel.type === 'glow' && window.Glows) {
    const g = window.Glows.getGlow(sel.id);
    if (g) {
      if (!objName) objName = g.name || '';
      objDisplayName = g.name ? `${g.name} (#${sel.id})` : `Glow #${sel.id}`;
    }
  } else if (sel.type === 'ripple' && window.Ripples) {
    const r = window.Ripples.getRipple(sel.id);
    if (r) {
      if (!objName) objName = r.name || '';
      objDisplayName = r.name ? `${r.name} (#${sel.id})` : `Ripple #${sel.id}`;
    }
  } else if (sel.type === 'lite' && window.LiteEffects) {
    const le = window.LiteEffects.getLiteEffect(sel.id);
    if (le) {
      liteKind = le.kind || '';
      if (!objName) objName = le.name || '';
      const kindMap = { 'perimeter-tracer': 'Tracer', 'pulse': 'Pulse', 'flash': 'Flash', 'flow-lite': 'Flow', 'radar-lite': 'Radar', 'gauge-lite': 'Gauge', 'oscilloscope-lite': 'Osc', 'text-lite': 'Text' };
      const kindLabel = kindMap[le.kind] || 'Lite';
      objDisplayName = le.name ? `${le.name} (${kindLabel} #${sel.id})` : `${kindLabel} #${sel.id}`;
    }
  } else if (sel.type === 'image' && window.ImageObjects) {
    const img = window.ImageObjects.getImage(sel.id);
    if (img) {
      if (!objName) objName = img.name || '';
      objDisplayName = img.name ? `${img.name} (#${sel.id})` : `Image #${sel.id}`;
    }
  } else if (sel.type === 'group') {
    const grp = (window.AppCoordinator && typeof window.AppCoordinator.getGroup === 'function')
      ? window.AppCoordinator.getGroup(sel.id)
      : null;
    if (grp) {
      if (!objName) objName = grp.name || '';
      objDisplayName = grp.name ? `${grp.name} (${grp.id})` : `Group ${grp.id}`;
    }
  }

  let allParams = [];
  if (window.EngineBridge && typeof window.EngineBridge.getWidgetParameters === 'function') {
    allParams = window.EngineBridge.getWidgetParameters() || [];
  }
  const targetId = (sel.type === 'group' && String(sel.id).startsWith('group-'))
    ? String(sel.id)
    : `${sel.type}-${sel.id}`;
  const propDefs = getSupportedPropertiesForMember(sel.type, sel.id);

  propDefs.forEach((p) => {
    const bound = allParams.find((item) => {
      const t = item.Target || item.target;
      const pr = item.Property || item.property;
      return (t === targetId || t === String(sel.id)) && (pr === p.prop || (p.prop === 'color' && pr === 'stroke'));
    });

    const derivedName = (window.EngineBridge && typeof window.EngineBridge.generateParameterName === 'function')
      ? window.EngineBridge.generateParameterName(objName || targetId, p.prop, sel.type)
      : `${sel.type}-${sel.id}-${p.prop}`;

    const currentVal = getObjectPropValue(sel.type, sel.id, p.prop);
    const displayDef = bound ? (bound.Default !== undefined ? bound.Default : bound.default) : currentVal;

    const card = document.createElement('div');
    card.className = 'widget-prop-card' + (bound ? ' is-exposed' : '');
    card.dataset.prop = p.prop;

    // Header row
    const header = document.createElement('div');
    header.className = 'widget-prop-header';

    const labelWrap = document.createElement('label');
    labelWrap.className = 'widget-prop-label';

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = !!bound;
    chk.style.cssText = 'accent-color: #388bfd; width: 14px; height: 14px; cursor: pointer;';

    const titleSpan = document.createElement('span');
    titleSpan.innerHTML = `<strong>${p.label}</strong> <span style="font-size:0.68rem; color:#8b949e; font-weight:normal;">(${p.type})</span>`;

    labelWrap.appendChild(chk);
    labelWrap.appendChild(titleSpan);

    const badge = document.createElement('span');
    badge.className = 'widget-prop-badge';
    badge.textContent = bound ? (bound.Name || bound.name) : derivedName;
    badge.title = bound ? `Bound parameter: ${bound.Name || bound.name}` : `Derived parameter: ${derivedName}`;

    header.appendChild(labelWrap);
    header.appendChild(badge);
    card.appendChild(header);

    // Meta row
    const meta = document.createElement('div');
    meta.className = 'widget-prop-meta';

    const descSpan = document.createElement('span');
    descSpan.style.cssText = 'font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60%;';
    descSpan.textContent = p.desc || '';
    descSpan.title = p.desc || '';

    const defSpan = document.createElement('span');
    const formattedDef = typeof displayDef === 'object' ? JSON.stringify(displayDef) : String(displayDef);
    defSpan.innerHTML = `<span style="color:#8b949e;">Default:</span> <strong style="color:#e6edf3;">${formattedDef}</strong>`;

    meta.appendChild(descSpan);
    meta.appendChild(defSpan);
    card.appendChild(meta);

    // Controls when bound
    if (bound) {
      const controls = document.createElement('div');
      controls.className = 'widget-prop-controls';

      const editDefWrap = document.createElement('div');
      editDefWrap.style.cssText = 'display: flex; align-items: center; gap: 4px; font-size: 0.68rem; color: #8b949e;';
      editDefWrap.innerHTML = '<span>Authored:</span>';

      let defInput;
      if (p.type === 'color') {
        defInput = document.createElement('input');
        defInput.type = 'color';
        defInput.style.cssText = 'width: 24px; height: 18px; padding: 0; border: none; background: none; cursor: pointer;';
        defInput.value = displayDef || '#38bdf8';
      } else if (p.type === 'boolean') {
        defInput = document.createElement('input');
        defInput.type = 'checkbox';
        defInput.style.cssText = 'accent-color: #388bfd; cursor: pointer;';
        defInput.checked = !!displayDef;
      } else {
        defInput = document.createElement('input');
        defInput.type = (p.type === 'number' || p.type === 'speed') ? 'number' : 'text';
        if (p.min !== undefined) defInput.min = p.min;
        if (p.max !== undefined) defInput.max = p.max;
        if (p.type === 'speed') defInput.step = '0.1';
        defInput.style.cssText = 'width: 65px; font-size: 0.70rem; padding: 1px 4px; background: #161b22; border: 1px solid #30363d; border-radius: 3px; color: #e6edf3;';
        defInput.value = displayDef !== undefined ? displayDef : '';
      }

      const saveDefChange = () => {
        let newVal = defInput.value;
        if (p.type === 'boolean') newVal = defInput.checked;
        else if (p.type === 'number' || p.type === 'speed') newVal = parseFloat(newVal) || 0;
        const updated = Object.assign({}, bound, { Default: newVal, default: newVal });
        window.EngineBridge.addWidgetParameter(updated);
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
        if (statusMsgEl) {
          statusMsgEl.style.color = '#3fb950';
          statusMsgEl.textContent = `✓ Updated default for "${bound.Name || bound.name}" to ${newVal}`;
        }
      };
      defInput.addEventListener('change', saveDefChange);
      editDefWrap.appendChild(defInput);

      const disableBtn = document.createElement('button');
      disableBtn.type = 'button';
      disableBtn.style.cssText = 'background: #21262d; border: 1px solid #da3633; color: #f85149; font-size: 0.68rem; padding: 2px 6px; border-radius: 3px; cursor: pointer;';
      disableBtn.textContent = '✕ Disable';
      disableBtn.title = `Remove external binding "${bound.Name || bound.name}"`;
      disableBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const paramName = bound.Name || bound.name;
        if (window.EngineBridge && typeof window.EngineBridge.removeWidgetParameter === 'function') {
          window.EngineBridge.removeWidgetParameter(paramName);
          if (window.AppCoordinator) {
            window.AppCoordinator.recordHistoryImmediate();
            window.AppCoordinator.showNotification(`Removed parameter '${paramName}'`, 'info');
          }
          if (typeof window.renderWidgetParametersOverview === 'function') window.renderWidgetParametersOverview();
          if (window.FloatingPropertiesEditor && typeof window.FloatingPropertiesEditor.syncSelection === 'function') {
            window.FloatingPropertiesEditor.syncSelection();
          }
        }
      });

      controls.appendChild(editDefWrap);
      controls.appendChild(disableBtn);
      card.appendChild(controls);
    }

    // Checkbox toggle
    chk.addEventListener('change', () => {
      if (chk.checked) {
        let authoredDef = currentVal;
        if (p.type === 'number' || p.type === 'speed') {
          authoredDef = typeof currentVal === 'number' ? currentVal : parseFloat(currentVal);
          if (isNaN(authoredDef)) authoredDef = (p.type === 'speed' ? 1.0 : 0);
        } else if (p.type === 'boolean') {
          authoredDef = (currentVal === true || currentVal === 'true' || currentVal === 1);
        }
        const newParam = {
          name: derivedName,
          type: p.type,
          target: targetId,
          property: p.prop,
          default: authoredDef,
          description: p.desc || `Controls ${p.prop} on ${objDisplayName}`
        };
        if (p.min !== undefined) newParam.min = p.min;
        if (p.max !== undefined) newParam.max = p.max;
        if (p.options) newParam.options = p.options;

        if (window.EngineBridge && typeof window.EngineBridge.addWidgetParameter === 'function') {
          const res = window.EngineBridge.addWidgetParameter(newParam);
          if (res && (!res.error || res.success !== false)) {
            if (statusMsgEl) {
              statusMsgEl.style.color = '#3fb950';
              statusMsgEl.textContent = `✓ Exposed: "${derivedName}" (${p.type})`;
            }
            if (window.AppCoordinator) {
              window.AppCoordinator.recordHistoryImmediate();
              window.AppCoordinator.showNotification(`Exposed '${derivedName}'`, 'success');
            }
            if (typeof window.renderWidgetParametersOverview === 'function') window.renderWidgetParametersOverview();
            if (window.FloatingPropertiesEditor && typeof window.FloatingPropertiesEditor.syncSelection === 'function') {
              window.FloatingPropertiesEditor.syncSelection();
            }
          } else {
            const err = (res && res.error) || 'Failed to expose parameter';
            if (statusMsgEl) {
              statusMsgEl.style.color = '#f85149';
              statusMsgEl.textContent = err;
            }
            alert(`Could not expose parameter: ${err}`);
            chk.checked = false;
          }
        }
      } else {
        if (bound) {
          const paramName = bound.Name || bound.name;
          if (window.EngineBridge && typeof window.EngineBridge.removeWidgetParameter === 'function') {
            window.EngineBridge.removeWidgetParameter(paramName);
            if (window.AppCoordinator) {
              window.AppCoordinator.recordHistoryImmediate();
              window.AppCoordinator.showNotification(`Removed parameter '${paramName}'`, 'info');
            }
            if (typeof window.renderWidgetParametersOverview === 'function') window.renderWidgetParametersOverview();
            if (window.FloatingPropertiesEditor && typeof window.FloatingPropertiesEditor.syncSelection === 'function') {
              window.FloatingPropertiesEditor.syncSelection();
            }
          }
        }
      }
    });

    containerEl.appendChild(card);
  });

  // Stage 16E-M2: Group Semantic Property Mappings Authoring UI
  if (sel.type === 'group') {
    window.renderGroupSemanticMappingsSection(containerEl, sel, statusMsgEl);
  }
};

function getSupportedPropertiesForMember(mType, mId) {
  let le = null;
  let liteKind = '';
  if (mType === 'lite' && window.LiteEffects) {
    le = window.LiteEffects.getLiteEffect(mId);
    liteKind = (le && le.kind) ? le.kind : '';
  }
  let propDefs = getDrawerWidgetPropDefs(mType, mId, liteKind) || [];
  if (mType === 'lite' && liteKind) {
    propDefs = propDefs.filter((p) => {
      if (['text', 'borderColor', 'bgOpacity', 'scrollSpeed', 'typeSpeed', 'fontSize', 'letterSpacing', 'padding', 'linesPerSec', 'lineSpacing', 'holdDelay', 'clearDuration', 'typeMode', 'typeRepeat', 'textAnim'].includes(p.prop)) return liteKind === 'text-lite';
      if (['lineGapRatio', 'segmentStyle', 'burstCycles', 'pauseSeconds', 'pauseVisibility'].includes(p.prop)) return liteKind === 'perimeter-tracer';
      if (p.prop === 'segments') return liteKind === 'perimeter-tracer' || liteKind === 'gauge-lite' || liteKind === 'oscilloscope-lite';
      if (p.prop === 'strokeWidth') {
        return liteKind === 'perimeter-tracer' || liteKind === 'pulse' || liteKind === 'flow-lite' || liteKind === 'radar-lite' || liteKind === 'gauge-lite' || liteKind === 'oscilloscope-lite' || liteKind === 'text-lite';
      }
      if (p.prop === 'showGuide') {
        return liteKind === 'perimeter-tracer' || liteKind === 'flow-lite' || liteKind === 'radar-lite' || liteKind === 'gauge-lite' || liteKind === 'oscilloscope-lite' || liteKind === 'text-lite';
      }
      if (p.prop === 'startOffset') return liteKind === 'perimeter-tracer' || liteKind === 'oscilloscope-lite' || liteKind === 'text-lite';
      if (['value', 'minValue', 'maxValue', 'labelText', 'unit'].includes(p.prop)) return liteKind === 'gauge-lite';
      if (p.prop === 'bgColor') return liteKind === 'gauge-lite' || liteKind === 'oscilloscope-lite' || liteKind === 'text-lite';
      if (p.prop === 'direction') return liteKind === 'perimeter-tracer' || liteKind === 'flow-lite' || liteKind === 'gauge-lite' || liteKind === 'oscilloscope-lite' || liteKind === 'text-lite';
      if (p.prop === 'playbackMode') return liteKind === 'perimeter-tracer' || liteKind === 'flow-lite' || liteKind === 'oscilloscope-lite' || liteKind === 'text-lite';
      if (['dashLength', 'gapLength', 'dotSize', 'delay', 'endDelay', 'startMode', 'endMode'].includes(p.prop)) return liteKind === 'flow-lite';
      if (p.prop === 'curvature') return liteKind === 'flow-lite' || liteKind === 'text-lite';
      if (p.prop === 'rings') return liteKind === 'radar-lite';
      if (p.prop === 'scale' || p.prop === 'minScale') return liteKind === 'pulse' || liteKind === 'radar-lite';
      if (p.prop === 'period') return liteKind === 'pulse' || liteKind === 'radar-lite' || liteKind === 'flow-lite' || liteKind === 'perimeter-tracer' || liteKind === 'oscilloscope-lite';
      if (['trigger', 'duration', 'repeat', 'repeatInterval'].includes(p.prop)) return liteKind === 'flash';
      if (p.prop === 'intensity') return liteKind === 'pulse' || liteKind === 'flash' || liteKind === 'oscilloscope-lite';
      if (p.prop === 'samples') return liteKind === 'oscilloscope-lite';
      if (p.prop === 'armThickness') return liteKind === 'pulse' || liteKind === 'flash';
      if (p.prop === 'speed') return liteKind === 'perimeter-tracer' || liteKind === 'pulse' || liteKind === 'flow-lite' || liteKind === 'radar-lite' || liteKind === 'oscilloscope-lite' || liteKind === 'text-lite';
      return true;
    }).map((p) => {
      const copy = Object.assign({}, p);
      if (p.prop === 'color') {
        if (liteKind === 'text-lite') {
          copy.label = 'Text Colour';
          copy.desc = 'Primary text colour for Text Box Lite';
        } else if (liteKind === 'radar-lite') {
          copy.label = 'Ping Ring Colour';
        } else if (liteKind === 'gauge-lite') {
          copy.label = 'Gauge Fill Colour';
        } else if (liteKind === 'oscilloscope-lite') {
          copy.label = 'Waveform Trace Colour';
        } else if (liteKind === 'flow-lite') {
          copy.label = 'Flow Colour';
        } else if (liteKind === 'perimeter-tracer') {
          copy.label = 'Tracer Colour';
        } else if (liteKind === 'pulse') {
          copy.label = 'Pulse Colour';
        } else if (liteKind === 'flash') {
          copy.label = 'Flash Colour';
        }
      } else if (p.prop === 'bgColor') {
        if (liteKind === 'text-lite') {
          copy.label = 'Box Background Colour';
          copy.desc = 'Container background fill colour for Text Box Lite';
        } else if (liteKind === 'gauge-lite') {
          copy.label = 'Track Background Colour';
        } else if (liteKind === 'oscilloscope-lite') {
          copy.label = 'Screen Background Colour';
        }
      } else if (p.prop === 'speed') {
        if (liteKind === 'flow-lite' || liteKind === 'oscilloscope-lite' || liteKind === 'perimeter-tracer') {
          copy.label = liteKind === 'perimeter-tracer' ? 'Cycle Duration / Speed (s)' : 'Cycle Duration (s)';
          copy.min = 0.2;
          copy.max = 30.0;
          copy.step = 0.1;
          copy.desc = 'Cycle duration in seconds (0.2 to 30.0 s)';
        } else if (liteKind === 'text-lite') {
          copy.label = 'Transition / Fade Duration (s)';
          copy.min = 0.0;
          copy.max = 30.0;
          copy.step = 0.05;
          copy.desc = 'Transition or fade duration in seconds (0.0 to 30.0 s)';
        } else {
          copy.label = 'Speed / Rate';
          copy.min = 0.1;
          copy.max = 10.0;
          copy.step = 0.1;
        }
      } else if (p.prop === 'period') {
        copy.label = 'Cycle Duration / Period (s)';
        copy.min = 0.2;
        copy.max = 30.0;
        copy.step = 0.1;
      } else if (p.prop === 'strokeWidth') {
        copy.step = 0.5;
        if (liteKind === 'perimeter-tracer' || liteKind === 'radar-lite') {
          copy.min = 0.5;
          copy.max = 20.0;
        } else if (liteKind === 'flow-lite') {
          copy.min = 0.5;
          copy.max = 24.0;
        } else if (liteKind === 'gauge-lite') {
          copy.min = 0.5;
          copy.max = 32.0;
        } else if (liteKind === 'oscilloscope-lite') {
          copy.min = 0.5;
          copy.max = 16.0;
        } else if (liteKind === 'text-lite') {
          copy.label = 'Border Thickness (px)';
          copy.min = 0.0;
          copy.max = 24.0;
        }
      } else if (p.prop === 'segments') {
        copy.step = 1;
        if (liteKind === 'perimeter-tracer') {
          copy.min = 1;
          copy.max = 16;
        } else if (liteKind === 'gauge-lite') {
          copy.min = 2;
          copy.max = 32;
        } else if (liteKind === 'oscilloscope-lite') {
          copy.label = 'Cycles (Freq)';
          copy.min = 1;
          copy.max = 12;
        }
      } else if (p.prop === 'startOffset') {
        copy.step = 1;
        if (liteKind === 'oscilloscope-lite') {
          copy.label = 'Baseline (%)';
          copy.min = 10;
          copy.max = 90;
        } else if (liteKind === 'text-lite') {
          copy.label = 'Arc Offset (%)';
          copy.min = 0;
          copy.max = 100;
        } else {
          copy.min = 0;
          copy.max = 100;
        }
      } else if (p.prop === 'intensity') {
        copy.step = 0.05;
        if (liteKind === 'oscilloscope-lite') {
          copy.label = 'Amplitude';
          copy.min = 0.05;
          copy.max = 1.0;
        } else {
          copy.min = 0.0;
          copy.max = 1.0;
        }
      } else if (p.prop === 'direction') {
        copy.options = (liteKind === 'flow-lite' || liteKind === 'gauge-lite' || liteKind === 'oscilloscope-lite' || liteKind === 'text-lite')
          ? ['forward', 'reverse']
          : ['cw', 'ccw'];
      } else if (p.prop === 'playbackMode') {
        copy.options = liteKind === 'oscilloscope-lite'
          ? ['static', 'animated', 'sampled']
          : ['loop', 'pingpong', 'once'];
      } else if (p.prop === 'minScale') {
        copy.step = 0.05;
        copy.min = liteKind === 'radar-lite' ? 0.05 : 0.2;
        copy.max = 2.0;
        copy.label = liteKind === 'radar-lite' ? 'Inner Start Scale' : 'Min Pulse Scale';
      } else if (p.prop === 'curvature') {
        copy.label = liteKind === 'flow-lite' ? 'Path Curvature (-100..100%)' : 'Arc Curvature (-100..100%)';
      } else if (p.prop === 'value' && liteKind === 'gauge-lite') {
        copy.step = 0.5;
        copy.min = (le && le.minValue !== undefined && Number.isFinite(Number(le.minValue))) ? Number(le.minValue) : 0;
        copy.max = (le && le.maxValue !== undefined && Number.isFinite(Number(le.maxValue)) && Number(le.maxValue) > copy.min) ? Number(le.maxValue) : (copy.min + 100);
      }
      return copy;
    });
  }
  return propDefs;
}

function getGroupMemberDisplayLabel(m) {
  if (!m) return 'Unknown Member';
  if (m.type === 'node' && window.DiagramNodes) {
    const n = window.DiagramNodes.getNode(m.id);
    if (n) return `Node #${m.id} — ${n.name || n.text || n.shape || 'node'}`;
  } else if (m.type === 'flow' && window.DataFlows) {
    const f = window.DataFlows.getFlow(m.id);
    if (f) return `Flow #${m.id} — ${f.name || 'flow'}`;
  } else if (m.type === 'glow' && window.Glows) {
    const g = window.Glows.getGlow(m.id);
    if (g) return `Glow #${m.id} — ${g.name || 'glow'}`;
  } else if (m.type === 'ripple' && window.Ripples) {
    const r = window.Ripples.getRipple(m.id);
    if (r) return `Ripple #${m.id} — ${r.name || 'ripple'}`;
  } else if (m.type === 'image' && window.ImageObjects) {
    const img = window.ImageObjects.getImage(m.id);
    if (img) return `Image ${m.id} — ${img.name || img.filename || 'image'}`;
  } else if (m.type === 'lite' && window.LiteEffects) {
    const le = window.LiteEffects.getLiteEffect(m.id);
    if (le) {
      const kindMap = { 'perimeter-tracer': 'Tracer', 'pulse': 'Pulse', 'flash': 'Flash', 'flow-lite': 'Flow Lite', 'radar-lite': 'Radar Lite', 'gauge-lite': 'Gauge Lite', 'oscilloscope-lite': 'Oscilloscope Lite', 'text-lite': 'Text Box Lite' };
      return `${kindMap[le.kind] || le.kind} #${m.id} — ${le.name || le.kind}`;
    }
  }
  return `${m.type} #${m.id}`;
}

window.GroupMappingDialog = {
  activeGroupId: null,
  originalAlias: null,
  isPersisted: false,
  lastSavedSnapshot: null,
  statusMsgEl: null,
  targetRows: [],
  _explicitNumberToText: false,
  _userEditedMin: false,
  _userEditedMax: false,
  _userEditedOptions: false,
  _bound: false,

  _ensureBound() {
    if (this._bound) return;
    const modal = document.getElementById('groupMappingModal');
    if (!modal) return;
    this._bound = true;

    const closeBtn = document.getElementById('btnGroupMappingModalClose');
    const cancelBtn = document.getElementById('btnGroupMappingModalCancel');
    const saveBtn = document.getElementById('btnGroupMappingModalSave');
    const addTargetBtn = document.getElementById('btnGmModalAddTarget');
    const newMappingBtn = document.getElementById('btnGmModalNewMapping');
    const aliasIn = document.getElementById('gmModalAliasInput');
    const labelIn = document.getElementById('gmModalLabelInput');
    const descIn = document.getElementById('gmModalDescInput');
    const typeSel = document.getElementById('gmModalTypeSelect');
    const defIn = document.getElementById('gmModalDefaultInput');
    const defCol = document.getElementById('gmModalDefaultColorPicker');
    const defBool = document.getElementById('gmModalDefaultBoolSelect');
    const minIn = document.getElementById('gmModalMinInput');
    const maxIn = document.getElementById('gmModalMaxInput');
    const optIn = document.getElementById('gmModalOptionsInput');

    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.cancel());
    if (newMappingBtn) {
      newMappingBtn.addEventListener('click', () => {
        if (this.activeGroupId) {
          this.open(this.activeGroupId, null, this.statusMsgEl);
        }
      });
    }
    if (addTargetBtn) {
      addTargetBtn.addEventListener('click', () => {
        if (addTargetBtn.disabled || !this.isPersisted) return;
        this.addTargetRow();
        this._recalculateSharedConstraints({ resetDefault: false });
        this.validateForm();
      });
    }
    if (saveBtn) saveBtn.addEventListener('click', () => this.save());

    [aliasIn, labelIn, descIn, defIn, minIn, maxIn, optIn].forEach((el) => {
      if (el) {
        el.addEventListener('input', () => {
          if (el === minIn) {
            this._userEditedMin = (minIn.value.trim() !== '');
          } else if (el === maxIn) {
            this._userEditedMax = (maxIn.value.trim() !== '');
          } else if (el === optIn) {
            this._userEditedOptions = (optIn.value.trim() !== '');
          } else if (el === defIn) {
            const curType = (typeSel && typeSel.value) || 'number';
            if (curType === 'color' && defCol && /^#[0-9a-fA-F]{6}$/.test(defIn.value.trim())) {
              defCol.value = defIn.value.trim();
            } else if (curType === 'boolean' && defBool) {
              defBool.value = (defIn.value.trim().toLowerCase() === 'false' || defIn.value.trim() === '0') ? 'false' : 'true';
            }
          }
          this.validateForm();
        });
        el.addEventListener('change', () => this.validateForm());
      }
    });

    if (defCol && defIn) {
      defCol.addEventListener('input', (e) => {
        defIn.value = e.target.value;
        this.validateForm();
      });
    }

    if (defBool && defIn) {
      defBool.addEventListener('change', (e) => {
        defIn.value = e.target.value;
        this.validateForm();
      });
    }

    if (typeSel) {
      typeSel.addEventListener('change', () => {
        this._explicitNumberToText = (typeSel.value === 'number');
        const primaryDef = this._getPrimarySelectedPropDef();
        this._syncTypeControls(true, primaryDef);
        this.targetRows.forEach((r) => r.populateProps(true));
        this.validateForm();
      });
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style && modal.style.display === 'flex') {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          this.cancel();
        }
      });
    }
  },

  _getGroup(groupId = null) {
    const gid = groupId || this.activeGroupId;
    if (!gid) return null;
    if (window.EngineBridge && typeof window.EngineBridge.getGroup === 'function' && window.EngineBridge.isReady && window.EngineBridge.isReady()) {
      const g = window.EngineBridge.getGroup(gid);
      if (g) return g;
    }
    if (window.AppCoordinator && typeof window.AppCoordinator.getGroup === 'function') {
      const g = window.AppCoordinator.getGroup(gid);
      if (g) return g;
    }
    if (window.EngineBridge && typeof window.EngineBridge.getGroup === 'function') {
      return window.EngineBridge.getGroup(gid);
    }
    return null;
  },

  refreshParentInspectors(groupId = null) {
    const gid = groupId || this.activeGroupId;
    if (gid && window.AppCoordinator) {
      const curSel = typeof window.AppCoordinator.getActiveSelection === 'function'
        ? window.AppCoordinator.getActiveSelection()
        : window.AppCoordinator.activeSelection;
      if (!curSel || curSel.type !== 'group' || String(curSel.id) !== String(gid)) {
        const grp = this._getGroup(gid);
        if (grp && window.AppCoordinator.activeSelection) {
          window.AppCoordinator.activeSelection = {
            type: 'group',
            id: String(gid),
            items: Array.isArray(grp.members) ? [...grp.members] : [],
            name: grp.name || ('Group ' + grp.id)
          };
        }
      }
    }
    if (typeof window.renderWidgetParametersOverview === 'function') {
      window.renderWidgetParametersOverview(gid ? { type: 'group', id: String(gid) } : undefined);
    }
    if (window.FloatingPropertiesEditor) {
      if (window.FloatingPropertiesEditor.isOpen && gid && window.FloatingPropertiesEditor.activeType === 'group') {
        window.FloatingPropertiesEditor.activeId = String(gid);
      }
      if (typeof window.FloatingPropertiesEditor.syncFromActiveObject === 'function') {
        window.FloatingPropertiesEditor.syncFromActiveObject();
      } else if (typeof window.FloatingPropertiesEditor.syncSelection === 'function') {
        window.FloatingPropertiesEditor.syncSelection();
      }
    }
  },

  _syncAddBindingButton() {
    const addTargetBtn = document.getElementById('btnGmModalAddTarget');
    const hintEl = document.getElementById('gmModalAddBindingHint');
    if (addTargetBtn) {
      addTargetBtn.disabled = !this.isPersisted;
      addTargetBtn.style.opacity = this.isPersisted ? '1' : '0.45';
      addTargetBtn.style.cursor = this.isPersisted ? 'pointer' : 'not-allowed';
    }
    if (hintEl) {
      hintEl.textContent = this.isPersisted
        ? 'Click "+ Add New Binding" to bind another Group Member and compatible Property to this same semantic alias.'
        : 'Save the initial mapping first to enable adding more group member bindings to this alias.';
      hintEl.style.color = this.isPersisted ? '#7ee787' : '#8b949e';
    }
  },

  _getPrimarySelectedPropDef() {
    if (!this.targetRows || this.targetRows.length === 0) return null;
    const primary = this.targetRows[0];
    if (!primary || !primary.memSel || !primary.propSel) return null;
    const [mType, mId] = (primary.memSel.value || '').split(':');
    const propName = primary.propSel.value || '';
    if (!mType || !mId || !propName) return null;
    const supported = getSupportedPropertiesForMember(mType, mId);
    return supported.find((p) => p.prop === propName) || null;
  },

  computeSharedDomain() {
    const targets = [];
    let hasMin = false;
    let sharedMin = -Infinity;
    let minSource = '';
    let hasMax = false;
    let sharedMax = Infinity;
    let maxSource = '';
    let hasStep = false;
    let sharedStep = 0;
    let hasEnum = false;
    let sharedOptions = [];
    const enumSources = [];

    (this.targetRows || []).forEach((ref) => {
      if (!ref || !ref.memSel || !ref.propSel) return;
      const [mType, mId] = (ref.memSel.value || '').split(':');
      const propName = ref.propSel.value || '';
      if (!mType || !mId || !propName) return;
      const supported = getSupportedPropertiesForMember(mType, mId);
      const propDef = supported.find((p) => p.prop === propName);
      if (!propDef) return;
      const targetStr = mId.startsWith(mType + '-') ? mId : `${mType}-${mId}`;
      const desc = `${targetStr}.${propName}`;
      targets.push({ memberType: mType, memberId: mId, target: targetStr, property: propName, propDef });

      if (propDef.type === 'number' || propDef.type === 'speed') {
        if (propDef.min !== undefined && Number.isFinite(Number(propDef.min))) {
          const v = Number(propDef.min);
          if (!hasMin || v > sharedMin) {
            sharedMin = v;
            minSource = `${desc} (min ${v})`;
          }
          hasMin = true;
        }
        if (propDef.max !== undefined && Number.isFinite(Number(propDef.max))) {
          const v = Number(propDef.max);
          if (!hasMax || v < sharedMax) {
            sharedMax = v;
            maxSource = `${desc} (max ${v})`;
          }
          hasMax = true;
        }
        if (propDef.step !== undefined && Number.isFinite(Number(propDef.step)) && Number(propDef.step) > 0) {
          const s = Number(propDef.step);
          if (!hasStep || s > sharedStep) {
            sharedStep = s;
          }
          hasStep = true;
        }
      } else if (propDef.type === 'enum' && Array.isArray(propDef.options)) {
        enumSources.push(`${desc} [${propDef.options.join(', ')}]`);
        if (!hasEnum) {
          sharedOptions = [...propDef.options];
          hasEnum = true;
        } else {
          sharedOptions = sharedOptions.filter((o) => propDef.options.includes(o));
        }
      }
    });

    const disjointNumeric = (hasMin && hasMax && sharedMin > sharedMax);
    const disjointEnum = (hasEnum && sharedOptions.length === 0);
    let disjointReason = '';
    if (disjointNumeric) {
      disjointReason = `Target numeric domains do not overlap: ${minSource} exceeds ${maxSource}.`;
    } else if (disjointEnum) {
      disjointReason = `Target enum domains have no shared options across: ${enumSources.join(' vs ')}.`;
    }

    return {
      targets,
      hasMin,
      min: hasMin ? sharedMin : undefined,
      minSource,
      hasMax,
      max: hasMax ? sharedMax : undefined,
      maxSource,
      hasStep,
      step: hasStep ? sharedStep : undefined,
      hasEnum,
      options: hasEnum ? sharedOptions : undefined,
      disjointNumeric,
      disjointEnum,
      disjointReason
    };
  },

  _recalculateSharedConstraints({ resetDefault = false, preserveExistingOnOpen = false } = {}) {
    const typeSel = document.getElementById('gmModalTypeSelect');
    const defIn = document.getElementById('gmModalDefaultInput');
    const minIn = document.getElementById('gmModalMinInput');
    const maxIn = document.getElementById('gmModalMaxInput');
    const optIn = document.getElementById('gmModalOptionsInput');
    const constraintHint = document.getElementById('gmModalConstraintHint');
    if (!typeSel) return;

    const t = typeSel.value || 'number';
    const isNum = (t === 'number' || t === 'speed');
    const shared = this.computeSharedDomain();

    if (isNum) {
      if (shared.hasStep) {
        const stepStr = String(shared.step);
        if (minIn) minIn.step = stepStr;
        if (maxIn) maxIn.step = stepStr;
        if (defIn) defIn.step = stepStr;
      }
      if (!preserveExistingOnOpen && !shared.disjointNumeric) {
        if (minIn && shared.hasMin) {
          const curMin = minIn.value.trim() !== '' ? Number(minIn.value) : NaN;
          const keepUserMin = this._userEditedMin && Number.isFinite(curMin) && curMin >= shared.min && (!shared.hasMax || curMin <= shared.max);
          if (!keepUserMin) {
            minIn.value = String(shared.min);
          }
        }
        if (maxIn && shared.hasMax) {
          const curMax = maxIn.value.trim() !== '' ? Number(maxIn.value) : NaN;
          const keepUserMax = this._userEditedMax && Number.isFinite(curMax) && curMax <= shared.max && (!shared.hasMin || curMax >= shared.min);
          if (!keepUserMax) {
            maxIn.value = String(shared.max);
          }
        }
        if (defIn) {
          const effMin = (minIn && minIn.value.trim() !== '' && Number.isFinite(Number(minIn.value))) ? Number(minIn.value) : (shared.hasMin ? shared.min : 0);
          const effMax = (maxIn && maxIn.value.trim() !== '' && Number.isFinite(Number(maxIn.value))) ? Number(maxIn.value) : (shared.hasMax ? shared.max : 100);
          const curDef = defIn.value.trim() !== '' ? Number(defIn.value) : NaN;
          if (resetDefault || !Number.isFinite(curDef)) {
            const firstTarget = shared.targets[0];
            const liveVal = firstTarget ? Number(getObjectPropValue(firstTarget.memberType, firstTarget.memberId, firstTarget.property)) : NaN;
            if (Number.isFinite(liveVal) && liveVal >= effMin && liveVal <= effMax) {
              defIn.value = String(liveVal);
            } else {
              defIn.value = String(t === 'speed' && 1.0 >= effMin && 1.0 <= effMax ? 1.0 : (effMax <= 1 ? effMax : Math.round((effMin + effMax) / 2)));
            }
          }
        }
      }
    } else if (t === 'enum') {
      if (!preserveExistingOnOpen && shared.hasEnum && !shared.disjointEnum) {
        if (optIn) {
          const curOpts = optIn.value.split(',').map((s) => s.trim()).filter(Boolean);
          const keepUserOpts = this._userEditedOptions && curOpts.length > 0 && curOpts.every((o) => shared.options.includes(o));
          if (!keepUserOpts) {
            optIn.value = shared.options.join(', ');
          }
        }
        if (defIn) {
          const activeOpts = (optIn && optIn.value) ? optIn.value.split(',').map((s) => s.trim()).filter(Boolean) : shared.options;
          if ((resetDefault || !activeOpts.includes(defIn.value.trim())) && activeOpts.length > 0) {
            defIn.value = activeOpts[0];
          }
        }
      }
    }

    if (constraintHint) {
      if (shared.disjointNumeric || shared.disjointEnum) {
        constraintHint.style.color = '#f85149';
        constraintHint.textContent = `⚠️ ${shared.disjointReason}`;
      } else if (isNum && (shared.hasMin || shared.hasMax)) {
        constraintHint.style.color = '#8b949e';
        const stepSuffix = shared.hasStep ? ` (step ${shared.step})` : '';
        if (shared.targets.length > 1) {
          constraintHint.textContent = `Shared domain across ${shared.targets.length} targets: ${shared.min ?? '−∞'} to ${shared.max ?? '+∞'}${stepSuffix}`;
        } else {
          constraintHint.textContent = `Target domain bounds: ${shared.min ?? '−∞'} to ${shared.max ?? '+∞'}${stepSuffix}`;
        }
      } else if (t === 'enum' && shared.hasEnum) {
        constraintHint.style.color = '#8b949e';
        constraintHint.textContent = `Allowed target options: ${shared.options.join(', ')}`;
      } else {
        constraintHint.style.color = '#8b949e';
        constraintHint.textContent = '';
      }
    }
  },

  _syncTypeControls(resetDefaults, propDef = null) {
    const typeSel = document.getElementById('gmModalTypeSelect');
    const derivedTypeEl = document.getElementById('groupMappingModalDerivedType');
    const defIn = document.getElementById('gmModalDefaultInput');
    const defCol = document.getElementById('gmModalDefaultColorPicker');
    const defBool = document.getElementById('gmModalDefaultBoolSelect');
    const numConstraints = document.getElementById('gmModalNumericConstraints');
    const minWrap = document.getElementById('gmModalMinWrap');
    const maxWrap = document.getElementById('gmModalMaxWrap');
    const enumWrap = document.getElementById('gmModalEnumWrap');
    const noConstraintsNote = document.getElementById('gmModalNoConstraintsNote');
    const minIn = document.getElementById('gmModalMinInput');
    const maxIn = document.getElementById('gmModalMaxInput');
    const optIn = document.getElementById('gmModalOptionsInput');
    if (!typeSel) return;

    const t = typeSel.value || 'number';
    if (derivedTypeEl) derivedTypeEl.textContent = t;

    const isNum = (t === 'number' || t === 'speed');
    if (numConstraints) numConstraints.style.display = isNum ? 'grid' : 'none';
    if (minWrap) minWrap.style.display = isNum ? 'block' : 'none';
    if (maxWrap) maxWrap.style.display = isNum ? 'block' : 'none';
    if (enumWrap) enumWrap.style.display = (t === 'enum') ? 'block' : 'none';
    if (defCol) defCol.style.display = (t === 'color') ? 'inline-block' : 'none';
    if (defBool) defBool.style.display = (t === 'boolean') ? 'inline-block' : 'none';
    if (defIn) defIn.style.display = (t === 'boolean') ? 'none' : 'inline-block';

    if (noConstraintsNote) {
      if (!isNum && t !== 'enum') {
        noConstraintsNote.style.display = 'block';
        if (t === 'color') {
          noConstraintsNote.textContent = 'Colour domain: valid hex (#RRGGBB) or CSS colour string.';
        } else if (t === 'boolean') {
          noConstraintsNote.textContent = 'Boolean domain: true or false.';
        } else if (t === 'text') {
          noConstraintsNote.textContent = 'Text domain: string value (supports cycle-safe Text Lite runtime updates).';
        } else {
          noConstraintsNote.textContent = `Domain type: ${t}`;
        }
      } else {
        noConstraintsNote.style.display = 'none';
      }
    }

    if (resetDefaults && defIn) {
      if (t === 'color') {
        const cVal = (propDef && propDef.defaultColor) || '#38bdf8';
        defIn.value = cVal;
        if (defCol) defCol.value = cVal;
      } else if (t === 'boolean') {
        defIn.value = 'true';
        if (defBool) defBool.value = 'true';
      } else if (t === 'speed') {
        defIn.value = '1.0';
        if (minIn) minIn.value = (propDef && propDef.min !== undefined) ? String(propDef.min) : '0.1';
        if (maxIn) maxIn.value = (propDef && propDef.max !== undefined) ? String(propDef.max) : '10';
      } else if (t === 'text') {
        defIn.value = 'Nominal';
      } else if (t === 'enum') {
        const opts = (propDef && Array.isArray(propDef.options) && propDef.options.length > 0)
          ? propDef.options
          : ['loop', 'pingpong', 'once'];
        if (optIn) optIn.value = opts.join(', ');
        defIn.value = opts[0];
      } else {
        const dMin = (propDef && propDef.min !== undefined) ? propDef.min : 0;
        const dMax = (propDef && propDef.max !== undefined) ? propDef.max : 100;
        if (minIn) minIn.value = String(dMin);
        if (maxIn) maxIn.value = String(dMax);
        defIn.value = String(dMax <= 1 ? 1 : Math.round((dMin + dMax) / 2));
      }
    }
    this._recalculateSharedConstraints({ resetDefault: false, preserveExistingOnOpen: !resetDefaults });
  },

  _applyPropertyDomainFromMember(mType, mId, propDef) {
    if (!propDef) return;
    const typeSel = document.getElementById('gmModalTypeSelect');
    const typeWrap = document.getElementById('gmModalTypeResolutionWrap');
    const defIn = document.getElementById('gmModalDefaultInput');
    const defCol = document.getElementById('gmModalDefaultColorPicker');
    const defBool = document.getElementById('gmModalDefaultBoolSelect');
    const minIn = document.getElementById('gmModalMinInput');
    const maxIn = document.getElementById('gmModalMaxInput');
    const optIn = document.getElementById('gmModalOptionsInput');

    if (typeWrap) {
      typeWrap.style.display = (propDef.type === 'text') ? 'flex' : 'none';
    }

    let derivedType = propDef.type || 'number';
    if (propDef.type === 'text' && this._explicitNumberToText) {
      derivedType = 'number';
    }
    if (typeSel) {
      typeSel.value = derivedType;
    }

    this._userEditedMin = false;
    this._userEditedMax = false;
    this._userEditedOptions = false;
    this._syncTypeControls(false, propDef);

    const liveVal = getObjectPropValue(mType, mId, propDef.prop);
    if (derivedType === 'color') {
      const hex = (typeof liveVal === 'string' && liveVal.trim()) ? liveVal.trim() : '#38bdf8';
      if (defIn) defIn.value = hex;
      if (defCol && /^#[0-9a-fA-F]{6}$/.test(hex)) defCol.value = hex;
    } else if (derivedType === 'boolean') {
      const bStr = (liveVal === false || liveVal === 'false' || liveVal === 0) ? 'false' : 'true';
      if (defIn) defIn.value = bStr;
      if (defBool) defBool.value = bStr;
    } else if (derivedType === 'enum') {
      const opts = Array.isArray(propDef.options) && propDef.options.length > 0 ? propDef.options : ['cw', 'ccw'];
      if (optIn) optIn.value = opts.join(', ');
      const curStr = (liveVal !== undefined && liveVal !== null && opts.includes(String(liveVal))) ? String(liveVal) : opts[0];
      if (defIn) defIn.value = curStr;
    } else if (derivedType === 'number' || derivedType === 'speed') {
      const minBound = propDef.min !== undefined ? propDef.min : (derivedType === 'speed' ? 0.1 : 0);
      const maxBound = propDef.max !== undefined ? propDef.max : (derivedType === 'speed' ? 10 : 100);
      if (minIn) minIn.value = String(minBound);
      if (maxIn) maxIn.value = String(maxBound);
      const numLive = Number(liveVal);
      if (Number.isFinite(numLive) && numLive >= minBound && numLive <= maxBound) {
        if (defIn) defIn.value = String(numLive);
      } else {
        if (defIn) defIn.value = String(derivedType === 'speed' && 1.0 >= minBound && 1.0 <= maxBound ? 1.0 : (maxBound <= 1 ? maxBound : Math.round((minBound + maxBound) / 2)));
      }
    } else if (derivedType === 'text') {
      if (defIn) defIn.value = (liveVal !== undefined && liveVal !== null && String(liveVal) !== '') ? String(liveVal) : 'System Ready';
    }
    this._recalculateSharedConstraints({ resetDefault: false });
  },

  open(groupId, existingMapping = null, statusMsgEl = null) {
    this._ensureBound();
    this.activeGroupId = groupId;
    this.originalAlias = existingMapping ? existingMapping.alias : null;
    this.isPersisted = Boolean(existingMapping && existingMapping.alias);
    this.lastSavedSnapshot = existingMapping ? JSON.parse(JSON.stringify(existingMapping)) : null;
    this.statusMsgEl = statusMsgEl || null;
    this.targetRows = [];
    this._explicitNumberToText = false;
    this._userEditedMin = false;
    this._userEditedMax = false;
    this._userEditedOptions = false;

    const grp = this._getGroup();
    if (!grp) return;

    const modal = document.getElementById('groupMappingModal');
    const titleEl = document.getElementById('groupMappingModalTitle');
    const grpNameEl = document.getElementById('groupMappingModalGroupName');
    const aliasIn = document.getElementById('gmModalAliasInput');
    const labelIn = document.getElementById('gmModalLabelInput');
    const descIn = document.getElementById('gmModalDescInput');
    const typeSel = document.getElementById('gmModalTypeSelect');
    const typeWrap = document.getElementById('gmModalTypeResolutionWrap');
    const defIn = document.getElementById('gmModalDefaultInput');
    const defCol = document.getElementById('gmModalDefaultColorPicker');
    const defBool = document.getElementById('gmModalDefaultBoolSelect');
    const minIn = document.getElementById('gmModalMinInput');
    const maxIn = document.getElementById('gmModalMaxInput');
    const optIn = document.getElementById('gmModalOptionsInput');
    const targetsListEl = document.getElementById('gmModalTargetsList');

    if (titleEl) {
      titleEl.textContent = existingMapping
        ? `✏️ Edit Semantic Group Property Mapping ("${existingMapping.alias}")`
        : '🔗 Add Semantic Group Property Mapping';
    }
    if (grpNameEl) grpNameEl.textContent = grp.name || grp.id;
    if (targetsListEl) targetsListEl.innerHTML = '';

    if (existingMapping) {
      if (aliasIn) aliasIn.value = existingMapping.alias || '';
      if (labelIn) labelIn.value = existingMapping.label || existingMapping.alias || '';
      if (descIn) descIn.value = existingMapping.description || '';
      if (typeSel) typeSel.value = existingMapping.type || 'number';
      const existingTargets = Array.isArray(existingMapping.targets) ? existingMapping.targets : [];
      if (existingTargets.length > 0) {
        existingTargets.forEach((t) => {
          const mType = t.memberType || (t.target ? t.target.split('-')[0] : '');
          const mId = t.memberId || (t.target ? t.target.replace(/^[^-]+-/, '') : '');
          this.addTargetRow(`${mType}:${mId}`, t.property, true);
        });
      } else {
        this.addTargetRow('', '', true);
      }
      const primaryDef = this._getPrimarySelectedPropDef();
      if (typeWrap) {
        typeWrap.style.display = (primaryDef && primaryDef.type === 'text') ? 'flex' : 'none';
      }
      this._syncTypeControls(false, primaryDef);
      const shared = this.computeSharedDomain();
      const defStr = existingMapping.default !== undefined && existingMapping.default !== null ? String(existingMapping.default) : '';
      if (defIn) defIn.value = defStr;
      if (defCol && existingMapping.type === 'color' && typeof existingMapping.default === 'string' && existingMapping.default.startsWith('#')) {
        defCol.value = existingMapping.default;
      }
      if (defBool && existingMapping.type === 'boolean') {
        defBool.value = (defStr.toLowerCase() === 'false' || defStr === '0') ? 'false' : 'true';
      }
      const hasExplicitMin = (existingMapping.min !== undefined && existingMapping.min !== null);
      const hasExplicitMax = (existingMapping.max !== undefined && existingMapping.max !== null);
      if (minIn) {
        minIn.value = hasExplicitMin ? String(existingMapping.min) : (shared.hasMin ? String(shared.min) : '');
      }
      if (maxIn) {
        maxIn.value = hasExplicitMax ? String(existingMapping.max) : (shared.hasMax ? String(shared.max) : '');
      }
      if (optIn) {
        optIn.value = Array.isArray(existingMapping.options) && existingMapping.options.length > 0
          ? existingMapping.options.join(', ')
          : (shared.hasEnum ? shared.options.join(', ') : '');
      }
      this._userEditedMin = Boolean(hasExplicitMin && (!shared.hasMin || Number(existingMapping.min) !== shared.min));
      this._userEditedMax = Boolean(hasExplicitMax && (!shared.hasMax || Number(existingMapping.max) !== shared.max));
      this._userEditedOptions = Boolean(Array.isArray(existingMapping.options) && existingMapping.options.length > 0 && (!shared.hasEnum || existingMapping.options.join(',') !== shared.options.join(',')));
      this._recalculateSharedConstraints({ resetDefault: false, preserveExistingOnOpen: true });
    } else {
      if (aliasIn) aliasIn.value = '';
      if (labelIn) labelIn.value = '';
      if (descIn) descIn.value = '';
      if (typeSel) typeSel.value = 'number';
      if (optIn) optIn.value = '';
      this.addTargetRow('', '', false);
      this._recalculateSharedConstraints({ resetDefault: false });
    }

    this._syncAddBindingButton();
    this.renderExistingMappings();
    if (modal) modal.style.display = 'flex';
    this.validateForm();
  },

  cancel() {
    const gid = this.activeGroupId;
    const modal = document.getElementById('groupMappingModal');
    if (modal) modal.style.display = 'none';
    this.activeGroupId = null;
    this.originalAlias = null;
    this.isPersisted = false;
    this.lastSavedSnapshot = null;
    if (gid) {
      this.refreshParentInspectors(gid);
    }
    if (window.WidgetExportDialog && window.WidgetExportDialog._pausedForEdit && typeof window.WidgetExportDialog.resumeFromComponentBuilder === 'function') {
      window.WidgetExportDialog.resumeFromComponentBuilder();
    }
  },

  close() {
    const gid = this.activeGroupId;
    const modal = document.getElementById('groupMappingModal');
    if (modal) modal.style.display = 'none';
    this.activeGroupId = null;
    this.originalAlias = null;
    this.isPersisted = false;
    this.lastSavedSnapshot = null;
    if (gid) {
      this.refreshParentInspectors(gid);
    }
    if (window.WidgetExportDialog && window.WidgetExportDialog._pausedForEdit && typeof window.WidgetExportDialog.resumeFromComponentBuilder === 'function') {
      window.WidgetExportDialog.resumeFromComponentBuilder();
    }
  },

  addTargetRow(initialMemberKey = '', initialProperty = '', skipDomainSync = false) {
    const grp = this._getGroup();
    const targetsListEl = document.getElementById('gmModalTargetsList');
    const typeSel = document.getElementById('gmModalTypeSelect');
    if (!grp || !targetsListEl) return null;
    const members = Array.isArray(grp.members) ? grp.members : [];
    if (members.length === 0) return null;

    const row = document.createElement('div');
    row.className = 'gm-target-row';
    row.style.cssText = 'display: grid; grid-template-columns: 1.25fr 1.35fr auto; gap: 8px; align-items: start; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 8px 10px;';

    const memWrap = document.createElement('div');
    const memLbl = document.createElement('label');
    memLbl.className = 'gm-member-label';
    memLbl.style.cssText = 'display: block; font-size: 0.70rem; font-weight: 600; color: #c9d1d9; margin-bottom: 3px;';
    memLbl.textContent = 'Group Member';
    const memSel = document.createElement('select');
    memSel.className = 'gm-member-sel';
    memSel.style.cssText = 'width: 100%; padding: 5px 7px; background: #161b22; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; font-size: 0.76rem;';
    const newRowIndex = this.targetRows.length;
    let selectedMemKey = '';
    members.forEach((m, idx) => {
      const opt = document.createElement('option');
      const key = `${m.type}:${m.id}`;
      opt.value = key;
      opt.textContent = getGroupMemberDisplayLabel(m);
      if (initialMemberKey ? key === initialMemberKey : idx === (newRowIndex % members.length)) {
        opt.selected = true;
        selectedMemKey = key;
      }
      memSel.appendChild(opt);
    });
    if (!selectedMemKey && members.length > 0) {
      selectedMemKey = `${members[0].type}:${members[0].id}`;
    }
    if (selectedMemKey) {
      memSel.value = selectedMemKey;
    }
    memWrap.appendChild(memLbl);
    memWrap.appendChild(memSel);

    const propWrap = document.createElement('div');
    const propLbl = document.createElement('label');
    propLbl.className = 'gm-prop-label';
    propLbl.style.cssText = 'display: block; font-size: 0.70rem; font-weight: 600; color: #c9d1d9; margin-bottom: 3px;';
    propLbl.textContent = 'Property';
    const propSel = document.createElement('select');
    propSel.className = 'gm-prop-sel';
    propSel.style.cssText = 'width: 100%; padding: 5px 7px; background: #161b22; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; font-size: 0.76rem;';
    const propHint = document.createElement('div');
    propHint.className = 'gm-prop-hint';
    propHint.style.cssText = 'font-size: 0.68rem; color: #8b949e; margin-top: 3px;';
    propWrap.appendChild(propLbl);
    propWrap.appendChild(propSel);
    propWrap.appendChild(propHint);

    const rowRef = { row, memSel, propSel, propHint, populateProps: null };
    this.targetRows.push(rowRef);

    const isNumOrSpeed = (tp) => tp === 'number' || tp === 'speed';

    const populateProps = (preserveCurrent, updateDomainFromPrimary = false) => {
      const [mType, mId] = (memSel.value || '').split(':');
      const rowIndex = this.targetRows.indexOf(rowRef);
      const isPrimaryTypeDriver = (rowIndex === 0 && this.targetRows.length <= 1);
      const mKindType = (typeSel && typeSel.value) ? typeSel.value : 'number';
      const supportedProps = getSupportedPropertiesForMember(mType, mId);
      const prevVal = preserveCurrent ? propSel.value : initialProperty;
      propSel.innerHTML = '';

      let firstCompatibleVal = '';
      let firstOverlappingVal = '';
      let compatibleCount = 0;

      const primaryDef = (rowIndex > 0) ? this._getPrimarySelectedPropDef() : null;

      supportedProps.forEach((p) => {
        const compatible = isPrimaryTypeDriver
          || (p.type === mKindType)
          || (isNumOrSpeed(mKindType) && isNumOrSpeed(p.type))
          || (isNumOrSpeed(mKindType) && p.type === 'text');
        const opt = document.createElement('option');
        opt.value = p.prop;
        if (compatible) {
          compatibleCount++;
          if (!firstCompatibleVal) firstCompatibleVal = p.prop;
          let domainConflictNote = '';
          if (!isPrimaryTypeDriver && primaryDef) {
            if (isNumOrSpeed(mKindType) && isNumOrSpeed(p.type) && primaryDef.min !== undefined && primaryDef.max !== undefined && p.min !== undefined && p.max !== undefined) {
              const sMin = Math.max(Number(primaryDef.min), Number(p.min));
              const sMax = Math.min(Number(primaryDef.max), Number(p.max));
              if (sMin > sMax) {
                domainConflictNote = ' [⚠️ non-overlapping range]';
              }
            } else if (mKindType === 'enum' && p.type === 'enum' && Array.isArray(primaryDef.options) && Array.isArray(p.options)) {
              const overlap = primaryDef.options.filter((o) => p.options.includes(o));
              if (overlap.length === 0) {
                domainConflictNote = ' [⚠️ no shared enum options]';
              }
            }
          }
          if (!domainConflictNote && !firstOverlappingVal) {
            firstOverlappingVal = p.prop;
          }
          const convNote = (!isPrimaryTypeDriver && isNumOrSpeed(mKindType) && p.type === 'text') ? ' [number→text readout]' : '';
          const rangeNote = (p.min !== undefined || p.max !== undefined) ? ` [${p.min ?? '−∞'}..${p.max ?? '+∞'}]` : '';
          opt.textContent = `${domainConflictNote ? '⚠️' : '✓'} ${p.prop} — ${p.label} (${p.type}${rangeNote}${convNote}${domainConflictNote})`;
        } else {
          opt.disabled = true;
          opt.textContent = `✕ ${p.prop} (${p.type} — requires ${p.type}, incompatible with ${mKindType})`;
        }
        propSel.appendChild(opt);
      });

      if (compatibleCount === 0) {
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = `No properties on ${mType} #${mId} accept type "${mKindType}"`;
        propSel.appendChild(emptyOpt);
        propSel.value = '';
        propHint.style.color = '#f85149';
        propHint.textContent = `⚠️ This member has no properties compatible with "${mKindType}". Choose another member.`;
      } else {
        const optList = Array.from(propSel.options || propSel.children || []);
        const canSelectPrev = prevVal && optList.some((o) => o.value === prevVal && !o.disabled);
        propSel.value = canSelectPrev ? prevVal : (firstOverlappingVal || firstCompatibleVal);
        const selectedDef = supportedProps.find((p) => p.prop === propSel.value);
        if (selectedDef) {
          if (rowIndex === 0 && updateDomainFromPrimary) {
            this._applyPropertyDomainFromMember(mType, mId, selectedDef);
          }
          const activeType = (typeSel && typeSel.value) ? typeSel.value : selectedDef.type;
          propHint.style.color = '#8b949e';
          if (isNumOrSpeed(activeType) && selectedDef.type === 'text') {
            propHint.textContent = `ℹ️ Numeric value converts automatically to text readout on ${mType}-${mId}.${selectedDef.prop}.`;
          } else if (selectedDef.min !== undefined || selectedDef.max !== undefined) {
            const stepText = selectedDef.step !== undefined ? ` (step ${selectedDef.step})` : '';
            propHint.textContent = `ℹ️ Target domain constraint: ${selectedDef.min ?? '−∞'} to ${selectedDef.max ?? '+∞'}${stepText}.`;
          } else if (Array.isArray(selectedDef.options)) {
            propHint.textContent = `ℹ️ Allowed target options: ${selectedDef.options.join(', ')}.`;
          } else {
            propHint.textContent = selectedDef.desc || '';
          }
        }
      }
    };
    rowRef.populateProps = populateProps;

    memSel.addEventListener('change', () => {
      const isPrimary = (this.targetRows.indexOf(rowRef) === 0 && this.targetRows.length <= 1 && !this.isPersisted);
      populateProps(false, isPrimary);
      this._recalculateSharedConstraints({ resetDefault: false });
      this.validateForm();
    });
    propSel.addEventListener('change', () => {
      const isPrimary = (this.targetRows.indexOf(rowRef) === 0 && this.targetRows.length <= 1);
      populateProps(true, isPrimary);
      if (this.targetRows.indexOf(rowRef) === 0 && this.targetRows.length > 1) {
        this.targetRows.slice(1).forEach((r) => r.populateProps(true, false));
      }
      this._recalculateSharedConstraints({ resetDefault: false });
      this.validateForm();
    });

    populateProps(false, !skipDomainSync && this.targetRows.length === 1);

    const remBtn = document.createElement('button');
    remBtn.type = 'button';
    remBtn.className = 'gm-remove-target-btn';
    remBtn.style.cssText = 'background: #21262d; border: 1px solid #30363d; color: #f85149; cursor: pointer; font-size: 0.75rem; padding: 5px 8px; border-radius: 4px; align-self: start; margin-top: 18px;';
    remBtn.textContent = '✕ Remove';
    remBtn.title = 'Remove this target binding';

    remBtn.addEventListener('click', () => {
      if (this.targetRows.length <= 1) {
        this.validateForm('A semantic mapping must have at least one target binding.');
        return;
      }
      const idx = this.targetRows.indexOf(rowRef);
      if (idx >= 0) this.targetRows.splice(idx, 1);
      if (typeof row.remove === 'function') row.remove();
      else if (row.parentNode) row.parentNode.removeChild(row);
      this.targetRows.forEach((r) => r.populateProps(true, false));
      this._recalculateSharedConstraints({ resetDefault: false });
      this.validateForm();
    });

    row.appendChild(memWrap);
    row.appendChild(propWrap);
    row.appendChild(remBtn);
    targetsListEl.appendChild(row);
    return rowRef;
  },

  renderExistingMappings() {
    const listEl = document.getElementById('gmModalExistingMappingsList');
    const countEl = document.getElementById('gmModalExistingCount');
    if (!listEl) return;
    const grp = this._getGroup();
    const mappings = (grp && Array.isArray(grp.mappings)) ? grp.mappings : [];
    if (countEl) countEl.textContent = String(mappings.length);

    listEl.innerHTML = '';
    if (mappings.length === 0) {
      listEl.innerHTML = `<div style="font-size: 0.72rem; color: #8b949e; font-style: italic; padding: 6px 4px;">No semantic mappings saved on this group yet.</div>`;
      return;
    }

    const grpName = (grp && (grp.name || grp.id)) || 'group-1';
    mappings.forEach((m) => {
      const item = document.createElement('div');
      item.className = 'gm-existing-mapping-item';
      item.dataset.alias = m.alias;
      const isEditingThis = (this.isPersisted && this.originalAlias === m.alias);
      item.style.cssText = `display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 9px; background: #0d1117; border: 1px solid ${isEditingThis ? '#3fb950' : '#30363d'}; border-radius: 6px; font-size: 0.74rem;`;

      const paramName = (window.EngineBridge && typeof window.EngineBridge.generateParameterName === 'function')
        ? window.EngineBridge.generateParameterName(grpName, m.alias, 'group')
        : `${grpName}-group-${m.alias}`;
      const targetsText = (Array.isArray(m.targets) ? m.targets : [])
        .map((t) => `${t.target}.${t.property}`)
        .join(', ');

      const infoWrap = document.createElement('div');
      infoWrap.style.cssText = 'display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1;';
      infoWrap.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          <code style="color: #7ee787; background: rgba(63,185,80,0.12); padding: 1px 5px; border-radius: 3px; font-weight: 600;">${m.alias}</code>
          <strong style="color: #e6edf3;">${m.label || m.alias}</strong>
          <span style="color: #8b949e; font-size: 0.68rem;">(${m.type})</span>
          <code style="color: #58a6ff; font-size: 0.68rem;">${paramName}</code>
        </div>
        <div style="color: #8b949e; font-size: 0.69rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          🎯 Bound (${(m.targets || []).length}): <code style="color: #79c0ff;">${targetsText}</code> • Default: <strong style="color: #c9d1d9;">${m.default}</strong>
        </div>
      `;

      const btnWrap = document.createElement('div');
      btnWrap.style.cssText = 'display: flex; align-items: center; gap: 5px; flex-shrink: 0;';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-modal-edit-mapping';
      editBtn.style.cssText = 'background: #21262d; border: 1px solid #30363d; color: #58a6ff; font-size: 0.68rem; padding: 3px 7px; border-radius: 4px; cursor: pointer;';
      editBtn.textContent = '✏️ Edit';
      editBtn.title = `Load "${m.alias}" into editor`;
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.open(grp.id, m, this.statusMsgEl);
      });

      const remBtn = document.createElement('button');
      remBtn.type = 'button';
      remBtn.className = 'btn-modal-remove-mapping';
      remBtn.style.cssText = 'background: #21262d; border: 1px solid #da3633; color: #f85149; font-size: 0.68rem; padding: 3px 7px; border-radius: 4px; cursor: pointer;';
      remBtn.textContent = '✕ Remove';
      remBtn.title = `Remove semantic mapping "${m.alias}"`;
      remBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.EngineBridge && typeof window.EngineBridge.removeGroupMapping === 'function') {
          const res = window.EngineBridge.removeGroupMapping(grp.id, m.alias);
          if (res && res.success) {
            if (window.AppCoordinator) {
              window.AppCoordinator.recordHistoryImmediate();
              window.AppCoordinator.showNotification(`Removed group mapping '${m.alias}'`, 'info');
            }
            const wasEditingRemoved = (this.originalAlias === m.alias);
            this.refreshParentInspectors(grp.id);
            if (wasEditingRemoved) {
              this.open(grp.id, null, this.statusMsgEl);
            } else {
              this.renderExistingMappings();
              this.validateForm();
            }
          }
        }
      });

      btnWrap.appendChild(editBtn);
      btnWrap.appendChild(remBtn);
      item.appendChild(infoWrap);
      item.appendChild(btnWrap);
      listEl.appendChild(item);
    });
  },

  buildCandidatePayload() {
    const aliasIn = document.getElementById('gmModalAliasInput');
    const labelIn = document.getElementById('gmModalLabelInput');
    const descIn = document.getElementById('gmModalDescInput');
    const typeSel = document.getElementById('gmModalTypeSelect');
    const defIn = document.getElementById('gmModalDefaultInput');
    const defBool = document.getElementById('gmModalDefaultBoolSelect');
    const minIn = document.getElementById('gmModalMinInput');
    const maxIn = document.getElementById('gmModalMaxInput');
    const optIn = document.getElementById('gmModalOptionsInput');

    const alias = (aliasIn && aliasIn.value ? aliasIn.value : '').trim();
    const label = (labelIn && labelIn.value ? labelIn.value : '').trim() || alias;
    const description = (descIn && descIn.value ? descIn.value : '').trim();
    const mType = (typeSel && typeSel.value) ? typeSel.value : 'number';
    const rawDef = (mType === 'boolean' && defBool && defBool.style.display !== 'none')
      ? String(defBool.value).trim()
      : ((defIn && defIn.value !== undefined) ? String(defIn.value).trim() : '');

    let defVal = rawDef;
    if (mType === 'number' || mType === 'speed') {
      defVal = rawDef === '' ? NaN : Number(rawDef);
    } else if (mType === 'boolean') {
      defVal = (rawDef.toLowerCase() === 'true' || rawDef === '1');
    }

    const payload = {
      alias,
      label,
      description,
      type: mType,
      default: defVal,
      targets: []
    };

    if (mType === 'number' || mType === 'speed') {
      const minStr = (minIn && minIn.value !== undefined) ? String(minIn.value).trim() : '';
      const maxStr = (maxIn && maxIn.value !== undefined) ? String(maxIn.value).trim() : '';
      if (minStr !== '') payload.min = Number(minStr);
      if (maxStr !== '') payload.max = Number(maxStr);
      const shared = this.computeSharedDomain();
      if (shared.hasStep) payload.step = shared.step;
    } else if (mType === 'enum') {
      const rawOpts = (optIn && optIn.value) ? optIn.value : '';
      payload.options = rawOpts.split(',').map((s) => s.trim()).filter(Boolean);
    }

    this.targetRows.forEach((ref) => {
      const mVal = ref.memSel ? ref.memSel.value : '';
      const pVal = ref.propSel ? ref.propSel.value : '';
      if (mVal) {
        const [mTypeStr, mIdStr] = mVal.split(':');
        payload.targets.push({
          memberType: mTypeStr,
          memberId: mIdStr,
          target: mIdStr.startsWith(mTypeStr + '-') ? mIdStr : `${mTypeStr}-${mIdStr}`,
          property: pVal
        });
      }
    });

    return payload;
  },

  validateCandidate(payload) {
    const grp = this._getGroup();
    if (!grp) return { valid: false, errors: ['Active group no longer exists in scene.'] };

    const errors = [];
    const alias = payload.alias;
    const reAlias = /^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/;
    const reserved = ['opacity', 'visibility', 'speed', 'playbackrate', 'state', 'operatingstate'];
    const isNumOrSpeed = (tp) => tp === 'number' || tp === 'speed';

    // 1. Unique & valid semantic alias
    if (!alias) {
      errors.push('Alias is required (e.g. cpu, status-color, headline).');
    } else if (!reAlias.test(alias)) {
      errors.push(`Invalid alias "${alias}": must start with a letter and contain only letters, digits, underscores, or hyphens (max 48 chars).`);
    } else if (reserved.includes(alias.toLowerCase())) {
      errors.push(`Alias "${alias}" is reserved for built-in group properties.`);
    } else {
      const existingMappings = Array.isArray(grp.mappings) ? grp.mappings : [];
      const collision = existingMappings.find((m) => m.alias.toLowerCase() === alias.toLowerCase() && (!this.originalAlias || m.alias.toLowerCase() !== this.originalAlias.toLowerCase()));
      if (collision) {
        errors.push(`Alias "${alias}" is already defined on group "${grp.name || grp.id}".`);
      }
    }

    // 2. Valid declared type
    const validTypes = ['number', 'color', 'text', 'boolean', 'speed', 'enum'];
    if (!validTypes.includes(payload.type)) {
      errors.push(`Unsupported parameter type "${payload.type}".`);
    }

    // 3 & 4. Default value and numeric/enum constraints
    if (isNumOrSpeed(payload.type)) {
      if (typeof payload.default !== 'number' || !Number.isFinite(payload.default)) {
        errors.push('Default value must be a valid finite number.');
      }
      if (payload.min !== undefined && !Number.isFinite(payload.min)) {
        errors.push('Min bound must be a valid number.');
      }
      if (payload.max !== undefined && !Number.isFinite(payload.max)) {
        errors.push('Max bound must be a valid number.');
      }
      if (Number.isFinite(payload.min) && Number.isFinite(payload.max) && payload.min > payload.max) {
        errors.push(`Min bound (${payload.min}) cannot be greater than Max bound (${payload.max}).`);
      }
      if (Number.isFinite(payload.default)) {
        if (Number.isFinite(payload.min) && payload.default < payload.min) {
          errors.push(`Default value (${payload.default}) cannot be less than Min bound (${payload.min}).`);
        }
        if (Number.isFinite(payload.max) && payload.default > payload.max) {
          errors.push(`Default value (${payload.default}) cannot be greater than Max bound (${payload.max}).`);
        }
      }
    } else if (payload.type === 'color') {
      const reCol = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]{3,24})$/;
      if (!payload.default || !reCol.test(String(payload.default).trim())) {
        errors.push(`Default value "${payload.default}" is not a valid hex/CSS colour.`);
      }
    } else if (payload.type === 'enum') {
      if (!Array.isArray(payload.options) || payload.options.length === 0) {
        errors.push('Enum mapping must declare at least one allowed option.');
      } else if (!payload.options.includes(String(payload.default))) {
        errors.push(`Enum default "${payload.default}" must be one of the declared options (${payload.options.join(', ')}).`);
      }
    }

    // 5..10. Target object membership, property existence, type conversion, compatible constraints, shared domain overlap, no duplicate bindings
    if (!Array.isArray(payload.targets) || payload.targets.length === 0) {
      errors.push('At least one member target binding is required.');
    } else {
      const members = Array.isArray(grp.members) ? grp.members : [];
      const seenBindings = new Set();
      let hasSharedMin = false;
      let sharedMin = -Infinity;
      let sharedMinSource = '';
      let hasSharedMax = false;
      let sharedMax = Infinity;
      let sharedMaxSource = '';
      let hasSharedEnum = false;
      let sharedEnumOptions = [];
      const enumSources = [];

      payload.targets.forEach((t, idx) => {
        const rowNum = idx + 1;
        const inGroup = members.some((gm) => gm.type === t.memberType && String(gm.id) === String(t.memberId));
        if (!inGroup) {
          errors.push(`Target #${rowNum} (${t.target}) is not a member of group "${grp.name || grp.id}".`);
          return;
        }
        if (!t.property) {
          errors.push(`Target #${rowNum} (${t.target}) has no selected property.`);
          return;
        }
        const bKey = `${t.target}::${t.property}`;
        if (seenBindings.has(bKey)) {
          errors.push(`Duplicate target binding "${t.target}.${t.property}" in row #${rowNum}.`);
        }
        seenBindings.add(bKey);

        const supportedProps = getSupportedPropertiesForMember(t.memberType, t.memberId);
        const propDef = supportedProps.find((p) => p.prop === t.property);
        if (!propDef) {
          errors.push(`Property "${t.property}" is not supported on member ${t.target}.`);
          return;
        }
        const compatible = (propDef.type === payload.type)
          || (isNumOrSpeed(payload.type) && isNumOrSpeed(propDef.type))
          || (isNumOrSpeed(payload.type) && propDef.type === 'text');
        if (!compatible) {
          errors.push(`Type "${payload.type}" is incompatible with "${t.target}.${t.property}" (requires "${propDef.type}").`);
          return;
        }
        if (isNumOrSpeed(payload.type) && isNumOrSpeed(propDef.type)) {
          if (propDef.min !== undefined && Number.isFinite(Number(propDef.min))) {
            const pMin = Number(propDef.min);
            if (!hasSharedMin || pMin > sharedMin) {
              sharedMin = pMin;
              sharedMinSource = `${t.target}.${t.property} (min ${pMin})`;
            }
            hasSharedMin = true;
            if (Number.isFinite(payload.min) && payload.min < pMin) {
              errors.push(`Min bound (${payload.min}) is below "${t.target}.${t.property}" minimum (${pMin}).`);
            }
            if (Number.isFinite(payload.default) && payload.default < pMin) {
              errors.push(`Default (${payload.default}) is below "${t.target}.${t.property}" minimum (${pMin}).`);
            }
          }
          if (propDef.max !== undefined && Number.isFinite(Number(propDef.max))) {
            const pMax = Number(propDef.max);
            if (!hasSharedMax || pMax < sharedMax) {
              sharedMax = pMax;
              sharedMaxSource = `${t.target}.${t.property} (max ${pMax})`;
            }
            hasSharedMax = true;
            if (Number.isFinite(payload.max) && payload.max > pMax) {
              errors.push(`Max bound (${payload.max}) exceeds "${t.target}.${t.property}" maximum (${pMax}).`);
            }
            if (Number.isFinite(payload.default) && payload.default > pMax) {
              errors.push(`Default (${payload.default}) exceeds "${t.target}.${t.property}" maximum (${pMax}).`);
            }
          }
        }
        if (payload.type === 'enum' && Array.isArray(propDef.options) && propDef.options.length > 0) {
          enumSources.push(`${t.target}.${t.property} [${propDef.options.join(', ')}]`);
          if (!hasSharedEnum) {
            sharedEnumOptions = [...propDef.options];
            hasSharedEnum = true;
          } else {
            sharedEnumOptions = sharedEnumOptions.filter((o) => propDef.options.includes(o));
          }
          if (Array.isArray(payload.options)) {
            payload.options.forEach((opt) => {
              if (!propDef.options.includes(opt)) {
                errors.push(`Enum option "${opt}" is not supported by "${t.target}.${t.property}" (allowed: ${propDef.options.join(', ')}).`);
              }
            });
          }
        }
      });

      if (hasSharedMin && hasSharedMax && sharedMin > sharedMax) {
        errors.push(`Incompatible target domains: no valid overlap between ${sharedMinSource} and ${sharedMaxSource}.`);
      }
      if (hasSharedEnum && sharedEnumOptions.length === 0) {
        errors.push(`Incompatible enum target domains: no shared options across ${enumSources.join(' vs ')}.`);
      }
    }

    return { valid: errors.length === 0, errors };
  },

  validateForm(extraError = '') {
    const grp = this._getGroup();
    const payload = this.buildCandidatePayload();
    const res = this.validateCandidate(payload);
    if (extraError) {
      res.valid = false;
      res.errors.unshift(extraError);
    }

    const derivedEl = document.getElementById('groupMappingModalDerivedName');
    const derivedTypeEl = document.getElementById('groupMappingModalDerivedType');
    if (derivedEl && grp) {
      const grpName = grp.name || grp.id;
      const cleanAlias = payload.alias || 'alias';
      derivedEl.textContent = (window.EngineBridge && typeof window.EngineBridge.generateParameterName === 'function')
        ? window.EngineBridge.generateParameterName(grpName, cleanAlias, 'group')
        : `${grpName}-group-${cleanAlias}`;
    }
    if (derivedTypeEl) {
      derivedTypeEl.textContent = payload.type || 'number';
    }

    const footerSum = document.getElementById('gmModalFooterSummary');
    if (footerSum) {
      footerSum.textContent = `${payload.targets.length} target binding(s) configured`;
    }

    const valBox = document.getElementById('gmModalValidationBox');
    const saveBtn = document.getElementById('btnGroupMappingModalSave');
    if (valBox) {
      if (res.valid) {
        valBox.style.borderColor = 'rgba(63, 185, 80, 0.45)';
        valBox.style.background = 'rgba(35, 134, 54, 0.12)';
        valBox.style.color = '#7ee787';
        const targetList = payload.targets.map((t) => `${t.target}.${t.property}`).join(', ');
        valBox.innerHTML = `<span>✓ <strong>Valid Mapping:</strong> <code>${payload.alias}</code> (${payload.type}) → <code>[${targetList}]</code></span>`;
      } else {
        valBox.style.borderColor = 'rgba(248, 81, 73, 0.55)';
        valBox.style.background = 'rgba(248, 81, 73, 0.10)';
        valBox.style.color = '#ffa198';
        valBox.innerHTML = `<div><strong>⚠️ Resolve before saving:</strong><ul style="margin: 3px 0 0 16px; padding: 0;">${res.errors.map((e) => `<li>${e}</li>`).join('')}</ul></div>`;
      }
    }
    if (saveBtn) {
      saveBtn.disabled = !res.valid;
      saveBtn.style.opacity = res.valid ? '1' : '0.45';
      saveBtn.style.cursor = res.valid ? 'pointer' : 'not-allowed';
    }
    return res;
  },

  save() {
    const grp = this._getGroup();
    if (!grp) return false;
    const payload = this.buildCandidatePayload();
    const check = this.validateCandidate(payload);
    if (!check.valid) {
      this.validateForm();
      return false;
    }

    if (window.EngineBridge && typeof window.EngineBridge.setGroupMapping === 'function') {
      if (this.originalAlias && this.originalAlias !== payload.alias && typeof window.EngineBridge.removeGroupMapping === 'function') {
        const oldSnapshot = (Array.isArray(grp.mappings) ? grp.mappings : []).find((m) => m.alias === this.originalAlias);
        window.EngineBridge.removeGroupMapping(grp.id, this.originalAlias);
        const res = window.EngineBridge.setGroupMapping(grp.id, payload);
        if (!res || !res.success) {
          if (oldSnapshot) window.EngineBridge.setGroupMapping(grp.id, oldSnapshot);
          this.validateForm((res && res.error) || 'Go engine rejected the mapping.');
          return false;
        }
      } else {
        const res = window.EngineBridge.setGroupMapping(grp.id, payload);
        if (!res || !res.success) {
          this.validateForm((res && res.error) || 'Go engine rejected the mapping.');
          return false;
        }
      }

      this.isPersisted = true;
      this.originalAlias = payload.alias;
      this.lastSavedSnapshot = JSON.parse(JSON.stringify(payload));

      const titleEl = document.getElementById('groupMappingModalTitle');
      if (titleEl) {
        titleEl.textContent = `✏️ Edit Semantic Group Property Mapping ("${payload.alias}")`;
      }

      this._syncAddBindingButton();
      this.targetRows.forEach((r) => r.populateProps(true, false));
      this.renderExistingMappings();

      const valBox = document.getElementById('gmModalValidationBox');
      if (valBox) {
        const targetList = payload.targets.map((t) => `${t.target}.${t.property}`).join(', ');
        valBox.style.borderColor = 'rgba(63, 185, 80, 0.65)';
        valBox.style.background = 'rgba(35, 134, 54, 0.18)';
        valBox.style.color = '#7ee787';
        valBox.innerHTML = `<span>✓ <strong>Saved "${payload.alias}"</strong> (${payload.targets.length} binding(s): <code>[${targetList}]</code>). You can now click <strong>+ Add New Binding</strong> or close the dialog.</span>`;
      }

      if (this.statusMsgEl) {
        this.statusMsgEl.style.color = '#3fb950';
        this.statusMsgEl.textContent = `✓ Saved group semantic mapping "${payload.alias}" (${payload.targets.length} target(s))`;
      }
      if (window.AppCoordinator) {
        window.AppCoordinator.recordHistoryImmediate();
        window.AppCoordinator.showNotification(`Saved group mapping '${payload.alias}'`, 'success');
      }
      this.refreshParentInspectors(grp.id);
      return true;
    }
    return false;
  }
};

window.renderGroupSemanticMappingsSection = function(containerEl, sel, statusMsgEl) {
  if (!containerEl || !sel || sel.type !== 'group' || !sel.id) return;
  const grp = (window.EngineBridge && typeof window.EngineBridge.getGroup === 'function' && window.EngineBridge.isReady && window.EngineBridge.isReady())
    ? window.EngineBridge.getGroup(sel.id)
    : ((window.AppCoordinator && typeof window.AppCoordinator.getGroup === 'function')
      ? window.AppCoordinator.getGroup(sel.id)
      : (window.EngineBridge && typeof window.EngineBridge.getGroup === 'function' ? window.EngineBridge.getGroup(sel.id) : null));
  if (!grp) return;

  const secWrap = document.createElement('div');
  secWrap.className = 'group-semantic-mappings-section';
  secWrap.style.cssText = 'margin-top: 10px; padding-top: 10px; border-top: 1px solid #30363d; display: flex; flex-direction: column; gap: 8px;';

  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';
  titleRow.innerHTML = `<span style="font-size: 0.76rem; font-weight: 600; color: #58a6ff;">🔗 Semantic Group Property Mappings (${Array.isArray(grp.mappings) ? grp.mappings.length : 0})</span>`;

  const addMappingBtn = document.createElement('button');
  addMappingBtn.type = 'button';
  addMappingBtn.className = 'btn-floating-action btn-add-group-mapping';
  addMappingBtn.style.cssText = 'background: #238636; border: 1px solid #3fb950; color: #ffffff; font-size: 0.70rem; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-weight: 600;';
  addMappingBtn.textContent = '+ Add Mapping';
  addMappingBtn.title = 'Open the Semantic Group Property Mapping Dialog';
  addMappingBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.GroupMappingDialog.open(grp.id, null, statusMsgEl);
  });
  titleRow.appendChild(addMappingBtn);
  secWrap.appendChild(titleRow);

  const mappings = Array.isArray(grp.mappings) ? grp.mappings : [];
  const grpName = grp.name || grp.id;

  const listWrap = document.createElement('div');
  listWrap.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
  if (mappings.length === 0) {
    listWrap.innerHTML = `<div style="font-size: 0.71rem; color: #8b949e; font-style: italic; padding: 4px 0;">No semantic mappings defined. Click "+ Add Mapping" to open the mapping dialog and expose a group property that fans out to 1 or more member properties.</div>`;
  } else {
    mappings.forEach((m) => {
      const mCard = document.createElement('div');
      mCard.className = 'widget-prop-card is-exposed group-mapping-card';
      mCard.dataset.alias = m.alias;
      mCard.style.cssText = 'background: #161b22; border: 1px solid #388bfd; border-radius: 6px; padding: 7px; display: flex; flex-direction: column; gap: 5px;';

      const paramName = (window.EngineBridge && typeof window.EngineBridge.generateParameterName === 'function')
        ? window.EngineBridge.generateParameterName(grpName, m.alias, 'group')
        : `${grpName}-group-${m.alias}`;

      const hdr = document.createElement('div');
      hdr.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 6px;';
      hdr.innerHTML = `<span style="font-size: 0.74rem; color: #e6edf3;"><code style="color:#7ee787; background:rgba(63,185,80,0.12); padding:1px 4px; border-radius:3px; margin-right:4px;">${m.alias}</code><strong>${m.label || m.alias}</strong> <span style="color:#8b949e; font-size:0.68rem;">(${m.type})</span></span>`;

      const rightHdr = document.createElement('div');
      rightHdr.style.cssText = 'display: flex; align-items: center; gap: 4px;';
      const badge = document.createElement('code');
      badge.className = 'widget-prop-badge';
      badge.textContent = paramName;
      rightHdr.appendChild(badge);

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-edit-group-mapping';
      editBtn.style.cssText = 'background: #21262d; border: 1px solid #30363d; color: #58a6ff; font-size: 0.66rem; padding: 1px 6px; border-radius: 3px; cursor: pointer;';
      editBtn.textContent = '✏️ Edit';
      editBtn.title = `Edit semantic mapping "${m.alias}"`;
      editBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        window.GroupMappingDialog.open(grp.id, m, statusMsgEl);
      });
      rightHdr.appendChild(editBtn);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn-remove-group-mapping';
      delBtn.style.cssText = 'background: #21262d; border: 1px solid #da3633; color: #f85149; font-size: 0.66rem; padding: 1px 5px; border-radius: 3px; cursor: pointer;';
      delBtn.textContent = '✕';
      delBtn.title = `Remove semantic mapping "${m.alias}"`;
      delBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (window.EngineBridge && typeof window.EngineBridge.removeGroupMapping === 'function') {
          const res = window.EngineBridge.removeGroupMapping(grp.id, m.alias);
          if (res && res.success) {
            if (window.AppCoordinator) {
              window.AppCoordinator.recordHistoryImmediate();
              window.AppCoordinator.showNotification(`Removed group mapping '${m.alias}'`, 'info');
            }
            window.GroupMappingDialog.refreshParentInspectors(grp.id);
            if (window.GroupMappingDialog.activeGroupId === grp.id) {
              window.GroupMappingDialog.renderExistingMappings();
            }
          }
        }
      });
      rightHdr.appendChild(delBtn);
      hdr.appendChild(rightHdr);
      mCard.appendChild(hdr);

      const targetsDesc = (Array.isArray(m.targets) ? m.targets : []).map((t) => `${t.target}.${t.property}`).join(' , ');
      const rangeInfo = (m.type === 'number' || m.type === 'speed') && (m.min !== undefined || m.max !== undefined)
        ? ` [${m.min ?? '−∞'}..${m.max ?? '+∞'}]`
        : '';
      const meta = document.createElement('div');
      meta.style.cssText = 'font-size: 0.69rem; color: #8b949e; display: flex; justify-content: space-between; gap: 6px; flex-wrap: wrap;';
      meta.innerHTML = `<span>🎯 Fan-out (${(m.targets || []).length}): <code style="color:#79c0ff;">${targetsDesc}</code></span><span>Default: <strong style="color:#e6edf3;">${m.default}</strong>${rangeInfo}</span>`;
      mCard.appendChild(meta);

      listWrap.appendChild(mCard);
    });
  }
  secWrap.appendChild(listWrap);
  containerEl.appendChild(secWrap);
};

window.initDrawerWidgetEvents = function() {
  if (window._drawerWidgetEventsBound) return;
  window._drawerWidgetEventsBound = true;

  const renameIn = document.getElementById('drawerWidgetObjRenameInput');
  if (renameIn) {
    const handleRename = () => {
      const sel = (window.AppCoordinator && typeof window.AppCoordinator.getActiveSelection === 'function')
        ? window.AppCoordinator.getActiveSelection()
        : null;
      if (!sel || !sel.type || sel.id === null) return;
      const newName = renameIn.value.trim();
      const statusMsg = document.getElementById('drawerWidgetStatusMsg');
      if (window.EngineBridge && typeof window.EngineBridge.renameObject === 'function') {
        const res = (sel.type === 'group' && window.AppCoordinator && typeof window.AppCoordinator.renameGroup === 'function')
          ? window.AppCoordinator.renameGroup(sel.id, newName || sel.id)
          : window.EngineBridge.renameObject(sel.type, sel.id, newName);
        if (res && res.success) {
          if (sel.type === 'node' && window.DiagramNodes) {
            const n = window.DiagramNodes.getNode(sel.id);
            if (n) n.name = newName;
          } else if (sel.type === 'flow' && window.DataFlows) {
            const f = window.DataFlows.getFlow(sel.id);
            if (f) f.name = newName;
          } else if (sel.type === 'glow' && window.Glows) {
            const g = window.Glows.getGlow(sel.id);
            if (g) g.name = newName;
          } else if (sel.type === 'ripple' && window.Ripples) {
            const r = window.Ripples.getRipple(sel.id);
            if (r) r.name = newName;
          } else if (sel.type === 'lite' && window.LiteEffects) {
            const le = window.LiteEffects.getLiteEffect(sel.id);
            if (le) {
              le.name = newName;
              window.LiteEffects.syncEditorUI(le);
              window.LiteEffects.renderList();
            }
          } else if (sel.type === 'image' && window.ImageObjects) {
            const img = window.ImageObjects.getImage(sel.id);
            if (img) img.name = newName;
          } else if (sel.type === 'group') {
            if (window.LayersPanel && typeof window.LayersPanel.render === 'function') {
              window.LayersPanel.render();
            }
          }
          if (statusMsg) {
            statusMsg.style.color = '#3fb950';
            statusMsg.textContent = newName ? `✓ Object renamed to "${newName}". External parameters updated.` : '✓ Object name cleared.';
          }
          if (window.AppCoordinator) {
            window.AppCoordinator.recordHistoryImmediate();
            window.AppCoordinator.showNotification(newName ? `Renamed to '${newName}'` : 'Name cleared', 'success');
          }
          window.renderWidgetParametersOverview();
          if (window.FloatingPropertiesEditor && typeof window.FloatingPropertiesEditor.syncSelection === 'function') {
            window.FloatingPropertiesEditor.syncSelection();
          }
        } else {
          const err = (res && res.error) || 'Name conflict or invalid name';
          if (statusMsg) {
            statusMsg.style.color = '#f85149';
            statusMsg.textContent = `Error: ${err}`;
          }
          alert(`Could not rename: ${err}`);
        }
      }
    };
    renameIn.addEventListener('change', handleRename);
    renameIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        renameIn.blur();
      }
    });
  }

  // Whole Widget Controls (Global)
  const toggleGlobalParam = (propMatchers, createDef, friendlyName) => {
    if (!window.EngineBridge || typeof window.EngineBridge.addWidgetParameter !== 'function') return;
    const allP = (typeof window.EngineBridge.getWidgetParameters === 'function')
      ? (window.EngineBridge.getWidgetParameters() || [])
      : [];
    const existing = allP.find((p) => {
      const t = (p.Target || p.target || '').toLowerCase();
      const pr = (p.Property || p.property || '');
      return (t === 'root' || t === 'global' || t === '') && propMatchers.includes(pr);
    });
    if (existing) {
      const pName = existing.Name || existing.name;
      if (typeof window.EngineBridge.removeWidgetParameter === 'function') {
        window.EngineBridge.removeWidgetParameter(pName);
        if (window.AppCoordinator) {
          window.AppCoordinator.recordHistoryImmediate();
          window.AppCoordinator.showNotification(`Removed global parameter "${pName}"`, 'info');
        }
        window.renderWidgetParametersOverview();
      }
      return;
    }
    const res = window.EngineBridge.addWidgetParameter(createDef);
    if (res && (!res.error || res.success !== false)) {
      if (window.AppCoordinator) {
        window.AppCoordinator.recordHistoryImmediate();
        window.AppCoordinator.showNotification(`Added global parameter "${friendlyName}"`, 'success');
      }
      window.renderWidgetParametersOverview();
    } else {
      alert('Failed to add parameter: ' + ((res && res.error) || window.EngineBridge.getLastError()));
    }
  };

  const btnAddSpeed = document.getElementById('btnAddGlobalSpeedParam');
  if (btnAddSpeed) {
    btnAddSpeed.addEventListener('click', () => {
      toggleGlobalParam(['playbackRate', 'speed'], {
        name: 'playbackRate',
        target: 'root',
        property: 'playbackRate',
        type: 'speed',
        default: 1.0,
        min: 0.1,
        max: 5.0,
        step: 0.1,
        description: 'Global widget animation playback speed (instance-wide clock)'
      }, 'playbackRate');
    });
  }

  const btnAddVis = document.getElementById('btnAddGlobalVisParam');
  if (btnAddVis) {
    btnAddVis.addEventListener('click', () => {
      toggleGlobalParam(['visibility'], {
        name: 'widgetVisible',
        target: 'root',
        property: 'visibility',
        type: 'boolean',
        default: true,
        description: 'Master visibility toggle for entire widget instance'
      }, 'widgetVisible');
    });
  }

  const btnAddState = document.getElementById('btnAddGlobalStateParam');
  if (btnAddState) {
    btnAddState.addEventListener('click', () => {
      toggleGlobalParam(['operatingState', 'state'], {
        name: 'operatingState',
        target: 'root',
        property: 'operatingState',
        type: 'enum',
        default: 'running',
        options: ['running', 'paused', 'stopped'],
        description: 'Operating lifecycle state control (running, paused, stopped)'
      }, 'operatingState');
    });
  }
};

window.renderWidgetParametersOverview = function(selectionPayload) {
  if (!window._drawerWidgetEventsBound && typeof window.initDrawerWidgetEvents === 'function') {
    window.initDrawerWidgetEvents();
  }
  if (window.ComponentBuilder && typeof window.ComponentBuilder.renderSection === 'function') {
    window.ComponentBuilder.renderSection();
  }

  const listEl = document.getElementById('widgetParamsList');
  const countEl = document.getElementById('widgetParamCount');
  const btnExposeActive = document.getElementById('btnExposeActiveWidgetParam');
  if (!listEl) return;

  let params = [];
  if (window.EngineBridge && typeof window.EngineBridge.getWidgetParameters === 'function') {
    params = window.EngineBridge.getWidgetParameters() || [];
  }

  if (countEl) {
    countEl.textContent = String(params.length);
  }

  const sel = (selectionPayload && typeof selectionPayload === 'object' && 'type' in selectionPayload)
    ? selectionPayload
    : (window.AppCoordinator && typeof window.AppCoordinator.getActiveSelection === 'function'
      ? window.AppCoordinator.getActiveSelection()
      : null);

  if (btnExposeActive) {
    if (sel && ['node', 'flow', 'glow', 'ripple', 'lite', 'image', 'group'].includes(sel.type) && sel.id !== null) {
      btnExposeActive.style.display = 'inline-block';
      btnExposeActive.textContent = `+ Expose ${sel.type.charAt(0).toUpperCase() + sel.type.slice(1)}`;
      btnExposeActive.title = `Expose selected ${sel.type} #${sel.id} as a widget parameter`;
    } else {
      btnExposeActive.style.display = 'none';
    }
  }

  // Update Left Drawer quick-action buttons with real-time binding status
  const updateSidebarBtn = (btnId, type) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    let targetId = (sel && sel.type === type && sel.id !== null) ? sel.id : null;
    if (targetId === null) {
      if (type === 'node' && window.DiagramNodes) targetId = window.DiagramNodes.activeId;
      else if (type === 'flow' && window.DataFlows) targetId = window.DataFlows.activeId;
      else if (type === 'glow' && window.Glows) targetId = window.Glows.activeId;
      else if (type === 'ripple' && window.Ripples) targetId = window.Ripples.activeId;
      else if (type === 'lite' && window.LiteEffects) targetId = window.LiteEffects.activeId;
    }
    if (targetId !== null) {
      const boundParam = params.find(p => {
        const t = p.Target || p.target;
        return t === `${type}-${targetId}` || t === String(targetId);
      });
      const labelSpan = btn.querySelector('span:first-child');
      if (boundParam) {
        btn.style.borderColor = '#3fb950';
        btn.style.color = '#3fb950';
        if (labelSpan) labelSpan.textContent = `🌐 Param: "${boundParam.Name || boundParam.name}" (Bound)`;
        btn.title = `Parameter "${boundParam.Name || boundParam.name}" is bound. Click to edit property controls.`;
      } else {
        btn.style.borderColor = '#30363d';
        btn.style.color = '#58a6ff';
        if (labelSpan) labelSpan.textContent = `🌐 Expose as Parameter`;
        btn.title = `Expose this ${type} as an external host parameter`;
      }
    }
  };
  updateSidebarBtn('btnNodeExposeWidget', 'node');
  updateSidebarBtn('btnFlowExposeWidget', 'flow');
  updateSidebarBtn('btnGlowExposeWidget', 'glow');
  updateSidebarBtn('btnRippleExposeWidget', 'ripple');
  updateSidebarBtn('btnLiteExposeWidget', 'lite');

  // Update Whole Widget Global Buttons badge state
  const updateGlobalBtnState = (btnId, propMatchers) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const isBound = params.some((p) => {
      const t = (p.Target || p.target || '').toLowerCase();
      const pr = (p.Property || p.property || '');
      return (t === 'root' || t === 'global' || t === '') && propMatchers.includes(pr);
    });
    const statusSpan = btn.querySelector('span:last-child');
    if (statusSpan) {
      statusSpan.textContent = isBound ? '✓ Bound (Click to remove)' : '+ Add';
      statusSpan.style.color = isBound ? '#58a6ff' : '#7ee787';
    }
    btn.style.borderColor = isBound ? '#388bfd' : '#30363d';
  };
  updateGlobalBtnState('btnAddGlobalSpeedParam', ['playbackRate', 'speed']);
  updateGlobalBtnState('btnAddGlobalVisParam', ['visibility']);
  updateGlobalBtnState('btnAddGlobalStateParam', ['operatingState', 'state']);

  // Synchronize Right Drawer Inline Parameter Authoring Deck
  const drawerNoSel = document.getElementById('drawerWidgetNoSelection');
  const drawerDeck = document.getElementById('drawerWidgetAuthoringDeck');
  const drawerObjBadge = document.getElementById('drawerWidgetObjBadge');
  const drawerObjTypeBadge = document.getElementById('drawerWidgetObjTypeBadge');
  const drawerRenameIn = document.getElementById('drawerWidgetObjRenameInput');
  const drawerPropsList = document.getElementById('drawerWidgetPropertiesList');
  const drawerStatusMsg = document.getElementById('drawerWidgetStatusMsg');

  if (drawerDeck && drawerNoSel) {
    if (sel && ['node', 'flow', 'glow', 'ripple', 'lite', 'image', 'group'].includes(sel.type) && sel.id !== null) {
      drawerNoSel.style.display = 'none';
      drawerDeck.style.display = 'block';
      if (drawerObjTypeBadge) drawerObjTypeBadge.textContent = sel.type.toUpperCase();

      let currentName = '';
      let objDisplayName = `${sel.type} #${sel.id}`;
      if (sel.type === 'node' && window.DiagramNodes) {
        const n = window.DiagramNodes.getNode(sel.id);
        if (n) {
          currentName = n.name || n.text || '';
          objDisplayName = n.name ? `${n.name} (#${sel.id})` : (n.text ? `${n.text} (#${sel.id})` : `Node #${sel.id}`);
        }
      } else if (sel.type === 'flow' && window.DataFlows) {
        const f = window.DataFlows.getFlow(sel.id);
        if (f) {
          currentName = f.name || '';
          objDisplayName = f.name ? `${f.name} (#${sel.id})` : `Flow #${sel.id}`;
        }
      } else if (sel.type === 'glow' && window.Glows) {
        const g = window.Glows.getGlow(sel.id);
        if (g) {
          currentName = g.name || '';
          objDisplayName = g.name ? `${g.name} (#${sel.id})` : `Glow #${sel.id}`;
        }
      } else if (sel.type === 'ripple' && window.Ripples) {
        const r = window.Ripples.getRipple(sel.id);
        if (r) {
          currentName = r.name || '';
          objDisplayName = r.name ? `${r.name} (#${sel.id})` : `Ripple #${sel.id}`;
        }
      } else if (sel.type === 'lite' && window.LiteEffects) {
        const le = window.LiteEffects.getLiteEffect(sel.id);
        if (le) {
          currentName = le.name || '';
          const kindMap = { 'perimeter-tracer': 'Tracer', 'pulse': 'Pulse', 'flash': 'Flash', 'flow-lite': 'Flow', 'radar-lite': 'Radar', 'gauge-lite': 'Gauge', 'oscilloscope-lite': 'Osc', 'text-lite': 'Text' };
          const kindLabel = kindMap[le.kind] || 'Lite';
          objDisplayName = le.name ? `${le.name} (${kindLabel} #${sel.id})` : `${kindLabel} #${sel.id}`;
        }
      } else if (sel.type === 'image' && window.ImageObjects) {
        const img = window.ImageObjects.getImage(sel.id);
        if (img) {
          currentName = img.name || '';
          objDisplayName = img.name ? `${img.name} (#${sel.id})` : `Image #${sel.id}`;
        }
      } else if (sel.type === 'group') {
        const grp = (window.AppCoordinator && typeof window.AppCoordinator.getGroup === 'function')
          ? window.AppCoordinator.getGroup(sel.id)
          : null;
        if (grp) {
          currentName = grp.name || '';
          objDisplayName = grp.name ? `${grp.name} (${grp.id})` : `Group ${grp.id}`;
        }
      }

      if (drawerObjBadge) drawerObjBadge.textContent = objDisplayName;
      if (drawerRenameIn && document.activeElement !== drawerRenameIn) {
        drawerRenameIn.value = currentName;
        drawerRenameIn.placeholder = `${sel.type}-${sel.id}`;
      }

      if (drawerPropsList && typeof window.renderWidgetPropertyCards === 'function') {
        window.renderWidgetPropertyCards(drawerPropsList, sel, drawerStatusMsg);
      }
    } else {
      drawerNoSel.style.display = 'block';
      drawerDeck.style.display = 'none';
    }
  }

  // Conflict Warning Banner
  const conflicts = (window.EngineBridge && typeof window.EngineBridge.getWidgetConflicts === 'function')
    ? window.EngineBridge.getWidgetConflicts()
    : [];
  const conflictBanner = document.getElementById('widgetConflictsBanner');
  const conflictList = document.getElementById('widgetConflictsList');
  if (conflictBanner && conflictList) {
    if (conflicts && conflicts.length > 0) {
      conflictBanner.style.display = 'block';
      conflictList.innerHTML = '';
      conflicts.forEach(c => {
        const row = document.createElement('div');
        row.style.cssText = 'background: #21262d; border: 1px solid #f85149; border-radius: 4px; padding: 6px; font-size: 0.72rem; display: flex; flex-direction: column; gap: 4px;';
        const title = document.createElement('div');
        title.innerHTML = `<strong>${c.target}.${c.property}</strong>: Conflicting duplicates (${c.parameters.map(p => `<code>${p.name}</code>`).join(', ')})`;
        row.appendChild(title);
        const btnWrap = document.createElement('div');
        btnWrap.style.cssText = 'display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px;';
        c.parameters.forEach(p => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn-floating-action btn-resolve-conflict';
          btn.style.cssText = 'background: #238636; border: 1px solid #3fb950; color: #fff; font-size: 0.68rem; padding: 2px 6px; border-radius: 3px; cursor: pointer;';
          btn.textContent = `Keep "${p.name}"`;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.EngineBridge && typeof window.EngineBridge.resolveWidgetConflict === 'function') {
              const r = window.EngineBridge.resolveWidgetConflict(c.target, c.property, p.name);
              if (r && r.success) {
                if (window.AppCoordinator) {
                  window.AppCoordinator.recordHistoryImmediate();
                  window.AppCoordinator.showNotification(`Resolved conflict: kept "${p.name}"`, 'success');
                }
                window.renderWidgetParametersOverview();
              }
            }
          });
          btnWrap.appendChild(btn);
        });
        row.appendChild(btnWrap);
        conflictList.appendChild(row);
      });
    } else {
      conflictBanner.style.display = 'none';
    }
  }

  if (!params || params.length === 0) {
    listEl.innerHTML = '<div style="font-size: 0.75rem; color: #8b949e; text-align: center; padding: 0.8rem 0;">No widget parameters defined. Select an object to expose properties.</div>';
    return;
  }

  listEl.innerHTML = '';
  params.forEach((param) => {
    const card = document.createElement('div');
    card.className = 'widget-param-card';
    card.style.cssText = 'background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 8px; font-size: 0.76rem; display: flex; flex-direction: column; gap: 6px;';

    // Header row
    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

    const titleWrap = document.createElement('div');
    titleWrap.style.cssText = 'display: flex; align-items: center; gap: 6px; overflow: hidden;';

    const nameBadge = document.createElement('code');
    nameBadge.style.cssText = 'font-weight: 600; color: #58a6ff; background: rgba(56, 139, 253, 0.1); padding: 1px 4px; border-radius: 3px; font-size: 0.75rem;';
    nameBadge.textContent = param.name;

    const typeBadge = document.createElement('span');
    typeBadge.style.cssText = 'font-size: 0.68rem; color: #8b949e; background: #21262d; padding: 1px 4px; border-radius: 3px;';
    typeBadge.textContent = param.type || 'text';

    const isGlobal = !param.target || param.target === 'root' || param.target === 'global';
    const targetBadge = document.createElement('span');
    targetBadge.style.cssText = isGlobal
      ? 'font-size: 0.68rem; color: #d29922; background: rgba(210, 153, 34, 0.15); padding: 1px 5px; border-radius: 3px;'
      : 'font-size: 0.68rem; color: #58a6ff; background: rgba(56, 139, 253, 0.15); padding: 1px 5px; border-radius: 3px;';
    targetBadge.textContent = isGlobal ? '🌐 Whole Widget' : `🎯 Target: ${param.target}`;

    titleWrap.appendChild(nameBadge);
    titleWrap.appendChild(typeBadge);
    titleWrap.appendChild(targetBadge);

    const actionWrap = document.createElement('div');
    actionWrap.style.cssText = 'display: flex; align-items: center; gap: 4px;';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-floating-action btn-edit-param';
    editBtn.style.cssText = 'background: #21262d; border: 1px solid #30363d; color: #58a6ff; cursor: pointer; padding: 2px 6px; border-radius: 4px; font-size: 0.70rem; display: flex; align-items: center; gap: 3px;';
    editBtn.title = `Edit parameter "${param.name}"`;
    editBtn.textContent = '✏️ Edit';
    editBtn.innerHTML = '✏️ Edit';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = param.target || '';
      const isComponentBuilderParam = (!target || target === 'root' || target === 'global') && Array.isArray(param.targets) && param.targets.length > 0;
      if (isComponentBuilderParam && window.ComponentBuilder && typeof window.ComponentBuilder.open === 'function') {
        window.ComponentBuilder.open(param);
        return;
      }
      if (target && target !== 'root' && target !== 'global') {
        const parts = target.split('-');
        if (parts.length >= 2) {
          const objType = parts[0];
          if (objType === 'group') {
            if (window.AppCoordinator && typeof window.AppCoordinator.selectGroup === 'function') {
              window.AppCoordinator.selectGroup(target);
            }
            if (Array.isArray(param.targets) && param.targets.length > 0 && window.GroupMappingDialog) {
              const grp = (window.AppCoordinator && typeof window.AppCoordinator.getGroup === 'function')
                ? window.AppCoordinator.getGroup(target)
                : null;
              const existingMap = (grp && Array.isArray(grp.mappings))
                ? grp.mappings.find((m) => m.alias === param.property || (param.name && param.name.endsWith('-group-' + m.alias)))
                : null;
              if (existingMap) {
                window.GroupMappingDialog.open(target, existingMap, document.getElementById('drawerWidgetStatusMsg'));
                return;
              }
            }
          } else {
            const objId = parseInt(parts[1], 10);
            if (window.AppCoordinator && typeof window.AppCoordinator.selectObject === 'function') {
              window.AppCoordinator.selectObject(objType, objId);
            }
          }
          const rightDrawer = document.getElementById('rightDrawer');
          if (rightDrawer && rightDrawer.classList.contains('collapsed') && typeof window.toggleDrawer === 'function') {
            window.toggleDrawer('right');
          }
          setTimeout(() => {
            const propSel = document.getElementById('drawerWidgetPropSelect');
            if (propSel) {
              propSel.value = param.property;
              propSel.dispatchEvent(new Event('change'));
            }
          }, 60);
        }
      }
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-floating-action';
    delBtn.style.cssText = 'background: transparent; border: none; color: #f85149; cursor: pointer; padding: 0 4px; font-size: 0.82rem;';
    delBtn.title = `Remove external binding '${param.name}'`;
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Remove exposed parameter "${param.name}"?`)) {
        const isGroupMapping = Array.isArray(param.targets) && param.targets.length > 0 && param.target && String(param.target).startsWith('group-');
        if (isGroupMapping && window.EngineBridge && typeof window.EngineBridge.removeGroupMapping === 'function') {
          window.EngineBridge.removeGroupMapping(param.target, param.property);
        } else if (window.EngineBridge && typeof window.EngineBridge.removeWidgetParameter === 'function') {
          window.EngineBridge.removeWidgetParameter(param.name);
        }
        if (window.AppCoordinator) {
          window.AppCoordinator.recordHistoryImmediate();
          window.AppCoordinator.showNotification(`Removed parameter '${param.name}'`, 'info');
        }
        window.renderWidgetParametersOverview();
        if (window.FloatingPropertiesEditor && typeof window.FloatingPropertiesEditor.syncSelection === 'function') {
          window.FloatingPropertiesEditor.syncSelection();
        }
      }
    });

    actionWrap.appendChild(editBtn);
    actionWrap.appendChild(delBtn);
    headerRow.appendChild(titleWrap);
    headerRow.appendChild(actionWrap);
    card.appendChild(headerRow);

    // Target & Property metadata
    const metaRow = document.createElement('div');
    metaRow.style.cssText = 'color: #8b949e; font-size: 0.71rem; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px;';
    const targetLabel = document.createElement('span');
    if (Array.isArray(param.targets) && param.targets.length > 0) {
      targetLabel.textContent = `Target: ${param.target} → [${param.targets.map(t => `${t.target}.${t.property}`).join(', ')}]`;
    } else {
      targetLabel.textContent = `Target: ${param.target || 'root'}`;
    }
    const propLabel = document.createElement('span');
    propLabel.textContent = `Property: ${param.property}`;
    metaRow.appendChild(targetLabel);
    metaRow.appendChild(propLabel);
    card.appendChild(metaRow);

    if (param.description) {
      const descRow = document.createElement('div');
      descRow.style.cssText = 'color: #7d8590; font-size: 0.7rem; font-style: italic;';
      descRow.textContent = param.description;
      card.appendChild(descRow);
    }

    // Live External Preview Row
    const previewRow = document.createElement('div');
    previewRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 6px; padding-top: 4px; border-top: 1px dashed #30363d;';

    const previewLabel = document.createElement('span');
    previewLabel.style.cssText = 'color: #e6edf3; font-size: 0.7rem; font-weight: 500; min-width: 44px;';
    previewLabel.textContent = 'Preview:';

    const previewInputContainer = document.createElement('div');
    previewInputContainer.style.cssText = 'flex: 1; display: flex; align-items: center; gap: 4px;';

    let inputEl;
    let valDisplay = null;

    const applyPreview = (val) => {
      const svgContainer = document.getElementById('svgContainer');
      if (!svgContainer) return;
      const svgEl = svgContainer.querySelector('svg');
      if (!svgEl) return;
      if (Array.isArray(param.targets) && param.targets.length > 0) {
        param.targets.forEach((tb) => {
          const mTarget = tb.target || tb.Target;
          const mProp = tb.property || tb.Property || '';
          const mWhen = (tb.when !== undefined ? tb.when : tb.When) || '';
          const mAction = (tb.action !== undefined ? tb.action : tb.Action) || '';
          const mHasVal = tb.value !== undefined || tb.Value !== undefined;
          const mVal = tb.value !== undefined ? tb.value : tb.Value;
          const normWhen = String(mWhen).trim();
          if (normWhen && normWhen.toLowerCase() !== 'always' && normWhen !== String(val)) {
            return;
          }
          const memberEl = (window.SVGWidget && typeof window.SVGWidget.resolveTargetElement === 'function')
            ? window.SVGWidget.resolveTargetElement(svgEl, null, mTarget)
            : svgEl.querySelector(`[data-semantic-target="${mTarget}"], [id="${mTarget}"]`);
          if (!memberEl || !window.SVGWidget) return;
          const act = String(mAction).trim().toLowerCase();
          if (act && act !== 'set' && typeof window.SVGWidget.applyLifecycleAction === 'function') {
            window.SVGWidget.applyLifecycleAction(memberEl, svgEl, act, false, null);
            return;
          }
          if (typeof window.SVGWidget.applyPropertyToElement === 'function') {
            const effVal = (mHasVal && mVal !== null) ? mVal : val;
            const targetVal = ((mProp === 'text' || mProp === 'textContent') && typeof effVal !== 'string') ? String(effVal) : effVal;
            window.SVGWidget.applyPropertyToElement(memberEl, mProp, targetVal, Object.assign({}, param, { target: mTarget, property: mProp }), null);
          }
        });
        return;
      }
      const isGlobalRoot = !param.target || param.target === 'root' || param.target === 'global' || param.target === 'svg';
      if (isGlobalRoot) {
        if (param.property === 'operatingState' || param.property === 'state') {
          const st = String(val || 'running');
          svgEl.setAttribute('data-state', st);
          svgContainer.setAttribute('data-state', st);
          const paused = (st === 'paused' || st === 'stopped');
          if (st === 'stopped' && typeof svgEl.setCurrentTime === 'function') {
            try { svgEl.setCurrentTime(0); } catch (_) {}
          }
          if (paused && typeof svgEl.pauseAnimations === 'function') {
            try { svgEl.pauseAnimations(); } catch (_) {}
          } else if (!paused && typeof svgEl.unpauseAnimations === 'function') {
            try { svgEl.unpauseAnimations(); } catch (_) {}
          }
          if (typeof svgEl.getAnimations === 'function') {
            try {
              svgEl.getAnimations({ subtree: true }).forEach((a) => {
                try { if (paused) a.pause(); else a.play(); } catch (_) {}
              });
            } catch (_) {}
          }
          svgEl.querySelectorAll('.lite-payload, .lite-flow-seg, .lite-osc-wave, .lite-text-element').forEach((n) => {
            if (n.style) n.style.animationPlayState = paused ? 'paused' : 'running';
          });
          return;
        }
        if (param.property === 'playbackRate' || param.property === 'speed') {
          const rate = Math.max(0.1, parseFloat(val) || 1.0);
          svgEl.setAttribute('data-master-speed', String(rate));
          if (window.SVGWidget && typeof window.SVGWidget.applyPropertyToElement === 'function') {
            window.SVGWidget.applyPropertyToElement(svgEl, 'speed', rate, Object.assign({}, param, { target: 'svg-root' }), null);
          }
          return;
        }
        if (param.property === 'visibility') {
          const isVis = val !== false && val !== 'hidden' && val !== 0 && val !== '0';
          svgEl.style.visibility = isVis ? 'visible' : 'hidden';
          svgEl.setAttribute('visibility', isVis ? 'visible' : 'hidden');
          return;
        }
      }
      const targetEl = (window.SVGWidget && typeof window.SVGWidget.resolveTargetElement === 'function')
        ? window.SVGWidget.resolveTargetElement(svgEl, null, param.target)
        : (svgEl.querySelector(`[data-semantic-target="${param.target}"], [data-node-id="${param.target}"], [id="${param.target}"]`));
      if (targetEl && window.SVGWidget && typeof window.SVGWidget.applyPropertyToElement === 'function') {
        window.SVGWidget.applyPropertyToElement(targetEl, param.property, val, param, null);
      }
    };

    if (param.type === 'color') {
      inputEl = document.createElement('input');
      inputEl.type = 'color';
      inputEl.value = (typeof param.default === 'string' && param.default.startsWith('#')) ? param.default : '#58a6ff';
      inputEl.style.cssText = 'width: 32px; height: 22px; padding: 0; border: 1px solid #30363d; border-radius: 3px; cursor: pointer; background: transparent;';
      inputEl.addEventListener('input', (e) => applyPreview(e.target.value));
      previewInputContainer.appendChild(inputEl);
    } else if (param.type === 'number' || param.type === 'speed') {
      const minVal = (param.min !== undefined && param.min !== null) ? param.min : 0;
      const maxVal = (param.max !== undefined && param.max !== null) ? param.max : 100;
      const stepVal = (param.step !== undefined && param.step !== null) ? param.step : (param.type === 'speed' ? 0.1 : 1);
      const curVal = (param.default !== undefined && param.default !== null) ? param.default : minVal;

      inputEl = document.createElement('input');
      inputEl.type = 'range';
      inputEl.min = String(minVal);
      inputEl.max = String(maxVal);
      inputEl.step = String(stepVal);
      inputEl.value = String(curVal);
      inputEl.style.cssText = 'flex: 1; height: 5px; cursor: pointer; accent-color: #58a6ff;';

      valDisplay = document.createElement('span');
      valDisplay.style.cssText = 'font-size: 0.69rem; color: #8b949e; min-width: 30px; text-align: right; font-family: monospace;';
      valDisplay.textContent = String(curVal);

      inputEl.addEventListener('input', (e) => {
        const num = parseFloat(e.target.value);
        if (valDisplay) valDisplay.textContent = String(num);
        applyPreview(num);
      });
      previewInputContainer.appendChild(inputEl);
      previewInputContainer.appendChild(valDisplay);
    } else if (param.type === 'boolean') {
      inputEl = document.createElement('input');
      inputEl.type = 'checkbox';
      inputEl.checked = param.default === true || param.default === 'true' || param.default === 1;
      inputEl.style.cssText = 'cursor: pointer; accent-color: #58a6ff;';
      inputEl.addEventListener('change', (e) => applyPreview(e.target.checked));
      previewInputContainer.appendChild(inputEl);
    } else if (param.type === 'enum' && Array.isArray(param.options)) {
      inputEl = document.createElement('select');
      inputEl.style.cssText = 'flex: 1; font-size: 0.71rem; padding: 2px 4px; background: #0d1117; color: #c9d1d9; border: 1px solid #30363d; border-radius: 3px;';
      param.options.forEach((opt) => {
        const optEl = document.createElement('option');
        optEl.value = opt;
        optEl.textContent = opt;
        if (opt === param.default) optEl.selected = true;
        inputEl.appendChild(optEl);
      });
      inputEl.addEventListener('change', (e) => applyPreview(e.target.value));
      previewInputContainer.appendChild(inputEl);
    } else {
      inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.value = (param.default !== undefined && param.default !== null) ? String(param.default) : '';
      inputEl.style.cssText = 'flex: 1; font-size: 0.71rem; padding: 2px 5px; background: #0d1117; color: #c9d1d9; border: 1px solid #30363d; border-radius: 3px;';
      inputEl.addEventListener('input', (e) => applyPreview(e.target.value));
      previewInputContainer.appendChild(inputEl);
    }

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn-floating-action';
    resetBtn.style.cssText = 'font-size: 0.68rem; padding: 1px 4px; background: #21262d; border: 1px solid #30363d; color: #8b949e; cursor: pointer;';
    resetBtn.title = 'Reset preview to authored default';
    resetBtn.textContent = '↺';
    resetBtn.addEventListener('click', () => {
      const defVal = param.default;
      if (param.type === 'color') {
        inputEl.value = (typeof defVal === 'string' && defVal.startsWith('#')) ? defVal : '#58a6ff';
      } else if (param.type === 'number' || param.type === 'speed') {
        inputEl.value = String(defVal);
        if (valDisplay) valDisplay.textContent = String(defVal);
      } else if (param.type === 'boolean') {
        inputEl.checked = defVal === true || defVal === 'true' || defVal === 1;
      } else if (param.type === 'enum') {
        inputEl.value = defVal;
      } else {
        inputEl.value = String(defVal || '');
      }
      applyPreview(defVal);
    });

    previewRow.appendChild(previewLabel);
    previewRow.appendChild(previewInputContainer);
    previewRow.appendChild(resetBtn);
    card.appendChild(previewRow);

    listEl.appendChild(card);
  });
};

if (window.AppCoordinator) {
  window.AppCoordinator.on('layers:changed', () => {
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
    if (typeof window.syncInspectorLayerSections === 'function') window.syncInspectorLayerSections();
    if (typeof window.syncImageToolsUI === 'function') window.syncImageToolsUI();
  });
  window.AppCoordinator.on('selection:changed', (sel) => {
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
    if (typeof window.syncInspectorLayerSections === 'function') window.syncInspectorLayerSections();
    if (typeof window.syncImageEditorUI === 'function') window.syncImageEditorUI();
    if (typeof window.syncImageToolsUI === 'function') window.syncImageToolsUI();
    if (typeof window.renderWidgetParametersOverview === 'function') window.renderWidgetParametersOverview(sel);
  });
  window.AppCoordinator.on('state:restored', () => {
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
    if (typeof window.syncInspectorLayerSections === 'function') window.syncInspectorLayerSections();
    if (typeof window.syncImageEditorUI === 'function') window.syncImageEditorUI();
    if (typeof window.syncImageToolsUI === 'function') window.syncImageToolsUI();
    if (typeof window.renderWidgetParametersOverview === 'function') window.renderWidgetParametersOverview();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  let currentImage = null;
  window.currentRenderState = null;

  window.getLoadedPhoto = function() {
    return window.SceneState ? window.SceneState.getLoadedPhoto() : null;
  };

  window.hydrateLoadedPhoto = function(photoObj) {
    const normalized = window.SceneState && typeof window.SceneState.hydrateLoadedPhoto === 'function'
      ? window.SceneState.hydrateLoadedPhoto(photoObj)
      : (photoObj || null);
    const dropLabel = document.getElementById('uploadDropLabel');
    const dropMeta = document.getElementById('uploadPhotoMeta');
    if (normalized) {
      if (dropLabel) dropLabel.innerText = '📷 ' + (normalized.filename || 'Loaded Photo');
      if (dropMeta) dropMeta.innerText = 'Native: ' + normalized.naturalWidth + ' \u00d7 ' + normalized.naturalHeight + 'px (Click to replace)';
    } else {
      if (dropLabel) dropLabel.innerText = 'Upload Background Photo';
      if (dropMeta) dropMeta.innerText = 'Drop JPEG, PNG, or WebP here';
    }
    if (typeof window.syncImageToolsUI === 'function') {
      window.syncImageToolsUI();
    }
    return normalized;
  };

  window.setLoadedPhoto = function(photoObj, options = {}) {
    if (options && (options.hydrateOnly || options.skipBridge)) {
      return window.hydrateLoadedPhoto(photoObj);
    }
    const normalized = window.hydrateLoadedPhoto(photoObj);
    if (window.EngineBridge && typeof window.EngineBridge.setBackground === 'function') {
      window.EngineBridge.setBackground(normalized ? {
        filename: normalized.filename,
        mime: normalized.mime,
        src: normalized.src || normalized.dataUrl || '',
        b64: normalized.b64 || '',
        naturalWidth: normalized.naturalWidth,
        naturalHeight: normalized.naturalHeight,
        crop: normalized.crop || null,
        cropVersions: normalized.cropVersions || null,
        activeCropVersionId: normalized.activeCropVersionId || 'original'
      } : null);
    }
    return normalized;
  };

  const paperSpecs = (window.SceneState && window.SceneState.paperSpecs) || {
    '1123x794':  { name: 'A4 Landscape',        dpi300: '3508 × 2480 px' },
    '794x1123':  { name: 'A4 Portrait',         dpi300: '2480 × 3508 px' },
    '1587x1123': { name: 'A3 Landscape',        dpi300: '4960 × 3508 px' },
    '1123x1587': { name: 'A3 Portrait',         dpi300: '3508 × 4960 px' },
    '794x559':   { name: 'A5 Landscape',        dpi300: '2480 × 1748 px' },
    '559x794':   { name: 'A5 Portrait',         dpi300: '1748 × 2480 px' },
    '1056x816':  { name: 'US Letter Landscape', dpi300: '3300 × 2550 px' },
    '816x1056':  { name: 'US Letter Portrait',  dpi300: '2550 × 3300 px' },
    '1344x816':  { name: 'US Legal Landscape',  dpi300: '4200 × 2550 px' },
    '816x1344':  { name: 'US Legal Portrait',   dpi300: '2550 × 4200 px' },
    '1632x1056': { name: 'Tabloid Landscape',   dpi300: '5100 × 3300 px' },
    '1056x1632': { name: 'Tabloid Portrait',    dpi300: '3300 × 5100 px' }
  };

  function commitCurrentSceneConfigToGo() {
    if (!window.EngineBridge || typeof window.EngineBridge.isReady !== 'function' || !window.EngineBridge.isReady()) return;
    if (window.SceneState && typeof window.SceneState.buildRenderState === 'function') {
      const renderState = window.SceneState.buildRenderState();
      if (!renderState) return;

      // 1. Canvas
      if (renderState.image && typeof window.EngineBridge.updateCanvas === 'function') {
        const c = renderState.image;
        window.EngineBridge.updateCanvas({
          width: c.width,
          height: c.height,
          duration: renderState.duration,
          loop: renderState.loop,
          pattern: c.pattern,
          gridColor: c.gridColor,
          gridSize: c.gridSize,
          bgColor: renderState.camera ? renderState.camera.bgColor : undefined,
          bgTransparent: renderState.camera ? renderState.camera.bgTransparent : undefined
        });
      }

      // 2. Camera
      if (renderState.camera && typeof window.EngineBridge.updateCamera === 'function') {
        window.EngineBridge.updateCamera(renderState.camera);
      }

      // 3. Optics
      if (renderState.optical && typeof window.EngineBridge.updateOptics === 'function') {
        window.EngineBridge.updateOptics(renderState.optical);
      }

      // 4. Frame
      if (renderState.overlays && typeof window.EngineBridge.updateFrame === 'function') {
        window.EngineBridge.updateFrame(renderState.overlays);
      }
    }
  }

  function recordImmediate() {
    commitCurrentSceneConfigToGo();
    if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
    else if (window.HistoryManager) window.HistoryManager.recordImmediate();
  }

  function recordDebounced() {
    commitCurrentSceneConfigToGo();
    if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
    else if (window.HistoryManager) window.HistoryManager.recordDebounced();
  }

  function initAccordions() {
    document.querySelectorAll('.accordion-header').forEach((header) => {
      header.addEventListener('click', () => {
        const section = header.parentElement;
        if (!section) return;
        if (window.WorkspaceController && typeof window.WorkspaceController.showToolPanel === 'function') {
          window.WorkspaceController.showToolPanel(section.id);
        } else {
          section.classList.toggle('open');
        }
      });
    });
  }

  initAccordions();

  if (window.WorkspaceController && typeof window.WorkspaceController.init === 'function') {
    window.WorkspaceController.init();
  }

  // Workspace keyboard shortcuts: T (Left Drawer), N (Right Drawer), Shift+Space (Maximize Stage), Esc
  window.addEventListener('keydown', (e) => {
    if (window.CustomColorPicker && window.CustomColorPicker.isOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        window.CustomColorPicker.cancel();
        return;
      }
      if (e.key === 'Enter' && e.target && e.target.id === 'colorPickerHexInput') {
        e.preventDefault();
        window.CustomColorPicker.apply();
        return;
      }
    }

    if (window.Stage && window.Stage.isCroppingImage) {
      if (e.key === 'Escape') {
        e.preventDefault();
        window.Stage.cancelCropMode();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        window.Stage.applyCropMode();
        return;
      }
    }

    if (window.Stage && window.Stage.isClippingImage) {
      if (e.key === 'Escape') {
        e.preventDefault();
        window.Stage.cancelClipMode();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        window.Stage.applyClipMode();
        return;
      }
    }

    if (window.Stage && window.Stage.isExtractingBg) {
      if (e.key === 'Escape') {
        e.preventDefault();
        window.Stage.cancelBgExtractMode();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        window.Stage.confirmBgExtractMode();
        return;
      }
    }

    if (window.WorkspaceController && typeof window.WorkspaceController.handleKeydown === 'function') {
      window.WorkspaceController.handleKeydown(e);
    }

    const isEditable = e.target && (
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) ||
      e.target.isContentEditable
    );
    if (!isEditable) {
      // 1. Ctrl/Cmd+A: Select all shapes
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        const allNodes = window.DiagramNodes ? window.DiagramNodes.getAllNodes() : [];
        const selectableNodes = allNodes.filter((n) => {
          if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
            const eff = window.LayerManager.getEffective('node', n.id);
            if (eff && (eff.locked || !eff.visible)) return false;
          }
          return true;
        });
        if (selectableNodes.length > 0 && window.AppCoordinator) {
          const items = selectableNodes.map((n) => ({ type: 'node', id: n.id }));
          window.AppCoordinator.setMultiSelection(items, selectableNodes[0].id);
        }
        return;
      }

      // 2. Delete / Backspace: Delete selected objects
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (window.AppCoordinator && window.AppCoordinator.getSelectedItems().length > 0) {
          e.preventDefault();
          window.AppCoordinator.deleteSelectedObjects();
        }
        return;
      }

      // 3. Arrow keys: Nudge selected shapes
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        if (window.AppCoordinator && window.AppCoordinator.getSelectedNodeIds().length > 0) {
          e.preventDefault();
          const step = e.shiftKey ? 2 : 0.5;
          let dx = 0, dy = 0;
          if (e.key === 'ArrowLeft') dx = -step;
          else if (e.key === 'ArrowRight') dx = step;
          else if (e.key === 'ArrowUp') dy = -step;
          else if (e.key === 'ArrowDown') dy = step;
          const moved = window.AppCoordinator.moveSelectedNodes(dx, dy);
          if (moved) {
            window.AppCoordinator.recordHistoryDebounced();
          }
        }
        return;
      }

      // 4. Ctrl/Cmd+G: Group selected objects
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        if (window.AppCoordinator) window.AppCoordinator.createGroupFromSelection();
        return;
      }

      // 5. Ctrl/Cmd+Shift+G: Ungroup selected group
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        if (window.AppCoordinator) window.AppCoordinator.ungroupSelectedGroup();
        return;
      }

      // 6. Ctrl/Cmd+D: Duplicate selection
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        if (window.AppCoordinator) window.AppCoordinator.duplicateSelection();
        return;
      }

      // 7. Ctrl/Cmd+C: Copy selection
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        if (window.AppCoordinator) window.AppCoordinator.copySelection();
        return;
      }

      // 8. Ctrl/Cmd+V: Paste clipboard
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        if (window.AppCoordinator) window.AppCoordinator.pasteClipboard();
        return;
      }

      // 9. Layer ordering shortcuts
      // Ctrl/Cmd + Shift + ]: Bring to Front
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === ']' || e.key === '}')) {
        e.preventDefault();
        if (window.AppCoordinator) window.AppCoordinator.bringSelectionToFront();
        return;
      }

      // Ctrl/Cmd + ]: Bring Forward
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === ']')) {
        e.preventDefault();
        if (window.AppCoordinator) window.AppCoordinator.bringSelectionForward();
        return;
      }

      // Ctrl/Cmd + Shift + [: Send to Back
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === '[' || e.key === '{')) {
        e.preventDefault();
        if (window.AppCoordinator) window.AppCoordinator.sendSelectionToBack();
        return;
      }

      // Ctrl/Cmd + [: Send Backward
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === '[')) {
        e.preventDefault();
        if (window.AppCoordinator) window.AppCoordinator.sendSelectionBackward();
        return;
      }
    }
  });

  function setDragPhotoCropMode(enabled) {
    if (!window.Stage) return;
    window.Stage.dragPhotoCropEnabled = enabled;
    const btn = document.getElementById('btnDragPhotoCrop');
    const previewBox = document.getElementById('previewBox');
    if (btn) {
      btn.classList.toggle('active-tool-btn', enabled);
      btn.innerText = enabled
        ? '🖐️ Dragging Photo Inside Frame (Active — Click to Lock)'
        : '🖐️ Drag Photo Inside Frame (Off)';
    }
    if (previewBox) {
      previewBox.classList.toggle('dragging-photo-crop', enabled);
    }
  }

  function updateOrientationAndPaperUI() {
    const wEl = document.getElementById('canvasWidthInput');
    const hEl = document.getElementById('canvasHeightInput');
    const btnLand = document.getElementById('btnOrientLandscape');
    const btnPort = document.getElementById('btnOrientPortrait');
    const hintEl = document.getElementById('paperPrintHint');
    if (!wEl || !hEl) return;

    const w = parseInt(wEl.value || 1280, 10);
    const h = parseInt(hEl.value || 720, 10);
    if (btnLand) btnLand.classList.toggle('active-orient', w >= h);
    if (btnPort) btnPort.classList.toggle('active-orient', h > w);

    const key = w + 'x' + h;
    if (hintEl) {
      if (paperSpecs[key]) {
        hintEl.style.display = 'block';
        hintEl.innerHTML = '🖨️ <strong>' + paperSpecs[key].name + '</strong>: 300 DPI Print Export = ' + paperSpecs[key].dpi300;
      } else {
        hintEl.style.display = 'none';
      }
    }
  }

  function applyCanvasDimensionSwap(targetMode) {
    const wEl = document.getElementById('canvasWidthInput');
    const hEl = document.getElementById('canvasHeightInput');
    if (!wEl || !hEl) return;

    const w = parseInt(wEl.value || 1280, 10);
    const h = parseInt(hEl.value || 720, 10);

    if (targetMode === 'landscape' && w >= h) return;
    if (targetMode === 'portrait' && h >= w) return;

    wEl.value = h;
    hEl.value = w;

    const loadedPhoto = window.getLoadedPhoto();
    const fitSelect = document.getElementById('photoFitSelect');
    const patSelect = document.getElementById('canvasPatternSelect');
    if (loadedPhoto && patSelect && patSelect.value === 'photo' && fitSelect && fitSelect.value === 'match') {
      fitSelect.value = 'cover';
      syncBackgroundUIVisibility();
    }

    syncPresetDropdownFromInputs();
    updateOrientationAndPaperUI();
    render();
    recordImmediate();
  }

  function syncBackgroundUIVisibility() {
    const patternSelect = document.getElementById('canvasPatternSelect');
    const pattern = patternSelect ? patternSelect.value : 'blueprint';
    const fitSelect = document.getElementById('photoFitSelect');
    const fitMode = fitSelect ? fitSelect.value : 'match';

    const photoSizingControls = document.getElementById('photoSizingControls');
    const photoCropSliders = document.getElementById('photoCropSliders');
    const btnMatchPhoto = document.getElementById('btnMatchPhotoSize');
    const bgColorRow = document.getElementById('canvasBgColorRow');
    const gridControlsRow = document.getElementById('gridControlsRow');
    const gridSizeWrap = document.getElementById('gridSizeControlWrap');
    const gridColorLabel = document.getElementById('gridColorLabel');

    const loadedPhoto = window.getLoadedPhoto();
    const isPhotoMode = pattern === 'photo' && !!loadedPhoto;

    if (photoSizingControls) photoSizingControls.style.display = isPhotoMode ? 'block' : 'none';
    if (photoCropSliders) {
      const showCrop = isPhotoMode && fitMode === 'cover';
      photoCropSliders.style.display = showCrop ? 'block' : 'none';
      if (!showCrop) setDragPhotoCropMode(false);
    }
    if (btnMatchPhoto) btnMatchPhoto.style.display = isPhotoMode ? 'inline-block' : 'none';

    if (bgColorRow) {
      const showBgColor = !isPhotoMode || fitMode === 'contain';
      bgColorRow.style.display = showBgColor ? 'flex' : 'none';
    }

    if (gridControlsRow) {
      const usesGridOrRadial = !isPhotoMode && ['blueprint', 'dots', 'graph', 'dark-radial'].includes(pattern);
      gridControlsRow.style.display = usesGridOrRadial ? 'block' : 'none';
      if (gridColorLabel) {
        gridColorLabel.innerText = pattern === 'dark-radial' ? 'Inner Vignette Colour' : 'Background Grid Colour';
      }
      if (gridSizeWrap) {
        gridSizeWrap.style.display = ['blueprint', 'dots', 'graph'].includes(pattern) ? 'flex' : 'none';
      }
    }
  }

  function syncPresetDropdownFromInputs() {
    const wEl = document.getElementById('canvasWidthInput');
    const hEl = document.getElementById('canvasHeightInput');
    const w = parseInt(wEl ? wEl.value : 1280, 10);
    const h = parseInt(hEl ? hEl.value : 720, 10);
    const presetSelect = document.getElementById('canvasPresetSelect');
    if (!presetSelect) return;
    const key = w + 'x' + h;
    const revKey = h + 'x' + w;
    const match = Array.from(presetSelect.options).find((opt) => opt.value === key || opt.value === revKey);
    presetSelect.value = match ? match.value : 'custom';
    if (window.SceneState) {
      window.SceneState.setControl('canvasPresetSelect', presetSelect.value);
    }
  }

  window.buildFullSVG = function(state, overrides = {}) {
    if (window.SceneState && typeof window.SceneState.buildFullSVG === 'function') {
      return window.SceneState.buildFullSVG(state, overrides);
    }
    return '';
  };

  function getExportSVG() {
    const rawSvg = window.buildFullSVG(window.currentRenderState);
    return window.serializeSVGForExport(rawSvg);
  }

  function getCleanBaseName() {
    const exportIn = document.getElementById('widgetExportBaseNameInput');
    if (exportIn && exportIn.value && exportIn.value.trim()) {
      const cleaned = exportIn.value.trim().replace(/\.(svg|zip|sva|html|json|md|js|png|webp|mp4)$/i, '').trim();
      if (cleaned) return cleaned;
    }
    const projIn = document.getElementById('projectNameInput');
    if (projIn && projIn.value && projIn.value.trim() && projIn.value.trim().toLowerCase() !== 'untitled project') {
      const cleanedProj = projIn.value.trim().replace(/\.(svg|zip|sva)$/i, '').trim();
      if (cleanedProj) return cleanedProj;
    }
    if (!currentImage || !currentImage.filename) return 'export';
    if (currentImage.filename === 'diagram_canvas.svg') return 'widget';
    return currentImage.filename.includes('.') ? currentImage.filename.split('.')[0] : currentImage.filename;
  }
  window.getCleanBaseName = getCleanBaseName;

  function syncVal(id, val) {
    if (window.ControlStateAdaptor) {
      window.ControlStateAdaptor.setPairValue(id, val);
    } else {
      const el = document.getElementById(id + 'Slider');
      const num = document.getElementById(id + 'Num');
      if (el) el.value = val;
      if (num) num.value = val;
    }
  }

  Stage.init((placement, x, y) => {
    if (window.DataFlows && window.DataFlows.activeId !== null) {
      window.DataFlows.handleStageClick(x, y);
      return;
    }
    if (window.Glows && window.Glows.activeId !== null) {
      window.Glows.handleStageClick(x, y);
      return;
    }
    if (window.Ripples && window.Ripples.activeId !== null) {
      window.Ripples.handleStageClick(x, y);
      return;
    }
    if (window.LiteEffects && window.LiteEffects.activeId !== null) {
      window.LiteEffects.handleStageClick(x, y, window.LiteEffects._dragMode);
      return;
    }
    if (window.DiagramNodes && window.DiagramNodes.activeId !== null) {
      window.DiagramNodes.handleStageClick(x, y);
      return;
    }
    if (window.AppCoordinator && window.AppCoordinator.activeSelection && window.AppCoordinator.activeSelection.type === 'image' && window.ImageObjects) {
      const imgId = window.AppCoordinator.activeSelection.id;
      if (window.ImageObjects && typeof window.ImageObjects.updateImage === 'function') {
        window.ImageObjects.updateImage(imgId, { x, y });
      } else if (window.EngineBridge && typeof window.EngineBridge.updateImage === 'function' && window.EngineBridge.isReady()) {
        window.EngineBridge.updateImage(imgId, { x, y });
      }
      render();
      window.AppCoordinator.updateActiveOverlays();
      return;
    }

    const camSel = document.getElementById('cameraMotionSelect');
    const mode = camSel ? camSel.value : 'static';
    if (mode === 'ken-burns') {
      if (placement === 'start') {
        syncVal('startX', x);
        syncVal('startY', y);
      } else {
        syncVal('endX', x);
        syncVal('endY', y);
      }
    } else if (mode === 'static') {
      syncVal('staticX', x);
      syncVal('staticY', y);
    } else if (mode === 'handheld-drift') {
      syncVal('handX', x);
      syncVal('handY', y);
    } else if (mode === 'perspective-tilt') {
      syncVal('perspX', x);
      syncVal('perspY', y);
    }
    render();
  }, (imgData) => {
    window.setLoadedPhoto(imgData);
    const patternSelect = document.getElementById('canvasPatternSelect');
    if (patternSelect) patternSelect.value = 'photo';

    const fitSelect = document.getElementById('photoFitSelect');
    if (fitSelect) fitSelect.value = 'match';

    const widthInput = document.getElementById('canvasWidthInput');
    const heightInput = document.getElementById('canvasHeightInput');
    if (widthInput) widthInput.value = imgData.naturalWidth;
    if (heightInput) heightInput.value = imgData.naturalHeight;
    syncPresetDropdownFromInputs();
    updateOrientationAndPaperUI();

    syncBackgroundUIVisibility();
    render();
    recordImmediate();
  });

  document.getElementById('btnOrientLandscape')?.addEventListener('click', () => applyCanvasDimensionSwap('landscape'));
  document.getElementById('btnOrientPortrait')?.addEventListener('click', () => applyCanvasDimensionSwap('portrait'));
  document.getElementById('btnOrientSwap')?.addEventListener('click', () => applyCanvasDimensionSwap('swap'));

  document.getElementById('chkSnapToGrid')?.addEventListener('change', () => {
    if (window.ControlStateAdaptor) window.ControlStateAdaptor.syncFromDOM(['chkSnapToGrid']);
    if (window.Stage) window.Stage.syncOverlayBounds(window.Stage.canvasWidth, window.Stage.canvasHeight);
    recordImmediate();
  });

  document.getElementById('btnSyncSnapToBgGrid')?.addEventListener('click', () => {
    const bgGridVal = parseFloat(document.getElementById('canvasGridSizeNum')?.value || 40) || 40;
    syncVal('snapGridSize', bgGridVal);
    const chk = document.getElementById('chkSnapToGrid');
    if (chk) chk.checked = true;
    if (window.ControlStateAdaptor) window.ControlStateAdaptor.syncFromDOM(['chkSnapToGrid', 'snapGridSizeSlider', 'snapGridSizeNum']);
    if (window.Stage) window.Stage.syncOverlayBounds(window.Stage.canvasWidth, window.Stage.canvasHeight);
    recordImmediate();
  });

  window.Stage.onPhotoCropDrag = (dx, dy) => {
    const loadedPhoto = window.getLoadedPhoto();
    if (!loadedPhoto || !currentImage) return;
    const w = currentImage.width;
    const h = currentImage.height;
    const natW = loadedPhoto.naturalWidth || w;
    const natH = loadedPhoto.naturalHeight || h;
    const czEl = document.getElementById('photoCropZoomSlider');
    const cropZoom = Math.max(1.0, parseFloat(czEl ? czEl.value : 100) / 100);
    const scale = window.Stage.getEffectiveScale() || 1.0;

    const baseScale = Math.max(w / natW, h / natH) * cropZoom;
    const overflowX = Math.max(1, (natW * baseScale) - w);
    const overflowY = Math.max(1, (natH * baseScale) - h);

    const cxEl = document.getElementById('photoCropXSlider');
    const cyEl = document.getElementById('photoCropYSlider');
    const curX = parseFloat(cxEl ? cxEl.value : 50);
    const curY = parseFloat(cyEl ? cyEl.value : 50);

    const nextX = Math.min(100, Math.max(0, curX - ((dx / scale) / overflowX) * 100));
    const nextY = Math.min(100, Math.max(0, curY - ((dy / scale) / overflowY) * 100));

    syncVal('photoCropX', Math.round(nextX));
    syncVal('photoCropY', Math.round(nextY));
    render();
  };

  document.getElementById('btnDragPhotoCrop')?.addEventListener('click', () => {
    setDragPhotoCropMode(!window.Stage.dragPhotoCropEnabled);
  });

  const presetSel = document.getElementById('canvasPresetSelect');
  if (presetSel) {
    presetSel.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'custom') return;
      const parts = val.split('x').map(Number);
      let pw = parts[0];
      let ph = parts[1];
      if (pw > 0 && ph > 0) {
        const isCurrentlyPortrait = document.getElementById('btnOrientPortrait')?.classList.contains('active-orient');
        if (isCurrentlyPortrait && pw > ph) {
          const tmp = pw;
          pw = ph;
          ph = tmp;
        }
        document.getElementById('canvasWidthInput').value = pw;
        document.getElementById('canvasHeightInput').value = ph;

        const dpiSel = document.getElementById('stillDpiSelect');
        if (dpiSel && paperSpecs[pw + 'x' + ph]) {
          dpiSel.value = '3.125';
        }

        const loadedPhoto = window.getLoadedPhoto();
        const fitSelect = document.getElementById('photoFitSelect');
        const patSelect = document.getElementById('canvasPatternSelect');
        if (loadedPhoto && patSelect && patSelect.value === 'photo' && fitSelect && fitSelect.value === 'match') {
          fitSelect.value = 'cover';
          syncBackgroundUIVisibility();
        }
        updateOrientationAndPaperUI();
        render();
        recordImmediate();
      }
    });
  }

  const patSel = document.getElementById('canvasPatternSelect');
  if (patSel) {
    patSel.addEventListener('change', (e) => {
      if (e.target.value === 'photo' && !window.getLoadedPhoto()) {
        document.getElementById('fileInput')?.click();
      }
      syncBackgroundUIVisibility();
      render();
      recordImmediate();
    });
  }

  const fitSel = document.getElementById('photoFitSelect');
  if (fitSel) {
    fitSel.addEventListener('change', () => {
      syncBackgroundUIVisibility();
      render();
      recordImmediate();
    });
  }

  const btnMatch = document.getElementById('btnMatchPhotoSize');
  if (btnMatch) {
    btnMatch.addEventListener('click', () => {
      const loadedPhoto = window.getLoadedPhoto();
      if (!loadedPhoto) return;
      const crop = loadedPhoto.crop;
      const hasCrop = crop && crop.enabled !== false && (crop.sourceWidth || crop.width) > 0;
      const targetW = hasCrop ? (crop.sourceWidth || crop.width) : (loadedPhoto.naturalWidth || 1280);
      const targetH = hasCrop ? (crop.sourceHeight || crop.height) : (loadedPhoto.naturalHeight || 720);
      document.getElementById('canvasWidthInput').value = Math.round(targetW);
      document.getElementById('canvasHeightInput').value = Math.round(targetH);
      document.getElementById('photoFitSelect').value = 'match';
      syncPresetDropdownFromInputs();
      updateOrientationAndPaperUI();
      syncBackgroundUIVisibility();
      render();
      recordImmediate();
    });
  }

  ['canvasWidthInput', 'canvasHeightInput'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        syncPresetDropdownFromInputs();
        updateOrientationAndPaperUI();
        const loadedPhoto = window.getLoadedPhoto();
        const fitSelect = document.getElementById('photoFitSelect');
        const patSelect = document.getElementById('canvasPatternSelect');
        if (loadedPhoto && patSelect && patSelect.value === 'photo' && fitSelect && fitSelect.value === 'match') {
          fitSelect.value = 'cover';
          syncBackgroundUIVisibility();
        }
        render();
        recordDebounced();
      });
      el.addEventListener('change', () => {
        const rawVal = parseInt(el.value, 10);
        if (isNaN(rawVal) || rawVal < 20) {
          el.value = '20';
        }
        syncPresetDropdownFromInputs();
        updateOrientationAndPaperUI();
        render();
        recordImmediate();
      });
    }
  });

  ['canvasBgColorPicker', 'canvasGridColorPicker'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', render);
      el.addEventListener('change', () => {
        render();
        recordImmediate();
      });
    }
  });

  const bgTrans = document.getElementById('canvasBgTransparent');
  if (bgTrans) {
    bgTrans.addEventListener('change', () => {
      render();
      recordImmediate();
    });
  }

  document.getElementById('btnModeStart')?.addEventListener('click', () => {
    if (window.AppCoordinator) {
      window.AppCoordinator.selectObject('camera', 'start', { skipStageClear: true });
    }
    if (window.Stage) Stage.setActive('start');
  });

  document.getElementById('btnModeEnd')?.addEventListener('click', () => {
    if (window.AppCoordinator) {
      window.AppCoordinator.selectObject('camera', 'end', { skipStageClear: true });
    }
    if (window.Stage) Stage.setActive('end');
  });

  document.querySelectorAll('.slider-row').forEach((row) => {
    const slider = row.querySelector('input[type="range"]');
    const num = row.querySelector('input[type="number"]');
    if (slider && num) {
      num.value = slider.value;
      slider.addEventListener('input', () => {
        num.value = slider.value;
        render();
        recordDebounced();
      });
      num.addEventListener('input', () => {
        slider.value = num.value;
        render();
        recordDebounced();
      });
    }
  });

  function syncCameraPanelVisibility(v) {
    document.getElementById('panel-cam-static').style.display = v === 'static' ? 'block' : 'none';
    document.getElementById('panel-cam-kenburns').style.display = v === 'ken-burns' ? 'block' : 'none';
    document.getElementById('panel-cam-handheld').style.display = v === 'handheld-drift' ? 'block' : 'none';
    document.getElementById('panel-cam-perspective').style.display = v === 'perspective-tilt' ? 'block' : 'none';
    const timingBox = document.getElementById('panel-cam-timing');
    if (timingBox) {
      timingBox.style.display = (v === 'ken-burns' || v === 'handheld-drift') ? 'block' : 'none';
    }
  }

  const camMotionSel = document.getElementById('cameraMotionSelect');
  if (camMotionSel) {
    camMotionSel.addEventListener('change', (e) => {
      syncCameraPanelVisibility(e.target.value);
      render();
      recordImmediate();
    });
  }

  const effSel = document.getElementById('effectSelect');
  if (effSel) {
    effSel.addEventListener('change', (e) => {
      const v = e.target.value;
      document.getElementById('panel-opt-focus').style.display = v === 'focus-pull' ? 'block' : 'none';
      document.getElementById('panel-opt-tiltshift').style.display = v === 'tilt-shift' ? 'block' : 'none';
      document.getElementById('panel-opt-motionblur').style.display = v === 'motion-blur' ? 'block' : 'none';
      render();
      recordImmediate();
    });
  }

  const chkFrame = document.getElementById('chkModuleFrame');
  if (chkFrame) {
    chkFrame.addEventListener('change', (e) => {
      const group = document.getElementById('groupFrame');
      if (group) group.style.display = e.target.checked ? 'flex' : 'none';
      render();
      recordImmediate();
    });
  }

  const chkFrameLight = document.getElementById('chkFrameLighting');
  if (chkFrameLight) {
    chkFrameLight.addEventListener('change', (e) => {
      const details = document.getElementById('frameLightingDetails');
      if (details) details.style.display = e.target.checked ? 'flex' : 'none';
      render();
      recordImmediate();
    });
  }

  document.querySelectorAll('#settingsPanel select, #settingsPanel input[type="checkbox"], #settingsPanel input[type="color"]').forEach((el) => {
    el.addEventListener('change', () => {
      render();
      recordImmediate();
    });
    if (el.type === 'color') el.addEventListener('input', render);
  });

  window.syncUIAfterHistoryRestore = function() {
    syncPresetDropdownFromInputs();
    syncBackgroundUIVisibility();
    updateOrientationAndPaperUI();
    const cm = document.getElementById('cameraMotionSelect')?.value || 'static';
    syncCameraPanelVisibility(cm);

    const ef = document.getElementById('effectSelect')?.value || 'none';
    document.getElementById('panel-opt-focus').style.display = ef === 'focus-pull' ? 'block' : 'none';
    document.getElementById('panel-opt-tiltshift').style.display = ef === 'tilt-shift' ? 'block' : 'none';
    document.getElementById('panel-opt-motionblur').style.display = ef === 'motion-blur' ? 'block' : 'none';

    const fr = document.getElementById('chkModuleFrame')?.checked;
    const grp = document.getElementById('groupFrame');
    if (grp) grp.style.display = fr ? 'flex' : 'none';

    const flOn = document.getElementById('chkFrameLighting')?.checked !== false;
    const flDetails = document.getElementById('frameLightingDetails');
    if (flDetails) flDetails.style.display = flOn ? 'flex' : 'none';

    if (typeof window.renderWidgetParametersOverview === 'function') {
      window.renderWidgetParametersOverview();
    }

    render();
  };

  function render() {
    if (window.ControlStateAdaptor) {
      window.ControlStateAdaptor.syncFromDOM();
    }

    const state = window.SceneState ? window.SceneState.buildRenderState() : null;
    if (!state || !state.image) return;
    currentImage = state.image;

    if (window.SceneState && window.SceneState.controls.canvasPatternSelect === 'blueprint') {
      const patSelEl = document.getElementById('canvasPatternSelect');
      if (patSelEl && patSelEl.value === 'photo' && !window.getLoadedPhoto()) {
        patSelEl.value = 'blueprint';
      }
    }

    if (currentImage.pattern === 'photo' && currentImage.photoFit === 'match' && window.getLoadedPhoto()) {
      const wInput = document.getElementById('canvasWidthInput');
      const hInput = document.getElementById('canvasHeightInput');
      if (wInput) wInput.value = currentImage.width;
      if (hInput) hInput.value = currentImage.height;
      syncPresetDropdownFromInputs();
    }

    const dim = document.getElementById('imgDimensions');
    if (dim) {
      dim.innerHTML = currentImage.width + ' &times; ' + currentImage.height + (currentImage.isBlankCanvas ? ' (Canvas)' : '');
    }

    if (window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady() && typeof window.EngineBridge.updateCanvas === 'function') {
      const engCanvas = typeof window.EngineBridge.getCanvas === 'function' ? window.EngineBridge.getCanvas() : null;
      if (!engCanvas || engCanvas.width !== currentImage.width || engCanvas.height !== currentImage.height) {
        window.EngineBridge.updateCanvas({ width: currentImage.width, height: currentImage.height });
      }
    }

    if (window.Stage) {
      window.Stage.syncOverlayBounds(currentImage.width, currentImage.height);
    }

    const camMode = state.camera.motion;
    const sx = state.camera.startX;
    const sy = state.camera.startY;
    const ex = state.camera.endX;
    const ey = state.camera.endY;

    const rStart = document.getElementById('reticleStart');
    const rEnd = document.getElementById('reticleEnd');
    const rCenter = document.getElementById('reticleCenter');

    if (rStart) rStart.style.display = (camMode === 'ken-burns') ? 'flex' : 'none';
    if (rEnd) rEnd.style.display = (camMode === 'ken-burns') ? 'flex' : 'none';
    if (rCenter) {
      rCenter.style.display = (camMode !== 'ken-burns') ? 'flex' : 'none';
      rCenter.style.left = sx + '%';
      rCenter.style.top = sy + '%';
    }

    const editingNode = window.DiagramNodes ? window.DiagramNodes.activeId !== null : false;
    const editingFlow = window.DataFlows ? window.DataFlows.activeId !== null : false;
    const editingGlow = window.Glows ? window.Glows.activeId !== null : false;
    const editingRipple = window.Ripples ? window.Ripples.activeId !== null : false;

    if (!editingNode && !editingFlow && !editingGlow && !editingRipple && window.Stage) {
      window.Stage.updateReticles(sx, sy, ex, ey);
    }
    if (window.AppCoordinator && typeof window.AppCoordinator.updateActiveOverlays === 'function') {
      window.AppCoordinator.updateActiveOverlays();
    }

    try {
      const svgContainer = document.getElementById('svgContainer');
      if (svgContainer) {
        svgContainer.innerHTML = window.buildFullSVG(state);
        if (window.LiteEffects && typeof window.LiteEffects.bindBurstSchedulers === 'function') {
          window.LiteEffects.bindBurstSchedulers(svgContainer);
        }
      }
      if (window.TimelinePlayer && typeof window.TimelinePlayer.onSceneRedrawn === 'function') {
        window.TimelinePlayer.onSceneRedrawn();
      } else if (window.TimelinePlayer && typeof window.TimelinePlayer.syncFromScene === 'function') {
        window.TimelinePlayer.syncFromScene();
      }
    } catch (e) {
      console.error('SVG Render Exception:', e);
    }
  }

  window.triggerAppRender = render;
  if (window.AppCoordinator) {
    window.AppCoordinator.registerRenderHandler(render);
  }

  document.getElementById('btnReplay')?.addEventListener('click', () => {
    if (window.TimelinePlayer && typeof window.TimelinePlayer.restart === 'function') {
      window.TimelinePlayer.restart();
    } else {
      const container = document.getElementById('svgContainer');
      if (!container || !window.currentRenderState) return;
      container.innerHTML = '';
      setTimeout(() => {
        container.innerHTML = window.buildFullSVG(window.currentRenderState);
      }, 10);
    }
  });

  document.getElementById('btnDownloadSVG')?.addEventListener('click', () => {
    try {
      if (!currentImage || !window.currentRenderState) return;
      const svgData = getExportSVG();
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = getCleanBaseName() + '_animated.svg';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 150);
    } catch (err) {
      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        window.AppCoordinator.showNotification('SVG Download Error: ' + err.message, 'error');
      } else {
        alert('SVG Download Error: ' + err.message);
      }
    }
  });

  document.getElementById('btnDownloadHTML')?.addEventListener('click', () => {
    try {
      if (!currentImage || !window.currentRenderState) return;
      const w = currentImage.width || 1280;
      const h = currentImage.height || 720;
      const isTransparent = !!(window.currentRenderState.camera && window.currentRenderState.camera.bgTransparent);
      const bgColor = isTransparent
        ? 'transparent'
        : ((window.currentRenderState.camera && window.currentRenderState.camera.bgColor) || '#0d1117');
      const svgData = getExportSVG();

      const htmlData =
        '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n' +
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '  <title>Animated Diagram &amp; Topology</title>\n' +
        '  <style>\n' +
        '    * { box-sizing: border-box; margin: 0; padding: 0; }\n' +
        '    body { background: ' + bgColor + '; display: flex; justify-content: center; align-items: center; width: 100vw; height: 100vh; overflow: hidden; }\n' +
        '    .stage-frame { width: min(100vw, calc(100vh * (' + w + ' / ' + h + '))); height: min(100vh, calc(100vw * (' + h + ' / ' + w + '))); aspect-ratio: ' + w + ' / ' + h + '; display: flex; justify-content: center; align-items: center; }\n' +
        '    svg { width: 100%; height: 100%; display: block; }\n' +
        '  </style>\n</head>\n<body>\n  <div class="stage-frame">\n    ' + svgData + '\n  </div>\n</body>\n</html>';

      const blob = new Blob([htmlData], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = getCleanBaseName() + '_animated.html';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 150);
    } catch (err) {
      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        window.AppCoordinator.showNotification('HTML Download Error: ' + err.message, 'error');
      } else {
        alert('HTML Download Error: ' + err.message);
      }
    }
  });

  document.getElementById('btnDownloadWidgetSVG')?.addEventListener('click', () => {
    try {
      if (!currentImage || !window.currentRenderState) return;
      const rawSvg = getExportSVG();
      const baseName = getCleanBaseName();
      const cleanSlug = String(baseName || 'widget').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'widget';
      const instanceId = cleanSlug;
      const rasterPolicy = document.getElementById('widgetExportImagePolicySelect')?.value || '2x';
      let manifest = null;
      if (window.EngineBridge && typeof window.EngineBridge.getWidgetParameters === 'function') {
        const params = window.EngineBridge.getWidgetParameters();
        if (Array.isArray(params) && params.length > 0) {
          manifest = {
            schemaVersion: 1,
            widgetName: cleanSlug,
            packageId: cleanSlug,
            componentId: 'cmp-' + cleanSlug,
            parameters: params
          };
        }
      }
      const isolatedSvg = (window.SVGExportAdapter && typeof window.SVGExportAdapter.isolateWidget === 'function')
        ? window.SVGExportAdapter.isolateWidget(rawSvg, instanceId, { scopeCss: true, manifest, rasterPolicy })
        : (window.SVGWidget && typeof window.SVGWidget.isolate === 'function')
          ? window.SVGWidget.isolate(rawSvg, { instanceId, scopeCss: true, manifest, rasterPolicy })
          : rawSvg;

      const blob = new Blob([isolatedSvg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = cleanSlug + '.svg';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 150);

      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        window.AppCoordinator.showNotification('Reusable SVG Widget exported: ' + cleanSlug + '.svg (ID namespace: ' + instanceId + ')', 'success');
      }
    } catch (err) {
      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        window.AppCoordinator.showNotification('Widget Export Error: ' + err.message, 'error');
      } else {
        alert('Widget Export Error: ' + err.message);
      }
    }
  });

  document.getElementById('btnDownloadWidgetGuide')?.addEventListener('click', () => {
    try {
      const baseName = getCleanBaseName();
      const svgFilename = baseName + '.svg';
      let guideContent = '';

      if (window.EngineBridge && typeof window.EngineBridge.generateWidgetGuide === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.generateWidgetGuide(baseName, svgFilename);
        if (res && res.success && res.guideMarkdown) {
          guideContent = res.guideMarkdown;
        }
      }

      if (!guideContent) {
        guideContent = `# ${baseName} — Widget Properties Guide\n\nExported from SVG Animator Studio.\n`;
      }

      const blob = new Blob([guideContent], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = baseName + '-properties.md';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 150);

      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        window.AppCoordinator.showNotification('Widget Properties Guide downloaded: ' + baseName + '-properties.md', 'success');
      }
    } catch (err) {
      alert('Guide Export Error: ' + err.message);
    }
  });

  document.getElementById('btnDownloadWidgetPackage')?.addEventListener('click', async () => {
    try {
      if (!currentImage || !window.currentRenderState) return;
      const baseName = getCleanBaseName();
      const rawSvg = getExportSVG();
      const rasterPolicy = document.getElementById('widgetExportImagePolicySelect')?.value || '2x';

      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        window.AppCoordinator.showNotification('Packaging widget assets...', 'info');
      }

      // Fetch client runtime code
      let widgetJs = '';
      try {
        const jsResp = await fetch('js/svg-widget.js');
        if (jsResp.ok) widgetJs = await jsResp.text();
      } catch (e) {}

      if (window.EngineBridge && typeof window.EngineBridge.buildWidgetPackage === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.buildWidgetPackage(baseName, rawSvg, widgetJs, rasterPolicy);
        if (res && res.success && res.zipB64) {
          const binaryStr = atob(res.zipB64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'application/zip' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = res.filename || (baseName + '.zip');
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 150);

          const sizeKb = (bytes.length / 1024).toFixed(1);
          if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
            window.AppCoordinator.showNotification('Exported complete Widget Package: ' + a.download + ' (' + sizeKb + ' KB)', 'success');
          }
          return;
        } else if (res && res.error) {
          throw new Error(res.error);
        }
      }

      throw new Error('WebAssembly widget package builder is not available.');
    } catch (err) {
      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        window.AppCoordinator.showNotification('Widget Package Error: ' + err.message, 'error');
      } else {
        alert('Widget Package Error: ' + err.message);
      }
    }
  });

  // =========================================================================
  // Accordion Overview: Widget Parameters (External Controls)
  // =========================================================================
  if (typeof window.renderWidgetParametersOverview === 'function') {
    window.renderWidgetParametersOverview();
  }

  const btnAddGlobal = document.getElementById('btnAddGlobalWidgetParam');
  if (btnAddGlobal) {
    btnAddGlobal.addEventListener('click', () => {
      const name = prompt('Enter public parameter name (e.g. playbackRate, mainColor):', 'playbackRate');
      if (!name || !name.trim()) return;
      const cleanName = name.trim();
      const prop = (cleanName === 'playbackRate') ? 'playbackRate' : 'visibility';
      const type = (cleanName === 'playbackRate') ? 'speed' : 'boolean';
      const def = (cleanName === 'playbackRate') ? 1.0 : true;

      if (window.EngineBridge && typeof window.EngineBridge.addWidgetParameter === 'function') {
        const res = window.EngineBridge.addWidgetParameter({
          name: cleanName,
          target: 'root',
          property: prop,
          type: type,
          default: def,
          min: (type === 'speed') ? 0.1 : undefined,
          max: (type === 'speed') ? 5.0 : undefined,
          step: (type === 'speed') ? 0.1 : undefined,
          description: `Global scene ${prop}`
        });
        if (!res) {
          alert('Failed to add parameter: ' + (window.EngineBridge.getLastError() || 'Invalid parameter'));
          return;
        }
        if (window.AppCoordinator) {
          window.AppCoordinator.recordHistoryImmediate();
          window.AppCoordinator.showNotification(`Added global parameter '${cleanName}'`, 'success');
        }
        window.renderWidgetParametersOverview();
      }
    });
  }

  // Right Drawer Inline Widget Parameter Authoring Controls
  if (typeof window.initDrawerWidgetEvents === 'function') {
    window.initDrawerWidgetEvents();
  }

  const btnExposeActive = document.getElementById('btnExposeActiveWidgetParam');
  if (btnExposeActive) {
    btnExposeActive.addEventListener('click', (e) => {
      e.preventDefault();
      const sel = (window.AppCoordinator && typeof window.AppCoordinator.getActiveSelection === 'function')
        ? window.AppCoordinator.getActiveSelection()
        : null;
      if (sel && ['node', 'flow', 'glow', 'ripple', 'lite', 'image'].includes(sel.type) && sel.id !== null) {
        if (typeof window.openAccordionById === 'function') {
          window.openAccordionById('acc-widget-params');
        }
        const chk = document.getElementById('chkDrawerExposeWidget');
        if (chk && !chk.checked) {
          chk.checked = true;
          const fields = document.getElementById('drawerWidgetFields');
          if (fields) fields.style.display = 'flex';
          document.getElementById('btnDrawerSaveWidgetParam')?.click();
        }
        if (window.FloatingPropertiesEditor && typeof window.FloatingPropertiesEditor.openFor === 'function') {
          window.FloatingPropertiesEditor.openFor(sel.type, sel.id, { focusWidgetSection: true, autoExpose: true });
        }
      }
    });
  }

  const wireExposeBtn = (btnId, type) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const sel = (window.AppCoordinator && typeof window.AppCoordinator.getActiveSelection === 'function')
        ? window.AppCoordinator.getActiveSelection()
        : null;
      let targetId = (sel && sel.type === type && sel.id !== null) ? sel.id : null;
      if (targetId === null) {
        if (type === 'node' && window.DiagramNodes) targetId = window.DiagramNodes.activeId;
        else if (type === 'flow' && window.DataFlows) targetId = window.DataFlows.activeId;
        else if (type === 'glow' && window.Glows) targetId = window.Glows.activeId;
        else if (type === 'ripple' && window.Ripples) targetId = window.Ripples.activeId;
        else if (type === 'lite' && window.LiteEffects) targetId = window.LiteEffects.activeId;
      }
      if (targetId !== null) {
        if (window.AppCoordinator && typeof window.AppCoordinator.selectObject === 'function') {
          window.AppCoordinator.selectObject(type, targetId);
        }
        if (typeof window.openAccordionById === 'function') {
          window.openAccordionById('acc-widget-params');
        }
        if (window.FloatingPropertiesEditor && typeof window.FloatingPropertiesEditor.openFor === 'function') {
          window.FloatingPropertiesEditor.openFor(type, targetId, { focusWidgetSection: true, autoExpose: true });
        }
      }
    });
  };
  wireExposeBtn('btnNodeExposeWidget', 'node');
  wireExposeBtn('btnFlowExposeWidget', 'flow');
  wireExposeBtn('btnGlowExposeWidget', 'glow');
  wireExposeBtn('btnRippleExposeWidget', 'ripple');
  wireExposeBtn('btnLiteExposeWidget', 'lite');

  if (typeof populateShapeDropdowns === 'function') {
    populateShapeDropdowns();
  }

  if (window.EngineBridge && typeof window.EngineBridge.init === 'function') {
    window.EngineBridge.init('wasm/engine.wasm').then((ready) => {
      if (ready && window.HistoryManager) {
        window.HistoryManager.undoStack = ['initial-state'];
        window.HistoryManager.redoStack = [];
        window.HistoryManager.notifyStackChange({ canUndo: false, canRedo: false, undoCount: 1, redoCount: 0 });
      }
      if (window.TimelinePlayer && typeof window.TimelinePlayer.init === 'function') {
        window.TimelinePlayer.init();
      }
      if (ready && typeof window.triggerAppRender === 'function') {
        window.triggerAppRender();
      }
      if (typeof window.renderWidgetParametersOverview === 'function') {
        window.renderWidgetParametersOverview();
      }
    });
  }

  initLayersToolbarEvents();
  initInspectorLayerSectionEvents();
  initImageEditorEvents();
  syncInspectorLayerSections();
  syncImageEditorUI();

  const btnImportImg = document.getElementById('btnImportImageObject');
  const inputImportImg = document.getElementById('inputImportImageObject');
  if (btnImportImg && inputImportImg) {
    btnImportImg.addEventListener('click', () => {
      inputImportImg.click();
    });

    inputImportImg.addEventListener('change', () => {
      if (!inputImportImg.files || inputImportImg.files.length === 0) return;
      const file = inputImportImg.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const tempImg = new Image();
        tempImg.onload = () => {
          const nw = tempImg.naturalWidth || 200;
          const nh = tempImg.naturalHeight || 150;
          let initialW = nw;
          let initialH = nh;
          const maxDim = 400;
          if (initialW > maxDim || initialH > maxDim) {
            const ratio = Math.min(maxDim / initialW, maxDim / initialH);
            initialW = Math.round(initialW * ratio);
            initialH = Math.round(initialH * ratio);
          }
          const filename = file.name || 'image';
          const cleanName = filename.replace(/\.[^/.]+$/, "");

          let createdId = null;
          if (window.EngineBridge && typeof window.EngineBridge.createImage === 'function' && window.EngineBridge.isReady()) {
            createdId = window.EngineBridge.createImage({
              name: cleanName,
              filename: filename,
              data: dataUrl,
              naturalWidth: nw,
              naturalHeight: nh,
              width: initialW,
              height: initialH,
              maintainAspectRatio: true,
              x: 50,
              y: 50,
              opacity: 1.0
            });
          } else if (window.ImageObjects) {
            createdId = window.ImageObjects.createImage({
              name: cleanName,
              filename: filename,
              data: dataUrl,
              naturalWidth: nw,
              naturalHeight: nh,
              width: initialW,
              height: initialH,
              maintainAspectRatio: true,
              x: 50,
              y: 50,
              opacity: 1.0
            });
          }

          if (createdId !== null) {
            if (window.LayerManager) {
              window.LayerManager.addEntry('image', createdId);
            }
            if (window.AppCoordinator) {
              window.AppCoordinator.selectObject('image', createdId, { openAccordionId: 'acc-layers' });
              window.AppCoordinator.requestRender();
              window.AppCoordinator.recordHistoryImmediate();
              window.AppCoordinator.showNotification('Imported image: ' + cleanName, 'success');
            }
          }
          inputImportImg.value = '';
        };
        tempImg.onerror = () => {
          if (window.AppCoordinator) {
            window.AppCoordinator.showNotification('Failed to decode image file: ' + file.name, 'error');
          }
          inputImportImg.value = '';
        };
        tempImg.src = dataUrl;
      };
      reader.onerror = () => {
        if (window.AppCoordinator) {
          window.AppCoordinator.showNotification('Failed to read image file: ' + file.name, 'error');
        }
        inputImportImg.value = '';
      };
      reader.readAsDataURL(file);
    });
  }

  if (window.DiagramNodes) window.DiagramNodes.init();
  if (window.DataFlows) window.DataFlows.init();
  if (window.Glows) window.Glows.init();
  if (window.Ripples) window.Ripples.init();
  if (window.LiteEffects) window.LiteEffects.init();
  if (window.CustomColorPicker) window.CustomColorPicker.init();
  if (window.TimelinePlayer && typeof window.TimelinePlayer.init === 'function') {
    window.TimelinePlayer.init();
  }
  syncBackgroundUIVisibility();
  updateOrientationAndPaperUI();
  if (window.HistoryManager) window.HistoryManager.isRestoring = true;
  if (camMotionSel) camMotionSel.dispatchEvent(new Event('change'));
  if (effSel) effSel.dispatchEvent(new Event('change'));
  if (chkFrame) chkFrame.dispatchEvent(new Event('change'));
  if (window.FloatingPropertiesEditor) window.FloatingPropertiesEditor.init();
  if (window.HistoryManager) {
    window.HistoryManager.init();
    window.HistoryManager.isRestoring = false;
  }
  if (window.ProjectManager) window.ProjectManager.init();
  if (window.ImageToolsController && typeof window.ImageToolsController.init === 'function') {
    window.ImageToolsController.init();
  }
  renderLayersList();
  if (typeof window.renderWidgetParametersOverview === 'function') {
    window.renderWidgetParametersOverview();
  }
});
