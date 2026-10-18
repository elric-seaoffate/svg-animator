document.addEventListener("DOMContentLoaded", () => {
  let currentImage = null;
  window.currentRenderState = null;

  function buildFullSVG(state) {
    if (!state || !window.Effects) return '';
    let svgString = window.Effects.build(state);
    if (window.DataFlows) svgString = window.DataFlows.injectIntoSVG(svgString, state);
    if (window.Glows) svgString = window.Glows.injectIntoSVG(svgString, state.image.width, state.image.height);
    if (window.Ripples) svgString = window.Ripples.injectIntoSVG(svgString, state);
    return svgString;
  }

  // BULLETPROOF XML SERIALIZATION FOR DOWNLOADS
  function getExportSVG() {
    const rawSvg = buildFullSVG(window.currentRenderState); 
    if (!rawSvg) throw new Error("SVG generation returned empty.");

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(rawSvg, "image/svg+xml");

    const parserError = xmlDoc.getElementsByTagName("parsererror");
    if (parserError.length > 0) {
      throw new Error("XML Parsing Failed: " + parserError[0].textContent);
    }

    const svgRoot = xmlDoc.documentElement;
    const XLINK_NS = "http://www.w3.org/1999/xlink";

    if (!svgRoot.hasAttribute("xmlns:xlink")) {
      svgRoot.setAttribute("xmlns:xlink", XLINK_NS);
    }

    // UNIVERSAL FIX: Finds EVERY element using standard 'href' (image, mpath, use, a) 
    // and enforces dual HTML5/XML compatibility
    const elementsWithHref = xmlDoc.querySelectorAll('[href]');
    elementsWithHref.forEach(el => {
      const hrefVal = el.getAttribute("href");
      if (hrefVal) {
        el.setAttributeNS(XLINK_NS, "xlink:href", hrefVal);
      }
    });

    const serializer = new XMLSerializer();
    return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + serializer.serializeToString(svgRoot);
  }

  Stage.init((placement, x, y) => {
    if (window.DataFlows && window.DataFlows.activeId !== null) { window.DataFlows.handleStageClick(x, y); return; }
    if (window.Glows && window.Glows.activeId !== null) { window.Glows.handleStageClick(x, y); return; }
    if (window.Ripples && window.Ripples.activeId !== null) { window.Ripples.handleStageClick(x, y); return; }

    const mode = document.getElementById('cameraMotionSelect').value;
    if (mode === 'ken-burns') {
      if (placement === 'start') { syncVal('startX', x); syncVal('startY', y); }
      else { syncVal('endX', x); syncVal('endY', y); }
    } else if (mode === 'static') {
      syncVal('staticX', x); syncVal('staticY', y);
    } else if (mode === 'handheld-drift') {
      syncVal('handX', x); syncVal('handY', y);
    } else if (mode === 'perspective-tilt') {
      syncVal('perspX', x); syncVal('perspY', y);
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

  function syncVal(id, val) {
    const el = document.getElementById(id + 'Slider');
    const num = document.getElementById(id + 'Num');
    if(el) el.value = val;
    if(num) num.value = val;
  }

  document.getElementById('btnModeStart')?.addEventListener('click', () => { 
    if(window.DataFlows) window.DataFlows.deselectFlow(); 
    if(window.Glows) window.Glows.deselectGlow(); 
    if(window.Ripples) window.Ripples.deselectRipple();
    if(window.Stage) Stage.setActive('start'); 
  });
  
  document.getElementById('btnModeEnd')?.addEventListener('click', () => { 
    if(window.DataFlows) window.DataFlows.deselectFlow(); 
    if(window.Glows) window.Glows.deselectGlow(); 
    if(window.Ripples) window.Ripples.deselectRipple();
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
    const v = e.target.value;
    document.getElementById('panel-cam-static').style.display = v === 'static' ? 'block' : 'none';
    document.getElementById('panel-cam-kenburns').style.display = v === 'ken-burns' ? 'block' : 'none';
    document.getElementById('panel-cam-handheld').style.display = v === 'handheld-drift' ? 'block' : 'none';
    document.getElementById('panel-cam-perspective').style.display = v === 'perspective-tilt' ? 'block' : 'none';
    render();
  });

  document.getElementById('effectSelect')?.addEventListener('change', (e) => {
    const v = e.target.value;
    document.getElementById('panel-opt-focus').style.display = v === 'focus-pull' ? 'block' : 'none';
    document.getElementById('panel-opt-tiltshift').style.display = v === 'tilt-shift' ? 'block' : 'none';
    document.getElementById('panel-opt-motionblur').style.display = v === 'motion-blur' ? 'block' : 'none';
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

    if (!currentImage.src && !currentImage.dataUrl && !currentImage.dataURL && !currentImage.data && !currentImage.b64) {
        alert("CRITICAL: File Reader failed to return image data! Keys found: " + Object.keys(currentImage).join(", "));
        return;
    }

    const camMode = document.getElementById('cameraMotionSelect')?.value || 'ken-burns';
    let sx=50, sy=50, sz=1.0, ex=60, ey=40, ez=1.3;
    let pSway=1.4, pBreathe=1.8, pRoll=0.5;
    let pTiltX=0, pTiltY=0;

    if (camMode === 'static') {
        sx = ex = parseFloat(document.getElementById('staticXSlider')?.value || 50);
        sy = ey = parseFloat(document.getElementById('staticYSlider')?.value || 50);
        sz = ez = parseFloat(document.getElementById('staticZoomSlider')?.value || 1.0);
    } else if (camMode === 'ken-burns') {
        sx = parseFloat(document.getElementById('startXSlider')?.value || 50);
        sy = parseFloat(document.getElementById('startYSlider')?.value || 50);
        sz = parseFloat(document.getElementById('startXZoomSlider')?.value || 1.0);
        ex = parseFloat(document.getElementById('endXSlider')?.value || 60);
        ey = parseFloat(document.getElementById('endYSlider')?.value || 40);
        ez = parseFloat(document.getElementById('endXZoomSlider')?.value || 1.3);
    } else if (camMode === 'handheld-drift') {
        sx = ex = parseFloat(document.getElementById('handXSlider')?.value || 50);
        sy = ey = parseFloat(document.getElementById('handYSlider')?.value || 50);
        sz = ez = parseFloat(document.getElementById('handZoomSlider')?.value || 1.1);
        pSway = parseFloat(document.getElementById('driftSwaySlider')?.value || 1.4);
        pBreathe = parseFloat(document.getElementById('driftBreatheSlider')?.value || 1.8);
    } else if (camMode === 'perspective-tilt') {
        sx = ex = parseFloat(document.getElementById('perspXSlider')?.value || 50);
        sy = ey = parseFloat(document.getElementById('perspYSlider')?.value || 50);
        sz = ez = parseFloat(document.getElementById('perspZoomSlider')?.value || 1.0);
        pTiltX = parseFloat(document.getElementById('perspTiltXSlider')?.value || 25);
        pTiltY = parseFloat(document.getElementById('perspTiltYSlider')?.value || 0);
    }

    const state = {
      image: currentImage,
      duration: parseFloat(document.getElementById('durationSlider')?.value) || 7,
      loop: document.getElementById('loopSelect')?.value || 'once',
      camera: {
        bgColor: document.getElementById('canvasBgColorPicker')?.value || '#000000',
        bgTransparent: document.getElementById('canvasBgTransparent')?.checked || false,
        motion: camMode,
        startX: sx, startY: sy, startZoom: sz,
        endX: ex, endY: ey, endZoom: ez,
        sway: pSway, breathe: pBreathe, tiltX: pTiltX, tiltY: pTiltY
      },
      optical: {
        type: document.getElementById('effectSelect')?.value || 'none',
        startBlur: parseFloat(document.getElementById('startBlurSlider')?.value || 0),
        endBlur: parseFloat(document.getElementById('endBlurSlider')?.value || 0),
        focusDur: parseFloat(document.getElementById('focusDurSlider')?.value || 4),
        tsShape: document.getElementById('tsShapeSelect')?.value || 'horizontal',
        tsPosX: parseFloat(document.getElementById('tsPosXSlider')?.value || 50),
        tsPos: parseFloat(document.getElementById('tsPosSlider')?.value || 50),
        tsWidth: parseFloat(document.getElementById('tsWidthSlider')?.value || 20),
        tsBlur: parseFloat(document.getElementById('tsBlurSlider')?.value || 12),
        mbInt: parseFloat(document.getElementById('mbIntSlider')?.value || 15),
        mbAng: parseFloat(document.getElementById('mbAngSlider')?.value || 0)
      },
      overlays: {
        frame: document.getElementById('chkModuleFrame')?.checked || false,
        frameStyle: document.getElementById('frameStyleSelect')?.value || 'walnut',
        frameDepth: parseFloat(document.getElementById('frameDepthSlider')?.value || 40)
      }
    };

    window.currentRenderState = state;

    const rStart = document.getElementById('reticleStart');
    const rEnd = document.getElementById('reticleEnd');
    const rCenter = document.getElementById('reticleCenter');
    
    if (rStart) rStart.style.display = (camMode === 'ken-burns') ? 'flex' : 'none';
    if (rEnd) rEnd.style.display = (camMode === 'ken-burns') ? 'flex' : 'none';
    if (rCenter) {
      rCenter.style.display = (camMode !== 'ken-burns') ? 'flex' : 'none';
      rCenter.style.left = `${sx}%`;
      rCenter.style.top = `${sy}%`;
    }

    const editingFlow = window.DataFlows ? window.DataFlows.activeId !== null : false;
    const editingGlow = window.Glows ? window.Glows.activeId !== null : false;
    const editingRipple = window.Ripples ? window.Ripples.activeId !== null : false;
    
    if (!editingFlow && !editingGlow && !editingRipple && window.Stage) {
      window.Stage.updateReticles(sx, sy, ex, ey);
    }

    try {
      const svgContainer = document.getElementById('svgContainer');
      if (svgContainer) {
        svgContainer.innerHTML = buildFullSVG(state);
      }
    } catch (e) {
      console.error("SVG Render Exception:", e);
      alert("UI Engine Crash: " + e.message);
    }
  }

  document.getElementById('btnReplay')?.addEventListener('click', () => {
    const container = document.getElementById('svgContainer');
    if (!container || !window.currentRenderState) return;
    container.innerHTML = '';
    setTimeout(() => { container.innerHTML = buildFullSVG(window.currentRenderState); }, 10); 
  });

  document.getElementById('btnDownloadSVG')?.addEventListener('click', () => {
    try {
      if (!currentImage || !window.currentRenderState) { alert("Please upload an image first."); return; }
      
      const svgData = getExportSVG(); 

      const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url; 
      const baseName = (currentImage.filename && currentImage.filename.includes('.')) ? currentImage.filename.split('.')[0] : 'export';
      a.download = `${baseName}_animated.svg`;
      document.body.appendChild(a); 
      a.click(); 
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 150);
    } catch (err) {
      alert("SVG Download Error: " + err.message);
    }
  });

  document.getElementById('btnDownloadHTML')?.addEventListener('click', () => {
    try {
      if (!currentImage || !window.currentRenderState) { alert("Please upload an image first."); return; }

      const isTransparent = document.getElementById('canvasBgTransparent')?.checked;
      const bgColor = isTransparent ? 'transparent' : (document.getElementById('canvasBgColorPicker')?.value || '#000000');
      const svgData = getExportSVG(); 

      const htmlData = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Animated Topology</title>\n  <style>body { margin: 0; padding: 0; background: ${bgColor}; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; } svg { max-width: 100vw; max-height: 100vh; }</style>\n</head>\n<body>\n  ${svgData}\n</body>\n</html>`;
      const blob = new Blob([htmlData], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url; 
      const baseName = (currentImage.filename && currentImage.filename.includes('.')) ? currentImage.filename.split('.')[0] : 'export';
      a.download = `${baseName}_animated.html`;
      document.body.appendChild(a); 
      a.click(); 
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 150);
    } catch (err) {
      alert("HTML Download Error: " + err.message);
    }
  });

  if (window.DataFlows) window.DataFlows.init();
  if (window.Glows) window.Glows.init();
  if (window.Ripples) window.Ripples.init();
  document.getElementById('cameraMotionSelect')?.dispatchEvent(new Event('change'));
  document.getElementById('effectSelect')?.dispatchEvent(new Event('change'));
  document.getElementById('chkModuleFrame')?.dispatchEvent(new Event('change'));
});