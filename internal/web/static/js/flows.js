window.DataFlows = {
  list: [],
  activeId: null,
  counter: 0,
  activeNodeIndex: 0,
  
  init() {
    document.getElementById('btnAddFlow').addEventListener('click', () => this.addFlow());
    
    ['type', 'color', 'showLine', 'hideOnDelay'].forEach(key => {
      let elId = `flow${key.charAt(0).toUpperCase() + key.slice(1)}`;
      if (key === 'color') elId += 'Picker';
      else if (key === 'type') elId += 'Select';
      
      const el = document.getElementById(elId);
      if(el) el.addEventListener('change', (e) => {
        this.updateActive(key, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
        if (key === 'type') document.getElementById('customPayloadRow').style.display = e.target.value === 'custom' ? 'block' : 'none';
      });
    });

    ['scale', 'speed', 'delay', 'glow', 'opacity', 'endDelay'].forEach(key => {
      const slider = document.getElementById(`flow${key.charAt(0).toUpperCase() + key.slice(1)}Slider`);
      const num = document.getElementById(`flow${key.charAt(0).toUpperCase() + key.slice(1)}Num`);
      if(slider && num) {
        slider.addEventListener('input', (e) => { num.value = e.target.value; this.updateActive(key, parseFloat(e.target.value)); });
        num.addEventListener('input', (e) => { slider.value = e.target.value; this.updateActive(key, parseFloat(e.target.value)); });
      }
    });

    document.getElementById('customPayloadInput')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = e.target.result;
        const img = new Image();
        img.onload = () => {
          if (this.activeId !== null) {
            const flow = this.list.find(f => f.id === this.activeId);
            if (flow) {
              flow.customB64 = dataUrl.split(',')[1];
              flow.customMime = file.type;
              flow.customW = img.naturalWidth;
              flow.customH = img.naturalHeight;
              this.triggerAppRender();
            }
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('btnFlowAddNode')?.addEventListener('click', () => {
      const flow = this.list.find(f => f.id === this.activeId);
      if(!flow) return;
      const last = flow.nodes[flow.nodes.length-1];
      flow.nodes.push({x: last.x + 5, y: last.y}); 
      this.setNode(flow.nodes.length - 1);
      this.updateUIOverlay(flow);
      this.triggerAppRender();
    });

    document.getElementById('btnFlowDelNode')?.addEventListener('click', () => {
      const flow = this.list.find(f => f.id === this.activeId);
      if(!flow || flow.nodes.length <= 2) return; 
      flow.nodes.pop();
      this.setNode(flow.nodes.length - 1);
      this.updateUIOverlay(flow);
      this.triggerAppRender();
    });

    const nodeSlider = document.getElementById('flowNodeSlider');
    const nodeNum = document.getElementById('flowNodeNum');
    if (nodeSlider && nodeNum) {
      nodeSlider.addEventListener('input', (e) => { this.setNode(parseInt(e.target.value)); });
      nodeNum.addEventListener('input', (e) => { this.setNode(parseInt(e.target.value)); });
    }
  },

  setNode(index) {
    const flow = this.list.find(f => f.id === this.activeId);
    if(!flow) return;
    if(index < 0) index = 0;
    if(index >= flow.nodes.length) index = flow.nodes.length - 1;
    
    this.activeNodeIndex = index;
    const slider = document.getElementById('flowNodeSlider');
    const num = document.getElementById('flowNodeNum');
    if(slider) { slider.max = flow.nodes.length - 1; slider.value = index; }
    if(num) { num.value = index; }
    
    this.updateUIOverlay(flow);
  },

  addFlow() {
    this.counter++;
    const newFlow = {
      id: this.counter, type: 'orb', color: '#00ffcc', showLine: true, hideOnDelay: true,
      scale: 1.0, speed: 2.0, delay: 0.0, endDelay: 0.0, opacity: 1.0, glow: 0,
      nodes: [{x: 20, y: 50}, {x: 80, y: 50}] 
    };
    this.list.push(newFlow);
    this.selectFlow(newFlow.id);
  },

  selectFlow(id) {
    if (window.Glows) window.Glows.deselectGlow(); 
    
    this.activeId = id;
    this.renderList();
    document.body.classList.add('editing-flow'); 
    
    const flow = this.list.find(f => f.id === id);
    if (flow) {
      document.getElementById('flowEditor').style.display = 'block';
      document.getElementById('editingFlowLabel').innerText = `Editing Flow ${id}`;
      document.getElementById('flowTypeSelect').value = flow.type;
      document.getElementById('customPayloadRow').style.display = flow.type === 'custom' ? 'block' : 'none';
      document.getElementById('flowColorPicker').value = flow.color;
      
      document.getElementById('flowShowLine').checked = flow.showLine;
      document.getElementById('flowHideOnDelay').checked = flow.hideOnDelay !== false;
      
      document.getElementById('flowOpacitySlider').value = flow.opacity !== undefined ? flow.opacity : 1.0;
      document.getElementById('flowOpacityNum').value = flow.opacity !== undefined ? flow.opacity : 1.0;
      
      document.getElementById('flowScaleSlider').value = flow.scale || 1.0; document.getElementById('flowScaleNum').value = flow.scale || 1.0;
      document.getElementById('flowGlowSlider').value = flow.glow || 0; document.getElementById('flowGlowNum').value = flow.glow || 0;
      document.getElementById('flowSpeedSlider').value = flow.speed; document.getElementById('flowSpeedNum').value = flow.speed;
      document.getElementById('flowDelaySlider').value = flow.delay; document.getElementById('flowDelayNum').value = flow.delay;
      
      document.getElementById('flowEndDelaySlider').value = flow.endDelay !== undefined ? flow.endDelay : 0.0;
      document.getElementById('flowEndDelayNum').value = flow.endDelay !== undefined ? flow.endDelay : 0.0;
      
      document.getElementById('flowCurvePath').style.display = 'block';
      
      this.setNode(0);
      this.updateUIOverlay(flow);
    }
  },

  deselectFlow() {
    this.activeId = null;
    this.renderList();
    document.body.classList.remove('editing-flow');
    const editor = document.getElementById('flowEditor');
    if(editor) editor.style.display = 'none';
    
    document.getElementById('dynamicFlowReticles').innerHTML = '';
    const curve = document.getElementById('flowCurvePath');
    if(curve) curve.style.display = 'none';
  },

  updateActive(key, value) {
    if (this.activeId === null) return;
    const flow = this.list.find(f => f.id === this.activeId);
    if (flow) {
      flow[key] = value;
      this.renderList(); this.triggerAppRender();
      if(key === 'color' || key === 'showLine') this.updateUIOverlay(flow);
    }
  },

  handleStageClick(x, y) {
    if (this.activeId === null) return false;
    const flow = this.list.find(f => f.id === this.activeId);
    if (flow) {
      flow.nodes[this.activeNodeIndex].x = x;
      flow.nodes[this.activeNodeIndex].y = y;
      this.updateUIOverlay(flow);
      this.triggerAppRender();
      return true;
    }
    return false;
  },

  updateUIOverlay(flow) {
    const container = document.getElementById('dynamicFlowReticles');
    if (!container) return;
    
    container.innerHTML = '';
    flow.nodes.forEach((n, i) => {
      const ret = document.createElement('div');
      ret.className = 'reticle ' + (i === this.activeNodeIndex ? 'active-reticle' : '');
      ret.style.left = `${n.x}%`;
      ret.style.top = `${n.y}%`;
      ret.style.pointerEvents = 'auto'; 
      ret.style.zIndex = '12';
      
      if (i === 0) { ret.style.borderColor = '#00ffcc'; ret.style.background = 'rgba(0,255,204,0.3)'; ret.innerText = 'IN'; }
      else if (i === flow.nodes.length - 1) { ret.style.borderColor = '#ff00cc'; ret.style.background = 'rgba(255,0,204,0.3)'; ret.innerText = 'OUT'; }
      else { ret.style.borderColor = '#ffa500'; ret.style.background = 'rgba(255,165,0,0.3)'; ret.innerText = i; }
      
      ret.onclick = (e) => { e.stopPropagation(); this.setNode(i); };
      container.appendChild(ret);
    });
    
    const p = document.getElementById('flowCurvePath');
    if(p) {
      const d = flow.nodes.map((n, i) => (i===0?'M':'L') + n.x + '% ' + n.y + '%').join(' ');
      p.setAttribute('d', d);
      p.setAttribute('stroke', flow.color);
      p.style.opacity = flow.showLine ? '1' : '0.3'; 
    }
  },

  removeFlow(id) {
    this.list = this.list.filter(f => f.id !== id);
    if (this.activeId === id) this.deselectFlow(); else this.renderList();
    this.triggerAppRender();
  },

  renderList() {
    const container = document.getElementById('flowListContainer');
    if(!container) return;
    if (this.list.length === 0) {
      container.innerHTML = '<div class="stage-hint" id="emptyFlowHint">No flows active.</div>';
      return;
    }
    container.innerHTML = '';
    this.list.forEach(flow => {
      const div = document.createElement('div');
      div.className = 'flow-list-item' + (this.activeId === flow.id ? ' selected' : '');
      div.style.borderLeftColor = flow.color;
      div.innerHTML = `<span>Flow ${flow.id} (${flow.type}) [${flow.nodes.length} nodes]</span><button style="background:transparent; border:none; color:#ff4444; font-weight:bold; cursor:pointer;" onclick="window.DataFlows.removeFlow(${flow.id}); event.stopPropagation();">X</button>`;
      div.onclick = () => this.selectFlow(flow.id);
      container.appendChild(div);
    });
  },

  triggerAppRender() { document.getElementById('durationSlider')?.dispatchEvent(new Event('input')); },

  injectIntoSVG(svgString, width, height) {
    if (this.list.length === 0) return svgString;
    
    let defs = `
      <g id="payload-envelope"><rect x="-10" y="-7" width="20" height="14" fill="#fff" rx="2" /><polyline points="-10,-7 0,2 10,-7" fill="none" stroke="#222" stroke-width="1.5" /></g>
      <g id="payload-packet"><rect x="-8" y="-8" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" rx="2"/><text x="0" y="3" fill="#fff" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">01</text></g>
      <g id="payload-database"><path d="M-10,-5 C-10,-10 10,-10 10,-5 L10,5 C10,10 -10,10 -10,5 Z" fill="#fff"/><path d="M-10,-5 C-10,0 10,0 10,-5" fill="none" stroke="#222" stroke-width="1.5"/><line x1="-10" y1="0" x2="10" y2="0" stroke="#222" stroke-width="1.5"/></g>
      <g id="payload-server"><rect x="-7" y="-12" width="14" height="24" fill="#fff" rx="2"/><line x1="-4" y1="-8" x2="4" y2="-8" stroke="#222" stroke-width="2"/><line x1="-4" y1="0" x2="4" y2="0" stroke="#222" stroke-width="2"/><circle cx="0" cy="8" r="1.5" fill="#222"/></g>
      <g id="payload-cloud"><path d="M-4,4 C-8,4 -10,0 -8,-3 C-8,-6 -4,-8 -1,-6 C1,-10 7,-8 8,-4 C12,-3 10,4 5,4 Z" fill="#fff"/></g>
      <g id="payload-lock"><rect x="-6" y="-2" width="12" height="10" fill="#fff" rx="1"/><path d="M-4,-2 L-4,-5 C-4,-8 4,-8 4,-5 L4,-2" fill="none" stroke="#fff" stroke-width="2"/></g>
      <g id="payload-warning"><polygon points="0,-10 10,8 -10,8" fill="#ff4444" stroke="#fff" stroke-width="1"/><text x="0" y="5" fill="#fff" font-family="sans-serif" font-size="10" text-anchor="middle" font-weight="bold">!</text></g>
    `;

    let elements = '';
    this.list.forEach(flow => {
      const pathId = `path-${flow.id}`;
      
      const pathD = flow.nodes.map((n, i) => {
        const px = (n.x / 100) * width;
        const py = (n.y / 100) * height;
        return (i === 0 ? 'M' : 'L') + ` ${px} ${py}`;
      }).join(' ');
      
      const strokeStr = flow.showLine ? `stroke="${flow.color}" stroke-width="3" stroke-dasharray="8,8"` : `stroke="none"`;
      const opStr = flow.opacity !== undefined ? flow.opacity : 1.0;
      
      const endDelay = flow.endDelay || 0;
      const totalDur = flow.speed + endDelay;
      let pathAnim = '';
      let motionAnim = '';
      let payloadOpacityAnim = '';
      
      if (endDelay > 0) {
        const ratio = (flow.speed / totalDur).toFixed(4);
        pathAnim = `<animate attributeName="stroke-dashoffset" values="32;0;0" keyTimes="0;${ratio};1" dur="${totalDur}s" begin="${flow.delay}s" repeatCount="indefinite" />`;
        motionAnim = `<animateMotion dur="${totalDur}s" begin="${flow.delay}s" repeatCount="indefinite" rotate="auto" keyPoints="0;1;1" keyTimes="0;${ratio};1" calcMode="linear"><mpath href="#${pathId}" /></animateMotion>`;
        
        if (flow.hideOnDelay !== false) {
          const ratioHide = Math.min((flow.speed / totalDur) + 0.001, 1).toFixed(4);
          payloadOpacityAnim = `<animate attributeName="opacity" values="${opStr}; ${opStr}; 0; 0" keyTimes="0; ${ratio}; ${ratioHide}; 1" dur="${totalDur}s" begin="${flow.delay}s" repeatCount="indefinite" />`;
        }
      } else {
        pathAnim = `<animate attributeName="stroke-dashoffset" from="32" to="0" dur="${flow.speed}s" begin="${flow.delay}s" repeatCount="indefinite" />`;
        motionAnim = `<animateMotion dur="${flow.speed}s" begin="${flow.delay}s" repeatCount="indefinite" rotate="auto"><mpath href="#${pathId}" /></animateMotion>`;
      }
      
      elements += `<path id="${pathId}" d="${pathD}" ${strokeStr} stroke-linejoin="round" opacity="${opStr}" fill="none">${pathAnim}</path>`;
      
      if (flow.type === 'line-only') return;

      let payloadContent = '';
      const scale = flow.scale || 1.0;
      const glowR = flow.glow || 0;
      
      if (glowR > 0) {
        const glowId = `flowGlowGrad-${flow.id}`;
        defs += `<radialGradient id="${glowId}"><stop offset="20%" stop-color="${flow.color}" stop-opacity="1" /><stop offset="100%" stop-color="${flow.color}" stop-opacity="0" /></radialGradient>`;
        payloadContent += `<circle cx="0" cy="0" r="${glowR}" fill="url(#${glowId})" />`;
      }

      if (flow.type === 'custom' && flow.customB64) {
        const w = flow.customW; const h = flow.customH;
        payloadContent += `<image href="data:${flow.customMime};base64,${flow.customB64}" x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" />`;
      } else if (flow.type === 'orb') {
        payloadContent += `<circle r="6" fill="${flow.color}" />`;
        if (endDelay > 0) {
           motionAnim = motionAnim.replace('rotate="auto"', ''); 
        }
      } else {
        payloadContent += `<use href="#payload-${flow.type}" />`;
      }

      let visibilityControl = '';
      let setAnim = '';
      if (flow.delay > 0) {
        visibilityControl = `visibility="hidden"`;
        setAnim = `<set attributeName="visibility" to="visible" begin="${flow.delay}s" fill="freeze" />`;
      }

      elements += `
        <g ${visibilityControl} opacity="${opStr}">
          ${setAnim}
          ${payloadOpacityAnim}
          ${motionAnim}
          <g transform="scale(${scale})">
            ${payloadContent}
          </g>
        </g>`;
    });
    
    return svgString.replace('<!-- INJECT_CAMERA_RIG_ELEMENTS -->', `\n<defs>\n${defs}\n</defs>\n<g id="data-flows-layer">\n${elements}\n</g>\n<!-- INJECT_CAMERA_RIG_ELEMENTS -->`);
  }
};