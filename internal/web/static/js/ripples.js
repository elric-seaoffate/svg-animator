/**
 * Refractive Water Ripples Module (`window.Ripples`)
 *
 * Layer 3 (Operational API):
 *   - `createRipple(initialProps)`, `updateRipple(id, patch)`, `deleteRipple(id)`,
 *     `getRipple(id)`, `getAllRipples()`, `getState()`, `setState(data)`,
 *     `injectIntoSVG(svgString, state)`
 *   - Zero direct DOM dependencies.
 *
 * Layer 1 (UI Presentation & Compatibility):
 *   - `init()`, `addRipple()`, `syncEditorUI(rp)`, `selectRipple(id)`,
 *     `deselectRipple()`, `updateActive(key, value)`, `handleStageClick(x, y)`,
 *     `updateUIOverlay(rp)`, `removeRipple(id)`, `renderList()`, `triggerAppRender()`
 */
window.Ripples = {
  list: [],
  activeId: null,
  counter: 0,
  _initialized: false,

  // =========================================================================
  // Layer 3: Operational Functionality (Zero DOM Dependencies)
  // =========================================================================

  escapeXML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  getRipple(id) {
    if (id === null || id === undefined) return null;
    return this.list.find((r) => String(r.id) === String(id)) || null;
  },

  getAllRipples() {
    return this.list;
  },

  getState() {
    return {
      ripples: JSON.parse(JSON.stringify(this.list)),
      ripplesCounter: this.counter,
      activeId: this.activeId
    };
  },

  setState(data) {
    if (!data || typeof data !== 'object') return this.getState();
    const rawList = Array.isArray(data.ripples) ? data.ripples : (Array.isArray(data.list) ? data.list : []);
    this.list = JSON.parse(JSON.stringify(rawList));
    const maxId = this.list.reduce((m, r) => Math.max(m, r.id || 0), 0);
    const savedCounter = data.ripplesCounter !== undefined ? data.ripplesCounter : data.counter;
    this.counter = savedCounter !== undefined ? Math.max(savedCounter, maxId) : maxId;
    this.activeId = null;
    return this.getState();
  },

  createRipple(initialProps = {}) {
    // 1. Go/WASM Engine integration with seamless JS fallback
    if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
      const wasmRipple = window.EngineBridge.createRipple(initialProps);
      if (wasmRipple && wasmRipple.id) {
        const idNum = typeof wasmRipple.id === 'string' && /^\d+$/.test(wasmRipple.id) ? parseInt(wasmRipple.id, 10) : wasmRipple.id;
        const normalized = Object.assign({}, wasmRipple, {
          id: idNum,
          dur: wasmRipple.dur != null ? wasmRipple.dur : (initialProps.dur != null ? initialProps.dur : 3.0),
          rings: wasmRipple.rings || wasmRipple.waveCount || initialProps.rings || 3
        });
        if (typeof idNum === 'number' && idNum > this.counter) {
          this.counter = idNum;
        }
        const existingIdx = this.list.findIndex((r) => r.id === normalized.id);
        if (existingIdx >= 0) {
          this.list[existingIdx] = normalized;
        } else {
          this.list.push(normalized);
        }
        if (typeof window !== 'undefined' && window.LayerManager && typeof window.LayerManager.addEntry === 'function') {
          window.LayerManager.addEntry('ripple', normalized.id);
        }
        return normalized;
      }
    }

    // 2. JavaScript fallback
    this.counter++;
    const newRipple = {
      id: this.counter,
      color: initialProps.color || '#ffffff',
      opacity: initialProps.opacity !== undefined ? initialProps.opacity : 0.4,
      innerR: initialProps.innerR !== undefined ? initialProps.innerR : 0,
      outerR: initialProps.outerR !== undefined ? initialProps.outerR : 150,
      rings: initialProps.rings !== undefined ? initialProps.rings : 3,
      thick: initialProps.thick !== undefined ? initialProps.thick : 8,
      refraction: initialProps.refraction !== undefined ? initialProps.refraction : 35,
      dur: initialProps.dur !== undefined ? initialProps.dur : 3.0,
      delay: initialProps.delay !== undefined ? initialProps.delay : 0.0,
      endDelay: initialProps.endDelay !== undefined ? initialProps.endDelay : 1.0,
      x: initialProps.x !== undefined ? initialProps.x : 50,
      y: initialProps.y !== undefined ? initialProps.y : 50
    };
    this.list.push(newRipple);
    if (typeof window !== 'undefined' && window.LayerManager && typeof window.LayerManager.addEntry === 'function') {
      window.LayerManager.addEntry('ripple', newRipple.id);
    }
    return newRipple;
  },

  updateRipple(id, patch) {
    const rp = this.getRipple(id);
    if (!rp || !patch || typeof patch !== 'object') return null;

    // Go/WASM Engine synchronization
    if (patch.name !== undefined && typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.renameObject === 'function' && window.EngineBridge.isReady()) {
      window.EngineBridge.renameObject('ripple', id, patch.name);
    }
    if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
      window.EngineBridge.updateRipple(id, patch);
    }

    Object.keys(patch).forEach((key) => {
      if (key !== 'id') {
        rp[key] = patch[key];
      }
    });
    return rp;
  },

  deleteRipple(id) {
    // Go/WASM Engine synchronization
    if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
      window.EngineBridge.deleteRipple(id);
    }

    const before = this.list.length;
    this.list = this.list.filter((r) => String(r.id) !== String(id));
    if (this.activeId !== null && String(this.activeId) === String(id)) {
      this.activeId = null;
    }
    if (window.ObjectGroups && typeof window.ObjectGroups.pruneMember === 'function') {
      window.ObjectGroups.pruneMember('ripple', id);
    }
    if (typeof window !== 'undefined' && window.LayerManager && typeof window.LayerManager.removeEntry === 'function') {
      window.LayerManager.removeEntry('ripple', id);
    }
    return this.list.length < before;
  },

  findRippleAt(xPct, yPct, canvasW = 1280, canvasH = 720) {
    // Go/WASM Engine integration with seamless JS fallback
    if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
      const wasmFound = window.EngineBridge.findRippleAt(xPct, yPct, canvasW, canvasH);
      if (wasmFound && wasmFound.id) {
        const local = this.getRipple(wasmFound.id) || wasmFound;
        if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
          const effL = window.LayerManager.getEffective('ripple', local.id);
          if (effL && !effL.visible) return null;
        }
        return local;
      }
      if (wasmFound === null) return null;
    }

    // JavaScript fallback
    for (let i = this.list.length - 1; i >= 0; i--) {
      const rp = this.list[i];
      if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
        const effL = window.LayerManager.getEffective('ripple', rp.id);
        if (effL && !effL.visible) continue;
      }
      const rx = (rp.x / 100) * canvasW;
      const ry = (rp.y / 100) * canvasH;
      const testX = (xPct / 100) * canvasW;
      const testY = (yPct / 100) * canvasH;
      const hitR = Math.max(30, rp.outerR || 100);
      const dx = testX - rx;
      const dy = testY - ry;
      if (dx * dx + dy * dy <= hitR * hitR) return rp;
    }
    return null;
  },

  findRippleAtPct(xPct, yPct, canvasW = 1280, canvasH = 720) {
    return this.findRippleAt(xPct, yPct, canvasW, canvasH);
  },

  getRippleBounds(id, canvasW = 1280, canvasH = 720) {
    if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
      const wasmBounds = window.EngineBridge.getRippleBounds(id, canvasW, canvasH);
      if (wasmBounds && wasmBounds.bounds) return wasmBounds;
    }

    const rp = this.getRipple(id);
    if (!rp) return null;
    const rx = (rp.x / 100) * canvasW;
    const ry = (rp.y / 100) * canvasH;
    const hitR = Math.max(30, rp.outerR || 100);
    return {
      ripple: rp,
      bounds: {
        minX: rx - hitR,
        minY: ry - hitR,
        maxX: rx + hitR,
        maxY: ry + hitR,
        width: hitR * 2,
        height: hitR * 2
      },
      center: { x: rx, y: ry }
    };
  },

  getRippleDefs(state) {
    if (!state || !state.image) return '';
    const width = state.image.width || 1280;
    const height = state.image.height || 720;
    let defs = '';
    const easeSpline = '0.1 0.8 0.3 1';
    const holdSpline = '0 0 1 1';

    this.list.forEach((rp) => {
      const px = (rp.x / 100) * width;
      const py = (rp.y / 100) * height;
      const totalDur = rp.dur + (rp.endDelay || 0);
      const maskId = 'rippleMask-' + rp.id;
      const blurId = 'rippleBlur-' + rp.id;
      const blurAmount = Math.max(2, rp.thick * 1.5);
      defs += '<filter id="' + blurId + '" filterUnits="userSpaceOnUse" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="' + blurAmount + '" /></filter>';

      let ringMasks = '';
      const rRatio = rp.endDelay > 0 ? (rp.dur / totalDur).toFixed(4) : '1';

      for (let i = 0; i < rp.rings; i++) {
        const stagger = (rp.dur / rp.rings) * i;
        const beginTime = rp.delay + stagger;
        let rAnim = '';
        let opAnimMask = '';

        if (rp.endDelay > 0) {
          rAnim = '<animate attributeName="r" values="' + rp.innerR + '; ' + rp.outerR + '; ' + rp.outerR + '" keyTimes="0; ' + rRatio + '; 1" calcMode="spline" keySplines="' + easeSpline + '; ' + holdSpline + '" dur="' + totalDur + 's" begin="' + beginTime + 's" repeatCount="indefinite" />';
          opAnimMask = '<animate attributeName="stroke-opacity" values="1; 0; 0" keyTimes="0; ' + rRatio + '; 1" calcMode="spline" keySplines="' + easeSpline + '; ' + holdSpline + '" dur="' + totalDur + 's" begin="' + beginTime + 's" repeatCount="indefinite" />';
        } else {
          rAnim = '<animate attributeName="r" values="' + rp.innerR + '; ' + rp.outerR + '" keyTimes="0; 1" calcMode="spline" keySplines="' + easeSpline + '" dur="' + rp.dur + 's" begin="' + beginTime + 's" repeatCount="indefinite" />';
          opAnimMask = '<animate attributeName="stroke-opacity" values="1; 0" keyTimes="0; 1" calcMode="spline" keySplines="' + easeSpline + '" dur="' + rp.dur + 's" begin="' + beginTime + 's" repeatCount="indefinite" />';
        }
        ringMasks += '<circle cx="' + px + '" cy="' + py + '" r="0" fill="none" stroke="white" stroke-width="' + (rp.thick * 3) + '" stroke-opacity="0" filter="url(#' + blurId + ')">' + rAnim + opAnimMask + '</circle>';
      }

      defs += '<mask id="' + maskId + '">' + ringMasks + '</mask>';
    });

    return defs;
  },

  renderRippleElement(rp, state) {
    if (!rp) return '';
    if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
      const effL = window.LayerManager.getEffective('ripple', rp.id);
      if (effL && !effL.visible) return '';
    }
    const width = state && state.image ? state.image.width : 1280;
    const height = state && state.image ? state.image.height : 720;
    const isBlank = state && state.image ? !!state.image.isBlankCanvas : true;

    const px = (rp.x / 100) * width;
    const py = (rp.y / 100) * height;
    const totalDur = rp.dur + (rp.endDelay || 0);
    const scaleRefract = 1.0 + (rp.refraction / 1000);
    const maskId = 'rippleMask-' + rp.id;
    const blurId = 'rippleBlur-' + rp.id;

    let ringHighlights = '';
    let ringShadows = '';
    const easeSpline = '0.1 0.8 0.3 1';
    const holdSpline = '0 0 1 1';
    const rRatio = rp.endDelay > 0 ? (rp.dur / totalDur).toFixed(4) : '1';

    for (let i = 0; i < rp.rings; i++) {
      const stagger = (rp.dur / rp.rings) * i;
      const beginTime = rp.delay + stagger;
      let rAnim = '';
      let opAnimCrest = '';

      if (rp.endDelay > 0) {
        rAnim = '<animate attributeName="r" values="' + rp.innerR + '; ' + rp.outerR + '; ' + rp.outerR + '" keyTimes="0; ' + rRatio + '; 1" calcMode="spline" keySplines="' + easeSpline + '; ' + holdSpline + '" dur="' + totalDur + 's" begin="' + beginTime + 's" repeatCount="indefinite" />';
        opAnimCrest = '<animate attributeName="stroke-opacity" values="' + rp.opacity + '; 0; 0" keyTimes="0; ' + rRatio + '; 1" calcMode="spline" keySplines="' + easeSpline + '; ' + holdSpline + '" dur="' + totalDur + 's" begin="' + beginTime + 's" repeatCount="indefinite" />';
      } else {
        rAnim = '<animate attributeName="r" values="' + rp.innerR + '; ' + rp.outerR + '" keyTimes="0; 1" calcMode="spline" keySplines="' + easeSpline + '" dur="' + rp.dur + 's" begin="' + beginTime + 's" repeatCount="indefinite" />';
        opAnimCrest = '<animate attributeName="stroke-opacity" values="' + rp.opacity + '; 0" keyTimes="0; 1" calcMode="spline" keySplines="' + easeSpline + '" dur="' + rp.dur + 's" begin="' + beginTime + 's" repeatCount="indefinite" />';
      }

      const shadowOp = (rp.opacity * 0.7).toFixed(2);
      const opAnimShadow = opAnimCrest.replace('values="' + rp.opacity, 'values="' + shadowOp);

      ringHighlights += '<circle cx="' + px + '" cy="' + py + '" r="0" fill="none" stroke="' + rp.color + '" stroke-width="' + (rp.thick * 0.8) + '" stroke-opacity="0" filter="url(#' + blurId + ')">' + rAnim + opAnimCrest + '</circle>';
      ringShadows += '<g transform="translate(' + px + ', ' + py + ') scale(0.92) translate(' + (-px) + ', ' + (-py) + ')"><circle cx="' + px + '" cy="' + py + '" r="0" fill="none" stroke="black" stroke-width="' + (rp.thick * 1.5) + '" stroke-opacity="0" filter="url(#' + blurId + ')">' + rAnim + opAnimShadow + '</circle></g>';
    }

    const refractedPhoto = !isBlank && window.Effects
      ? '<g mask="url(#' + maskId + ')" pointer-events="none"><g transform="translate(' + px + ', ' + py + ') scale(' + scaleRefract + ') translate(' + (-px) + ', ' + (-py) + ')">' + window.Effects.buildPhotoElement(state.image, width, height) + '</g></g>'
      : '';
    const maxR = Math.max(30, rp.outerR || 100);
    const hitTargetEl = '<circle class="ripple-hit-target" cx="' + px.toFixed(2) + '" cy="' + py.toFixed(2) + '" r="' + maxR.toFixed(2) + '" fill="transparent" pointer-events="all" style="cursor: pointer;" />';
    return '<g class="diagram-ripple-instance" data-ripple-id="' + rp.id + '">' +
      hitTargetEl +
      refractedPhoto + '<g pointer-events="none">' + ringShadows + '</g><g pointer-events="none">' + ringHighlights + '</g>' +
      '</g>';
  },

  injectIntoSVG(svgString, state) {
    if (this.list.length === 0) return svgString;
    const defs = this.getRippleDefs(state);
    let elements = '';

    let orderedList = this.list;
    if (window.LayerManager && typeof window.LayerManager.getLayers === 'function') {
      const layers = window.LayerManager.getLayers();
      if (Array.isArray(layers) && layers.length > 0) {
        const orderMap = new Map();
        layers.filter((l) => l.type === 'ripple').forEach((l, idx) => orderMap.set(String(l.id), idx));
        orderedList = [...this.list].sort((a, b) => {
          const idxA = orderMap.has(String(a.id)) ? orderMap.get(String(a.id)) : -1;
          const idxB = orderMap.has(String(b.id)) ? orderMap.get(String(b.id)) : -1;
          return idxA - idxB;
        });
      }
    }

    orderedList.forEach((rp) => {
      elements += this.renderRippleElement(rp, state);
    });

    return svgString.replace('<!-- INJECT_CAMERA_RIG_ELEMENTS -->', '\n<defs>\n' + defs + '\n</defs>\n<g id="ripples-layer">\n' + elements + '\n</g>\n<!-- INJECT_CAMERA_RIG_ELEMENTS -->');
  },

  // =========================================================================
  // Layer 1: UI Presentation & DOM Bindings
  // =========================================================================

  init() {
    if (this._initialized) return;
    this._initialized = true;

    const btnAdd = document.getElementById('btnAddRipple');
    if (btnAdd) btnAdd.addEventListener('click', () => this.addRipple());

    const btnDeselect = document.getElementById('btnDeselectRipple');
    if (btnDeselect) {
      btnDeselect.addEventListener('click', () => {
        if (window.AppCoordinator && typeof window.AppCoordinator.clearSelection === 'function') {
          window.AppCoordinator.clearSelection({ reason: 'sidebar_deselect_ripple' });
        } else {
          this.deselectRipple();
        }
      });
    }

    const btnGroup = document.getElementById('btnGroupRippleSelection');
    if (btnGroup) {
      btnGroup.addEventListener('click', () => {
        if (window.AppCoordinator) {
          const sel = window.AppCoordinator.getActiveSelection();
          if (sel && sel.type === 'group' && typeof window.AppCoordinator.ungroupSelectedGroup === 'function') {
            window.AppCoordinator.ungroupSelectedGroup();
          } else if (typeof window.AppCoordinator.createGroupFromSelection === 'function') {
            window.AppCoordinator.createGroupFromSelection();
          }
        }
      });
    }

    const btnDup = document.getElementById('btnDuplicateRippleSelection');
    if (btnDup) {
      btnDup.addEventListener('click', () => {
        if (window.AppCoordinator && typeof window.AppCoordinator.duplicateSelection === 'function') {
          window.AppCoordinator.duplicateSelection();
        }
      });
    }

    const btnDeselectAll = document.getElementById('btnDeselectAllRipples');
    if (btnDeselectAll) {
      btnDeselectAll.addEventListener('click', () => {
        if (window.AppCoordinator && typeof window.AppCoordinator.clearSelection === 'function') {
          window.AppCoordinator.clearSelection({ reason: 'ripple_multi_toolbar_deselect' });
        } else {
          this.deselectRipple();
        }
      });
    }

    const nameIn = document.getElementById('rippleNameInput');
    if (nameIn) {
      nameIn.addEventListener('input', (e) => {
        this.updateActive('name', e.target.value);
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
        else if (window.HistoryManager) window.HistoryManager.recordDebounced();
      });
    }

    const colPick = document.getElementById('rippleColorPicker');
    if (colPick) {
      colPick.addEventListener('input', (e) => this.updateActive('color', e.target.value));
      colPick.addEventListener('change', (e) => {
        this.updateActive('color', e.target.value);
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
        else if (window.HistoryManager) window.HistoryManager.recordImmediate();
      });
    }

    ['outerR', 'innerR', 'rings', 'thick', 'refraction', 'opacity', 'dur', 'delay', 'endDelay'].forEach((key) => {
      const cap = key.charAt(0).toUpperCase() + key.slice(1);
      const slider = document.getElementById('ripple' + cap + 'Slider');
      const num = document.getElementById('ripple' + cap + 'Num');
      if (slider && num) {
        slider.addEventListener('input', (e) => {
          num.value = e.target.value;
          this.updateActive(key, parseFloat(e.target.value));
          if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
          else if (window.HistoryManager) window.HistoryManager.recordDebounced();
        });
        num.addEventListener('input', (e) => {
          slider.value = e.target.value;
          this.updateActive(key, parseFloat(e.target.value));
          if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
          else if (window.HistoryManager) window.HistoryManager.recordDebounced();
        });
      }
    });
  },

  addRipple(initialProps = {}) {
    const newRipple = this.createRipple(initialProps);
    this.selectRipple(newRipple.id);
    this.triggerAppRender();
    if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
    else if (window.HistoryManager) window.HistoryManager.recordImmediate();
    return newRipple;
  },

  syncEditorUI(rp) {
    if (!rp) return;
    const ed = document.getElementById('rippleEditor');
    if (ed) ed.style.display = 'block';
    const empty = document.getElementById('emptyRippleSelection');
    if (empty) empty.style.display = 'none';
    const lbl = document.getElementById('editingRippleLabel');
    if (lbl) lbl.innerText = 'Editing Ripple ' + rp.id + (rp.name ? ' (' + rp.name + ')' : '');
    const nameIn = document.getElementById('rippleNameInput');
    if (nameIn) nameIn.value = rp.name || '';

    const colPick = document.getElementById('rippleColorPicker');
    if (colPick) colPick.value = rp.color;

    ['outerR', 'innerR', 'rings', 'thick', 'refraction', 'opacity', 'dur', 'delay', 'endDelay'].forEach((key) => {
      const val = rp[key] !== undefined ? rp[key] : 0;
      const cap = key.charAt(0).toUpperCase() + key.slice(1);
      const sl = document.getElementById('ripple' + cap + 'Slider');
      const nu = document.getElementById('ripple' + cap + 'Num');
      if (sl) sl.value = val;
      if (nu) nu.value = val;
    });
  },

  selectRipple(id, options = {}) {
    if (window.AppCoordinator && !options.skipCoordinator) {
      window.AppCoordinator.selectObject('ripple', id, { skipStageClear: true, skipModuleSelect: true, ...options });
    } else if (!options.multi) {
      if (window.DataFlows) window.DataFlows.deselectFlow();
      if (window.Glows) window.Glows.deselectGlow();
      if (window.DiagramNodes) window.DiagramNodes.deselectNode();
    }

    this.activeId = id;
    this.renderList();
    document.body.classList.add('editing-flow');

    const rp = this.getRipple(id);
    if (rp) {
      this.syncEditorUI(rp);
      this.updateUIOverlay(rp);
      const ret = document.getElementById('rippleReticleTarget');
      if (ret) ret.style.display = 'flex';
    }
  },

  deselectRipple() {
    this.activeId = null;
    this.renderList();
    document.body.classList.remove('editing-flow');
    const editor = document.getElementById('rippleEditor');
    if (editor) editor.style.display = 'none';
    const empty = document.getElementById('emptyRippleSelection');
    if (empty) empty.style.display = 'block';
    const ret = document.getElementById('rippleReticleTarget');
    if (ret) ret.style.display = 'none';
    if (window.AppCoordinator && window.AppCoordinator.activeSelection && window.AppCoordinator.activeSelection.type === 'ripple' && !window.AppCoordinator._isCoordinatingSelection) {
      window.AppCoordinator.clearSelection();
    }
  },

  updateActive(key, value) {
    if (this.activeId === null) return;
    const rp = this.updateRipple(this.activeId, { [key]: value });
    if (rp) {
      const lbl = document.getElementById('editingRippleLabel');
      if (lbl) lbl.innerText = 'Editing Ripple ' + rp.id + (rp.name ? ' (' + rp.name + ')' : '');
      this.renderList();
      this.triggerAppRender();
      if (key === 'color') this.updateUIOverlay(rp);
    }
  },

  handleStageClick(x, y) {
    if (this.activeId === null) return false;
    const rp = this.updateRipple(this.activeId, { x, y });
    if (rp) {
      this.updateUIOverlay(rp);
      this.triggerAppRender();
      return true;
    }
    return false;
  },

  updateUIOverlay(rp) {
    const ret = document.getElementById('rippleReticleTarget');
    if (ret && rp) {
      ret.style.left = rp.x + '%';
      ret.style.top = rp.y + '%';
      ret.style.borderColor = rp.color;
      ret.style.backgroundColor = rp.color + '33';
    }
  },

  removeRipple(id) {
    const wasActive = this.activeId === id;
    this.deleteRipple(id);
    if (wasActive) this.deselectRipple();
    else this.renderList();
    this.triggerAppRender();
    if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
    else if (window.HistoryManager) window.HistoryManager.recordImmediate();
  },

  renderList() {
    const container = document.getElementById('rippleListContainer');
    if (!container) return;
    const emptyEl = document.getElementById('emptyRippleSelection');
    if (this.list.length === 0) {
      container.innerHTML = '<div class="stage-hint" id="emptyRippleHint">No ripples active.</div>';
      if (emptyEl) emptyEl.innerHTML = 'No liquid ripples created. Click <strong>+ Add</strong> above to add one.';
      return;
    }
    if (emptyEl && !this.activeId) {
      emptyEl.innerHTML = 'Select a liquid ripple to edit refraction and wave parameters, or click <strong>+ Add</strong> above.';
    }
    container.innerHTML = '';
    this.list.forEach((rp) => {
      const isSel = (window.AppCoordinator && typeof window.AppCoordinator.isObjectSelected === 'function')
        ? window.AppCoordinator.isObjectSelected('ripple', rp.id)
        : (this.activeId === rp.id);
      const isPrimary = (this.activeId === rp.id);
      const div = document.createElement('div');
      div.className = 'flow-list-item compact-instance-row' + (isSel ? ' selected' : '') + (isPrimary ? ' primary-selected' : '');
      div.style.borderLeftColor = '#58a6ff';
      const labelText = rp.name || ('Ripple ' + rp.id);
      const safeLabel = this.escapeXML(labelText);
      div.title = safeLabel + ' (' + (rp.rings || 3) + ' rings)';

      div.innerHTML =
        '<span class="instance-icon" style="color:#58a6ff;" title="Ripple">💧</span>' +
        '<span class="instance-label">' + safeLabel + '</span>' +
        '<span class="compact-meta">' + (rp.rings || 3) + ' rings</span>' +
        '<button type="button" class="btn-row-action btn-row-delete" title="Delete ripple" onclick="window.Ripples.removeRipple(' + rp.id + '); event.stopPropagation();">&times;</button>';

      div.onclick = (e) => {
        if (e && (e.shiftKey || e.ctrlKey || e.metaKey)) {
          if (window.AppCoordinator && typeof window.AppCoordinator.toggleObjectSelection === 'function') {
            window.AppCoordinator.toggleObjectSelection('ripple', rp.id);
            return;
          }
        }
        if (this.activeId === rp.id && (!window.AppCoordinator || window.AppCoordinator.getSelectedItems().length <= 1)) {
          if (window.AppCoordinator && typeof window.AppCoordinator.clearSelection === 'function') {
            window.AppCoordinator.clearSelection({ reason: 'sidebar_toggle_ripple' });
          } else {
            this.deselectRipple();
          }
        } else {
          this.selectRipple(rp.id);
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
