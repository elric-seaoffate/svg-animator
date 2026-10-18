window.Effects = {
  build(state) {
    if (!state.image) return '';
    
    const w = state.image.width || 800;
    const h = state.image.height || 600;
    const dur = state.duration || 7;
    const loop = state.loop || 'once';
    const c = state.camera || {};
    const opt = state.optical || {};
    
    const imgSrc = state.image.b64 
        ? `data:${state.image.mime || 'image/jpeg'};base64,${state.image.b64}` 
        : (state.image.src || state.image.dataUrl || state.image.dataURL || state.image.data || '');

    const calcVB = (zx, zy, zz) => {
        // Enforce minimum zoom of 1.0 (cannot zoom out past image bounds)
        const safeZoom = Math.max(1.0, zz); 
        const vw = w / safeZoom;
        const vh = h / safeZoom;
        
        // Calculate raw X and Y
        let vx = (zx / 100) * w - (vw / 2);
        let vy = (zy / 100) * h - (vh / 2);
        
        // STRICT CLAMPING: Prevent the camera lens from panning off the image to eliminate black bars
        if (vx < 0) vx = 0;
        if (vy < 0) vy = 0;
        if (vx + vw > w) vx = w - vw;
        if (vy + vh > h) vy = h - vh;
        
        return `${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}`;
    };

    const vbStart = calcVB(c.startX, c.startY, c.startZoom);
    const vbEnd = calcVB(c.endX, c.endY, c.endZoom);

    let viewBoxAnim = '';
    if (c.motion === 'static' || c.motion === 'perspective-tilt') {
        viewBoxAnim = `<set attributeName="viewBox" to="${vbStart}" fill="freeze" />`;
    } else if (c.motion === 'ken-burns') {
        if (loop === 'pingpong') {
            viewBoxAnim = `<animate attributeName="viewBox" values="${vbStart}; ${vbEnd}; ${vbStart}" dur="${dur * 2}s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1; 0.4 0 0.6 1" />`;
        } else if (loop === 'loop') {
            viewBoxAnim = `<animate attributeName="viewBox" from="${vbStart}" to="${vbEnd}" dur="${dur}s" repeatCount="indefinite" />`;
        } else {
            viewBoxAnim = `<animate attributeName="viewBox" from="${vbStart}" to="${vbEnd}" dur="${dur}s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1" />`;
        }
    } else if (c.motion === 'handheld-drift') {
        const sway = c.sway || 1.4;
        const v1 = calcVB(c.startX, c.startY, c.startZoom);
        const v2 = calcVB(c.startX + sway, c.startY - (sway/2), Math.max(1.0, c.startZoom * 0.98));
        const v3 = calcVB(c.startX - (sway/2), c.startY + sway, c.startZoom * 1.02);
        viewBoxAnim = `<animate attributeName="viewBox" values="${v1}; ${v2}; ${v3}; ${v1}" dur="${dur * 1.5}s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1; 0.4 0 0.6 1; 0.4 0 0.6 1" />`;
    }

    let filterDefs = '';
    let filterAttr = '';
    let extraOverlays = '';

    if (opt.type === 'focus-pull') {
        filterDefs += `<filter id="opt-focus" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${opt.startBlur}">`;
        if (opt.startBlur !== opt.endBlur) {
            let fDur = opt.focusDur || dur;
            let vals = loop === 'pingpong' ? `${opt.startBlur}; ${opt.endBlur}; ${opt.startBlur}` : `${opt.startBlur}; ${opt.endBlur}`;
            let animDur = loop === 'pingpong' ? fDur * 2 : fDur;
            let repeat = loop === 'once' ? '1' : 'indefinite';
            filterDefs += `<animate attributeName="stdDeviation" values="${vals}" dur="${animDur}s" repeatCount="${repeat}" fill="freeze" calcMode="spline" keySplines="0.4 0 0.6 1" />`;
        }
        filterDefs += `</feGaussianBlur></filter>`;
        filterAttr = `filter="url(#opt-focus)"`;
        
    } else if (opt.type === 'tilt-shift') {
        const tShape = opt.tsShape || 'horizontal';
        const cw = opt.tsWidth / 2;
        
        filterDefs += `<filter id="opt-ts-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="${opt.tsBlur}" />
        </filter>`;
        
        if (tShape === 'horizontal') {
            const topGrad = Math.max(0, opt.tsPos - cw);
            const botGrad = Math.min(100, opt.tsPos + cw);
            filterDefs += `
              <linearGradient id="ts-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="white" stop-opacity="1" />
                  <stop offset="${topGrad}%" stop-color="white" stop-opacity="1" />
                  <stop offset="${topGrad + 5}%" stop-color="white" stop-opacity="0" />
                  <stop offset="${botGrad - 5}%" stop-color="white" stop-opacity="0" />
                  <stop offset="${botGrad}%" stop-color="white" stop-opacity="1" />
                  <stop offset="100%" stop-color="white" stop-opacity="1" />
              </linearGradient>`;
        } else if (tShape === 'vertical') {
            const leftGrad = Math.max(0, opt.tsPosX - cw);
            const rightGrad = Math.min(100, opt.tsPosX + cw);
            filterDefs += `
              <linearGradient id="ts-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="white" stop-opacity="1" />
                  <stop offset="${leftGrad}%" stop-color="white" stop-opacity="1" />
                  <stop offset="${leftGrad + 5}%" stop-color="white" stop-opacity="0" />
                  <stop offset="${rightGrad - 5}%" stop-color="white" stop-opacity="0" />
                  <stop offset="${rightGrad}%" stop-color="white" stop-opacity="1" />
                  <stop offset="100%" stop-color="white" stop-opacity="1" />
              </linearGradient>`;
        } else if (tShape === 'radial') {
            const core = Math.max(0, opt.tsWidth);
            filterDefs += `
              <radialGradient id="ts-grad" cx="${opt.tsPosX}%" cy="${opt.tsPos}%" r="70%">
                  <stop offset="0%" stop-color="white" stop-opacity="0" />
                  <stop offset="${core}%" stop-color="white" stop-opacity="0" />
                  <stop offset="${core + 15}%" stop-color="white" stop-opacity="1" />
                  <stop offset="100%" stop-color="white" stop-opacity="1" />
              </radialGradient>`;
        }
        
        filterDefs += `<mask id="ts-mask"><rect x="0" y="0" width="${w}" height="${h}" fill="url(#ts-grad)" /></mask>`;
        extraOverlays = `<image href="${imgSrc}" width="${w}" height="${h}" filter="url(#opt-ts-blur)" mask="url(#ts-mask)" preserveAspectRatio="xMidYMid slice" />`;
        
    } else if (opt.type === 'motion-blur') {
        const rad = opt.mbAng * (Math.PI / 180);
        const bx = Math.abs(Math.cos(rad) * opt.mbInt).toFixed(1);
        const by = Math.abs(Math.sin(rad) * opt.mbInt).toFixed(1);
        filterDefs += `<filter id="opt-mb-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${bx},${by}" /></filter>`;
        filterAttr = `filter="url(#opt-mb-blur)"`;
    }

    let frameOverlay = '';
    if (state.overlays.frame) {
        const fd = state.overlays.frameDepth || 40;
        let fcol = '#3e2723'; 
        if (state.overlays.frameStyle === 'gold') fcol = '#d4af37';
        else if (state.overlays.frameStyle === 'matte') fcol = '#f5f5f5';
        else if (state.overlays.frameStyle === 'obsidian') fcol = '#111111';
        
        frameOverlay = `
          <rect x="${fd/2}" y="${fd/2}" width="${w - fd}" height="${h - fd}" fill="none" stroke="${fcol}" stroke-width="${fd}" />
          <rect x="${fd}" y="${fd}" width="${w - (fd * 2)}" height="${h - (fd * 2)}" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="4" />
        `;
    }

    const transformStyle = c.motion === 'perspective-tilt' 
      ? `transform-origin: center; transform: perspective(800px) rotateX(${c.tiltY || 0}deg) rotateY(${c.tiltX || 0}deg);` 
      : '';

    const bg = c.bgTransparent ? 'transparent' : c.bgColor;

    return `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" style="background-color: ${bg}; width: 100%; height: 100%;">
        <defs>
            ${filterDefs}
        </defs>
        
        <!-- INNER CAMERA LENS -->
        <svg x="0" y="0" width="${w}" height="${h}" viewBox="${vbStart}" style="${transformStyle}">
            ${viewBoxAnim}
            <image href="${imgSrc}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" ${filterAttr} />
            ${extraOverlays}
            <!-- INJECT_CAMERA_RIG_ELEMENTS -->
        </svg>

        ${frameOverlay}
    </svg>
    `;
  }
};