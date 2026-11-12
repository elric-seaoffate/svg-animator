/**
 * SVG Animator Studio — WebAssembly Engine Bridge (`window.EngineBridge`)
 *
 * Layer 2 (Platform & WASM Host Adapter):
 *   - Orchestrates Go/WASM engine initialization, lifecycle, and readiness tracking.
 *   - Provides typed, versioned command dispatch across the WASM boundary.
 *   - Tracks invocation statistics and timing metrics.
 *   - Provides clean fallback detection: if WebAssembly is unavailable or initialization
 *     fails, isReady() returns false so caller modules seamlessly use their built-in
 *     JavaScript implementation.
 *   - Zero direct DOM manipulation.
 */
(function() {
  'use strict';

  const EngineBridge = {
    version: '1.0.0',
    status: 'uninitialized', // 'uninitialized' | 'loading' | 'ready' | 'fallback' | 'failed'
    _bridge: null,
    _initPromise: null,
    _sceneCache: null,
    _sceneSynced: false,
    _lastSyncError: null,
    _lastSyncErrorLogged: null,
    _syncRevision: 0,
    _lastEngineUsed: 'Unavailable',
    _stats: {
      totalCalls: 0,
      totalDurationMs: 0,
      lastDurationMs: 0,
      framesEvaluated: 0,
      errors: 0
    },

    isReady() {
      return this.status === 'ready' && !!this._bridge;
    },

    getStatus() {
      return this.status;
    },

    getStats() {
      return Object.assign({}, this._stats, {
        avgDurationMs: this._stats.totalCalls > 0
          ? Number((this._stats.totalDurationMs / this._stats.totalCalls).toFixed(3))
          : 0
      });
    },

    init(wasmUrl = 'wasm/engine.wasm') {
      if (this._initPromise) return this._initPromise;

      this._initPromise = new Promise((resolve) => {
        // 1. Verify WebAssembly & Go runtime prerequisites
        if (typeof window === 'undefined' || typeof WebAssembly === 'undefined' || typeof window.Go === 'undefined') {
          this.status = 'fallback';
          console.warn('[EngineBridge] WebAssembly or Go runtime not available; using JavaScript fallback.');
          return resolve(false);
        }

        this.status = 'loading';
        const go = new window.Go();

        const instantiateWasm = async () => {
          try {
            let instance;
            if (typeof WebAssembly.instantiateStreaming === 'function') {
              try {
                const response = await fetch(wasmUrl);
                const result = await WebAssembly.instantiateStreaming(response, go.importObject);
                instance = result.instance;
              } catch (streamingErr) {
                // Fallback to arrayBuffer if streaming response type is not application/wasm or rejected
                console.warn('[EngineBridge] instantiateStreaming fallback:', streamingErr && streamingErr.message);
                const resp = await fetch(wasmUrl);
                const bytes = await resp.arrayBuffer();
                const result = await WebAssembly.instantiate(bytes, go.importObject);
                instance = result.instance;
              }
            } else {
              const resp = await fetch(wasmUrl);
              const bytes = await resp.arrayBuffer();
              const result = await WebAssembly.instantiate(bytes, go.importObject);
              instance = result.instance;
            }

            // Run Go runtime in background (it blocks in select {})
            go.run(instance).catch((runErr) => {
              console.error('[EngineBridge] Go WASM runtime exited:', runErr);
              this.status = 'failed';
            });

            // Locate bridge exported to window
            if (window.__svgAnimatorWasmBridge && window.__svgAnimatorWasmBridge.isReady) {
              this._bridge = window.__svgAnimatorWasmBridge;
              this.status = 'ready';
              this._sceneSynced = true;
              console.log('[EngineBridge] Go WebAssembly engine mounted successfully (v' + (this._bridge.version || '1.0.0') + ').');
              return resolve(true);
            }

            // Wait briefly for ready event if set up asynchronously
            const onReady = () => {
              window.removeEventListener('svg-animator-wasm-ready', onReady);
              if (window.__svgAnimatorWasmBridge) {
                this._bridge = window.__svgAnimatorWasmBridge;
                this.status = 'ready';
                this._sceneSynced = true;
                console.log('[EngineBridge] Go WebAssembly engine ready via event.');
                resolve(true);
              }
            };
            window.addEventListener('svg-animator-wasm-ready', onReady);

            setTimeout(() => {
              if (this.status !== 'ready') {
                if (window.__svgAnimatorWasmBridge) {
                  this._bridge = window.__svgAnimatorWasmBridge;
                  this.status = 'ready';
                  this._sceneSynced = true;
                  resolve(true);
                } else {
                  this.status = 'fallback';
                  console.warn('[EngineBridge] WASM bridge timed out; using JavaScript fallback.');
                  resolve(false);
                }
              }
            }, 1000);
          } catch (loadErr) {
            this.status = 'fallback';
            this._stats.errors++;
            console.warn('[EngineBridge] Failed to load WASM (' + wasmUrl + '); using JavaScript fallback:', loadErr && loadErr.message);
            resolve(false);
          }
        };

        instantiateWasm();
      });

      return this._initPromise;
    },

    dispatch(command, payload) {
      if (!this.isReady()) {
        this._lastError = 'Go/WASM engine is unavailable';
        return null;
      }
      if (typeof command !== 'string' || !command.trim()) {
        this._stats.errors++;
        this._lastError = 'Invalid command: must be a non-empty string';
        return null;
      }

      let safePayload = payload;
      if (safePayload !== undefined && safePayload !== null && typeof safePayload === 'object') {
        try {
          JSON.stringify(safePayload);
        } catch (jsonErr) {
          this._stats.errors++;
          this._lastError = 'Invalid payload: not JSON serializable (' + (jsonErr && jsonErr.message) + ')';
          console.error('[EngineBridge] Payload serialization failed (' + command + '):', jsonErr);
          return null;
        }
      }

      const t0 = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();

      try {
        const res = this._bridge.dispatch(command, safePayload);
        const t1 = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        const duration = t1 - t0;
        this._stats.totalCalls++;
        this._stats.totalDurationMs += duration;
        this._stats.lastDurationMs = duration;

        if (res && res.success) {
          this._lastError = null;
          return res.data;
        } else {
          this._stats.errors++;
          const err = (res && res.error) || 'Command failed';
          this._lastError = err;
          console.error('[EngineBridge] Command failed (' + command + '):', err);
          return null;
        }
      } catch (err) {
        this._stats.errors++;
        const errMsg = err && err.message ? err.message : String(err);
        this._lastError = errMsg;
        console.error('[EngineBridge] Exception dispatching (' + command + '):', err);
        return null;
      }
    },

    getLastError() {
      return this._lastError || null;
    },

    ping() {
      return this.dispatch('Engine.Ping', {});
    },

    generateFlowPath(nodes, curvature, width, height, routeMode = 'curve') {
      if (!this.isReady() || !nodes || nodes.length < 2) return null;
      const res = this.dispatch('Geometry.GenerateFlowPath', {
        nodes: nodes.map((n) => ({ x: Number(n.x) || 0, y: Number(n.y) || 0 })),
        curvature: Number(curvature) || 0,
        width: Number(width) || 1280,
        height: Number(height) || 720,
        routeMode: String(routeMode || 'curve')
      });
      return res;
    },

    getFlowMidpoint(nodes, curvature, width, height) {
      if (!this.isReady() || !nodes || nodes.length < 2) return null;
      const res = this.dispatch('Geometry.GenerateFlowPath', {
        nodes: nodes.map((n) => ({ x: Number(n.x) || 0, y: Number(n.y) || 0 })),
        curvature: Number(curvature) || 0,
        width: Number(width) || 1280,
        height: Number(height) || 720,
        routeMode: 'curve'
      });
      return res && res.midpoint ? res.midpoint : null;
    },

    computeSnappedPosition(xPct, yPct, snapConfig = {}) {
      if (!this.isReady()) return null;
      const res = this.dispatch('Geometry.ComputeSnappedPosition', {
        xPct: Number(xPct) || 0,
        yPct: Number(yPct) || 0,
        snapConfig: {
          enabled: !!snapConfig.enabled,
          gridSizePx: Number(snapConfig.gridSizePx) || 20,
          canvasWidth: Number(snapConfig.canvasWidth) || 1280,
          canvasHeight: Number(snapConfig.canvasHeight) || 720
        }
      });
      return res && res.point ? res.point : null;
    },

    getShapeCatalog() {
      if (this.isReady()) {
        const res = this.dispatch('Shape.GetCatalog', {});
        if (Array.isArray(res) && res.length > 0) return res;
      }
      return (window.ShapeRegistry && typeof window.ShapeRegistry.getAll === 'function')
        ? window.ShapeRegistry.getAll()
        : [];
    },

    describeShape(shape, width, height, text = '', subtext = '', fontSize = 15) {
      if (this.isReady()) {
        const res = this.dispatch('Shape.Describe', {
          shape: String(shape || 'rounded'),
          width: Number(width) || 170,
          height: Number(height) || 80,
          text: String(text || ''),
          subtext: String(subtext || ''),
          fontSize: Number(fontSize) || 15
        });
        if (res && res.bounds) return res;
      }
      const w = Number(width) || 170;
      const h = Number(height) || 80;
      const hw = w / 2;
      const hh = h / 2;
      return {
        shape: String(shape || 'rounded'),
        width: w,
        height: h,
        halfWidth: hw,
        halfHeight: hh,
        bounds: { minX: -hw, minY: -hh, maxX: hw, maxY: hh, width: w, height: h },
        anchors: {
          top: { x: 0, y: -hh },
          bottom: { x: 0, y: hh },
          left: { x: -hw, y: 0 },
          right: { x: hw, y: 0 },
          center: { x: 0, y: 0 }
        },
        elements: [{ type: 'rect', attributes: { x: String(-hw), y: String(-hh), width: String(w), height: String(h), rx: '12' } }],
        text: {
          startY: -hh * 0.2,
          lineHeight: fontSize * 1.25,
          totalHeight: fontSize * 1.25,
          lines: (text || '').split('|').map((s) => s.trim()).filter(Boolean),
          hasSubtext: !!subtext,
          subtext: String(subtext || ''),
          anchor: shape === 'axes' ? 'start' : 'middle'
        }
      };
    },

    getDefaultPreset() {
      if (this.isReady()) {
        const res = this.dispatch('Preset.GetDefaults', {});
        if (res && res.preset) return res;
      }
      return (window.NodePresets && typeof window.NodePresets.getState === 'function')
        ? window.NodePresets.getState()
        : null;
    },

    applyPreset(node, preset) {
      if (!node || typeof node !== 'object') return false;
      const originalId = node.id;
      if (this.isReady() && preset && preset.preset) {
        const res = this.dispatch('Preset.Apply', { node: node, preset: preset });
        if (res && res.node) {
          Object.assign(node, res.node);
          node.id = originalId;
          return !!res.changed;
        }
      }
      if (window.NodePresets && typeof window.NodePresets.applyToNodeObject === 'function') {
        return window.NodePresets.applyToNodeObject(node);
      }
      return false;
    },

    extractPreset(node, preset) {
      if (!node || typeof node !== 'object') return preset;
      if (this.isReady() && preset && preset.preset) {
        const res = this.dispatch('Preset.Extract', { node: node, preset: preset });
        if (res && res.preset) return res;
      }
      if (window.NodePresets && typeof window.NodePresets.extractFromNodeObject === 'function') {
        window.NodePresets.extractFromNodeObject(node);
        return window.NodePresets.getState();
      }
      return preset;
    },

    createNode(initial = {}, preset = null, snap = true) {
      if (this.isReady()) {
        const res = this.dispatch('Node.Create', {
          initial: initial,
          preset: preset,
          snap: !!snap
        });
        if (res && res.node) return res.node;
      }
      return null;
    },

    updateNode(id, patch = {}) {
      if (this.isReady() && id !== undefined && id !== null) {
        const res = this.dispatch('Node.Update', {
          id: String(id),
          patch: patch
        });
        if (res && res.node) return res.node;
      }
      return null;
    },

    deleteNode(id) {
      if (this.isReady() && id !== undefined && id !== null) {
        const res = this.dispatch('Node.Delete', { id: String(id) });
        if (res && res.deleted !== undefined) return !!res.deleted;
      }
      return false;
    },

    getNodeBounds(id, canvasW = 1280, canvasH = 720) {
      if (this.isReady() && id !== undefined && id !== null) {
        const res = this.dispatch('Node.GetBounds', {
          id: String(id),
          canvasW: Number(canvasW) || 1280,
          canvasH: Number(canvasH) || 720
        });
        if (res && res.screenRect) return res;
      }
      return null;
    },

    findNodeAt(xPct, yPct, canvasW = 1280, canvasH = 720) {
      if (this.isReady()) {
        const res = this.dispatch('Node.FindAt', {
          xPct: Number(xPct) || 0,
          yPct: Number(yPct) || 0,
          canvasW: Number(canvasW) || 1280,
          canvasH: Number(canvasH) || 720
        });
        if (res !== undefined) return res;
      }
      return null;
    },

    createFlow(initial = {}) {
      if (this.isReady()) {
        const res = this.dispatch('Flow.Create', {
          initial: initial
        });
        if (res && res.flow) return res.flow;
      }
      return null;
    },

    updateFlow(id, patch = {}) {
      if (this.isReady() && id !== undefined && id !== null) {
        const res = this.dispatch('Flow.Update', {
          id: String(id),
          patch: patch
        });
        if (res && res.flow) return res.flow;
      }
      return null;
    },

    deleteFlow(id) {
      if (this.isReady() && id !== undefined && id !== null) {
        const res = this.dispatch('Flow.Delete', { id: String(id) });
        if (res && res.deleted !== undefined) return !!res.deleted;
      }
      return false;
    },

    getFlow(id) {
      if (this.isReady() && id !== undefined && id !== null) {
        const res = this.dispatch('Flow.Get', { id: String(id) });
        if (res !== undefined) return res;
      }
      return null;
    },

    getAllFlows() {
      if (this.isReady()) {
        const res = this.dispatch('Flow.GetAll', {});
        if (Array.isArray(res)) return res;
      }
      return null;
    },

    findFlowAt(xPct, yPct, canvasW = 1280, canvasH = 720) {
      if (this.isReady()) {
        const res = this.dispatch('Flow.FindAt', {
          xPct: Number(xPct) || 0,
          yPct: Number(yPct) || 0,
          canvasW: Number(canvasW) || 1280,
          canvasH: Number(canvasH) || 720
        });
        if (res !== undefined) return res;
      }
      return null;
    },

    getFlowBounds(id, canvasW = 1280, canvasH = 720) {
      if (this.isReady() && id !== undefined && id !== null) {
        const res = this.dispatch('Flow.GetBounds', {
          id: String(id),
          canvasW: Number(canvasW) || 1280,
          canvasH: Number(canvasH) || 720
        });
        if (res && res.bounds) return res;
      }
      return null;
    },

    addFlowWaypoint(id, x, y) {
      if (this.isReady() && id !== undefined && id !== null) {
        const payload = { id: String(id) };
        if (x !== undefined && y !== undefined) {
          payload.x = Number(x);
          payload.y = Number(y);
        }
        const res = this.dispatch('Flow.AddWaypoint', payload);
        if (res && res.flow) return res;
      }
      return null;
    },

    removeFlowWaypoint(id, waypointIdx) {
      if (this.isReady() && id !== undefined && id !== null) {
        const res = this.dispatch('Flow.RemoveWaypoint', {
          id: String(id),
          waypointIdx: parseInt(waypointIdx, 10) || 0
        });
        if (res && res.flow) return res;
      }
      return null;
    },

    updateFlowWaypoint(id, waypointIdx, x, y) {
      if (this.isReady() && id !== undefined && id !== null) {
        const res = this.dispatch('Flow.UpdateWaypoint', {
          id: String(id),
          waypointIdx: parseInt(waypointIdx, 10) || 0,
          x: Number(x) || 0,
          y: Number(y) || 0
        });
        if (res && res.flow) return res;
      }
      return null;
    },

    attachFlowToNode(flowId, isEnd, nodeId) {
      if (this.isReady() && flowId !== undefined && nodeId !== undefined) {
        const res = this.dispatch('Flow.AttachToNode', {
          flowId: String(flowId),
          isEnd: !!isEnd,
          nodeId: String(nodeId)
        });
        if (res && res.success !== undefined) return !!res.success;
      }
      return false;
    },

    detachFlowFromNode(flowId, isEnd) {
      if (this.isReady() && flowId !== undefined) {
        const res = this.dispatch('Flow.DetachFromNode', {
          flowId: String(flowId),
          isEnd: !!isEnd
        });
        if (res && res.success !== undefined) return !!res.success;
      }
      return false;
    },

    recalculateFlowConnections(nodeId) {
      if (this.isReady() && nodeId !== undefined) {
        const res = this.dispatch('Flow.RecalculateConnections', {
          nodeId: String(nodeId)
        });
        return res;
      }
      return null;
    },

    describeFlow(nodes, curvature, width, height, routeMode = 'curve') {
      if (this.isReady() && Array.isArray(nodes)) {
        const res = this.dispatch('Flow.Describe', {
          nodes: nodes,
          curvature: Number(curvature) || 0,
          width: Number(width) || 1280,
          height: Number(height) || 720,
          routeMode: String(routeMode || 'curve')
        });
        if (res && res.pathD) return res;
      }
      return null;
    },

    // =========================================================================
    // Glow Operations (Stage 5)
    // =========================================================================

    createGlow(initialProps = {}) {
      if (this.isReady()) {
        const payload = {
          initial: {
            id: initialProps.id != null ? String(initialProps.id) : '',
            shape: String(initialProps.shape || 'circle'),
            x: Number(initialProps.x != null ? initialProps.x : 50),
            y: Number(initialProps.y != null ? initialProps.y : 50),
            size: Number(initialProps.size != null ? initialProps.size : 25),
            color: String(initialProps.color || '#ff0044'),
            opacity: Number(initialProps.opacity != null ? initialProps.opacity : 1.0),
            dur: Number(initialProps.dur != null ? initialProps.dur : 2.0),
            delay: Number(initialProps.delay) || 0,
            endDelay: Number(initialProps.endDelay) || 0,
            playback: String(initialProps.playback || 'pingpong'),
            isRadar: initialProps.shape === 'radar' || !!initialProps.isRadar,
            radarRings: Number(initialProps.rings || initialProps.radarRings || 1),
            rings: Number(initialProps.rings || initialProps.radarRings || 1),
            radarStagger: Number(initialProps.radarStagger != null ? initialProps.radarStagger : 0.25),
            scale: Number(initialProps.scale != null ? initialProps.scale : 1.0),
            blur: Number(initialProps.blur != null ? initialProps.blur : 50),
            thick: Number(initialProps.thick != null ? initialProps.thick : 2),
            coreR: Number(initialProps.coreR != null ? initialProps.coreR : 5),
            hideOnDelay: initialProps.hideOnDelay !== false,
            customB64: String(initialProps.customB64 || ''),
            customMime: String(initialProps.customMime || ''),
            customW: Number(initialProps.customW) || 0,
            customH: Number(initialProps.customH) || 0
          }
        };
        const res = this.dispatch('Glow.Create', payload);
        if (res && res.glow) return res.glow;
      }
      return null;
    },

    updateGlow(id, patch = {}) {
      if (this.isReady() && id !== undefined && id !== null) {
        const patchObj = Object.assign({}, patch);
        delete patchObj.id;
        const res = this.dispatch('Glow.Update', {
          id: String(id),
          patch: patchObj
        });
        if (res && res.glow) return res.glow;
      }
      return null;
    },

    deleteGlow(id) {
      if (this.isReady() && id !== undefined && id !== null) {
        const res = this.dispatch('Glow.Delete', { id: String(id) });
        if (res && res.deleted !== undefined) return !!res.deleted;
      }
      return false;
    },

    getGlow(id) {
      if (this.isReady() && id !== undefined && id !== null) {
        const res = this.dispatch('Glow.Get', { id: String(id) });
        if (res && res.id) return res;
      }
      return null;
    },

    getAllGlows() {
      if (this.isReady()) {
        const res = this.dispatch('Glow.GetAll', {});
        if (Array.isArray(res)) return res;
      }
      return null;
    },

    findGlowAt(xPct, yPct, canvasW = 1280, canvasH = 720) {
      if (this.isReady()) {
        const res = this.dispatch('Glow.FindAt', {
          xPct: Number(xPct) || 0,
          yPct: Number(yPct) || 0,
          canvasW: Number(canvasW) || 1280,
          canvasH: Number(canvasH) || 720
        });
        if (res !== undefined) return res;
      }
      return null;
    },

    getGlowBounds(id, canvasW = 1280, canvasH = 720) {
      if (this.isReady() && id !== undefined && id !== null) {
        const res = this.dispatch('Glow.GetBounds', {
          id: String(id),
          canvasW: Number(canvasW) || 1280,
          canvasH: Number(canvasH) || 720
        });
        if (res && res.bounds) return res;
      }
      return null;
    },

    describeGlow(id, canvasW = 1280, canvasH = 720) {
      if (this.isReady() && id !== undefined && id !== null) {
        const res = this.dispatch('Glow.Describe', {
          id: String(id),
          canvasW: Number(canvasW) || 1280,
          canvasH: Number(canvasH) || 720
        });
        if (res && res.id) return res;
      }
      return null;
    },

    // =========================================================================
    // Ripple Operations (Stage 6)
    // =========================================================================

    createRipple(initialProps = {}) {
      if (this.isReady()) {
        const payload = {
          initial: {
            id: initialProps.id != null ? String(initialProps.id) : '',
            color: String(initialProps.color || '#ffffff'),
            opacity: Number(initialProps.opacity != null ? initialProps.opacity : 0.4),
            innerR: Number(initialProps.innerR) || 0,
            outerR: Number(initialProps.outerR != null ? initialProps.outerR : 150),
            rings: Number(initialProps.rings || initialProps.waveCount || 3),
            waveCount: Number(initialProps.rings || initialProps.waveCount || 3),
            thick: Number(initialProps.thick != null ? initialProps.thick : 8),
            refraction: Number(initialProps.refraction != null ? initialProps.refraction : 35),
            dur: Number(initialProps.dur != null ? initialProps.dur : 3.0),
            delay: Number(initialProps.delay) || 0,
            endDelay: Number(initialProps.endDelay) || 0,
            x: Number(initialProps.x != null ? initialProps.x : 50),
            y: Number(initialProps.y != null ? initialProps.y : 50)
          }
        };
        const res = this.dispatch('Ripple.Create', payload);
        if (res && res.ripple) return res.ripple;
      }
      return null;
    },

    updateRipple(id, patch = {}) {
      if (this.isReady() && id !== undefined && id !== null) {
        const patchObj = Object.assign({}, patch);
        delete patchObj.id;
        const res = this.dispatch('Ripple.Update', {
          id: String(id),
          patch: patchObj
        });
        if (res && res.ripple) return res.ripple;
      }
      return null;
    },

    deleteRipple(id) {
      if (this.isReady() && id !== undefined && id !== null) {
        const res = this.dispatch('Ripple.Delete', { id: String(id) });
        if (res && res.deleted !== undefined) return !!res.deleted;
      }
      return false;
    },

    getRipple(id) {
      if (this.isReady() && id !== undefined && id !== null) {
        const res = this.dispatch('Ripple.Get', { id: String(id) });
        if (res && res.id) return res;
      }
      return null;
    },

    getAllRipples() {
      if (this.isReady()) {
        const res = this.dispatch('Ripple.GetAll', {});
        if (Array.isArray(res)) return res;
      }
      return null;
    },

    findRippleAt(xPct, yPct, canvasW = 1280, canvasH = 720) {
      if (this.isReady()) {
        const res = this.dispatch('Ripple.FindAt', {
          xPct: Number(xPct) || 0,
          yPct: Number(yPct) || 0,
          canvasW: Number(canvasW) || 1280,
          canvasH: Number(canvasH) || 720
        });
        if (res !== undefined) return res;
      }
      return null;
    },

    getRippleBounds(id, canvasW = 1280, canvasH = 720) {
      if (this.isReady() && id !== undefined && id !== null) {
        const res = this.dispatch('Ripple.GetBounds', {
          id: String(id),
          canvasW: Number(canvasW) || 1280,
          canvasH: Number(canvasH) || 720
        });
        if (res && res.bounds) return res;
      }
      return null;
    },

    describeRipple(id, canvasW = 1280, canvasH = 720) {
      if (this.isReady() && id !== undefined && id !== null) {
        const res = this.dispatch('Ripple.Describe', {
          id: String(id),
          canvasW: Number(canvasW) || 1280,
          canvasH: Number(canvasH) || 720
        });
        if (res && res.id) return res;
      }
      return null;
    },

    // =========================================================================
    // Camera, Optics & Frame Operations (Stage 7)
    // =========================================================================

    updateCamera(camConfig) {
      if (this.isReady() && camConfig && typeof camConfig === 'object') {
        const res = this.dispatch('Camera.Update', { camera: camConfig });
        if (res && res.camera) return res.camera;
      }
      return null;
    },

    getCamera() {
      if (this.isReady()) {
        const res = this.dispatch('Camera.Get', {});
        if (res) return res;
      }
      return null;
    },

    evaluateCamera(timeSec, canvasW = 1280, canvasH = 720, camConfig = null) {
      if (this.isReady()) {
        const payload = {
          time: Number(timeSec) || 0,
          canvasW: Number(canvasW) || 1280,
          canvasH: Number(canvasH) || 720
        };
        if (camConfig && typeof camConfig === 'object') {
          payload.camera = camConfig;
        }
        const res = this.dispatch('Camera.Evaluate', payload);
        if (res && res.transform !== undefined) return res;
      }
      return null;
    },

    updateOptics(optConfig) {
      if (this.isReady() && optConfig && typeof optConfig === 'object') {
        const res = this.dispatch('Optics.Update', { optical: optConfig });
        if (res && res.optical) return res.optical;
      }
      return null;
    },

    getOptics() {
      if (this.isReady()) {
        const res = this.dispatch('Optics.Get', {});
        if (res) return res;
      }
      return null;
    },

    evaluateOptics(timeSec, camDuration = 7.0, camLoop = 'once', optConfig = null) {
      if (this.isReady()) {
        const payload = {
          time: Number(timeSec) || 0,
          camDuration: Number(camDuration) || 7.0,
          camLoop: String(camLoop || 'once')
        };
        if (optConfig && typeof optConfig === 'object') {
          payload.optical = optConfig;
        }
        const res = this.dispatch('Optics.Evaluate', payload);
        if (res && res.filterAttr !== undefined) return res;
      }
      return null;
    },

    updateFrame(frameConfig) {
      if (this.isReady() && frameConfig && typeof frameConfig === 'object') {
        const res = this.dispatch('Frame.Update', { frame: frameConfig });
        if (res && res.frame) return res.frame;
      }
      return null;
    },

    getFrame() {
      if (this.isReady()) {
        const res = this.dispatch('Frame.Get', {});
        if (res) return res;
      }
      return null;
    },

    updateCanvas(canvasConfig) {
      if (this.isReady() && canvasConfig && typeof canvasConfig === 'object') {
        const res = this.dispatch('Canvas.Update', { canvas: canvasConfig });
        if (res && res.canvas) return res.canvas;
      }
      return null;
    },

    getCanvas() {
      if (this.isReady()) {
        const res = this.dispatch('Canvas.Get', {});
        if (res && res.canvas) return res.canvas;
      }
      return null;
    },

    describeFrame(frameConfig, canvasW = 1280, canvasH = 720) {
      if (this.isReady()) {
        const payload = {
          canvasW: Number(canvasW) || 1280,
          canvasH: Number(canvasH) || 720
        };
        if (frameConfig && typeof frameConfig === 'object') {
          payload.frame = {
            frame: frameConfig.frame != null ? !!frameConfig.frame : (frameConfig.enabled != null ? !!frameConfig.enabled : true),
            frameStyle: String(frameConfig.frameStyle || frameConfig.style || 'walnut'),
            frameDepth: Number(frameConfig.frameDepth || frameConfig.depth) || 44,
            frameLighting: frameConfig.frameLighting != null ? !!frameConfig.frameLighting : (frameConfig.lighting != null ? !!frameConfig.lighting : true),
            frameLightDir: String(frameConfig.frameLightDir || frameConfig.lightDir || 'tl'),
            frameLightInt: Number(frameConfig.frameLightInt != null ? frameConfig.frameLightInt : (frameConfig.lightInt != null ? frameConfig.lightInt : 70)),
            frameShadow: Number(frameConfig.frameShadow != null ? frameConfig.frameShadow : (frameConfig.shadow != null ? frameConfig.shadow : 0.55)),
            frameFillet: frameConfig.frameFillet != null ? !!frameConfig.frameFillet : (frameConfig.fillet != null ? !!frameConfig.fillet : true)
          };
        }
        const res = this.dispatch('Frame.Describe', payload);
        if (res && res.markup !== undefined) return res;
      }
      return null;
    },

    renameObject(type, id, name) {
      if (this.isReady() && id !== undefined && id !== null) {
        const res = this.dispatch('Object.Rename', {
          type: String(type || ''),
          id: String(id),
          name: String(name || '')
        });
        if (res && res.success) return res;
      }
      return null;
    },

    getSelection() {
      if (this.isReady()) {
        const res = this.dispatch('Selection.Get', {});
        if (res && res.success) return res;
      }
      return null;
    },

    setSelection(type, id, items = null) {
      if (this.isReady()) {
        const payload = {
          type: String(type || 'none'),
          id: id != null ? String(id) : ''
        };
        if (Array.isArray(items) && items.length > 0) {
          payload.items = items.map((it) => ({
            type: String(it.type || 'none'),
            id: String(it.id != null ? it.id : '')
          }));
        }
        const res = this.dispatch('Selection.Set', payload);
        if (res && res.success) return res;
        return res || { success: false, error: 'Failed to set selection in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    addToSelection(type, id) {
      if (this.isReady() && type && id != null) {
        const res = this.dispatch('Selection.Add', {
          type: String(type),
          id: String(id)
        });
        if (res && res.success) return res;
      }
      return null;
    },

    toggleSelection(type, id) {
      if (this.isReady() && type && id != null) {
        const res = this.dispatch('Selection.Toggle', {
          type: String(type),
          id: String(id)
        });
        if (res && res.success) return res;
      }
      return null;
    },

    removeFromSelection(type, id) {
      if (this.isReady() && type && id != null) {
        const res = this.dispatch('Selection.Remove', {
          type: String(type),
          id: String(id)
        });
        if (res && res.success) return res;
      }
      return null;
    },

    clearSelection() {
      if (this.isReady()) {
        const res = this.dispatch('Selection.Clear', {});
        if (res && res.success) return res;
      }
      return null;
    },

    moveNodesGroup(ids, dx, dy) {
      if (this.isReady() && Array.isArray(ids) && ids.length > 0) {
        const res = this.dispatch('Nodes.MoveGroup', {
          ids: ids.map(String),
          dx: Number(dx) || 0,
          dy: Number(dy) || 0
        });
        if (res && res.success) return res;
      }
      if (window.DiagramNodes && Array.isArray(ids)) {
        const updated = [];
        ids.forEach((id) => {
          const n = window.DiagramNodes.getNode(id);
          if (n) {
            n.x = Math.max(-50, Math.min(150, n.x + (Number(dx) || 0)));
            n.y = Math.max(-50, Math.min(150, n.y + (Number(dy) || 0)));
            window.DiagramNodes.updateNode(id, { x: n.x, y: n.y });
            updated.push(n);
          }
        });
        return { success: true, nodes: updated, count: updated.length };
      }
      return null;
    },

    alignNodes(ids, mode, canvasW = 1280, canvasH = 720) {
      if (this.isReady() && Array.isArray(ids) && ids.length >= 2) {
        const res = this.dispatch('Nodes.Align', {
          ids: ids.map(String),
          mode: String(mode),
          canvasW: Number(canvasW) || 1280,
          canvasH: Number(canvasH) || 720
        });
        if (res && res.success) return res;
      }
      if (window.DiagramNodes && Array.isArray(ids) && ids.length >= 2) {
        const nodes = ids.map((id) => window.DiagramNodes.getNode(id)).filter(Boolean);
        if (nodes.length >= 2) {
          const wCanvas = Number(canvasW) || 1280;
          const hCanvas = Number(canvasH) || 720;
          let minL = Infinity, maxR = -Infinity, minT = Infinity, maxB = -Infinity;
          nodes.forEach((n) => {
            const eff = window.DiagramNodes.getNodeEffectiveProps(n);
            const cx = (n.x / 100) * wCanvas;
            const cy = (n.y / 100) * hCanvas;
            const l = cx - eff.width / 2;
            const r = cx + eff.width / 2;
            const t = cy - eff.height / 2;
            const b = cy + eff.height / 2;
            if (l < minL) minL = l;
            if (r > maxR) maxR = r;
            if (t < minT) minT = t;
            if (b > maxB) maxB = b;
          });
          const midX = (minL + maxR) / 2;
          const midY = (minT + maxB) / 2;
          const updated = [];
          nodes.forEach((n) => {
            const eff = window.DiagramNodes.getNodeEffectiveProps(n);
            let cx = (n.x / 100) * wCanvas;
            let cy = (n.y / 100) * hCanvas;
            switch (mode) {
              case 'align-left': case 'left': cx = minL + eff.width / 2; break;
              case 'align-hcenter': case 'hcenter': cx = midX; break;
              case 'align-right': case 'right': cx = maxR - eff.width / 2; break;
              case 'align-top': case 'top': cy = minT + eff.height / 2; break;
              case 'align-vcenter': case 'vcenter': cy = midY; break;
              case 'align-bottom': case 'bottom': cy = maxB - eff.height / 2; break;
            }
            n.x = Math.round(((cx / wCanvas) * 100) * 1000) / 1000;
            n.y = Math.round(((cy / hCanvas) * 100) * 1000) / 1000;
            window.DiagramNodes.updateNode(n.id, { x: n.x, y: n.y });
            updated.push(n);
          });
          return { success: true, nodes: updated, count: updated.length };
        }
      }
      return null;
    },

    distributeNodes(ids, mode, canvasW = 1280, canvasH = 720) {
      if (this.isReady() && Array.isArray(ids) && ids.length >= 3) {
        const res = this.dispatch('Nodes.Distribute', {
          ids: ids.map(String),
          mode: String(mode),
          canvasW: Number(canvasW) || 1280,
          canvasH: Number(canvasH) || 720
        });
        if (res && res.success) return res;
      }
      if (window.DiagramNodes && Array.isArray(ids) && ids.length >= 3) {
        const nodes = ids.map((id) => window.DiagramNodes.getNode(id)).filter(Boolean);
        if (nodes.length >= 3) {
          const wCanvas = Number(canvasW) || 1280;
          const hCanvas = Number(canvasH) || 720;
          const updated = [];
          if (mode === 'distribute-horizontal' || mode === 'horizontal') {
            nodes.sort((a, b) => a.x - b.x);
            const eff0 = window.DiagramNodes.getNodeEffectiveProps(nodes[0]);
            const effN = window.DiagramNodes.getNodeEffectiveProps(nodes[nodes.length - 1]);
            const leftBound = (nodes[0].x / 100) * wCanvas - eff0.width / 2;
            const rightBound = (nodes[nodes.length - 1].x / 100) * wCanvas + effN.width / 2;
            const totalSpan = rightBound - leftBound;
            let sumW = 0;
            nodes.forEach((n) => { sumW += window.DiagramNodes.getNodeEffectiveProps(n).width; });
            const gap = (totalSpan - sumW) / (nodes.length - 1);
            let currL = leftBound;
            nodes.forEach((n, idx) => {
              const eff = window.DiagramNodes.getNodeEffectiveProps(n);
              const cx = currL + eff.width / 2;
              currL += eff.width + gap;
              if (idx > 0 && idx < nodes.length - 1) {
                n.x = Math.round(((cx / wCanvas) * 100) * 1000) / 1000;
                window.DiagramNodes.updateNode(n.id, { x: n.x, y: n.y });
              }
              updated.push(n);
            });
            return { success: true, nodes: updated, count: updated.length };
          } else {
            nodes.sort((a, b) => a.y - b.y);
            const eff0 = window.DiagramNodes.getNodeEffectiveProps(nodes[0]);
            const effN = window.DiagramNodes.getNodeEffectiveProps(nodes[nodes.length - 1]);
            const topBound = (nodes[0].y / 100) * hCanvas - eff0.height / 2;
            const btmBound = (nodes[nodes.length - 1].y / 100) * hCanvas + effN.height / 2;
            const totalSpan = btmBound - topBound;
            let sumH = 0;
            nodes.forEach((n) => { sumH += window.DiagramNodes.getNodeEffectiveProps(n).height; });
            const gap = (totalSpan - sumH) / (nodes.length - 1);
            let currT = topBound;
            nodes.forEach((n, idx) => {
              const eff = window.DiagramNodes.getNodeEffectiveProps(n);
              const cy = currT + eff.height / 2;
              currT += eff.height + gap;
              if (idx > 0 && idx < nodes.length - 1) {
                n.y = Math.round(((cy / hCanvas) * 100) * 1000) / 1000;
                window.DiagramNodes.updateNode(n.id, { x: n.x, y: n.y });
              }
              updated.push(n);
            });
            return { success: true, nodes: updated, count: updated.length };
          }
        }
      }
      return null;
    },

    createGroup(name, members) {
      if (this.isReady()) {
        if (!Array.isArray(members) || members.length < 2) {
          return { success: false, error: 'A group requires at least two members' };
        }
        const res = this.dispatch('Group.Create', { name: name || '', members });
        if (res && res.success) {
          if (window.ObjectGroups && res.group) {
            const idx = window.ObjectGroups.list.findIndex((g) => String(g.id) === String(res.group.id));
            if (idx >= 0) window.ObjectGroups.list[idx] = JSON.parse(JSON.stringify(res.group));
            else window.ObjectGroups.list.push(JSON.parse(JSON.stringify(res.group)));
          }
          return res;
        }
        return { success: false, error: (res && res.error) || this.getLastError() || 'Failed to create group in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    ungroup(groupId) {
      if (this.isReady()) {
        if (!groupId) return { success: false, error: 'Missing groupId' };
        const res = this.dispatch('Group.Ungroup', { groupId: String(groupId) });
        if (res && res.success) {
          if (window.ObjectGroups) {
            window.ObjectGroups.list = window.ObjectGroups.list.filter((g) => String(g.id) !== String(groupId));
          }
          return res;
        }
        return { success: false, error: (res && res.error) || this.getLastError() || 'Failed to ungroup in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    removeGroupMembers(groupId, members) {
      if (this.isReady()) {
        if (!groupId || !Array.isArray(members)) return { success: false, error: 'Invalid parameters' };
        const payload = {
          groupId: String(groupId),
          members: members.map((m) => ({ type: String(m.type), id: String(m.id) }))
        };
        const res = this.dispatch('Group.RemoveMembers', payload);
        if (res && res.success) {
          if (window.ObjectGroups) {
            if (res.dissolved) {
              window.ObjectGroups.list = window.ObjectGroups.list.filter((g) => String(g.id) !== String(groupId));
            } else if (res.group) {
              const idx = window.ObjectGroups.list.findIndex((g) => String(g.id) === String(groupId));
              if (idx >= 0) window.ObjectGroups.list[idx] = JSON.parse(JSON.stringify(res.group));
            }
          }
          return res;
        }
        return { success: false, error: (res && res.error) || this.getLastError() || 'Failed to remove group members in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    deleteGroup(groupId, deleteMembers = false) {
      if (this.isReady()) {
        if (!groupId) return { success: false, error: 'Missing groupId' };
        const res = this.dispatch('Group.Delete', { groupId: String(groupId), deleteMembers: !!deleteMembers });
        if (res && res.success) {
          if (window.ObjectGroups) {
            window.ObjectGroups.list = window.ObjectGroups.list.filter((g) => String(g.id) !== String(groupId));
            if (deleteMembers && res.snapshot) {
              this.syncFromEngineSnapshot(res.snapshot);
            }
          }
          return res;
        }
        return { success: false, error: (res && res.error) || this.getLastError() || 'Failed to delete group in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    renameGroup(groupId, name) {
      if (this.isReady()) {
        if (!groupId) return { success: false, error: 'Missing groupId' };
        const res = this.dispatch('Group.Rename', { groupId: String(groupId), name: String(name || '') });
        if (res && res.success) {
          if (window.ObjectGroups) {
            const grp = window.ObjectGroups.list.find((g) => String(g.id) === String(groupId));
            if (grp) grp.name = String(name || '');
          }
          return res;
        }
        return { success: false, error: (res && res.error) || this.getLastError() || 'Failed to rename group in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    getGroup(groupId) {
      if (this.isReady() && groupId) {
        const res = this.dispatch('Group.Get', { groupId: String(groupId) });
        if (res && res.found) return res.group;
      }
      if (window.ObjectGroups) {
        return window.ObjectGroups.getGroup(groupId);
      }
      return null;
    },

    listGroups() {
      if (this.isReady()) {
        const res = this.dispatch('Group.List', {});
        if (res && Array.isArray(res.groups)) {
          if (res.groupsCounter !== undefined) this._groupsCounter = res.groupsCounter;
          return res.groups;
        }
      }
      if (window.ObjectGroups) {
        return window.ObjectGroups.list;
      }
      return [];
    },

    getGroupsCounter() {
      if (this.isReady()) {
        if (this._groupsCounter !== undefined && this._groupsCounter !== null && this._groupsCounter > 0) {
          return this._groupsCounter;
        }
        const res = this.dispatch('Group.List', {});
        if (res && res.groupsCounter !== undefined) {
          this._groupsCounter = res.groupsCounter;
          return this._groupsCounter;
        }
      }
      if (window.ObjectGroups) {
        return window.ObjectGroups.counter || 0;
      }
      return 0;
    },

    syncFromEngineSnapshot(snap) {
      if (!snap) return;

      if (snap.background) {
        this._applyBackgroundUpdate(snap.background);
      } else {
        this._applyBackgroundUpdate(null);
      }

      if (window.DiagramNodes) {
        const mappedNodes = (snap.nodes || []).map((n) => {
          const item = Object.assign({}, n);
          if (!item.text && item.label) item.text = item.label;
          if (!item.label && item.text) item.label = item.text;
          if (!item.fillColor && item.fill) item.fillColor = item.fill;
          if (!item.fill && item.fillColor) item.fill = item.fillColor;
          if (!item.strokeColor && item.stroke) item.strokeColor = item.stroke;
          if (!item.stroke && item.strokeColor) item.stroke = item.strokeColor;
          if (!item.anim && item.animation) item.anim = item.animation;
          if (!item.animation && item.anim) item.animation = item.anim;
          return item;
        });
        window.DiagramNodes.setState({ nodes: mappedNodes, nodesCounter: snap.nodesCounter || (snap.nodes ? snap.nodes.length : 0) });
      }

      if (window.DataFlows) {
        const mappedFlows = (snap.flows || []).map((f) => {
          const item = Object.assign({}, f);
          if (!item.route && item.routeMode) item.route = item.routeMode;
          if (!item.routeMode && item.route) item.routeMode = item.route;
          return item;
        });
        window.DataFlows.setState({ flows: mappedFlows, flowsCounter: snap.flowsCounter || (snap.flows ? snap.flows.length : 0) });
      }

      if (window.Glows) {
        const mappedGlows = (snap.glows || []).map((g) => {
          const item = Object.assign({}, g);
          if (item.radarRings && !item.rings) item.rings = item.radarRings;
          if (item.rings && !item.radarRings) item.radarRings = item.rings;
          item.isRadar = (item.shape === 'radar') || !!item.isRadar;
          return item;
        });
        window.Glows.setState({ glows: mappedGlows, glowsCounter: snap.glowsCounter || (snap.glows ? snap.glows.length : 0) });
      }

      if (window.Ripples) {
        const mappedRipples = (snap.ripples || []).map((r) => {
          const item = Object.assign({}, r);
          if (item.waveCount && !item.rings) item.rings = item.waveCount;
          if (item.rings && !item.waveCount) item.waveCount = item.rings;
          return item;
        });
        window.Ripples.setState({ ripples: mappedRipples, ripplesCounter: snap.ripplesCounter || (snap.ripples ? snap.ripples.length : 0) });
      }

      if (window.ObjectGroups) {
        window.ObjectGroups.setState({ groups: snap.groups || [], groupsCounter: snap.groupsCounter || 0 });
      }

      if (window.ImageObjects) {
        const mappedImages = (snap.images || []).map((img) => {
          const item = Object.assign({}, img);
          if (!item.data && item.src) item.data = item.src;
          if (!item.src && item.data) item.src = item.data;
          return item;
        });
        window.ImageObjects.setState({ images: mappedImages, imagesCounter: snap.imagesCounter || 0 });
      }

      if (window.LayerManager) {
        window.LayerManager.setLayers(snap.layers || [], { skipBridge: true, skipEngineSync: true });
      }

      if (snap.canvas) {
        if (snap.canvas.width && document.getElementById('canvasWidthInput')) {
          document.getElementById('canvasWidthInput').value = snap.canvas.width;
        }
        if (snap.canvas.height && document.getElementById('canvasHeightInput')) {
          document.getElementById('canvasHeightInput').value = snap.canvas.height;
        }
        if (snap.canvas.pattern && document.getElementById('canvasPatternSelect')) {
          document.getElementById('canvasPatternSelect').value = snap.canvas.pattern;
        }
      }
      if (snap.camera && snap.camera.motion && document.getElementById('cameraMotionSelect')) {
        document.getElementById('cameraMotionSelect').value = snap.camera.motion;
      }
      if (snap.optical && snap.optical.type && document.getElementById('effectSelect')) {
        document.getElementById('effectSelect').value = snap.optical.type;
      }
      if (snap.frame) {
        const frameChk = document.getElementById('chkModuleFrame');
        if (frameChk) frameChk.checked = !!snap.frame.enabled;
        const styleSel = document.getElementById('frameStyleSelect');
        if (styleSel && snap.frame.style) styleSel.value = snap.frame.style;
      }
      if (window.ControlStateAdaptor && window.SceneState) {
        window.ControlStateAdaptor.syncFromDOM(window.SceneState.trackedControlIds);
      }
    },

    moveGroup(groupId, dx, dy) {
      if (this.isReady() && groupId) {
        const res = this.dispatch('Group.Move', {
          groupId: String(groupId),
          dx: Number(dx) || 0,
          dy: Number(dy) || 0
        });
        if (res && res.success) {
          if (res.snapshot) this.syncFromEngineSnapshot(res.snapshot);
          return res;
        }
      }
      if (window.ObjectGroups) {
        return window.ObjectGroups.moveGroup(groupId, dx, dy);
      }
      return null;
    },

    findGroupByMember(type, id) {
      if (this.isReady() && type && id != null) {
        const res = this.dispatch('Group.FindByMember', { type: String(type), id: String(id) });
        if (res && res.found) return res.group;
      }
      if (window.ObjectGroups) {
        return window.ObjectGroups.findGroupByMember(type, id);
      }
      return null;
    },

    getGroupBounds(groupId, canvasW = 1280, canvasH = 720) {
      if (this.isReady() && groupId) {
        const res = this.dispatch('Group.Bounds', {
          groupId: String(groupId),
          canvasW: Number(canvasW) || 1280,
          canvasH: Number(canvasH) || 720
        });
        if (res && res.success) return res;
      }
      if (window.ObjectGroups) {
        return window.ObjectGroups.computeBounds(groupId, canvasW, canvasH);
      }
      return null;
    },

    copySelection(items, groupId = null) {
      if (this.isReady()) {
        const res = this.dispatch('Scene.Copy', {
          items: Array.isArray(items) ? items : [],
          groupId: groupId ? String(groupId) : ''
        });
        if (res && res.success) return res.payload;
      }
      if (window.ObjectGroups) {
        return window.ObjectGroups.copySelection(items, groupId);
      }
      return null;
    },

    pastePayload(payload, offsetX = 5.0, offsetY = 5.0) {
      if (this.isReady()) {
        if (!payload) return { success: false, error: 'Missing payload' };
        const res = this.dispatch('Scene.Paste', {
          payload,
          offsetX: Number(offsetX) || 0,
          offsetY: Number(offsetY) || 0
        });
        if (res && res.success) {
          if (res.snapshot) this.syncFromEngineSnapshot(res.snapshot);
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to paste payload in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    duplicateSelection(items, groupId = null, offsetX = 5.0, offsetY = 5.0) {
      if (this.isReady()) {
        const res = this.dispatch('Scene.Duplicate', {
          items: Array.isArray(items) ? items : [],
          groupId: groupId ? String(groupId) : '',
          offsetX: Number(offsetX) || 5.0,
          offsetY: Number(offsetY) || 5.0
        });
        if (res && res.success) {
          if (res.snapshot) this.syncFromEngineSnapshot(res.snapshot);
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to duplicate selection in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    // Image Object operations
    createImage(initial) {
      const init = Object.assign({}, initial || {});
      if (init.data && !init.src) init.src = init.data;
      if (init.src && !init.data) init.data = init.src;
      if (this.isReady()) {
        const res = this.dispatch('Image.Create', { image: init });
        if (res && res.success && res.image) {
          if (window.ImageObjects) {
            const idx = window.ImageObjects.list.findIndex((i) => String(i.id) === String(res.image.id));
            if (idx >= 0) window.ImageObjects.list[idx] = res.image;
            else window.ImageObjects.list.push(res.image);
            window.ImageObjects.counter = Math.max(window.ImageObjects.counter, parseInt(String(res.image.id).replace(/\D/g, '') || '0', 10));
          }
          if (window.LayerManager) window.LayerManager.syncFromEngine();
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to create image in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    updateImage(id, patch) {
      if (this.isReady()) {
        const res = this.dispatch('Image.Update', { id: String(id), patch: patch || {} });
        if (res && res.success && res.image) {
          if (window.ImageObjects) {
            const idx = window.ImageObjects.list.findIndex((i) => String(i.id) === String(id));
            if (idx >= 0) window.ImageObjects.list[idx] = res.image;
          }
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to update image in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    cropImage(id, crop, geom, name) {
      if (this.isReady()) {
        const payload = {
          id: String(id),
          crop: Object.assign({ enabled: true }, crop),
          name: name ? String(name) : ''
        };
        if (geom) {
          if (geom.newX !== undefined) payload.newX = Number(geom.newX);
          if (geom.newY !== undefined) payload.newY = Number(geom.newY);
          if (geom.newW !== undefined) payload.newW = Number(geom.newW);
          if (geom.newH !== undefined) payload.newH = Number(geom.newH);
        }
        const res = this.dispatch('Image.Crop', payload);
        if (res && res.success && res.image) {
          if (window.ImageObjects) {
            const idx = window.ImageObjects.list.findIndex((i) => String(i.id) === String(id));
            if (idx >= 0) window.ImageObjects.list[idx] = res.image;
          }
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to crop image in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    selectCropVersion(id, versionId) {
      if (this.isReady()) {
        const res = this.dispatch('Image.CropVersionSelect', { id: String(id), versionId: String(versionId) });
        if (res && res.success && res.image) {
          if (window.ImageObjects) {
            const idx = window.ImageObjects.list.findIndex((i) => String(i.id) === String(id));
            if (idx >= 0) {
              if (!res.image.crop) delete window.ImageObjects.list[idx].crop;
              Object.assign(window.ImageObjects.list[idx], res.image);
              if (!res.image.crop) delete window.ImageObjects.list[idx].crop;
            }
          }
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to select crop version in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    renameCropVersion(id, versionId, newName) {
      if (this.isReady()) {
        const res = this.dispatch('Image.CropVersionRename', { id: String(id), versionId: String(versionId), name: String(newName) });
        if (res && res.success && res.image) {
          if (window.ImageObjects) {
            const idx = window.ImageObjects.list.findIndex((i) => String(i.id) === String(id));
            if (idx >= 0) Object.assign(window.ImageObjects.list[idx], res.image);
          }
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to rename crop version in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    deleteCropVersion(id, versionId) {
      if (this.isReady()) {
        const res = this.dispatch('Image.CropVersionDelete', { id: String(id), versionId: String(versionId) });
        if (res && res.success && res.image) {
          if (window.ImageObjects) {
            const idx = window.ImageObjects.list.findIndex((i) => String(i.id) === String(id));
            if (idx >= 0) {
              if (!res.image.crop) delete window.ImageObjects.list[idx].crop;
              Object.assign(window.ImageObjects.list[idx], res.image);
              if (!res.image.crop) delete window.ImageObjects.list[idx].crop;
            }
          }
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to delete crop version in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    commitCrop(id, options = {}) {
      if (this.isReady()) {
        const payload = {
          id: String(id),
          src: options.src || options.newSrc || '',
          newSrc: options.newSrc || options.src || '',
          assetRef: options.assetRef || options.newAssetRef || '',
          newAssetRef: options.newAssetRef || options.assetRef || '',
          filename: options.filename || options.newFilename || '',
          newFilename: options.newFilename || options.filename || '',
          mime: options.mime || options.newMime || '',
          newMime: options.newMime || options.mime || '',
          naturalWidth: Number(options.naturalWidth || options.nw || 0),
          naturalHeight: Number(options.naturalHeight || options.nh || 0),
          width: Number(options.width || options.w || 0),
          height: Number(options.height || options.h || 0),
          discardVersions: !!options.discardVersions
        };
        const res = this.dispatch('Image.CommitCrop', payload);
        if (res && res.success && res.image) {
          if (window.ImageObjects) {
            const idx = window.ImageObjects.list.findIndex((i) => String(i.id) === String(id));
            if (idx >= 0) window.ImageObjects.list[idx] = res.image;
          }
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to commit crop in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    resetCrop(id) {
      if (this.isReady()) {
        const res = this.dispatch('Image.ResetCrop', { id: String(id) });
        if (res && res.success && res.image) {
          if (window.ImageObjects) {
            const idx = window.ImageObjects.list.findIndex((i) => String(i.id) === String(id));
            if (idx >= 0) {
              delete window.ImageObjects.list[idx].crop;
              Object.assign(window.ImageObjects.list[idx], res.image);
              if (!res.image.crop) delete window.ImageObjects.list[idx].crop;
            }
          }
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to reset crop in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    clipImage(id, clip = {}) {
      if (this.isReady()) {
        const payload = {
          id: String(id),
          clip: {
            enabled: true,
            x: Math.max(0, Number(clip.x) || 0),
            y: Math.max(0, Number(clip.y) || 0),
            width: Math.max(10, Number(clip.width) || 10),
            height: Math.max(10, Number(clip.height) || 10)
          }
        };
        const res = this.dispatch('Image.Clip', payload);
        if (res && res.success && res.image) {
          if (window.ImageObjects) {
            const idx = window.ImageObjects.list.findIndex((i) => String(i.id) === String(id));
            if (idx >= 0) window.ImageObjects.list[idx] = res.image;
          }
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to clip image in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    resetClip(id) {
      if (this.isReady()) {
        const res = this.dispatch('Image.ResetClip', { id: String(id) });
        if (res && res.success && res.image) {
          if (window.ImageObjects) {
            const idx = window.ImageObjects.list.findIndex((i) => String(i.id) === String(id));
            if (idx >= 0) {
              delete window.ImageObjects.list[idx].clip;
              Object.assign(window.ImageObjects.list[idx], res.image);
              if (!res.image.clip) delete window.ImageObjects.list[idx].clip;
            }
          }
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to reset clip in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    bakeImage(imageId, mode, bakedDataUrl, canvasW, canvasH) {
      if (this.isReady()) {
        const payload = {
          imageId: String(imageId),
          mode: String(mode || 'remove'),
          bakedData: String(bakedDataUrl || ''),
          canvasWidth: Number(canvasW) || 1280,
          canvasHeight: Number(canvasH) || 720
        };
        const res = this.dispatch('Image.Bake', payload);
        if (res && res.success) {
          if (res.background) {
            this._applyBackgroundUpdate(res.background);
          }
          if (res.deletedImage) {
            if (window.ImageObjects) {
              window.ImageObjects.list = window.ImageObjects.list.filter((i) => String(i.id) !== String(imageId));
            }
            if (window.ObjectGroups) window.ObjectGroups.pruneMember('image', imageId);
            if (window.LayerManager) window.LayerManager.removeEntry('image', imageId);
            if (window.AppCoordinator) window.AppCoordinator.clearSelection();
          } else if (res.image) {
            if (window.ImageObjects) {
              const idx = window.ImageObjects.list.findIndex((i) => String(i.id) === String(imageId));
              if (idx >= 0) {
                Object.assign(window.ImageObjects.list[idx], res.image);
                window.ImageObjects.list[idx].visible = false;
              }
            }
            if (window.LayerManager && typeof window.LayerManager.setVisibility === 'function') {
              window.LayerManager.setVisibility('image', imageId, false);
            }
          }
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to bake image in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    setBackground(bg) {
      if (this.isReady()) {
        const payload = { background: bg };
        const res = this.dispatch('Background.Set', payload);
        return res;
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    getBackground() {
      if (this.isReady()) {
        const res = this.dispatch('Background.Get', {});
        return res;
      }
      return null;
    },

    cropBackground(crop, name = '') {
      if (this.isReady()) {
        const payload = {
          name: name ? String(name) : '',
          crop: Object.assign({ enabled: true }, crop)
        };
        const res = this.dispatch('Background.Crop', payload);
        if (res && res.success && res.background) {
          this._applyBackgroundUpdate(res.background);
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to crop background in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    selectBackgroundCropVersion(versionId) {
      const vId = String(versionId || 'original');
      if (this.isReady()) {
        const res = this.dispatch('Background.CropSelect', { versionId: vId });
        if (res && res.success && res.background) {
          this._applyBackgroundUpdate(res.background);
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to select background crop version in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    renameBackgroundCropVersion(versionId, name) {
      const vId = String(versionId);
      const cleanName = String(name || '').trim();
      if (!cleanName) return { success: false, error: 'Invalid name' };
      if (this.isReady()) {
        const res = this.dispatch('Background.CropRename', { versionId: vId, name: cleanName });
        if (res && res.success && res.background) {
          this._applyBackgroundUpdate(res.background);
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to rename background crop version in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    deleteBackgroundCropVersion(versionId) {
      const vId = String(versionId);
      if (vId === 'original') return { success: false, error: 'Cannot delete original crop version' };
      if (this.isReady()) {
        const res = this.dispatch('Background.CropDelete', { versionId: vId });
        if (res && res.success && res.background) {
          this._applyBackgroundUpdate(res.background);
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to delete background crop version in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    resetBackgroundCrop() {
      if (this.isReady()) {
        const res = this.dispatch('Background.CropReset', {});
        if (res && res.success && res.background) {
          this._applyBackgroundUpdate(res.background);
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to reset background crop in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    commitBackgroundCrop(options = {}) {
      if (this.isReady()) {
        const payload = {
          newB64: options.newB64 || options.b64 || '',
          discardVersions: !!options.discardVersions
        };
        const res = this.dispatch('Background.CropCommit', payload);
        if (res && res.success && res.background) {
          this._applyBackgroundUpdate(res.background);
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to commit background crop in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    _applyBackgroundUpdate(bg) {
      if (!bg) return;
      let photo = window.SceneState ? window.SceneState.getLoadedPhoto() : null;
      if (!photo && window.getLoadedPhoto) photo = window.getLoadedPhoto();
      if (!photo) {
        photo = {
          filename: bg.filename || 'background.png',
          mime: bg.mime || 'image/png',
          naturalWidth: bg.naturalWidth || 1280,
          naturalHeight: bg.naturalHeight || 720
        };
      }
      photo.crop = bg.crop || null;
      photo.cropVersions = Array.isArray(bg.cropVersions) ? bg.cropVersions : [];
      photo.activeCropVersionId = bg.activeCropVersionId || 'original';
      if (bg.naturalWidth) photo.naturalWidth = bg.naturalWidth;
      if (bg.naturalHeight) photo.naturalHeight = bg.naturalHeight;
      if (bg.b64) {
        photo.b64 = bg.b64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
        photo.src = bg.src || bg.data || ('data:' + (bg.mime || photo.mime || 'image/png') + ';base64,' + photo.b64);
        photo.dataUrl = photo.src;
      } else if (bg.src || bg.data) {
        photo.src = bg.src || bg.data;
        photo.dataUrl = photo.src;
        if (photo.src.startsWith('data:image/')) {
          photo.b64 = photo.src.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
        }
      }
      if (window.hydrateLoadedPhoto && typeof window.hydrateLoadedPhoto === 'function') {
        window.hydrateLoadedPhoto(photo);
      } else if (window.setLoadedPhoto && typeof window.setLoadedPhoto === 'function') {
        window.setLoadedPhoto(photo, { hydrateOnly: true });
      }
      if (window.triggerRender) window.triggerRender();
    },

    deleteImage(id) {
      if (this.isReady()) {
        const res = this.dispatch('Image.Delete', { id: String(id) });
        if (res && res.success) {
          if (window.ImageObjects) {
            window.ImageObjects.list = window.ImageObjects.list.filter((i) => String(i.id) !== String(id));
          }
          if (window.ObjectGroups) window.ObjectGroups.pruneMember('image', id);
          if (window.LayerManager) window.LayerManager.removeEntry('image', id);
          return res;
        }
        return { success: false, error: (res && res.error) || 'Failed to delete image in Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    getImage(id) {
      if (this.isReady()) {
        const res = this.dispatch('Image.Get', { id: String(id) });
        if (res && res.found) return res.image;
      }
      if (window.ImageObjects) return window.ImageObjects.getImage(id);
      return null;
    },

    listImages() {
      if (this.isReady()) {
        const res = this.dispatch('Image.List', {});
        if (res && Array.isArray(res.images)) return res.images;
      }
      if (window.ImageObjects) return window.ImageObjects.getAll();
      return [];
    },

    // Layer operations
    getLayers() {
      if (this.isReady()) {
        const res = this.dispatch('Layer.Get', {});
        if (res && Array.isArray(res.layers)) return res.layers;
      }
      if (window.LayerManager) return window.LayerManager.getLayers();
      return [];
    },

    setLayers(layers) {
      if (this.isReady()) {
        const res = this.dispatch('Layer.Set', { layers });
        if (res && res.success) return res;
        return { success: false, error: (res && res.error) || 'Layer.Set dispatch failed' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    normalizeLayerTargets(rawTargets) {
      if (!rawTargets) {
        return { valid: false, error: 'No target objects specified for layer reordering', targets: [] };
      }

      const VALID_TYPES = new Set(['node', 'flow', 'glow', 'ripple', 'image', 'group']);
      let candidates = [];

      if (!Array.isArray(rawTargets) && typeof rawTargets === 'object') {
        if (rawTargets.type === 'group' && rawTargets.id != null) {
          candidates = [{ type: 'group', id: rawTargets.id }];
        } else if (Array.isArray(rawTargets.items) && rawTargets.items.length > 0) {
          candidates = rawTargets.items;
        } else if (rawTargets.type && rawTargets.id != null) {
          candidates = [rawTargets];
        } else {
          return { valid: false, error: 'Malformed layer target object: missing type or id', targets: [] };
        }
      } else if (Array.isArray(rawTargets)) {
        candidates = rawTargets;
      } else if (typeof rawTargets === 'string') {
        const str = rawTargets.trim();
        if (str.startsWith('group-') || str.startsWith('group:')) {
          candidates = [{ type: 'group', id: str.replace(/^group:/, '') }];
        } else if (str.includes(':')) {
          const parts = str.split(':');
          candidates = [{ type: parts[0], id: parts[1] }];
        } else {
          return { valid: false, error: `Invalid layer target string representation: "${rawTargets}"`, targets: [] };
        }
      } else {
        return { valid: false, error: 'Invalid layer targets: expected array or object reference', targets: [] };
      }

      if (candidates.length === 0) {
        return { valid: false, error: 'No target objects specified for layer reordering', targets: [] };
      }

      const seen = new Set();
      const normalized = [];

      for (let i = 0; i < candidates.length; i++) {
        const item = candidates[i];
        if (!item || typeof item !== 'object') {
          return { valid: false, error: `Invalid layer target at index ${i}: expected object`, targets: [] };
        }

        const t = typeof item.type === 'string' ? item.type.toLowerCase().trim() : '';
        if (!VALID_TYPES.has(t)) {
          return { valid: false, error: `Invalid layer target type at index ${i}: "${item.type}"`, targets: [] };
        }

        if (item.id === null || item.id === undefined || String(item.id).trim() === '') {
          return { valid: false, error: `Missing or empty ID for layer target at index ${i} (${t})`, targets: [] };
        }

        const idStr = String(item.id).trim();
        const key = `${t}:${idStr}`;
        if (!seen.has(key)) {
          seen.add(key);
          normalized.push({ type: t, id: idStr });
        }
      }

      if (normalized.length === 0) {
        return { valid: false, error: 'No valid target objects found', targets: [] };
      }

      return { valid: true, targets: normalized };
    },

    bringToFront(targets) {
      const norm = this.normalizeLayerTargets(targets);
      if (!norm.valid) {
        console.error('[EngineBridge] Layer.BringToFront validation error:', norm.error);
        return { success: false, error: norm.error };
      }
      if (this.isReady()) {
        const res = this.dispatch('Layer.BringToFront', { targets: norm.targets });
        if (res && res.success) {
          if (window.LayerManager) window.LayerManager.syncFromEngine();
          return res;
        }
        return { success: false, error: (res && res.error) || 'Layer.BringToFront dispatch failed' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    sendToBack(targets) {
      const norm = this.normalizeLayerTargets(targets);
      if (!norm.valid) {
        console.error('[EngineBridge] Layer.SendToBack validation error:', norm.error);
        return { success: false, error: norm.error };
      }
      if (this.isReady()) {
        const res = this.dispatch('Layer.SendToBack', { targets: norm.targets });
        if (res && res.success) {
          if (window.LayerManager) window.LayerManager.syncFromEngine();
          return res;
        }
        return { success: false, error: (res && res.error) || 'Layer.SendToBack dispatch failed' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    bringForward(targets) {
      const norm = this.normalizeLayerTargets(targets);
      if (!norm.valid) {
        console.error('[EngineBridge] Layer.BringForward validation error:', norm.error);
        return { success: false, error: norm.error };
      }
      if (this.isReady()) {
        const res = this.dispatch('Layer.BringForward', { targets: norm.targets });
        if (res && res.success) {
          if (window.LayerManager) window.LayerManager.syncFromEngine();
          return res;
        }
        return { success: false, error: (res && res.error) || 'Layer.BringForward dispatch failed' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    sendBackward(targets) {
      const norm = this.normalizeLayerTargets(targets);
      if (!norm.valid) {
        console.error('[EngineBridge] Layer.SendBackward validation error:', norm.error);
        return { success: false, error: norm.error };
      }
      if (this.isReady()) {
        const res = this.dispatch('Layer.SendBackward', { targets: norm.targets });
        if (res && res.success) {
          if (window.LayerManager) window.LayerManager.syncFromEngine();
          return res;
        }
        return { success: false, error: (res && res.error) || 'Layer.SendBackward dispatch failed' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    setLayerVisibility(type, id, visible) {
      if (this.isReady()) {
        return this.dispatch('Layer.SetVisibility', { type, id: String(id), visible: !!visible });
      }
      return null;
    },

    setLayerLocked(type, id, locked) {
      if (this.isReady()) {
        return this.dispatch('Layer.SetLocked', { type, id: String(id), locked: !!locked });
      }
      return null;
    },

    getEffectiveLayer(type, id) {
      if (this.isReady()) {
        const res = this.dispatch('Layer.GetEffective', { type, id: String(id) });
        if (res) return res;
      }
      if (window.LayerManager) return window.LayerManager.getEffective(type, id);
      return { visible: true, locked: false };
    },

    recordHistory(snapshot = null, selection = null) {
      if (this.isReady()) {
        const payload = {};
        if (snapshot) payload.snapshot = snapshot;
        if (selection) payload.selection = selection;
        const res = this.dispatch('History.Record', payload);
        if (res) return res;
      }
      return null;
    },

    undoHistory() {
      if (this.isReady()) {
        const res = this.dispatch('History.Undo', {});
        if (res) return res;
      }
      return null;
    },

    redoHistory() {
      if (this.isReady()) {
        const res = this.dispatch('History.Redo', {});
        if (res) return res;
      }
      return null;
    },

    getHistoryState() {
      if (this.isReady()) {
        const res = this.dispatch('History.GetState', {});
        if (res) return res;
      }
      return null;
    },

    clearHistory() {
      if (this.isReady()) {
        const res = this.dispatch('History.Clear', {});
        if (res) return res;
      }
      return null;
    },

    resetScene() {
      if (this.isReady()) {
        const res = this.dispatch('Scene.Reset', {});
        if (res && res.success) {
          if (res.snapshot) {
            this.syncFromEngineSnapshot(res.snapshot);
          }
          return res;
        }
      }
      return null;
    },

    getSceneState() {
      if (this.isReady()) {
        const res = this.dispatch('Scene.GetState', {});
        if (res) return res;
      }
      return null;
    },

    encodeSVA(name, description, stateObj) {
      if (this.isReady()) {
        const res = this.dispatch('Project.EncodeSVA', {
          name: String(name || 'Untitled Project'),
          description: String(description || ''),
          state: stateObj || null
        });
        if (res && res.success) return res;
      }
      return null;
    },

    decodeSVA(b64Data) {
      if (this.isReady() && b64Data) {
        const res = this.dispatch('Project.DecodeSVA', {
          dataB64: String(b64Data)
        });
        if (res && res.success) return res;
      }
      return null;
    },

    validateSVA(b64Data) {
      if (this.isReady() && b64Data) {
        const res = this.dispatch('Project.ValidateSVA', {
          dataB64: String(b64Data)
        });
        if (res && res.success) return res;
      }
      return null;
    },

    getActiveEngineName() {
      if (!this.isReady()) return 'JS fallback';
      if (this._lastSyncError) return 'Sync Failed (JS fallback)';
      if (!this._sceneSynced) return 'WASM (Syncing...)';
      if (this._lastEngineUsed === 'WASM') return 'WASM';
      return 'WASM (Ready)';
    },

    getFrameEvaluationStats() {
      return {
        activeEngine: this.getActiveEngineName(),
        sceneSynced: this._sceneSynced,
        lastSyncError: this._lastSyncError,
        framesEvaluated: this._stats.framesEvaluated,
        avgDurationMs: this._stats.totalCalls > 0
          ? Number((this._stats.totalDurationMs / this._stats.totalCalls).toFixed(3))
          : 0,
        lastDurationMs: this._stats.lastDurationMs
      };
    },

    normalizeSceneSnapshot(raw) {
      if (!raw || typeof raw !== 'object') {
        raw = {};
      }
      const canvasRaw = raw.canvas || {};
      const cameraRaw = raw.camera || {};

      const width = Number(canvasRaw.width) || 1280;
      const height = Number(canvasRaw.height) || 720;
      const duration = Number(canvasRaw.duration) || 7.0;
      const loop = String(canvasRaw.loop || canvasRaw.playbackMode || 'once');
      const pattern = String(canvasRaw.pattern || 'blueprint');
      const gridColor = String(canvasRaw.gridColor || '#1e293b');
      const gridSize = Number(canvasRaw.gridSize) || 40;
      const bgColor = String(canvasRaw.bgColor || '#0d1117');
      const transparent = !!(canvasRaw.transparent || canvasRaw.bgTransparent);

      const motion = String(cameraRaw.motion || 'static');
      const camDuration = Number(cameraRaw.camDuration || cameraRaw.duration) || duration;
      const camLoop = String(cameraRaw.camLoop || cameraRaw.loop || loop);
      const startX = Number(cameraRaw.startX) || 50;
      const startY = Number(cameraRaw.startY) || 50;
      const startZoom = Number(cameraRaw.startZoom) || 1.0;
      const endX = Number(cameraRaw.endX) || 60;
      const endY = Number(cameraRaw.endY) || 40;
      const endZoom = Number(cameraRaw.endZoom) || 1.3;
      const sway = Number(cameraRaw.sway) || 1.4;
      const breathe = Number(cameraRaw.breathe) || 1.8;
      const tiltX = Number(cameraRaw.tiltX) || 0;
      const tiltY = Number(cameraRaw.tiltY) || 0;

      let background = null;
      const rawBg = raw.background || raw.loadedPhoto || null;
      if (rawBg && typeof rawBg === 'object') {
        let crop = undefined;
        if (rawBg.crop && typeof rawBg.crop === 'object') {
          crop = {
            enabled: rawBg.crop.enabled !== false,
            sourceX: Number(rawBg.crop.sourceX) || 0,
            sourceY: Number(rawBg.crop.sourceY) || 0,
            sourceWidth: Number(rawBg.crop.sourceWidth) || 0,
            sourceHeight: Number(rawBg.crop.sourceHeight) || 0
          };
        }
        let cropVersions = [];
        if (Array.isArray(rawBg.cropVersions)) {
          cropVersions = rawBg.cropVersions.map((v) => ({
            id: String(v.id || ''),
            name: String(v.name || ''),
            sourceX: Number(v.sourceX) || 0,
            sourceY: Number(v.sourceY) || 0,
            sourceWidth: Number(v.sourceWidth) || 0,
            sourceHeight: Number(v.sourceHeight) || 0
          }));
        }
        background = {
          assetRef: String(rawBg.assetRef || ''),
          filename: String(rawBg.filename || ''),
          mime: String(rawBg.mime || 'image/png'),
          src: String(rawBg.src || rawBg.data || ''),
          data: String(rawBg.data || rawBg.src || ''),
          b64: String(rawBg.b64 || ''),
          sourceWidth: Number(rawBg.sourceWidth || rawBg.naturalWidth) || 0,
          sourceHeight: Number(rawBg.sourceHeight || rawBg.naturalHeight) || 0,
          naturalWidth: Number(rawBg.naturalWidth || rawBg.sourceWidth) || 0,
          naturalHeight: Number(rawBg.naturalHeight || rawBg.sourceHeight) || 0,
          activeCropVersionId: String(rawBg.activeCropVersionId || rawBg.activeCropVersionID || ''),
          crop: crop,
          cropVersions: cropVersions
        };
      }

      const nodes = Array.isArray(raw.nodes) ? raw.nodes.map((n) => ({
        id: String(n.id != null ? n.id : ''),
        name: n.name != null ? String(n.name) : undefined,
        shape: String(n.shape || 'rounded'),
        label: String(n.label || n.text || ''),
        text: String(n.text || n.label || ''),
        subtext: String(n.subtext || ''),
        x: Number(n.x) || 0,
        y: Number(n.y) || 0,
        width: Number(n.width) || 170,
        height: Number(n.height) || 80,
        fill: String(n.fill || n.fillColor || '#161b22'),
        fillColor: String(n.fillColor || n.fill || '#161b22'),
        fillOpacity: Number(n.fillOpacity != null ? n.fillOpacity : 0.92),
        stroke: String(n.stroke || n.strokeColor || '#58a6ff'),
        strokeColor: String(n.strokeColor || n.stroke || '#58a6ff'),
        strokeWidth: Number(n.strokeWidth != null ? n.strokeWidth : 2),
        strokeStyle: String(n.strokeStyle || 'solid'),
        textColor: String(n.textColor || '#e6edf3'),
        fontSize: Number(n.fontSize) || 15,
        animation: String(n.animation || n.anim || 'none'),
        anim: String(n.anim || n.animation || 'none'),
        visible: n.visible !== undefined ? n.visible : true,
        locked: !!n.locked
      })) : [];

      const flows = Array.isArray(raw.flows) ? raw.flows.map((f) => ({
        id: String(f.id != null ? f.id : ''),
        name: f.name != null ? String(f.name) : undefined,
        fromNodeId: String(f.fromNodeId != null ? f.fromNodeId : ''),
        toNodeId: String(f.toNodeId != null ? f.toNodeId : ''),
        nodes: Array.isArray(f.nodes)
          ? f.nodes.map((pt) => ({ x: Number(pt.x) || 0, y: Number(pt.y) || 0 }))
          : [],
        curvature: Number(f.curvature) || 0,
        routeMode: String(f.routeMode || f.route || 'curve'),
        route: String(f.route || f.routeMode || 'curve'),
        lineWidth: Number(f.lineWidth != null ? f.lineWidth : 2.5),
        lineStyle: String(f.lineStyle || 'dashed'),
        arrow: String(f.arrow || 'none'),
        color: String(f.color || '#00ffcc'),
        opacity: Number(f.opacity != null ? f.opacity : 1.0),
        speed: Number(f.speed != null ? f.speed : 2.0),
        delay: Number(f.delay) || 0,
        endDelay: Number(f.endDelay) || 0,
        hideOnDelay: f.hideOnDelay !== false,
        scale: Number(f.scale != null ? f.scale : 1.0),
        type: String(f.type || 'orb'),
        showLine: f.showLine !== false,
        glow: Number(f.glow) || 0,
        label: String(f.label || ''),
        customB64: String(f.customB64 || ''),
        customMime: String(f.customMime || ''),
        customW: Number(f.customW) || 0,
        customH: Number(f.customH) || 0,
        visible: f.visible !== undefined ? f.visible : true,
        locked: !!f.locked
      })) : [];

      const glows = Array.isArray(raw.glows) ? raw.glows.map((g) => ({
        id: String(g.id != null ? g.id : ''),
        name: g.name != null ? String(g.name) : undefined,
        shape: String(g.shape || 'circle'),
        x: Number(g.x) || 0,
        y: Number(g.y) || 0,
        size: Number(g.size != null ? g.size : 25),
        color: String(g.color || '#ff0044'),
        opacity: Number(g.opacity != null ? g.opacity : 1.0),
        dur: Number(g.dur != null ? g.dur : 2.0),
        delay: Number(g.delay) || 0,
        endDelay: Number(g.endDelay) || 0,
        playback: String(g.playback || 'pingpong'),
        isRadar: (g.shape === 'radar') || !!g.isRadar,
        radarRings: Number(g.rings || g.radarRings || 1),
        rings: Number(g.rings || g.radarRings || 1),
        radarStagger: Number(g.radarStagger != null ? g.radarStagger : 0.25),
        scale: Number(g.scale != null ? g.scale : 1.0),
        blur: Number(g.blur != null ? g.blur : 50),
        thick: Number(g.thick != null ? g.thick : 2),
        coreR: Number(g.coreR != null ? g.coreR : 5),
        hideOnDelay: g.hideOnDelay !== false,
        customB64: String(g.customB64 || ''),
        customMime: String(g.customMime || ''),
        customW: Number(g.customW) || 0,
        customH: Number(g.customH) || 0,
        visible: g.visible !== undefined ? g.visible : true,
        locked: !!g.locked
      })) : [];

      const ripples = Array.isArray(raw.ripples) ? raw.ripples.map((r) => ({
        id: String(r.id != null ? r.id : ''),
        name: r.name != null ? String(r.name) : undefined,
        color: String(r.color || '#ffffff'),
        opacity: Number(r.opacity != null ? r.opacity : 0.4),
        innerR: Number(r.innerR) || 0,
        outerR: Number(r.outerR != null ? r.outerR : 150),
        dur: Number(r.dur != null ? r.dur : 3.0),
        delay: Number(r.delay) || 0,
        endDelay: Number(r.endDelay) || 0,
        waveCount: Number(r.rings || r.waveCount || 3),
        rings: Number(r.rings || r.waveCount || 3),
        thick: Number(r.thick != null ? r.thick : 8),
        refraction: Number(r.refraction != null ? r.refraction : 35),
        x: Number(r.x) || 0,
        y: Number(r.y) || 0,
        visible: r.visible !== undefined ? r.visible : true,
        locked: !!r.locked
      })) : [];

      const opticalRaw = raw.optical || {};
      const optical = {
        type: String(opticalRaw.type || 'none'),
        startBlur: Number(opticalRaw.startBlur) || 0,
        endBlur: Number(opticalRaw.endBlur) || 0,
        focusDur: Number(opticalRaw.focusDur) || 0,
        tsShape: String(opticalRaw.tsShape || 'horizontal'),
        tsPosX: Number(opticalRaw.tsPosX) || 50,
        tsPos: Number(opticalRaw.tsPos) || 50,
        tsWidth: Number(opticalRaw.tsWidth) || 20,
        tsBlur: Number(opticalRaw.tsBlur) || 12,
        mbInt: Number(opticalRaw.mbInt) || 0,
        mbAng: Number(opticalRaw.mbAng) || 0
      };

      const frameRaw = raw.frame || raw.overlays || {};
      const frame = {
        frame: !!(frameRaw.frame != null ? frameRaw.frame : frameRaw.enabled),
        frameStyle: String(frameRaw.frameStyle || frameRaw.style || 'walnut'),
        frameDepth: Number(frameRaw.frameDepth || frameRaw.depth) || 44,
        frameLighting: frameRaw.frameLighting != null ? !!frameRaw.frameLighting : (frameRaw.lighting != null ? !!frameRaw.lighting : true),
        frameLightDir: String(frameRaw.frameLightDir || frameRaw.lightDir || 'tl'),
        frameLightInt: Number(frameRaw.frameLightInt != null ? frameRaw.frameLightInt : (frameRaw.lightInt != null ? frameRaw.lightInt : 70)),
        frameShadow: Number(frameRaw.frameShadow != null ? frameRaw.frameShadow : (frameRaw.shadow != null ? frameRaw.shadow : 0.55)),
        frameFillet: frameRaw.frameFillet != null ? !!frameRaw.frameFillet : (frameRaw.fillet != null ? !!frameRaw.fillet : true)
      };

      const rawGroups = Array.isArray(raw.groups) ? raw.groups : [];
      const groups = rawGroups.map((g) => ({
        id: String(g.id || ''),
        name: String(g.name || ''),
        members: Array.isArray(g.members)
          ? g.members.map((m) => ({ type: String(m.type || ''), id: String(m.id || '') }))
          : [],
        metadata: (g.metadata && typeof g.metadata === 'object') ? g.metadata : undefined
      }));
      let groupsCounter = Number(raw.groupsCounter) || 0;
      if (groupsCounter === 0 && groups.length > 0) {
        groups.forEach((g) => {
          const m = String(g.id).match(/group-(\d+)/);
          if (m) {
            const num = parseInt(m[1], 10);
            if (num > groupsCounter) groupsCounter = num;
          }
        });
      }

      const rawImages = Array.isArray(raw.images) ? raw.images : [];
      const images = rawImages.map((img) => ({
        id: String(img.id || ''),
        name: String(img.name || img.filename || ('Image ' + (img.id || ''))),
        filename: String(img.filename || ''),
        mime: String(img.mime || 'image/png'),
        assetRef: String(img.assetRef || ''),
        src: String(img.src || img.data || ''),
        data: String(img.data || img.src || ''),
        x: typeof img.x === 'number' ? img.x : 50.0,
        y: typeof img.y === 'number' ? img.y : 50.0,
        width: Number(img.width) || 200,
        height: Number(img.height) || 150,
        naturalWidth: Number(img.naturalWidth) || 0,
        naturalHeight: Number(img.naturalHeight) || 0,
        maintainAspectRatio: img.maintainAspectRatio !== undefined ? !!img.maintainAspectRatio : true,
        opacity: typeof img.opacity === 'number' ? img.opacity : 1.0,
        visible: img.visible !== undefined ? img.visible : true,
        locked: !!img.locked,
        crop: (img.crop && typeof img.crop === 'object') ? {
          enabled: !!img.crop.enabled,
          sourceX: Number(img.crop.sourceX) || 0,
          sourceY: Number(img.crop.sourceY) || 0,
          sourceWidth: Number(img.crop.sourceWidth) || 0,
          sourceHeight: Number(img.crop.sourceHeight) || 0,
          origX: Number(img.crop.origX) || 0,
          origY: Number(img.crop.origY) || 0,
          origWidth: Number(img.crop.origWidth) || 0,
          origHeight: Number(img.crop.origHeight) || 0
        } : undefined,
        cropVersions: Array.isArray(img.cropVersions) ? img.cropVersions.map((v) => ({
          id: String(v.id || ''),
          name: String(v.name || ''),
          sourceX: Number(v.sourceX) || 0,
          sourceY: Number(v.sourceY) || 0,
          sourceWidth: Number(v.sourceWidth) || 0,
          sourceHeight: Number(v.sourceHeight) || 0,
          width: Number(v.width) || 0,
          height: Number(v.height) || 0,
          x: Number(v.x) || 0,
          y: Number(v.y) || 0,
          origX: Number(v.origX) || 0,
          origY: Number(v.origY) || 0,
          origWidth: Number(v.origWidth) || 0,
          origHeight: Number(v.origHeight) || 0
        })) : [],
        activeCropVersionId: String(img.activeCropVersionId || img.activeCropVersionID || ''),
        clip: (img.clip && typeof img.clip === 'object') ? {
          enabled: !!img.clip.enabled,
          x: Number(img.clip.x) || 0,
          y: Number(img.clip.y) || 0,
          width: Number(img.clip.width) || 0,
          height: Number(img.clip.height) || 0
        } : undefined,
        metadata: (img.metadata && typeof img.metadata === 'object') ? img.metadata : undefined
      }));
      let imagesCounter = Number(raw.imagesCounter) || 0;
      if (imagesCounter === 0 && images.length > 0) {
        images.forEach((img) => {
          const m = String(img.id).match(/image-(\d+)/);
          if (m) {
            const num = parseInt(m[1], 10);
            if (num > imagesCounter) imagesCounter = num;
          }
        });
      }

      const rawLayers = Array.isArray(raw.layers) ? raw.layers : [];
      const layers = rawLayers.map((l) => ({
        type: String(l.type || ''),
        id: String(l.id || '')
      }));

      return {
        revision: Number(raw.revision) || Date.now(),
        canvas: {
          width: width,
          height: height,
          duration: duration,
          loop: loop,
          pattern: pattern,
          gridColor: gridColor,
          gridSize: gridSize,
          bgColor: bgColor,
          transparent: transparent,
          bgTransparent: transparent
        },
        background: background,
        camera: {
          motion: motion,
          camDuration: camDuration,
          camLoop: camLoop,
          startX: startX,
          startY: startY,
          startZoom: startZoom,
          endX: endX,
          endY: endY,
          endZoom: endZoom,
          sway: sway,
          breathe: breathe,
          tiltX: tiltX,
          tiltY: tiltY
        },
        optical: optical,
        frame: frame,
        overlays: frame,
        nodes: nodes,
        flows: flows,
        glows: glows,
        ripples: ripples,
        groups: groups,
        groupsCounter: groupsCounter,
        images: images,
        imagesCounter: imagesCounter,
        layers: layers
      };
    },

    buildCurrentSceneSnapshot() {
      const rs = (typeof window !== 'undefined' && window.SceneState && typeof window.SceneState.buildRenderState === 'function')
        ? window.SceneState.buildRenderState()
        : null;
      const cw = (rs && rs.image && rs.image.width) || 1280;
      const ch = (rs && rs.image && rs.image.height) || 720;
      const dur = (rs && rs.duration) || 7.0;
      const loop = (rs && rs.loop) || 'once';
      const cam = (rs && rs.camera) || { motion: 'static', startX: 50, startY: 50, startZoom: 1.0 };
      const optical = (rs && rs.optical) || {};
      const overlays = (rs && rs.overlays) || {};

      const bg = (typeof window !== 'undefined' && window.SceneState && typeof window.SceneState.getLoadedPhoto === 'function')
        ? window.SceneState.getLoadedPhoto()
        : (typeof window !== 'undefined' && typeof window.getLoadedPhoto === 'function' ? window.getLoadedPhoto() : null);

      const nodes = (typeof window !== 'undefined' && window.DiagramNodes && Array.isArray(window.DiagramNodes.list))
        ? window.DiagramNodes.list
        : [];
      const flows = (typeof window !== 'undefined' && window.DataFlows && Array.isArray(window.DataFlows.list))
        ? window.DataFlows.list
        : [];
      const glows = (typeof window !== 'undefined' && window.Glows && Array.isArray(window.Glows.list))
        ? window.Glows.list
        : [];
      const ripples = (typeof window !== 'undefined' && window.Ripples && Array.isArray(window.Ripples.list))
        ? window.Ripples.list
        : [];

      let groups = [];
      let groupsCounter = 0;
      if (typeof window !== 'undefined' && window.ObjectGroups && Array.isArray(window.ObjectGroups.list)) {
        groups = window.ObjectGroups.list;
        groupsCounter = window.ObjectGroups.counter || 0;
      } else if (this.isReady()) {
        groups = this.listGroups() || [];
        groupsCounter = this.getGroupsCounter() || 0;
      }

      const images = (typeof window !== 'undefined' && window.ImageObjects && Array.isArray(window.ImageObjects.list))
        ? window.ImageObjects.list
        : [];
      const imagesCounter = (typeof window !== 'undefined' && window.ImageObjects) ? (window.ImageObjects.counter || 0) : 0;
      const layers = (typeof window !== 'undefined' && window.LayerManager && Array.isArray(window.LayerManager.list))
        ? window.LayerManager.list
        : [];

      return this.normalizeSceneSnapshot({
        revision: Date.now(),
        canvas: {
          width: cw,
          height: ch,
          duration: dur,
          loop: loop
        },
        camera: cam,
        background: bg,
        optical: optical,
        frame: overlays,
        overlays: overlays,
        nodes: nodes,
        flows: flows,
        glows: glows,
        ripples: ripples,
        groups: groups,
        groupsCounter: groupsCounter,
        images: images,
        imagesCounter: imagesCounter,
        layers: layers
      });
    },

    syncScene(snapshot) {
      this._sceneCache = this.normalizeSceneSnapshot(snapshot || this.buildCurrentSceneSnapshot());
      if (this.isReady()) {
        const res = this.dispatch('Scene.SetState', this._sceneCache);
        if (res && res.status === 'ok') {
          this._sceneSynced = true;
          this._lastSyncError = null;
          this._lastSyncErrorLogged = null;
          this._syncRevision = res.revision;
          return true;
        } else {
          this._sceneSynced = false;
          this._lastSyncError = (res && res.error) || 'Failed to sync scene';
          if (this._lastSyncError !== this._lastSyncErrorLogged) {
            console.warn('[EngineBridge] Scene synchronization failed; falling back to JavaScript engine:', this._lastSyncError);
            this._lastSyncErrorLogged = this._lastSyncError;
          }
          return false;
        }
      }
      this._sceneSynced = false;
      return false;
    },

    evaluateSceneAtTime(timeSec) {
      const t = Number(timeSec) || 0;
      if (!this._sceneCache) {
        this._sceneCache = this.buildCurrentSceneSnapshot();
      }

      if (this.isReady() && !this._lastSyncError) {
        const res = this.dispatch('Timeline.EvaluateSceneAtTime', { time: t });
        if (res && res.flows) {
          this._stats.framesEvaluated++;
          this._lastEngineUsed = 'WASM';
          this._lastValidFrame = res;
          return res;
        } else {
          // If Go evaluation failed, do not silently fallback to competing JS mathematics
          console.error('[EngineBridge] Timeline.EvaluateSceneAtTime failed in Go engine:', res);
          this._lastEngineUsed = 'Go Error';
          return { success: false, error: (res && res.error) || 'Timeline evaluation failed in Go engine', flows: [], glows: [], ripples: [], nodes: [] };
        }
      }

      // Standalone export runtime or explicit simulated sync failure
      if (this.status === 'fallback' || this._lastSyncError) {
        this._stats.framesEvaluated++;
        this._lastEngineUsed = this._lastSyncError ? 'Sync failed (JS fallback)' : 'JS fallback';
        return this._evaluateSceneAtTimeJS(this._sceneCache, t);
      }

      return { error: 'Go WebAssembly engine is not ready', flows: [], glows: [], ripples: [] };
    },

    evaluateBatch(times) {
      if (!Array.isArray(times) || times.length === 0) return [];
      if (!this._sceneCache) {
        this._sceneCache = this.buildCurrentSceneSnapshot();
      }

      if (this.isReady() && !this._lastSyncError) {
        const res = this.dispatch('Timeline.EvaluateBatch', { times: times });
        if (Array.isArray(res)) {
          this._stats.framesEvaluated += times.length;
          this._lastEngineUsed = 'WASM';
          return res;
        }
        return [];
      }

      if (this.status === 'fallback' || this._lastSyncError) {
        this._stats.framesEvaluated += times.length;
        this._lastEngineUsed = this._lastSyncError ? 'Sync failed (JS fallback)' : 'JS fallback';
        return times.map((t) => this._evaluateSceneAtTimeJS(this._sceneCache, t));
      }

      return [];
    },

    _solveCubicBezierJS(x1, y1, x2, y2, x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      if (x1 === y1 && x2 === y2) return x;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const cx = 3 * x1;
        const bx = 3 * (x2 - x1) - cx;
        const ax = 1 - cx - bx;
        const currentX = ((ax * t + bx) * t + cx) * t - x;
        if (Math.abs(currentX) < 1e-6) break;
        const deriv = (3 * ax * t + 2 * bx) * t + cx;
        if (Math.abs(deriv) < 1e-6) break;
        t -= currentX / deriv;
      }
      t = Math.max(0, Math.min(1, t));
      const cy = 3 * y1;
      const by = 3 * (y2 - y1) - cy;
      const ay = 1 - cy - by;
      return ((ay * t + by) * t + cy) * t;
    },

    _evaluateTimelineProgressJS(timeSec, duration, loopMode) {
      if (duration <= 0 || timeSec <= 0) return { progress: 0, cycle: 0, isReverse: false };
      if (loopMode === 'once') {
        return { progress: Math.min(1.0, timeSec / duration), cycle: 0, isReverse: false };
      }
      const cycles = Math.floor(timeSec / duration);
      const rem = (timeSec - cycles * duration) / duration;
      if (loopMode === 'pingpong' && cycles % 2 === 1) {
        return { progress: 1.0 - rem, cycle: cycles, isReverse: true };
      }
      return { progress: Math.max(0, Math.min(1, rem)), cycle: cycles, isReverse: false };
    },

    _evaluateCycleJS(timeSec, startDelay, dur, endDelay, mode) {
      if (dur <= 0 || timeSec < startDelay) return { progress: 0, active: false };
      const localTime = timeSec - startDelay;
      const totalCycle = dur + endDelay;
      if (totalCycle <= 0) return { progress: 0, active: false };

      if (mode === 'once') {
        if (localTime >= dur) return { progress: 1.0, active: false };
        return { progress: localTime / dur, active: true };
      }

      const cycleNum = Math.floor(localTime / totalCycle);
      const tInCycle = localTime - cycleNum * totalCycle;
      const isPingPongRev = (mode === 'pingpong') && (cycleNum % 2 === 1);

      if (tInCycle <= dur) {
        const rawP = Math.max(0, Math.min(1, tInCycle / dur));
        return { progress: isPingPongRev ? (1.0 - rawP) : rawP, active: true };
      }
      return { progress: isPingPongRev ? 0.0 : 1.0, active: false };
    },

    _sampleFlowPathJS(nodes, curvature, width, height, routeMode, progress) {
      if (!nodes || nodes.length === 0) return { x: 0, y: 0, rotation: 0 };
      const px = (pct) => Number(((pct / 100.0) * width).toFixed(2));
      const py = (pct) => Number(((pct / 100.0) * height).toFixed(2));

      const p = Math.max(0, Math.min(1, Number(progress) || 0));

      if (nodes.length === 1) {
        return { x: px(nodes[0].x), y: py(nodes[0].y), rotation: 0 };
      }

      if (routeMode === 'ortho-hv' || routeMode === 'ortho-vh' || routeMode === 'ortho-mid') {
        const pts = [{ x: px(nodes[0].x), y: py(nodes[0].y) }];
        for (let i = 0; i < nodes.length - 1; i++) {
          const x1 = px(nodes[i].x);
          const y1 = py(nodes[i].y);
          const x2 = px(nodes[i + 1].x);
          const y2 = py(nodes[i + 1].y);
          if (routeMode === 'ortho-hv') {
            pts.push({ x: x2, y: y1 }, { x: x2, y: y2 });
          } else if (routeMode === 'ortho-vh') {
            pts.push({ x: x1, y: y2 }, { x: x2, y: y2 });
          } else {
            const midX = Number(((x1 + x2) / 2.0).toFixed(2));
            pts.push({ x: midX, y: y1 }, { x: midX, y: y2 }, { x: x2, y: y2 });
          }
        }
        return this._samplePiecewiseLinearJS(pts, p);
      }

      if (curvature === 0 || routeMode === 'direct') {
        const pts = nodes.map((n) => ({ x: px(n.x), y: py(n.y) }));
        return this._samplePiecewiseLinearJS(pts, p);
      }

      if (nodes.length === 2) {
        const p1x = px(nodes[0].x);
        const p1y = py(nodes[0].y);
        const p2x = px(nodes[1].x);
        const p2y = py(nodes[1].y);

        const dx = p2x - p1x;
        const dy = p2y - p1y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return { x: p1x, y: p1y, rotation: 0 };
        const nx = -dy / dist;
        const ny = dx / dist;
        const bend = (curvature / 100.0) * (dist * 0.4);
        const cx = (p1x + p2x) / 2.0 + nx * bend;
        const cy = (p1y + p2y) / 2.0 + ny * bend;

        const u = p;
        const om = 1.0 - u;
        const x = om * om * p1x + 2 * om * u * cx + u * u * p2x;
        const y = om * om * p1y + 2 * om * u * cy + u * u * p2y;

        const dxDu = 2 * om * (cx - p1x) + 2 * u * (p2x - cx);
        const dyDu = 2 * om * (cy - p1y) + 2 * u * (p2y - cy);
        const angle = Math.atan2(dyDu, dxDu) * (180.0 / Math.PI);

        return {
          x: Number(x.toFixed(2)),
          y: Number(y.toFixed(2)),
          rotation: Number(angle.toFixed(2))
        };
      }

      // Catmull-Rom cubic spline
      const numSegments = nodes.length - 1;
      const t = (curvature / 100.0) * 0.3;
      const scaled = p * numSegments;
      let segIdx = Math.floor(scaled);
      let u = scaled - segIdx;
      if (segIdx >= numSegments) {
        segIdx = numSegments - 1;
        u = 1.0;
      }

      const p0 = segIdx === 0 ? nodes[0] : nodes[segIdx - 1];
      const p1 = nodes[segIdx];
      const p2 = nodes[segIdx + 1];
      const p3 = segIdx + 2 < nodes.length ? nodes[segIdx + 2] : p2;

      const p0x = px(p0.x);
      const p0y = py(p0.y);
      const p1x = px(p1.x);
      const p1y = py(p1.y);
      const p2x = px(p2.x);
      const p2y = py(p2.y);
      const p3x = px(p3.x);
      const p3y = py(p3.y);

      const cp1x = p1x + (p2x - p0x) * t;
      const cp1y = p1y + (p2y - p0y) * t;
      const cp2x = p2x - (p3x - p1x) * t;
      const cp2y = p2y - (p3y - p1y) * t;

      const om = 1.0 - u;
      const x = om * om * om * p1x + 3 * om * om * u * cp1x + 3 * om * u * u * cp2x + u * u * u * p2x;
      const y = om * om * om * p1y + 3 * om * om * u * cp1y + 3 * om * u * u * cp2y + u * u * u * p2y;

      const dxDu = 3 * om * om * (cp1x - p1x) + 6 * om * u * (cp2x - cp1x) + 3 * u * u * (p2x - cp2x);
      const dyDu = 3 * om * om * (cp1y - p1y) + 6 * om * u * (cp2y - cp1y) + 3 * u * u * (p2y - cp2y);
      const angle = Math.atan2(dyDu, dxDu) * (180.0 / Math.PI);

      return {
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        rotation: Number(angle.toFixed(2))
      };
    },

    _samplePiecewiseLinearJS(pts, progress) {
      if (pts.length < 2) return { x: pts[0] ? pts[0].x : 0, y: pts[0] ? pts[0].y : 0, rotation: 0 };
      const segs = [];
      let totalLen = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const dx = pts[i + 1].x - pts[i].x;
        const dy = pts[i + 1].y - pts[i].y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ang = Math.atan2(dy, dx) * (180.0 / Math.PI);
        segs.push({ p1: pts[i], p2: pts[i + 1], len: len, angle: ang });
        totalLen += len;
      }
      if (totalLen === 0) return { x: pts[0].x, y: pts[0].y, rotation: 0 };

      const targetDist = progress * totalLen;
      let accum = 0;
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        if (targetDist <= accum + seg.len || i === segs.length - 1) {
          const u = seg.len > 0 ? Math.max(0, Math.min(1, (targetDist - accum) / seg.len)) : 0;
          const x = seg.p1.x + (seg.p2.x - seg.p1.x) * u;
          const y = seg.p1.y + (seg.p2.y - seg.p1.y) * u;
          return {
            x: Number(x.toFixed(2)),
            y: Number(y.toFixed(2)),
            rotation: Number(seg.angle.toFixed(2))
          };
        }
        accum += seg.len;
      }
      const last = pts[pts.length - 1];
      const lastAng = segs[segs.length - 1].angle;
      return { x: Number(last.x.toFixed(2)), y: Number(last.y.toFixed(2)), rotation: Number(lastAng.toFixed(2)) };
    },

    _evaluateSceneAtTimeJS(snap, timeSec) {
      if (!snap) return { time: timeSec, flows: [], glows: [], ripples: [], nodes: [] };
      const width = (snap.canvas && snap.canvas.width) || 1280;
      const height = (snap.canvas && snap.canvas.height) || 720;
      const dur = (snap.canvas && snap.canvas.duration) || 7.0;
      const loop = (snap.canvas && snap.canvas.loop) || 'once';

      const norm = this._evaluateTimelineProgressJS(timeSec, dur, loop);

      const flows = (snap.flows || []).map((f) => {
        const speed = f.speed > 0 ? f.speed : 2.0;
        const cyc = this._evaluateCycleJS(timeSec, f.delay || 0, speed, f.endDelay || 0, 'loop');
        const visible = timeSec >= (f.delay || 0);

        const baseOp = f.opacity > 0 ? f.opacity : 0.85;
        let op = baseOp;
        if (!visible || (!cyc.active && f.hideOnDelay)) {
          op = 0;
        } else if (cyc.active) {
          if (cyc.progress < 0.08) op = baseOp * (cyc.progress / 0.08);
          else if (cyc.progress > 0.92) op = baseOp * ((1.0 - cyc.progress) / 0.08);
        }

        const sampled = this._sampleFlowPathJS(f.nodes, f.curvature || 0, width, height, f.routeMode || 'curve', cyc.progress);
        const dashOffset = Number((32.0 - ((timeSec * 32.0) % 32.0)).toFixed(2));

        return {
          id: f.id,
          visible: visible,
          progress: Number(cyc.progress.toFixed(4)),
          x: sampled.x,
          y: sampled.y,
          rotation: sampled.rotation,
          opacity: Number(op.toFixed(3)),
          dashOffset: dashOffset
        };
      });

      const glows = (snap.glows || []).map((g) => {
        const gDur = g.dur > 0 ? g.dur : 1.5;
        const cyc = this._evaluateCycleJS(timeSec, g.delay || 0, gDur, g.endDelay || 0, g.playback || 'pingpong');
        const baseOp = g.opacity > 0 ? g.opacity : 0.8;
        let coreOp = baseOp;
        if (timeSec < (g.delay || 0)) {
          coreOp = 0;
        } else if (g.playback === 'pingpong') {
          coreOp = baseOp * (0.3 + 0.7 * Math.sin(cyc.progress * Math.PI));
        } else {
          coreOp = baseOp * (1.0 - cyc.progress);
        }

        const rings = [];
        if (g.isRadar) {
          const numRings = g.radarRings > 0 ? g.radarRings : 3;
          const stagger = g.radarStagger > 0 ? g.radarStagger : 0.25;
          for (let k = 0; k < numRings; k++) {
            const rCyc = this._evaluateCycleJS(timeSec, (g.delay || 0) + k * stagger, gDur, g.endDelay || 0, 'loop');
            if (rCyc.active) {
              const r = 4.0 + (g.size - 4.0) * rCyc.progress;
              const rOp = baseOp * (1.0 - rCyc.progress);
              rings.push({ radius: Number(r.toFixed(2)), opacity: Number(rOp.toFixed(3)) });
            } else {
              rings.push({ radius: 4.0, opacity: 0.0 });
            }
          }
        }

        return {
          id: g.id,
          visible: cyc.active || timeSec >= (g.delay || 0),
          coreOpacity: Number(coreOp.toFixed(3)),
          radarRings: rings
        };
      });

      const ripples = (snap.ripples || []).map((r) => {
        const rDur = r.dur > 0 ? r.dur : 2.0;
        const cyc = this._evaluateCycleJS(timeSec, r.delay || 0, rDur, r.endDelay || 0, 'loop');
        const baseOp = r.opacity > 0 ? r.opacity : 0.85;
        const radius = r.innerR + (r.outerR - r.innerR) * cyc.progress;
        const op = cyc.active ? (baseOp * (1.0 - cyc.progress)) : 0;
        return {
          id: r.id,
          visible: cyc.active,
          radius: Number(radius.toFixed(2)),
          opacity: Number(op.toFixed(3))
        };
      });

      const cam = snap.camera || {};
      const cDur = cam.camDuration > 0 ? cam.camDuration : dur;
      const cNorm = this._evaluateTimelineProgressJS(timeSec, cDur, cam.camLoop || loop);

      let camUpdate = { motion: 'static', scale: 1.0, translateX: 0, translateY: 0, transform: 'translate(0, 0) scale(1)' };
      if (cam.motion === 'ken-burns') {
        const eProg = this._solveCubicBezierJS(0.42, 0, 0.58, 1, cNorm.progress);
        const sz = cam.startZoom || 1.0;
        const ez = cam.endZoom || 1.3;
        const scale = sz + (ez - sz) * eProg;
        const sx = (cam.startX || 50) + ((cam.endX || 60) - (cam.startX || 50)) * eProg;
        const sy = (cam.startY || 50) + ((cam.endY || 40) - (cam.startY || 50)) * eProg;
        const tx = (50.0 - sx) * (width / 100.0);
        const ty = (50.0 - sy) * (height / 100.0);
        camUpdate = {
          motion: cam.motion,
          scale: Number(scale.toFixed(3)),
          translateX: Number(tx.toFixed(2)),
          translateY: Number(ty.toFixed(2)),
          transform: 'translate(' + tx.toFixed(2) + ', ' + ty.toFixed(2) + ') scale(' + scale.toFixed(3) + ')'
        };
      } else if (cam.motion === 'handheld-drift') {
        const sway = cam.sway || 1.4;
        const breathe = cam.breathe || 1.8;
        const scale = (cam.startZoom || 1.0) + 0.015 * Math.sin((timeSec * 2 * Math.PI) / breathe);
        const tx = sway * 4.0 * Math.sin(timeSec * 1.5);
        const ty = sway * 3.0 * Math.cos(timeSec * 1.2);
        camUpdate = {
          motion: cam.motion,
          scale: Number(scale.toFixed(3)),
          translateX: Number(tx.toFixed(2)),
          translateY: Number(ty.toFixed(2)),
          transform: 'translate(' + tx.toFixed(2) + ', ' + ty.toFixed(2) + ') scale(' + scale.toFixed(3) + ')'
        };
      }

      const nodes = (snap.nodes || []).map((n) => {
        let op = n.opacity > 0 ? n.opacity : 1.0;
        let dy = 0;
        if (n.animation === 'pulse') {
          op = 0.65 + 0.35 * ((Math.sin((timeSec * 2 * Math.PI) / 2.6) + 1.0) / 2.0);
        } else if (n.animation === 'float') {
          dy = -6.0 * ((Math.sin((timeSec * 2 * Math.PI) / 3.2) + 1.0) / 2.0);
        }
        return {
          id: n.id,
          opacity: Number(op.toFixed(3)),
          translateY: Number(dy.toFixed(2))
        };
      });

      const optical = snap.optical || {};
      let optUpdate = { type: optical.type || 'none', active: false, isActive: false, blur: 0, filterAttr: '' };
      if (optical.type === 'focus-pull') {
        const fDur = optical.focusDur > 0 ? optical.focusDur : dur;
        const cyc = this._evaluateCycleJS(timeSec, 0, fDur, 0, snap.camera && snap.camera.camLoop || 'once');
        const easedP = this._solveCubicBezierJS(0.42, 0, 0.58, 1, cyc.progress);
        const b = optical.startBlur + (optical.endBlur - optical.startBlur) * easedP;
        optUpdate = { type: 'focus-pull', active: true, isActive: true, blur: Number(b.toFixed(2)), filterAttr: 'url(#opt-focus)' };
      } else if (optical.type === 'tilt-shift') {
        optUpdate = { type: 'tilt-shift', active: true, isActive: true, blur: optical.tsBlur || 12, filterAttr: 'url(#opt-ts-blur)' };
      } else if (optical.type === 'motion-blur') {
        optUpdate = { type: 'motion-blur', active: true, isActive: true, blur: optical.mbInt || 15, filterAttr: 'url(#opt-mb-blur)' };
      }

      const frame = snap.frame || snap.overlays || {};
      const frameUpdate = {
        enabled: !!(frame.frame || frame.enabled),
        style: frame.frameStyle || frame.style || 'walnut',
        depth: frame.frameDepth || frame.depth || 44
      };

      return {
        time: timeSec,
        normalizedTime: Number(norm.progress.toFixed(4)),
        revision: snap.revision || 1,
        flows: flows,
        glows: glows,
        ripples: ripples,
        camera: camUpdate,
        nodes: nodes,
        optical: optUpdate,
        frame: frameUpdate
      };
    }
  };

  const ObjectGroups = {
    list: [],
    counter: 0,

    getAllGroups() {
      return this.list;
    },

    getState() {
      return {
        groups: JSON.parse(JSON.stringify(this.list)),
        groupsCounter: this.counter
      };
    },

    setState(state = {}) {
      if (!state) return;
      this.list = Array.isArray(state.groups) ? JSON.parse(JSON.stringify(state.groups)) : [];
      this.counter = parseInt(state.groupsCounter, 10) || 0;
      if (this.counter === 0 && this.list.length > 0) {
        this.list.forEach((g) => {
          const match = String(g.id).match(/group-(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > this.counter) this.counter = num;
          }
        });
      }
    },

    getGroup(id) {
      const strId = String(id);
      return this.list.find((g) => String(g.id) === strId) || null;
    },

    findGroupByMember(type, id) {
      const strId = String(id);
      return this.list.find((g) =>
        Array.isArray(g.members) && g.members.some((m) => m.type === type && String(m.id) === strId)
      ) || null;
    },

    createGroup(name, members) {
      if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.createGroup(name, members);
        if (res && res.success) {
          if (res.group) {
            const num = parseInt(String(res.group.id).replace(/\D/g, '') || '0', 10);
            if (num > this.counter) this.counter = num;
          }
          return res;
        }
        return res || { success: false, error: 'Group creation rejected by Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    ungroup(groupId) {
      if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.ungroup(groupId);
        if (res && res.success) return res;
        return res || { success: false, error: 'Ungroup rejected by Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    removeMembers(groupId, membersToRemove) {
      if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.removeGroupMembers(groupId, membersToRemove);
        if (res && res.success) return res;
        return res || { success: false, error: 'Remove members rejected by Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    renameGroup(groupId, name) {
      if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.renameGroup(groupId, name);
        if (res && res.success) return res;
        return res || { success: false, error: 'Rename group rejected by Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    deleteGroup(groupId, deleteMembers = false) {
      if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.deleteGroup(groupId, deleteMembers);
        if (res && res.success) return res;
        return res || { success: false, error: 'Delete group rejected by Go engine' };
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    pruneMember(type, id) {
      const strId = String(id);
      for (let i = this.list.length - 1; i >= 0; i--) {
        const grp = this.list[i];
        if (Array.isArray(grp.members)) {
          grp.members = grp.members.filter((m) => !(m.type === type && String(m.id) === strId));
          if (grp.members.length < 2) {
            this.list.splice(i, 1);
          }
        }
      }
    },

    moveGroup(groupId, dx, dy) {
      const grp = this.getGroup(groupId);
      if (!grp) return { success: false, error: 'Group not found' };
      const deltaX = Number(dx) || 0;
      const deltaY = Number(dy) || 0;
      (grp.members || []).forEach((m) => {
        if (m.type === 'node' && window.DiagramNodes) {
          const n = window.DiagramNodes.getNode(m.id);
          if (n) {
            n.x = Math.max(-50, Math.min(150, n.x + deltaX));
            n.y = Math.max(-50, Math.min(150, n.y + deltaY));
            window.DiagramNodes.updateNode(m.id, { x: n.x, y: n.y });
          }
        } else if (m.type === 'glow' && window.Glows) {
          const g = window.Glows.getGlow(m.id);
          if (g) {
            g.x = Math.max(-50, Math.min(150, g.x + deltaX));
            g.y = Math.max(-50, Math.min(150, g.y + deltaY));
            window.Glows.updateGlow(m.id, { x: g.x, y: g.y });
          }
        } else if (m.type === 'ripple' && window.Ripples) {
          const r = window.Ripples.getRipple(m.id);
          if (r) {
            r.x = Math.max(-50, Math.min(150, r.x + deltaX));
            r.y = Math.max(-50, Math.min(150, r.y + deltaY));
            window.Ripples.updateRipple(m.id, { x: r.x, y: r.y });
          }
        } else if (m.type === 'flow' && window.DataFlows) {
          const f = window.DataFlows.getFlow(m.id);
          if (f && Array.isArray(f.nodes) && !f.fromNodeId && !f.toNodeId) {
            f.nodes.forEach((p) => {
              p.x = Math.round((p.x + deltaX) * 1000) / 1000;
              p.y = Math.round((p.y + deltaY) * 1000) / 1000;
            });
            window.DataFlows.updateFlow(m.id, { nodes: f.nodes });
          }
        } else if (m.type === 'image' && window.ImageObjects) {
          const img = window.ImageObjects.getImage(m.id);
          if (img) {
            img.x = Math.max(-50, Math.min(150, (img.x || 0) + deltaX));
            img.y = Math.max(-50, Math.min(150, (img.y || 0) + deltaY));
            window.ImageObjects.updateImage(m.id, { x: img.x, y: img.y });
          }
        }
      });
      return { success: true };
    },

    computeBounds(groupId, canvasW = 1280, canvasH = 720) {
      const grp = this.getGroup(groupId);
      if (!grp) return { success: false, error: 'Group not found' };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let count = 0;
      (grp.members || []).forEach((m) => {
        if (m.type === 'node' && window.DiagramNodes) {
          const n = window.DiagramNodes.getNode(m.id);
          if (n) {
            const eff = window.DiagramNodes.getNodeEffectiveProps(n);
            const hwPct = (eff.width / 2 / canvasW) * 100;
            const hhPct = (eff.height / 2 / canvasH) * 100;
            minX = Math.min(minX, n.x - hwPct);
            maxX = Math.max(maxX, n.x + hwPct);
            minY = Math.min(minY, n.y - hhPct);
            maxY = Math.max(maxY, n.y + hhPct);
            count++;
          }
        } else if (m.type === 'glow' && window.Glows) {
          const g = window.Glows.getGlow(m.id);
          if (g) {
            let hw = Math.max(16, g.size || 25);
            let hh = hw;
            if (g.shape === 'custom' && g.customW && g.customH) {
              const scale = g.scale || 1.0;
              hw = (g.customW * scale) / 2;
              hh = (g.customH * scale) / 2;
            }
            const hwPct = (hw / canvasW) * 100;
            const hhPct = (hh / canvasH) * 100;
            minX = Math.min(minX, g.x - hwPct);
            maxX = Math.max(maxX, g.x + hwPct);
            minY = Math.min(minY, g.y - hhPct);
            maxY = Math.max(maxY, g.y + hhPct);
            count++;
          }
        } else if (m.type === 'ripple' && window.Ripples) {
          const r = window.Ripples.getRipple(m.id);
          if (r) {
            const hitR = Math.max(20, r.outerR || 100);
            const rxPct = (hitR / canvasW) * 100;
            const ryPct = (hitR / canvasH) * 100;
            minX = Math.min(minX, r.x - rxPct);
            maxX = Math.max(maxX, r.x + rxPct);
            minY = Math.min(minY, r.y - ryPct);
            maxY = Math.max(maxY, r.y + ryPct);
            count++;
          }
        } else if (m.type === 'image' && window.ImageObjects) {
          const img = window.ImageObjects.getImage(m.id);
          if (img) {
            const hwPct = ((img.width || 200) / 2 / canvasW) * 100;
            const hhPct = ((img.height || 150) / 2 / canvasH) * 100;
            minX = Math.min(minX, img.x - hwPct);
            maxX = Math.max(maxX, img.x + hwPct);
            minY = Math.min(minY, img.y - hhPct);
            maxY = Math.max(maxY, img.y + hhPct);
            count++;
          }
        }
      });
      if (count === 0) return { success: false, error: 'No geometric members in group' };
      return { success: true, minX, minY, maxX, maxY };
    },

    copySelection(items, groupId = null) {
      const payload = {
        format: 'svg-animator-clipboard',
        version: '1.0.0',
        nodes: [],
        flows: [],
        glows: [],
        ripples: [],
        images: [],
        groups: []
      };
      if (groupId) {
        const grp = this.getGroup(groupId);
        if (grp) {
          payload.groups.push(JSON.parse(JSON.stringify(grp)));
          (grp.members || []).forEach((m) => {
            if (m.type === 'node' && window.DiagramNodes) {
              const n = window.DiagramNodes.getNode(m.id);
              if (n) payload.nodes.push(JSON.parse(JSON.stringify(n)));
            } else if (m.type === 'flow' && window.DataFlows) {
              const f = window.DataFlows.getFlow(m.id);
              if (f) payload.flows.push(JSON.parse(JSON.stringify(f)));
            } else if (m.type === 'glow' && window.Glows) {
              const g = window.Glows.getGlow(m.id);
              if (g) payload.glows.push(JSON.parse(JSON.stringify(g)));
            } else if (m.type === 'ripple' && window.Ripples) {
              const r = window.Ripples.getRipple(m.id);
              if (r) payload.ripples.push(JSON.parse(JSON.stringify(r)));
            } else if (m.type === 'image' && window.ImageObjects) {
              const img = window.ImageObjects.getImage(m.id);
              if (img) payload.images.push(JSON.parse(JSON.stringify(img)));
            }
          });
          return payload;
        }
      }
      if (Array.isArray(items)) {
        items.forEach((it) => {
          if (it.type === 'node' && window.DiagramNodes) {
            const n = window.DiagramNodes.getNode(it.id);
            if (n) payload.nodes.push(JSON.parse(JSON.stringify(n)));
          } else if (it.type === 'flow' && window.DataFlows) {
            const f = window.DataFlows.getFlow(it.id);
            if (f) payload.flows.push(JSON.parse(JSON.stringify(f)));
          } else if (it.type === 'glow' && window.Glows) {
            const g = window.Glows.getGlow(it.id);
            if (g) payload.glows.push(JSON.parse(JSON.stringify(g)));
          } else if (it.type === 'ripple' && window.Ripples) {
            const r = window.Ripples.getRipple(it.id);
            if (r) payload.ripples.push(JSON.parse(JSON.stringify(r)));
          } else if (it.type === 'image' && window.ImageObjects) {
            const img = window.ImageObjects.getImage(it.id);
            if (img) payload.images.push(JSON.parse(JSON.stringify(img)));
          }
        });
      }
      return payload;
    },

    pastePayload(payload, offsetX = 5.0, offsetY = 5.0) {
      if (!payload || payload.format !== 'svg-animator-clipboard') {
        return { success: false, error: 'Invalid clipboard format' };
      }
      const newItems = [];
      const nodeMap = {};
      const flowMap = {};
      const glowMap = {};
      const rippleMap = {};
      const imageMap = {};

      (payload.nodes || []).forEach((n) => {
        if (window.DiagramNodes) {
          const clone = JSON.parse(JSON.stringify(n));
          clone.x = Math.max(-50, Math.min(150, (clone.x || 0) + offsetX));
          clone.y = Math.max(-50, Math.min(150, (clone.y || 0) + offsetY));
          if (clone.name) clone.name = clone.name + ' Copy';
          const created = window.DiagramNodes.createNode(clone);
          if (created) {
            nodeMap[n.id] = created.id;
            newItems.push({ type: 'node', id: created.id });
          }
        }
      });

      (payload.images || []).forEach((img) => {
        if (window.ImageObjects) {
          const clone = JSON.parse(JSON.stringify(img));
          clone.x = Math.max(-50, Math.min(150, (clone.x || 0) + offsetX));
          clone.y = Math.max(-50, Math.min(150, (clone.y || 0) + offsetY));
          if (clone.name) clone.name = clone.name + ' Copy';
          const created = window.ImageObjects.createImage(clone);
          if (created) {
            imageMap[img.id] = created.id;
            newItems.push({ type: 'image', id: created.id });
          }
        }
      });

      (payload.glows || []).forEach((g) => {
        if (window.Glows) {
          const clone = JSON.parse(JSON.stringify(g));
          clone.x = Math.max(-50, Math.min(150, (clone.x || 0) + offsetX));
          clone.y = Math.max(-50, Math.min(150, (clone.y || 0) + offsetY));
          if (clone.name) clone.name = clone.name + ' Copy';
          const created = window.Glows.createGlow(clone);
          if (created) {
            glowMap[g.id] = created.id;
            newItems.push({ type: 'glow', id: created.id });
          }
        }
      });

      (payload.ripples || []).forEach((r) => {
        if (window.Ripples) {
          const clone = JSON.parse(JSON.stringify(r));
          clone.x = Math.max(-50, Math.min(150, (clone.x || 0) + offsetX));
          clone.y = Math.max(-50, Math.min(150, (clone.y || 0) + offsetY));
          if (clone.name) clone.name = clone.name + ' Copy';
          const created = window.Ripples.createRipple(clone);
          if (created) {
            rippleMap[r.id] = created.id;
            newItems.push({ type: 'ripple', id: created.id });
          }
        }
      });

      (payload.flows || []).forEach((f) => {
        if (window.DataFlows) {
          const clone = JSON.parse(JSON.stringify(f));
          if (nodeMap[f.fromNodeId]) clone.fromNodeId = nodeMap[f.fromNodeId];
          if (nodeMap[f.toNodeId]) clone.toNodeId = nodeMap[f.toNodeId];
          if (clone.name) clone.name = clone.name + ' Copy';
          if (Array.isArray(clone.nodes)) {
            clone.nodes.forEach((p) => {
              p.x = Math.round((p.x + offsetX) * 1000) / 1000;
              p.y = Math.round((p.y + offsetY) * 1000) / 1000;
            });
          }
          const created = window.DataFlows.createFlow(clone);
          if (created) {
            flowMap[f.id] = created.id;
            newItems.push({ type: 'flow', id: created.id });
          }
        }
      });

      let newGroupId = null;
      (payload.groups || []).forEach((g) => {
        const remappedMembers = [];
        (g.members || []).forEach((m) => {
          if (m.type === 'node' && nodeMap[m.id]) remappedMembers.push({ type: 'node', id: nodeMap[m.id] });
          else if (m.type === 'flow' && flowMap[m.id]) remappedMembers.push({ type: 'flow', id: flowMap[m.id] });
          else if (m.type === 'glow' && glowMap[m.id]) remappedMembers.push({ type: 'glow', id: glowMap[m.id] });
          else if (m.type === 'ripple' && rippleMap[m.id]) remappedMembers.push({ type: 'ripple', id: rippleMap[m.id] });
          else if (m.type === 'image' && imageMap[m.id]) remappedMembers.push({ type: 'image', id: imageMap[m.id] });
        });
        if (remappedMembers.length >= 2) {
          const res = this.createGroup((g.name || 'Group') + ' Copy', remappedMembers);
          if (res && res.success) {
            newGroupId = res.group.id;
          }
        }
      });

      return { success: true, newItems, newGroupId };
    },

    duplicateSelection(items, groupId = null, offsetX = 5.0, offsetY = 5.0) {
      const payload = this.copySelection(items, groupId);
      return this.pastePayload(payload, offsetX, offsetY);
    }
  };

  const ImageObjects = {
    list: [],
    counter: 0,

    getAll() {
      return this.list;
    },

    getImage(id) {
      const strId = String(id);
      return this.list.find((img) => String(img.id) === strId) || null;
    },

    createImage(initial = {}) {
      if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.dispatch('Image.Create', { image: initial });
        if (res && res.success && res.image) {
          const img = res.image;
          const idx = this.list.findIndex((i) => String(i.id) === String(img.id));
          if (idx >= 0) this.list[idx] = img;
          else this.list.push(img);
          this.counter = Math.max(this.counter, parseInt(String(img.id).replace(/\D/g, '') || '0', 10));
          if (window.LayerManager) window.LayerManager.syncFromEngine();
          return img;
        }
        console.error('Image.Create failed in Go engine');
        return null;
      }
      console.error('Image.Create rejected: Go/WASM engine is unavailable');
      return null;
    },

    updateImage(id, patch = {}) {
      if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.dispatch('Image.Update', { id: String(id), patch });
        if (!res || !res.success || !res.image) {
          console.error('Image.Update failed in Go engine:', res && res.error);
          return null;
        }
        const img = this.getImage(id);
        if (img) {
          Object.assign(img, res.image);
          if (patch.visible !== undefined) img.visible = !!patch.visible;
          if (patch.locked !== undefined) img.locked = !!patch.locked;
          return img;
        }
        return res.image;
      }
      console.error('Image.Update rejected: Go/WASM engine is unavailable');
      return null;
    },

    cropImage(id, crop = {}, geom = {}, name = '') {
      const strId = String(id);
      const payload = {
        id: strId,
        name: name ? String(name) : '',
        crop: {
          enabled: true,
          sourceX: Number(crop.sourceX) || 0,
          sourceY: Number(crop.sourceY) || 0,
          sourceWidth: Number(crop.sourceWidth) || 0,
          sourceHeight: Number(crop.sourceHeight) || 0,
          origX: crop.origX !== undefined ? Number(crop.origX) : undefined,
          origY: crop.origY !== undefined ? Number(crop.origY) : undefined,
          origWidth: crop.origWidth !== undefined ? Number(crop.origWidth) : undefined,
          origHeight: crop.origHeight !== undefined ? Number(crop.origHeight) : undefined
        }
      };
      if (geom.newX !== undefined) payload.newX = Number(geom.newX);
      if (geom.newY !== undefined) payload.newY = Number(geom.newY);
      if (geom.newW !== undefined) payload.newW = Number(geom.newW);
      if (geom.newH !== undefined) payload.newH = Number(geom.newH);

      if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.dispatch('Image.Crop', payload);
        if (res && res.success && res.image) {
          const idx = this.list.findIndex((i) => String(i.id) === strId);
          if (idx >= 0) {
            Object.assign(this.list[idx], res.image);
            return this.list[idx];
          }
          return res.image;
        }
        console.error('Image.Crop failed in Go engine');
        return null;
      }

      // Fallback JS logic
      const img = this.getImage(strId);
      if (!img) return null;
      if (!img.cropVersions || !img.cropVersions.length) {
        img.cropVersions = [{
          id: 'original',
          name: 'Original',
          sourceX: 0,
          sourceY: 0,
          sourceWidth: img.naturalWidth || img.width,
          sourceHeight: img.naturalHeight || img.height,
          width: img.width,
          height: img.height,
          x: img.x,
          y: img.y,
          origX: img.x,
          origY: img.y,
          origWidth: img.width,
          origHeight: img.height
        }];
        img.activeCropVersionId = 'original';
      }

      if (!payload.crop.origWidth || payload.crop.origWidth <= 0) {
        if (img.crop && img.crop.origWidth > 0) {
          payload.crop.origWidth = img.crop.origWidth;
          payload.crop.origHeight = img.crop.origHeight;
          payload.crop.origX = img.crop.origX;
          payload.crop.origY = img.crop.origY;
        } else {
          payload.crop.origWidth = img.width;
          payload.crop.origHeight = img.height;
          payload.crop.origX = img.x;
          payload.crop.origY = img.y;
        }
      }
      img.crop = payload.crop;
      const targetW = (geom.newW !== undefined && geom.newW > 0) ? geom.newW : img.width;
      const targetH = (geom.newH !== undefined && geom.newH > 0) ? geom.newH : img.height;
      const targetX = (geom.newX !== undefined) ? Math.round(geom.newX * 1000) / 1000 : img.x;
      const targetY = (geom.newY !== undefined) ? Math.round(geom.newY * 1000) / 1000 : img.y;
      img.width = targetW;
      img.height = targetH;
      img.x = targetX;
      img.y = targetY;

      let verNum = img.cropVersions.length;
      let verId = 'crop-' + verNum;
      while (img.cropVersions.some((v) => v.id === verId)) {
        verNum++;
        verId = 'crop-' + verNum;
      }
      const verName = (name && name.trim()) ? name.trim() : ('Crop ' + verNum);
      img.cropVersions.push({
        id: verId,
        name: verName,
        sourceX: payload.crop.sourceX,
        sourceY: payload.crop.sourceY,
        sourceWidth: payload.crop.sourceWidth,
        sourceHeight: payload.crop.sourceHeight,
        width: targetW,
        height: targetH,
        x: targetX,
        y: targetY,
        origX: payload.crop.origX,
        origY: payload.crop.origY,
        origWidth: payload.crop.origWidth,
        origHeight: payload.crop.origHeight
      });
      img.activeCropVersionId = verId;
      return img;
    },

    selectCropVersion(id, versionId) {
      const strId = String(id);
      const strVerId = String(versionId);
      if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.dispatch('Image.CropVersionSelect', { id: strId, versionId: strVerId });
        if (res && res.success && res.image) {
          const idx = this.list.findIndex((i) => String(i.id) === strId);
          if (idx >= 0) {
            if (!res.image.crop) delete this.list[idx].crop;
            Object.assign(this.list[idx], res.image);
            if (!res.image.crop) delete this.list[idx].crop;
            return this.list[idx];
          }
          if (!res.image.crop) delete res.image.crop;
          return res.image;
        }
        console.error('Image.CropVersionSelect failed in Go engine');
        return null;
      }

      const img = this.getImage(strId);
      if (!img || !img.cropVersions) return null;
      const ver = img.cropVersions.find((v) => v.id === strVerId);
      if (!ver) return null;
      img.activeCropVersionId = strVerId;
      if (strVerId === 'original') {
        delete img.crop;
        img.x = ver.x;
        img.y = ver.y;
        img.width = ver.width;
        img.height = ver.height;
      } else {
        img.crop = {
          enabled: true,
          sourceX: ver.sourceX,
          sourceY: ver.sourceY,
          sourceWidth: ver.sourceWidth,
          sourceHeight: ver.sourceHeight,
          origX: ver.origX,
          origY: ver.origY,
          origWidth: ver.origWidth,
          origHeight: ver.origHeight
        };
        img.x = ver.x;
        img.y = ver.y;
        img.width = ver.width;
        img.height = ver.height;
      }
      return img;
    },

    renameCropVersion(id, versionId, newName) {
      const strId = String(id);
      const strVerId = String(versionId);
      const name = String(newName || '').trim();
      if (!name) return null;
      if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.dispatch('Image.CropVersionRename', { id: strId, versionId: strVerId, name });
        if (res && res.success && res.image) {
          const idx = this.list.findIndex((i) => String(i.id) === strId);
          if (idx >= 0) {
            Object.assign(this.list[idx], res.image);
            return this.list[idx];
          }
          return res.image;
        }
        console.error('Image.CropVersionRename failed in Go engine');
        return null;
      }

      const img = this.getImage(strId);
      if (!img || !img.cropVersions) return null;
      const ver = img.cropVersions.find((v) => v.id === strVerId);
      if (!ver) return null;
      ver.name = name;
      return img;
    },

    deleteCropVersion(id, versionId) {
      const strId = String(id);
      const strVerId = String(versionId);
      if (strVerId === 'original') return null;
      if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.dispatch('Image.CropVersionDelete', { id: strId, versionId: strVerId });
        if (res && res.success && res.image) {
          const idx = this.list.findIndex((i) => String(i.id) === strId);
          if (idx >= 0) {
            if (!res.image.crop) delete this.list[idx].crop;
            Object.assign(this.list[idx], res.image);
            if (!res.image.crop) delete this.list[idx].crop;
            return this.list[idx];
          }
          if (!res.image.crop) delete res.image.crop;
          return res.image;
        }
        console.error('Image.CropVersionDelete failed in Go engine');
        return null;
      }

      const img = this.getImage(strId);
      if (!img || !img.cropVersions) return null;
      const idx = img.cropVersions.findIndex((v) => v.id === strVerId);
      if (idx === -1) return null;
      img.cropVersions.splice(idx, 1);
      if (img.activeCropVersionId === strVerId) {
        const fallback = img.cropVersions[img.cropVersions.length - 1];
        this.selectCropVersion(strId, fallback ? fallback.id : 'original');
      }
      return img;
    },

    commitCrop(id, options = {}) {
      const strId = String(id);
      if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const payload = {
          id: strId,
          src: options.src || options.newSrc || '',
          newSrc: options.newSrc || options.src || '',
          assetRef: options.assetRef || options.newAssetRef || '',
          newAssetRef: options.newAssetRef || options.assetRef || '',
          filename: options.filename || options.newFilename || '',
          newFilename: options.newFilename || options.filename || '',
          mime: options.mime || options.newMime || '',
          newMime: options.newMime || options.mime || '',
          naturalWidth: Number(options.naturalWidth || options.nw || 0),
          naturalHeight: Number(options.naturalHeight || options.nh || 0),
          width: Number(options.width || options.w || 0),
          height: Number(options.height || options.h || 0),
          discardVersions: !!options.discardVersions
        };
        const res = window.EngineBridge.dispatch('Image.CommitCrop', payload);
        if (res && res.success && res.image) {
          const idx = this.list.findIndex((i) => String(i.id) === strId);
          if (idx >= 0) {
            Object.assign(this.list[idx], res.image);
            return this.list[idx];
          }
          return res.image;
        }
        console.error('Image.CommitCrop failed in Go engine');
        return null;
      }

      const img = this.getImage(strId);
      if (!img) return null;
      if (options.newSrc) {
        img.src = options.newSrc;
        img.data = options.newSrc;
      }
      if (options.newAssetRef) img.assetRef = options.newAssetRef;
      if (options.newFilename) img.filename = options.newFilename;
      if (options.newMime) img.mime = options.newMime;
      const nw = Number(options.naturalWidth || options.nw || 0);
      const nh = Number(options.naturalHeight || options.nh || 0);
      const w = Number(options.width || options.w || 0);
      const h = Number(options.height || options.h || 0);
      if (nw > 0) img.naturalWidth = nw;
      if (nh > 0) img.naturalHeight = nh;
      if (w > 0) img.width = w;
      if (h > 0) img.height = h;
      delete img.crop;

      if (options.discardVersions) {
        img.cropVersions = [{
          id: 'original',
          name: 'Original',
          sourceX: 0,
          sourceY: 0,
          sourceWidth: img.naturalWidth || img.width,
          sourceHeight: img.naturalHeight || img.height,
          width: img.width,
          height: img.height,
          x: img.x,
          y: img.y,
          origX: img.x,
          origY: img.y,
          origWidth: img.width,
          origHeight: img.height
        }];
        img.activeCropVersionId = 'original';
      } else {
        if (!img.cropVersions || !img.cropVersions.length) {
          img.cropVersions = [];
        }
        let orig = img.cropVersions.find((v) => v.id === 'original');
        if (!orig) {
          orig = { id: 'original', name: 'Original' };
          img.cropVersions.unshift(orig);
        }
        orig.sourceWidth = img.naturalWidth || img.width;
        orig.sourceHeight = img.naturalHeight || img.height;
        orig.width = img.width;
        orig.height = img.height;
        orig.origWidth = img.width;
        orig.origHeight = img.height;
        orig.x = img.x;
        orig.y = img.y;
        orig.origX = img.x;
        orig.origY = img.y;
        img.activeCropVersionId = 'original';
      }
      return img;
    },

    resetCrop(id) {
      const strId = String(id);
      if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.dispatch('Image.ResetCrop', { id: strId });
        if (res && res.success && res.image) {
          const idx = this.list.findIndex((i) => String(i.id) === strId);
          if (idx >= 0) {
            delete this.list[idx].crop;
            Object.assign(this.list[idx], res.image);
            if (!res.image.crop) delete this.list[idx].crop;
            return this.list[idx];
          }
          if (!res.image.crop) delete res.image.crop;
          return res.image;
        }
        console.error('Image.ResetCrop failed in Go engine');
        return null;
      }

      // Fallback JS logic
      const img = this.getImage(strId);
      if (!img) return null;
      if (img.cropVersions && img.cropVersions.length > 0) {
        return this.selectCropVersion(strId, 'original');
      }
      if (img.crop) {
        if (img.crop.origWidth > 0) img.width = img.crop.origWidth;
        if (img.crop.origHeight > 0) img.height = img.crop.origHeight;
        if (img.crop.origWidth > 0 && img.crop.origHeight > 0) {
          img.x = img.crop.origX;
          img.y = img.crop.origY;
        }
        delete img.crop;
      }
      return img;
    },

    clipImage(id, clip = {}) {
      const strId = String(id);
      const payload = {
        id: strId,
        clip: {
          enabled: true,
          x: Math.max(0, Number(clip.x) || 0),
          y: Math.max(0, Number(clip.y) || 0),
          width: Math.max(10, Number(clip.width) || 10),
          height: Math.max(10, Number(clip.height) || 10)
        }
      };

      if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.dispatch('Image.Clip', payload);
        if (res && res.success && res.image) {
          const idx = this.list.findIndex((i) => String(i.id) === strId);
          if (idx >= 0) {
            Object.assign(this.list[idx], res.image);
            return this.list[idx];
          }
          return res.image;
        }
        console.error('Image.Clip failed in Go engine');
        return null;
      }

      // Fallback JS logic
      const img = this.getImage(strId);
      if (!img) return null;
      img.clip = payload.clip;
      return img;
    },

    resetClip(id) {
      const strId = String(id);
      if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.dispatch('Image.ResetClip', { id: strId });
        if (res && res.success && res.image) {
          const idx = this.list.findIndex((i) => String(i.id) === strId);
          if (idx >= 0) {
            delete this.list[idx].clip;
            Object.assign(this.list[idx], res.image);
            if (!res.image.clip) delete this.list[idx].clip;
            return this.list[idx];
          }
          if (!res.image.clip) delete res.image.clip;
          return res.image;
        }
        console.error('Image.ResetClip failed in Go engine');
        return null;
      }

      const existing = this.getImage(strId);
      if (existing) {
        if (existing.clip) existing.clip.enabled = false;
        delete existing.clip;
      }

      return existing;
    },

    deleteImage(id) {
      if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.dispatch('Image.Delete', { id: String(id) });
        if (!res || !res.success) {
          console.error('Image.Delete failed in Go engine:', res && res.error);
          return false;
        }
        const strId = String(id);
        const idx = this.list.findIndex((img) => String(img.id) === strId);
        if (idx !== -1) {
          this.list.splice(idx, 1);
          if (typeof window !== 'undefined' && window.ObjectGroups) {
            window.ObjectGroups.pruneMember('image', strId);
          }
          if (typeof window !== 'undefined' && window.LayerManager) {
            window.LayerManager.removeEntry('image', strId);
          }
        }
        return true;
      }
      console.error('Image.Delete rejected: Go/WASM engine is unavailable');
      return false;
    },

    clearAll() {
      this.list = [];
      this.counter = 0;
    },

    getState() {
      return {
        images: JSON.parse(JSON.stringify(this.list)),
        imagesCounter: this.counter
      };
    },

    setState(state = {}) {
      if (!state) return;
      this.list = Array.isArray(state.images) ? JSON.parse(JSON.stringify(state.images)) : [];
      this.counter = parseInt(state.imagesCounter, 10) || 0;
      this.list.forEach((img) => {
        const match = String(img.id).match(/image-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > this.counter) this.counter = num;
        }
      });
    },

    findImageAtPct(xPct, yPct, canvasW = 1280, canvasH = 720) {
      let orderedImages = this.list.slice();
      if (typeof window !== 'undefined' && window.LayerManager && Array.isArray(window.LayerManager.list)) {
        const layerOrder = window.LayerManager.list;
        const idRank = new Map();
        layerOrder.forEach((l, idx) => {
          if (l.type === 'image') idRank.set(String(l.id), idx);
        });
        orderedImages.sort((a, b) => {
          const rA = idRank.has(String(a.id)) ? idRank.get(String(a.id)) : -1;
          const rB = idRank.has(String(b.id)) ? idRank.get(String(b.id)) : -1;
          return rB - rA;
        });
      } else {
        orderedImages.reverse();
      }

      for (const img of orderedImages) {
        let effVis = img.visible !== false;
        if (typeof window !== 'undefined' && window.LayerManager) {
          effVis = window.LayerManager.getEffective('image', img.id).visible;
        }
        if (!effVis) continue;

        const hwPct = ((img.width || 200) / 2 / canvasW) * 100;
        const hhPct = ((img.height || 150) / 2 / canvasH) * 100;
        if (xPct >= (img.x - hwPct) && xPct <= (img.x + hwPct) &&
            yPct >= (img.y - hhPct) && yPct <= (img.y + hhPct)) {
          return img;
        }
      }
      return null;
    },

    renderImageElement(img, canvasW = 1280, canvasH = 720) {
      if (!img) return '';
      let effVis = img.visible !== false;
      if (typeof window !== 'undefined' && window.LayerManager) {
        effVis = window.LayerManager.getEffective('image', img.id).visible;
      }
      if (!effVis) return '';

      const cx = (img.x / 100) * canvasW;
      const cy = (img.y / 100) * canvasH;
      const w = Number(img.width) || 200;
      const h = Number(img.height) || 150;
      const x = cx - w / 2;
      const y = cy - h / 2;
      const op = typeof img.opacity === 'number' ? img.opacity : 1.0;
      const par = img.maintainAspectRatio !== false ? 'xMidYMid meet' : 'none';
      const href = img.src || img.data || img.assetRef || '';

      let innerSvg = '';
      if (img.crop && img.crop.enabled && img.crop.sourceWidth > 0 && img.crop.sourceHeight > 0) {
        const crop = img.crop;
        const natW = Number(img.naturalWidth) || Number(crop.origWidth) || w;
        const natH = Number(img.naturalHeight) || Number(crop.origHeight) || h;
        const vb = `${crop.sourceX.toFixed(2)} ${crop.sourceY.toFixed(2)} ${crop.sourceWidth.toFixed(2)} ${crop.sourceHeight.toFixed(2)}`;
        innerSvg = `<svg id="img-${img.id}" data-image-id="${img.id}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w}" height="${h}" viewBox="${vb}" preserveAspectRatio="${par}" opacity="${parseFloat(op.toFixed(4))}" style="overflow: hidden;"><image href="${href}" xlink:href="${href}" x="0" y="0" width="${natW}" height="${natH}" preserveAspectRatio="none" /></svg>`;
      } else {
        innerSvg = `<image id="img-${img.id}" data-image-id="${img.id}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w}" height="${h}" href="${href}" xlink:href="${href}" preserveAspectRatio="${par}" opacity="${parseFloat(op.toFixed(4))}" />`;
      }

      if (img.clip && img.clip.enabled && img.clip.width > 0 && img.clip.height > 0) {
        const clip = img.clip;
        const clipId = `clip-${img.id}`;
        return `<g id="clip-group-${img.id}" data-image-id="${img.id}"><defs><clipPath id="${clipId}"><rect x="${(x + clip.x).toFixed(2)}" y="${(y + clip.y).toFixed(2)}" width="${clip.width.toFixed(2)}" height="${clip.height.toFixed(2)}" /></clipPath></defs><g clip-path="url(#${clipId})">${innerSvg}</g></g>`;
      }

      return innerSvg;
    },

    injectIntoSVG(svgString, state) {
      if (!svgString) return svgString;
      const images = (state && state.images) || this.list || [];
      if (!images.length) return svgString;

      const cw = (state && state.canvas && state.canvas.width) || 1280;
      const ch = (state && state.canvas && state.canvas.height) || 720;

      const parts = images.map((img) => this.renderImageElement(img, cw, ch)).filter(Boolean);
      if (!parts.length) return svgString;

      const layerContent = `\n  <g id="images-layer">\n    ${parts.join('\n    ')}\n  </g>`;
      if (svgString.includes('<g id="nodes-layer">')) {
        return svgString.replace('<g id="nodes-layer">', layerContent + '\n  <g id="nodes-layer">');
      }
      return svgString.replace('</svg>', layerContent + '\n</svg>');
    }
  };

  const LayerManager = {
    list: [],

    getLayers() {
      return JSON.parse(JSON.stringify(this.list));
    },

    setLayers(layers, options = {}) {
      if (Array.isArray(layers)) {
        this.list = layers.map((l) => ({
          type: String(l.type),
          id: String(l.id),
          visible: l.visible !== undefined ? !!l.visible : true,
          locked: !!l.locked
        }));
        if (!options.skipBridge && typeof window !== 'undefined' && window.EngineBridge && window.EngineBridge.isReady()) {
          window.EngineBridge.setLayers(this.list);
        }
      }
    },

    syncFromEngine() {
      if (typeof window !== 'undefined' && window.EngineBridge && window.EngineBridge.isReady()) {
        const layers = window.EngineBridge.getLayers();
        if (Array.isArray(layers) && layers.length > 0) {
          this.list = layers.map((l) => ({
            type: String(l.type),
            id: String(l.id),
            visible: l.visible !== undefined ? !!l.visible : true,
            locked: !!l.locked
          }));
          return;
        }
      }
      this.ensureAllObjectsRepresented();
    },

    ensureAllObjectsRepresented() {
      const existing = new Set(this.list.map((l) => `${l.type}:${l.id}`));
      const defaultOrder = [];

      if (typeof window !== 'undefined' && window.Ripples && Array.isArray(window.Ripples.list)) {
        window.Ripples.list.forEach((r) => {
          const key = `ripple:${r.id}`;
          if (!existing.has(key)) {
            defaultOrder.push({ type: 'ripple', id: String(r.id) });
            existing.add(key);
          }
        });
      }
      if (typeof window !== 'undefined' && window.Glows && Array.isArray(window.Glows.list)) {
        window.Glows.list.forEach((g) => {
          const key = `glow:${g.id}`;
          if (!existing.has(key)) {
            defaultOrder.push({ type: 'glow', id: String(g.id) });
            existing.add(key);
          }
        });
      }
      if (typeof window !== 'undefined' && window.DataFlows && Array.isArray(window.DataFlows.list)) {
        window.DataFlows.list.forEach((f) => {
          const key = `flow:${f.id}`;
          if (!existing.has(key)) {
            defaultOrder.push({ type: 'flow', id: String(f.id) });
            existing.add(key);
          }
        });
      }
      if (typeof window !== 'undefined' && window.ImageObjects && Array.isArray(window.ImageObjects.list)) {
        window.ImageObjects.list.forEach((img) => {
          const key = `image:${img.id}`;
          if (!existing.has(key)) {
            defaultOrder.push({ type: 'image', id: String(img.id) });
            existing.add(key);
          }
        });
      }
      if (typeof window !== 'undefined' && window.DiagramNodes && Array.isArray(window.DiagramNodes.list)) {
        window.DiagramNodes.list.forEach((n) => {
          const key = `node:${n.id}`;
          if (!existing.has(key)) {
            defaultOrder.push({ type: 'node', id: String(n.id) });
            existing.add(key);
          }
        });
      }

      if (this.list.length === 0) {
        this.list = defaultOrder;
      } else {
        this.list = this.list.concat(defaultOrder);
      }
    },

    addEntry(type, id) {
      const strId = String(id);
      if (!this.list.some((l) => l.type === type && String(l.id) === strId)) {
        this.list.push({ type: String(type), id: strId });
      }
    },

    removeEntry(type, id) {
      const strId = String(id);
      this.list = this.list.filter((l) => !(l.type === type && String(l.id) === strId));
    },

    _expandTargets(targets) {
      const set = new Set();
      const res = [];
      const add = (t, i) => {
        const k = `${t}:${i}`;
        if (!set.has(k)) {
          set.add(k);
          res.push({ type: t, id: String(i) });
        }
      };

      (Array.isArray(targets) ? targets : [targets]).forEach((item) => {
        if (!item) return;
        if (typeof item === 'string') {
          if (item.startsWith('group-')) {
            const grp = window.ObjectGroups && window.ObjectGroups.getGroup(item);
            if (grp && Array.isArray(grp.members)) {
              grp.members.forEach((m) => add(m.type, m.id));
              return;
            }
          }
          const parts = item.split(':');
          if (parts.length === 2) {
            add(parts[0], parts[1]);
            return;
          }
        }
        if (item.type === 'group' || (item.groupId && !item.type)) {
          const gid = item.groupId || item.id;
          const grp = window.ObjectGroups && window.ObjectGroups.getGroup(gid);
          if (grp && Array.isArray(grp.members)) {
            grp.members.forEach((m) => add(m.type, m.id));
            return;
          }
        }
        if (item.type && item.id != null) {
          const grp = window.ObjectGroups && window.ObjectGroups.findGroupByMember(item.type, item.id);
          if (grp && Array.isArray(grp.members)) {
            grp.members.forEach((m) => add(m.type, m.id));
          } else {
            add(item.type, item.id);
          }
        }
      });
      return res;
    },

    bringToFront(targets) {
      if (typeof window !== 'undefined' && window.EngineBridge && window.EngineBridge.isReady()) {
        return window.EngineBridge.bringToFront(targets);
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    sendToBack(targets) {
      if (typeof window !== 'undefined' && window.EngineBridge && window.EngineBridge.isReady()) {
        return window.EngineBridge.sendToBack(targets);
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    bringForward(targets) {
      if (typeof window !== 'undefined' && window.EngineBridge && window.EngineBridge.isReady()) {
        return window.EngineBridge.bringForward(targets);
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    sendBackward(targets) {
      if (typeof window !== 'undefined' && window.EngineBridge && window.EngineBridge.isReady()) {
        return window.EngineBridge.sendBackward(targets);
      }
      return { success: false, error: 'Go/WASM engine is unavailable' };
    },

    setVisibility(type, id, visible) {
      const v = !!visible;
      const strId = String(id);
      if (type === 'group') {
        const grp = window.ObjectGroups && window.ObjectGroups.getGroup(strId);
        if (grp) {
          if (!grp.metadata) grp.metadata = {};
          grp.metadata.visible = v;
          grp.visible = v;
        }
        const vEntry = this.list.find((l) => l.type === 'group' && String(l.id) === strId);
        if (vEntry) vEntry.visible = v;
        if (typeof window !== 'undefined' && window.EngineBridge && window.EngineBridge.isReady()) {
          window.EngineBridge.setLayerVisibility('group', strId, v);
        }
        return;
      }
      if (type === 'node' && window.DiagramNodes) {
        window.DiagramNodes.updateNode(strId, { visible: v });
      } else if (type === 'flow' && window.DataFlows) {
        window.DataFlows.updateFlow(strId, { visible: v });
      } else if (type === 'glow' && window.Glows) {
        window.Glows.updateGlow(strId, { visible: v });
      } else if (type === 'ripple' && window.Ripples) {
        window.Ripples.updateRipple(strId, { visible: v });
      } else if (type === 'image' && window.ImageObjects) {
        window.ImageObjects.updateImage(strId, { visible: v });
      }
      const vEntry = this.list.find((l) => l.type === type && String(l.id) === strId);
      if (vEntry) vEntry.visible = v;

      if (typeof window !== 'undefined' && window.EngineBridge && window.EngineBridge.isReady()) {
        window.EngineBridge.setLayerVisibility(type, strId, v);
      }
    },

    setLocked(type, id, locked) {
      const l = !!locked;
      const strId = String(id);
      if (type === 'group') {
        const grp = window.ObjectGroups && window.ObjectGroups.getGroup(strId);
        if (grp) {
          if (!grp.metadata) grp.metadata = {};
          grp.metadata.locked = l;
          grp.locked = l;
        }
        const lEntry = this.list.find((lItem) => lItem.type === 'group' && String(lItem.id) === strId);
        if (lEntry) lEntry.locked = l;
        if (typeof window !== 'undefined' && window.EngineBridge && window.EngineBridge.isReady()) {
          window.EngineBridge.setLayerLocked('group', strId, l);
        }
        return;
      }
      if (type === 'node' && window.DiagramNodes) {
        window.DiagramNodes.updateNode(strId, { locked: l });
      } else if (type === 'flow' && window.DataFlows) {
        window.DataFlows.updateFlow(strId, { locked: l });
      } else if (type === 'glow' && window.Glows) {
        window.Glows.updateGlow(strId, { locked: l });
      } else if (type === 'ripple' && window.Ripples) {
        window.Ripples.updateRipple(strId, { locked: l });
      } else if (type === 'image' && window.ImageObjects) {
        window.ImageObjects.updateImage(strId, { locked: l });
      }
      const lEntry = this.list.find((lItem) => lItem.type === type && String(lItem.id) === strId);
      if (lEntry) lEntry.locked = l;

      if (typeof window !== 'undefined' && window.EngineBridge && window.EngineBridge.isReady()) {
        window.EngineBridge.setLayerLocked(type, strId, l);
      }
    },

    getEffective(type, id) {
      if (!['node', 'flow', 'glow', 'ripple', 'image', 'group'].includes(String(type))) {
        return { visible: true, locked: false };
      }
      if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.dispatch('Layer.GetEffective', { type: String(type), id: String(id) });
        if (res && res.visible !== undefined && res.locked !== undefined) {
          return { visible: !!res.visible, locked: !!res.locked };
        }
      }
      let ownVisible = true;
      let ownLocked = false;
      const strId = String(id);

      if (type === 'node' && window.DiagramNodes) {
        const n = window.DiagramNodes.getNode(strId);
        if (n) {
          if (n.visible !== undefined) ownVisible = !!n.visible;
          if (n.locked !== undefined) ownLocked = !!n.locked;
        }
      } else if (type === 'flow' && window.DataFlows) {
        const f = window.DataFlows.getFlow(strId);
        if (f) {
          if (f.visible !== undefined) ownVisible = !!f.visible;
          if (f.locked !== undefined) ownLocked = !!f.locked;
        }
      } else if (type === 'glow' && window.Glows) {
        const g = window.Glows.getGlow(strId);
        if (g) {
          if (g.visible !== undefined) ownVisible = !!g.visible;
          if (g.locked !== undefined) ownLocked = !!g.locked;
        }
      } else if (type === 'ripple' && window.Ripples) {
        const r = window.Ripples.getRipple(strId);
        if (r) {
          if (r.visible !== undefined) ownVisible = !!r.visible;
          if (r.locked !== undefined) ownLocked = !!r.locked;
        }
      } else if (type === 'image' && window.ImageObjects) {
        const img = window.ImageObjects.getImage(strId);
        if (img) {
          if (img.visible !== undefined) ownVisible = !!img.visible;
          if (img.locked !== undefined) ownLocked = !!img.locked;
        }
      } else if (type === 'group' && window.ObjectGroups) {
        const grp = window.ObjectGroups.getGroup(strId);
        if (grp) {
          if (grp.visible !== undefined) ownVisible = !!grp.visible;
          else if (grp.metadata && grp.metadata.visible !== undefined) ownVisible = !!grp.metadata.visible;
          if (grp.locked !== undefined) ownLocked = !!grp.locked;
          else if (grp.metadata && grp.metadata.locked !== undefined) ownLocked = !!grp.metadata.locked;
        }
      }

      if (type !== 'group' && window.ObjectGroups) {
        const grp = window.ObjectGroups.findGroupByMember(type, strId);
        if (grp) {
          const grpVis = grp.visible !== undefined ? grp.visible : (grp.metadata && grp.metadata.visible !== undefined ? grp.metadata.visible : true);
          const grpLock = grp.locked !== undefined ? grp.locked : (grp.metadata && grp.metadata.locked !== undefined ? grp.metadata.locked : false);
          if (grpVis === false) ownVisible = false;
          if (grpLock === true) ownLocked = true;
        }
      }

      return { visible: ownVisible, locked: ownLocked };
    }
  };

  if (typeof window !== 'undefined') {
    window.EngineBridge = EngineBridge;
    window.ObjectGroups = ObjectGroups;
    window.ImageObjects = ImageObjects;
    window.LayerManager = LayerManager;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EngineBridge, ObjectGroups, ImageObjects, LayerManager };
  }
})();
