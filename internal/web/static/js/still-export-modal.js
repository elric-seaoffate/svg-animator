window.StillExportStudio = {
  baseWidth: 1280,
  baseHeight: 720,
  aspectRatio: 16 / 9,
  cachedBlob: null,
  cachedBlobUrl: null,
  previewTimer: null,
  isGeneratingFinal: false,
  _initialized: false,

  solveCubicBezier(x1, y1, x2, y2, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    if (x1 === y1 && x2 === y2) return x;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const cx = 3 * x1;
      const bx = 3 * (x2 - x1) - cx;
      const ax = 1 - cx - bx;
      const currentX = ((ax * t + bx) * t + cx) * t - x;
      if (Math.abs(currentX) < 1e-6) break;
      const deriv = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(deriv) < 1e-6) break;
      t -= currentX / deriv;
    }
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    return ((ay * t + by) * t + cy) * t;
  },

  init() {
    if (this._initialized) return;
    this._initialized = true;

    document.getElementById('btnOpenStillModal')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.open();
    });
    document.getElementById('btnCloseStillTop')?.addEventListener('click', () => this.close());
    document.getElementById('btnCloseStillBottom')?.addEventListener('click', () => this.close());
    document.getElementById('btnStillRefreshPreview')?.addEventListener('click', () => this.renderPreview());
    document.getElementById('btnDownloadStillFinal')?.addEventListener('click', () => this.download());

    const dpiSel = document.getElementById('stillDpiSelect');
    const wInput = document.getElementById('stillWidthInput');
    const hInput = document.getElementById('stillHeightInput');
    const lockChk = document.getElementById('stillLockAspect');
    const fmtSel = document.getElementById('stillFormatSelect');
    const tSlider = document.getElementById('stillTimeSlider');
    const tNum = document.getElementById('stillTimeNum');
    const tReadout = document.getElementById('stillTimeReadout');

    dpiSel?.addEventListener('change', () => {
      const mult = parseFloat(dpiSel.value) || 1.0;
      if (wInput && hInput) {
        wInput.value = Math.max(64, Math.round(this.baseWidth * mult));
        hInput.value = Math.max(64, Math.round(this.baseHeight * mult));
      }
      this.updateButtonLabel();
      this.schedulePreview(60);
    });

    wInput?.addEventListener('input', () => {
      if (lockChk && lockChk.checked && this.aspectRatio > 0 && hInput) {
        const w = parseInt(wInput.value, 10);
        if (!isNaN(w) && w > 0) {
          hInput.value = Math.max(2, Math.round(w / this.aspectRatio));
        }
      }
      this.updateButtonLabel();
      this.schedulePreview(100);
    });

    hInput?.addEventListener('input', () => {
      if (lockChk && lockChk.checked && this.aspectRatio > 0 && wInput) {
        const h = parseInt(hInput.value, 10);
        if (!isNaN(h) && h > 0) {
          wInput.value = Math.max(2, Math.round(h * this.aspectRatio));
        }
      }
      this.updateButtonLabel();
      this.schedulePreview(100);
    });

    if (tSlider && tNum) {
      tSlider.addEventListener('input', () => {
        tNum.value = tSlider.value;
        if (tReadout) tReadout.textContent = 't = ' + parseFloat(tSlider.value).toFixed(2) + 's';
        this.schedulePreview(40);
      });
      tNum.addEventListener('input', () => {
        tSlider.value = tNum.value;
        if (tReadout) tReadout.textContent = 't = ' + parseFloat(tNum.value || 0).toFixed(2) + 's';
        this.schedulePreview(40);
      });
    }

    fmtSel?.addEventListener('change', () => {
      this.updateButtonLabel();
      this.schedulePreview(40);
    });

    [
      'stillForcePeakVis',
      'stillEnableNodes',
      'stillEnableFlows',
      'stillEnablePayloads',
      'stillEnableGlows',
      'stillEnableRipples',
      'stillEnableCamera',
      'stillEnableOptical',
      'stillEnableFrame',
      'stillQualityInput'
    ].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => this.schedulePreview(40));
    });
  },

  schedulePreview(delayMs = 60) {
    if (this.isGeneratingFinal) return;
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => {
      this.renderPreview();
    }, delayMs);
  },

  updateButtonLabel() {
    if (this.isGeneratingFinal) return;
    const fmt = document.getElementById('stillFormatSelect')?.value || 'png';
    const btn = document.getElementById('btnDownloadStillFinal');
    const outW = parseInt(document.getElementById('stillWidthInput')?.value, 10) || this.baseWidth;
    const outH = parseInt(document.getElementById('stillHeightInput')?.value, 10) || this.baseHeight;
    if (!btn) return;
    if (fmt === 'all') {
      btn.textContent = 'Download All (' + outW + '×' + outH + ')';
    } else {
      btn.textContent = 'Download Still ' + fmt.toUpperCase() + ' (' + outW + '×' + outH + ')';
    }
  },

  getScreenPreviewDimensions(targetW, targetH) {
    const container = document.getElementById('stillPreviewContainer');
    let maxW = 720;
    let maxH = 460;

    if (container) {
      const rect = container.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 100) {
        maxW = Math.max(320, Math.floor(rect.width - 20));
        maxH = Math.max(220, Math.floor(rect.height - 20));
      }
    }

    const scale = Math.min(1.0, maxW / targetW, maxH / targetH);
    const pw = Math.max(64, Math.round((targetW * scale) / 2) * 2);
    const ph = Math.max(64, Math.round((targetH * scale) / 2) * 2);
    return { width: pw, height: ph };
  },

  open() {
    if (!window.currentRenderState && typeof window.triggerAppRender === 'function') {
      window.triggerAppRender();
    }
    if (!window.currentRenderState || !window.currentRenderState.image) {
      alert('Please initialize a canvas or load an image first.');
      return;
    }

    const st = window.currentRenderState;
    this.baseWidth = st.image.width || 1280;
    this.baseHeight = st.image.height || 720;
    this.aspectRatio = this.baseWidth / this.baseHeight;

    const dpiSel = document.getElementById('stillDpiSelect');
    const mult = parseFloat(dpiSel ? dpiSel.value : '1') || 1.0;

    document.getElementById('stillWidthInput').value = Math.round(this.baseWidth * mult);
    document.getElementById('stillHeightInput').value = Math.round(this.baseHeight * mult);

    if (st.image.filename) {
      const cleanBase = st.image.filename.includes('.') ? st.image.filename.split('.')[0] : st.image.filename;
      document.getElementById('stillFilename').value = cleanBase + '_still';
    }

    const dur = st.duration || 7;
    const tSlider = document.getElementById('stillTimeSlider');
    const tNum = document.getElementById('stillTimeNum');
    const tReadout = document.getElementById('stillTimeReadout');
    if (tSlider) {
      tSlider.max = dur;
      if (parseFloat(tSlider.value) > dur) tSlider.value = (dur / 2).toFixed(1);
    }
    if (tNum && tSlider) {
      tNum.value = tSlider.value;
      if (tReadout) tReadout.textContent = 't = ' + parseFloat(tSlider.value).toFixed(2) + 's';
    }

    document.getElementById('stillEnableNodes').checked = window.DiagramNodes ? window.DiagramNodes.list.length > 0 : true;
    document.getElementById('stillEnableFlows').checked = window.DataFlows ? window.DataFlows.list.length > 0 : true;
    document.getElementById('stillEnablePayloads').checked = window.DataFlows ? window.DataFlows.list.length > 0 : true;
    document.getElementById('stillEnableGlows').checked = window.Glows ? window.Glows.list.length > 0 : true;
    document.getElementById('stillEnableRipples').checked = window.Ripples ? window.Ripples.list.length > 0 : true;
    document.getElementById('stillEnableCamera').checked = st.camera.motion !== 'static';
    document.getElementById('stillEnableOptical').checked = st.optical.type !== 'none';
    document.getElementById('stillEnableFrame').checked = !!st.overlays.frame;

    this.updateButtonLabel();
    document.getElementById('stillExportModal').style.display = 'flex';

    requestAnimationFrame(() => {
      this.renderPreview();
    });
  },

  close() {
    if (this.isGeneratingFinal) return;
    document.getElementById('stillExportModal').style.display = 'none';
  },

  evaluateSMILAnimate(anim, sec) {
    let dur = parseFloat(anim.getAttribute('dur'));
    if (isNaN(dur) || dur <= 0) dur = 1.0;
    const begin = parseFloat(anim.getAttribute('begin')) || 0.0;
    const localSec = sec - begin;
    if (localSec < 0) return null;

    let progress;
    if (anim.getAttribute('repeatCount') === 'indefinite') {
      progress = (localSec % dur) / dur;
    } else {
      progress = Math.min(1.0, localSec / dur);
    }
    if (progress < 0) progress = 0;

    let fromStr = anim.getAttribute('from');
    let toStr = anim.getAttribute('to');
    let segProgress = progress;

    const calcMode = anim.getAttribute('calcMode') || 'linear';
    const splinesAttr = anim.getAttribute('keySplines');
    const splines = splinesAttr ? splinesAttr.split(';').map((s) => s.trim()).filter(Boolean) : [];
    const keyTimesAttr = anim.getAttribute('keyTimes');
    const keyTimes = keyTimesAttr ? keyTimesAttr.split(';').map((k) => parseFloat(k.trim())).filter((k) => !isNaN(k)) : [];

    if (anim.hasAttribute('values')) {
      const vals = anim.getAttribute('values').split(';').map((v) => v.trim()).filter((v) => v !== '');
      const numSegments = vals.length - 1;
      if (numSegments > 0) {
        let segIdx = 0;
        if (keyTimes.length === vals.length) {
          for (let i = 0; i < numSegments; i++) {
            if (progress >= keyTimes[i] && progress <= keyTimes[i + 1]) {
              segIdx = i;
              const span = keyTimes[i + 1] - keyTimes[i];
              segProgress = span > 0 ? (progress - keyTimes[i]) / span : 1.0;
              break;
            } else if (progress > keyTimes[numSegments]) {
              segIdx = numSegments - 1;
              segProgress = 1.0;
            }
          }
        } else {
          const scaled = progress * numSegments;
          if (scaled >= numSegments) {
            segIdx = numSegments - 1;
            segProgress = 1.0;
          } else {
            segIdx = Math.floor(scaled);
            segProgress = scaled - segIdx;
          }
        }
        fromStr = vals[segIdx];
        toStr = vals[segIdx + 1];

        if (calcMode === 'spline' && splines[segIdx]) {
          const pts = splines[segIdx].split(/[\s,]+/).map(parseFloat);
          if (pts.length === 4 && !pts.some(isNaN)) {
            segProgress = this.solveCubicBezier(pts[0], pts[1], pts[2], pts[3], segProgress);
          }
        }
      }
    } else if (calcMode === 'spline' && splines[0]) {
      const pts = splines[0].split(/[\s,]+/).map(parseFloat);
      if (pts.length === 4 && !pts.some(isNaN)) {
        segProgress = this.solveCubicBezier(pts[0], pts[1], pts[2], pts[3], segProgress);
      }
    }

    if (fromStr == null || toStr == null) return null;

    const fromParts = fromStr.split(/[\s,]+/);
    const toParts = toStr.split(/[\s,]+/);
    const out = [];
    for (let i = 0; i < fromParts.length; i++) {
      const f = parseFloat(fromParts[i]);
      const t = parseFloat(toParts[i] !== undefined ? toParts[i] : toParts[0]);
      if (!isNaN(f) && !isNaN(t)) {
        out.push((f + (t - f) * segProgress).toFixed(3));
      }
    }
    return out.length > 0 ? out.join(' ') : null;
  },

  bakeStaticSVGAtTime(rawSvg, snapshotSec, renderW, renderH, forcePeakVis, includeLines, includePayloads) {
    const sandbox = document.createElement('div');
    sandbox.style.cssText =
      'position:fixed; left:-9999px; top:-9999px; width:' + this.baseWidth + 'px; height:' + this.baseHeight + 'px; visibility:hidden; pointer-events:none;';
    sandbox.innerHTML = rawSvg;
    document.body.appendChild(sandbox);

    try {
      const svgEl = sandbox.querySelector('svg');
      if (!svgEl) return rawSvg;

      if (svgEl.getAnimations) {
        svgEl.getAnimations({ subtree: true }).forEach((anim) => {
          anim.pause();
          anim.currentTime = snapshotSec * 1000;
        });
      }
      const camRig = svgEl.querySelector('.camera-rig');
      if (camRig) {
        const comp = window.getComputedStyle(camRig);
        if (comp && comp.transform && comp.transform !== 'none') {
          camRig.style.transform = comp.transform;
          camRig.style.animation = 'none';
        }
      }

      svgEl.querySelectorAll('set').forEach((setEl) => {
        const parent = setEl.parentElement;
        const attr = setEl.getAttribute('attributeName');
        const toVal = setEl.getAttribute('to');
        const begin = parseFloat(setEl.getAttribute('begin')) || 0;
        if (parent && attr && toVal && (snapshotSec >= begin || forcePeakVis)) {
          parent.setAttribute(attr, toVal);
        }
        setEl.remove();
      });

      svgEl.querySelectorAll('animateMotion').forEach((motionEl) => {
        const payloadGroup = motionEl.parentElement;
        if (!payloadGroup) return;

        if (!includePayloads) {
          payloadGroup.remove();
          return;
        }

        const mpath = motionEl.querySelector('mpath');
        const href = mpath ? (mpath.getAttribute('href') || mpath.getAttribute('xlink:href') || '') : '';
        const pathId = href.replace(/^#/, '');
        const pathEl = pathId ? svgEl.querySelector('#' + pathId) : null;

        if (pathEl && typeof pathEl.getTotalLength === 'function') {
          const totalLen = pathEl.getTotalLength();
          const dur = parseFloat(motionEl.getAttribute('dur')) || 2.0;
          const begin = parseFloat(motionEl.getAttribute('begin')) || 0.0;
          let localSec = snapshotSec - begin;
          if (localSec < 0) localSec = forcePeakVis ? (dur * 0.5) : 0;

          let prog = (localSec % dur) / dur;
          const ktAttr = motionEl.getAttribute('keyTimes');
          if (ktAttr) {
            const kts = ktAttr.split(';').map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
            if (kts.length === 3 && kts[1] > 0) {
              prog = prog <= kts[1] ? (prog / kts[1]) : 1.0;
            }
          }
          if (snapshotSec === 0 && forcePeakVis && prog === 0) {
            prog = 0.5;
          }

          const dist = Math.min(totalLen, Math.max(0, prog * totalLen));
          const pt = pathEl.getPointAtLength(dist);
          let transformStr = 'translate(' + pt.x.toFixed(2) + ', ' + pt.y.toFixed(2) + ')';

          if (motionEl.getAttribute('rotate') === 'auto' && totalLen > 1) {
            const d1 = Math.max(0, dist - 1.5);
            const d2 = Math.min(totalLen, dist + 1.5);
            const p1 = pathEl.getPointAtLength(d1);
            const p2 = pathEl.getPointAtLength(d2);
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
            transformStr += ' rotate(' + angle.toFixed(2) + ')';
          }

          payloadGroup.setAttribute('transform', transformStr);
        }
        motionEl.remove();
      });

      // If user unchecked "Connectors & DataFlow Lines" but kept "Traveling Payloads", hide the track lines & midpoint badges
      if (!includeLines) {
        const flowsLayer = svgEl.querySelector('#flows-layer');
        if (flowsLayer) {
          Array.from(flowsLayer.children).forEach((child) => {
            if (child.tagName.toLowerCase() === 'path') {
              child.setAttribute('stroke', 'none');
              child.removeAttribute('marker-start');
              child.removeAttribute('marker-end');
            } else if (child.tagName.toLowerCase() === 'g' && child.getAttribute('transform')?.startsWith('translate(')) {
              // Midpoint text badge group
              child.remove();
            }
          });
        }
      }

      svgEl.querySelectorAll('animate').forEach((anim) => {
        const parent = anim.parentElement;
        const attr = anim.getAttribute('attributeName');
        if (!parent || !attr) {
          anim.remove();
          return;
        }

        const effectiveTime = (snapshotSec === 0 && forcePeakVis) ? ((parseFloat(anim.getAttribute('dur')) || 2.0) * 0.5) : snapshotSec;
        let val = this.evaluateSMILAnimate(anim, effectiveTime);

        if (forcePeakVis && (attr === 'opacity' || attr === 'stroke-opacity')) {
          const inGlowOrFlow = parent.closest('#glows-layer') || parent.closest('#flows-layer');
          const numVal = parseFloat(val);
          if (inGlowOrFlow && (val === null || isNaN(numVal) || numVal < 0.15)) {
            const valsAttr = anim.getAttribute('values') || '';
            const nums = valsAttr.split(';').map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
            const maxOp = nums.length > 0 ? Math.max(...nums) : 1.0;
            val = String(maxOp > 0 ? maxOp : 1.0);
          }
        }

        if (val !== null) {
          parent.setAttribute(attr, val);
        }
        anim.remove();
      });

      svgEl.querySelectorAll('animateTransform').forEach((animT) => {
        animT.remove();
      });

      svgEl.setAttribute('width', String(renderW));
      svgEl.setAttribute('height', String(renderH));

      return window.serializeSVGForExport(svgEl.outerHTML);
    } finally {
      document.body.removeChild(sandbox);
    }
  },

  async buildStillBlob(mimeType, forPreview = false) {
    const payloadState = JSON.parse(JSON.stringify(window.currentRenderState));
    const fullTargetW = Math.max(64, parseInt(document.getElementById('stillWidthInput')?.value, 10) || this.baseWidth);
    const fullTargetH = Math.max(64, parseInt(document.getElementById('stillHeightInput')?.value, 10) || this.baseHeight);

    let renderW = fullTargetW;
    let renderH = fullTargetH;
    if (forPreview) {
      const fitted = this.getScreenPreviewDimensions(fullTargetW, fullTargetH);
      renderW = fitted.width;
      renderH = fitted.height;
    }

    const qual = Math.min(1, Math.max(0.1, (parseFloat(document.getElementById('stillQualityInput')?.value || 95) / 100)));
    const snapSec = Math.max(0, parseFloat(document.getElementById('stillTimeNum')?.value || 0));
    const forcePeakVis = !!document.getElementById('stillForcePeakVis')?.checked;

    const enableNodes = !!document.getElementById('stillEnableNodes')?.checked;
    const enableFlows = !!document.getElementById('stillEnableFlows')?.checked;
    const enablePayloads = !!document.getElementById('stillEnablePayloads')?.checked;
    const enableGlows = !!document.getElementById('stillEnableGlows')?.checked;
    const enableRipples = !!document.getElementById('stillEnableRipples')?.checked;
    const enableCamera = !!document.getElementById('stillEnableCamera')?.checked;
    const enableOptical = !!document.getElementById('stillEnableOptical')?.checked;
    const enableFrame = !!document.getElementById('stillEnableFrame')?.checked;

    if (!enableCamera) payloadState.camera.motion = 'static';
    if (!enableOptical) payloadState.optical.type = 'none';
    if (!enableFrame) payloadState.overlays.frame = false;

    const rawSvg = window.buildFullSVG(payloadState, {
      includeNodes: enableNodes,
      includeFlows: enableFlows || enablePayloads,
      includeGlows: enableGlows,
      includeRipples: enableRipples
    });

    const bakedSvg = this.bakeStaticSVGAtTime(rawSvg, snapSec, renderW, renderH, forcePeakVis, enableFlows, enablePayloads);
    const svgBlob = new Blob([bakedSvg], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(svgBlob);

    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Failed to rasterize baked SVG'));
        img.src = blobUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = renderW;
      canvas.height = renderH;
      const ctx = canvas.getContext('2d');

      if (mimeType === 'image/jpeg' || !payloadState.camera.bgTransparent) {
        ctx.fillStyle = payloadState.camera.bgColor || '#0d1117';
        ctx.fillRect(0, 0, renderW, renderH);
      }

      ctx.drawImage(img, 0, 0, renderW, renderH);

      const outBlob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))), mimeType, qual);
      });

      return {
        blob: outBlob,
        renderWidth: renderW,
        renderHeight: renderH,
        finalWidth: fullTargetW,
        finalHeight: fullTargetH,
        snapSec: snapSec
      };
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  },

  async renderPreview() {
    if (this.isGeneratingFinal) return;
    const placeholder = document.getElementById('stillPreviewPlaceholder');
    const previewImg = document.getElementById('stillPreviewImage');
    const previewMeta = document.getElementById('stillPreviewMeta');
    const fmt = document.getElementById('stillFormatSelect')?.value || 'png';
    const mime = fmt === 'jpeg' ? 'image/jpeg' : (fmt === 'webp' ? 'image/webp' : 'image/png');

    try {
      const startTime = performance.now();
      const res = await this.buildStillBlob(mime, true);

      if (this.cachedBlobUrl) URL.revokeObjectURL(this.cachedBlobUrl);
      this.cachedBlob = res.blob;
      this.cachedBlobUrl = URL.createObjectURL(res.blob);

      if (placeholder) placeholder.style.display = 'none';
      if (previewImg) {
        previewImg.src = this.cachedBlobUrl;
        previewImg.style.display = 'block';
      }

      const elapsed = (performance.now() - startTime).toFixed(0);
      const dpiMult = parseFloat(document.getElementById('stillDpiSelect')?.value || '1') || 1;
      const dpiEst = Math.round(96 * dpiMult);
      if (previewMeta) {
        previewMeta.textContent =
          'Screen Preview: ' + res.renderWidth + '×' + res.renderHeight + ' px (' + elapsed + ' ms) @ t=' + res.snapSec.toFixed(2) + 's' +
          '  •  Final Download Target: ' + res.finalWidth + '×' + res.finalHeight + ' px (~' + dpiEst + ' DPI)';
      }
    } catch (err) {
      if (placeholder) {
        placeholder.textContent = 'Still preview error: ' + err.message;
        placeholder.style.display = 'block';
      }
    }
  },

  setGeneratingState(active, titleText = '', subText = '') {
    this.isGeneratingFinal = active;
    const overlay = document.getElementById('stillGeneratingOverlay');
    const titleEl = document.getElementById('stillGeneratingTitle');
    const subEl = document.getElementById('stillGeneratingSub');
    const btnDown = document.getElementById('btnDownloadStillFinal');
    const btnRefresh = document.getElementById('btnStillRefreshPreview');
    const btnCloseBottom = document.getElementById('btnCloseStillBottom');

    if (overlay) overlay.style.display = active ? 'flex' : 'none';
    if (titleEl && titleText) titleEl.textContent = titleText;
    if (subEl && subText) subEl.textContent = subText;

    if (btnDown) {
      btnDown.disabled = active;
      if (active) {
        btnDown.textContent = '⏳ Generating your image...';
      } else {
        this.updateButtonLabel();
      }
    }
    if (btnRefresh) btnRefresh.disabled = active;
    if (btnCloseBottom) btnCloseBottom.disabled = active;
  },

  triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  async download() {
    if (this.isGeneratingFinal) return;

    const fmt = document.getElementById('stillFormatSelect')?.value || 'png';
    const baseName = (document.getElementById('stillFilename')?.value || 'diagram_still').replace(/\.(png|webp|jpe?g)$/i, '');
    const outW = parseInt(document.getElementById('stillWidthInput')?.value, 10) || this.baseWidth;
    const outH = parseInt(document.getElementById('stillHeightInput')?.value, 10) || this.baseHeight;
    const previewMeta = document.getElementById('stillPreviewMeta');

    const list = fmt === 'all'
      ? [
          { ext: 'png', mime: 'image/png', label: 'PNG' },
          { ext: 'webp', mime: 'image/webp', label: 'WebP' },
          { ext: 'jpg', mime: 'image/jpeg', label: 'JPEG' }
        ]
      : [
          {
            ext: fmt === 'jpeg' ? 'jpg' : fmt,
            mime: fmt === 'jpeg' ? 'image/jpeg' : (fmt === 'webp' ? 'image/webp' : 'image/png'),
            label: fmt.toUpperCase()
          }
        ];

    try {
      this.setGeneratingState(
        true,
        '⏳ Generating your high-resolution image (' + outW + ' × ' + outH + ' px)...',
        'Rasterizing vector shapes, connectors, and effects at full print resolution.'
      );

      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 35)));

      const startTime = performance.now();

      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (list.length > 1) {
          this.setGeneratingState(
            true,
            '⏳ Generating ' + item.label + ' (' + (i + 1) + ' of ' + list.length + ') at ' + outW + ' × ' + outH + ' px...',
            'Encoding high-resolution flat image...'
          );
          await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 20)));
        }

        const res = await this.buildStillBlob(item.mime, false);
        const url = URL.createObjectURL(res.blob);
        const sizeKB = (res.blob.size / 1024).toFixed(1);
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

        if (previewMeta) {
          previewMeta.textContent =
            '✅ Generated Final ' + item.label + ': ' + res.finalWidth + '×' + res.finalHeight + ' px • ' + sizeKB + ' KB (' + elapsed + 's)';
        }

        this.triggerDownload(url, baseName + '.' + item.ext);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    } catch (err) {
      alert('Still image export failed: ' + err.message);
    } finally {
      this.setGeneratingState(false);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  window.StillExportStudio.init();
});

window.openStillExportModal = () => window.StillExportStudio.open();