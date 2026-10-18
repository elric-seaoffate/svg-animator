window.Ripples = {
  list: [],
  activeId: null,
  counter: 0,
  
  init() {
    document.getElementById('btnAddRipple')?.addEventListener('click', () => this.addRipple());
    document.getElementById('rippleColorPicker')?.addEventListener('change', (e) => { this.updateActive('color', e.target.value); });

    ['outerR', 'innerR', 'rings', 'thick', 'refraction', 'opacity', 'dur', 'delay', 'endDelay'].forEach(key => {
      const slider = document.getElementById(`ripple${key.charAt(0).toUpperCase() + key.slice(1)}Slider`);
      const num = document.getElementById(`ripple${key.charAt(0).toUpperCase() + key.slice(1)}Num`);
      if (slider && num) {
        slider.addEventListener('input', (e) => { num.value = e.target.value; this.updateActive(key, parseFloat(e.target.value)); });
        num.addEventListener('input', (e) => { slider.value = e.target.value; this.updateActive(key, parseFloat(e.target.value)); });
      }
    });
  },

  addRipple() {
    this.counter++;
    const newRipple = {
      id: this.counter, color: '#ffffff', opacity: 0.4, innerR: 0, outerR: 150, rings: 3, thick: 8, refraction: 35,
      dur: 3.0, delay: 0.0, endDelay: 1.0, x: 50, y: 50
    };
    this.list.push(newRipple);
    this.selectRipple(newRipple.id);
  },

  selectRipple(id) {
    if (window.DataFlows) window.DataFlows.deselectFlow(); 
    if (window.Glows) window.Glows.deselectGlow();
    this.activeId = id;
    this.renderList();
    document.body.classList.add('editing-flow'); 
    
    const rp = this.list.find(r => r.id === id);
    if (rp) {
      document.getElementById('rippleEditor').style.display = 'block';
      document.getElementById('editingRippleLabel').innerText = `Editing Ripple ${id}`;
      document.getElementById('rippleColorPicker').value = rp.color;
      
      ['outerR', 'innerR', 'rings', 'thick', 'refraction', 'opacity', 'dur', 'delay', 'endDelay'].forEach(key => {
        const val = rp[key] !== undefined ? rp[key] : 0;
        const sl = document.getElementById(`ripple${key.charAt(0).toUpperCase() + key.slice(1)}Slider`);
        const nu = document.getElementById(`ripple${key.charAt(0).toUpperCase() + key.slice(1)}Num`);
        if(sl) sl.value = val; if(nu) nu.value = val;
      });
      
      this.updateUIOverlay(rp);
      document.getElementById('rippleReticleTarget').style.display = 'flex';
    }
  },

  deselectRipple() {
    this.activeId = null;
    this.renderList();
    document.body.classList.remove('editing-flow');
    const editor = document.getElementById('rippleEditor');
    if(editor) editor.style.display = 'none';
    const ret = document.getElementById('rippleReticleTarget');
    if(ret) ret.style.display = 'none';
  },

  updateActive(key, value) {
    if (this.activeId === null) return;
    const rp = this.list.find(r => r.id === this.activeId);
    if (rp) { rp[key] = value; this.renderList(); this.triggerAppRender(); if(key === 'color') this.updateUIOverlay(rp); }
  },

  handleStageClick(x, y) {
    if (this.activeId === null) return false;
    const rp = this.list.find(r => r.id === this.activeId);
    if (rp) { rp.x = x; rp.y = y; this.updateUIOverlay(rp); this.triggerAppRender(); return true; }
    return false;
  },

  updateUIOverlay(rp) {
    const ret = document.getElementById('rippleReticleTarget');
    if(ret) {
      ret.style.left = `${rp.x}%`; ret.style.top = `${rp.y}%`;
      ret.style.borderColor = rp.color; ret.style.backgroundColor = rp.color.replace(')', ', 0.2)').replace('rgb', 'rgba'); 
    }
  },

  removeRipple(id) {
    this.list = this.list.filter(r => r.id !== id);
    if (this.activeId === id) this.deselectRipple(); else this.renderList();
    this.triggerAppRender();
  },

  renderList() {
    const container = document.getElementById('rippleListContainer');
    if (this.list.length === 0) { container.innerHTML = '<div class="stage-hint" id="emptyRippleHint">No ripples active.</div>'; return; }
    container.innerHTML = '';
    this.list.forEach(rp => {
      const div = document.createElement('div');
      div.className = 'flow-list-item' + (this.activeId === rp.id ? ' selected' : '');
      div.style.borderLeftColor = '#58a6ff';
      div.innerHTML = `<span>Ripple ${rp.id}</span><button style="background:transparent; border:none; color:#ff4444; font-weight:bold; cursor:pointer;" onclick="window.Ripples.removeRipple(${rp.id}); event.stopPropagation();">X</button>`;
      div.onclick = () => this.selectRipple(rp.id);
      container.appendChild(div);
    });
  },

  triggerAppRender() { document.getElementById('durationSlider')?.dispatchEvent(new Event('input')); },

  injectIntoSVG(svgString, state) {
    if (this.list.length === 0) return svgString;
    const width = state.image.width; const height = state.image.height;
    
    // RECONSTRUCTS THE DATA URI FROM RAW B64
    const imgSrc = state.image.b64 
        ? `data:${state.image.mime || 'image/jpeg'};base64,${state.image.b64}` 
        : (state.image.src || state.image.dataUrl || state.image.dataURL || state.image.data || '');
    
    let defs = ''; let elements = '';

    this.list.forEach(rp => {
      const px = (rp.x / 100) * width; const py = (rp.y / 100) * height;
      const totalDur = rp.dur + (rp.endDelay || 0);
      const scaleRefract = 1.0 + (rp.refraction / 1000);
      const maskId = `rippleMask-${rp.id}`; const blurId = `rippleBlur-${rp.id}`;
      
      const blurAmount = Math.max(2, rp.thick * 1.5);
      defs += `<filter id="${blurId}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${blurAmount}" /></filter>`;
      
      let ringMasks = ''; let ringHighlights = ''; let ringShadows = '';
      const easeSpline = "0.1 0.8 0.3 1"; const holdSpline = "0 0 1 1";
      const rRatio = rp.endDelay > 0 ? (rp.dur / totalDur).toFixed(4) : "1";
      
      for (let i = 0; i < rp.rings; i++) {
        const stagger = (rp.dur / rp.rings) * i; const beginTime = rp.delay + stagger;
        let rAnim = ''; let opAnimMask = ''; let opAnimCrest = '';
        
        if (rp.endDelay > 0) {
          rAnim = `<animate attributeName="r" values="${rp.innerR}; ${rp.outerR}; ${rp.outerR}" keyTimes="0; ${rRatio}; 1" calcMode="spline" keySplines="${easeSpline}; ${holdSpline}" dur="${totalDur}s" begin="${beginTime}s" repeatCount="indefinite" />`;
          opAnimMask = `<animate attributeName="stroke-opacity" values="1; 0; 0" keyTimes="0; ${rRatio}; 1" calcMode="spline" keySplines="${easeSpline}; ${holdSpline}" dur="${totalDur}s" begin="${beginTime}s" repeatCount="indefinite" />`;
          opAnimCrest = `<animate attributeName="stroke-opacity" values="${rp.opacity}; 0; 0" keyTimes="0; ${rRatio}; 1" calcMode="spline" keySplines="${easeSpline}; ${holdSpline}" dur="${totalDur}s" begin="${beginTime}s" repeatCount="indefinite" />`;
        } else {
          rAnim = `<animate attributeName="r" values="${rp.innerR}; ${rp.outerR}" keyTimes="0; 1" calcMode="spline" keySplines="${easeSpline}" dur="${rp.dur}s" begin="${beginTime}s" repeatCount="indefinite" />`;
          opAnimMask = `<animate attributeName="stroke-opacity" values="1; 0" keyTimes="0; 1" calcMode="spline" keySplines="${easeSpline}" dur="${rp.dur}s" begin="${beginTime}s" repeatCount="indefinite" />`;
          opAnimCrest = `<animate attributeName="stroke-opacity" values="${rp.opacity}; 0" keyTimes="0; 1" calcMode="spline" keySplines="${easeSpline}" dur="${rp.dur}s" begin="${beginTime}s" repeatCount="indefinite" />`;
        }
        
        const shadowOp = (rp.opacity * 0.7).toFixed(2);
        const opAnimShadow = opAnimCrest.replace(`values="${rp.opacity}`, `values="${shadowOp}`);
        
        ringMasks += `<circle cx="${px}" cy="${py}" r="0" fill="none" stroke="white" stroke-width="${rp.thick * 3}" stroke-opacity="0" filter="url(#${blurId})">${rAnim}${opAnimMask}</circle>`;
        ringHighlights += `<circle cx="${px}" cy="${py}" r="0" fill="none" stroke="${rp.color}" stroke-width="${rp.thick * 0.8}" stroke-opacity="0" filter="url(#${blurId})">${rAnim}${opAnimCrest}</circle>`;
        ringShadows += `<g transform="translate(${px}, ${py}) scale(0.92) translate(${-px}, ${-py})"><circle cx="${px}" cy="${py}" r="0" fill="none" stroke="black" stroke-width="${rp.thick * 1.5}" stroke-opacity="0" filter="url(#${blurId})">${rAnim}${opAnimShadow}</circle></g>`;
      }
      
      defs += `<mask id="${maskId}">${ringMasks}</mask>`;
      elements += `<g mask="url(#${maskId})"><g transform="translate(${px}, ${py}) scale(${scaleRefract}) translate(${-px}, ${-py})"><image xlink:href="${imgSrc}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" /></g></g><g>${ringShadows}</g><g>${ringHighlights}</g>`;
    });
    
    return svgString.replace('<!-- INJECT_CAMERA_RIG_ELEMENTS -->', `\n<defs>\n${defs}\n</defs>\n<g id="ripples-layer">\n${elements}\n</g>\n<!-- INJECT_CAMERA_RIG_ELEMENTS -->`);
  }
};