window.Effects = {
  buildPhotoElement(imgInfo, w, h, extraAttrs = '') {
    const imgSrc = imgInfo.b64
      ? `data:${imgInfo.mime || 'image/jpeg'};base64,${imgInfo.b64}`
      : (imgInfo.src || imgInfo.dataUrl || imgInfo.dataURL || imgInfo.data || '');

    const fitMode = imgInfo.photoFit || 'match';
    const natW = imgInfo.naturalWidth || w;
    const natH = imgInfo.naturalHeight || h;

    if (fitMode === 'contain') {
      return `<image href="${imgSrc}" xlink:href="${imgSrc}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" ${extraAttrs} />`;
    }
    if (fitMode === 'stretch') {
      return `<image href="${imgSrc}" xlink:href="${imgSrc}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" ${extraAttrs} />`;
    }
    if (fitMode === 'cover') {
      const cropZoom = Math.max(1.0, (imgInfo.cropZoom || 100) / 100);
      const cropX = imgInfo.cropX !== undefined ? imgInfo.cropX : 50;
      const cropY = imgInfo.cropY !== undefined ? imgInfo.cropY : 50;

      const baseScale = Math.max(w / natW, h / natH) * cropZoom;
      const renderW = natW * baseScale;
      const renderH = natH * baseScale;
      const overflowX = Math.max(0, renderW - w);
      const overflowY = Math.max(0, renderH - h);
      const offsetX = -(overflowX * (cropX / 100));
      const offsetY = -(overflowY * (cropY / 100));

      return `<image href="${imgSrc}" xlink:href="${imgSrc}" x="${offsetX.toFixed(2)}" y="${offsetY.toFixed(2)}" width="${renderW.toFixed(2)}" height="${renderH.toFixed(2)}" preserveAspectRatio="none" ${extraAttrs} />`;
    }

    return `<image href="${imgSrc}" xlink:href="${imgSrc}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" ${extraAttrs} />`;
  },

  build(state) {
    if (!state.image) return '';

    const w = state.image.width || 1280;
    const h = state.image.height || 720;
    const dur = state.duration || 7;
    const loop = state.loop || 'once';
    const c = state.camera || {};
    const opt = state.optical || {};

    const isBlank = !!state.image.isBlankCanvas;

    const calcTransform = (zx, zy, zz, rollDeg = 0) => {
      const safeZoom = Math.max(1.0, zz || 1.0);
      const vw = w / safeZoom;
      const vh = h / safeZoom;

      let vx = ((zx !== undefined ? zx : 50) / 100) * w - (vw / 2);
      let vy = ((zy !== undefined ? zy : 50) / 100) * h - (vh / 2);

      if (vx < 0) vx = 0;
      if (vy < 0) vy = 0;
      if (vx + vw > w) vx = w - vw;
      if (vy + vh > h) vy = h - vh;

      const tx = -vx * safeZoom;
      const ty = -vy * safeZoom;
      const rot = rollDeg !== 0 ? ` rotateZ(${rollDeg.toFixed(3)}deg)` : '';
      return `translate3d(${tx.toFixed(3)}px, ${ty.toFixed(3)}px, 0px)${rot} scale(${safeZoom.toFixed(4)})`;
    };

    const tStart = calcTransform(c.startX, c.startY, c.startZoom);
    const tEnd = calcTransform(c.endX, c.endY, c.endZoom);

    let cameraCSS = '';
    if (c.motion === 'static') {
      cameraCSS = `
        .camera-rig {
          transform-origin: 0px 0px;
          transform: ${tStart};
        }`;
    } else if (c.motion === 'perspective-tilt') {
      const pitch = c.tiltX || 0;
      const yaw = c.tiltY || 0;
      cameraCSS = `
        .camera-stage-3d {
          transform-origin: ${w / 2}px ${h / 2}px;
          transform: perspective(1000px) rotateX(${pitch}deg) rotateY(${yaw}deg);
        }
        .camera-rig {
          transform-origin: 0px 0px;
          transform: ${tStart};
        }`;
    } else if (c.motion === 'ken-burns') {
      let animTiming = `${dur}s cubic-bezier(0.37, 0, 0.63, 1) 1 normal forwards`;
      if (loop === 'pingpong') {
        animTiming = `${dur}s cubic-bezier(0.42, 0, 0.58, 1) infinite alternate`;
      } else if (loop === 'loop') {
        animTiming = `${dur}s cubic-bezier(0.37, 0, 0.63, 1) infinite normal`;
      }
      cameraCSS = `
        @keyframes camKenBurns {
          0%   { transform: ${tStart}; }
          100% { transform: ${tEnd}; }
        }
        .camera-rig {
          transform-origin: 0px 0px;
          will-change: transform;
          animation: camKenBurns ${animTiming};
        }`;
    } else if (c.motion === 'handheld-drift') {
      const sway = c.sway !== undefined ? c.sway : 1.4;
      const breathe = (c.breathe !== undefined ? c.breathe : 1.8) / 100.0;
      const baseZoom = Math.max(1.06, c.startZoom || 1.1);

      const k0 = calcTransform(c.startX, c.startY, baseZoom, 0.0);
      const k1 = calcTransform(c.startX + sway * 0.50, c.startY - sway * 0.35, baseZoom * (1.0 + breathe * 0.35), 0.18);
      const k2 = calcTransform(c.startX + sway * 0.70, c.startY + sway * 0.15, baseZoom * (1.0 + breathe * 0.75), -0.12);
      const k3 = calcTransform(c.startX + sway * 0.25, c.startY + sway * 0.55, baseZoom * (1.0 + breathe * 0.45), -0.28);
      const k4 = calcTransform(c.startX - sway * 0.45, c.startY + sway * 0.30, baseZoom * (1.0 + breathe * 0.90), 0.15);
      const k5 = calcTransform(c.startX - sway * 0.65, c.startY - sway * 0.25, baseZoom * (1.0 + breathe * 0.50), 0.25);
      const k6 = calcTransform(c.startX - sway * 0.30, c.startY - sway * 0.55, baseZoom * (1.0 + breathe * 0.20), -0.18);
      const k7 = calcTransform(c.startX + sway * 0.20, c.startY - sway * 0.25, baseZoom * (1.0 + breathe * 0.10), -0.08);

      cameraCSS = `
        @keyframes camHandheld {
          0%    { transform: ${k0}; animation-timing-function: ease-in-out; }
          12.5% { transform: ${k1}; animation-timing-function: ease-in-out; }
          25%   { transform: ${k2}; animation-timing-function: ease-in-out; }
          37.5% { transform: ${k3}; animation-timing-function: ease-in-out; }
          50%   { transform: ${k4}; animation-timing-function: ease-in-out; }
          62.5% { transform: ${k5}; animation-timing-function: ease-in-out; }
          75%   { transform: ${k6}; animation-timing-function: ease-in-out; }
          87.5% { transform: ${k7}; animation-timing-function: ease-in-out; }
          100%  { transform: ${k0}; }
        }
        .camera-rig {
          transform-origin: 0px 0px;
          will-change: transform;
          animation: camHandheld ${dur}s linear infinite normal;
        }`;
    }

    let filterDefs = `<clipPath id="viewportClip"><rect x="0" y="0" width="${w}" height="${h}" /></clipPath>`;
    let filterAttr = '';
    let extraOverlays = '';

    const bgColor = c.bgColor || '#0d1117';
    const bg = c.bgTransparent ? 'transparent' : bgColor;
    const patternType = state.image.pattern || 'blueprint';
    const gridColor = state.image.gridColor || '#1e293b';
    const gridSize = state.image.gridSize || 40;

    if (isBlank) {
      if (patternType === 'blueprint') {
        const major = gridSize * 4;
        filterDefs += `
          <pattern id="bgMinorGrid" width="${gridSize}" height="${gridSize}" patternUnits="userSpaceOnUse">
            <path d="M ${gridSize} 0 L 0 0 0 ${gridSize}" fill="none" stroke="${gridColor}" stroke-width="0.75" stroke-opacity="0.55" />
          </pattern>
          <pattern id="bgMajorGrid" width="${major}" height="${major}" patternUnits="userSpaceOnUse">
            <rect width="${major}" height="${major}" fill="url(#bgMinorGrid)" />
            <path d="M ${major} 0 L 0 0 0 ${major}" fill="none" stroke="${gridColor}" stroke-width="1.6" stroke-opacity="0.95" />
          </pattern>`;
      } else if (patternType === 'dots') {
        filterDefs += `
          <pattern id="bgDotGrid" width="${gridSize}" height="${gridSize}" patternUnits="userSpaceOnUse">
            <circle cx="${gridSize / 2}" cy="${gridSize / 2}" r="1.6" fill="${gridColor}" />
          </pattern>`;
      } else if (patternType === 'graph') {
        const sub = Math.max(8, Math.round(gridSize / 4));
        filterDefs += `
          <pattern id="bgGraphSub" width="${sub}" height="${sub}" patternUnits="userSpaceOnUse">
            <path d="M ${sub} 0 L 0 0 0 ${sub}" fill="none" stroke="${gridColor}" stroke-width="0.5" stroke-opacity="0.35" />
          </pattern>
          <pattern id="bgGraphGrid" width="${gridSize}" height="${gridSize}" patternUnits="userSpaceOnUse">
            <rect width="${gridSize}" height="${gridSize}" fill="url(#bgGraphSub)" />
            <path d="M ${gridSize} 0 L 0 0 0 ${gridSize}" fill="none" stroke="${gridColor}" stroke-width="1.1" stroke-opacity="0.8" />
          </pattern>`;
      } else if (patternType === 'dark-radial') {
        filterDefs += `
          <radialGradient id="bgRadialGrad" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stop-color="${gridColor}" stop-opacity="0.65" />
            <stop offset="100%" stop-color="${bgColor}" stop-opacity="1" />
          </radialGradient>`;
      }
    }

    if (opt.type === 'focus-pull') {
      filterDefs += `<filter id="opt-focus" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${opt.startBlur}">`;
      if (opt.startBlur !== opt.endBlur) {
        const fDur = opt.focusDur || dur;
        if (loop === 'pingpong') {
          filterDefs += `<animate attributeName="stdDeviation" values="${opt.startBlur}; ${opt.endBlur}; ${opt.startBlur}" keyTimes="0; 0.5; 1" calcMode="spline" keySplines="0.42 0 0.58 1; 0.42 0 0.58 1" dur="${fDur * 2}s" repeatCount="indefinite" fill="freeze" />`;
        } else {
          const repeat = loop === 'once' ? '1' : 'indefinite';
          filterDefs += `<animate attributeName="stdDeviation" values="${opt.startBlur}; ${opt.endBlur}" keyTimes="0; 1" calcMode="spline" keySplines="0.42 0 0.58 1" dur="${fDur}s" repeatCount="${repeat}" fill="freeze" />`;
        }
      }
      filterDefs += `</feGaussianBlur></filter>`;
      filterAttr = `filter="url(#opt-focus)"`;

    } else if (opt.type === 'tilt-shift' && !isBlank) {
      const tShape = opt.tsShape || 'horizontal';
      const cw = opt.tsWidth / 2;
      const feather = Math.max(8, opt.tsWidth * 0.45);

      filterDefs += `<filter id="opt-ts-blur" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="${opt.tsBlur}" />
      </filter>`;

      if (tShape === 'horizontal') {
        const topClear = Math.max(0, opt.tsPos - cw);
        const topSolid = Math.max(0, topClear - feather);
        const botClear = Math.min(100, opt.tsPos + cw);
        const botSolid = Math.min(100, botClear + feather);
        filterDefs += `
          <linearGradient id="ts-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="white" stop-opacity="1" />
            <stop offset="${topSolid.toFixed(1)}%" stop-color="white" stop-opacity="1" />
            <stop offset="${topClear.toFixed(1)}%" stop-color="white" stop-opacity="0" />
            <stop offset="${botClear.toFixed(1)}%" stop-color="white" stop-opacity="0" />
            <stop offset="${botSolid.toFixed(1)}%" stop-color="white" stop-opacity="1" />
            <stop offset="100%" stop-color="white" stop-opacity="1" />
          </linearGradient>`;
      } else if (tShape === 'vertical') {
        const leftClear = Math.max(0, opt.tsPosX - cw);
        const leftSolid = Math.max(0, leftClear - feather);
        const rightClear = Math.min(100, opt.tsPosX + cw);
        const rightSolid = Math.min(100, rightClear + feather);
        filterDefs += `
          <linearGradient id="ts-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="white" stop-opacity="1" />
            <stop offset="${leftSolid.toFixed(1)}%" stop-color="white" stop-opacity="1" />
            <stop offset="${leftClear.toFixed(1)}%" stop-color="white" stop-opacity="0" />
            <stop offset="${rightClear.toFixed(1)}%" stop-color="white" stop-opacity="0" />
            <stop offset="${rightSolid.toFixed(1)}%" stop-color="white" stop-opacity="1" />
            <stop offset="100%" stop-color="white" stop-opacity="1" />
          </linearGradient>`;
      } else if (tShape === 'radial') {
        const core = Math.max(0, opt.tsWidth);
        const outer = Math.min(100, core + feather * 1.4);
        filterDefs += `
          <radialGradient id="ts-grad" cx="${opt.tsPosX}%" cy="${opt.tsPos}%" r="70%">
            <stop offset="0%" stop-color="white" stop-opacity="0" />
            <stop offset="${core.toFixed(1)}%" stop-color="white" stop-opacity="0" />
            <stop offset="${outer.toFixed(1)}%" stop-color="white" stop-opacity="1" />
            <stop offset="100%" stop-color="white" stop-opacity="1" />
          </radialGradient>`;
      }

      filterDefs += `<mask id="ts-mask"><rect x="0" y="0" width="${w}" height="${h}" fill="url(#ts-grad)" /></mask>`;
      extraOverlays = this.buildPhotoElement(state.image, w, h, `filter="url(#opt-ts-blur)" mask="url(#ts-mask)" pointer-events="none"`);

    } else if (opt.type === 'motion-blur') {
      const rad = opt.mbAng * (Math.PI / 180);
      const bx = Math.abs(Math.cos(rad) * opt.mbInt).toFixed(2);
      const by = Math.abs(Math.sin(rad) * opt.mbInt).toFixed(2);
      filterDefs += `<filter id="opt-mb-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${bx} ${by}" /></filter>`;
      filterAttr = `filter="url(#opt-mb-blur)"`;
    }

    let baseSurfaceMarkup = '';
    if (isBlank) {
      let baseRects = c.bgTransparent ? '' : `<rect x="0" y="0" width="${w}" height="${h}" fill="${bgColor}" />`;
      if (patternType === 'blueprint') {
        baseRects += `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#bgMajorGrid)" />`;
      } else if (patternType === 'dots') {
        baseRects += `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#bgDotGrid)" />`;
      } else if (patternType === 'graph') {
        baseRects += `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#bgGraphGrid)" />`;
      } else if (patternType === 'dark-radial') {
        baseRects += `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#bgRadialGrad)" />`;
      }
      baseSurfaceMarkup = `<g ${filterAttr}>${baseRects}</g>`;
    } else {
      const bgRectIfContain = (state.image.photoFit === 'contain' && !c.bgTransparent)
        ? `<rect x="0" y="0" width="${w}" height="${h}" fill="${bgColor}" />`
        : '';
      baseSurfaceMarkup = `<g ${filterAttr}>${bgRectIfContain}${this.buildPhotoElement(state.image, w, h)}</g>`;
    }

    let frameOverlay = '';
    if (state.overlays && state.overlays.frame) {
      const fd = state.overlays.frameDepth || 40;
      let fcol = '#3e2723';
      if (state.overlays.frameStyle === 'gold') fcol = '#d4af37';
      else if (state.overlays.frameStyle === 'matte') fcol = '#f5f5f5';
      else if (state.overlays.frameStyle === 'obsidian') fcol = '#111111';

      frameOverlay = `
        <rect x="${fd / 2}" y="${fd / 2}" width="${w - fd}" height="${h - fd}" fill="none" stroke="${fcol}" stroke-width="${fd}" pointer-events="none" />
        <rect x="${fd}" y="${fd}" width="${w - (fd * 2)}" height="${h - (fd * 2)}" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="4" pointer-events="none" />
      `;
    }

    // preserveAspectRatio="xMidYMid meet" locks the HxW proportions so downloaded SVGs and HTML files never stretch or distort
    return `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" style="background-color: ${bg}; width: 100%; height: 100%;">
        <defs>
            ${filterDefs}
            <style>
              ${cameraCSS}
            </style>
        </defs>
        
        <!-- INNER CAMERA LENS -->
        <g clip-path="url(#viewportClip)">
          <g class="camera-stage-3d">
            <g class="camera-rig">
              ${baseSurfaceMarkup}
              ${extraOverlays}
              <!-- INJECT_CAMERA_RIG_ELEMENTS -->
            </g>
          </g>
        </g>

        ${frameOverlay}
    </svg>
    `;
  }
};