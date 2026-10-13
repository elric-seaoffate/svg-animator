window.Ripples = {
  list: [],
  activeId: null,
  counter: 0,
  
  init() {
    document.getElementById('btnAddRipple').addEventListener('click', () => this.addRipple());
    
    document.getElementById('rippleColorPicker')?.addEventListener('input', (e) => {
      this.updateActive('color', e.target.value);
    });

    ['strength', 'innerR', 'outerR', 'thick', 'rings', 'dur', 'delay', 'endDelay', 'opacity'].forEach(key => {
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
      id: this.counter, color: '#ffffff',
      strength: 30, // Default 3% refraction scale
      innerR: 0, outerR: 150, thick: 8, rings: 3, 
      dur: 2.5, delay: 0.0, endDelay: 1.0, opacity: 0.4,
      x: 50, y: 50
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
    
    const rip = this.list.find(r => r.id === id);
    if (rip) {
      document.getElementById('rippleEditor').style.display = 'block';
      document.getElementById('editingRippleLabel').innerText = `Editing Ripple ${id}`;
      
      document.getElementById('rippleColorPicker').value = rip.color;
      
      ['strength', 'innerR', 'outerR', 'thick', 'rings', 'dur', 'delay', 'endDelay', 'opacity'].forEach(key => {
        document.getElementById(`ripple${key.charAt(0).toUpperCase() + key.slice(1)}Slider`).value = rip[key];
        document.getElementById(`ripple${key.charAt(0).toUpperCase() + key.slice(1)}Num`).value = rip[key];
      });
      
      this.updateUIOverlay(rip);
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
    const rip = this.list.find(r => r.id === this.activeId);
    if (rip) {
      rip[key] = value;
      this.renderList(); this.triggerAppRender();
      if(key === 'color') this.updateUIOverlay(rip);
    }
  },

  handleStageClick(x, y) {
    if (this.activeId === null) return false;
    const rip = this.list.find(r => r.id === this.activeId);
    if (rip) {
      rip.x = x; 
      rip.y = y;
      this.updateUIOverlay(rip);
      this.triggerAppRender();
      return true;
    }
    return false;
  },

  updateUIOverlay(rip) {
    const ret = document.getElementById('rippleReticleTarget');
    if(ret) {
      ret.style.left = `${rip.x}%`; 
      ret.style.top = `${rip.y}%`;
    }
  },

  removeRipple(id) {
    this.list = this.list.filter(r => r.id !== id);
    if (this.activeId === id) this.deselectRipple(); else this.renderList();
    this.triggerAppRender();
  },

  renderList() {
    const container = document.getElementById('rippleListContainer');
    if(!container) return;
    if (this.list.length === 0) {
      container.innerHTML = '<div class="stage-hint" id="emptyRippleHint">No ripples active.</div>';
      return;
    }
    container.innerHTML = '';
    this.list.forEach(rip => {
      const div = document.createElement('div');
      div.className = 'flow-list-item' + (this.activeId === rip.id ? ' selected' : '');
      div.style.borderLeftColor = '#00aaff';
      div.innerHTML = `<span>Ripple ${rip.id}</span><button style="background:transparent; border:none; color:#ff4444; font-weight:bold; cursor:pointer;" onclick="window.Ripples.removeRipple(${rip.id}); event.stopPropagation();">X</button>`;
      div.onclick = () => this.selectRipple(rip.id);
      container.appendChild(div);
    });
  },

  triggerAppRender() { document.getElementById('durationSlider')?.dispatchEvent(new Event('input')); },

  injectIntoSVG(svgString, width, height) {
    if (this.list.length === 0) return svgString;
    
    let defs = '';
    let elements = '';

    this.list.forEach(rip => {
      const px = (rip.x / 100) * width; 
      const py = (rip.y / 100) * height;
      const totalDur = rip.dur + rip.endDelay;
      
      const scaleBase = 1 + (rip.strength / 1000); 
      const tx = px - (px * scaleBase);
      const ty = py - (py * scaleBase);
      const transformStr = `matrix(${scaleBase}, 0, 0, ${scaleBase}, ${tx}, ${ty})`;

      let maskCircles = '';
      let highlightCircles = '';

      for (let i = 0; i < rip.rings; i++) {
        const stagger = (rip.dur / rip.rings) * i;
        
        let rAnim = '';
        let opAnim = '';
        
        if (rip.endDelay > 0) {
          const rRatio = (rip.dur / totalDur).toFixed(4);
          rAnim = `<animate attributeName="r" values="${rip.innerR}; ${rip.outerR}; ${rip.outerR}" keyTimes="0; ${rRatio}; 1" dur="${totalDur}s" begin="${rip.delay + stagger}s" repeatCount="indefinite" />`;
          opAnim = `<animate attributeName="stroke-opacity" values="0; 1; 0; 0" keyTimes="0; ${rRatio*0.2}; ${rRatio}; 1" dur="${totalDur}s" begin="${rip.delay + stagger}s" repeatCount="indefinite" />`;
        } else {
          rAnim = `<animate attributeName="r" from="${rip.innerR}" to="${rip.outerR}" dur="${rip.dur}s" begin="${rip.delay + stagger}s" repeatCount="indefinite" />`;
          opAnim = `<animate attributeName="stroke-opacity" values="0; 1; 0" keyTimes="0; 0.2; 1" dur="${rip.dur}s" begin="${rip.delay + stagger}s" repeatCount="indefinite" />`;
        }

        maskCircles += `<circle cx="${px}" cy="${py}" r="${rip.innerR}" fill="none" stroke="#fff" stroke-width="${rip.thick}">${rAnim}${opAnim}</circle>`;
        
        if (rip.opacity > 0) {
          highlightCircles += `<circle cx="${px}" cy="${py}" r="${rip.innerR}" fill="none" stroke="${rip.color}" stroke-width="${rip.thick / 2}">${rAnim}${opAnim}</circle>`;
        }
      }

      const maskId = `rippleMask-${rip.id}`;
      defs += `<mask id="${maskId}">${maskCircles}</mask>`;

      let visibilityControl = '';
      let setAnim = '';
      if (rip.delay > 0) {
        visibilityControl = `visibility="hidden"`;
        setAnim = `<set attributeName="visibility" to="visible" begin="${rip.delay}s" fill="freeze" />`;
      }

      elements += `
        <g ${visibilityControl}>
          ${setAnim}
          <g mask="url(#${maskId})">
            <use href="#source-image" transform="${transformStr}" />
          </g>
          <g opacity="${rip.opacity}">
            ${highlightCircles}
          </g>
        </g>
      `;
    });
    
    return svgString.replace('<!-- INJECT_CAMERA_RIG_ELEMENTS -->', `\n<defs>\n${defs}\n</defs>\n<g id="ripples-layer">\n${elements}\n</g>\n<!-- INJECT_CAMERA_RIG_ELEMENTS -->`);
  }
};