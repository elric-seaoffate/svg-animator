/**
 * Layer 3: Operational Scene State & DOM Control State Adaptor
 *
 * Owns the canonical operational state for canvas dimensions, background photo,
 * optical filters, camera rig, 3D mitered frame, and grid snapping settings,
 * plus the master SVG compilation pipeline (`buildFullSVG`, `serializeSVGForExport`).
 *
 * `ControlStateAdaptor` keeps the 95 tracked DOM controls and `SceneState.controls`
 * synchronized so operational modules never need to query DOM inputs directly.
 */
(function() {
  const TRACKED_CONTROL_IDS = [
    'canvasPatternSelect',
    'canvasPresetSelect',
    'canvasWidthInput',
    'canvasHeightInput',
    'photoFitSelect',
    'photoCropZoomSlider',
    'photoCropZoomNum',
    'photoCropXSlider',
    'photoCropXNum',
    'photoCropYSlider',
    'photoCropYNum',
    'canvasBgColorPicker',
    'canvasBgTransparent',
    'canvasGridColorPicker',
    'canvasGridSizeSlider',
    'canvasGridSizeNum',
    'chkSnapToGrid',
    'snapGridSizeSlider',
    'snapGridSizeNum',
    'loopSelect',
    'durationSlider',
    'durationNum',
    'cameraMotionSelect',
    'camLoopSelect',
    'camDurationSlider',
    'camDurationNum',
    'staticZoomSlider',
    'staticZoomNum',
    'staticXSlider',
    'staticXNum',
    'staticYSlider',
    'staticYNum',
    'startXZoomSlider',
    'startXZoomNum',
    'startXSlider',
    'startXNum',
    'startYSlider',
    'startYNum',
    'endXZoomSlider',
    'endXZoomNum',
    'endXSlider',
    'endXNum',
    'endYSlider',
    'endYNum',
    'handZoomSlider',
    'handZoomNum',
    'handXSlider',
    'handXNum',
    'handYSlider',
    'handYNum',
    'driftSwaySlider',
    'driftSwayNum',
    'driftBreatheSlider',
    'driftBreatheNum',
    'perspZoomSlider',
    'perspZoomNum',
    'perspXSlider',
    'perspXNum',
    'perspYSlider',
    'perspYNum',
    'perspTiltXSlider',
    'perspTiltXNum',
    'perspTiltYSlider',
    'perspTiltYNum',
    'effectSelect',
    'startBlurSlider',
    'startBlurNum',
    'endBlurSlider',
    'endBlurNum',
    'focusDurSlider',
    'focusDurNum',
    'tsShapeSelect',
    'tsPosXSlider',
    'tsPosXNum',
    'tsPosSlider',
    'tsPosNum',
    'tsWidthSlider',
    'tsWidthNum',
    'tsBlurSlider',
    'tsBlurNum',
    'mbIntSlider',
    'mbIntNum',
    'mbAngSlider',
    'mbAngNum',
    'chkModuleFrame',
    'frameStyleSelect',
    'frameDepthSlider',
    'frameDepthNum',
    'chkFrameLighting',
    'frameLightDirSelect',
    'frameLightIntSlider',
    'frameLightIntNum',
    'frameShadowSlider',
    'frameShadowNum',
    'chkFrameFillet'
  ];

  const PAPER_SPECS = {
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

  window.SceneState = {
    trackedControlIds: TRACKED_CONTROL_IDS.slice(),
    paperSpecs: PAPER_SPECS,
    loadedPhoto: null,
    currentImage: null,
    currentRenderState: null,
    controls: {},

    getLoadedPhoto() {
      return this.loadedPhoto;
    },

    setLoadedPhoto(photoObj) {
      this.loadedPhoto = photoObj || null;
      return this.loadedPhoto;
    },

    setControl(id, value) {
      if (!id) return;
      this.controls[id] = value;
    },

    setControls(controlsMap) {
      if (!controlsMap || typeof controlsMap !== 'object') return;
      Object.keys(controlsMap).forEach((id) => {
        this.controls[id] = controlsMap[id];
      });
    },

    getControl(id, fallback) {
      if (Object.prototype.hasOwnProperty.call(this.controls, id) && this.controls[id] !== undefined) {
        return this.controls[id];
      }
      return fallback;
    },

    getNumControl(id, fallback) {
      const raw = this.getControl(id, undefined);
      if (raw === undefined || raw === null || raw === '') return fallback;
      const num = parseFloat(raw);
      return isNaN(num) ? fallback : num;
    },

    getBoolControl(id, fallback) {
      const raw = this.getControl(id, undefined);
      if (raw === undefined || raw === null) return !!fallback;
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return !!raw;
    },

    getControlsSnapshot(controlIds) {
      const ids = Array.isArray(controlIds) && controlIds.length > 0 ? controlIds : this.trackedControlIds;
      const out = {};
      ids.forEach((id) => {
        if (Object.prototype.hasOwnProperty.call(this.controls, id)) {
          out[id] = this.controls[id];
        }
      });
      return out;
    },

    getSnapConfig() {
      const cw = (this.currentImage && this.currentImage.width) || this.getNumControl('canvasWidthInput', 1280) || 1280;
      const ch = (this.currentImage && this.currentImage.height) || this.getNumControl('canvasHeightInput', 720) || 720;
      return {
        enabled: this.getBoolControl('chkSnapToGrid', false),
        gridSizePx: this.getNumControl('snapGridSizeNum', 20) || 20,
        canvasWidth: cw,
        canvasHeight: ch
      };
    },

    buildCurrentCanvasState() {
      let pattern = this.getControl('canvasPatternSelect', 'blueprint') || 'blueprint';
      if (pattern === 'photo' && !this.loadedPhoto) {
        pattern = 'blueprint';
        this.controls.canvasPatternSelect = 'blueprint';
      }

      const fitMode = this.getControl('photoFitSelect', 'match') || 'match';

      if (pattern === 'photo' && this.loadedPhoto) {
        if (fitMode === 'match') {
          this.controls.canvasWidthInput = String(this.loadedPhoto.naturalWidth);
          this.controls.canvasHeightInput = String(this.loadedPhoto.naturalHeight);
        }
        const w = Math.max(64, parseInt(this.getControl('canvasWidthInput', this.loadedPhoto.naturalWidth), 10) || this.loadedPhoto.naturalWidth);
        const h = Math.max(64, parseInt(this.getControl('canvasHeightInput', this.loadedPhoto.naturalHeight), 10) || this.loadedPhoto.naturalHeight);

        this.currentImage = {
          filename: this.loadedPhoto.filename || 'photo_export',
          isBlankCanvas: false,
          pattern: 'photo',
          photoFit: fitMode,
          cropZoom: this.getNumControl('photoCropZoomSlider', 100),
          cropX: this.getNumControl('photoCropXSlider', 50),
          cropY: this.getNumControl('photoCropYSlider', 50),
          width: w,
          height: h,
          naturalWidth: this.loadedPhoto.naturalWidth,
          naturalHeight: this.loadedPhoto.naturalHeight,
          mime: this.loadedPhoto.mime,
          b64: this.loadedPhoto.b64
        };
        return this.currentImage;
      }

      const w = Math.max(200, parseInt(this.getControl('canvasWidthInput', 1280), 10) || 1280);
      const h = Math.max(200, parseInt(this.getControl('canvasHeightInput', 720), 10) || 720);

      this.currentImage = {
        filename: 'diagram_canvas',
        isBlankCanvas: true,
        pattern: pattern,
        gridColor: this.getControl('canvasGridColorPicker', '#1e293b') || '#1e293b',
        gridSize: this.getNumControl('canvasGridSizeSlider', 40),
        width: w,
        height: h,
        mime: 'image/svg+xml',
        b64: ''
      };
      return this.currentImage;
    },

    buildRenderState() {
      const currentImage = this.buildCurrentCanvasState();
      if (!currentImage) return null;

      const camMode = this.getControl('cameraMotionSelect', 'static') || 'static';
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
        sx = ex = this.getNumControl('staticXSlider', 50);
        sy = ey = this.getNumControl('staticYSlider', 50);
        sz = ez = this.getNumControl('staticZoomSlider', 1.0);
      } else if (camMode === 'ken-burns') {
        sx = this.getNumControl('startXSlider', 50);
        sy = this.getNumControl('startYSlider', 50);
        sz = this.getNumControl('startXZoomSlider', 1.0);
        ex = this.getNumControl('endXSlider', 60);
        ey = this.getNumControl('endYSlider', 40);
        ez = this.getNumControl('endXZoomSlider', 1.3);
      } else if (camMode === 'handheld-drift') {
        sx = ex = this.getNumControl('handXSlider', 50);
        sy = ey = this.getNumControl('handYSlider', 50);
        sz = ez = this.getNumControl('handZoomSlider', 1.1);
        pSway = this.getNumControl('driftSwaySlider', 1.4);
        pBreathe = this.getNumControl('driftBreatheSlider', 1.8);
      } else if (camMode === 'perspective-tilt') {
        sx = ex = this.getNumControl('perspXSlider', 50);
        sy = ey = this.getNumControl('perspYSlider', 50);
        sz = ez = this.getNumControl('perspZoomSlider', 1.0);
        pTiltX = this.getNumControl('perspTiltXSlider', 25);
        pTiltY = this.getNumControl('perspTiltYSlider', 0);
      }

      const state = {
        image: currentImage,
        duration: this.getNumControl('durationSlider', 7),
        loop: this.getControl('loopSelect', 'once') || 'once',
        camera: {
          bgColor: this.getControl('canvasBgColorPicker', '#0d1117') || '#0d1117',
          bgTransparent: this.getBoolControl('canvasBgTransparent', false),
          motion: camMode,
          camDuration: this.getNumControl('camDurationSlider', 7),
          camLoop: this.getControl('camLoopSelect', 'once') || 'once',
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
          type: this.getControl('effectSelect', 'none') || 'none',
          startBlur: this.getNumControl('startBlurSlider', 0),
          endBlur: this.getNumControl('endBlurSlider', 0),
          focusDur: this.getNumControl('focusDurSlider', 4),
          tsShape: this.getControl('tsShapeSelect', 'horizontal') || 'horizontal',
          tsPosX: this.getNumControl('tsPosXSlider', 50),
          tsPos: this.getNumControl('tsPosSlider', 50),
          tsWidth: this.getNumControl('tsWidthSlider', 20),
          tsBlur: this.getNumControl('tsBlurSlider', 12),
          mbInt: this.getNumControl('mbIntSlider', 15),
          mbAng: this.getNumControl('mbAngSlider', 0)
        },
        overlays: {
          frame: this.getBoolControl('chkModuleFrame', false),
          frameStyle: this.getControl('frameStyleSelect', 'walnut') || 'walnut',
          frameDepth: this.getNumControl('frameDepthSlider', 44),
          frameLighting: this.getBoolControl('chkFrameLighting', true),
          frameLightDir: this.getControl('frameLightDirSelect', 'tl') || 'tl',
          frameLightInt: this.getNumControl('frameLightIntSlider', 70),
          frameShadow: this.getNumControl('frameShadowSlider', 0.55),
          frameFillet: this.getBoolControl('chkFrameFillet', true)
        }
      };

      this.currentRenderState = state;
      window.currentRenderState = state;
      return state;
    },

    buildFullSVG(state, overrides = {}) {
      if (!state || !window.Effects) return '';
      const includeFlows = overrides.includeFlows !== false;
      const includeGlows = overrides.includeGlows !== false;
      const includeRipples = overrides.includeRipples !== false;
      const includeImages = overrides.includeImages !== false;
      const includeNodes = overrides.includeNodes !== false;

      let svgString = window.Effects.build(state);
      if (includeRipples && window.Ripples) svgString = window.Ripples.injectIntoSVG(svgString, state);
      if (includeGlows && window.Glows) svgString = window.Glows.injectIntoSVG(svgString, state.image.width, state.image.height);
      if (includeFlows && window.DataFlows) svgString = window.DataFlows.injectIntoSVG(svgString, state);
      if (includeImages && window.ImageObjects) svgString = window.ImageObjects.injectIntoSVG(svgString, state);
      if (includeNodes && window.DiagramNodes) svgString = window.DiagramNodes.injectIntoSVG(svgString, state);
      return svgString;
    },

    serializeSVGForExport(rawSvg) {
      if (!rawSvg) throw new Error('SVG generation returned empty.');
      if (typeof window !== 'undefined' && window.SVGExportAdapter && typeof window.SVGExportAdapter.serialize === 'function') {
        return window.SVGExportAdapter.serialize(rawSvg);
      }
      throw new Error('SVG export serialization requires SVGExportAdapter in browser environments.');
    }
  };

  window.ControlStateAdaptor = {
    syncFromDOM(controlIds) {
      const ids = Array.isArray(controlIds) && controlIds.length > 0
        ? controlIds
        : window.SceneState.trackedControlIds;

      const snapshot = {};
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          const val = el.type === 'checkbox' ? el.checked : el.value;
          window.SceneState.setControl(id, val);
          snapshot[id] = val;
        }
      });

      const autoChk = document.getElementById('chkAutoApplyPreset');
      if (autoChk) {
        window.SceneState.setControl('chkAutoApplyPreset', autoChk.checked);
      }

      return snapshot;
    },

    syncToDOM(controlsMap) {
      const map = controlsMap || window.SceneState.controls;
      if (!map || typeof map !== 'object') return;

      Object.keys(map).forEach((id) => {
        window.SceneState.setControl(id, map[id]);
        const el = document.getElementById(id);
        if (el) {
          if (el.type === 'checkbox') el.checked = !!map[id];
          else el.value = map[id];
        }
      });
    },

    setPairValue(baseId, val) {
      const sliderId = baseId + 'Slider';
      const numId = baseId + 'Num';
      window.SceneState.setControl(sliderId, val);
      window.SceneState.setControl(numId, val);
      const sEl = document.getElementById(sliderId);
      const nEl = document.getElementById(numId);
      if (sEl) sEl.value = val;
      if (nEl) nEl.value = val;
    }
  };
})();
