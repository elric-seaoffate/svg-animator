document.addEventListener('DOMContentLoaded', () => {
  let loadedPhoto = null;
  let currentImage = null;
  window.currentRenderState = null;

  // Standard Print Paper definitions (96 DPI Working Base -> 300 DPI Print Equivalent)
  const paperSpecs = {
    '1123x794':  { name: 'A4 Landscape',      dpi300: '3508 × 2480 px' },
    '794x1123':  { name: 'A4 Portrait',       dpi300: '2480 × 3508 px' },
    '1587x1123': { name: 'A3 Landscape',      dpi300: '4960 × 3508 px' },
    '1123x1587': { name: 'A3 Portrait',       dpi300: '3508 × 4960 px' },
    '794x559':   { name: 'A5 Landscape',      dpi300: '2480 × 1748 px' },
    '559x794':   { name: 'A5 Portrait',       dpi300: '1748 × 2480 px' },
    '1056x816':  { name: 'US Letter Landscape', dpi300: '3300 × 2550 px' },
    '816x1056':  { name: 'US Letter Portrait',  dpi300: '2550 × 3300 px' },
    '1344x816':  { name: 'US Legal Landscape',  dpi300: '4200 × 2550 px' },
    '816x1344':  { name: 'US Legal Portrait',   dpi300: '2550 × 4200 px' },
    '1632x1056': { name: 'Tabloid Landscape',   dpi300: '5100 × 3300 px' },
    '1056x1632': { name: 'Tabloid Portrait',    dpi300: '3300 × 5100 px' }
  };

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

  // Wire mutual exclusion & automatic Undo History hooks across all overlay modules
  function wireModuleHooks() {
    if (window.Glows && !window.Glows._mutualHooked) {
      const origGlow = window.Glows.selectGlow.bind(window.Glows);
      window.Glows.selectGlow = (id) => {
        if (window.DiagramNodes) window.DiagramNodes.deselectNode();
        if (window.DataFlows) window.DataFlows.deselectFlow();
        if (window.Ripples) window.Ripples.deselectRipple();
        origGlow(id);
      };
      const origAddGlow = window.Glows.addGlow.bind(window.Glows);
      window.Glows.addGlow = () => { origAddGlow(); if (window.HistoryManager) window.HistoryManager.recordImmediate(); };
      const origRemGlow = window.Glows.removeGlow.bind(window.Glows);
      window.Glows.removeGlow = (id) => { origRemGlow(id); if (window.HistoryManager) window.HistoryManager.recordImmediate(); };
      window.Glows._mutualHooked = true;
    }

    if (window.Ripples && !window.Ripples._mutualHooked) {
      const origRipple = window.Ripples.selectRipple.bind(window.Ripples);
      window.Ripples.selectRipple = (id) => {
        if (window.DiagramNodes) window.DiagramNodes.deselectNode();
        if (window.DataFlows) window.DataFlows.deselectFlow();
        if (window.Glows) window.Glows.deselectGlow();
        origRipple(id);
      };
      const origAddRipple = window.Ripples.addRipple.bind(window.Ripples);
      window.Ripples.addRipple = () => { origAddRipple(); if (window.HistoryManager) window.HistoryManager.recordImmediate(); };
      const origRemRipple = window.Ripples.removeRipple.bind(window.Ripples);
      window.Ripples.removeRipple = (id) => { origRemRipple(id); if (window.HistoryManager) window.HistoryManager.recordImmediate(); };
      window.Ripples._mutualHooked = true;
    }

    if (window.DataFlows && !window.DataFlows._mutualHooked) {
      const origFlow = window.DataFlows.selectFlow.bind(window.DataFlows);
      window.DataFlows.selectFlow = (id) => {
        if (window.DiagramNodes) window.DiagramNodes.deselectNode();
        if (window.Glows) window.Glows.deselectGlow();
        if (window.Ripples) window.Ripples.deselectRipple();
        origFlow(id);
      };
      const origAddFlow = window.DataFlows.addFlow.bind(window.DataFlows);
      window.DataFlows.addFlow = () => { origAddFlow(); if (window.HistoryManager) window.HistoryManager.recordImmediate(); };
      const origRemFlow = window.DataFlows.removeFlow.bind(window.DataFlows);
      window.DataFlows.removeFlow = (id) => { origRemFlow(id); if (window.HistoryManager) window.HistoryManager.recordImmediate(); };
      window.DataFlows._mutualHooked = true;
    }
  }

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

    const fitSelect = document.getElementById('photoFitSelect');
    const patSelect = document.getElementById('canvasPatternSelect');
    if (loadedPhoto && patSelect && patSelect.value === 'photo' && fitSelect && fitSelect.value === 'match') {
      fitSelect.value = 'cover';
      syncBackgroundUIVisibility();
    }

    syncPresetDropdownFromInputs();
    updateOrientationAndPaperUI();
    render();
    if (window.HistoryManager) window.HistoryManager.recordImmediate();
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
  }

  function buildCurrentCanvasState() {
    const patternSelect = document.getElementById('canvasPatternSelect');
    let pattern = patternSelect ? patternSelect.value : 'blueprint';

    if (pattern === 'photo' && !loadedPhoto) {
      pattern = 'blueprint';
      if (patternSelect) patternSelect.value = 'blueprint';
    }

    const widthInput = document.getElementById('canvasWidthInput');
    const heightInput = document.getElementById('canvasHeightInput');
    const fitSelect = document.getElementById('photoFitSelect');
    const fitMode = fitSelect ? fitSelect.value : 'match';

    if (pattern === 'photo' && loadedPhoto) {
      if (fitMode === 'match') {
        if (widthInput) widthInput.value = loadedPhoto.naturalWidth;
        if (heightInput) heightInput.value = loadedPhoto.naturalHeight;
        syncPresetDropdownFromInputs();
      }
      const w = Math.max(64, parseInt(widthInput ? widthInput.value : loadedPhoto.naturalWidth, 10));
      const h = Math.max(64, parseInt(heightInput ? heightInput.value : loadedPhoto.naturalHeight, 10));

      const czEl = document.getElementById('photoCropZoomSlider');
      const cxEl = document.getElementById('photoCropXSlider');
      const cyEl = document.getElementById('photoCropYSlider');

      return {
        filename: loadedPhoto.filename || 'photo_export',
        isBlankCanvas: false,
        pattern: 'photo',
        photoFit: fitMode,
        cropZoom: parseFloat(czEl ? czEl.value : 100),
        cropX: parseFloat(cxEl ? cxEl.value : 50),
        cropY: parseFloat(cyEl ? cyEl.value : 50),
        width: w,
        height: h,
        naturalWidth: loadedPhoto.naturalWidth,
        naturalHeight: loadedPhoto.naturalHeight,
        mime: loadedPhoto.mime,
        b64: loadedPhoto.b64
      };
    }

    const w = Math.max(200, parseInt(widthInput ? widthInput.value : 1280, 10));
    const h = Math.max(200, parseInt(heightInput ? heightInput.value : 720, 10));
    const gcEl = document.getElementById('canvasGridColorPicker');
    const gsEl = document.getElementById('canvasGridSizeSlider');

    return {
      filename: 'diagram_canvas',
      isBlankCanvas: true,
      pattern: pattern,
      gridColor: gcEl ? gcEl.value : '#1e293b',
      gridSize: parseFloat(gsEl ? gsEl.value : 40),
      width: w,
      height: h,
      mime: 'image/svg+xml',
      b64: ''
    };
  }

  window.buildFullSVG = function(state, overrides = {}) {
    if (!state || !window.Effects) return '';
    const includeFlows = overrides.includeFlows !== false;
    const includeGlows = overrides.includeGlows !== false;
    const includeRipples = overrides.includeRipples !== false;
    const includeNodes = overrides.includeNodes !== false;

    let svgString = window.Effects.build(state);
    if (includeRipples && window.Ripples) svgString = window.Ripples.injectIntoSVG(svgString, state);
    if (includeGlows && window.Glows) svgString = window.Glows.injectIntoSVG(svgString, state.image.width, state.image.height);
    if (includeFlows && window.DataFlows) svgString = window.DataFlows.injectIntoSVG(svgString, state);
    if (includeNodes && window.DiagramNodes) svgString = window.DiagramNodes.injectIntoSVG(svgString, state);
    return svgString;
  };

  window.serializeSVGForExport = function(rawSvg) {
    if (!rawSvg) throw new Error('SVG generation returned empty.');

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(rawSvg, 'image/svg+xml');

    const parserError = xmlDoc.getElementsByTagName('parsererror');
    if (parserError.length > 0) {
      throw new Error('XML Parsing Failed: ' + parserError[0].textContent);
    }

    const svgRoot = xmlDoc.documentElement;
    const XLINK_NS = 'http://www.w3.org/1999/xlink';

    if (!svgRoot.hasAttribute('xmlns:xlink')) {
      svgRoot.setAttribute('xmlns:xlink', XLINK_NS);
    }

    const elementsWithHref = xmlDoc.querySelectorAll('[href]');
    elementsWithHref.forEach((el) => {
      const hrefVal = el.getAttribute('href');
      if (hrefVal) {
        el.setAttributeNS(XLINK_NS, 'xlink:href', hrefVal);
      }
    });

    const serializer = new XMLSerializer();
    return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + serializer.serializeToString(svgRoot);
  };

  function getExportSVG() {
    const rawSvg = window.buildFullSVG(window.currentRenderState);
    return window.serializeSVGForExport(rawSvg);
  }

  function getCleanBaseName() {
    if (!currentImage || !currentImage.filename) return 'export';
    return currentImage.filename.includes('.') ? currentImage.filename.split('.')[0] : currentImage.filename;
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
    loadedPhoto = imgData;
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

    const dropLabel = document.getElementById('uploadDropLabel');
    const dropMeta = document.getElementById('uploadPhotoMeta');
    if (dropLabel) dropLabel.innerText = '📷 ' + imgData.filename;
    if (dropMeta) dropMeta.innerText = 'Native: ' + imgData.naturalWidth + ' \u00d7 ' + imgData.naturalHeight + 'px (Click to replace)';

    syncBackgroundUIVisibility();
    render();
    if (window.HistoryManager) window.HistoryManager.recordImmediate();
  });

  // Record Undo History whenever a canvas drag completes
  document.getElementById('previewBox')?.addEventListener('pointerup', () => {
    if (window.HistoryManager) window.HistoryManager.recordDebounced(120);
  });

  document.getElementById('btnOrientLandscape')?.addEventListener('click', () => applyCanvasDimensionSwap('landscape'));
  document.getElementById('btnOrientPortrait')?.addEventListener('click', () => applyCanvasDimensionSwap('portrait'));
  document.getElementById('btnOrientSwap')?.addEventListener('click', () => applyCanvasDimensionSwap('swap'));

  document.getElementById('chkSnapToGrid')?.addEventListener('change', () => {
    if (window.Stage) window.Stage.syncOverlayBounds(window.Stage.canvasWidth, window.Stage.canvasHeight);
    if (window.HistoryManager) window.HistoryManager.recordImmediate();
  });

  document.getElementById('btnSyncSnapToBgGrid')?.addEventListener('click', () => {
    const bgGridVal = parseFloat(document.getElementById('canvasGridSizeNum')?.value || 40) || 40;
    const snapSlider = document.getElementById('snapGridSizeSlider');
    const snapNum = document.getElementById('snapGridSizeNum');
    if (snapSlider) snapSlider.value = bgGridVal;
    if (snapNum) snapNum.value = bgGridVal;
    const chk = document.getElementById('chkSnapToGrid');
    if (chk) chk.checked = true;
    if (window.Stage) window.Stage.syncOverlayBounds(window.Stage.canvasWidth, window.Stage.canvasHeight);
    if (window.HistoryManager) window.HistoryManager.recordImmediate();
  });

  window.Stage.onPhotoCropDrag = (dx, dy) => {
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

        // If user selected a Paper Size, auto-select 300 DPI in Still Export Studio so it prints at 300 DPI by default
        const dpiSel = document.getElementById('stillDpiSelect');
        if (dpiSel && paperSpecs[pw + 'x' + ph]) {
          dpiSel.value = '3.125';
        }

        const fitSelect = document.getElementById('photoFitSelect');
        const patSelect = document.getElementById('canvasPatternSelect');
        if (loadedPhoto && patSelect && patSelect.value === 'photo' && fitSelect && fitSelect.value === 'match') {
          fitSelect.value = 'cover';
          syncBackgroundUIVisibility();
        }
        updateOrientationAndPaperUI();
        render();
        if (window.HistoryManager) window.HistoryManager.recordImmediate();
      }
    });
  }

  const patSel = document.getElementById('canvasPatternSelect');
  if (patSel) {
    patSel.addEventListener('change', (e) => {
      if (e.target.value === 'photo' && !loadedPhoto) {
        document.getElementById('fileInput')?.click();
      }
      syncBackgroundUIVisibility();
      render();
      if (window.HistoryManager) window.HistoryManager.recordImmediate();
    });
  }

  const fitSel = document.getElementById('photoFitSelect');
  if (fitSel) {
    fitSel.addEventListener('change', () => {
      syncBackgroundUIVisibility();
      render();
      if (window.HistoryManager) window.HistoryManager.recordImmediate();
    });
  }

  const btnMatch = document.getElementById('btnMatchPhotoSize');
  if (btnMatch) {
    btnMatch.addEventListener('click', () => {
      if (!loadedPhoto) return;
      document.getElementById('canvasWidthInput').value = loadedPhoto.naturalWidth;
      document.getElementById('canvasHeightInput').value = loadedPhoto.naturalHeight;
      document.getElementById('photoFitSelect').value = 'match';
      syncPresetDropdownFromInputs();
      updateOrientationAndPaperUI();
      syncBackgroundUIVisibility();
      render();
      if (window.HistoryManager) window.HistoryManager.recordImmediate();
    });
  }

  ['canvasWidthInput', 'canvasHeightInput'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        syncPresetDropdownFromInputs();
        updateOrientationAndPaperUI();
        const fitSelect = document.getElementById('photoFitSelect');
        const patSelect = document.getElementById('canvasPatternSelect');
        if (loadedPhoto && patSelect && patSelect.value === 'photo' && fitSelect && fitSelect.value === 'match') {
          fitSelect.value = 'cover';
          syncBackgroundUIVisibility();
        }
        render();
        if (window.HistoryManager) window.HistoryManager.recordDebounced();
      });
    }
  });

  ['canvasBgColorPicker', 'canvasGridColorPicker'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', render);
      el.addEventListener('change', () => {
        render();
        if (window.HistoryManager) window.HistoryManager.recordImmediate();
      });
    }
  });

  const bgTrans = document.getElementById('canvasBgTransparent');
  if (bgTrans) {
    bgTrans.addEventListener('change', () => {
      render();
      if (window.HistoryManager) window.HistoryManager.recordImmediate();
    });
  }

  function syncVal(id, val) {
    const el = document.getElementById(id + 'Slider');
    const num = document.getElementById(id + 'Num');
    if (el) el.value = val;
    if (num) num.value = val;
  }

  document.getElementById('btnModeStart')?.addEventListener('click', () => {
    if (window.DiagramNodes) window.DiagramNodes.deselectNode();
    if (window.DataFlows) window.DataFlows.deselectFlow();
    if (window.Glows) window.Glows.deselectGlow();
    if (window.Ripples) window.Ripples.deselectRipple();
    if (window.Stage) Stage.setActive('start');
  });

  document.getElementById('btnModeEnd')?.addEventListener('click', () => {
    if (window.DiagramNodes) window.DiagramNodes.deselectNode();
    if (window.DataFlows) window.DataFlows.deselectFlow();
    if (window.Glows) window.Glows.deselectGlow();
    if (window.Ripples) window.Ripples.deselectRipple();
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
        if (window.HistoryManager) window.HistoryManager.recordDebounced();
      });
      num.addEventListener('input', () => {
        slider.value = num.value;
        render();
        if (window.HistoryManager) window.HistoryManager.recordDebounced();
      });
    }
  });

  const camMotionSel = document.getElementById('cameraMotionSelect');
  if (camMotionSel) {
    camMotionSel.addEventListener('change', (e) => {
      const v = e.target.value;
      document.getElementById('panel-cam-static').style.display = v === 'static' ? 'block' : 'none';
      document.getElementById('panel-cam-kenburns').style.display = v === 'ken-burns' ? 'block' : 'none';
      document.getElementById('panel-cam-handheld').style.display = v === 'handheld-drift' ? 'block' : 'none';
      document.getElementById('panel-cam-perspective').style.display = v === 'perspective-tilt' ? 'block' : 'none';
      render();
      if (window.HistoryManager) window.HistoryManager.recordImmediate();
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
      if (window.HistoryManager) window.HistoryManager.recordImmediate();
    });
  }

  const chkFrame = document.getElementById('chkModuleFrame');
  if (chkFrame) {
    chkFrame.addEventListener('change', (e) => {
      const group = document.getElementById('groupFrame');
      if (group) group.style.display = e.target.checked ? 'flex' : 'none';
      render();
      if (window.HistoryManager) window.HistoryManager.recordImmediate();
    });
  }

  document.querySelectorAll('#settingsPanel select, #settingsPanel input[type="checkbox"], #settingsPanel input[type="color"]').forEach((el) => {
    el.addEventListener('change', () => {
      render();
      if (window.HistoryManager) window.HistoryManager.recordImmediate();
    });
    if (el.type === 'color') el.addEventListener('input', render);
  });

  window.syncUIAfterHistoryRestore = function() {
    syncBackgroundUIVisibility();
    updateOrientationAndPaperUI();
    const cm = document.getElementById('cameraMotionSelect')?.value || 'static';
    document.getElementById('panel-cam-static').style.display = cm === 'static' ? 'block' : 'none';
    document.getElementById('panel-cam-kenburns').style.display = cm === 'ken-burns' ? 'block' : 'none';
    document.getElementById('panel-cam-handheld').style.display = cm === 'handheld-drift' ? 'block' : 'none';
    document.getElementById('panel-cam-perspective').style.display = cm === 'perspective-tilt' ? 'block' : 'none';

    const ef = document.getElementById('effectSelect')?.value || 'none';
    document.getElementById('panel-opt-focus').style.display = ef === 'focus-pull' ? 'block' : 'none';
    document.getElementById('panel-opt-tiltshift').style.display = ef === 'tilt-shift' ? 'block' : 'none';
    document.getElementById('panel-opt-motionblur').style.display = ef === 'motion-blur' ? 'block' : 'none';

    const fr = document.getElementById('chkModuleFrame')?.checked;
    const grp = document.getElementById('groupFrame');
    if (grp) grp.style.display = fr ? 'flex' : 'none';

    render();
  };

  function getNumVal(id, fallback) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return isNaN(v) ? fallback : v;
  }

  function render() {
    currentImage = buildCurrentCanvasState();
    if (!currentImage) return;

    const dim = document.getElementById('imgDimensions');
    if (dim) {
      dim.innerHTML = currentImage.width + ' &times; ' + currentImage.height + (currentImage.isBlankCanvas ? ' (Canvas)' : '');
    }

    if (window.Stage) {
      window.Stage.syncOverlayBounds(currentImage.width, currentImage.height);
    }

    const camSel = document.getElementById('cameraMotionSelect');
    const camMode = camSel ? camSel.value : 'static';
    let sx = 50;
    let sy = 50;
    let sz = 1.0;
    let ex = 60;
    let ey = 40;
    let ez = 1.3;
    let pSway = 1.4;
    let pBreathe = 1.8;
    let pTiltX = 0;
    let pTiltY = 0;

    if (camMode === 'static') {
      sx = ex = getNumVal('staticXSlider', 50);
      sy = ey = getNumVal('staticYSlider', 50);
      sz = ez = getNumVal('staticZoomSlider', 1.0);
    } else if (camMode === 'ken-burns') {
      sx = getNumVal('startXSlider', 50);
      sy = getNumVal('startYSlider', 50);
      sz = getNumVal('startXZoomSlider', 1.0);
      ex = getNumVal('endXSlider', 60);
      ey = getNumVal('endYSlider', 40);
      ez = getNumVal('endXZoomSlider', 1.3);
    } else if (camMode === 'handheld-drift') {
      sx = ex = getNumVal('handXSlider', 50);
      sy = ey = getNumVal('handYSlider', 50);
      sz = ez = getNumVal('handZoomSlider', 1.1);
      pSway = getNumVal('driftSwaySlider', 1.4);
      pBreathe = getNumVal('driftBreatheSlider', 1.8);
    } else if (camMode === 'perspective-tilt') {
      sx = ex = getNumVal('perspXSlider', 50);
      sy = ey = getNumVal('perspYSlider', 50);
      sz = ez = getNumVal('perspZoomSlider', 1.0);
      pTiltX = getNumVal('perspTiltXSlider', 25);
      pTiltY = getNumVal('perspTiltYSlider', 0);
    }

    const bgPick = document.getElementById('canvasBgColorPicker');
    const bgTr = document.getElementById('canvasBgTransparent');
    const loopSel = document.getElementById('loopSelect');
    const optSel = document.getElementById('effectSelect');
    const tsShapeSel = document.getElementById('tsShapeSelect');
    const frChk = document.getElementById('chkModuleFrame');
    const frStyleSel = document.getElementById('frameStyleSelect');

    const state = {
      image: currentImage,
      duration: getNumVal('durationSlider', 7),
      loop: loopSel ? loopSel.value : 'once',
      camera: {
        bgColor: bgPick ? bgPick.value : '#0d1117',
        bgTransparent: bgTr ? bgTr.checked : false,
        motion: camMode,
        startX: sx,
        startY: sy,
        startZoom: sz,
        endX: ex,
        endY: ey,
        endZoom: ez,
        sway: pSway,
        breathe: pBreathe,
        tiltX: pTiltX,
        tiltY: pTiltY
      },
      optical: {
        type: optSel ? optSel.value : 'none',
        startBlur: getNumVal('startBlurSlider', 0),
        endBlur: getNumVal('endBlurSlider', 0),
        focusDur: getNumVal('focusDurSlider', 4),
        tsShape: tsShapeSel ? tsShapeSel.value : 'horizontal',
        tsPosX: getNumVal('tsPosXSlider', 50),
        tsPos: getNumVal('tsPosSlider', 50),
        tsWidth: getNumVal('tsWidthSlider', 20),
        tsBlur: getNumVal('tsBlurSlider', 12),
        mbInt: getNumVal('mbIntSlider', 15),
        mbAng: getNumVal('mbAngSlider', 0)
      },
      overlays: {
        frame: frChk ? frChk.checked : false,
        frameStyle: frStyleSel ? frStyleSel.value : 'walnut',
        frameDepth: getNumVal('frameDepthSlider', 40)
      }
    };

    window.currentRenderState = state;

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
      const activeNode = window.DiagramNodes.list.find((n) => n.id === window.DiagramNodes.activeId);
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
      const bgTr = document.getElementById('canvasBgTransparent');
      const bgPick = document.getElementById('canvasBgColorPicker');
      const isTransparent = bgTr ? bgTr.checked : false;
      const bgColor = isTransparent ? 'transparent' : (bgPick ? bgPick.value : '#0d1117');
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

  if (window.DiagramNodes) window.DiagramNodes.init();
  if (window.DataFlows) window.DataFlows.init();
  if (window.Glows) window.Glows.init();
  if (window.Ripples) window.Ripples.init();
  wireModuleHooks();
  syncBackgroundUIVisibility();
  updateOrientationAndPaperUI();
  if (camMotionSel) camMotionSel.dispatchEvent(new Event('change'));
  if (effSel) effSel.dispatchEvent(new Event('change'));
  if (chkFrame) chkFrame.dispatchEvent(new Event('change'));
  if (window.HistoryManager) window.HistoryManager.init();
});