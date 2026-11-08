/**
 * Snapshot-Based Undo / Redo Manager (`window.HistoryManager`)
 *
 * Layer 3 (Operational Snapshot Engine & Stack Management):
 *   - `captureSnapshot()`, `applySnapshot(snapStr)`, `recordImmediate()`,
 *     `recordDebounced(delayMs)`, `undo()`, `redo()`
 *   - Uses `SceneState`, `ControlStateAdaptor`, and component `getState()` / `setState()` APIs.
 *
 * Layer 1 (Toolbar Undo/Redo Button & Shortcut Bindings):
 *   - `init()`, `updateButtonsUI()`
 */
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
  ],

  // =========================================================================
  // Layer 3: Operational Snapshot & Stack Management
  // =========================================================================

  captureSnapshot() {
    let controls = {};
    if (window.ControlStateAdaptor && window.SceneState) {
      window.ControlStateAdaptor.syncFromDOM(this.trackedControlIds);
      controls = window.SceneState.getControlsSnapshot(this.trackedControlIds);
    } else {
      this.trackedControlIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          controls[id] = el.type === 'checkbox' ? el.checked : el.value;
        }
      });
    }

    const loadedPhoto = (window.SceneState && typeof window.SceneState.getLoadedPhoto === 'function')
      ? window.SceneState.getLoadedPhoto()
      : (typeof window.getLoadedPhoto === 'function' ? window.getLoadedPhoto() : null);

    const presetState = (window.NodePresets && typeof window.NodePresets.getState === 'function')
      ? window.NodePresets.getState()
      : {
          preset: window.NodePresets ? JSON.parse(JSON.stringify(window.NodePresets.preset)) : null,
          autoApplyToNewNodes: document.getElementById('chkAutoApplyPreset')?.checked ?? true
        };

    const nodeState = (window.DiagramNodes && typeof window.DiagramNodes.getState === 'function')
      ? window.DiagramNodes.getState()
      : {
          nodes: window.DiagramNodes ? window.DiagramNodes.list : [],
          nodesCounter: window.DiagramNodes ? window.DiagramNodes.counter : 0
        };

    const flowState = (window.DataFlows && typeof window.DataFlows.getState === 'function')
      ? window.DataFlows.getState()
      : {
          flows: window.DataFlows ? window.DataFlows.list : [],
          flowsCounter: window.DataFlows ? window.DataFlows.counter : 0
        };

    const glowState = (window.Glows && typeof window.Glows.getState === 'function')
      ? window.Glows.getState()
      : {
          glows: window.Glows ? window.Glows.list : [],
          glowsCounter: window.Glows ? window.Glows.counter : 0
        };

    const rippleState = (window.Ripples && typeof window.Ripples.getState === 'function')
      ? window.Ripples.getState()
      : {
          ripples: window.Ripples ? window.Ripples.list : [],
          ripplesCounter: window.Ripples ? window.Ripples.counter : 0
        };

    return JSON.stringify({
      controls: controls,
      loadedPhoto: loadedPhoto,
      presets: presetState.preset,
      autoApplyPreset: presetState.autoApplyToNewNodes,
      nodes: nodeState.nodes,
      nodesCounter: nodeState.nodesCounter,
      flows: flowState.flows,
      flowsCounter: flowState.flowsCounter,
      glows: glowState.glows,
      glowsCounter: glowState.glowsCounter,
      ripples: rippleState.ripples,
      ripplesCounter: rippleState.ripplesCounter
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

      if (typeof window.setLoadedPhoto === 'function') {
        window.setLoadedPhoto(data.loadedPhoto || null);
      } else if (window.SceneState) {
        window.SceneState.setLoadedPhoto(data.loadedPhoto || null);
      }

      if (data.controls) {
        if (window.ControlStateAdaptor) {
          window.ControlStateAdaptor.syncToDOM(data.controls);
        } else {
          Object.keys(data.controls).forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
              if (el.type === 'checkbox') el.checked = !!data.controls[id];
              else el.value = data.controls[id];
            }
          });
        }
      }

      const autoChk = document.getElementById('chkAutoApplyPreset');
      if (autoChk && data.autoApplyPreset !== undefined) {
        autoChk.checked = !!data.autoApplyPreset;
      }

      if (data.presets && window.NodePresets) {
        if (typeof window.NodePresets.setState === 'function') {
          window.NodePresets.setState({
            preset: data.presets,
            autoApplyToNewNodes: data.autoApplyPreset !== undefined ? !!data.autoApplyPreset : true
          });
        } else {
          window.NodePresets.preset = data.presets;
        }
        window.NodePresets.syncAllRowsUI();
      } else if (window.NodePresets) {
        if (typeof window.NodePresets.resetToDefaults === 'function') {
          window.NodePresets.resetToDefaults();
        }
        if (typeof window.NodePresets.syncAllRowsUI === 'function') {
          window.NodePresets.syncAllRowsUI();
        }
      }

      if (window.DiagramNodes) {
        if (typeof window.DiagramNodes.setState === 'function') {
          window.DiagramNodes.setState({
            nodes: data.nodes || [],
            nodesCounter: data.nodesCounter || 0
          });
        } else {
          window.DiagramNodes.list = data.nodes || [];
          window.DiagramNodes.counter = data.nodesCounter || 0;
        }
        window.DiagramNodes.deselectNode();
      }

      if (window.DataFlows) {
        if (typeof window.DataFlows.setState === 'function') {
          window.DataFlows.setState({
            flows: data.flows || [],
            flowsCounter: data.flowsCounter || 0
          });
        } else {
          window.DataFlows.list = data.flows || [];
          window.DataFlows.counter = data.flowsCounter || 0;
        }
        window.DataFlows.deselectFlow();
      }

      if (window.Glows) {
        if (typeof window.Glows.setState === 'function') {
          window.Glows.setState({
            glows: data.glows || [],
            glowsCounter: data.glowsCounter || 0
          });
        } else {
          window.Glows.list = data.glows || [];
          window.Glows.counter = data.glowsCounter || 0;
        }
        window.Glows.deselectGlow();
      }

      if (window.Ripples) {
        if (typeof window.Ripples.setState === 'function') {
          window.Ripples.setState({
            ripples: data.ripples || [],
            ripplesCounter: data.ripplesCounter || 0
          });
        } else {
          window.Ripples.list = data.ripples || [];
          window.Ripples.counter = data.ripplesCounter || 0;
        }
        window.Ripples.deselectRipple();
      }

      if (typeof window.syncUIAfterHistoryRestore === 'function') {
        window.syncUIAfterHistoryRestore();
      } else if (window.AppCoordinator && typeof window.AppCoordinator.requestRender === 'function') {
        window.AppCoordinator.requestRender();
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

  // =========================================================================
  // Layer 1: UI Presentation & Shortcut Bindings
  // =========================================================================

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

    setTimeout(() => {
      this.recordImmediate();
    }, 80);
  },

  updateButtonsUI() {
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    if (btnUndo) btnUndo.disabled = this.undoStack.length <= 1;
    if (btnRedo) btnRedo.disabled = this.redoStack.length === 0;
  }
};
