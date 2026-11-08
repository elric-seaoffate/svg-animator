/**
 * Layer 2: Application Coordination (`window.AppCoordinator`)
 *
 * Coordinates cross-module selection transitions, history snapshot recording,
 * master SVG render requests, stage grid-snap/dimension lookups, and UI notifications.
 *
 * Maintains the strict one-way dependency direction:
 *   Layer 1 (UI Presentation) -> Layer 2 (AppCoordinator) -> Layer 3 (Operational Functionality)
 */
(function() {
  window.AppCoordinator = {
    activeSelection: { type: null, id: null },
    _listeners: {},
    _renderHandler: null,
    _isCoordinatingSelection: false,

    on(eventName, handler) {
      if (!eventName || typeof handler !== 'function') return;
      if (!this._listeners[eventName]) {
        this._listeners[eventName] = [];
      }
      if (!this._listeners[eventName].includes(handler)) {
        this._listeners[eventName].push(handler);
      }
    },

    off(eventName, handler) {
      if (!eventName || !this._listeners[eventName]) return;
      this._listeners[eventName] = this._listeners[eventName].filter((fn) => fn !== handler);
    },

    emit(eventName, payload) {
      const handlers = this._listeners[eventName];
      if (!handlers || handlers.length === 0) return;
      handlers.slice().forEach((fn) => {
        try {
          fn(payload);
        } catch (err) {
          console.error('AppCoordinator listener error [' + eventName + ']:', err);
        }
      });
    },

    registerRenderHandler(fn) {
      if (typeof fn === 'function') {
        this._renderHandler = fn;
      }
    },

    requestRender() {
      if (typeof this._renderHandler === 'function') {
        this._renderHandler();
      } else if (typeof window.triggerAppRender === 'function') {
        window.triggerAppRender();
      }
      this.emit('render:completed', {
        state: window.SceneState ? window.SceneState.currentRenderState : window.currentRenderState
      });
    },

    isHistoryRestoring() {
      return !!(window.HistoryManager && window.HistoryManager.isRestoring);
    },

    recordHistoryImmediate() {
      if (this.isHistoryRestoring()) return;
      if (window.HistoryManager && typeof window.HistoryManager.recordImmediate === 'function') {
        window.HistoryManager.recordImmediate();
      }
    },

    recordHistoryDebounced(delayMs = 280) {
      if (this.isHistoryRestoring()) return;
      if (window.HistoryManager && typeof window.HistoryManager.recordDebounced === 'function') {
        window.HistoryManager.recordDebounced(delayMs);
      }
    },

    getActiveSelection() {
      return {
        type: this.activeSelection.type,
        id: this.activeSelection.id
      };
    },

    /**
     * Coordinates single-active-object selection across DiagramNodes, DataFlows,
     * Glows, Ripples, and Stage camera reticles without modules mutating each other directly.
     *
     * @param {string|null} type - 'node' | 'flow' | 'glow' | 'ripple' | 'camera' | null
     * @param {number|string|null} id - Object ID or camera placement ('start' | 'end')
     * @param {Object} [options] - Optional flags ({ openAccordionId, skipStageClear })
     */
    selectObject(type, id, options = {}) {
      if (this._isCoordinatingSelection) return;
      this._isCoordinatingSelection = true;
      try {
        const normalizedType = (id !== null && id !== undefined) ? type : null;
        const normalizedId = (id !== null && id !== undefined) ? id : null;

        if (normalizedType !== 'node' && window.DiagramNodes && window.DiagramNodes.activeId !== null) {
          window.DiagramNodes.deselectNode();
        }
        if (normalizedType !== 'flow' && window.DataFlows && window.DataFlows.activeId !== null) {
          window.DataFlows.deselectFlow();
        }
        if (normalizedType !== 'glow' && window.Glows && window.Glows.activeId !== null) {
          window.Glows.deselectGlow();
        }
        if (normalizedType !== 'ripple' && window.Ripples && window.Ripples.activeId !== null) {
          window.Ripples.deselectRipple();
        }
        if (normalizedType !== 'camera' && !options.skipStageClear && window.Stage && window.Stage.activePlacement) {
          window.Stage.clearActive();
        }

        this.activeSelection = {
          type: normalizedType,
          id: normalizedId
        };

        if (options.openAccordionId && typeof window.openAccordionById === 'function') {
          window.openAccordionById(options.openAccordionId);
        }

        this.emit('selection:changed', this.getActiveSelection());
      } finally {
        this._isCoordinatingSelection = false;
      }
    },

    clearSelection(exceptType = null) {
      this.selectObject(exceptType, null);
    },

    /**
     * Coordinates the post-restoration presentation refresh across modules.
     * Clears selections and overlays, updates preset rows, invokes UI sync / render,
     * and emits 'state:restored'.
     *
     * @param {Object} [options] - Context info ({ source: 'undo'|'redo'|'project'|'new_project'|'direct_apply', projectId })
     */
    coordinatePostRestore(options = {}) {
      if (window.DiagramNodes && typeof window.DiagramNodes.deselectNode === 'function') {
        window.DiagramNodes.deselectNode();
      }
      if (window.DataFlows && typeof window.DataFlows.deselectFlow === 'function') {
        window.DataFlows.deselectFlow();
      }
      if (window.Glows && typeof window.Glows.deselectGlow === 'function') {
        window.Glows.deselectGlow();
      }
      if (window.Ripples && typeof window.Ripples.deselectRipple === 'function') {
        window.Ripples.deselectRipple();
      }
      if (window.Stage && typeof window.Stage.clearActive === 'function') {
        window.Stage.clearActive();
      }
      this.activeSelection = { type: null, id: null };
      this.emit('selection:changed', this.getActiveSelection());

      if (window.NodePresets && typeof window.NodePresets.syncAllRowsUI === 'function') {
        window.NodePresets.syncAllRowsUI();
      }

      if (typeof window.syncUIAfterHistoryRestore === 'function') {
        window.syncUIAfterHistoryRestore();
      } else {
        this.requestRender();
      }

      this.emit('state:restored', {
        source: options.source || 'restore',
        projectId: options.projectId !== undefined ? options.projectId : null
      });
    },

    getCanvasDimensions() {
      if (window.SceneState && window.SceneState.currentImage) {
        return {
          width: window.SceneState.currentImage.width || 1280,
          height: window.SceneState.currentImage.height || 720
        };
      }
      if (window.Stage && window.Stage.canvasWidth && window.Stage.canvasHeight) {
        return {
          width: window.Stage.canvasWidth,
          height: window.Stage.canvasHeight
        };
      }
      if (window.SceneState) {
        const w = (typeof window.SceneState.getNumControl === 'function'
          ? window.SceneState.getNumControl('canvasWidthInput', 1280)
          : parseInt(window.SceneState.controls && window.SceneState.controls.canvasWidthInput, 10)) || 1280;
        const h = (typeof window.SceneState.getNumControl === 'function'
          ? window.SceneState.getNumControl('canvasHeightInput', 720)
          : parseInt(window.SceneState.controls && window.SceneState.controls.canvasHeightInput, 10)) || 720;
        return { width: w, height: h };
      }
      return { width: 1280, height: 720 };
    },

    getSnapConfig() {
      if (window.ControlStateAdaptor) {
        window.ControlStateAdaptor.syncFromDOM(['chkSnapToGrid', 'snapGridSizeSlider', 'snapGridSizeNum', 'canvasWidthInput', 'canvasHeightInput']);
      }
      if (window.SceneState) {
        const cfg = window.SceneState.getSnapConfig();
        const dims = this.getCanvasDimensions();
        cfg.canvasWidth = dims.width;
        cfg.canvasHeight = dims.height;
        return cfg;
      }
      return {
        enabled: false,
        gridSizePx: 20,
        canvasWidth: 1280,
        canvasHeight: 720
      };
    },

    snapPctToGrid(valPct, axis = 'x') {
      const cfg = this.getSnapConfig();
      if (window.Stage && typeof window.Stage.computeSnappedPct === 'function') {
        return window.Stage.computeSnappedPct(valPct, axis, cfg);
      }
      if (!cfg.enabled) return valPct;
      const totalPx = axis === 'x' ? cfg.canvasWidth : cfg.canvasHeight;
      if (totalPx <= 0) return valPct;
      const rawPx = (valPct / 100) * totalPx;
      const snappedPx = Math.round(rawPx / cfg.gridSizePx) * cfg.gridSizePx;
      return Math.round(Math.max(0, Math.min(100, (snappedPx / totalPx) * 100)) * 10) / 10;
    },

    snapPosition(xPct, yPct) {
      const cfg = this.getSnapConfig();
      if (window.Stage && typeof window.Stage.computeSnappedPosition === 'function') {
        return window.Stage.computeSnappedPosition(xPct, yPct, cfg);
      }
      if (!cfg.enabled) {
        return {
          x: Math.round(Math.min(100, Math.max(0, xPct)) * 10) / 10,
          y: Math.round(Math.min(100, Math.max(0, yPct)) * 10) / 10
        };
      }
      const gridPx = Math.max(2, parseFloat(cfg.gridSizePx || 20) || 20);
      const w = cfg.canvasWidth || 1280;
      const h = cfg.canvasHeight || 720;
      const rawPxX = (xPct / 100) * w;
      const rawPxY = (yPct / 100) * h;
      const snappedPxX = Math.min(w, Math.max(0, Math.round(rawPxX / gridPx) * gridPx));
      const snappedPxY = Math.min(h, Math.max(0, Math.round(rawPxY / gridPx) * gridPx));
      return {
        x: Number(((snappedPxX / w) * 100).toFixed(3)),
        y: Number(((snappedPxY / h) * 100).toFixed(3))
      };
    }
  };
})();
