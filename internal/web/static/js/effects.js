window.Effects = {
  build(state) {
    const img = state.image;
    const dur = state.duration;
    
    let repeat = 'indefinite';
    let animValues = '';
    
    if (state.loop === 'once') {
      repeat = '1';
      animValues = 'fill="freeze"';
    }

    const startW = img.width / Math.max(0.1, state.camera.startZoom);
    const startH = img.height / Math.max(0.1, state.camera.startZoom);
    const startX = (img.width * (state.camera.startX / 100)) - (startW / 2);
    const startY = (img.height * (state.camera.startY / 100)) - (startH / 2);

    const endW = img.width / Math.max(0.1, state.camera.endZoom);
    const endH = img.height / Math.max(0.1, state.camera.endZoom);
    const endX = (img.width * (state.camera.endX / 100)) - (endW / 2);
    const endY = (img.height * (state.camera.endY / 100)) - (endH / 2);

    let viewBoxAnim = '';
    if (state.camera.motion === 'ken-burns') {
      if (state.loop === 'pingpong') {
        viewBoxAnim = `<animate attributeName="viewBox" values="${startX} ${startY} ${startW} ${startH}; ${endX} ${endY} ${endW} ${endH}; ${startX} ${startY} ${startW} ${startH}" dur="${dur * 2}s" repeatCount="indefinite" />`;
      } else {
        viewBoxAnim = `<animate attributeName="viewBox" from="${startX} ${startY} ${startW} ${startH}" to="${endX} ${endY} ${endW} ${endH}" dur="${dur}s" repeatCount="${repeat}" ${animValues} />`;
      }
    }

    let defs = '';
    let filterChains = [];

    if (state.optical.type === 'focus-pull') {
      defs += `
        <filter id="focusPull">
          <feGaussianBlur stdDeviation="${state.optical.startBlur}">
            ${state.loop === 'pingpong' 
              ? `<animate attributeName="stdDeviation" values="${state.optical.startBlur};${state.optical.endBlur}; ${state.optical.startBlur}" dur="${dur * 2}s" repeatCount="indefinite" />`
              : `<animate attributeName="stdDeviation" from="${state.optical.startBlur}" to="${state.optical.endBlur}" dur="${dur}s" repeatCount="${repeat}" ${animValues} />`
            }
          </feGaussianBlur>
        </filter>`;
      filterChains.push('url(#focusPull)');
    }

    let grainOverlay = '';
    if (state.overlays.grain) {
      defs += `
        <filter id="filmGrain">
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" result="noise" />
          <feColorMatrix type="matrix" values="1 0 0 0 0, 0 1 0 0 0, 0 0 1 0 0, 0 0 0 0.15 0" in="noise" result="coloredNoise" />
          <feBlend in="SourceGraphic" in2="coloredNoise" mode="multiply" />
        </filter>`;
      grainOverlay = `<rect x="0" y="0" width="${img.width}" height="${img.height}" filter="url(#filmGrain)" pointer-events="none" />`;
    }

    let frameOverlay = '';
    if (state.overlays.frame) {
      const d = state.overlays.frameDepth;
      const c = state.overlays.frameStyle === 'gold' ? '#d4af37' : 
                state.overlays.frameStyle === 'matte' ? '#f5f5dc' : 
                state.overlays.frameStyle === 'obsidian' ? '#111111' : '#3e2723'; 
      
      frameOverlay = `
        <g id="presentation-frame" pointer-events="none">
          <rect x="0" y="0" width="${img.width}" height="${d}" fill="${c}" />
          <rect x="0" y="${img.height - d}" width="${img.width}" height="${d}" fill="${c}" />
          <rect x="0" y="0" width="${d}" height="${img.height}" fill="${c}" />
          <rect x="${img.width - d}" y="0" width="${d}" height="${img.height}" fill="${c}" />
          <rect x="${d}" y="${d}" width="${img.width - (d*2)}" height="${img.height - (d*2)}" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="4" />
        </g>`;
    }

    const baseViewBox = state.camera.motion === 'ken-burns' 
      ? `${startX} ${startY} ${startW} ${startH}` 
      : `0 0 ${img.width} ${img.height}`;

    const appliedFilters = filterChains.length > 0 ? `filter="${filterChains.join(' ')}"` : '';
    const bgFill = state.camera.bgTransparent ? 'transparent' : state.camera.bgColor;

    let svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${img.width} ${img.height}" width="100%" height="100%">
  <defs>
    ${defs}
  </defs>
  
  <rect x="0" y="0" width="${img.width}" height="${img.height}" fill="${bgFill}" />
  
  <svg id="camera-rig" x="0" y="0" width="${img.width}" height="${img.height}" viewBox="${baseViewBox}" preserveAspectRatio="xMidYMid slice">
    ${viewBoxAnim}
    <image href="data:${img.mime};base64,${img.b64}" width="${img.width}" height="${img.height}" x="0" y="0" ${appliedFilters} />
    <!-- INJECT_CAMERA_RIG_ELEMENTS -->
  </svg>
  
  ${grainOverlay}
  ${frameOverlay}
</svg>`;

    if (window.Glows) {
      svg = window.Glows.injectIntoSVG(svg, img.width, img.height);
    }
    if (window.DataFlows) {
      svg = window.DataFlows.injectIntoSVG(svg, img.width, img.height);
    }

    return svg;
  }
};