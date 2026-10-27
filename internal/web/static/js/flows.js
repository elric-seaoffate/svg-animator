window.DataFlows = {
  list: [],
  activeId: null,
  activeNodeIdx: 0,
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

  init() {
    if (this._initialized) return;
    this._initialized = true;

    const btnAdd = document.getElementById('btnAddFlow');
    if (btnAdd) btnAdd.addEventListener('click', () => this.addFlow());

    const btnAddNode = document.getElementById('btnFlowAddNode');
    if (btnAddNode) btnAddNode.addEventListener('click', () => this.addNodeToActive());

    const btnDelNode = document.getElementById('btnFlowDelNode');
    if (btnDelNode) btnDelNode.addEventListener('click', () => this.dropNodeFromActive());

    const sliderNumEvents = ['opacity', 'glow', 'scale', 'speed', 'delay', 'endDelay', 'curvature', 'lineWidth'];
    sliderNumEvents.forEach((key) => {
      const cap = key.charAt(0).toUpperCase() + key.slice(1);
      const slider = document.getElementById('flow' + cap + 'Slider');
      const num = document.getElementById('flow' + cap + 'Num');
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

    ['type', 'color', 'showLine', 'hideOnDelay', 'route', 'lineStyle', 'arrow'].forEach((key) => {
      let elId = 'flow' + key.charAt(0).toUpperCase() + key.slice(1);
      if (key === 'color') elId += 'Picker';
      else if (['type', 'route', 'lineStyle', 'arrow'].includes(key)) elId += 'Select';

      const el = document.getElementById(elId);
      if (el) {
        if (key === 'color') {
          el.addEventListener('input', (e) => this.updateActive('color', e.target.value));
        }
        el.addEventListener('change', (e) => {
          this.updateActive(key, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
          if (key === 'type') {
            const cRow = document.getElementById('customPayloadRow');
            if (cRow) cRow.style.display = e.target.value === 'custom' ? 'block' : 'none';
          }
          if (window.HistoryManager) window.HistoryManager.recordImmediate();
        });
      }
    });

    const lblIn = document.getElementById('flowLabelInput');
    if (lblIn) {
      lblIn.addEventListener('input', (e) => {
        this.updateActive('label', e.target.value);
        if (window.HistoryManager) window.HistoryManager.recordDebounced();
      });
    }

    const nodeSlider = document.getElementById('flowNodeSlider');
    if (nodeSlider) {
      nodeSlider.addEventListener('input', (e) => {
        this.activeNodeIdx = parseInt(e.target.value, 10);
        const nodeNum = document.getElementById('flowNodeNum');
        if (nodeNum) nodeNum.value = this.activeNodeIdx;
        this.updateUIOverlay();
      });
    }

    const customIn = document.getElementById('customPayloadInput');
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
              const f = this.list.find((flow) => flow.id === this.activeId);
              if (f) {
                f.customB64 = dataUrl.split(',')[1];
                f.customMime = file.type;
                f.customW = img.naturalWidth;
                f.customH = img.naturalHeight;
                this.triggerAppRender();
                if (window.HistoryManager) window.HistoryManager.recordImmediate();
              }
            }
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      });
    }
  },

  addFlow() {
    this.counter++;
    const newFlow = {
      id: this.counter,
      nodes: [{ x: 25, y: 50 }, { x: 75, y: 50 }],
      type: 'orb',
      route: 'curve',
      lineStyle: 'dashed',
      arrow: 'none',
      lineWidth: 2.5,
      label: '',
      color: '#00ffcc',
      showLine: true,
      curvature: 0,
      opacity: 1.0,
      glow: 20,
      scale: 1.0,
      speed: 2.0,
      delay: 0.0,
      endDelay: 0.0,
      hideOnDelay: true,
      customB64: null,
      customMime: null
    };
    this.list.push(newFlow);
    this.selectFlow(newFlow.id);
    this.triggerAppRender();
    if (window.HistoryManager) window.HistoryManager.recordImmediate();
  },

  addNodeToActive() {
    const f = this.list.find((flow) => flow.id === this.activeId);
    if (!f) return;
    const lastNode = f.nodes[f.nodes.length - 1];
    f.nodes.push({ x: Math.min(95, lastNode.x + 5), y: Math.min(95, lastNode.y + 5) });
    this.activeNodeIdx = f.nodes.length - 1;
    this.refreshNodeSlider(f);
    this.updateUIOverlay();
    this.triggerAppRender();
    if (window.HistoryManager) window.HistoryManager.recordImmediate();
  },

  dropNodeFromActive() {
    const f = this.list.find((flow) => flow.id === this.activeId);
    if (!f || f.nodes.length <= 2) {
      alert('A flow must have at least 2 waypoints (Start and End).');
      return;
    }
    f.nodes.splice(this.activeNodeIdx, 1);
    this.activeNodeIdx = Math.max(0, this.activeNodeIdx - 1);
    this.refreshNodeSlider(f);
    this.updateUIOverlay();
    this.triggerAppRender();
    if (window.HistoryManager) window.HistoryManager.recordImmediate();
  },

  refreshNodeSlider(f) {
    const slider = document.getElementById('flowNodeSlider');
    const num = document.getElementById('flowNodeNum');
    if (slider && num) {
      slider.max = f.nodes.length - 1;
      slider.value = this.activeNodeIdx;
      num.value = this.activeNodeIdx;
    }
  },

  selectFlow(id) {
    if (window.DiagramNodes) window.DiagramNodes.deselectNode();
    if (window.Glows) window.Glows.deselectGlow();
    if (window.Ripples) window.Ripples.deselectRipple();

    this.activeId = id;
    this.activeNodeIdx = 0;
    this.renderList();
    document.body.classList.add('editing-flow');

    const f = this.list.find((flow) => flow.id === id);
    if (f) {
      const ed = document.getElementById('flowEditor');
      if (ed) ed.style.display = 'block';
      const lbl = document.getElementById('editingFlowLabel');
      if (lbl) lbl.innerText = 'Editing Connector / Flow ' + id;

      const tSel = document.getElementById('flowTypeSelect');
      if (tSel) tSel.value = f.type || 'orb';
      const rSel = document.getElementById('flowRouteSelect');
      if (rSel) rSel.value = f.route || 'curve';
      const lsSel = document.getElementById('flowLineStyleSelect');
      if (lsSel) lsSel.value = f.lineStyle || 'dashed';
      const arSel = document.getElementById('flowArrowSelect');
      if (arSel) arSel.value = f.arrow || 'none';
      const lIn = document.getElementById('flowLabelInput');
      if (lIn) lIn.value = f.label || '';
      const cPick = document.getElementById('flowColorPicker');
      if (cPick) cPick.value = f.color;
      const sLine = document.getElementById('flowShowLine');
      if (sLine) sLine.checked = f.showLine;
      const hDel = document.getElementById('flowHideOnDelay');
      if (hDel) hDel.checked = f.hideOnDelay !== false;
      const cRow = document.getElementById('customPayloadRow');
      if (cRow) cRow.style.display = f.type === 'custom' ? 'block' : 'none';

      this.refreshNodeSlider(f);

      ['opacity', 'glow', 'scale', 'speed', 'delay', 'endDelay', 'curvature', 'lineWidth'].forEach((key) => {
        const val = f[key] !== undefined ? f[key] : (key === 'curvature' ? 0 : (key === 'lineWidth' ? 2.5 : 1));
        const cap = key.charAt(0).toUpperCase() + key.slice(1);
        const sl = document.getElementById('flow' + cap + 'Slider');
        const nu = document.getElementById('flow' + cap + 'Num');
        if (sl) sl.value = val;
        if (nu) nu.value = val;
      });
      this.updateUIOverlay();
    }
  },

  deselectFlow() {
    this.activeId = null;
    this.renderList();
    document.body.classList.remove('editing-flow');
    const editor = document.getElementById('flowEditor');
    if (editor) editor.style.display = 'none';
    const ret = document.getElementById('dynamicFlowReticles');
    if (ret) ret.innerHTML = '';
    const path = document.getElementById('flowCurvePath');
    if (path) path.style.display = 'none';
  },

  updateActive(key, value) {
    if (this.activeId === null) return;
    const f = this.list.find((flow) => flow.id === this.activeId);
    if (f) {
      f[key] = value;
      this.renderList();
      this.triggerAppRender();
      this.updateUIOverlay();
    }
  },

  handleStageClick(x, y) {
    if (this.activeId === null) return false;
    const f = this.list.find((flow) => flow.id === this.activeId);
    if (f && f.nodes[this.activeNodeIdx]) {
      f.nodes[this.activeNodeIdx].x = x;
      f.nodes[this.activeNodeIdx].y = y;
      this.updateUIOverlay();

      const w = (window.Stage && window.Stage.canvasWidth) || 1280;
      const h = (window.Stage && window.Stage.canvasHeight) || 720;
      const newD = this.generatePathString(f.nodes, f.curvature || 0, w, h, f.route || 'curve');
      const livePath = document.getElementById('flowPath-' + f.id);
      if (livePath) {
        livePath.setAttribute('d', newD);
      } else {
        this.triggerAppRender();
      }
      return true;
    }
    return false;
  },

  generatePathString(nodes, curvature, width, height, routeMode = 'curve') {
    if (nodes.length < 2) return '';
    const px = (pct) => Number(((pct / 100) * width).toFixed(2));
    const py = (pct) => Number(((pct / 100) * height).toFixed(2));

    if (routeMode === 'ortho-hv' || routeMode === 'ortho-vh' || routeMode === 'ortho-mid') {
      let d = 'M ' + px(nodes[0].x) + ',' + py(nodes[0].y);
      for (let i = 0; i < nodes.length - 1; i++) {
        const x1 = px(nodes[i].x);
        const y1 = py(nodes[i].y);
        const x2 = px(nodes[i + 1].x);
        const y2 = py(nodes[i + 1].y);
        if (routeMode === 'ortho-hv') {
          d += ' L ' + x2 + ',' + y1 + ' L ' + x2 + ',' + y2;
        } else if (routeMode === 'ortho-vh') {
          d += ' L ' + x1 + ',' + y2 + ' L ' + x2 + ',' + y2;
        } else {
          const midX = Number(((x1 + x2) / 2).toFixed(2));
          d += ' L ' + midX + ',' + y1 + ' L ' + midX + ',' + y2 + ' L ' + x2 + ',' + y2;
        }
      }
      return d;
    }

    if (curvature === 0) {
      return 'M ' + px(nodes[0].x) + ',' + py(nodes[0].y) + ' ' + nodes.slice(1).map((n) => 'L ' + px(n.x) + ',' + py(n.y)).join(' ');
    }

    if (nodes.length === 2) {
      const p1 = nodes[0];
      const p2 = nodes[1];
      const dx = px(p2.x) - px(p1.x);
      const dy = py(p2.y) - py(p1.y);
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / dist;
      const ny = dx / dist;
      const bend = (curvature / 100) * (dist * 0.4);
      const cx = ((px(p1.x) + px(p2.x)) / 2 + nx * bend).toFixed(2);
      const cy = ((py(p1.y) + py(p2.y)) / 2 + ny * bend).toFixed(2);
      return 'M ' + px(p1.x) + ',' + py(p1.y) + ' Q ' + cx + ',' + cy + ' ' + px(p2.x) + ',' + py(p2.y);
    }

    let d = 'M ' + px(nodes[0].x) + ',' + py(nodes[0].y);
    const t = (curvature / 100) * 0.3;
    for (let i = 0; i < nodes.length - 1; i++) {
      const p0 = i === 0 ? nodes[0] : nodes[i - 1];
      const p1 = nodes[i];
      const p2 = nodes[i + 1];
      const p3 = i + 2 < nodes.length ? nodes[i + 2] : p2;
      const cp1x = (px(p1.x) + (px(p2.x) - px(p0.x)) * t).toFixed(2);
      const cp1y = (py(p1.y) + (py(p2.y) - py(p0.y)) * t).toFixed(2);
      const cp2x = (px(p2.x) - (px(p3.x) - px(p1.x)) * t).toFixed(2);
      const cp2y = (py(p2.y) - (py(p3.y) - py(p1.y)) * t).toFixed(2);
      d += ' C ' + cp1x + ',' + cp1y + ' ' + cp2x + ',' + cp2y + ' ' + px(p2.x) + ',' + py(p2.y);
    }
    return d;
  },

  getMidpoint(nodes, curvature, width, height) {
    if (!nodes || nodes.length < 2) return { x: width / 2, y: height / 2 };
    const px = (pct) => (pct / 100) * width;
    const py = (pct) => (pct / 100) * height;
    const midIdx = Math.floor((nodes.length - 1) / 2);
    const p1 = nodes[midIdx];
    const p2 = nodes[midIdx + 1];
    let mx = (px(p1.x) + px(p2.x)) / 2;
    let my = (py(p1.y) + py(p2.y)) / 2;

    if (nodes.length === 2 && curvature !== 0) {
      const dx = px(p2.x) - px(p1.x);
      const dy = py(p2.y) - py(p1.y);
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / dist;
      const ny = dx / dist;
      const bend = (curvature / 100) * (dist * 0.2);
      mx += nx * bend;
      my += ny * bend;
    }
    return { x: mx, y: my };
  },

  updateUIOverlay() {
    const f = this.list.find((flow) => flow.id === this.activeId);
    const container = document.getElementById('dynamicFlowReticles');
    const pathEl = document.getElementById('flowCurvePath');
    if (!f || !container || !pathEl) return;

    const w = (window.Stage && window.Stage.canvasWidth) || 1280;
    const h = (window.Stage && window.Stage.canvasHeight) || 720;

    if (f.nodes.length >= 2) {
      pathEl.style.display = 'block';
      pathEl.setAttribute('d', this.generatePathString(f.nodes, f.curvature, w, h, f.route || 'curve'));
      pathEl.setAttribute('stroke', f.color);
    } else {
      pathEl.style.display = 'none';
    }

    const existingReticles = container.querySelectorAll('[data-flow-node-idx]');
    if (existingReticles.length === f.nodes.length) {
      f.nodes.forEach((node, idx) => {
        const isActive = idx === this.activeNodeIdx;
        const el = existingReticles[idx];
        el.className = 'reticle' + (isActive ? ' active-reticle' : '');
        el.style.left = node.x + '%';
        el.style.top = node.y + '%';
        el.style.background = isActive ? (f.color + '4D') : 'rgba(0,0,0,0.65)';
        el.style.borderColor = f.color;
        el.style.zIndex = isActive ? '12' : '11';
      });
    } else {
      let html = '';
      f.nodes.forEach((node, idx) => {
        const isActive = idx === this.activeNodeIdx;
        html +=
          '<div class="reticle' + (isActive ? ' active-reticle' : '') + '" ' +
          'data-flow-node-idx="' + idx + '" ' +
          'style="left:' + node.x + '%; top:' + node.y + '%; pointer-events: auto; ' +
          'background:' + (isActive ? (f.color + '4D') : 'rgba(0,0,0,0.65)') + '; ' +
          'border-color:' + f.color + '; z-index:' + (isActive ? 12 : 11) + '; cursor: grab;">' +
          'N' + idx +
          '</div>';
      });
      container.innerHTML = html;
    }
  },

  removeFlow(id) {
    this.list = this.list.filter((f) => f.id !== id);
    if (this.activeId === id) this.deselectFlow();
    else this.renderList();
    this.triggerAppRender();
    if (window.HistoryManager) window.HistoryManager.recordImmediate();
  },

  renderList() {
    const container = document.getElementById('flowListContainer');
    if (!container) return;
    if (this.list.length === 0) {
      container.innerHTML = '<div class="stage-hint" id="emptyFlowHint">No flows active.</div>';
      return;
    }
    container.innerHTML = '';
    this.list.forEach((f) => {
      const div = document.createElement('div');
      div.className = 'flow-list-item' + (this.activeId === f.id ? ' selected' : '');
      div.style.borderLeftColor = f.color;
      const tag = f.label ? this.escapeXML(f.label) : ('Flow ' + f.id + ' [' + f.nodes.length + ' Nodes]');
      div.innerHTML =
        '<span>' + tag + '</span>' +
        '<button type="button" style="background:transparent; border:none; color:#ff4444; font-weight:bold; cursor:pointer;" onclick="window.DataFlows.removeFlow(' + f.id + '); event.stopPropagation();">X</button>';
      div.onclick = () => this.selectFlow(f.id);
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

  injectIntoSVG(svgString, stateOrWidth, heightArg) {
    if (this.list.length === 0) return svgString;
    let width;
    let height;
    if (stateOrWidth && stateOrWidth.image) {
      width = stateOrWidth.image.width;
      height = stateOrWidth.image.height;
    } else {
      width = stateOrWidth;
      height = heightArg;
    }

    let defs = '';
    let elements = '';

    this.list.forEach((f) => {
      const routeMode = f.route || 'curve';
      const pathD = this.generatePathString(f.nodes, f.curvature || 0, width, height, routeMode);
      if (!pathD) return;

      const pathId = 'flowPath-' + f.id;
      const totalDur = f.speed + (f.endDelay || 0);
      const ratio = f.endDelay > 0 ? (f.speed / totalDur).toFixed(4) : '1';
      const lw = f.lineWidth !== undefined ? f.lineWidth : Math.max(1.5, 3 * f.scale);

      const arrowMode = f.arrow || 'none';
      let markerAttrs = '';
      if (arrowMode !== 'none') {
        const markerId = 'flowArrow-' + f.id;
        defs +=
          '<marker id="' + markerId + '" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
          '<path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="' + f.color + '" />' +
          '</marker>';
        if (arrowMode === 'end' || arrowMode === 'both') markerAttrs += ' marker-end="url(#' + markerId + ')"';
        if (arrowMode === 'start' || arrowMode === 'both') markerAttrs += ' marker-start="url(#' + markerId + ')"';
      }

      if (f.showLine) {
        const lStyle = f.lineStyle || 'dashed';
        if (lStyle === 'solid') {
          elements += '<path id="' + pathId + '" d="' + pathD + '" fill="none" stroke="' + f.color + '" stroke-width="' + lw + '" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"' + markerAttrs + ' />';
        } else if (lStyle === 'dotted') {
          elements += '<path id="' + pathId + '" d="' + pathD + '" fill="none" stroke="' + f.color + '" stroke-width="' + lw + '" stroke-dasharray="' + lw + ',' + (lw * 2.2) + '" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"' + markerAttrs + ' />';
        } else if (lStyle === 'marching') {
          elements += '<path id="' + pathId + '" d="' + pathD + '" fill="none" stroke="' + f.color + '" stroke-width="' + lw + '" stroke-dasharray="10,6" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"' + markerAttrs + '><animate attributeName="stroke-dashoffset" from="32" to="0" dur="1s" repeatCount="indefinite" /></path>';
        } else if (lStyle === 'double') {
          elements += '<path d="' + pathD + '" fill="none" stroke="' + f.color + '" stroke-width="' + (lw * 2.6) + '" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"' + markerAttrs + ' />';
          elements += '<path id="' + pathId + '" d="' + pathD + '" fill="none" stroke="#0d1117" stroke-width="' + (lw * 0.9) + '" stroke-linecap="round" stroke-linejoin="round" />';
        } else {
          elements += '<path id="' + pathId + '" d="' + pathD + '" fill="none" stroke="' + f.color + '" stroke-width="' + lw + '" stroke-dasharray="8,6" stroke-linecap="round" stroke-linejoin="round" opacity="0.65"' + markerAttrs + ' />';
        }
      } else {
        elements += '<path id="' + pathId + '" d="' + pathD + '" fill="none" stroke="none" />';
      }

      if (f.label && f.label.trim() !== '') {
        const mid = this.getMidpoint(f.nodes, routeMode === 'curve' ? (f.curvature || 0) : 0, width, height);
        const cleanLabel = this.escapeXML(f.label.trim());
        const badgeW = Math.max(44, f.label.trim().length * 8.2 + 16);
        const badgeH = 22;
        elements +=
          '<g transform="translate(' + mid.x.toFixed(1) + ', ' + mid.y.toFixed(1) + ')" pointer-events="none">' +
          '<rect x="' + (-badgeW / 2).toFixed(1) + '" y="' + (-badgeH / 2).toFixed(1) + '" width="' + badgeW.toFixed(1) + '" height="' + badgeH + '" rx="5" fill="#0d1117" fill-opacity="0.9" stroke="' + f.color + '" stroke-width="1.2" />' +
          '<text x="0" y="4.5" fill="#e6edf3" font-family="monospace" font-size="12" font-weight="600" text-anchor="middle">' + cleanLabel + '</text>' +
          '</g>';
      }

      if (f.type === 'line-only') return;

      let payloadSVG = '';
      const sc = f.scale;

      if (f.type === 'custom' && f.customB64) {
        payloadSVG = '<image href="data:' + f.customMime + ';base64,' + f.customB64 + '" xlink:href="data:' + f.customMime + ';base64,' + f.customB64 + '" x="' + (-f.customW / 2) + '" y="' + (-f.customH / 2) + '" width="' + f.customW + '" height="' + f.customH + '" transform="scale(' + sc + ')" />';
      } else if (f.type === 'orb') {
        const glowFilter = f.glow > 0 ? ('filter="url(#flowBlur-' + f.id + ')"') : '';
        if (f.glow > 0) defs += '<filter id="flowBlur-' + f.id + '" filterUnits="userSpaceOnUse" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="' + (f.glow / 4).toFixed(2) + '" /></filter>';
        payloadSVG = '<circle r="' + (8 * sc).toFixed(2) + '" fill="' + f.color + '" />';
        if (f.glow > 0) payloadSVG += '<circle r="' + (12 * sc).toFixed(2) + '" fill="' + f.color + '" opacity="0.55" ' + glowFilter + ' />';
      } else if (f.type === 'packet') {
        payloadSVG = '<rect x="' + (-8 * sc).toFixed(2) + '" y="' + (-8 * sc).toFixed(2) + '" width="' + (16 * sc).toFixed(2) + '" height="' + (16 * sc).toFixed(2) + '" fill="' + f.color + '" rx="2" />';
      } else if (f.type === 'envelope') {
        payloadSVG = '<g transform="scale(' + sc + ')"><path d="M-12,-8 L12,-8 L12,8 L-12,8 Z M-12,-8 L0,2 L12,-8" fill="#0d1117" stroke="' + f.color + '" stroke-width="2" stroke-linejoin="round"/></g>';
      } else if (f.type === 'database') {
        payloadSVG = '<g transform="scale(' + sc + ')"><ellipse cx="0" cy="-6" rx="10" ry="4" fill="#0d1117" stroke="' + f.color + '" stroke-width="2"/><path d="M-10,-6 L-10,6 A10,4 0 0,0 10,6 L10,-6" fill="#0d1117" stroke="' + f.color + '" stroke-width="2"/><path d="M-10,0 A10,4 0 0,0 10,0" fill="none" stroke="' + f.color + '" stroke-width="2"/></g>';
      } else if (f.type === 'server') {
        payloadSVG = '<g transform="scale(' + sc + ')"><rect x="-10" y="-12" width="20" height="24" fill="#0d1117" stroke="' + f.color + '" stroke-width="2" rx="2"/><line x1="-10" y1="0" x2="10" y2="0" stroke="' + f.color + '" stroke-width="2"/><circle cx="-5" cy="-6" r="1.5" fill="' + f.color + '"/><circle cx="-5" cy="6" r="1.5" fill="' + f.color + '"/></g>';
      } else if (f.type === 'cloud') {
        payloadSVG = '<g transform="scale(' + sc + ')"><path d="M-4,4 A6,6 0 0,1 -6,-6 A7,7 0 0,1 6,-6 A5,5 0 0,1 4,4 Z" fill="#0d1117" stroke="' + f.color + '" stroke-width="2" stroke-linejoin="round"/></g>';
      } else if (f.type === 'lock') {
        payloadSVG = '<g transform="scale(' + sc + ')"><rect x="-7" y="-2" width="14" height="10" fill="#0d1117" stroke="' + f.color + '" stroke-width="2" rx="1"/><path d="M-4,-2 L-4,-6 A4,4 0 0,1 4,-6 L4,-2" fill="none" stroke="' + f.color + '" stroke-width="2"/></g>';
      } else if (f.type === 'warning') {
        payloadSVG = '<g transform="scale(' + sc + ')"><path d="M0,-12 L12,8 L-12,8 Z" fill="#0d1117" stroke="' + f.color + '" stroke-width="2" stroke-linejoin="round"/><line x1="0" y1="-4" x2="0" y2="2" stroke="' + f.color + '" stroke-width="2"/><circle cx="0" cy="5" r="1" fill="' + f.color + '"/></g>';
      }

      let visibilityControl = '';
      let setAnim = '';
      if (f.delay > 0) {
        visibilityControl = 'visibility="hidden"';
        setAnim = '<set attributeName="visibility" to="visible" begin="' + f.delay + 's" fill="freeze" />';
      }

      let motionAnim = '';
      let opAnim = '';
      const holdVal = f.hideOnDelay !== false ? '0' : f.opacity;

      if (f.endDelay > 0) {
        const fadeInEnd = (parseFloat(ratio) * 0.08).toFixed(4);
        const fadeOutStart = (parseFloat(ratio) * 0.92).toFixed(4);
        motionAnim = '<animateMotion calcMode="linear" keyPoints="0; 1; 1" keyTimes="0; ' + ratio + '; 1" dur="' + totalDur + 's" begin="' + f.delay + 's" repeatCount="indefinite" rotate="auto"><mpath href="#' + pathId + '" xlink:href="#' + pathId + '"/></animateMotion>';
        opAnim = '<animate attributeName="opacity" values="0; ' + f.opacity + '; ' + f.opacity + '; ' + holdVal + '; ' + holdVal + '" keyTimes="0; ' + fadeInEnd + '; ' + fadeOutStart + '; ' + ratio + '; 1" dur="' + totalDur + 's" begin="' + f.delay + 's" repeatCount="indefinite" />';
      } else {
        motionAnim = '<animateMotion calcMode="linear" keyPoints="0; 1" keyTimes="0; 1" dur="' + f.speed + 's" begin="' + f.delay + 's" repeatCount="indefinite" rotate="auto"><mpath href="#' + pathId + '" xlink:href="#' + pathId + '"/></animateMotion>';
        opAnim = '<animate attributeName="opacity" values="0; ' + f.opacity + '; ' + f.opacity + '; 0" keyTimes="0; 0.08; 0.92; 1" dur="' + f.speed + 's" begin="' + f.delay + 's" repeatCount="indefinite" />';
      }

      elements += '<g ' + visibilityControl + ' pointer-events="none">' + setAnim + '<g opacity="0">' + opAnim + motionAnim + payloadSVG + '</g></g>';
    });

    return svgString.replace('<!-- INJECT_CAMERA_RIG_ELEMENTS -->', '\n<defs>\n' + defs + '\n</defs>\n<g id="flows-layer">\n' + elements + '\n</g>\n<!-- INJECT_CAMERA_RIG_ELEMENTS -->');
  }
};