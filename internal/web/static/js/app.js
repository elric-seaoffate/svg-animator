document.addEventListener("DOMContentLoaded", () => {
  let currentImage = null;

  Stage.init((placement, x, y) => {
    if (window.DataFlows && window.DataFlows.activeId !== null) { window.DataFlows.handleStageClick(x, y); return; }
    if (window.Glows && window.Glows.activeId !== null) { window.Glows.handleStageClick(x, y); return; }

    if (placement === 'start') {
      const sx = document.getElementById('startXSlider'); if (sx) sx.value = x;
      const sn = document.getElementById('startXNum'); if (sn) sn.value = x;
      const sy = document.getElementById('startYSlider'); if (sy) sy.value = y;
      const syn = document.getElementById('startYNum'); if (syn) syn.value = y;
    } else {
      const ex = document.getElementById('endXSlider'); if (ex) ex.value = x;
      const en = document.getElementById('endXNum'); if (en) en.value = x;
      const ey = document.getElementById('endYSlider'); if (ey) ey.value = y;
      const eyn = document.getElementById('endYNum'); if (eyn) eyn.value = y;
    }
    render();
  }, (imgData) => {
    currentImage = imgData;
    const dim = document.getElementById('imgDimensions');
    if (dim) dim.innerHTML = `${imgData.width} &times; ${imgData.height}`;
    
    const pb = document.getElementById('previewBox');
    if (pb) { pb.style.background = '#000'; pb.style.backgroundImage = 'none'; }
    render();
  });

  document.getElementById('btnModeStart')?.addEventListener('click', () => { 
    if(window.DataFlows) window.DataFlows.deselectFlow(); 
    if(window.Glows) window.Glows.deselectGlow(); 
    if(window.Stage) Stage.setActive('start'); 
  });
  
  document.getElementById('btnModeEnd')?.addEventListener('click', () => { 
    if(window.DataFlows) window.DataFlows.deselectFlow(); 
    if(window.Glows) window.Glows.deselectGlow(); 
    if(window.Stage) Stage.setActive('end'); 
  });

  document.querySelectorAll('.slider-row').forEach(row => {
    const slider = row.querySelector('input[type="range"]');
    const num = row.querySelector('input[type="number"]');
    if (slider && num) {
      num.value = slider.value; 
      slider.addEventListener('input', () => { num.value = slider.value; render(); });
      num.addEventListener('input', () => { slider.value = num.value; render(); });
    }
  });

  document.getElementById('cameraMotionSelect')?.addEventListener('change', (e) => {
    const hh = document.getElementById('handheldControls');
    const pc = document.getElementById('perspectiveControls');
    if (hh) hh.style.display = e.target.value === 'handheld-drift' ? 'block' : 'none';
    if (pc) pc.style.display = e.target.value === 'perspective-tilt' ? 'block' : 'none';
    render();
  });

  document.getElementById('effectSelect')?.addEventListener('change', (e) => {
    const fs = document.getElementById('focusSection');
    const ts = document.getElementById('tiltShiftSection');
    const mb = document.getElementById('motionBlurSection');
    const ls = document.getElementById('liquidSection');
    
    if (fs) fs.style.display = e.target.value === 'focus-pull' ? 'block' : 'none';
    if (ts) ts.style.display = e.target.value === 'tilt-shift' ? 'block' : 'none';
    if (mb) mb.style.display = e.target.value === 'motion-blur' ? 'block' : 'none';
    if (ls) ls.style.display = e.target.value === 'liquid-ripple' ? 'block' : 'none';
    render();
  });

  ['Frame', 'Exposure', 'Grain', 'Chroma'].forEach(mod => {
    const chk = document.getElementById(`chkModule${mod}`);
    if (chk) {
      chk.addEventListener('change', (e) => {
        const group = document.getElementById(`group${mod}`);
        if (group) group.style.display = e.target.checked ? 'flex' : 'none';
        render();
      });
    }
  });

  document.querySelectorAll('select, input[type="checkbox"], input[type="color"]').forEach(el => {
    el.addEventListener('change', render);
  });

  function render() {
    if (!currentImage) return;

    const state = {
      image: currentImage,
      duration: parseFloat(document.getElementById('durationSlider')?.value) || 7,
      loop: document.getElementById('loopSelect')?.value || 'once',
      camera: {
        bgColor: document.getElementById('canvasBgColorPicker')?.value || '#000000',
        bgTransparent: document.getElementById('canvasBgTransparent')?.checked || false,
        motion: document.getElementById('cameraMotionSelect')?.value || 'ken-burns',
        startX: parseFloat(document.getElementById('startXSlider')?.value || 50),
        startY: parseFloat(document.getElementById('startYSlider')?.value || 50),
        startZoom: parseFloat(document.getElementById('startZoomSlider')?.value || 1.0),
        endX: parseFloat(document.getElementById('endXSlider')?.value || 60),
        endY: parseFloat(document.getElementById('endYSlider')?.value || 40),
        endZoom: parseFloat(document.getElementById('endZoomSlider')?.value || 1.3)
      },
      optical: {
        type: document.getElementById('effectSelect')?.value || 'none',
        startBlur: parseFloat(document.getElementById('startBlurSlider')?.value || 0),
        endBlur: parseFloat(document.getElementById('endBlurSlider')?.value || 0)
      },
      overlays: {
        frame: document.getElementById('chkModuleFrame')?.checked || false,
        frameStyle: document.getElementById('frameStyleSelect')?.value || 'walnut',
        frameDepth: parseFloat(document.getElementById('frameDepthSlider')?.value || 40),
        exposure: document.getElementById('chkModuleExposure')?.checked || false,
        grain: document.getElementById('chkModuleGrain')?.checked || false
      }
    };

    const editingFlow = window.DataFlows ? window.DataFlows.activeId !== null : false;
    const editingGlow = window.Glows ? window.Glows.activeId !== null : false;
    
    if (!editingFlow && !editingGlow && window.Stage) {
      window.Stage.updateReticles(state.camera.startX, state.camera.startY, state.camera.endX, state.camera.endY);
    }

    const svgContainer = document.getElementById('svgContainer');
    if (svgContainer && window.Effects) {
        const svgString = window.Effects.build(state);
        svgContainer.innerHTML = svgString;
    }
  }

  document.getElementById('btnReplay')?.addEventListener('click', () => {
    const container = document.getElementById('svgContainer');
    if (!container) return;
    const content = container.innerHTML;
    container.innerHTML = '';
    setTimeout(() => container.innerHTML = content, 10); 
  });

  document.getElementById('btnDownloadSVG')?.addEventListener('click', () => {
    if (!currentImage) { alert("Please upload an image first."); return; }
    const svgContainer = document.getElementById('svgContainer');
    if (!svgContainer) return;
    const svgData = svgContainer.innerHTML;
    const blob = new Blob([svgData], {type: "image/svg+xml;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${currentImage.filename}_animated.svg`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  });

  document.getElementById('btnDownloadHTML')?.addEventListener('click', () => {
    if (!currentImage) { alert("Please upload an image first."); return; }
    const svgContainer = document.getElementById('svgContainer');
    if (!svgContainer) return;
    const isTransparent = document.getElementById('canvasBgTransparent')?.checked;
    const bgColor = isTransparent ? 'transparent' : (document.getElementById('canvasBgColorPicker')?.value || '#000000');
    const svgData = svgContainer.innerHTML;
    const htmlData = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Animated Topology</title>\n  <style>body { margin: 0; padding: 0; background: ${bgColor}; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; } svg { max-width: 100vw; max-height: 100vh; }</style>\n</head>\n<body>\n  ${svgData}\n</body>\n</html>`;
    const blob = new Blob([htmlData], {type: "text/html;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${currentImage.filename}_animated.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  });

  if (window.DataFlows) window.DataFlows.init();
  if (window.Glows) window.Glows.init();
  
  document.getElementById('cameraMotionSelect')?.dispatchEvent(new Event('change'));
  document.getElementById('effectSelect')?.dispatchEvent(new Event('change'));
  document.getElementById('chkModuleFrame')?.dispatchEvent(new Event('change'));
});