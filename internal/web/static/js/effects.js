window.Effects = {
  buildPhotoElement(imgInfo, w, h, extraAttrs = '') {
    let imgSrc = '';
    if (imgInfo.b64) {
      imgSrc = imgInfo.b64.startsWith('data:')
        ? imgInfo.b64
        : `data:${imgInfo.mime || 'image/jpeg'};base64,${imgInfo.b64}`;
    } else {
      imgSrc = imgInfo.src || imgInfo.dataUrl || imgInfo.dataURL || imgInfo.data || '';
    }

    const fitMode = imgInfo.photoFit || 'match';
    const natW = imgInfo.naturalWidth || w;
    const natH = imgInfo.naturalHeight || h;

    const crop = imgInfo.crop;
    const hasCrop = crop && crop.enabled !== false && (
      (crop.sourceWidth || crop.width) > 0 &&
      (crop.sourceHeight || crop.height) > 0
    );

    if (hasCrop) {
      const sx = Math.max(0, crop.sourceX !== undefined ? crop.sourceX : (crop.x || 0));
      const sy = Math.max(0, crop.sourceY !== undefined ? crop.sourceY : (crop.y || 0));
      const sw = crop.sourceWidth !== undefined ? crop.sourceWidth : (crop.width || natW);
      const sh = crop.sourceHeight !== undefined ? crop.sourceHeight : (crop.height || natH);

      let par = 'xMidYMid meet';
      if (fitMode === 'cover') {
        par = 'xMidYMid slice';
      } else if (fitMode === 'stretch') {
        par = 'none';
      } else if (fitMode === 'contain' || fitMode === 'match') {
        par = 'xMidYMid meet';
      }

      return `<svg x="0" y="0" width="${w}" height="${h}" viewBox="${sx} ${sy} ${sw} ${sh}" preserveAspectRatio="${par}" ${extraAttrs} overflow="hidden"><image href="${imgSrc}" xlink:href="${imgSrc}" x="0" y="0" width="${natW}" height="${natH}" /></svg>`;
    }

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

  buildMiteredFrame(prefix, stopsBright1, stopsBright2, stopsDark1, stopsDark2, filletBrightCols, filletDarkCols, w, h, d, opts = {}) {
    const lightingOn = opts.frameLighting !== false;
    const lightDir = opts.frameLightDir || 'tl';
    const lightInt = (opts.frameLightInt !== undefined ? opts.frameLightInt : 70) / 100.0;
    const shadowOpacity = opts.frameShadow !== undefined ? opts.frameShadow : 0.55;
    const showFillet = opts.frameFillet !== false;

    const isFrontLight = !lightingOn || lightDir === 'front';

    const fD = d < 24 ? 2.5 : 4.5;
    const shD = Math.max(4, Math.round((d < 24 ? 8 : 16) * (0.4 + shadowOpacity * 0.9)));

    let topStops = stopsBright1;
    let leftStops = stopsBright2;
    let rightStops = stopsDark1;
    let bottomStops = stopsDark2;

    let fTopUrl = `url(#${prefix}FilletBright)`;
    let fLeftUrl = `url(#${prefix}FilletBright)`;
    let fRightUrl = `url(#${prefix}FilletDark)`;
    let fBotUrl = `url(#${prefix}FilletDark)`;

    if (isFrontLight) {
      topStops = stopsBright1;
      leftStops = stopsBright1;
      rightStops = stopsBright1;
      bottomStops = stopsBright1;
      fLeftUrl = fTopUrl;
      fRightUrl = fTopUrl;
      fBotUrl = fTopUrl;
    } else if (lightDir === 'tr') {
      topStops = stopsBright1;
      rightStops = stopsBright2;
      leftStops = stopsDark1;
      bottomStops = stopsDark2;
      fTopUrl = `url(#${prefix}FilletBright)`;
      fRightUrl = `url(#${prefix}FilletBright)`;
      fLeftUrl = `url(#${prefix}FilletDark)`;
      fBotUrl = `url(#${prefix}FilletDark)`;
    } else if (lightDir === 'bl') {
      bottomStops = stopsBright1;
      leftStops = stopsBright2;
      rightStops = stopsDark1;
      topStops = stopsDark2;
      fBotUrl = `url(#${prefix}FilletBright)`;
      fLeftUrl = `url(#${prefix}FilletBright)`;
      fRightUrl = `url(#${prefix}FilletDark)`;
      fTopUrl = `url(#${prefix}FilletDark)`;
    } else if (lightDir === 'br') {
      bottomStops = stopsBright1;
      rightStops = stopsBright2;
      leftStops = stopsDark1;
      topStops = stopsDark2;
      fBotUrl = `url(#${prefix}FilletBright)`;
      fRightUrl = `url(#${prefix}FilletBright)`;
      fLeftUrl = `url(#${prefix}FilletDark)`;
      fTopUrl = `url(#${prefix}FilletDark)`;
    }

    const renderStops = (arr) => arr.map(([off, col]) => `<stop offset="${off}%" stop-color="${col}" />`).join('');

    let defs = `
      <linearGradient id="${prefix}Top" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${d}">${renderStops(topStops)}</linearGradient>
      <linearGradient id="${prefix}Bottom" gradientUnits="userSpaceOnUse" x1="0" y1="${h}" x2="0" y2="${h - d}">${renderStops(bottomStops)}</linearGradient>
      <linearGradient id="${prefix}Left" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${d}" y2="0">${renderStops(leftStops)}</linearGradient>
      <linearGradient id="${prefix}Right" gradientUnits="userSpaceOnUse" x1="${w}" y1="0" x2="${w - d}" y2="0">${renderStops(rightStops)}</linearGradient>
      <linearGradient id="${prefix}RebateTop" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#000000" stop-opacity="${shadowOpacity}" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="${prefix}RebateBottom" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stop-color="#000000" stop-opacity="${shadowOpacity}" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="${prefix}RebateLeft" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#000000" stop-opacity="${shadowOpacity}" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="${prefix}RebateRight" x1="100%" y1="0%" x2="0%" y2="0%">
        <stop offset="0%" stop-color="#000000" stop-opacity="${shadowOpacity}" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0" />
      </linearGradient>
    `;

    let filletPolys = '';
    if (showFillet && filletBrightCols && filletDarkCols) {
      defs += `
        <linearGradient id="${prefix}FilletBright" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${filletBrightCols[0]}" />
          <stop offset="100%" stop-color="${filletBrightCols[1]}" />
        </linearGradient>
        <linearGradient id="${prefix}FilletDark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${filletDarkCols[0]}" />
          <stop offset="100%" stop-color="${filletDarkCols[1]}" />
        </linearGradient>
      `;
      const fi = d - fD;
      filletPolys = `
        <polygon points="${fi},${fi} ${w - fi},${fi} ${w - d},${d} ${d},${d}" fill="${fTopUrl}" />
        <polygon points="${fi},${h - fi} ${w - fi},${h - fi} ${w - d},${h - d} ${d},${h - d}" fill="${fBotUrl}" />
        <polygon points="${fi},${fi} ${d},${d} ${d},${h - d} ${fi},${h - fi}" fill="${fLeftUrl}" />
        <polygon points="${w - fi},${fi} ${w - d},${d} ${w - d},${h - d} ${w - fi},${h - fi}" fill="${fRightUrl}" />
      `;
    }

    let lightingBevelOverlay = '';
    if (lightingOn) {
      if (lightDir === 'front') {
        const diff = ((lightInt - 0.5) * 0.36).toFixed(3);
        const uniformCol = lightInt >= 0.5
          ? `rgba(255,255,255,${diff})`
          : `rgba(0,0,0,${Math.abs(diff)})`;
        lightingBevelOverlay = `
          <polygon points="0,0 ${w},0 ${w - d},${d} ${d},${d}" fill="${uniformCol}" />
          <polygon points="0,${h} ${w},${h} ${w - d},${h - d} ${d},${h - d}" fill="${uniformCol}" />
          <polygon points="0,0 ${d},${d} ${d},${h - d} 0,${h}" fill="${uniformCol}" />
          <polygon points="${w},0 ${w - d},${d} ${w - d},${h - d} ${w},${h}" fill="${uniformCol}" />
        `;
      } else if (lightInt > 0) {
        const specOp = (lightInt * 0.24).toFixed(3);
        const shadeOp = (lightInt * 0.44).toFixed(3);
        const topCol = (lightDir === 'tl' || lightDir === 'tr') ? `rgba(255,255,255,${specOp})` : `rgba(0,0,0,${shadeOp})`;
        const botCol = (lightDir === 'bl' || lightDir === 'br') ? `rgba(255,255,255,${specOp})` : `rgba(0,0,0,${shadeOp})`;
        const leftCol = (lightDir === 'tl' || lightDir === 'bl') ? `rgba(255,255,255,${specOp})` : `rgba(0,0,0,${shadeOp})`;
        const rightCol = (lightDir === 'tr' || lightDir === 'br') ? `rgba(255,255,255,${specOp})` : `rgba(0,0,0,${shadeOp})`;

        lightingBevelOverlay = `
          <polygon points="0,0 ${w},0 ${w - d},${d} ${d},${d}" fill="${topCol}" />
          <polygon points="0,${h} ${w},${h} ${w - d},${h - d} ${d},${h - d}" fill="${botCol}" />
          <polygon points="0,0 ${d},${d} ${d},${h - d} 0,${h}" fill="${leftCol}" />
          <polygon points="${w},0 ${w - d},${d} ${w - d},${h - d} ${w},${h}" fill="${rightCol}" />
        `;
      }
    }

    let shadowRects = '';
    if (shadowOpacity > 0.01) {
      if (isFrontLight) {
        shadowRects = `
          <rect x="${d}" y="${d}" width="${w - 2 * d}" height="${shD}" fill="url(#${prefix}RebateTop)" />
          <rect x="${d}" y="${h - d - shD}" width="${w - 2 * d}" height="${shD}" fill="url(#${prefix}RebateBottom)" />
          <rect x="${d}" y="${d}" width="${shD}" height="${h - 2 * d}" fill="url(#${prefix}RebateLeft)" />
          <rect x="${w - d - shD}" y="${d}" width="${shD}" height="${h - 2 * d}" fill="url(#${prefix}RebateRight)" />
        `;
      } else {
        const castFromTop = lightDir === 'tl' || lightDir === 'tr';
        const castFromLeft = lightDir === 'tl' || lightDir === 'bl';

        if (castFromTop) {
          shadowRects += `<rect x="${d}" y="${d}" width="${w - 2 * d}" height="${shD}" fill="url(#${prefix}RebateTop)" />`;
        } else {
          shadowRects += `<rect x="${d}" y="${h - d - shD}" width="${w - 2 * d}" height="${shD}" fill="url(#${prefix}RebateBottom)" />`;
        }

        if (castFromLeft) {
          shadowRects += `<rect x="${d}" y="${d}" width="${shD}" height="${h - 2 * d}" fill="url(#${prefix}RebateLeft)" />`;
        } else {
          shadowRects += `<rect x="${w - d - shD}" y="${d}" width="${shD}" height="${h - 2 * d}" fill="url(#${prefix}RebateRight)" />`;
        }
      }
    }

    const overlay = `
      <g id="frameAssembly" pointer-events="none">
        <polygon points="0,0 ${w},0 ${w - d},${d} ${d},${d}" fill="url(#${prefix}Top)" />
        <polygon points="0,${h} ${w},${h} ${w - d},${h - d} ${d},${h - d}" fill="url(#${prefix}Bottom)" />
        <polygon points="0,0 ${d},${d} ${d},${h - d} 0,${h}" fill="url(#${prefix}Left)" />
        <polygon points="${w},0 ${w - d},${d} ${w - d},${h - d} ${w},${h}" fill="url(#${prefix}Right)" />
        ${lightingBevelOverlay}
        <line x1="0" y1="0" x2="${d}" y2="${d}" stroke="#000" stroke-opacity="0.55" stroke-width="1.2" />
        <line x1="${w}" y1="0" x2="${w - d}" y2="${d}" stroke="#000" stroke-opacity="0.55" stroke-width="1.2" />
        <line x1="0" y1="${h}" x2="${d}" y2="${h - d}" stroke="#000" stroke-opacity="0.6" stroke-width="1.2" />
        <line x1="${w}" y1="${h}" x2="${w - d}" y2="${h - d}" stroke="#000" stroke-opacity="0.6" stroke-width="1.2" />
        ${filletPolys}
        ${shadowRects}
        <rect x="${d}" y="${d}" width="${w - 2 * d}" height="${h - 2 * d}" fill="none" stroke="rgba(0,0,0,0.65)" stroke-width="1.2" />
      </g>
    `;

    return { defs, overlay };
  },

  buildFrameMarkup(overlaysCfg, w, h) {
    if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.describeFrame === 'function') {
      const bridgeDesc = window.EngineBridge.describeFrame(overlaysCfg, w, h);
      if (bridgeDesc && (bridgeDesc.markup !== undefined || bridgeDesc.defs !== undefined)) {
        return { defs: bridgeDesc.defs || '', overlay: bridgeDesc.markup || '' };
      }
    }

    const style = overlaysCfg.frameStyle || 'walnut';
    const rawDepth = overlaysCfg.frameDepth || 44;
    const maxD = Math.min(w, h) / 2 - 12;
    const d = Math.max(10, Math.min(rawDepth, maxD));

    if (style === 'walnut') {
      return this.buildMiteredFrame(
        'walnut',
        [[0, '#5a3821'], [40, '#462a17'], [85, '#351e0e'], [100, '#281408']],
        [[0, '#52321c'], [40, '#402513'], [85, '#30190b'], [100, '#221106']],
        [[0, '#2b1509'], [40, '#210f05'], [85, '#180a03'], [100, '#100501']],
        [[0, '#251106'], [40, '#1c0b03'], [85, '#140702'], [100, '#0b0301']],
        ['#dfbe76', '#f5e1ad'],
        ['#805d1e', '#5c4010'],
        w, h, d, overlaysCfg
      );
    }

    if (style === 'mahogany') {
      return this.buildMiteredFrame(
        'mahog',
        [[0, '#6e1e14'], [35, '#54140c'], [80, '#3d0c06'], [100, '#290602']],
        [[0, '#631a10'], [35, '#4a110a'], [80, '#340904'], [100, '#210401']],
        [[0, '#380b06'], [40, '#290603'], [85, '#1c0301'], [100, '#120100']],
        [[0, '#300804'], [40, '#220402'], [85, '#160201'], [100, '#0d0100']],
        ['#e8c872', '#fff0b8'],
        ['#8c6718', '#5e430b'],
        w, h, d, overlaysCfg
      );
    }

    if (style === 'gold') {
      return this.buildMiteredFrame(
        'gold',
        [[0, '#fff1c2'], [25, '#e2b448'], [55, '#ffd56b'], [85, '#c5922e'], [100, '#a6761c']],
        [[0, '#f8e4a8'], [25, '#d4a539'], [55, '#f0c458'], [85, '#b68322'], [100, '#946513']],
        [[0, '#996815'], [35, '#734b07'], [70, '#8c5f11'], [100, '#553402']],
        [[0, '#8c5d10'], [35, '#664004'], [70, '#7d520c'], [100, '#4a2c01']],
        ['#fff8dc', '#ffe484'],
        ['#7a5409', '#4d3302'],
        w, h, d, overlaysCfg
      );
    }

    if (style === 'silver') {
      return this.buildMiteredFrame(
        'silver',
        [[0, '#f8fafc'], [25, '#cbd5e1'], [55, '#e2e8f0'], [85, '#94a3b8'], [100, '#64748b']],
        [[0, '#f1f5f9'], [25, '#cbd5e1'], [55, '#dce4ee'], [85, '#8696a8'], [100, '#475569']],
        [[0, '#64748b'], [40, '#475569'], [80, '#334155'], [100, '#1e293b']],
        [[0, '#475569'], [40, '#334155'], [80, '#1e293b'], [100, '#0f172a']],
        ['#ffffff', '#e2e8f0'],
        ['#475569', '#1e293b'],
        w, h, d, overlaysCfg
      );
    }

    if (style === 'matte') {
      return this.buildMiteredFrame(
        'matte',
        [[0, '#f8f6f0'], [90, '#f2efe6'], [100, '#e6e2d6']],
        [[0, '#f5f2eb'], [90, '#ede9df'], [100, '#ded9cc']],
        [[0, '#ebe7dd'], [90, '#e0dbd0'], [100, '#cfcac0']],
        [[0, '#e6e1d6'], [90, '#dad5c9'], [100, '#c7c1b4']],
        ['#ffffff', '#f5f3ed'],
        ['#c7c2b6', '#a8a295'],
        w, h, d, overlaysCfg
      );
    }

    if (style === 'obsidian') {
      return this.buildMiteredFrame(
        'obsidian',
        [[0, '#2c323c'], [35, '#1e232a'], [85, '#13171c'], [100, '#0a0d10']],
        [[0, '#262b34'], [35, '#1a1e24'], [85, '#101318'], [100, '#080a0d']],
        [[0, '#16191f'], [40, '#0f1216'], [85, '#090b0e'], [100, '#040507']],
        [[0, '#12151a'], [40, '#0b0d11'], [85, '#06080a'], [100, '#020304']],
        ['#58a6ff', '#1f6feb'],
        ['#161b22', '#0d1117'],
        w, h, d, overlaysCfg
      );
    }

    if (style === 'blueprint-border') {
      const outerPad = Math.max(8, Math.round(d * 0.35));
      const innerPad = d;
      const bw = w - innerPad * 2;
      const bh = h - innerPad * 2;
      const tbW = Math.min(280, Math.round(bw * 0.35));
      const tbH = Math.max(34, Math.min(54, Math.round(bh * 0.1)));
      const tbX = w - innerPad - tbW;
      const tbY = h - innerPad - tbH;
      const showTitleBlock = overlaysCfg.frameFillet !== false;

      let ticks = '';
      const cols = ['1', '2', '3', '4'];
      cols.forEach((lbl, idx) => {
        const cx = innerPad + (bw / 4) * (idx + 0.5);
        const tickX = innerPad + (bw / 4) * (idx + 1);
        if (idx < 3) {
          ticks += `<line x1="${tickX}" y1="${outerPad}" x2="${tickX}" y2="${innerPad}" stroke="#58a6ff" stroke-width="1" stroke-opacity="0.6" />`;
          ticks += `<line x1="${tickX}" y1="${h - innerPad}" x2="${tickX}" y2="${h - outerPad}" stroke="#58a6ff" stroke-width="1" stroke-opacity="0.6" />`;
        }
        ticks += `<text x="${cx}" y="${outerPad + (innerPad - outerPad) * 0.68}" fill="#58a6ff" font-family="monospace" font-size="${Math.max(9, Math.round((innerPad - outerPad) * 0.55))}" text-anchor="middle">${lbl}</text>`;
      });

      const rows = ['A', 'B', 'C', 'D'];
      rows.forEach((lbl, idx) => {
        const cy = innerPad + (bh / 4) * (idx + 0.5);
        const tickY = innerPad + (bh / 4) * (idx + 1);
        if (idx < 3) {
          ticks += `<line x1="${outerPad}" y1="${tickY}" x2="${innerPad}" y2="${tickY}" stroke="#58a6ff" stroke-width="1" stroke-opacity="0.6" />`;
          ticks += `<line x1="${w - innerPad}" y1="${tickY}" x2="${w - outerPad}" y2="${tickY}" stroke="#58a6ff" stroke-width="1" stroke-opacity="0.6" />`;
        }
        ticks += `<text x="${outerPad + (innerPad - outerPad) * 0.5}" y="${cy + 3}" fill="#58a6ff" font-family="monospace" font-size="${Math.max(9, Math.round((innerPad - outerPad) * 0.55))}" text-anchor="middle">${lbl}</text>`;
      });

      const titleBlockMarkup = showTitleBlock ? `
          <rect x="${tbX}" y="${tbY}" width="${tbW}" height="${tbH}" fill="#0b1320" fill-opacity="0.92" stroke="#58a6ff" stroke-width="1.5" />
          <line x1="${tbX}" y1="${tbY + tbH * 0.5}" x2="${tbX + tbW}" y2="${tbY + tbH * 0.5}" stroke="#58a6ff" stroke-width="1" stroke-opacity="0.6" />
          <line x1="${tbX + tbW * 0.62}" y1="${tbY + tbH * 0.5}" x2="${tbX + tbW * 0.62}" y2="${tbY + tbH}" stroke="#58a6ff" stroke-width="1" stroke-opacity="0.6" />
          <text x="${tbX + 8}" y="${tbY + tbH * 0.35}" fill="#e6edf3" font-family="monospace" font-size="${Math.max(9, Math.round(tbH * 0.24))}" font-weight="bold">SVG ANIMATOR STUDIO // SPEC</text>
          <text x="${tbX + 8}" y="${tbY + tbH * 0.82}" fill="#58a6ff" font-family="monospace" font-size="${Math.max(8, Math.round(tbH * 0.21))}">RES: ${w}x${h}</text>
          <text x="${tbX + tbW * 0.66}" y="${tbY + tbH * 0.82}" fill="#58a6ff" font-family="monospace" font-size="${Math.max(8, Math.round(tbH * 0.21))}">REV 1.2</text>
      ` : '';

      const overlay = `
        <g id="frameAssembly" pointer-events="none">
          <path d="M 0,0 L ${w},0 L ${w},${h} L 0,${h} Z M ${innerPad},${innerPad} L ${innerPad},${h - innerPad} L ${w - innerPad},${h - innerPad} L ${w - innerPad},${innerPad} Z" fill="#0b1320" fill-opacity="0.94" fill-rule="evenodd" />
          <rect x="${outerPad}" y="${outerPad}" width="${w - outerPad * 2}" height="${h - outerPad * 2}" fill="none" stroke="#58a6ff" stroke-width="1.5" stroke-opacity="0.85" />
          <rect x="${innerPad}" y="${innerPad}" width="${bw}" height="${bh}" fill="none" stroke="#58a6ff" stroke-width="2" />
          ${ticks}
          ${titleBlockMarkup}
        </g>
      `;
      return { defs: '', overlay };
    }

    if (style === 'cyber-hud') {
      const pad = d;
      const cornerLen = Math.min(85, Math.max(36, d * 1.8));
      const lightingOn = overlaysCfg.frameLighting !== false;
      const lightInt = (overlaysCfg.frameLightInt !== undefined ? overlaysCfg.frameLightInt : 70) / 100.0;
      const blurStd = lightingOn ? (1.0 + lightInt * 4.0).toFixed(1) : '0';

      const defs = `
        <filter id="hudGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="${blurStd}" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      `;
      const overlay = `
        <g id="frameAssembly" pointer-events="none">
          <path d="M 0,0 L ${w},0 L ${w},${h} L 0,${h} Z M ${pad},${pad} L ${pad},${h - pad} L ${w - pad},${h - pad} L ${w - pad},${pad} Z" fill="#060a10" fill-opacity="0.9" fill-rule="evenodd" />
          <rect x="${pad}" y="${pad}" width="${w - pad * 2}" height="${h - pad * 2}" fill="none" stroke="#00ffcc" stroke-opacity="0.35" stroke-width="1.2" />
          <g stroke="#00ffcc" stroke-width="3" fill="none" ${lightingOn ? 'filter="url(#hudGlow)"' : ''}>
            <polyline points="${pad},${pad + cornerLen} ${pad},${pad} ${pad + cornerLen},${pad}" />
            <polyline points="${w - pad - cornerLen},${pad} ${w - pad},${pad} ${w - pad},${pad + cornerLen}" />
            <polyline points="${pad},${h - pad - cornerLen} ${pad},${h - pad} ${pad + cornerLen},${h - pad}" />
            <polyline points="${w - pad - cornerLen},${h - pad} ${w - pad},${h - pad} ${w - pad},${h - pad - cornerLen}" />
          </g>
          <line x1="${w / 2 - 45}" y1="${pad}" x2="${w / 2 + 45}" y2="${pad}" stroke="#00ffcc" stroke-width="3" />
          <line x1="${w / 2 - 45}" y1="${h - pad}" x2="${w / 2 + 45}" y2="${h - pad}" stroke="#00ffcc" stroke-width="3" />
          <text x="${pad + 8}" y="${Math.max(12, pad - 7)}" fill="#00ffcc" font-family="monospace" font-size="${Math.max(9, Math.min(13, Math.round(pad * 0.36)))}" letter-spacing="1.5">SYS.OPTICS // ONLINE</text>
          <text x="${w - pad - 8}" y="${Math.max(12, pad - 7)}" fill="#00ffcc" font-family="monospace" font-size="${Math.max(9, Math.min(13, Math.round(pad * 0.36)))}" text-anchor="end" letter-spacing="1.5">[${w}x${h}]</text>
        </g>
      `;
      return { defs, overlay };
    }

    if (style === 'mac-window') {
      const sideB = Math.max(8, Math.round(d * 0.3));
      const topBar = Math.max(30, Math.round(d * 0.95));
      const dotR = Math.max(4.5, Math.min(7.5, topBar * 0.18));
      const dotY = topBar / 2;
      const dotStart = sideB + dotR * 2.2;
      const dotGap = dotR * 3.1;

      const overlay = `
        <g id="frameAssembly" pointer-events="none">
          <path d="M 0,0 L ${w},0 L ${w},${h} L 0,${h} Z M ${sideB},${topBar} L ${sideB},${h - sideB} L ${w - sideB},${h - sideB} L ${w - sideB},${topBar} Z" fill="#161b22" fill-rule="evenodd" />
          <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="10" fill="none" stroke="#30363d" stroke-width="2" />
          <line x1="${sideB}" y1="${topBar}" x2="${w - sideB}" y2="${topBar}" stroke="#30363d" stroke-width="1.5" />
          <circle cx="${dotStart}" cy="${dotY}" r="${dotR}" fill="#ff5f56" />
          <circle cx="${dotStart + dotGap}" cy="${dotY}" r="${dotR}" fill="#ffbd2e" />
          <circle cx="${dotStart + dotGap * 2}" cy="${dotY}" r="${dotR}" fill="#27c93f" />
          <text x="${w / 2}" y="${dotY + 4}" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace" font-size="${Math.max(10, Math.min(14, Math.round(topBar * 0.36)))}" font-weight="600" text-anchor="middle">svg-animator-studio — ${w}×${h}</text>
        </g>
      `;
      return { defs: '', overlay };
    }

    if (style === 'crt-vintage') {
      const rx = Math.max(18, Math.round(d * 0.65));
      const vigOp = overlaysCfg.frameShadow !== undefined ? overlaysCfg.frameShadow : 0.55;
      const showScanlines = overlaysCfg.frameFillet !== false;
      const defs = `
        <pattern id="crtScanlines" width="4" height="4" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="4" y2="0" stroke="#000000" stroke-opacity="0.22" stroke-width="1.4" />
        </pattern>
        <radialGradient id="crtVignette" cx="50%" cy="50%" r="70%">
          <stop offset="60%" stop-color="#000000" stop-opacity="0" />
          <stop offset="100%" stop-color="#000000" stop-opacity="${vigOp}" />
        </radialGradient>
      `;
      const overlay = `
        <g id="frameAssembly" pointer-events="none">
          ${showScanlines ? `<rect x="${d}" y="${d}" width="${w - d * 2}" height="${h - d * 2}" fill="url(#crtScanlines)" />` : ''}
          <rect x="${d}" y="${d}" width="${w - d * 2}" height="${h - d * 2}" fill="url(#crtVignette)" />
          <path d="M 0,0 L ${w},0 L ${w},${h} L 0,${h} Z M ${d + rx},${d} L ${w - d - rx},${d} Q ${w - d},${d} ${w - d},${d + rx} L ${w - d},${h - d - rx} Q ${w - d},${h - d} ${w - d - rx},${h - d} L ${d + rx},${h - d} Q ${d},${h - d} ${d},${h - d - rx} L ${d},${d + rx} Q ${d},${d} ${d + rx},${d} Z" fill="#18191c" fill-rule="evenodd" />
          <rect x="${d}" y="${d}" width="${w - d * 2}" height="${h - d * 2}" rx="${rx}" fill="none" stroke="#0a0b0d" stroke-width="5" />
          <rect x="2" y="2" width="${w - 4}" height="${h - 4}" fill="none" stroke="#2d3139" stroke-width="4" />
          <circle cx="${w - d * 0.6}" cy="${h - d * 0.5}" r="4" fill="#2ea043" />
        </g>
      `;
      return { defs, overlay };
    }

    return { defs: '', overlay: '' };
  },

  build(state) {
    if (!state.image) return '';

    const w = state.image.width || 1280;
    const h = state.image.height || 720;
    const dur = state.duration || 7;
    const loop = state.loop || 'once';
    const c = state.camera || {};
    const opt = state.optical || {};

    // Independent Camera Motion Duration & Playback Mode from the main Camera Rig panel
    const camDur = c.camDuration || dur;
    const camLoop = c.camLoop || loop;

    const isBlank = !!state.image.isBlankCanvas;

    const calcTransform = (zx, zy, zz, rollDeg = 0) => {
      if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.evaluateCamera === 'function' && window.EngineBridge.isReady()) {
        const camEval = window.EngineBridge.evaluateCamera(0, w, h, {
          motion: 'static',
          startX: zx !== undefined ? zx : 50,
          startY: zy !== undefined ? zy : 50,
          startZoom: zz || 1.0,
          camDuration: 1.0
        });
        if (camEval && camEval.transform) {
          const rot = rollDeg !== 0 ? ` rotateZ(${rollDeg.toFixed(3)}deg)` : '';
          if (rollDeg !== 0 && !camEval.transform.includes('rotateZ')) {
            return camEval.transform.replace(/ scale\(/, rot + ' scale(');
          }
          return camEval.transform;
        }
      }

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
      let animTiming = `${camDur}s cubic-bezier(0.37, 0, 0.63, 1) 1 normal forwards`;
      if (camLoop === 'pingpong') {
        animTiming = `${camDur}s cubic-bezier(0.42, 0, 0.58, 1) infinite alternate`;
      } else if (camLoop === 'loop') {
        animTiming = `${camDur}s cubic-bezier(0.37, 0, 0.63, 1) infinite normal`;
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

      const handIteration = camLoop === 'once' ? '1 normal forwards' : 'infinite normal';
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
          animation: camHandheld ${camDur}s linear ${handIteration};
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
        const fDur = opt.focusDur || camDur;
        if (camLoop === 'pingpong') {
          filterDefs += `<animate attributeName="stdDeviation" values="${opt.startBlur}; ${opt.endBlur}; ${opt.startBlur}" keyTimes="0; 0.5; 1" calcMode="spline" keySplines="0.42 0 0.58 1; 0.42 0 0.58 1" dur="${fDur * 2}s" repeatCount="indefinite" fill="freeze" />`;
        } else {
          const repeat = camLoop === 'once' ? '1' : 'indefinite';
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
      const fResult = this.buildFrameMarkup(state.overlays, w, h);
      filterDefs += fResult.defs;
      frameOverlay = fResult.overlay;
    }

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