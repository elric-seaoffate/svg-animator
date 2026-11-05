/**
 * Diagram Nodes & Shapes Module (`window.DiagramNodes`)
 *
 * Layer 3 (Operational API):
 *   - `createNode(initialProps)`, `updateNode(id, patch)`, `deleteNode(id)`,
 *     `getNode(id)`, `getAllNodes()`, `findNodeAtPct(xPct, yPct, canvasW, canvasH)`,
 *     `getNodeEffectiveProps(node)`, `getState()`, `setState(data)`,
 *     `injectIntoSVG(svgString, state)`, `escapeXML(str)`
 *   - Zero direct DOM dependencies.
 *
 * Layer 1 (UI Presentation & Compatibility):
 *   - `init()`, `addNode()`, `removeNode(id)`, `selectNode(id, openAccordion)`,
 *     `deselectNode()`, `updateActive(key, value)`, `handleStageClick(x, y)`,
 *     `syncEditorUI(node)`, `updateUIOverlay(node)`, `updateActiveDimBadge(node)`,
 *     `renderList()`, `refreshAfterChange()`, `triggerAppRender()`
 */
window.DiagramNodes = {
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
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  },

  getNodeEffectiveProps(n) {
    return {
      width: n.width || 170,
      height: n.height || 80,
      fillColor: n.fillColor || '#161b22',
      strokeColor: n.strokeColor || '#58a6ff',
      textColor: n.textColor || '#e6edf3',
      fillOpacity: n.fillOpacity !== undefined ? n.fillOpacity : 0.92,
      strokeWidth: n.strokeWidth !== undefined ? n.strokeWidth : 2,
      strokeStyle: n.strokeStyle || 'solid',
      fontSize: n.fontSize || 15
    };
  },

  getNode(id) {
    return this.list.find((n) => n.id === id) || null;
  },

  getAllNodes() {
    return this.list;
  },

  getState() {
    return {
      nodes: JSON.parse(JSON.stringify(this.list)),
      nodesCounter: this.counter,
      activeId: this.activeId
    };
  },

  setState(data) {
    if (!data || typeof data !== 'object') return this.getState();
    const rawList = Array.isArray(data.nodes) ? data.nodes : (Array.isArray(data.list) ? data.list : []);
    this.list = JSON.parse(JSON.stringify(rawList));
    const maxId = this.list.reduce((m, n) => Math.max(m, n.id || 0), 0);
    const savedCounter = data.nodesCounter !== undefined ? data.nodesCounter : data.counter;
    this.counter = savedCounter !== undefined ? Math.max(savedCounter, maxId) : maxId;
    this.activeId = null;
    return this.getState();
  },

  createNode(initialProps = {}) {
    this.counter++;
    const offset = ((this.counter - 1) % 6) * 6;
    const newNode = {
      id: this.counter,
      shape: initialProps.shape || 'rounded',
      text: initialProps.text !== undefined ? initialProps.text : ('Node ' + this.counter),
      subtext: initialProps.subtext !== undefined ? initialProps.subtext : '',
      x: initialProps.x !== undefined ? initialProps.x : (32 + offset),
      y: initialProps.y !== undefined ? initialProps.y : (32 + offset),
      width: initialProps.width || 170,
      height: initialProps.height || 80,
      fillColor: initialProps.fillColor || '#161b22',
      fillOpacity: initialProps.fillOpacity !== undefined ? initialProps.fillOpacity : 0.92,
      strokeColor: initialProps.strokeColor || '#58a6ff',
      strokeWidth: initialProps.strokeWidth !== undefined ? initialProps.strokeWidth : 2,
      strokeStyle: initialProps.strokeStyle || 'solid',
      textColor: initialProps.textColor || '#e6edf3',
      fontSize: initialProps.fontSize || 15,
      anim: initialProps.anim || 'none'
    };

    const shouldApplyPreset = initialProps.applyPreset !== undefined
      ? !!initialProps.applyPreset
      : (window.NodePresets ? window.NodePresets.autoApplyToNewNodes !== false : true);

    if (shouldApplyPreset && window.NodePresets) {
      window.NodePresets.applyToNodeObject(newNode);
    }

    if (initialProps.snap !== false) {
      if (window.AppCoordinator && typeof window.AppCoordinator.snapPosition === 'function') {
        const snapped = window.AppCoordinator.snapPosition(newNode.x, newNode.y);
        newNode.x = snapped.x;
        newNode.y = snapped.y;
      } else if (window.Stage && typeof window.Stage.snapPctToGrid === 'function') {
        const snapped = window.Stage.snapPctToGrid(newNode.x, newNode.y);
        newNode.x = snapped.x;
        newNode.y = snapped.y;
      }
    }

    this.list.push(newNode);
    return newNode;
  },

  updateNode(id, patch) {
    const node = this.getNode(id);
    if (!node || !patch || typeof patch !== 'object') return null;
    Object.keys(patch).forEach((key) => {
      if (key !== 'id') {
        node[key] = patch[key];
      }
    });
    return node;
  },

  deleteNode(id) {
    const before = this.list.length;
    this.list = this.list.filter((n) => n.id !== id);
    if (this.activeId === id) {
      this.activeId = null;
    }
    return this.list.length < before;
  },

  findNodeAtPct(xPct, yPct, canvasW, canvasH) {
    const dims = (canvasW && canvasH)
      ? { width: canvasW, height: canvasH }
      : (window.AppCoordinator ? window.AppCoordinator.getCanvasDimensions() : { width: (window.Stage && window.Stage.canvasWidth) || 1280, height: (window.Stage && window.Stage.canvasHeight) || 720 });

    const px = (xPct / 100) * dims.width;
    const py = (yPct / 100) * dims.height;

    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      const eff = this.getNodeEffectiveProps(n);
      const cx = (n.x / 100) * dims.width;
      const cy = (n.y / 100) * dims.height;
      const hw = (eff.width / 2) + 8;
      const hh = (eff.height / 2) + 8;
      if (px >= cx - hw && px <= cx + hw && py >= cy - hh && py <= cy + hh) {
        return n;
      }
    }
    return null;
  },

  injectIntoSVG(svgString, state) {
    if (this.list.length === 0) return svgString;
    const canvasW = state.image.width || 1280;
    const canvasH = state.image.height || 720;

    const defs =
      '<filter id="nodeDropShadow" filterUnits="userSpaceOnUse" x="-10%" y="-10%" width="120%" height="120%">' +
      '<feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.45" />' +
      '</filter>';
    let elements = '';

    this.list.forEach((n) => {
      const eff = this.getNodeEffectiveProps(n);
      const cx = (n.x / 100) * canvasW;
      const cy = (n.y / 100) * canvasH;
      const w = eff.width;
      const h = eff.height;
      const hw = w / 2;
      const hh = h / 2;

      let dashAttr = '';
      if (eff.strokeStyle === 'dashed') {
        dashAttr = 'stroke-dasharray="8,5"';
      } else if (eff.strokeStyle === 'dotted') {
        dashAttr = 'stroke-dasharray="2,5" stroke-linecap="round"';
      }

      const commonStyle =
        'fill="' + eff.fillColor + '" fill-opacity="' + eff.fillOpacity + '" stroke="' + eff.strokeColor + '" stroke-width="' + eff.strokeWidth + '" ' + dashAttr;
      let shapeSVG = '';

      if (n.shape === 'textbox') {
        shapeSVG = '<rect x="' + (-hw) + '" y="' + (-hh) + '" width="' + w + '" height="' + h + '" fill="transparent" stroke="none" />';
      } else if (n.shape === 'rect') {
        shapeSVG = '<rect x="' + (-hw) + '" y="' + (-hh) + '" width="' + w + '" height="' + h + '" rx="2" ' + commonStyle + ' filter="url(#nodeDropShadow)" />';
      } else if (n.shape === 'rounded') {
        shapeSVG = '<rect x="' + (-hw) + '" y="' + (-hh) + '" width="' + w + '" height="' + h + '" rx="12" ' + commonStyle + ' filter="url(#nodeDropShadow)" />';
      } else if (n.shape === 'pill') {
        const r = Math.min(hw, hh);
        shapeSVG = '<rect x="' + (-hw) + '" y="' + (-hh) + '" width="' + w + '" height="' + h + '" rx="' + r + '" ' + commonStyle + ' filter="url(#nodeDropShadow)" />';
      } else if (n.shape === 'circle') {
        const r = Math.min(hw, hh);
        shapeSVG = '<circle cx="0" cy="0" r="' + r + '" ' + commonStyle + ' filter="url(#nodeDropShadow)" />';
      } else if (n.shape === 'diamond') {
        shapeSVG = '<polygon points="0,' + (-hh) + ' ' + hw + ',0 0,' + hh + ' ' + (-hw) + ',0" stroke-linejoin="round" ' + commonStyle + ' filter="url(#nodeDropShadow)" />';
      } else if (n.shape === 'hexagon') {
        const inset = w * 0.22;
        shapeSVG =
          '<polygon points="' + (-hw + inset) + ',' + (-hh) + ' ' + (hw - inset) + ',' + (-hh) + ' ' + hw + ',0 ' +
          (hw - inset) + ',' + hh + ' ' + (-hw + inset) + ',' + hh + ' ' + (-hw) + ',0" stroke-linejoin="round" ' + commonStyle + ' filter="url(#nodeDropShadow)" />';
      } else if (n.shape === 'parallelogram') {
        const skew = w * 0.16;
        shapeSVG =
          '<polygon points="' + (-hw + skew) + ',' + (-hh) + ' ' + hw + ',' + (-hh) + ' ' + (hw - skew) + ',' + hh + ' ' + (-hw) + ',' + hh + '" stroke-linejoin="round" ' + commonStyle + ' filter="url(#nodeDropShadow)" />';
      } else if (n.shape === 'cylinder') {
        const ry = Math.max(8, Math.min(22, h * 0.18));
        const bodyTop = -hh + ry;
        const bodyBot = hh - ry;
        shapeSVG =
          '<g filter="url(#nodeDropShadow)">' +
          '<path d="M ' + (-hw) + ',' + bodyTop + ' L ' + (-hw) + ',' + bodyBot + ' A ' + hw + ',' + ry + ' 0 0,0 ' + hw + ',' + bodyBot + ' L ' + hw + ',' + bodyTop + ' Z" ' + commonStyle + ' />' +
          '<ellipse cx="0" cy="' + bodyTop + '" rx="' + hw + '" ry="' + ry + '" ' + commonStyle + ' />' +
          '</g>';
      } else if (n.shape === 'cloud') {
        shapeSVG =
          '<path d="M ' + (-hw * 0.55) + ',' + (hh * 0.65) +
          ' C ' + (-hw * 0.95) + ',' + (hh * 0.65) + ' ' + (-hw) + ',' + (hh * 0.05) + ' ' + (-hw * 0.72) + ',' + (-hh * 0.2) +
          ' C ' + (-hw * 0.75) + ',' + (-hh * 0.75) + ' ' + (-hw * 0.15) + ',' + (-hh * 0.95) + ' ' + (hw * 0.08) + ',' + (-hh * 0.6) +
          ' C ' + (hw * 0.45) + ',' + (-hh * 0.9) + ' ' + (hw * 0.92) + ',' + (-hh * 0.5) + ' ' + (hw * 0.8) + ',' + (-hh * 0.05) +
          ' C ' + (hw * 1.05) + ',' + (hh * 0.25) + ' ' + (hw * 0.85) + ',' + (hh * 0.65) + ' ' + (hw * 0.5) + ',' + (hh * 0.65) + ' Z"' +
          ' stroke-linejoin="round" ' + commonStyle + ' filter="url(#nodeDropShadow)" />';
      } else if (n.shape === 'callout') {
        const fold = 16;
        shapeSVG =
          '<g filter="url(#nodeDropShadow)">' +
          '<polygon points="' + (-hw) + ',' + (-hh) + ' ' + (hw - fold) + ',' + (-hh) + ' ' + hw + ',' + (-hh + fold) + ' ' + hw + ',' + hh + ' ' + (-hw) + ',' + hh + '" stroke-linejoin="round" ' + commonStyle + ' />' +
          '<polyline points="' + (hw - fold) + ',' + (-hh) + ' ' + (hw - fold) + ',' + (-hh + fold) + ' ' + hw + ',' + (-hh + fold) + '" fill="none" stroke="' + eff.strokeColor + '" stroke-width="' + eff.strokeWidth + '" />' +
          '</g>';
      } else if (n.shape === 'axes') {
        let gridLines = '';
        const steps = 4;
        for (let i = 1; i <= steps; i++) {
          const gx = -hw + (w / steps) * i;
          const gy = hh - (h / steps) * i;
          gridLines += '<line x1="' + gx + '" y1="' + (-hh) + '" x2="' + gx + '" y2="' + hh + '" stroke="' + eff.strokeColor + '" stroke-opacity="0.2" stroke-width="1" stroke-dasharray="4,4" />';
          gridLines += '<line x1="' + (-hw) + '" y1="' + gy + '" x2="' + hw + '" y2="' + gy + '" stroke="' + eff.strokeColor + '" stroke-opacity="0.2" stroke-width="1" stroke-dasharray="4,4" />';
        }
        shapeSVG =
          '<rect x="' + (-hw) + '" y="' + (-hh) + '" width="' + w + '" height="' + h + '" fill="' + eff.fillColor + '" fill-opacity="' + eff.fillOpacity + '" stroke="none" />' +
          gridLines +
          '<polyline points="' + (-hw) + ',' + (-hh) + ' ' + (-hw) + ',' + hh + ' ' + hw + ',' + hh + '" fill="none" stroke="' + eff.strokeColor + '" stroke-width="' + Math.max(2, eff.strokeWidth) + '" stroke-linecap="round" stroke-linejoin="round" />';
      }

      const lines = (n.text || '').split('|').map((s) => s.trim()).filter(Boolean);
      const hasSub = n.subtext && n.subtext.trim() !== '';
      const fSize = eff.fontSize;
      const subSize = Math.max(10, Math.round(fSize * 0.78));
      const lineHeight = fSize * 1.25;

      const totalTextHeight = lines.length * lineHeight + (hasSub ? subSize * 1.4 : 0);
      const startY = -(totalTextHeight / 2) + (fSize * 0.82);

      let textSVG = '';
      if (n.shape === 'axes') {
        if (lines.length > 0) {
          textSVG += '<text x="' + (-hw) + '" y="' + (-hh - 10) + '" fill="' + eff.textColor + '" font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" font-size="' + fSize + '" font-weight="600" text-anchor="start">' + this.escapeXML(lines.join(' ')) + '</text>';
        }
        if (hasSub) {
          textSVG += '<text x="' + hw + '" y="' + (hh + subSize + 8) + '" fill="' + eff.textColor + '" fill-opacity="0.75" font-family="monospace" font-size="' + subSize + '" text-anchor="end">' + this.escapeXML(n.subtext) + '</text>';
        }
      } else {
        lines.forEach((line, idx) => {
          const ly = startY + idx * lineHeight;
          textSVG += '<text x="0" y="' + ly.toFixed(1) + '" fill="' + eff.textColor + '" font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" font-size="' + fSize + '" font-weight="600" text-anchor="middle">' + this.escapeXML(line) + '</text>';
        });

        if (hasSub) {
          const subY = startY + lines.length * lineHeight + (subSize * 0.2);
          textSVG += '<text x="0" y="' + subY.toFixed(1) + '" fill="' + eff.textColor + '" fill-opacity="0.75" font-family="monospace" font-size="' + subSize + '" text-anchor="middle">' + this.escapeXML(n.subtext) + '</text>';
        }
      }

      let animTags = '';
      if (n.anim === 'pulse-border') {
        animTags = '<animate attributeName="opacity" values="1; 0.65; 1" dur="2.6s" repeatCount="indefinite" calcMode="spline" keySplines="0.42 0 0.58 1; 0.42 0 0.58 1" />';
      } else if (n.anim === 'float') {
        animTags = '<animateTransform attributeName="transform" type="translate" additive="sum" values="0,0; 0,-6; 0,0" dur="3.2s" repeatCount="indefinite" calcMode="spline" keySplines="0.42 0 0.58 1; 0.42 0 0.58 1" />';
      } else if (n.anim === 'fade-in') {
        animTags = '<animate attributeName="opacity" from="0" to="1" dur="1.2s" fill="freeze" />';
      }

      elements += '<g data-node-id="' + n.id + '" transform="translate(' + cx.toFixed(2) + ', ' + cy.toFixed(2) + ')" style="cursor: move;">' + animTags + shapeSVG + textSVG + '</g>';
    });

    return svgString.replace('<!-- INJECT_CAMERA_RIG_ELEMENTS -->', '\n<defs>\n' + defs + '\n</defs>\n<g id="nodes-layer">\n' + elements + '\n</g>\n<!-- INJECT_CAMERA_RIG_ELEMENTS -->');
  },

  // =========================================================================
  // Layer 1: UI Presentation & DOM Bindings
  // =========================================================================

  init() {
    if (this._initialized) return;
    this._initialized = true;

    if (window.NodePresets) window.NodePresets.init();

    const btnAdd = document.getElementById('btnAddNode');
    if (btnAdd) btnAdd.addEventListener('click', () => this.addNode());

    ['shape', 'strokeStyle', 'anim'].forEach((key) => {
      const cap = key.charAt(0).toUpperCase() + key.slice(1);
      const el = document.getElementById('node' + cap + 'Select');
      if (el) {
        el.addEventListener('change', (e) => {
          this.updateActive(key, e.target.value);
          if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
          else if (window.HistoryManager) window.HistoryManager.recordImmediate();
        });
      }
    });

    ['fillColor', 'strokeColor', 'textColor'].forEach((key) => {
      const cap = key.charAt(0).toUpperCase() + key.slice(1);
      const el = document.getElementById('node' + cap + 'Picker');
      if (el) {
        el.addEventListener('input', (e) => this.updateActive(key, e.target.value));
        el.addEventListener('change', (e) => {
          this.updateActive(key, e.target.value);
          if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
          else if (window.HistoryManager) window.HistoryManager.recordImmediate();
        });
      }
    });

    ['text', 'subtext'].forEach((key) => {
      const cap = key.charAt(0).toUpperCase() + key.slice(1);
      const el = document.getElementById('node' + cap + 'Input');
      if (el) {
        el.addEventListener('input', (e) => {
          this.updateActive(key, e.target.value);
          if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
          else if (window.HistoryManager) window.HistoryManager.recordDebounced();
        });
      }
    });

    ['width', 'height', 'fillOpacity', 'strokeWidth', 'fontSize'].forEach((key) => {
      const cap = key.charAt(0).toUpperCase() + key.slice(1);
      const slider = document.getElementById('node' + cap + 'Slider');
      const num = document.getElementById('node' + cap + 'Num');
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

  applyPresetToActive() {
    if (window.NodePresets) window.NodePresets.applyToActiveNode();
  },

  updateActiveDimBadge(node) {
    const badge = document.getElementById('activeNodeDimBadge');
    if (!badge || !node) return;
    badge.innerHTML = 'W: ' + Math.round(node.width || 170) + ' &times; H: ' + Math.round(node.height || 80) + ' px';
  },

  refreshAfterChange() {
    const activeNode = this.getNode(this.activeId);
    if (activeNode) {
      this.updateActiveDimBadge(activeNode);
    }
    this.renderList();
    this.triggerAppRender();
    if (activeNode) {
      this.updateUIOverlay(activeNode);
    }
  },

  addNode(initialProps = {}) {
    const props = (initialProps && typeof initialProps === 'object') ? Object.assign({}, initialProps) : {};
    if (props.applyPreset === undefined) {
      props.applyPreset = window.NodePresets ? window.NodePresets.autoApplyToNewNodes !== false : true;
    }
    const newNode = this.createNode(props);
    this.selectNode(newNode.id, true);
    this.triggerAppRender();
    if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
    else if (window.HistoryManager) window.HistoryManager.recordImmediate();
    return newNode;
  },

  syncEditorUI(node) {
    if (!node) return;
    const editor = document.getElementById('nodeEditor');
    if (editor) editor.style.display = 'block';

    const lbl = document.getElementById('editingNodeLabel');
    if (lbl) lbl.innerText = 'Editing Shape ' + node.id;

    this.updateActiveDimBadge(node);

    const shSel = document.getElementById('nodeShapeSelect');
    if (shSel) shSel.value = node.shape || 'rounded';
    const txtIn = document.getElementById('nodeTextInput');
    if (txtIn) txtIn.value = node.text || '';
    const subIn = document.getElementById('nodeSubtextInput');
    if (subIn) subIn.value = node.subtext || '';
    const fPick = document.getElementById('nodeFillColorPicker');
    if (fPick) fPick.value = node.fillColor || '#161b22';
    const sPick = document.getElementById('nodeStrokeColorPicker');
    if (sPick) sPick.value = node.strokeColor || '#58a6ff';
    const tPick = document.getElementById('nodeTextColorPicker');
    if (tPick) tPick.value = node.textColor || '#e6edf3';
    const stSel = document.getElementById('nodeStrokeStyleSelect');
    if (stSel) stSel.value = node.strokeStyle || 'solid';
    const anSel = document.getElementById('nodeAnimSelect');
    if (anSel) anSel.value = node.anim || 'none';

    ['width', 'height', 'fillOpacity', 'strokeWidth', 'fontSize'].forEach((key) => {
      const cap = key.charAt(0).toUpperCase() + key.slice(1);
      const sl = document.getElementById('node' + cap + 'Slider');
      const nu = document.getElementById('node' + cap + 'Num');
      if (sl) sl.value = node[key];
      if (nu) nu.value = node[key];
    });
  },

  selectNode(id, openAccordion = false) {
    if (window.AppCoordinator) {
      window.AppCoordinator.selectObject('node', id, { skipStageClear: true });
    } else {
      if (window.DataFlows) window.DataFlows.deselectFlow();
      if (window.Glows) window.Glows.deselectGlow();
      if (window.Ripples) window.Ripples.deselectRipple();
    }

    this.activeId = id;
    this.renderList();
    document.body.classList.add('editing-flow');

    const node = this.getNode(id);
    if (!node) return;

    if (openAccordion && window.openAccordionById) {
      const presetsEl = document.getElementById('acc-presets');
      const presetsOpen = presetsEl ? presetsEl.classList.contains('open') : false;
      if (!presetsOpen) {
        window.openAccordionById('acc-nodes');
      }
    }

    this.syncEditorUI(node);
    this.updateUIOverlay(node);
  },

  deselectNode() {
    this.activeId = null;
    this.renderList();
    document.body.classList.remove('editing-flow');
    const ed = document.getElementById('nodeEditor');
    if (ed) ed.style.display = 'none';
    const selBox = document.getElementById('nodeSelectionBox');
    if (selBox) selBox.style.display = 'none';
  },

  updateActive(key, value) {
    if (this.activeId === null) return;
    const node = this.updateNode(this.activeId, { [key]: value });
    if (node) {
      this.refreshAfterChange();
    }
  },

  handleStageClick(x, y) {
    if (this.activeId === null) return false;
    const node = this.updateNode(this.activeId, { x, y });
    if (node) {
      this.updateUIOverlay(node);

      const dims = window.AppCoordinator
        ? window.AppCoordinator.getCanvasDimensions()
        : { width: (window.Stage && window.Stage.canvasWidth) || 1280, height: (window.Stage && window.Stage.canvasHeight) || 720 };
      const cx = (node.x / 100) * dims.width;
      const cy = (node.y / 100) * dims.height;
      const liveGroup = document.querySelector('#svgContainer [data-node-id="' + node.id + '"]');
      if (liveGroup) {
        liveGroup.setAttribute('transform', 'translate(' + cx.toFixed(2) + ', ' + cy.toFixed(2) + ')');
      } else {
        this.triggerAppRender();
      }
      return true;
    }
    return false;
  },

  updateUIOverlay(node) {
    const selBox = document.getElementById('nodeSelectionBox');
    if (!selBox || !node) return;

    const eff = this.getNodeEffectiveProps(node);
    const dims = window.AppCoordinator
      ? window.AppCoordinator.getCanvasDimensions()
      : { width: (window.Stage && window.Stage.canvasWidth) || 1280, height: (window.Stage && window.Stage.canvasHeight) || 720 };
    const cx = (node.x / 100) * dims.width;
    const cy = (node.y / 100) * dims.height;
    const pad = 10;
    const w = eff.width + pad * 2;
    const h = eff.height + pad * 2;

    selBox.setAttribute('x', (cx - w / 2).toFixed(1));
    selBox.setAttribute('y', (cy - h / 2).toFixed(1));
    selBox.setAttribute('width', w.toFixed(1));
    selBox.setAttribute('height', h.toFixed(1));
    selBox.setAttribute('stroke', eff.strokeColor || '#a371f7');
    selBox.style.display = 'block';
  },

  removeNode(id) {
    const wasActive = this.activeId === id;
    this.deleteNode(id);
    if (wasActive) this.deselectNode();
    else this.renderList();
    this.triggerAppRender();
    if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
    else if (window.HistoryManager) window.HistoryManager.recordImmediate();
  },

  renderList() {
    const container = document.getElementById('nodeListContainer');
    if (!container) return;
    if (this.list.length === 0) {
      container.innerHTML = '<div class="stage-hint">No shapes or text boxes active.</div>';
      return;
    }
    container.innerHTML = '';
    this.list.forEach((node) => {
      const eff = this.getNodeEffectiveProps(node);
      const div = document.createElement('div');
      div.className = 'flow-list-item' + (this.activeId === node.id ? ' selected' : '');
      div.style.borderLeftColor = eff.strokeColor;
      const labelPreview = (node.text || ('Node ' + node.id)).split('|')[0].substring(0, 15);
      div.innerHTML =
        '<span>' + this.escapeXML(labelPreview) +
        ' <small style="color:#8b949e; font-family:monospace;">(' + node.shape + ' &bull; ' + eff.width + '&times;' + eff.height + ')</small></span>' +
        '<div style="display:flex; gap:0.35rem; align-items:center;">' +
        '<button type="button" title="Snap this shape to active Preset settings" style="background:rgba(137,87,229,0.22); border:1px solid rgba(163,113,247,0.5); color:#d2a8ff; padding:0.12rem 0.38rem; font-size:0.68rem; border-radius:4px; cursor:pointer;" onclick="window.DiagramNodes.selectNode(' + node.id + '); window.DiagramNodes.applyPresetToActive(); event.stopPropagation();">⚡ Preset</button>' +
        '<button type="button" style="background:transparent; border:none; color:#ff4444; font-weight:bold; cursor:pointer; padding:0.1rem 0.25rem;" onclick="window.DiagramNodes.removeNode(' + node.id + '); event.stopPropagation();">X</button>' +
        '</div>';
      div.onclick = () => this.selectNode(node.id);
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
