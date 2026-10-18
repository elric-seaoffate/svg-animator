window.DataFlows = {
  list: [],
  activeId: null,
  activeNodeIdx: 0,
  counter: 0,
  
  init() {
    document.getElementById('btnAddFlow')?.addEventListener('click', () => this.addFlow());
    document.getElementById('btnFlowAddNode')?.addEventListener('click', () => this.addNodeToActive());
    document.getElementById('btnFlowDelNode')?.addEventListener('click', () => this.dropNodeFromActive());
    
    const sliderNumEvents = ['opacity', 'glow', 'scale', 'speed', 'delay', 'endDelay', 'curvature'];
    sliderNumEvents.forEach(key => {
      const slider = document.getElementById(`flow${key.charAt(0).toUpperCase() + key.slice(1)}Slider`);
      const num = document.getElementById(`flow${key.charAt(0).toUpperCase() + key.slice(1)}Num`);
      if (slider && num) {
        slider.addEventListener('input', (e) => { num.value = e.target.value; this.updateActive(key, parseFloat(e.target.value)); });
        num.addEventListener('input', (e) => { slider.value = e.target.value; this.updateActive(key, parseFloat(e.target.value)); });
      }
    });

    ['type', 'color', 'showLine', 'hideOnDelay'].forEach(key => {
      let elId = `flow${key.charAt(0).toUpperCase() + key.slice(1)}`;
      if (key === 'color') elId += 'Picker';
      else if (key === 'type') elId += 'Select';
      
      const el = document.getElementById(elId);
      if(el) el.addEventListener('change', (e) => {
        this.updateActive(key, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
        if (key === 'type') {
          document.getElementById('customPayloadRow').style.display = e.target.value === 'custom' ? 'block' : 'none';
        }
      });
    });

    document.getElementById('flowNodeSlider')?.addEventListener('input', (e) => {
      this.activeNodeIdx = parseInt(e.target.value);
      document.getElementById('flowNodeNum').value = this.activeNodeIdx;
      this.updateUIOverlay();
    });

    document.getElementById('customPayloadInput')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        const img = new Image();
        img.onload = () => {
          if (this.activeId !== null) {
            const f = this.list.find(flow => flow.id === this.activeId);
            if (f) {
              f.customB64 = dataUrl.split(',')[1];
              f.customMime = file.type;
              f.customW = img.naturalWidth;
              f.customH = img.naturalHeight;
              this.triggerAppRender();
            }
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  },

  addFlow() {
    this.counter++;
    const newFlow = {
      id: this.counter, nodes: [{x: 20, y: 50}, {x: 80, y: 50}], 
      type: 'orb', color: '#00ffcc', showLine: true, curvature: 0,
      opacity: 1.0, glow: 20, scale: 1.0, speed: 2.0, delay: 0.0, endDelay: 0.0, hideOnDelay: true,
      customB64: null, customMime: null
    };
    this.list.push(newFlow);
    this.selectFlow(newFlow.id);
  },

  addNodeToActive() {
    const f = this.list.find(flow => flow.id === this.activeId);
    if (!f) return;
    const lastNode = f.nodes[f.nodes.length - 1];
    f.nodes.push({x: lastNode.x + 5, y: lastNode.y + 5});
    this.activeNodeIdx = f.nodes.length - 1;
    this.refreshNodeSlider(f);
    this.updateUIOverlay();
    this.triggerAppRender();
  },

  dropNodeFromActive() {
    const f = this.list.find(flow => flow.id === this.activeId);
    if (!f || f.nodes.length <= 2) { alert("A flow must have at least 2 waypoints (Start and End)."); return; }
    f.nodes.splice(this.activeNodeIdx, 1);
    this.activeNodeIdx = Math.max(0, this.activeNodeIdx - 1);
    this.refreshNodeSlider(f);
    this.updateUIOverlay();
    this.triggerAppRender();
  },

  refreshNodeSlider(f) {
    const slider = document.getElementById('flowNodeSlider');
    const num = document.getElementById('flowNodeNum');
    if (slider && num) { slider.max = f.nodes.length - 1; slider.value = this.activeNodeIdx; num.value = this.activeNodeIdx; }
  },

  selectFlow(id) {
    if (window.Glows) window.Glows.deselectGlow(); 
    if (window.Ripples) window.Ripples.deselectRipple();
    this.activeId = id;
    this.activeNodeIdx = 0;
    this.renderList();
    document.body.classList.add('editing-flow'); 
    
    const f = this.list.find(flow => flow.id === id);
    if (f) {
      document.getElementById('flowEditor').style.display = 'block';
      document.getElementById('editingFlowLabel').innerText = `Editing Data Flow ${id}`;
      document.getElementById('flowTypeSelect').value = f.type || 'orb';
      document.getElementById('flowColorPicker').value = f.color;
      document.getElementById('flowShowLine').checked = f.showLine;
      document.getElementById('flowHideOnDelay').checked = f.hideOnDelay !== false;
      document.getElementById('customPayloadRow').style.display = f.type === 'custom' ? 'block' : 'none';
      this.refreshNodeSlider(f);
      ['opacity', 'glow', 'scale', 'speed', 'delay', 'endDelay', 'curvature'].forEach(key => {
        const val = f[key] !== undefined ? f[key] : (key === 'curvature' ? 0 : 1);
        const sl = document.getElementById(`flow${key.charAt(0).toUpperCase() + key.slice(1)}Slider`);
        const nu = document.getElementById(`flow${key.charAt(0).toUpperCase() + key.slice(1)}Num`);
        if(sl) sl.value = val; if(nu) nu.value = val;
      });
      this.updateUIOverlay();
    }
  },

  deselectFlow() {
    this.activeId = null;
    this.renderList();
    document.body.classList.remove('editing-flow');
    const editor = document.getElementById('flowEditor');
    if(editor) editor.style.display = 'none';
    const ret = document.getElementById('dynamicFlowReticles');
    if(ret) ret.innerHTML = '';
    const path = document.getElementById('flowCurvePath');
    if(path) path.style.display = 'none';
  },

  updateActive(key, value) {
    if (this.activeId === null) return;
    const f = this.list.find(flow => flow.id === this.activeId);
    if (f) { f[key] = value; this.renderList(); this.triggerAppRender(); this.updateUIOverlay(); }
  },

  handleStageClick(x, y) {
    if (this.activeId === null) return false;
    const f = this.list.find(flow => flow.id === this.activeId);
    if (f && f.nodes[this.activeNodeIdx]) {
      f.nodes[this.activeNodeIdx].x = x; f.nodes[this.activeNodeIdx].y = y;
      this.updateUIOverlay(); this.triggerAppRender(); return true;
    }
    return false;
  },

  generatePathString(nodes, curvature, width, height) {
    if (nodes.length < 2) return '';
    const px = (pct) => (pct / 100) * width;
    const py = (pct) => (pct / 100) * height;

    if (curvature === 0) {
      return `M ${px(nodes[0].x)},${py(nodes[0].y)} ` + nodes.slice(1).map(n => `L ${px(n.x)},${py(n.y)}`).join(' ');
    }

    if (nodes.length === 2) {
      const p1 = nodes[0]; const p2 = nodes[1];
      const dx = px(p2.x) - px(p1.x); const dy = py(p2.y) - py(p1.y);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / dist; const ny = dx / dist;
      const bend = (curvature / 100) * (dist * 0.4); 
      const cx = (px(p1.x) + px(p2.x)) / 2 + nx * bend;
      const cy = (py(p1.y) + py(p2.y)) / 2 + ny * bend;
      return `M ${px(p1.x)},${py(p1.y)} Q ${cx},${cy} ${px(p2.x)},${py(p2.y)}`;
    }

    let d = `M ${px(nodes[0].x)},${py(nodes[0].y)}`;
    const t = (curvature / 100) * 0.3; 
    for (let i = 0; i < nodes.length - 1; i++) {
      const p0 = i === 0 ? nodes[0] : nodes[i - 1];
      const p1 = nodes[i]; const p2 = nodes[i + 1]; const p3 = i + 2 < nodes.length ? nodes[i + 2] : p2;
      const cp1x = px(p1.x) + (px(p2.x) - px(p0.x)) * t;
      const cp1y = py(p1.y) + (py(p2.y) - py(p0.y)) * t;
      const cp2x = px(p2.x) - (px(p3.x) - px(p1.x)) * t;
      const cp2y = py(p2.y) - (py(p3.y) - py(p1.y)) * t;
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${px(p2.x)},${py(p2.y)}`;
    }
    return d;
  },

  updateUIOverlay() {
    const f = this.list.find(flow => flow.id === this.activeId);
    const container = document.getElementById('dynamicFlowReticles');
    const pathEl = document.getElementById('flowCurvePath');
    if (!f || !container || !pathEl) return;
    
    const svgBox = document.getElementById('svgContainer')?.getBoundingClientRect();
    const w = svgBox ? svgBox.width : 800; const h = svgBox ? svgBox.height : 600;

    if (f.nodes.length >= 2) {
      pathEl.style.display = 'block';
      pathEl.setAttribute('d', this.generatePathString(f.nodes, f.curvature, w, h));
      pathEl.setAttribute('stroke', f.color);
    } else {
      pathEl.style.display = 'none';
    }

    let html = '';
    f.nodes.forEach((node, idx) => {
      const isActive = idx === this.activeNodeIdx;
      html += `<div class="reticle ${isActive ? 'active-reticle' : ''}" 
                    style="left:${node.x}%; top:${node.y}%; 
                           background:${isActive ? f.color.replace(')', ', 0.3)').replace('rgb', 'rgba') : 'rgba(0,0,0,0.5)'}; 
                           border-color:${f.color}; z-index: ${isActive ? 12 : 11}; cursor: pointer;"
                    onclick="window.DataFlows.activeNodeIdx = ${idx}; window.DataFlows.refreshNodeSlider(window.DataFlows.list.find(fl => fl.id === ${f.id})); window.DataFlows.updateUIOverlay(); event.stopPropagation();">
                    N${idx}
               </div>`;
    });
    container.innerHTML = html;
  },

  removeFlow(id) {
    this.list = this.list.filter(f => f.id !== id);
    if (this.activeId === id) this.deselectFlow(); else this.renderList();
    this.triggerAppRender();
  },

  renderList() {
    const container = document.getElementById('flowListContainer');
    if (this.list.length === 0) { container.innerHTML = '<div class="stage-hint" id="emptyFlowHint">No flows active.</div>'; return; }
    container.innerHTML = '';
    this.list.forEach(f => {
      const div = document.createElement('div');
      div.className = 'flow-list-item' + (this.activeId === f.id ? ' selected' : '');
      div.style.borderLeftColor = f.color;
      div.innerHTML = `<span>Flow ${f.id} [${f.nodes.length} Nodes]</span><button style="background:transparent; border:none; color:#ff4444; font-weight:bold; cursor:pointer;" onclick="window.DataFlows.removeFlow(${f.id}); event.stopPropagation();">X</button>`;
      div.onclick = () => this.selectFlow(f.id);
      container.appendChild(div);
    });
  },

  triggerAppRender() { document.getElementById('durationSlider')?.dispatchEvent(new Event('input')); },

  injectIntoSVG(svgString, stateOrWidth, heightArg) {
    if (this.list.length === 0) return svgString;
    let width, height;
    if (stateOrWidth && stateOrWidth.image) { width = stateOrWidth.image.width; height = stateOrWidth.image.height; } 
    else { width = stateOrWidth; height = heightArg; }
    
    let defs = ''; let elements = '';

    this.list.forEach(f => {
      const pathD = this.generatePathString(f.nodes, f.curvature || 0, width, height);
      if (!pathD) return;

      const pathId = `flowPath-${f.id}`;
      const totalDur = f.speed + (f.endDelay || 0);
      const ratio = f.endDelay > 0 ? (f.speed / totalDur).toFixed(4) : "1";
      
      if (f.showLine) {
        elements += `<path id="${pathId}" d="${pathD}" fill="none" stroke="${f.color}" stroke-width="${Math.max(1, 3 * f.scale)}" stroke-dasharray="8,6" opacity="0.6" />`;
      } else {
        elements += `<path id="${pathId}" d="${pathD}" fill="none" stroke="none" />`;
      }

      if (f.type === 'line-only') return;

      let payloadSVG = '';
      const sc = f.scale;
      
      if (f.type === 'custom' && f.customB64) {
        payloadSVG = `<image xlink:href="data:${f.customMime};base64,${f.customB64}" x="${-f.customW/2}" y="${-f.customH/2}" width="${f.customW}" height="${f.customH}" transform="scale(${sc})" style="will-change: transform;" />`;
      } else if (f.type === 'orb') {
        const glowFilter = f.glow > 0 ? `filter="url(#flowBlur-${f.id})"` : '';
        if (f.glow > 0) defs += `<filter id="flowBlur-${f.id}"><feGaussianBlur stdDeviation="${f.glow / 4}" /></filter>`;
        payloadSVG = `<circle r="${8 * sc}" fill="${f.color}" />`;
        if (f.glow > 0) payloadSVG += `<circle r="${12 * sc}" fill="${f.color}" opacity="0.5" ${glowFilter} />`;
      } else if (f.type === 'packet') {
        payloadSVG = `<rect x="${-8 * sc}" y="${-8 * sc}" width="${16 * sc}" height="${16 * sc}" fill="${f.color}" rx="2" />`;
      } else if (f.type === 'envelope') {
        payloadSVG = `<g transform="scale(${sc})"><path d="M-12,-8 L12,-8 L12,8 L-12,8 Z M-12,-8 L0,2 L12,-8" fill="none" stroke="${f.color}" stroke-width="2" stroke-linejoin="round"/></g>`;
      } else if (f.type === 'database') {
        payloadSVG = `<g transform="scale(${sc})"><ellipse cx="0" cy="-6" rx="10" ry="4" fill="none" stroke="${f.color}" stroke-width="2"/><path d="M-10,-6 L-10,6 A10,4 0 0,0 10,6 L10,-6" fill="none" stroke="${f.color}" stroke-width="2"/><path d="M-10,0 A10,4 0 0,0 10,0" fill="none" stroke="${f.color}" stroke-width="2"/></g>`;
      } else if (f.type === 'server') {
        payloadSVG = `<g transform="scale(${sc})"><rect x="-10" y="-12" width="20" height="24" fill="none" stroke="${f.color}" stroke-width="2" rx="2"/><line x1="-10" y1="0" x2="10" y2="0" stroke="${f.color}" stroke-width="2"/><circle cx="-5" cy="-6" r="1.5" fill="${f.color}"/><circle cx="-5" cy="6" r="1.5" fill="${f.color}"/></g>`;
      } else if (f.type === 'cloud') {
        payloadSVG = `<g transform="scale(${sc})"><path d="M-4,4 A6,6 0 0,1 -6,-6 A7,7 0 0,1 6,-6 A5,5 0 0,1 4,4 Z" fill="none" stroke="${f.color}" stroke-width="2" stroke-linejoin="round"/></g>`;
      } else if (f.type === 'lock') {
        payloadSVG = `<g transform="scale(${sc})"><rect x="-7" y="-2" width="14" height="10" fill="none" stroke="${f.color}" stroke-width="2" rx="1"/><path d="M-4,-2 L-4,-6 A4,4 0 0,1 4,-6 L4,-2" fill="none" stroke="${f.color}" stroke-width="2"/></g>`;
      } else if (f.type === 'warning') {
        payloadSVG = `<g transform="scale(${sc})"><path d="M0,-12 L12,8 L-12,8 Z" fill="none" stroke="${f.color}" stroke-width="2" stroke-linejoin="round"/><line x1="0" y1="-4" x2="0" y2="2" stroke="${f.color}" stroke-width="2"/><circle cx="0" cy="5" r="1" fill="${f.color}"/></g>`;
      }

      let visibilityControl = ''; let setAnim = '';
      if (f.delay > 0) { visibilityControl = `visibility="hidden"`; setAnim = `<set attributeName="visibility" to="visible" begin="${f.delay}s" fill="freeze" />`; }

      let motionAnim = ''; let opAnim = '';
      const holdVal = f.hideOnDelay !== false ? '0' : f.opacity;

      if (f.endDelay > 0) {
        motionAnim = `<animateMotion calcMode="linear" keyPoints="0; 1; 1" keyTimes="0; ${ratio}; 1" dur="${totalDur}s" begin="${f.delay}s" repeatCount="indefinite" rotate="auto"><mpath xlink:href="#${pathId}"/></animateMotion>`;
        opAnim = `<animate attributeName="opacity" values="0; ${f.opacity}; ${f.opacity}; ${holdVal}" keyTimes="0; 0.05; ${ratio}; 1" dur="${totalDur}s" begin="${f.delay}s" repeatCount="indefinite" />`;
      } else {
        motionAnim = `<animateMotion calcMode="linear" keyPoints="0; 1" keyTimes="0; 1" dur="${f.speed}s" begin="${f.delay}s" repeatCount="indefinite" rotate="auto"><mpath xlink:href="#${pathId}"/></animateMotion>`;
        opAnim = `<animate attributeName="opacity" values="0; ${f.opacity}; 0" keyTimes="0; 0.5; 1" dur="${f.speed}s" begin="${f.delay}s" repeatCount="indefinite" />`;
      }

      elements += `<g ${visibilityControl}>${setAnim}<g opacity="0" style="will-change: transform, opacity;">${opAnim}${motionAnim}${payloadSVG}</g></g>`;
    });
    
    return svgString.replace('<!-- INJECT_CAMERA_RIG_ELEMENTS -->', `\n<defs>\n${defs}\n</defs>\n<g id="flows-layer">\n${elements}\n</g>\n<!-- INJECT_CAMERA_RIG_ELEMENTS -->`);
  }
};