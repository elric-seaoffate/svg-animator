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
// Layer 1 (UI Presentation): Shape Registry Dropdown Population & Unknown Shape Handling
// =========================================================================

function ensureShapeInDropdown(selectEl, shapeId) {
  if (!selectEl) return;
  if (!window.ShapeRegistry || typeof window.ShapeRegistry.has !== 'function') return;

  // Remove any previous temporary unknown shape option
  const existingTemp = selectEl.querySelector ? selectEl.querySelector('option[data-unknown-shape="true"]') : null;
  if (existingTemp) {
    if (typeof existingTemp.remove === 'function') {
      existingTemp.remove();
    } else if (existingTemp.parentElement) {
      existingTemp.parentElement.removeChild(existingTemp);
    }
  }

  if (window.ShapeRegistry.has(shapeId)) {
    selectEl.value = shapeId;
  } else if (shapeId) {
    // Add temporary disabled option to represent the unknown/legacy shape
    // without mutating the underlying data
    const tempOpt = document.createElement('option');
    tempOpt.value = shapeId;
    tempOpt.textContent = 'Unknown Shape: ' + shapeId;
    tempOpt.disabled = true;
    tempOpt.selected = true;
    tempOpt.setAttribute('data-unknown-shape', 'true');
    if (tempOpt.dataset) {
      tempOpt.dataset.unknownShape = 'true';
    }
    if (selectEl.firstChild) {
      selectEl.insertBefore(tempOpt, selectEl.firstChild);
    } else {
      selectEl.appendChild(tempOpt);
    }
    selectEl.value = shapeId;
  }
}

function populateShapeDropdowns() {
  if (!window.ShapeRegistry || typeof window.ShapeRegistry.getAll !== 'function') {
    return; // Preserve existing HTML fallback options
  }

  const shapes = window.ShapeRegistry.getAll();
  const dropdownIds = ['nodeShapeSelect', 'presetVal-shape'];

  dropdownIds.forEach((id) => {
    const selectEl = document.getElementById(id);
    if (!selectEl) return;

    const currentVal = selectEl.value;
    selectEl.innerHTML = '';
    if (Array.isArray(selectEl.children)) {
      selectEl.children.length = 0;
    }

    shapes.forEach((shape) => {
      const opt = document.createElement('option');
      opt.value = shape.id;
      opt.textContent = shape.displayName;
      selectEl.appendChild(opt);
    });

    // Clean up temporary unknown option on user change to a supported shape
    if (!selectEl._shapeChangeCleanupAttached && typeof selectEl.addEventListener === 'function') {
      selectEl._shapeChangeCleanupAttached = true;
      selectEl.addEventListener('change', (e) => {
        if (window.ShapeRegistry && window.ShapeRegistry.has(e.target.value)) {
          const temp = selectEl.querySelector ? selectEl.querySelector('option[data-unknown-shape="true"]') : null;
          if (temp) {
            if (typeof temp.remove === 'function') temp.remove();
            else if (temp.parentElement) temp.parentElement.removeChild(temp);
          }
        }
      });
    }

    ensureShapeInDropdown(selectEl, currentVal);
  });
}

window.ensureShapeInDropdown = ensureShapeInDropdown;
window.populateShapeDropdowns = populateShapeDropdowns;

