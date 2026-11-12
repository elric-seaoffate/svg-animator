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
    }

    const loadedPhoto = (window.SceneState && typeof window.SceneState.getLoadedPhoto === 'function')
      ? window.SceneState.getLoadedPhoto()
      : (typeof window.getLoadedPhoto === 'function' ? window.getLoadedPhoto() : null);

    const presetState = (window.NodePresets && typeof window.NodePresets.getState === 'function')
      ? window.NodePresets.getState()
      : {
          preset: window.NodePresets ? JSON.parse(JSON.stringify(window.NodePresets.preset)) : null,
          autoApplyToNewNodes: window.NodePresets ? !!window.NodePresets.autoApplyToNewNodes : true
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

    const imageState = (window.ImageObjects && typeof window.ImageObjects.getState === 'function')
      ? window.ImageObjects.getState()
      : {
          images: window.ImageObjects ? window.ImageObjects.list : [],
          imagesCounter: window.ImageObjects ? window.ImageObjects.counter : 0
        };

    const layerState = (window.LayerManager && typeof window.LayerManager.getLayers === 'function')
      ? window.LayerManager.getLayers()
      : (window.LayerManager ? window.LayerManager.list : []);

    let groupsList = [];
    let groupsCounter = 0;
    if (window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady() && typeof window.EngineBridge.listGroups === 'function') {
      groupsList = window.EngineBridge.listGroups() || [];
      if (typeof window.EngineBridge.getGroupsCounter === 'function') {
        groupsCounter = window.EngineBridge.getGroupsCounter() || 0;
      }
    }
    if ((!groupsList || groupsList.length === 0) && window.ObjectGroups) {
      if (typeof window.ObjectGroups.getState === 'function') {
        const gs = window.ObjectGroups.getState();
        groupsList = gs.groups || [];
        groupsCounter = gs.groupsCounter || 0;
      } else {
        groupsList = window.ObjectGroups.list || [];
        groupsCounter = window.ObjectGroups.counter || 0;
      }
    }
    if (groupsCounter === 0 && Array.isArray(groupsList) && groupsList.length > 0) {
      groupsList.forEach((g) => {
        const m = String(g.id).match(/group-(\d+)/);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num > groupsCounter) groupsCounter = num;
        }
      });
    }

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
      ripplesCounter: rippleState.ripplesCounter,
      groups: groupsList,
      groupsCounter: groupsCounter,
      images: imageState.images,
      imagesCounter: imageState.imagesCounter,
      layers: layerState
    });
  },

  notifyStackChange(overrideState = null) {
    const payload = {
      canUndo: overrideState && typeof overrideState.canUndo === 'boolean' ? overrideState.canUndo : (this.undoStack.length > 1),
      canRedo: overrideState && typeof overrideState.canRedo === 'boolean' ? overrideState.canRedo : (this.redoStack.length > 0),
      undoCount: overrideState && typeof overrideState.undoCount === 'number' ? overrideState.undoCount : this.undoStack.length,
      redoCount: overrideState && typeof overrideState.redoCount === 'number' ? overrideState.redoCount : this.redoStack.length
    };
    if (window.AppCoordinator && typeof window.AppCoordinator.emit === 'function') {
      window.AppCoordinator.emit('history:changed', payload);
    }
    return payload;
  },

  canUndo() {
    return this.undoStack.length > 1;
  },

  canRedo() {
    return this.redoStack.length > 0;
  },

  record() {
    this.recordImmediate();
  },

  recordImmediate() {
    if (this.isRestoring) return;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (window.EngineBridge && typeof window.EngineBridge.recordHistory === 'function' && window.EngineBridge.isReady()) {
      const res = window.EngineBridge.recordHistory();
      if (res && res.recorded) {
        this.undoStack.push('go-state-' + Date.now());
        if (this.undoStack.length > this.maxDepth) {
          this.undoStack.shift();
        }
        this.redoStack = [];
      }
      this.notifyStackChange(res);
      return;
    }

    // Fallback if WASM is offline
    const snap = this.captureSnapshot();
    if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === snap) {
      return;
    }
    this.undoStack.push(snap);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.notifyStackChange();
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

      if (typeof window.hydrateLoadedPhoto === 'function') {
        window.hydrateLoadedPhoto(data.loadedPhoto || null);
      } else if (typeof window.setLoadedPhoto === 'function') {
        window.setLoadedPhoto(data.loadedPhoto || null, { hydrateOnly: true });
      } else if (window.SceneState) {
        if (typeof window.SceneState.hydrateLoadedPhoto === 'function') {
          window.SceneState.hydrateLoadedPhoto(data.loadedPhoto || null);
        } else {
          window.SceneState.setLoadedPhoto(data.loadedPhoto || null, { hydrateOnly: true });
        }
      }

      if (data.controls && window.ControlStateAdaptor) {
        window.ControlStateAdaptor.syncToDOM(data.controls);
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
      } else if (window.NodePresets) {
        if (typeof window.NodePresets.resetToDefaults === 'function') {
          window.NodePresets.resetToDefaults();
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
      }

      if (window.ObjectGroups) {
        if (typeof window.ObjectGroups.setState === 'function') {
          window.ObjectGroups.setState({
            groups: data.groups || [],
            groupsCounter: data.groupsCounter || 0
          });
        } else {
          window.ObjectGroups.list = data.groups || [];
          window.ObjectGroups.counter = data.groupsCounter || 0;
        }
      }

      if (window.ImageObjects) {
        if (typeof window.ImageObjects.setState === 'function') {
          window.ImageObjects.setState({
            images: data.images || [],
            imagesCounter: data.imagesCounter || 0
          });
        } else {
          window.ImageObjects.list = data.images || [];
          window.ImageObjects.counter = data.imagesCounter || 0;
        }
      }

      if (window.LayerManager) {
        if (typeof window.LayerManager.setLayers === 'function') {
          window.LayerManager.setLayers(data.layers || [], { skipBridge: true });
        } else {
          window.LayerManager.list = data.layers || [];
        }
      }
    } catch (err) {
      console.error('History restore error:', err);
    } finally {
      this.isRestoring = false;
      this.notifyStackChange();
    }
  },

  undo() {
    if (this.isRestoring) return;

    if (window.EngineBridge && typeof window.EngineBridge.undoHistory === 'function' && window.EngineBridge.isReady()) {
      const res = window.EngineBridge.undoHistory();
      if (res && res.success && res.snapshot) {
        this.isRestoring = true;
        try {
          window.EngineBridge.syncFromEngineSnapshot(res.snapshot);
        } finally {
          this.isRestoring = false;
        }

        if (this.undoStack.length > 1) {
          const popped = this.undoStack.pop();
          this.redoStack.push(popped);
        }

        this.notifyStackChange({
          canUndo: res.canUndo,
          canRedo: res.canRedo,
          undoCount: res.undoCount,
          redoCount: res.redoCount
        });

        if (window.AppCoordinator && typeof window.AppCoordinator.coordinatePostRestore === 'function') {
          window.AppCoordinator.coordinatePostRestore({
            source: 'undo',
            restoredSelection: res.selection || null
          });
        }
        if (typeof window.triggerRender === 'function') {
          window.triggerRender();
        }
        return;
      } else if (res && !res.success) {
        return;
      }
    }

    // Fallback if WASM is offline
    if (this.undoStack.length <= 1) return;
    const current = this.undoStack.pop();
    this.redoStack.push(current);
    const prev = this.undoStack[this.undoStack.length - 1];
    this.applySnapshot(prev);
    this.notifyStackChange();
    if (window.AppCoordinator && typeof window.AppCoordinator.coordinatePostRestore === 'function') {
      window.AppCoordinator.coordinatePostRestore({ source: 'undo' });
    }
  },

  redo() {
    if (this.isRestoring) return;

    if (window.EngineBridge && typeof window.EngineBridge.redoHistory === 'function' && window.EngineBridge.isReady()) {
      const res = window.EngineBridge.redoHistory();
      if (res && res.success && res.snapshot) {
        this.isRestoring = true;
        try {
          window.EngineBridge.syncFromEngineSnapshot(res.snapshot);
        } finally {
          this.isRestoring = false;
        }

        if (this.redoStack.length > 0) {
          const popped = this.redoStack.pop();
          this.undoStack.push(popped);
        }

        this.notifyStackChange({
          canUndo: res.canUndo,
          canRedo: res.canRedo,
          undoCount: res.undoCount,
          redoCount: res.redoCount
        });

        if (window.AppCoordinator && typeof window.AppCoordinator.coordinatePostRestore === 'function') {
          window.AppCoordinator.coordinatePostRestore({
            source: 'redo',
            restoredSelection: res.selection || null
          });
        }
        if (typeof window.triggerRender === 'function') {
          window.triggerRender();
        }
        return;
      } else if (res && !res.success) {
        return;
      }
    }

    // Fallback if WASM is offline
    if (this.redoStack.length === 0) return;
    const next = this.redoStack.pop();
    this.undoStack.push(next);
    this.applySnapshot(next);
    this.notifyStackChange();
    if (window.AppCoordinator && typeof window.AppCoordinator.coordinatePostRestore === 'function') {
      window.AppCoordinator.coordinatePostRestore({ source: 'redo' });
    }
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

    if (window.AppCoordinator && typeof window.AppCoordinator.on === 'function') {
      window.AppCoordinator.on('history:changed', (e) => this.updateButtonsUI(e));
      window.AppCoordinator.on('state:restored', () => this.updateButtonsUI());
    }

    window.addEventListener('keydown', (e) => this.handleKeydown(e));

    if (this.undoStack.length === 0) {
      this.undoStack = ['initial-state'];
      this.redoStack = [];
      this.notifyStackChange({ canUndo: false, canRedo: false, undoCount: 1, redoCount: 0 });
    }
  },

  handleKeydown(e) {
    if (!e) return;
    const targetTag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : '';
    const activeTag = typeof document !== 'undefined' && document.activeElement && document.activeElement.tagName ? document.activeElement.tagName.toUpperCase() : '';
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key && e.key.toLowerCase() === 'z') {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      this.undo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')))) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      this.redo();
    }
  },

  updateButtonsUI(e) {
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    const canUndo = (e && typeof e.canUndo === 'boolean') ? e.canUndo : (this.undoStack.length > 1);
    const canRedo = (e && typeof e.canRedo === 'boolean') ? e.canRedo : (this.redoStack.length > 0);
    if (btnUndo) btnUndo.disabled = !canUndo;
    if (btnRedo) btnRedo.disabled = !canRedo;
  }
};
