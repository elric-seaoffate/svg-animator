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
    _stats: {
      totalCalls: 0,
      totalDurationMs: 0,
      lastDurationMs: 0,
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
    }
  };

  if (typeof window !== 'undefined') {
    window.EngineBridge = EngineBridge;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EngineBridge;
  }
})();
