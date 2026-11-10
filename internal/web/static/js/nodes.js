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
    if (id === null || id === undefined) return null;
    return this.list.find((n) => String(n.id) === String(id)) || null;
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
    const shouldApplyPreset = initialProps.applyPreset !== undefined
      ? !!initialProps.applyPreset
      : (window.NodePresets ? window.NodePresets.autoApplyToNewNodes !== false : true);
    const presetState = (shouldApplyPreset && window.NodePresets) ? window.NodePresets.getState() : null;
    const shouldSnap = initialProps.snap !== false;

    // Authoritative Go / WASM path
    if (window.EngineBridge && typeof window.EngineBridge.createNode === 'function' && window.EngineBridge.isReady()) {
      const wasmNode = window.EngineBridge.createNode(initialProps, presetState, shouldSnap);
      if (wasmNode) {
        const numId = Number(wasmNode.id);
        if (!isNaN(numId) && numId > this.counter) {
          this.counter = numId;
        }
        const localNode = Object.assign({}, wasmNode, { id: isNaN(numId) ? wasmNode.id : numId });
        const explicitProps = [
          'shape', 'text', 'subtext', 'x', 'y',
          'width', 'height', 'fillColor', 'fillOpacity',
          'strokeColor', 'strokeWidth', 'strokeStyle',
          'textColor', 'fontSize', 'anim'
        ];
        explicitProps.forEach((prop) => {
          if (initialProps[prop] !== undefined) {
            localNode[prop] = initialProps[prop];
          }
        });
        this.list.push(localNode);
        return localNode;
      }
    }

    // Mathematical JavaScript fallback
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

    if (shouldApplyPreset && window.NodePresets) {
      window.NodePresets.applyToNodeObject(newNode);
      const explicitProps = [
        'shape', 'text', 'subtext', 'x', 'y',
        'width', 'height', 'fillColor', 'fillOpacity',
        'strokeColor', 'strokeWidth', 'strokeStyle',
        'textColor', 'fontSize', 'anim'
      ];
      explicitProps.forEach((prop) => {
        if (initialProps[prop] !== undefined) {
          newNode[prop] = initialProps[prop];
        }
      });
    }

    if (shouldSnap) {
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
    if (patch.name !== undefined && window.EngineBridge && typeof window.EngineBridge.renameObject === 'function' && window.EngineBridge.isReady()) {
      window.EngineBridge.renameObject('node', id, patch.name);
    }
    if (window.EngineBridge && typeof window.EngineBridge.updateNode === 'function' && window.EngineBridge.isReady()) {
      window.EngineBridge.updateNode(id, patch);
    }
    Object.keys(patch).forEach((key) => {
      if (key !== 'id') {
        node[key] = patch[key];
      }
    });

    // Synchronize attached flows when node moves
    if (patch.x !== undefined || patch.y !== undefined) {
      if (window.DataFlows && Array.isArray(window.DataFlows.list)) {
        window.DataFlows.list.forEach((f) => {
          if (String(f.fromNodeId) === String(id) && Array.isArray(f.nodes) && f.nodes[0]) {
            if (patch.x !== undefined) f.nodes[0].x = patch.x;
            if (patch.y !== undefined) f.nodes[0].y = patch.y;
          }
          if (String(f.toNodeId) === String(id) && Array.isArray(f.nodes) && f.nodes[f.nodes.length - 1]) {
            if (patch.x !== undefined) f.nodes[f.nodes.length - 1].x = patch.x;
            if (patch.y !== undefined) f.nodes[f.nodes.length - 1].y = patch.y;
          }
        });
      }
    }

    return node;
  },

  deleteNode(id) {
    if (window.EngineBridge && typeof window.EngineBridge.deleteNode === 'function' && window.EngineBridge.isReady()) {
      window.EngineBridge.deleteNode(id);
    }

    // Detach any flows attached to deleted node
    if (window.DataFlows && Array.isArray(window.DataFlows.list)) {
      window.DataFlows.list.forEach((f) => {
        if (String(f.fromNodeId) === String(id)) f.fromNodeId = undefined;
        if (String(f.toNodeId) === String(id)) f.toNodeId = undefined;
      });
    }

    const before = this.list.length;
    this.list = this.list.filter((n) => String(n.id) !== String(id));
    if (this.activeId !== null && String(this.activeId) === String(id)) {
      this.activeId = null;
    }
    if (window.ObjectGroups && typeof window.ObjectGroups.pruneMember === 'function') {
      window.ObjectGroups.pruneMember('node', id);
    }
    return this.list.length < before;
  },

  findNodeAtPct(xPct, yPct, canvasW, canvasH) {
    if (window.EngineBridge && typeof window.EngineBridge.findNodeAt === 'function' && window.EngineBridge.isReady()) {
      const wasmFound = window.EngineBridge.findNodeAt(xPct, yPct, canvasW, canvasH);
      if (wasmFound && wasmFound.id !== undefined) {
        const local = this.getNode(Number(wasmFound.id) || wasmFound.id);
        if (local) return local;
      }
    }

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
      '<filter id="nodeDropShadow" x="-30%" y="-30%" width="160%" height="160%">' +
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

      if (window.ShapeRegistry && typeof window.ShapeRegistry.get === 'function') {
        const shapeDef = window.ShapeRegistry.get(n.shape);
        if (shapeDef) {
          if (typeof window.ShapeRegistry.renderShapeSVG === 'function') {
            shapeSVG = window.ShapeRegistry.renderShapeSVG(shapeDef, eff, w, h, hw, hh, commonStyle, n);
          } else if (typeof shapeDef.buildSVG === 'function') {
            shapeSVG = shapeDef.buildSVG(eff, w, h, hw, hh, commonStyle, n);
          }
        }
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

    const btnDeselect = document.getElementById('btnDeselectNode');
    if (btnDeselect) {
      btnDeselect.addEventListener('click', () => {
        if (window.AppCoordinator && typeof window.AppCoordinator.clearSelection === 'function') {
          window.AppCoordinator.clearSelection({ reason: 'sidebar_deselect_node' });
        } else {
          this.deselectNode();
        }
      });
    }

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

    ['name', 'text', 'subtext'].forEach((key) => {
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

    // Alignment and distribution tool buttons
    const alignModes = [
      { id: 'btnAlignLeft', mode: 'left' },
      { id: 'btnAlignHCenter', mode: 'hcenter' },
      { id: 'btnAlignRight', mode: 'right' },
      { id: 'btnAlignTop', mode: 'top' },
      { id: 'btnAlignVCenter', mode: 'vcenter' },
      { id: 'btnAlignBottom', mode: 'bottom' }
    ];
    alignModes.forEach(({ id, mode }) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          if (window.AppCoordinator && typeof window.AppCoordinator.alignSelectedNodes === 'function') {
            window.AppCoordinator.alignSelectedNodes(mode);
          }
        });
      }
    });

    const btnDistH = document.getElementById('btnDistributeH');
    if (btnDistH) {
      btnDistH.addEventListener('click', () => {
        if (window.AppCoordinator && typeof window.AppCoordinator.distributeSelectedNodes === 'function') {
          window.AppCoordinator.distributeSelectedNodes('horizontal');
        }
      });
    }

    const btnDistV = document.getElementById('btnDistributeV');
    if (btnDistV) {
      btnDistV.addEventListener('click', () => {
        if (window.AppCoordinator && typeof window.AppCoordinator.distributeSelectedNodes === 'function') {
          window.AppCoordinator.distributeSelectedNodes('vertical');
        }
      });
    }

    const btnGroup = document.getElementById('btnGroupSelection');
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

    const btnDup = document.getElementById('btnDuplicateSelection');
    if (btnDup) {
      btnDup.addEventListener('click', () => {
        if (window.AppCoordinator && typeof window.AppCoordinator.duplicateSelection === 'function') {
          window.AppCoordinator.duplicateSelection();
        }
      });
    }

    const btnDeselectAll = document.getElementById('btnDeselectAllNodes');
    if (btnDeselectAll) {
      btnDeselectAll.addEventListener('click', () => {
        if (window.AppCoordinator && typeof window.AppCoordinator.clearSelection === 'function') {
          window.AppCoordinator.clearSelection({ reason: 'multi_toolbar_deselect' });
        } else {
          this.deselectNode();
        }
      });
    }
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
      const lbl = document.getElementById('editingNodeLabel');
      if (lbl) lbl.innerText = 'Editing Shape ' + activeNode.id + (activeNode.name ? ' (' + activeNode.name + ')' : '');
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
    const empty = document.getElementById('emptyNodeSelection');
    if (empty) empty.style.display = 'none';

    const lbl = document.getElementById('editingNodeLabel');
    if (lbl) lbl.innerText = 'Editing Shape ' + node.id + (node.name ? ' (' + node.name + ')' : '');

    this.updateActiveDimBadge(node);

    const nameIn = document.getElementById('nodeNameInput');
    if (nameIn) nameIn.value = node.name || '';

    const shSel = document.getElementById('nodeShapeSelect');
    if (shSel) {
      if (typeof window.ensureShapeInDropdown === 'function') {
        window.ensureShapeInDropdown(shSel, node.shape || 'rounded');
      } else {
        shSel.value = node.shape || 'rounded';
      }
    }
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

  selectNode(id, openAccordion = false, options = {}) {
    if (!options.multi && window.AppCoordinator) {
      window.AppCoordinator.selectObject('node', id, { skipStageClear: true, skipModuleSelect: true });
    } else if (!options.multi) {
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
    const empty = document.getElementById('emptyNodeSelection');
    if (empty) empty.style.display = 'block';
    const selBox = document.getElementById('nodeSelectionBox');
    if (selBox) selBox.style.display = 'none';
    const multiGroup = document.getElementById('multiSelectionGroup');
    if (multiGroup) multiGroup.innerHTML = '';
    this.updateMultiSelectToolbar([]);
    if (window.AppCoordinator && window.AppCoordinator.activeSelection && window.AppCoordinator.activeSelection.type === 'node' && !window.AppCoordinator._isCoordinatingSelection) {
      window.AppCoordinator.clearSelection();
    }
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
    const multiGroup = document.getElementById('multiSelectionGroup');

    const isGroupActive = window.AppCoordinator &&
      window.AppCoordinator.activeSelection &&
      window.AppCoordinator.activeSelection.type === 'group' &&
      !(typeof window.AppCoordinator.isInGroupEditMode === 'function' && window.AppCoordinator.isInGroupEditMode());

    if (isGroupActive) {
      if (multiGroup) multiGroup.innerHTML = '';
      if (selBox) selBox.style.display = 'none';
      this.updateMultiSelectToolbar();
      return;
    }

    const targetNode = node || (this.activeId !== null ? this.getNode(this.activeId) : null);
    const selectedIds = (window.AppCoordinator && typeof window.AppCoordinator.getSelectedNodeIds === 'function')
      ? window.AppCoordinator.getSelectedNodeIds()
      : (targetNode ? [targetNode.id] : []);

    const dims = window.AppCoordinator
      ? window.AppCoordinator.getCanvasDimensions()
      : { width: (window.Stage && window.Stage.canvasWidth) || 1280, height: (window.Stage && window.Stage.canvasHeight) || 720 };
    const pad = 10;

    // 1. Primary selection outline
    if (selBox) {
      if (targetNode && (selectedIds.length === 0 || selectedIds.includes(targetNode.id))) {
        const eff = this.getNodeEffectiveProps(targetNode);
        const cx = (targetNode.x / 100) * dims.width;
        const cy = (targetNode.y / 100) * dims.height;
        const w = eff.width + pad * 2;
        const h = eff.height + pad * 2;

        selBox.setAttribute('x', (cx - w / 2).toFixed(1));
        selBox.setAttribute('y', (cy - h / 2).toFixed(1));
        selBox.setAttribute('width', w.toFixed(1));
        selBox.setAttribute('height', h.toFixed(1));
        selBox.setAttribute('stroke', '#a371f7');
        selBox.style.display = 'block';
      } else {
        selBox.style.display = 'none';
      }
    }

    // 2. Secondary multi-selection outlines
    if (multiGroup) {
      multiGroup.innerHTML = '';
      const allSelectedItems = (window.AppCoordinator && typeof window.AppCoordinator.getSelectedItems === 'function')
        ? window.AppCoordinator.getSelectedItems()
        : (selectedIds.map((id) => ({ type: 'node', id })));

      if (allSelectedItems.length > 1) {
        allSelectedItems.forEach((it) => {
          if (!it || it.id == null) return;
          if (it.type === 'node') {
            if (targetNode && String(it.id) === String(targetNode.id)) return; // primary already drawn
            const n = this.getNode(it.id);
            if (!n) return;
            const eff = this.getNodeEffectiveProps(n);
            const cx = (n.x / 100) * dims.width;
            const cy = (n.y / 100) * dims.height;
            const w = eff.width + pad * 2;
            const h = eff.height + pad * 2;
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', (cx - w / 2).toFixed(1));
            rect.setAttribute('y', (cy - h / 2).toFixed(1));
            rect.setAttribute('width', w.toFixed(1));
            rect.setAttribute('height', h.toFixed(1));
            rect.setAttribute('rx', '8');
            rect.setAttribute('fill', 'rgba(88, 166, 255, 0.08)');
            rect.setAttribute('stroke', '#58a6ff');
            rect.setAttribute('stroke-width', '2');
            rect.setAttribute('stroke-dasharray', '5,3');
            rect.setAttribute('vector-effect', 'non-scaling-stroke');
            multiGroup.appendChild(rect);
          } else if (it.type === 'glow' && window.Glows) {
            const g = window.Glows.getGlow(it.id);
            if (!g) return;
            const cx = (g.x / 100) * dims.width;
            const cy = (g.y / 100) * dims.height;
            const size = Math.max(16, g.size || 25);
            if (g.shape === 'square') {
              const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
              rect.setAttribute('x', (cx - size - 4).toFixed(1));
              rect.setAttribute('y', (cy - size - 4).toFixed(1));
              rect.setAttribute('width', ((size + 4) * 2).toFixed(1));
              rect.setAttribute('height', ((size + 4) * 2).toFixed(1));
              rect.setAttribute('rx', '4');
              rect.setAttribute('fill', 'rgba(255, 0, 68, 0.08)');
              rect.setAttribute('stroke', '#ff7b72');
              rect.setAttribute('stroke-width', '2');
              rect.setAttribute('stroke-dasharray', '5,3');
              rect.setAttribute('vector-effect', 'non-scaling-stroke');
              multiGroup.appendChild(rect);
            } else if (g.shape === 'custom' && g.customW && g.customH) {
              const scale = g.scale || 1.0;
              const hw = (g.customW * scale) / 2 + 4;
              const hh = (g.customH * scale) / 2 + 4;
              const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
              rect.setAttribute('x', (cx - hw).toFixed(1));
              rect.setAttribute('y', (cy - hh).toFixed(1));
              rect.setAttribute('width', (hw * 2).toFixed(1));
              rect.setAttribute('height', (hh * 2).toFixed(1));
              rect.setAttribute('rx', '4');
              rect.setAttribute('fill', 'rgba(255, 0, 68, 0.08)');
              rect.setAttribute('stroke', '#ff7b72');
              rect.setAttribute('stroke-width', '2');
              rect.setAttribute('stroke-dasharray', '5,3');
              rect.setAttribute('vector-effect', 'non-scaling-stroke');
              multiGroup.appendChild(rect);
            } else {
              const rad = size + 4;
              const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
              circ.setAttribute('cx', cx.toFixed(1));
              circ.setAttribute('cy', cy.toFixed(1));
              circ.setAttribute('r', rad.toFixed(1));
              circ.setAttribute('fill', 'rgba(255, 0, 68, 0.08)');
              circ.setAttribute('stroke', '#ff7b72');
              circ.setAttribute('stroke-width', '2');
              circ.setAttribute('stroke-dasharray', '5,3');
              circ.setAttribute('vector-effect', 'non-scaling-stroke');
              multiGroup.appendChild(circ);
            }
          } else if (it.type === 'ripple' && window.Ripples) {
            const rp = window.Ripples.getRipple(it.id);
            if (!rp) return;
            const cx = (rp.x / 100) * dims.width;
            const cy = (rp.y / 100) * dims.height;
            const rad = Math.max(20, Math.min(300, rp.outerR || 100)) + 4;
            const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circ.setAttribute('cx', cx.toFixed(1));
            circ.setAttribute('cy', cy.toFixed(1));
            circ.setAttribute('r', rad.toFixed(1));
            circ.setAttribute('fill', 'rgba(0, 229, 255, 0.08)');
            circ.setAttribute('stroke', '#00e5ff');
            circ.setAttribute('stroke-width', '2');
            circ.setAttribute('stroke-dasharray', '5,3');
            circ.setAttribute('vector-effect', 'non-scaling-stroke');
            multiGroup.appendChild(circ);
          } else if (it.type === 'flow' && window.DataFlows) {
            const livePath = document.getElementById('flowPath-' + it.id);
            if (livePath && livePath.getAttribute('d')) {
              const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'path');
              highlight.setAttribute('d', livePath.getAttribute('d'));
              highlight.setAttribute('fill', 'none');
              highlight.setAttribute('stroke', '#58a6ff');
              highlight.setAttribute('stroke-width', '4');
              highlight.setAttribute('stroke-dasharray', '6,4');
              highlight.setAttribute('vector-effect', 'non-scaling-stroke');
              multiGroup.appendChild(highlight);
            }
          }
        });
      }
    }

    // 3. Update multi-selection toolbar
    this.updateMultiSelectToolbar();
  },

  updateMultiSelectToolbar() {
    const isGroup = window.AppCoordinator && window.AppCoordinator.activeSelection && window.AppCoordinator.activeSelection.type === 'group';
    const items = (window.AppCoordinator && typeof window.AppCoordinator.getSelectedItems === 'function')
      ? window.AppCoordinator.getSelectedItems()
      : (this.activeId !== null ? [{ type: 'node', id: this.activeId }] : []);
    const nodeIds = (window.AppCoordinator && typeof window.AppCoordinator.getSelectedNodeIds === 'function')
      ? window.AppCoordinator.getSelectedNodeIds()
      : (this.activeId !== null ? [this.activeId] : []);

    const toolbar = document.getElementById('nodeMultiSelectToolbar');
    const badge = document.getElementById('multiSelectionBadge');
    const btnGroup = document.getElementById('btnGroupSelection');
    if (toolbar) {
      if (isGroup || items.length >= 2) {
        toolbar.style.display = 'block';
        if (badge) {
          if (isGroup) {
            const grp = window.AppCoordinator.getGroup(window.AppCoordinator.activeSelection.id);
            const name = (grp && grp.name) ? grp.name : window.AppCoordinator.activeSelection.id;
            badge.innerText = `Group: ${name} (${items.length} members)`;
          } else {
            badge.innerText = (nodeIds.length === items.length)
              ? (items.length + ' Shapes Selected')
              : (items.length + ' Objects Selected');
          }
        }
        if (btnGroup) {
          if (isGroup) {
            btnGroup.textContent = '🔓 Ungroup';
            btnGroup.title = 'Disband this group, keeping all member objects (Ctrl+Shift+G)';
          } else {
            btnGroup.textContent = '👥 Group';
            btnGroup.title = 'Group selected shapes into a persistent group (Ctrl+G)';
          }
        }
        const canAlign = !isGroup && nodeIds.length >= 2;
        const canDist = !isGroup && nodeIds.length >= 3;
        ['btnAlignLeft', 'btnAlignHCenter', 'btnAlignRight', 'btnAlignTop', 'btnAlignVCenter', 'btnAlignBottom'].forEach((btnId) => {
          const btn = document.getElementById(btnId);
          if (btn) btn.disabled = !canAlign;
        });
        const btnDistH = document.getElementById('btnDistributeH');
        const btnDistV = document.getElementById('btnDistributeV');
        if (btnDistH) btnDistH.disabled = !canDist;
        if (btnDistV) btnDistV.disabled = !canDist;
      } else {
        toolbar.style.display = 'none';
      }
    }

    // Also update flow, glow, ripple toolbars if present
    ['flow', 'glow', 'ripple'].forEach((typ) => {
      const tb = document.getElementById(typ + 'MultiSelectToolbar');
      const bg = document.getElementById(typ + 'MultiSelectionBadge');
      const bgBtn = document.getElementById('btnGroup' + typ.charAt(0).toUpperCase() + typ.slice(1) + 'Selection');
      if (tb) {
        if (isGroup || items.length >= 2) {
          tb.style.display = 'block';
          if (bg) {
            if (isGroup) {
              const grp = window.AppCoordinator.getGroup(window.AppCoordinator.activeSelection.id);
              const name = (grp && grp.name) ? grp.name : window.AppCoordinator.activeSelection.id;
              bg.innerText = `Group: ${name} (${items.length} members)`;
            } else {
              bg.innerText = items.length + ' Objects Selected';
            }
          }
          if (bgBtn) {
            if (isGroup) {
              bgBtn.textContent = '🔓 Ungroup';
              bgBtn.title = 'Disband this group, keeping all member objects (Ctrl+Shift+G)';
            } else {
              bgBtn.textContent = '👥 Group';
              bgBtn.title = 'Group selected objects into a persistent group (Ctrl+G)';
            }
          }
        } else {
          tb.style.display = 'none';
        }
      }
    });
  },

  updateGroupOverlay(groupId) {
    const overlay = document.getElementById('groupSelectionOverlay');
    const box = document.getElementById('groupSelectionBox');
    const label = document.getElementById('groupSelectionLabel');
    if (!overlay || !box) return;

    if (!groupId) {
      overlay.style.display = 'none';
      this.updateMultiSelectToolbar();
      return;
    }

    const dims = window.AppCoordinator
      ? window.AppCoordinator.getCanvasDimensions()
      : { width: (window.Stage && window.Stage.canvasWidth) || 1280, height: (window.Stage && window.Stage.canvasHeight) || 720 };

    let bounds = null;
    if (window.EngineBridge && typeof window.EngineBridge.getGroupBounds === 'function') {
      bounds = window.EngineBridge.getGroupBounds(groupId, dims.width, dims.height);
    } else if (window.ObjectGroups && typeof window.ObjectGroups.computeBounds === 'function') {
      bounds = window.ObjectGroups.computeBounds(groupId, dims.width, dims.height);
    }

    if (!bounds || !bounds.success) {
      overlay.style.display = 'none';
      this.updateMultiSelectToolbar();
      return;
    }

    const pad = 14;
    const xMinPx = (bounds.minX / 100) * dims.width - pad;
    const yMinPx = (bounds.minY / 100) * dims.height - pad;
    const wPx = ((bounds.maxX - bounds.minX) / 100) * dims.width + pad * 2;
    const hPx = ((bounds.maxY - bounds.minY) / 100) * dims.height + pad * 2;

    box.setAttribute('x', Math.max(0, xMinPx).toFixed(1));
    box.setAttribute('y', Math.max(0, yMinPx).toFixed(1));
    box.setAttribute('width', Math.max(10, wPx).toFixed(1));
    box.setAttribute('height', Math.max(10, hPx).toFixed(1));

    if (label) {
      const grp = window.AppCoordinator ? window.AppCoordinator.getGroup(groupId) : null;
      const name = (grp && grp.name) ? grp.name : ('Group ' + groupId);
      label.textContent = '👥 ' + name;
      label.setAttribute('x', Math.max(8, xMinPx).toFixed(1));
      label.setAttribute('y', Math.max(16, yMinPx - 6).toFixed(1));
    }

    overlay.style.display = 'block';
    this.updateMultiSelectToolbar();
  },

  hideGroupOverlay() {
    const overlay = document.getElementById('groupSelectionOverlay');
    if (overlay) overlay.style.display = 'none';
    this.updateMultiSelectToolbar();
  },

  removeNode(id) {
    const wasActive = this.activeId !== null && String(this.activeId) === String(id);
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
    const emptyEl = document.getElementById('emptyNodeSelection');
    if (this.list.length === 0) {
      container.innerHTML = '<div class="stage-hint">No shapes or text boxes active.</div>';
      if (emptyEl) emptyEl.innerHTML = 'No shapes created. Click <strong>+ Add</strong> above to add one.';
      return;
    }
    if (emptyEl && !this.activeId) {
      emptyEl.innerHTML = 'Select a shape to view and edit its properties, or click <strong>+ Add</strong> above.';
    }
    container.innerHTML = '';
    const shapeIcons = {
      rounded: '▢',
      rect: '▭',
      pill: '⬭',
      textbox: 'T',
      callout: '💬',
      diamond: '◇',
      hexagon: '⬡',
      parallelogram: '▱',
      cylinder: '🗄',
      cloud: '☁',
      circle: '○',
      axes: '┼'
    };
    this.list.forEach((node) => {
      const eff = this.getNodeEffectiveProps(node);
      const isSel = (window.AppCoordinator && typeof window.AppCoordinator.isObjectSelected === 'function')
        ? window.AppCoordinator.isObjectSelected('node', node.id)
        : (this.activeId !== null && String(this.activeId) === String(node.id));
      const isPrimary = (this.activeId !== null && String(this.activeId) === String(node.id));
      const div = document.createElement('div');
      div.className = 'flow-list-item compact-instance-row' + (isSel ? ' selected' : '') + (isPrimary ? ' primary-selected' : '');
      div.style.borderLeftColor = eff.strokeColor || '#58a6ff';
      const icon = shapeIcons[node.shape] || '▢';
      const labelText = node.name || (node.text || ('Node ' + node.id)).split('|')[0];
      const safeLabel = this.escapeXML(labelText);
      div.title = safeLabel + ' (' + node.shape + ', ' + eff.width + 'x' + eff.height + 'px)';

      div.innerHTML =
        '<span class="instance-icon" style="color:' + (eff.strokeColor || '#58a6ff') + ';" title="' + this.escapeXML(node.shape) + '">' + icon + '</span>' +
        '<span class="instance-label" title="' + safeLabel + '">' + safeLabel + '</span>' +
        '<span class="compact-meta">' + eff.width + '&times;' + eff.height + '</span>' +
        '<button type="button" class="btn-row-action btn-row-preset" title="Snap this shape to active Preset settings" onclick="window.DiagramNodes.selectNode(\'' + node.id + '\'); window.DiagramNodes.applyPresetToActive(); event.stopPropagation();">⚡</button>' +
        '<button type="button" class="btn-row-action btn-row-delete" title="Delete shape" onclick="window.DiagramNodes.removeNode(\'' + node.id + '\'); event.stopPropagation();">&times;</button>';

      div.onclick = (e) => {
        if (e && (e.shiftKey || e.ctrlKey || e.metaKey)) {
          if (window.AppCoordinator && typeof window.AppCoordinator.toggleObjectSelection === 'function') {
            window.AppCoordinator.toggleObjectSelection('node', node.id);
            return;
          }
        }
        if (this.activeId !== null && String(this.activeId) === String(node.id) && (!window.AppCoordinator || window.AppCoordinator.getSelectedItems().length <= 1)) {
          if (window.AppCoordinator && typeof window.AppCoordinator.clearSelection === 'function') {
            window.AppCoordinator.clearSelection({ reason: 'sidebar_toggle_node' });
          } else {
            this.deselectNode();
          }
        } else {
          this.selectNode(node.id);
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
