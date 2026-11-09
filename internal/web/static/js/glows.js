/**
 * Hotspot Glows & Radar Pings Module (`window.Glows`)
 *
 * Layer 3 (Operational API):
 *   - `createGlow(initialProps)`, `updateGlow(id, patch)`, `deleteGlow(id)`,
 *     `getGlow(id)`, `getAllGlows()`, `getState()`, `setState(data)`,
 *     `injectIntoSVG(svgString, width, height)`
 *   - Zero direct DOM dependencies.
 *
 * Layer 1 (UI Presentation & Compatibility):
 *   - `init()`, `addGlow()`, `syncEditorUI(glow)`, `selectGlow(id)`,
 *     `deselectGlow()`, `updateActive(key, value)`, `handleStageClick(x, y)`,
 *     `updateUIOverlay(glow)`, `removeGlow(id)`, `renderList()`, `triggerAppRender()`
 */
window.Glows = {
  list: [],
  activeId: null,
  counter: 0,
  _initialized: false,

  // =========================================================================
  // Layer 3: Operational Functionality (Zero DOM Dependencies)
  // =========================================================================

  getGlow(id) {
    return this.list.find((g) => g.id === id) || null;
  },

  getAllGlows() {
    return this.list;
  },

  getState() {
    return {
      glows: JSON.parse(JSON.stringify(this.list)),
      glowsCounter: this.counter,
      activeId: this.activeId
    };
  },

  setState(data) {
    if (!data || typeof data !== 'object') return this.getState();
    const rawList = Array.isArray(data.glows) ? data.glows : (Array.isArray(data.list) ? data.list : []);
    this.list = JSON.parse(JSON.stringify(rawList));
    const maxId = this.list.reduce((m, g) => Math.max(m, g.id || 0), 0);
    const savedCounter = data.glowsCounter !== undefined ? data.glowsCounter : data.counter;
    this.counter = savedCounter !== undefined ? Math.max(savedCounter, maxId) : maxId;
    this.activeId = null;
    return this.getState();
  },

  createGlow(initialProps = {}) {
    // 1. Go/WASM Engine integration with seamless JS fallback
    if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
      const wasmGlow = window.EngineBridge.createGlow(initialProps);
      if (wasmGlow && wasmGlow.id) {
        const idNum = typeof wasmGlow.id === 'string' && /^\d+$/.test(wasmGlow.id) ? parseInt(wasmGlow.id, 10) : wasmGlow.id;
        const normalized = Object.assign({}, wasmGlow, {
          id: idNum,
          dur: wasmGlow.dur != null ? wasmGlow.dur : (initialProps.dur != null ? initialProps.dur : 2.0),
          rings: wasmGlow.rings || wasmGlow.radarRings || initialProps.rings || 1
        });
        if (typeof idNum === 'number' && idNum > this.counter) {
          this.counter = idNum;
        }
        const existingIdx = this.list.findIndex((g) => g.id === normalized.id);
        if (existingIdx >= 0) {
          this.list[existingIdx] = normalized;
        } else {
          this.list.push(normalized);
        }
        return normalized;
      }
    }

    // 2. JavaScript fallback
    this.counter++;
    const newGlow = {
      id: this.counter,
      shape: initialProps.shape || 'circle',
      color: initialProps.color || '#ff0044',
      playback: initialProps.playback || 'pingpong',
      hideOnDelay: initialProps.hideOnDelay !== undefined ? !!initialProps.hideOnDelay : true,
      size: initialProps.size !== undefined ? initialProps.size : 25,
      scale: initialProps.scale !== undefined ? initialProps.scale : 1.0,
      blur: initialProps.blur !== undefined ? initialProps.blur : 50,
      dur: initialProps.dur !== undefined ? initialProps.dur : 2.0,
      delay: initialProps.delay !== undefined ? initialProps.delay : 0.0,
      endDelay: initialProps.endDelay !== undefined ? initialProps.endDelay : 0.0,
      opacity: initialProps.opacity !== undefined ? initialProps.opacity : 1.0,
      thick: initialProps.thick !== undefined ? initialProps.thick : 2,
      coreR: initialProps.coreR !== undefined ? initialProps.coreR : 5,
      rings: initialProps.rings !== undefined ? initialProps.rings : 1,
      x: initialProps.x !== undefined ? initialProps.x : 50,
      y: initialProps.y !== undefined ? initialProps.y : 50
    };
    if (initialProps.customB64) newGlow.customB64 = initialProps.customB64;
    if (initialProps.customMime) newGlow.customMime = initialProps.customMime;
    if (initialProps.customW) newGlow.customW = initialProps.customW;
    if (initialProps.customH) newGlow.customH = initialProps.customH;

    this.list.push(newGlow);
    return newGlow;
  },

  updateGlow(id, patch) {
    const glow = this.getGlow(id);
    if (!glow || !patch || typeof patch !== 'object') return null;

    // Go/WASM Engine synchronization
    if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
      window.EngineBridge.updateGlow(id, patch);
    }

    Object.keys(patch).forEach((key) => {
      if (key !== 'id') {
        glow[key] = patch[key];
      }
    });
    return glow;
  },

  deleteGlow(id) {
    // Go/WASM Engine synchronization
    if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
      window.EngineBridge.deleteGlow(id);
    }

    const before = this.list.length;
    this.list = this.list.filter((g) => g.id !== id);
    if (this.activeId === id) {
      this.activeId = null;
    }
    return this.list.length < before;
  },

  findGlowAt(xPct, yPct, canvasW = 1280, canvasH = 720) {
    // Go/WASM Engine integration with seamless JS fallback
    if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
      const wasmFound = window.EngineBridge.findGlowAt(xPct, yPct, canvasW, canvasH);
      if (wasmFound && wasmFound.id) {
        return this.getGlow(wasmFound.id) || wasmFound;
      }
      if (wasmFound === null) return null;
    }

    // JavaScript fallback
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      const gx = (g.x / 100) * canvasW;
      const gy = (g.y / 100) * canvasH;
      const testX = (xPct / 100) * canvasW;
      const testY = (yPct / 100) * canvasH;
      const scale = g.scale || 1.0;
      if (g.shape === 'square') {
        const hw = Math.max(20, g.size || 25);
        if (testX >= gx - hw && testX <= gx + hw && testY >= gy - hw && testY <= gy + hw) return g;
      } else if (g.shape === 'custom' && g.customW && g.customH) {
        const hw = Math.max(20, (g.customW * scale) / 2);
        const hh = Math.max(20, (g.customH * scale) / 2);
        if (testX >= gx - hw && testX <= gx + hw && testY >= gy - hh && testY <= gy + hh) return g;
      } else {
        const hitR = Math.max(20, g.size || 25);
        const dx = testX - gx;
        const dy = testY - gy;
        if (dx * dx + dy * dy <= hitR * hitR) return g;
      }
    }
    return null;
  },

  findGlowAtPct(xPct, yPct, canvasW = 1280, canvasH = 720) {
    return this.findGlowAt(xPct, yPct, canvasW, canvasH);
  },

  getGlowBounds(id, canvasW = 1280, canvasH = 720) {
    if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
      const wasmBounds = window.EngineBridge.getGlowBounds(id, canvasW, canvasH);
      if (wasmBounds && wasmBounds.bounds) return wasmBounds;
    }

    const g = this.getGlow(id);
    if (!g) return null;
    const gx = (g.x / 100) * canvasW;
    const gy = (g.y / 100) * canvasH;
    const scale = g.scale || 1.0;
    let minX, maxX, minY, maxY;
    if (g.shape === 'square') {
      const hw = Math.max(20, g.size || 25);
      minX = gx - hw; maxX = gx + hw; minY = gy - hw; maxY = gy + hw;
    } else if (g.shape === 'custom' && g.customW && g.customH) {
      const hw = Math.max(20, (g.customW * scale) / 2);
      const hh = Math.max(20, (g.customH * scale) / 2);
      minX = gx - hw; maxX = gx + hw; minY = gy - hh; maxY = gy + hh;
    } else {
      const r = Math.max(20, g.size || 25);
      minX = gx - r; maxX = gx + r; minY = gy - r; maxY = gy + r;
    }
    return {
      glow: g,
      bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
      center: { x: gx, y: gy }
    };
  },

  injectIntoSVG(svgString, width, height) {
    if (this.list.length === 0) return svgString;
    let defs = '';
    let elements = '';

    const sineSpline = '0.42 0 0.58 1';
    const radarSpline = '0.16 0.84 0.32 1';
    const holdSpline = '0 0 1 1';

    this.list.forEach((glow) => {
      const px = (glow.x / 100) * width;
      const py = (glow.y / 100) * height;
      const op = glow.opacity !== undefined ? glow.opacity : 1.0;
      const softness = glow.blur !== undefined ? glow.blur : 50;
      const shape = glow.shape || 'circle';
      const scale = glow.scale !== undefined ? glow.scale : 1.0;
      const endDelay = glow.endDelay || 0;
      const totalDur = glow.dur + endDelay;

      let fillAttr = 'fill="' + glow.color + '"';
      let filterAttr = '';

      if (shape === 'circle') {
        const coreSize = Math.max(0, 100 - softness);
        const gradId = 'glowGrad-' + glow.id;
        defs += '<radialGradient id="' + gradId + '"><stop offset="' + coreSize + '%" stop-color="' + glow.color + '" stop-opacity="1" /><stop offset="100%" stop-color="' + glow.color + '" stop-opacity="0" /></radialGradient>';
        fillAttr = 'fill="url(#' + gradId + ')"';
      } else if (shape !== 'radar' && softness > 0) {
        const blurId = 'glowBlur-' + glow.id;
        defs += '<filter id="' + blurId + '" filterUnits="userSpaceOnUse" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="' + (softness / 4) + '" /></filter>';
        filterAttr = 'filter="url(#' + blurId + ')"';
      }

      let animTag = '';
      const holdVal = glow.hideOnDelay !== false ? '0' : op;

      if (endDelay > 0) {
        const r = (glow.dur / totalDur).toFixed(4);
        const rHalf = (glow.dur / totalDur / 2).toFixed(4);
        const rSafe = Math.min((glow.dur / totalDur) + 0.0001, 0.9999).toFixed(4);
        if (glow.playback === 'pingpong') {
          animTag = '<animate attributeName="opacity" values="0; ' + op + '; 0; 0" keyTimes="0; ' + rHalf + '; ' + r + '; 1" calcMode="spline" keySplines="' + sineSpline + '; ' + sineSpline + '; ' + holdSpline + '" dur="' + totalDur + 's" begin="' + glow.delay + 's" repeatCount="indefinite" />';
        } else if (glow.playback === 'linear') {
          animTag = '<animate attributeName="opacity" values="0; ' + op + '; ' + holdVal + '; ' + holdVal + '" keyTimes="0; ' + r + '; ' + rSafe + '; 1" calcMode="spline" keySplines="' + sineSpline + '; ' + holdSpline + '; ' + holdSpline + '" dur="' + totalDur + 's" begin="' + glow.delay + 's" repeatCount="indefinite" />';
        } else if (glow.playback === 'once') {
          animTag = '<animate attributeName="opacity" values="0; ' + op + '" keyTimes="0; 1" calcMode="spline" keySplines="' + sineSpline + '" dur="' + glow.dur + 's" begin="' + glow.delay + 's" repeatCount="1" fill="freeze" />';
        } else if (glow.playback === 'static') {
          animTag = '<set attributeName="opacity" to="' + op + '" begin="' + glow.delay + 's" fill="freeze" />';
        }
      } else {
        if (glow.playback === 'pingpong') {
          animTag = '<animate attributeName="opacity" values="0; ' + op + '; 0" keyTimes="0; 0.5; 1" calcMode="spline" keySplines="' + sineSpline + '; ' + sineSpline + '" dur="' + glow.dur + 's" begin="' + glow.delay + 's" repeatCount="indefinite" />';
        } else if (glow.playback === 'linear') {
          animTag = '<animate attributeName="opacity" values="0; ' + op + '" keyTimes="0; 1" calcMode="spline" keySplines="' + sineSpline + '" dur="' + glow.dur + 's" begin="' + glow.delay + 's" repeatCount="indefinite" />';
        } else if (glow.playback === 'once') {
          animTag = '<animate attributeName="opacity" values="0; ' + op + '" keyTimes="0; 1" calcMode="spline" keySplines="' + sineSpline + '" dur="' + glow.dur + 's" begin="' + glow.delay + 's" repeatCount="1" fill="freeze" />';
        } else if (glow.playback === 'static') {
          animTag = '<set attributeName="opacity" to="' + op + '" begin="' + glow.delay + 's" fill="freeze" />';
        }
      }

      let visibilityControl = '';
      let setAnim = '';
      if (glow.delay > 0) {
        visibilityControl = 'visibility="hidden"';
        setAnim = '<set attributeName="visibility" to="visible" begin="' + glow.delay + 's" fill="freeze" />';
      }

      let shapeEl = '';
      if (shape === 'custom' && glow.customB64) {
        const w = glow.customW;
        const h = glow.customH;
        shapeEl = '<g transform="translate(' + px.toFixed(2) + ', ' + py.toFixed(2) + ') scale(' + scale + ')"><image href="data:' + glow.customMime + ';base64,' + glow.customB64 + '" xlink:href="data:' + glow.customMime + ';base64,' + glow.customB64 + '" x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" ' + filterAttr + ' /></g>';
      } else if (shape === 'square') {
        shapeEl = '<rect x="' + (px - glow.size).toFixed(2) + '" y="' + (py - glow.size).toFixed(2) + '" width="' + (glow.size * 2) + '" height="' + (glow.size * 2) + '" ' + fillAttr + ' ' + filterAttr + ' />';
      } else if (shape === 'radar') {
        const coreR = glow.coreR !== undefined ? glow.coreR : 5;
        const strokeW = glow.thick !== undefined ? glow.thick : 2;
        const ringCount = glow.rings !== undefined ? glow.rings : 1;
        const ringRepeat = (glow.playback === 'once' || glow.playback === 'static') ? '1' : 'indefinite';
        const ringFreeze = (glow.playback === 'once' || glow.playback === 'static') ? 'fill="freeze"' : '';
        let ringElements = '';

        if (glow.playback !== 'static') {
          for (let i = 0; i < ringCount; i++) {
            const stagger = (glow.dur / ringCount) * i;
            let rAnim = '';
            let opAnim = '';
            if (endDelay > 0) {
              const rRatio = (glow.dur / totalDur).toFixed(4);
              rAnim = '<animate attributeName="r" values="' + coreR + '; ' + glow.size + '; ' + glow.size + '" keyTimes="0; ' + rRatio + '; 1" calcMode="spline" keySplines="' + radarSpline + '; ' + holdSpline + '" dur="' + totalDur + 's" begin="' + (glow.delay + stagger).toFixed(3) + 's" repeatCount="' + ringRepeat + '" ' + ringFreeze + ' />';
              opAnim = '<animate attributeName="opacity" values="' + op + '; 0; 0" keyTimes="0; ' + rRatio + '; 1" calcMode="spline" keySplines="' + radarSpline + '; ' + holdSpline + '" dur="' + totalDur + 's" begin="' + (glow.delay + stagger).toFixed(3) + 's" repeatCount="' + ringRepeat + '" ' + ringFreeze + ' />';
            } else {
              rAnim = '<animate attributeName="r" values="' + coreR + '; ' + glow.size + '" keyTimes="0; 1" calcMode="spline" keySplines="' + radarSpline + '" dur="' + glow.dur + 's" begin="' + (glow.delay + stagger).toFixed(3) + 's" repeatCount="' + ringRepeat + '" ' + ringFreeze + ' />';
              opAnim = '<animate attributeName="opacity" values="' + op + '; 0" keyTimes="0; 1" calcMode="spline" keySplines="' + radarSpline + '" dur="' + glow.dur + 's" begin="' + (glow.delay + stagger).toFixed(3) + 's" repeatCount="' + ringRepeat + '" ' + ringFreeze + ' />';
            }
            ringElements += '<circle cx="' + px.toFixed(2) + '" cy="' + py.toFixed(2) + '" r="' + coreR + '" fill="none" stroke="' + glow.color + '" stroke-width="' + strokeW + '" opacity="0" ' + filterAttr + '>' + rAnim + opAnim + '</circle>';
          }
        }
        shapeEl = '<circle cx="' + px.toFixed(2) + '" cy="' + py.toFixed(2) + '" r="' + coreR + '" fill="none" stroke="' + glow.color + '" stroke-width="' + strokeW + '" ' + filterAttr + ' />' + ringElements;
      } else {
        shapeEl = '<circle cx="' + px.toFixed(2) + '" cy="' + py.toFixed(2) + '" r="' + glow.size + '" ' + fillAttr + ' />';
      }
      let hitTargetEl = '';
      const hitRadius = Math.max(20, glow.size || 25);
      if (shape === 'square') {
        hitTargetEl = '<rect class="glow-hit-target" x="' + (px - glow.size).toFixed(2) + '" y="' + (py - glow.size).toFixed(2) + '" width="' + (glow.size * 2) + '" height="' + (glow.size * 2) + '" fill="transparent" pointer-events="all" style="cursor: pointer;" />';
      } else if (shape === 'custom' && glow.customW && glow.customH) {
        const hw = (glow.customW * scale) / 2;
        const hh = (glow.customH * scale) / 2;
        hitTargetEl = '<rect class="glow-hit-target" x="' + (px - hw).toFixed(2) + '" y="' + (py - hh).toFixed(2) + '" width="' + (hw * 2).toFixed(2) + '" height="' + (hh * 2).toFixed(2) + '" fill="transparent" pointer-events="all" style="cursor: pointer;" />';
      } else {
        hitTargetEl = '<circle class="glow-hit-target" cx="' + px.toFixed(2) + '" cy="' + py.toFixed(2) + '" r="' + hitRadius.toFixed(2) + '" fill="transparent" pointer-events="all" style="cursor: pointer;" />';
      }

      elements += '<g class="diagram-glow-instance" data-glow-id="' + glow.id + '">' +
        hitTargetEl +
        '<g ' + visibilityControl + ' pointer-events="none">' + setAnim + '<g opacity="0">' + animTag + shapeEl + '</g></g>' +
        '</g>';
    });

    return svgString.replace('<!-- INJECT_CAMERA_RIG_ELEMENTS -->', '\n<defs>\n' + defs + '\n</defs>\n<g id="glows-layer">\n' + elements + '\n</g>\n<!-- INJECT_CAMERA_RIG_ELEMENTS -->');
  },

  // =========================================================================
  // Layer 1: UI Presentation & DOM Bindings
  // =========================================================================

  init() {
    if (this._initialized) return;
    this._initialized = true;

    const btnAdd = document.getElementById('btnAddGlow');
    if (btnAdd) btnAdd.addEventListener('click', () => this.addGlow());

    const btnDeselect = document.getElementById('btnDeselectGlow');
    if (btnDeselect) {
      btnDeselect.addEventListener('click', () => {
        if (window.AppCoordinator && typeof window.AppCoordinator.clearSelection === 'function') {
          window.AppCoordinator.clearSelection({ reason: 'sidebar_deselect_glow' });
        } else {
          this.deselectGlow();
        }
      });
    }

    ['playback', 'color', 'shape', 'hideOnDelay'].forEach((key) => {
      let elId = 'glow' + key.charAt(0).toUpperCase() + key.slice(1);
      if (key === 'color') elId += 'Picker';
      else if (key === 'shape' || key === 'playback') elId += 'Select';

      const el = document.getElementById(elId);
      if (el) {
        if (key === 'color') {
          el.addEventListener('input', (e) => this.updateActive('color', e.target.value));
        }
        el.addEventListener('change', (e) => {
          this.updateActive(key, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
          if (key === 'shape') {
            this.syncShapeVisibilityUI(e.target.value);
          }
          if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
          else if (window.HistoryManager) window.HistoryManager.recordImmediate();
        });
      }
    });

    const customIn = document.getElementById('glowCustomInput');
    if (customIn) {
      customIn.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target.result;
          const img = new Image();
          img.onload = () => {
            if (this.activeId !== null) {
              const updated = this.updateGlow(this.activeId, {
                customB64: dataUrl.split(',')[1],
                customMime: file.type,
                customW: img.naturalWidth,
                customH: img.naturalHeight
              });
              if (updated) {
                this.triggerAppRender();
                if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
                else if (window.HistoryManager) window.HistoryManager.recordImmediate();
              }
            }
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      });
    }

    ['size', 'dur', 'speed', 'delay', 'opacity', 'blur', 'scale', 'endDelay', 'thick', 'coreR', 'rings'].forEach((key) => {
      const propKey = key === 'speed' ? 'dur' : key;
      const cap = key.charAt(0).toUpperCase() + key.slice(1);
      const slider = document.getElementById('glow' + cap + 'Slider');
      const num = document.getElementById('glow' + cap + 'Num');
      if (slider && num) {
        slider.addEventListener('input', (e) => {
          num.value = e.target.value;
          this.updateActive(propKey, parseFloat(e.target.value));
          if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
          else if (window.HistoryManager) window.HistoryManager.recordDebounced();
        });
        num.addEventListener('input', (e) => {
          slider.value = e.target.value;
          this.updateActive(propKey, parseFloat(e.target.value));
          if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
          else if (window.HistoryManager) window.HistoryManager.recordDebounced();
        });
      }
    });
  },

  syncShapeVisibilityUI(shape) {
    const cRow = document.getElementById('glowCustomRow');
    const colRow = document.getElementById('glowColorRow');
    const szCont = document.getElementById('glowSizeContainer');
    const scCont = document.getElementById('glowScaleContainer');
    const radCont = document.getElementById('glowRadarContainer');
    if (cRow) cRow.style.display = shape === 'custom' ? 'block' : 'none';
    if (colRow) colRow.style.display = shape === 'custom' ? 'none' : 'flex';
    if (szCont) szCont.style.display = shape === 'custom' ? 'none' : 'block';
    if (scCont) scCont.style.display = shape === 'custom' ? 'block' : 'none';
    if (radCont) radCont.style.display = shape === 'radar' ? 'block' : 'none';
  },

  addGlow(initialProps = {}) {
    const newGlow = this.createGlow(initialProps);
    this.selectGlow(newGlow.id);
    this.triggerAppRender();
    if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
    else if (window.HistoryManager) window.HistoryManager.recordImmediate();
    return newGlow;
  },

  syncEditorUI(glow) {
    if (!glow) return;
    const ed = document.getElementById('glowEditor');
    if (ed) ed.style.display = 'block';
    const empty = document.getElementById('emptyGlowSelection');
    if (empty) empty.style.display = 'none';
    const lbl = document.getElementById('editingGlowLabel');
    if (lbl) lbl.innerText = 'Editing Glow ' + glow.id;

    const shSel = document.getElementById('glowShapeSelect');
    if (shSel) shSel.value = glow.shape || 'circle';
    const pbSel = document.getElementById('glowPlaybackSelect');
    if (pbSel) pbSel.value = glow.playback;
    const colPick = document.getElementById('glowColorPicker');
    if (colPick) colPick.value = glow.color;
    const hideChk = document.getElementById('glowHideOnDelay');
    if (hideChk) hideChk.checked = glow.hideOnDelay !== false;

    this.syncShapeVisibilityUI(glow.shape || 'circle');

    ['opacity', 'blur', 'scale', 'size', 'dur', 'delay', 'endDelay', 'thick', 'coreR', 'rings'].forEach((key) => {
      const val = glow[key] !== undefined ? glow[key] : (key === 'opacity' || key === 'scale' ? 1.0 : (key === 'size' ? 25 : 0));
      const cap = key.charAt(0).toUpperCase() + key.slice(1);
      const sl = document.getElementById('glow' + cap + 'Slider') || (key === 'dur' ? document.getElementById('glowSpeedSlider') : null);
      const nu = document.getElementById('glow' + cap + 'Num') || (key === 'dur' ? document.getElementById('glowSpeedNum') : null);
      if (sl) sl.value = val;
      if (nu) nu.value = val;
    });
  },

  selectGlow(id) {
    if (window.AppCoordinator) {
      window.AppCoordinator.selectObject('glow', id, { skipStageClear: true, skipModuleSelect: true });
    } else {
      if (window.DiagramNodes) window.DiagramNodes.deselectNode();
      if (window.DataFlows) window.DataFlows.deselectFlow();
      if (window.Ripples) window.Ripples.deselectRipple();
    }

    this.activeId = id;
    this.renderList();
    document.body.classList.add('editing-flow');

    const glow = this.getGlow(id);
    if (glow) {
      this.syncEditorUI(glow);
      this.updateUIOverlay(glow);
      const ret = document.getElementById('glowReticleTarget');
      if (ret) ret.style.display = 'flex';
    }
  },

  deselectGlow() {
    this.activeId = null;
    this.renderList();
    document.body.classList.remove('editing-flow');
    const editor = document.getElementById('glowEditor');
    if (editor) editor.style.display = 'none';
    const empty = document.getElementById('emptyGlowSelection');
    if (empty) empty.style.display = 'block';
    const ret = document.getElementById('glowReticleTarget');
    if (ret) ret.style.display = 'none';
    if (window.AppCoordinator && window.AppCoordinator.activeSelection && window.AppCoordinator.activeSelection.type === 'glow' && !window.AppCoordinator._isCoordinatingSelection) {
      window.AppCoordinator.clearSelection();
    }
  },

  updateActive(key, value) {
    if (this.activeId === null) return;
    const glow = this.updateGlow(this.activeId, { [key]: value });
    if (glow) {
      this.renderList();
      this.triggerAppRender();
      if (key === 'color' || key === 'shape') this.updateUIOverlay(glow);
    }
  },

  handleStageClick(x, y) {
    if (this.activeId === null) return false;
    const glow = this.updateGlow(this.activeId, { x, y });
    if (glow) {
      this.updateUIOverlay(glow);
      this.triggerAppRender();
      return true;
    }
    return false;
  },

  updateUIOverlay(glow) {
    const ret = document.getElementById('glowReticleTarget');
    if (ret && glow) {
      ret.style.left = glow.x + '%';
      ret.style.top = glow.y + '%';
      ret.style.borderColor = glow.color;
      ret.style.backgroundColor = glow.shape === 'custom' ? 'rgba(88,166,255,0.3)' : (glow.color + '4D');
      ret.style.borderRadius = (glow.shape === 'square' || glow.shape === 'custom') ? '4px' : '50%';
    }
  },

  removeGlow(id) {
    const wasActive = this.activeId === id;
    this.deleteGlow(id);
    if (wasActive) this.deselectGlow();
    else this.renderList();
    this.triggerAppRender();
    if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
    else if (window.HistoryManager) window.HistoryManager.recordImmediate();
  },

  renderList() {
    const container = document.getElementById('glowListContainer');
    if (!container) return;
    const emptyEl = document.getElementById('emptyGlowSelection');
    if (this.list.length === 0) {
      container.innerHTML = '<div class="stage-hint" id="emptyGlowHint">No glows active.</div>';
      if (emptyEl) emptyEl.innerHTML = 'No hotspots created. Click <strong>+ Add</strong> above to add one.';
      return;
    }
    if (emptyEl && !this.activeId) {
      emptyEl.innerHTML = 'Select a hotspot glow to edit pulse, color and radar attributes, or click <strong>+ Add</strong> above.';
    }
    container.innerHTML = '';
    const glowIcons = {
      circle: '⚪',
      square: '⏹',
      radar: '🎯',
      custom: '🖼'
    };
    this.list.forEach((glow) => {
      const isSel = (this.activeId === glow.id);
      const div = document.createElement('div');
      div.className = 'flow-list-item compact-instance-row' + (isSel ? ' selected' : '');
      div.style.borderLeftColor = glow.color || '#ff0044';
      const icon = glowIcons[glow.shape] || '✨';
      const safeLabel = 'Glow ' + glow.id;
      div.title = safeLabel + ' (' + glow.shape + ')';

      div.innerHTML =
        '<span class="instance-icon" style="color:' + (glow.color || '#ff0044') + ';" title="' + (glow.shape || 'circle') + '">' + icon + '</span>' +
        '<span class="instance-label">' + safeLabel + '</span>' +
        '<span class="compact-meta">' + glow.shape + '</span>' +
        '<button type="button" class="btn-row-action btn-row-delete" title="Delete glow" onclick="window.Glows.removeGlow(' + glow.id + '); event.stopPropagation();">&times;</button>';

      div.onclick = () => {
        if (this.activeId === glow.id) {
          if (window.AppCoordinator && typeof window.AppCoordinator.clearSelection === 'function') {
            window.AppCoordinator.clearSelection({ reason: 'sidebar_toggle_glow' });
          } else {
            this.deselectGlow();
          }
        } else {
          this.selectGlow(glow.id);
        }
      };
      container.appendChild(div);
    });
  },

  triggerAppRender() {
    if (window.AppCoordinator && typeof window.AppCoordinator.requestRender === 'function') {
      window.AppCoordinator.requestRender();
    } else if (typeof window.triggerAppRender === 'function') {
      window.triggerAppRender();
    } else {
      const durSlider = document.getElementById('durationSlider');
      if (durSlider) durSlider.dispatchEvent(new Event('input'));
    }
  }
};
