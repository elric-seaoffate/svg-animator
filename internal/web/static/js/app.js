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
    if (hasImageSelected) {
      const img = window.ImageObjects.getImage(sel.id);
      const modal = document.getElementById('commitCropModal');
      const nameEl = document.getElementById('commitCropModalImageName');
      if (nameEl) nameEl.textContent = img.name || `Image ${img.id}`;
      if (modal) modal.style.display = 'flex';
      return;
    }
    const photo = this._getBackgroundPhoto();
    if (photo && photo.crop && photo.crop.enabled) {
      const modal = document.getElementById('commitCropModal');
      const nameEl = document.getElementById('commitCropModalImageName');
      if (nameEl) nameEl.textContent = photo.filename || 'Canvas Background Photo';
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
      this._extractCroppedImageDataUrl(img, (res) => {
        this.closeCommitCropModal();
        if (!res || !res.dataUrl) {
          if (window.AppCoordinator) window.AppCoordinator.showNotification('Failed to commit crop: could not extract pixels.', 'error', 3000);
          return;
        }

        const commitOptions = {
          src: res.dataUrl,
          newSrc: res.dataUrl,
          naturalWidth: res.sw,
          naturalHeight: res.sh,
          width: res.sw,
          height: res.sh,
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
            discardVersions ? 'Crop committed: previous versions discarded.' : 'Crop committed: base asset updated.',
            'success',
            3000
          );
        }
        if (typeof window.syncImageEditorUI === 'function') window.syncImageEditorUI();
        this.syncUI();
      });
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

  _extractCroppedImageDataUrl(img, cb) {
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
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(sw);
      canvas.height = Math.round(sh);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, sw, sh);
      const dataUrl = canvas.toDataURL(img.mime || 'image/png');
      cb({ dataUrl, sw, sh });
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

if (window.AppCoordinator) {
  window.AppCoordinator.on('layers:changed', () => {
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
    if (typeof window.syncInspectorLayerSections === 'function') window.syncInspectorLayerSections();
    if (typeof window.syncImageToolsUI === 'function') window.syncImageToolsUI();
  });
  window.AppCoordinator.on('selection:changed', () => {
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
    if (typeof window.syncInspectorLayerSections === 'function') window.syncInspectorLayerSections();
    if (typeof window.syncImageEditorUI === 'function') window.syncImageEditorUI();
    if (typeof window.syncImageToolsUI === 'function') window.syncImageToolsUI();
  });
  window.AppCoordinator.on('state:restored', () => {
    if (typeof window.renderLayersList === 'function') window.renderLayersList();
    if (typeof window.syncInspectorLayerSections === 'function') window.syncInspectorLayerSections();
    if (typeof window.syncImageEditorUI === 'function') window.syncImageEditorUI();
    if (typeof window.syncImageToolsUI === 'function') window.syncImageToolsUI();
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
    if (!currentImage || !currentImage.filename) return 'export';
    return currentImage.filename.includes('.') ? currentImage.filename.split('.')[0] : currentImage.filename;
  }

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
});
