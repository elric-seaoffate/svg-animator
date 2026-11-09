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
              console.log('[EngineBridge] Go WebAssembly engine mounted successfully (v' + (this._bridge.version || '1.0.0') + ').');
              return resolve(true);
            }

            // Wait briefly for ready event if set up asynchronously
            const onReady = () => {
              window.removeEventListener('svg-animator-wasm-ready', onReady);
              if (window.__svgAnimatorWasmBridge) {
                this._bridge = window.__svgAnimatorWasmBridge;
                this.status = 'ready';
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
        return null;
      }
      const t0 = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();

      try {
        const res = this._bridge.dispatch(command, payload);
        const t1 = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        const duration = t1 - t0;
        this._stats.totalCalls++;
        this._stats.totalDurationMs += duration;
        this._stats.lastDurationMs = duration;

        if (res && res.success) {
          return res.data;
        } else {
          this._stats.errors++;
          console.error('[EngineBridge] Command failed (' + command + '):', res && res.error);
          return null;
        }
      } catch (err) {
        this._stats.errors++;
        console.error('[EngineBridge] Exception dispatching (' + command + '):', err);
        return null;
      }
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

    setSelection(type, id) {
      if (this.isReady()) {
        const res = this.dispatch('Selection.Set', {
          type: String(type || 'none'),
          id: id != null ? String(id) : ''
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

    getSceneState() {
      if (this.isReady()) {
        const res = this.dispatch('Scene.GetState', {});
        if (res) return res;
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
        anim: String(n.anim || n.animation || 'none')
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
        label: String(f.label || '')
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
        customH: Number(g.customH) || 0
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
        y: Number(r.y) || 0
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
        ripples: ripples
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

      return this.normalizeSceneSnapshot({
        revision: Date.now(),
        canvas: {
          width: cw,
          height: ch,
          duration: dur,
          loop: loop
        },
        camera: cam,
        optical: optical,
        frame: overlays,
        overlays: overlays,
        nodes: nodes,
        flows: flows,
        glows: glows,
        ripples: ripples
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

      if (this.isReady() && this._sceneSynced) {
        const res = this.dispatch('Timeline.EvaluateSceneAtTime', { time: t });
        if (res && res.flows) {
          this._stats.framesEvaluated++;
          this._lastEngineUsed = 'WASM';
          return res;
        } else {
          // If evaluation failed unexpectedly, mark unsynced
          this._sceneSynced = false;
        }
      }

      // Seamless mathematical JavaScript fallback
      this._stats.framesEvaluated++;
      this._lastEngineUsed = this._lastSyncError ? 'Sync failed (JS fallback)' : 'JS fallback';
      return this._evaluateSceneAtTimeJS(this._sceneCache, t);
    },

    evaluateBatch(times) {
      if (!Array.isArray(times) || times.length === 0) return [];
      if (!this._sceneCache) {
        this._sceneCache = this.buildCurrentSceneSnapshot();
      }

      if (this.isReady() && this._sceneSynced) {
        const res = this.dispatch('Timeline.EvaluateBatch', { times: times });
        if (Array.isArray(res)) {
          this._stats.framesEvaluated += times.length;
          this._lastEngineUsed = 'WASM';
          return res;
        }
      }

      this._stats.framesEvaluated += times.length;
      this._lastEngineUsed = this._lastSyncError ? 'Sync failed (JS fallback)' : 'JS fallback';
      return times.map((t) => this._evaluateSceneAtTimeJS(this._sceneCache, t));
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

  if (typeof window !== 'undefined') {
    window.EngineBridge = EngineBridge;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EngineBridge;
  }
})();
