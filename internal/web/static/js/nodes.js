window.DiagramNodes = {
  list: [],
  activeId: null,
  counter: 0,
  _initialized: false,

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

  findNodeAtPct(xPct, yPct) {
    const canvasW = (window.Stage && window.Stage.canvasWidth) || 1280;
    const canvasH = (window.Stage && window.Stage.canvasHeight) || 720;
    const px = (xPct / 100) * canvasW;
    const py = (yPct / 100) * canvasH;

    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      const eff = this.getNodeEffectiveProps(n);
      const cx = (n.x / 100) * canvasW;
      const cy = (n.y / 100) * canvasH;
      const hw = (eff.width / 2) + 8;
      const hh = (eff.height / 2) + 8;
      if (px >= cx - hw && px <= cx + hw && py >= cy - hh && py <= cy + hh) {
        return n;
      }
    }
    return null;
  },

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
          if (window.HistoryManager) window.HistoryManager.recordImmediate();
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
          if (window.HistoryManager) window.HistoryManager.recordImmediate();
        });
      }
    });

    ['text', 'subtext'].forEach((key) => {
      const cap = key.charAt(0).toUpperCase() + key.slice(1);
      const el = document.getElementById('node' + cap + 'Input');
      if (el) {
        el.addEventListener('input', (e) => {
          this.updateActive(key, e.target.value);
          if (window.HistoryManager) window.HistoryManager.recordDebounced();
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
          if (window.HistoryManager) window.HistoryManager.recordDebounced();
        });
        num.addEventListener('input', (e) => {
          slider.value = e.target.value;
          this.updateActive(key, parseFloat(e.target.value));
          if (window.HistoryManager) window.HistoryManager.recordDebounced();
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
    const activeNode = this.list.find((n) => n.id === this.activeId);
    if (activeNode) {
      this.updateActiveDimBadge(activeNode);
    }
    this.renderList();
    this.triggerAppRender();
    if (activeNode) {
      this.updateUIOverlay(activeNode);
    }
  },

  addNode() {
    this.counter++;
    const offset = ((this.counter - 1) % 6) * 6;
    const newNode = {
      id: this.counter,
      shape: 'rounded',
      text: 'Node ' + this.counter,
      subtext: '',
      x: 32 + offset,
      y: 32 + offset,
      width: 170,
      height: 80,
      fillColor: '#161b22',
      fillOpacity: 0.92,
      strokeColor: '#58a6ff',
      strokeWidth: 2,
      strokeStyle: 'solid',
      textColor: '#e6edf3',
      fontSize: 15,
      anim: 'none'
    };

    const autoApplyChk = document.getElementById('chkAutoApplyPreset');
    if ((!autoApplyChk || autoApplyChk.checked) && window.NodePresets) {
      window.NodePresets.applyToNodeObject(newNode);
    }

    if (window.Stage && typeof window.Stage.snapPctToGrid === 'function') {
      const snapped = window.Stage.snapPctToGrid(newNode.x, newNode.y);
      newNode.x = snapped.x;
      newNode.y = snapped.y;
    }

    this.list.push(newNode);
    this.selectNode(newNode.id, true);
    this.triggerAppRender();
    if (window.HistoryManager) window.HistoryManager.recordImmediate();
  },

  selectNode(id, openAccordion = false) {
    if (window.DataFlows) window.DataFlows.deselectFlow();
    if (window.Glows) window.Glows.deselectGlow();
    if (window.Ripples) window.Ripples.deselectRipple();

    this.activeId = id;
    this.renderList();
    document.body.classList.add('editing-flow');

    const node = this.list.find((n) => n.id === id);
    if (!node) return;

    if (openAccordion && window.openAccordionById) {
      const presetsEl = document.getElementById('acc-presets');
      const presetsOpen = presetsEl ? presetsEl.classList.contains('open') : false;
      if (!presetsOpen) {
        window.openAccordionById('acc-nodes');
      }
    }

    const editor = document.getElementById('nodeEditor');
    if (editor) editor.style.display = 'block';

    const lbl = document.getElementById('editingNodeLabel');
    if (lbl) lbl.innerText = 'Editing Shape ' + id;

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
    const node = this.list.find((n) => n.id === this.activeId);
    if (node) {
      node[key] = value;
      this.refreshAfterChange();
    }
  },

  handleStageClick(x, y) {
    if (this.activeId === null) return false;
    const node = this.list.find((n) => n.id === this.activeId);
    if (node) {
      node.x = x;
      node.y = y;
      this.updateUIOverlay(node);

      const canvasW = (window.Stage && window.Stage.canvasWidth) || 1280;
      const canvasH = (window.Stage && window.Stage.canvasHeight) || 720;
      const cx = (node.x / 100) * canvasW;
      const cy = (node.y / 100) * canvasH;
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
    const canvasW = (window.Stage && window.Stage.canvasWidth) || 1280;
    const canvasH = (window.Stage && window.Stage.canvasHeight) || 720;
    const cx = (node.x / 100) * canvasW;
    const cy = (node.y / 100) * canvasH;
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
    this.list = this.list.filter((n) => n.id !== id);
    if (this.activeId === id) this.deselectNode();
    else this.renderList();
    this.triggerAppRender();
    if (window.HistoryManager) window.HistoryManager.recordImmediate();
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
    if (typeof window.triggerAppRender === 'function') {
      window.triggerAppRender();
    } else {
      const durSlider = document.getElementById('durationSlider');
      if (durSlider) durSlider.dispatchEvent(new Event('input'));
    }
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
          '<ellipse cx="0" cy="' + bodyTop + '" rx="' + hw + ',' + ry + '" ' + commonStyle + ' />' +
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
  }
};