document.addEventListener('DOMContentLoaded', () => {
  let currentImage = null;
  window.currentRenderState = null;

  window.getLoadedPhoto = function() {
    return window.SceneState ? window.SceneState.getLoadedPhoto() : null;
  };

  window.setLoadedPhoto = function(photoObj) {
    const normalized = window.SceneState
      ? window.SceneState.setLoadedPhoto(photoObj)
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

  function recordImmediate() {
    if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
    else if (window.HistoryManager) window.HistoryManager.recordImmediate();
  }

  function recordDebounced() {
    if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
    else if (window.HistoryManager) window.HistoryManager.recordDebounced();
  }

  function initAccordions() {
    document.querySelectorAll('.accordion-header').forEach((header) => {
      header.addEventListener('click', () => {
        const section = header.parentElement;
        const panel = section.closest('.panel');
        const isOpen = section.classList.contains('open');
        const soloChk = document.getElementById('chkSoloPanels');
        const soloMode = soloChk ? soloChk.checked : false;

        if (!isOpen && soloMode && panel) {
          panel.querySelectorAll('.accordion-section.open').forEach((other) => {
            if (other !== section) other.classList.remove('open');
          });
        }
        section.classList.toggle('open', !isOpen);
      });
    });
  }

  window.openAccordionById = function(accId) {
    const section = document.getElementById(accId);
    if (!section) return;
    const panel = section.closest('.panel');
    const soloChk = document.getElementById('chkSoloPanels');
    const soloMode = soloChk ? soloChk.checked : false;
    if (soloMode && panel) {
      panel.querySelectorAll('.accordion-section.open').forEach((other) => {
        if (other !== section) other.classList.remove('open');
      });
    }
    section.classList.add('open');
  };

  window.toggleAllAccordions = function(panelId, expand) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    if (expand) {
      const soloChk = document.getElementById('chkSoloPanels');
      if (soloChk) soloChk.checked = false;
    }
    panel.querySelectorAll('.accordion-section').forEach((sec) => {
      sec.classList.toggle('open', expand);
    });
  };

  initAccordions();

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

  window.serializeSVGForExport = function(rawSvg) {
    if (window.SceneState && typeof window.SceneState.serializeSVGForExport === 'function') {
      return window.SceneState.serializeSVGForExport(rawSvg);
    }
    return rawSvg;
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
      document.getElementById('canvasWidthInput').value = loadedPhoto.naturalWidth;
      document.getElementById('canvasHeightInput').value = loadedPhoto.naturalHeight;
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
    } else {
      if (window.DiagramNodes) window.DiagramNodes.deselectNode();
      if (window.DataFlows) window.DataFlows.deselectFlow();
      if (window.Glows) window.Glows.deselectGlow();
      if (window.Ripples) window.Ripples.deselectRipple();
    }
    if (window.Stage) Stage.setActive('start');
  });

  document.getElementById('btnModeEnd')?.addEventListener('click', () => {
    if (window.AppCoordinator) {
      window.AppCoordinator.selectObject('camera', 'end', { skipStageClear: true });
    } else {
      if (window.DiagramNodes) window.DiagramNodes.deselectNode();
      if (window.DataFlows) window.DataFlows.deselectFlow();
      if (window.Glows) window.Glows.deselectGlow();
      if (window.Ripples) window.Ripples.deselectRipple();
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
    if (editingFlow && window.DataFlows) {
      window.DataFlows.updateUIOverlay();
    }
    if (editingNode && window.DiagramNodes) {
      const activeNode = window.DiagramNodes.getNode
        ? window.DiagramNodes.getNode(window.DiagramNodes.activeId)
        : window.DiagramNodes.list.find((n) => n.id === window.DiagramNodes.activeId);
      if (activeNode) window.DiagramNodes.updateUIOverlay(activeNode);
    }

    try {
      const svgContainer = document.getElementById('svgContainer');
      if (svgContainer) {
        svgContainer.innerHTML = window.buildFullSVG(state);
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
    const container = document.getElementById('svgContainer');
    if (!container || !window.currentRenderState) return;
    container.innerHTML = '';
    setTimeout(() => {
      container.innerHTML = window.buildFullSVG(window.currentRenderState);
    }, 10);
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
      alert('SVG Download Error: ' + err.message);
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
      alert('HTML Download Error: ' + err.message);
    }
  });

  if (typeof populateShapeDropdowns === 'function') {
    populateShapeDropdowns();
  }

  if (window.DiagramNodes) window.DiagramNodes.init();
  if (window.DataFlows) window.DataFlows.init();
  if (window.Glows) window.Glows.init();
  if (window.Ripples) window.Ripples.init();
  syncBackgroundUIVisibility();
  updateOrientationAndPaperUI();
  if (camMotionSel) camMotionSel.dispatchEvent(new Event('change'));
  if (effSel) effSel.dispatchEvent(new Event('change'));
  if (chkFrame) chkFrame.dispatchEvent(new Event('change'));
  if (window.HistoryManager) window.HistoryManager.init();
  if (window.ProjectManager) window.ProjectManager.init();
});
