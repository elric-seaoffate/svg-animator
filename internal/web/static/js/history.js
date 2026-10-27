window.HistoryManager = {
  undoStack: [],
  redoStack: [],
  maxDepth: 50,
  isRestoring: false,
  debounceTimer: null,
  _initialized: false,

  trackedControlIds: [
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
    'frameDepthNum'
  ],

  init() {
    if (this._initialized) return;
    this._initialized = true;

    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    if (btnUndo) btnUndo.addEventListener('click', () => this.undo());
    if (btnRedo) btnRedo.addEventListener('click', () => this.redo());

    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement ? document.activeElement.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        const type = document.activeElement.type;
        if (type === 'text') return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        this.redo();
      }
    });

    // Record initial baseline state once the app is ready
    setTimeout(() => {
      this.recordImmediate();
    }, 80);
  },

  captureSnapshot() {
    const controls = {};
    this.trackedControlIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        controls[id] = el.type === 'checkbox' ? el.checked : el.value;
      }
    });

    return JSON.stringify({
      controls: controls,
      nodes: window.DiagramNodes ? window.DiagramNodes.list : [],
      nodesCounter: window.DiagramNodes ? window.DiagramNodes.counter : 0,
      flows: window.DataFlows ? window.DataFlows.list : [],
      flowsCounter: window.DataFlows ? window.DataFlows.counter : 0,
      glows: window.Glows ? window.Glows.list : [],
      glowsCounter: window.Glows ? window.Glows.counter : 0,
      ripples: window.Ripples ? window.Ripples.list : [],
      ripplesCounter: window.Ripples ? window.Ripples.counter : 0
    });
  },

  recordImmediate() {
    if (this.isRestoring) return;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    const snap = this.captureSnapshot();
    if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === snap) {
      return;
    }
    this.undoStack.push(snap);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.updateButtonsUI();
  },

  recordDebounced(delayMs = 280) {
    if (this.isRestoring) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.recordImmediate();
    }, delayMs);
  },

  applySnapshot(snapStr) {
    if (!snapStr) return;
    this.isRestoring = true;
    try {
      const data = JSON.parse(snapStr);
      if (data.controls) {
        Object.keys(data.controls).forEach((id) => {
          const el = document.getElementById(id);
          if (el) {
            if (el.type === 'checkbox') el.checked = !!data.controls[id];
            else el.value = data.controls[id];
          }
        });
      }

      if (window.DiagramNodes) {
        window.DiagramNodes.list = data.nodes || [];
        window.DiagramNodes.counter = data.nodesCounter || 0;
        window.DiagramNodes.deselectNode();
      }
      if (window.DataFlows) {
        window.DataFlows.list = data.flows || [];
        window.DataFlows.counter = data.flowsCounter || 0;
        window.DataFlows.deselectFlow();
      }
      if (window.Glows) {
        window.Glows.list = data.glows || [];
        window.Glows.counter = data.glowsCounter || 0;
        window.Glows.deselectGlow();
      }
      if (window.Ripples) {
        window.Ripples.list = data.ripples || [];
        window.Ripples.counter = data.ripplesCounter || 0;
        window.Ripples.deselectRipple();
      }

      if (typeof window.syncUIAfterHistoryRestore === 'function') {
        window.syncUIAfterHistoryRestore();
      } else if (typeof window.triggerAppRender === 'function') {
        window.triggerAppRender();
      }
    } catch (err) {
      console.error('History restore error:', err);
    } finally {
      this.isRestoring = false;
      this.updateButtonsUI();
    }
  },

  undo() {
    if (this.undoStack.length <= 1) return;
    const current = this.undoStack.pop();
    this.redoStack.push(current);
    const prev = this.undoStack[this.undoStack.length - 1];
    this.applySnapshot(prev);
  },

  redo() {
    if (this.redoStack.length === 0) return;
    const next = this.redoStack.pop();
    this.undoStack.push(next);
    this.applySnapshot(next);
  },

  updateButtonsUI() {
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    if (btnUndo) btnUndo.disabled = this.undoStack.length <= 1;
    if (btnRedo) btnRedo.disabled = this.redoStack.length === 0;
  }
};