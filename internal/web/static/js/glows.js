window.Glows = {
  list: [],
  activeId: null,
  counter: 0,
  
  init() {
    document.getElementById('btnAddGlow').addEventListener('click', () => this.addGlow());
    
    ['playback', 'color', 'shape', 'hideOnDelay'].forEach(key => {
      let elId = `glow${key.charAt(0).toUpperCase() + key.slice(1)}`;
      if (key === 'color') elId += 'Picker';
      else if (key === 'shape' || key === 'playback') elId += 'Select';
      
      const el = document.getElementById(elId);
      if(el) el.addEventListener('change', (e) => {
        this.updateActive(key, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
        if (key === 'shape') {
          document.getElementById('glowCustomRow').style.display = e.target.value === 'custom' ? 'block' : 'none';
          document.getElementById('glowColorRow').style.display = e.target.value === 'custom' ? 'none' : 'flex';
          document.getElementById('glowSizeContainer').style.display = e.target.value === 'custom' ? 'none' : 'block';
          document.getElementById('glowScaleContainer').style.display = e.target.value === 'custom' ? 'block' : 'none';
          document.getElementById('glowRadarContainer').style.display = e.target.value === 'radar' ? 'block' : 'none';
        }
      });
    });

    document.getElementById('glowCustomInput')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        const img = new Image();
        img.onload = () => {
          if (this.activeId !== null) {
            const glow = this.list.find(g => g.id === this.activeId);
            if (glow) {
              glow.customB64 = dataUrl.split(',')[1];
              glow.customMime = file.type;
              glow.customW = img.naturalWidth;
              glow.customH = img.naturalHeight;
              this.triggerAppRender();
            }
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });

    ['size', 'dur', 'delay', 'opacity', 'blur', 'scale', 'endDelay', 'thick', 'coreR', 'rings'].forEach(key => {
      const slider = document.getElementById(`glow${key.charAt(0).toUpperCase() + key.slice(1)}Slider`);
      const num = document.getElementById(`glow${key.charAt(0).toUpperCase() + key.slice(1)}Num`);
      if (slider && num) {
        slider.addEventListener('input', (e) => { num.value = e.target.value; this.updateActive(key, parseFloat(e.target.value)); });
        num.addEventListener('input', (e) => { slider.value = e.target.value; this.updateActive(key, parseFloat(e.target.value)); });
      }
    });
  },

  addGlow() {
    this.counter++;
    const newGlow = {
      id: this.counter, shape: 'circle', color: '#ff0044', playback: 'pingpong', hideOnDelay: true,
      size: 25, scale: 1.0, blur: 50, dur: 2.0, delay: 0.0, endDelay: 0.0, opacity: 1.0,
      thick: 2, coreR: 5, rings: 1, x: 50, y: 50
    };
    this.list.push(newGlow);
    this.selectGlow(newGlow.id);
  },

  selectGlow(id) {
    if (window.DataFlows) window.DataFlows.deselectFlow(); 
    this.activeId = id;
    this.renderList();
    document.body.classList.add('editing-flow'); 
    
    const glow = this.list.find(g => g.id === id);
    if (glow) {
      document.getElementById('glowEditor').style.display = 'block';
      document.getElementById('editingGlowLabel').innerText = `Editing Glow ${id}`;
      document.getElementById('glowShapeSelect').value = glow.shape || 'circle';
      document.getElementById('glowPlaybackSelect').value = glow.playback;
      document.getElementById('glowColorPicker').value = glow.color;
      document.getElementById('glowHideOnDelay').checked = glow.hideOnDelay !== false;
      
      document.getElementById('glowCustomRow').style.display = glow.shape === 'custom' ? 'block' : 'none';
      document.getElementById('glowColorRow').style.display = glow.shape === 'custom' ? 'none' : 'flex';
      document.getElementById('glowSizeContainer').style.display = glow.shape === 'custom' ? 'none' : 'block';
      document.getElementById('glowScaleContainer').style.display = glow.shape === 'custom' ? 'block' : 'none';
      document.getElementById('glowRadarContainer').style.display = glow.shape === 'radar' ? 'block' : 'none';
      
      ['opacity', 'blur', 'scale', 'size', 'dur', 'delay', 'endDelay', 'thick', 'coreR', 'rings'].forEach(key => {
        const val = glow[key] !== undefined ? glow[key] : (key === 'opacity' || key === 'scale' ? 1.0 : (key === 'size' ? 25 : 0));
        const sl = document.getElementById(`glow${key.charAt(0).toUpperCase() + key.slice(1)}Slider`);
        const nu = document.getElementById(`glow${key.charAt(0).toUpperCase() + key.slice(1)}Num`);
        if(sl) sl.value = val; if(nu) nu.value = val;
      });
      
      this.updateUIOverlay(glow);
      document.getElementById('glowReticleTarget').style.display = 'flex';
    }
  },

  deselectGlow() {
    this.activeId = null;
    this.renderList();
    document.body.classList.remove('editing-flow');
    const editor = document.getElementById('glowEditor');
    if(editor) editor.style.display = 'none';
    const ret = document.getElementById('glowReticleTarget');
    if(ret) ret.style.display = 'none';
  },

  updateActive(key, value) {
    if (this.activeId === null) return;
    const glow = this.list.find(g => g.id === this.activeId);
    if (glow) { glow[key] = value; this.renderList(); this.triggerAppRender(); if(key === 'color' || key === 'shape') this.updateUIOverlay(glow); }
  },

  handleStageClick(x, y) {
    if (this.activeId === null) return false;
    const glow = this.list.find(g => g.id === this.activeId);
    if (glow) { glow.x = x; glow.y = y; this.updateUIOverlay(glow); this.triggerAppRender(); return true; }
    return false;
  },

  updateUIOverlay(glow) {
    const ret = document.getElementById('glowReticleTarget');
    if(ret) {
      ret.style.left = `${glow.x}%`; ret.style.top = `${glow.y}%`;
      ret.style.borderColor = glow.color;
      ret.style.backgroundColor = glow.shape === 'custom' ? 'rgba(88,166,255,0.3)' : glow.color.replace(')', ', 0.3)').replace('rgb', 'rgba'); 
      ret.style.borderRadius = (glow.shape === 'square' || glow.shape === 'custom') ? '4px' : '50%';
    }
  },

  removeGlow(id) {
    this.list = this.list.filter(g => g.id !== id);
    if (this.activeId === id) this.deselectGlow(); else this.renderList();
    this.triggerAppRender();
  },

  renderList() {
    const container = document.getElementById('glowListContainer');
    if (this.list.length === 0) { container.innerHTML = '<div class="stage-hint" id="emptyGlowHint">No glows active.</div>'; return; }
    container.innerHTML = '';
    this.list.forEach(glow => {
      const div = document.createElement('div');
      div.className = 'flow-list-item' + (this.activeId === glow.id ? ' selected' : '');
      div.style.borderLeftColor = glow.color;
      div.innerHTML = `<span>Glow ${glow.id}</span><button style="background:transparent; border:none; color:#ff4444; font-weight:bold; cursor:pointer;" onclick="window.Glows.removeGlow(${glow.id}); event.stopPropagation();">X</button>`;
      div.onclick = () => this.selectGlow(glow.id);
      container.appendChild(div);
    });
  },

  triggerAppRender() { document.getElementById('durationSlider')?.dispatchEvent(new Event('input')); },

  injectIntoSVG(svgString, width, height) {
    if (this.list.length === 0) return svgString;
    let defs = ''; let elements = '';

    this.list.forEach(glow => {
      const px = (glow.x / 100) * width; const py = (glow.y / 100) * height;
      const op = glow.opacity !== undefined ? glow.opacity : 1.0;
      const softness = glow.blur !== undefined ? glow.blur : 50;
      const shape = glow.shape || 'circle';
      const scale = glow.scale !== undefined ? glow.scale : 1.0;
      const endDelay = glow.endDelay || 0;
      const totalDur = glow.dur + endDelay;
      
      let fillAttr = `fill="${glow.color}"`; let filterAttr = '';
      
      if (shape === 'circle') {
        const coreSize = Math.max(0, 100 - softness);
        const gradId = `glowGrad-${glow.id}`;
        defs += `<radialGradient id="${gradId}"><stop offset="${coreSize}%" stop-color="${glow.color}" stop-opacity="1" /><stop offset="100%" stop-color="${glow.color}" stop-opacity="0" /></radialGradient>`;
        fillAttr = `fill="url(#${gradId})"`;
      } else if (shape !== 'radar' && softness > 0) {
        const blurId = `glowBlur-${glow.id}`;
        defs += `<filter id="${blurId}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${softness / 4}" /></filter>`;
        filterAttr = `filter="url(#${blurId})"`;
      }
      
      let animTag = '';
      const holdVal = glow.hideOnDelay !== false ? '0' : op;
      
      if (endDelay > 0) {
        const r = (glow.dur / totalDur).toFixed(4); const rHalf = (glow.dur / totalDur / 2).toFixed(4); const rSafe = Math.min((glow.dur / totalDur) + 0.0001, 0.9999).toFixed(4);
        if (glow.playback === 'pingpong') animTag = `<animate attributeName="opacity" values="0; ${op}; 0; 0" keyTimes="0; ${rHalf}; ${r}; 1" dur="${totalDur}s" begin="${glow.delay}s" repeatCount="indefinite" />`;
        else if (glow.playback === 'linear') animTag = `<animate attributeName="opacity" values="0; ${op}; ${holdVal}; ${holdVal}" keyTimes="0; ${r}; ${rSafe}; 1" dur="${totalDur}s" begin="${glow.delay}s" repeatCount="indefinite" />`;
        else if (glow.playback === 'once') animTag = `<animate attributeName="opacity" from="0" to="${op}" dur="${glow.dur}s" begin="${glow.delay}s" repeatCount="1" fill="freeze" />`;
        else if (glow.playback === 'static') animTag = `<set attributeName="opacity" to="${op}" begin="${glow.delay}s" fill="freeze" />`;
      } else {
        if (glow.playback === 'pingpong') animTag = `<animate attributeName="opacity" values="0; ${op}; 0" dur="${glow.dur}s" begin="${glow.delay}s" repeatCount="indefinite" />`;
        else if (glow.playback === 'linear') animTag = `<animate attributeName="opacity" from="0" to="${op}" dur="${glow.dur}s" begin="${glow.delay}s" repeatCount="indefinite" />`;
        else if (glow.playback === 'once') animTag = `<animate attributeName="opacity" from="0" to="${op}" dur="${glow.dur}s" begin="${glow.delay}s" repeatCount="1" fill="freeze" />`;
        else if (glow.playback === 'static') animTag = `<set attributeName="opacity" to="${op}" begin="${glow.delay}s" fill="freeze" />`;
      }

      let visibilityControl = ''; let setAnim = '';
      if (glow.delay > 0) { visibilityControl = `visibility="hidden"`; setAnim = `<set attributeName="visibility" to="visible" begin="${glow.delay}s" fill="freeze" />`; }

      let shapeEl = '';
      if (shape === 'custom' && glow.customB64) {
        const w = glow.customW; const h = glow.customH;
        shapeEl = `<g transform="translate(${px}, ${py}) scale(${scale})" style="will-change: transform;"><image xlink:href="data:${glow.customMime};base64,${glow.customB64}" x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" ${filterAttr} /></g>`;
      } else if (shape === 'square') {
        shapeEl = `<rect x="${px - glow.size}" y="${py - glow.size}" width="${glow.size * 2}" height="${glow.size * 2}" ${fillAttr} ${filterAttr} />`;
      } else if (shape === 'radar') {
        const coreR = glow.coreR !== undefined ? glow.coreR : 5; const strokeW = glow.thick !== undefined ? glow.thick : 2; const ringCount = glow.rings !== undefined ? glow.rings : 1;
        const ringRepeat = (glow.playback === 'once' || glow.playback === 'static') ? '1' : 'indefinite';
        const ringFreeze = (glow.playback === 'once' || glow.playback === 'static') ? 'fill="freeze"' : '';
        let ringElements = '';
        
        if (glow.playback !== 'static') {
          for (let i = 0; i < ringCount; i++) {
            const stagger = (glow.dur / ringCount) * i; let rAnim = ''; let opAnim = '';
            if (endDelay > 0) {
              const rRatio = (glow.dur / totalDur).toFixed(4);
              rAnim = `<animate attributeName="r" values="${coreR}; ${glow.size}; ${glow.size}" keyTimes="0; ${rRatio}; 1" dur="${totalDur}s" begin="${glow.delay + stagger}s" repeatCount="${ringRepeat}" ${ringFreeze} />`;
              opAnim = `<animate attributeName="opacity" values="${op}; 0; 0" keyTimes="0; ${rRatio}; 1" dur="${totalDur}s" begin="${glow.delay + stagger}s" repeatCount="${ringRepeat}" ${ringFreeze} />`;
            } else {
              rAnim = `<animate attributeName="r" from="${coreR}" to="${glow.size}" dur="${glow.dur}s" begin="${glow.delay + stagger}s" repeatCount="${ringRepeat}" ${ringFreeze} />`;
              opAnim = `<animate attributeName="opacity" from="${op}" to="0" dur="${glow.dur}s" begin="${glow.delay + stagger}s" repeatCount="${ringRepeat}" ${ringFreeze} />`;
            }
            ringElements += `<circle cx="${px}" cy="${py}" r="${coreR}" fill="none" stroke="${glow.color}" stroke-width="${strokeW}" opacity="0" ${filterAttr}>${rAnim}${opAnim}</circle>`;
          }
        }
        shapeEl = `<circle cx="${px}" cy="${py}" r="${coreR}" fill="none" stroke="${glow.color}" stroke-width="${strokeW}" ${filterAttr} />${ringElements}`;
      } else { 
        shapeEl = `<circle cx="${px}" cy="${py}" r="${glow.size}" ${fillAttr} />`;
      }
      elements += `<g ${visibilityControl}>${setAnim}<g opacity="0">${animTag}${shapeEl}</g></g>`;
    });
    
    return svgString.replace('<!-- INJECT_CAMERA_RIG_ELEMENTS -->', `\n<defs>\n${defs}\n</defs>\n<g id="glows-layer">\n${elements}\n</g>\n<!-- INJECT_CAMERA_RIG_ELEMENTS -->`);
  }
};