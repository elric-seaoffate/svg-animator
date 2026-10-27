let cachedPreviewBlob = null;
let cachedPreviewBlobUrl = null;
let cachedFinalWebpBlobUrl = null;
let cachedFinalApngBlobUrl = null;
let cachedFinalSignature = null;
let nativeAspectRatio = 16 / 9;
let modalEventsBound = false;

let activeAbortController = null;
let activeJobId = null;
let progressPollTimer = null;

const PREVIEW_FPS = 24;

function setElVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function setElChecked(id, checked) {
  const el = document.getElementById(id);
  if (el) el.checked = !!checked;
}

function getElChecked(id, fallback = true) {
  const el = document.getElementById(id);
  return el ? !!el.checked : fallback;
}

document.addEventListener('DOMContentLoaded', () => {
  bindModalEvents();
  document.getElementById('btnOpenBitmapModal')?.addEventListener('click', (e) => {
    e.preventDefault();
    openExportModal();
  });
});

function bindModalEvents() {
  if (modalEventsBound) return;
  if (!document.getElementById('exportModal')) return;
  modalEventsBound = true;

  const widthInput = document.getElementById('expWidth');
  const heightInput = document.getElementById('expHeight');
  const lockAspect = document.getElementById('expLockAspect');
  const formatSelect = document.getElementById('expFormat');

  widthInput?.addEventListener('input', () => {
    if (lockAspect && lockAspect.checked && nativeAspectRatio > 0) {
      const w = parseInt(widthInput.value, 10);
      if (!isNaN(w) && w > 0 && heightInput) {
        heightInput.value = Math.max(2, Math.round(w / nativeAspectRatio));
      }
    }
  });

  heightInput?.addEventListener('input', () => {
    if (lockAspect && lockAspect.checked && nativeAspectRatio > 0) {
      const h = parseInt(heightInput.value, 10);
      if (!isNaN(h) && h > 0 && widthInput) {
        widthInput.value = Math.max(2, Math.round(h * nativeAspectRatio));
      }
    }
  });

  formatSelect?.addEventListener('change', updateDownloadButtonLabel);
}

function updateDownloadButtonLabel() {
  const btnDown = document.getElementById('btnDownloadFinal');
  const formatSelect = document.getElementById('expFormat');
  if (!btnDown || !formatSelect) return;

  if (formatSelect.value === 'both') {
    btnDown.innerText = 'Download Both (WebP + APNG)';
  } else if (formatSelect.value === 'apng') {
    btnDown.innerText = 'Download Final APNG';
  } else {
    btnDown.innerText = 'Download Final WebP';
  }
}

function openExportModal(modeArg) {
  if (modeArg === 'still' && window.StillExportStudio) {
    window.StillExportStudio.open();
    return;
  }

  if (!window.currentRenderState && typeof window.triggerAppRender === 'function') {
    window.triggerAppRender();
  }

  if (!window.currentRenderState || !window.currentRenderState.image) {
    alert('Please initialize a canvas or load an image first.');
    return;
  }

  const st = window.currentRenderState;
  const w = st.image.width || 1280;
  const h = st.image.height || 720;
  nativeAspectRatio = w / h;

  setElVal('expWidth', w);
  setElVal('expHeight', h);
  setElVal('expDuration', st.duration || 7);
  setElVal('expLoop', st.loop || 'loop');
  setElVal('expFps', '24');

  if (st.image.filename) {
    const cleanBase = st.image.filename.includes('.') ? st.image.filename.split('.')[0] : st.image.filename;
    setElVal('expFilename', cleanBase + '_animated');
  }

  const hasNodes = window.DiagramNodes ? window.DiagramNodes.list.length > 0 : false;
  const hasFlows = window.DataFlows ? window.DataFlows.list.length > 0 : false;
  const hasGlows = window.Glows ? window.Glows.list.length > 0 : false;
  const hasRipples = window.Ripples ? window.Ripples.list.length > 0 : false;

  setElChecked('expEnableNodes', hasNodes);
  setElChecked('expEnableFlows', hasFlows);
  setElChecked('expEnableGlows', hasGlows);
  setElChecked('expEnableRipples', hasRipples);
  setElChecked('expEnableCamera', st.camera.motion !== 'static');
  setElChecked('expEnableOptical', st.optical.type !== 'none');
  setElChecked('expEnableFrame', !!st.overlays.frame);

  updateDownloadButtonLabel();
  const modal = document.getElementById('exportModal');
  if (modal) modal.style.display = 'flex';
}

function closeExportModal() {
  if (activeAbortController) {
    cancelCurrentRender();
  }
  const modal = document.getElementById('exportModal');
  if (modal) modal.style.display = 'none';
}

function setExportResolution(preset) {
  if (!window.currentRenderState || !window.currentRenderState.image) return;
  const nw = window.currentRenderState.image.width || 1280;
  const nh = window.currentRenderState.image.height || 720;
  nativeAspectRatio = nw / nh;

  if (preset === 'native') {
    setElVal('expWidth', nw);
    setElVal('expHeight', nh);
  } else if (preset === 'half') {
    setElVal('expWidth', Math.max(64, Math.round(nw / 2)));
    setElVal('expHeight', Math.max(64, Math.round(nh / 2)));
  } else if (typeof preset === 'number') {
    setElVal('expWidth', preset);
    setElVal('expHeight', Math.max(64, Math.round(preset / nativeAspectRatio)));
  }
}

function applyExportProfile(profile) {
  if (profile === 'camera-once') {
    setElVal('expLoop', 'once');
    setElChecked('expEnableCamera', true);
    setElChecked('expEnableOptical', true);
    setElChecked('expEnableNodes', true);
    setElChecked('expEnableFlows', false);
    setElChecked('expEnableGlows', false);
    setElChecked('expEnableRipples', false);
  } else if (profile === 'overlays-loop') {
    setElVal('expLoop', 'loop');
    setElChecked('expEnableCamera', false);
    setElChecked('expEnableOptical', false);
    setElChecked('expEnableNodes', true);
    setElChecked('expEnableFlows', true);
    setElChecked('expEnableGlows', true);
    setElChecked('expEnableRipples', true);
  } else if (profile === 'all') {
    setElChecked('expEnableNodes', true);
    setElChecked('expEnableFlows', true);
    setElChecked('expEnableGlows', true);
    setElChecked('expEnableRipples', true);
    setElChecked('expEnableCamera', true);
    setElChecked('expEnableOptical', true);
    setElChecked('expEnableFrame', true);
  }
}

function getFittedPreviewDimensions(targetWidth, targetHeight) {
  const container = document.getElementById('previewContainer');
  let maxW = 680;
  let maxH = 440;

  if (container) {
    const rect = container.getBoundingClientRect();
    if (rect.width > 64 && rect.height > 64) {
      maxW = Math.max(240, Math.floor(rect.width - 24));
      maxH = Math.max(180, Math.floor(rect.height - 24));
    }
  }

  const scaleW = maxW / targetWidth;
  const scaleH = maxH / targetHeight;
  const scale = Math.min(1.0, scaleW, scaleH);

  const w = Math.max(64, Math.round((targetWidth * scale) / 2) * 2);
  const h = Math.max(64, Math.round((targetHeight * scale) / 2) * 2);
  return { width: w, height: h };
}

function buildExportPayload(forPreview = false, jobId = '') {
  const payloadState = JSON.parse(JSON.stringify(window.currentRenderState));

  const fullWidth = Math.max(64, parseInt(document.getElementById('expWidth')?.value, 10) || payloadState.image.width);
  const fullHeight = Math.max(64, parseInt(document.getElementById('expHeight')?.value, 10) || payloadState.image.height);
  const targetDuration = Math.max(0.5, parseFloat(document.getElementById('expDuration')?.value) || payloadState.duration || 7);
  const targetLoop = document.getElementById('expLoop')?.value || 'once';
  const selectedFormat = document.getElementById('expFormat')?.value || 'webp';
  const selectedFps = parseInt(document.getElementById('expFps')?.value, 10) || 24;

  let renderWidth = fullWidth;
  let renderHeight = fullHeight;
  let renderFps = selectedFps;
  let renderFormat = selectedFormat;

  if (forPreview) {
    const fitted = getFittedPreviewDimensions(fullWidth, fullHeight);
    renderWidth = fitted.width;
    renderHeight = fitted.height;
    renderFps = PREVIEW_FPS;
    if (renderFormat === 'both') {
      renderFormat = 'webp';
    }
  }

  payloadState.duration = targetDuration;
  payloadState.loop = targetLoop;

  const enableNodes = getElChecked('expEnableNodes', true);
  const enableFlows = getElChecked('expEnableFlows', true);
  const enableGlows = getElChecked('expEnableGlows', true);
  const enableRipples = getElChecked('expEnableRipples', true);
  const enableCamera = getElChecked('expEnableCamera', true);
  const enableOptical = getElChecked('expEnableOptical', true);
  const enableFrame = getElChecked('expEnableFrame', true);

  if (!enableCamera) payloadState.camera.motion = 'static';
  if (!enableOptical) payloadState.optical.type = 'none';
  if (!enableFrame) payloadState.overlays.frame = false;

  const overrides = {
    includeNodes: enableNodes,
    includeFlows: enableFlows,
    includeGlows: enableGlows,
    includeRipples: enableRipples
  };

  const rawSvg = window.buildFullSVG(payloadState, overrides);
  const svgMarkup = window.serializeSVGForExport(rawSvg);

  return {
    jobId: jobId,
    format: renderFormat,
    duration: targetDuration,
    fps: renderFps,
    width: renderWidth,
    height: renderHeight,
    svgMarkup: svgMarkup,
    state: payloadState
  };
}

function startProgressPolling(jobId, totalFramesExpected) {
  const overlay = document.getElementById('renderProgressOverlay');
  const phaseText = document.getElementById('progressPhaseText');
  const barFill = document.getElementById('progressBarFill');
  const frameCount = document.getElementById('progressFrameCount');
  const pctText = document.getElementById('progressPercent');

  if (overlay) overlay.style.display = 'flex';
  if (phaseText) phaseText.innerText = 'Allocating animation frame buffers...';
  if (barFill) barFill.style.width = '0%';
  if (frameCount) frameCount.innerText = 'Frame 0 / ' + totalFramesExpected;
  if (pctText) pctText.innerText = '0%';

  if (progressPollTimer) clearInterval(progressPollTimer);

  progressPollTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/export/progress?jobId=' + encodeURIComponent(jobId));
      if (!res.ok) return;
      const data = await res.json();
      const tot = data.totalFrames || totalFramesExpected;
      const cur = data.currentFrame || 0;
      const pct = data.percent || 0;

      if (phaseText && data.phase) phaseText.innerText = data.phase;
      if (barFill) barFill.style.width = pct + '%';
      if (frameCount) frameCount.innerText = 'Frame ' + cur + ' / ' + tot;
      if (pctText) pctText.innerText = pct + '%';
    } catch (_) {}
  }, 200);
}

function stopProgressPolling() {
  if (progressPollTimer) {
    clearInterval(progressPollTimer);
    progressPollTimer = null;
  }
  const overlay = document.getElementById('renderProgressOverlay');
  if (overlay) overlay.style.display = 'none';
}

async function cancelCurrentRender() {
  const jobIdToCancel = activeJobId;
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
  stopProgressPolling();

  if (jobIdToCancel) {
    activeJobId = null;
    try {
      await fetch('/api/export/cancel?jobId=' + encodeURIComponent(jobIdToCancel), { method: 'POST' });
    } catch (_) {}
  }

  const placeholder = document.getElementById('previewPlaceholder');
  const previewImg = document.getElementById('previewImage');
  const previewMeta = document.getElementById('previewMeta');

  if (cachedPreviewBlobUrl && previewImg) {
    previewImg.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
  } else if (placeholder) {
    placeholder.innerText = 'Render canceled by user.';
    placeholder.style.display = 'block';
  }
  if (previewMeta) {
    previewMeta.innerText = 'Render aborted.';
  }
}

function setRenderButtonsState(isRendering) {
  const btnPrev = document.getElementById('btnGenPreview');
  const btnReplay = document.getElementById('btnReplayPreview');
  const btnCancel = document.getElementById('btnCancelRender');
  const btnDown = document.getElementById('btnDownloadFinal');

  if (btnPrev) btnPrev.disabled = isRendering;
  if (btnDown) btnDown.disabled = isRendering;
  if (btnReplay) btnReplay.disabled = isRendering || !cachedPreviewBlob;
  if (btnCancel) btnCancel.style.display = isRendering ? 'inline-block' : 'none';
}

async function requestBitmapRender(payload, signal) {
  const response = await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: signal
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || 'Server failed to render');
  }

  // Matches internal/web/server.go binary bundle streaming endpoint (/api/export/bundle)
  if (payload.format === 'both') {
    const data = await response.json();
    if (data.bundleId) {
      const bId = encodeURIComponent(data.bundleId);
      const [webpRes, apngRes] = await Promise.all([
        fetch('/api/export/bundle?bundleId=' + bId + '&fmt=webp', { signal: signal }),
        fetch('/api/export/bundle?bundleId=' + bId + '&fmt=apng', { signal: signal })
      ]);
      if (!webpRes.ok || !apngRes.ok) {
        throw new Error('Failed to stream rendered bundle files from server');
      }
      const webpBlob = await webpRes.blob();
      const apngBlob = await apngRes.blob();
      return { mode: 'both', webpBlob: webpBlob, apngBlob: apngBlob };
    }

    // Legacy fallback if base64 fields are returned
    const webpBlob = await (await fetch('data:image/webp;base64,' + data.webpB64)).blob();
    const apngBlob = await (await fetch('data:image/png;base64,' + data.apngB64)).blob();
    return { mode: 'both', webpBlob: webpBlob, apngBlob: apngBlob };
  }

  const singleBlob = await response.blob();
  return { mode: 'single', blob: singleBlob };
}

async function generatePreview() {
  const placeholder = document.getElementById('previewPlaceholder');
  const previewImg = document.getElementById('previewImage');
  const previewMeta = document.getElementById('previewMeta');

  activeJobId = 'job-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
  activeAbortController = new AbortController();

  const payload = buildExportPayload(true, activeJobId);
  const totalFrames = Math.max(1, Math.round(payload.duration * payload.fps * (payload.state.loop === 'pingpong' ? 2 : 1)));

  if (placeholder) placeholder.style.display = 'none';
  if (previewImg) previewImg.style.display = 'none';
  setRenderButtonsState(true);
  startProgressPolling(activeJobId, totalFrames);

  if (cachedPreviewBlobUrl) {
    URL.revokeObjectURL(cachedPreviewBlobUrl);
    cachedPreviewBlobUrl = null;
  }
  cachedPreviewBlob = null;

  const startTime = performance.now();

  try {
    const result = await requestBitmapRender(payload, activeAbortController.signal);
    const blob = result.blob;
    cachedPreviewBlob = blob;
    cachedPreviewBlobUrl = URL.createObjectURL(blob);

    stopProgressPolling();
    if (previewImg) {
      previewImg.src = cachedPreviewBlobUrl;
      previewImg.style.display = 'block';
    }

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    const sizeKB = (blob.size / 1024).toFixed(1);
    if (previewMeta) {
      previewMeta.innerText = 'Preview: ' + payload.format.toUpperCase() + ' • ' + payload.width + '×' + payload.height + 'px (' + totalFrames + ' frames @ ' + PREVIEW_FPS + ' FPS) • ' + sizeKB + ' KB (' + elapsed + 's)';
    }
  } catch (err) {
    stopProgressPolling();
    if (placeholder) {
      if (err.name === 'AbortError') {
        placeholder.innerText = 'Render canceled.';
      } else {
        placeholder.innerText = 'Preview failed: ' + err.message;
        if (previewMeta) previewMeta.innerText = 'Render error.';
      }
      placeholder.style.display = 'block';
    }
  } finally {
    activeAbortController = null;
    activeJobId = null;
    setRenderButtonsState(false);
  }
}

function replayPreview() {
  const previewImg = document.getElementById('previewImage');
  if (!previewImg || !cachedPreviewBlob) return;

  if (cachedPreviewBlobUrl) {
    URL.revokeObjectURL(cachedPreviewBlobUrl);
  }

  cachedPreviewBlobUrl = URL.createObjectURL(cachedPreviewBlob);
  previewImg.style.display = 'none';
  previewImg.src = '';
  void previewImg.offsetWidth;
  previewImg.src = cachedPreviewBlobUrl;
  previewImg.style.display = 'block';
}

function triggerFileDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function downloadFinal() {
  const btnDown = document.getElementById('btnDownloadFinal');
  const previewMeta = document.getElementById('previewMeta');
  const previewImg = document.getElementById('previewImage');
  const placeholder = document.getElementById('previewPlaceholder');
  const baseFilename = (document.getElementById('expFilename')?.value || 'animation_export').replace(/\.(webp|png|apng)$/i, '');

  const signatureCheckPayload = buildExportPayload(false, '');
  const currentSig = JSON.stringify(signatureCheckPayload);

  try {
    const isCacheValid = cachedFinalSignature === currentSig &&
      ((signatureCheckPayload.format === 'both' && cachedFinalWebpBlobUrl && cachedFinalApngBlobUrl) ||
       (signatureCheckPayload.format === 'webp' && cachedFinalWebpBlobUrl) ||
       (signatureCheckPayload.format === 'apng' && cachedFinalApngBlobUrl));

    if (!isCacheValid) {
      activeJobId = 'job-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
      activeAbortController = new AbortController();

      const payload = buildExportPayload(false, activeJobId);
      const totalFrames = Math.max(1, Math.round(payload.duration * payload.fps * (payload.state.loop === 'pingpong' ? 2 : 1)));

      if (btnDown) btnDown.innerText = 'Rendering (' + payload.width + '×' + payload.height + ')...';
      if (placeholder) placeholder.style.display = 'none';
      if (previewImg) previewImg.style.display = 'none';
      setRenderButtonsState(true);
      startProgressPolling(activeJobId, totalFrames);

      const startTime = performance.now();
      const result = await requestBitmapRender(payload, activeAbortController.signal);
      stopProgressPolling();

      if (cachedFinalWebpBlobUrl) { URL.revokeObjectURL(cachedFinalWebpBlobUrl); cachedFinalWebpBlobUrl = null; }
      if (cachedFinalApngBlobUrl) { URL.revokeObjectURL(cachedFinalApngBlobUrl); cachedFinalApngBlobUrl = null; }
      if (cachedPreviewBlobUrl) { URL.revokeObjectURL(cachedPreviewBlobUrl); cachedPreviewBlobUrl = null; }

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

      if (result.mode === 'both') {
        cachedFinalWebpBlobUrl = URL.createObjectURL(result.webpBlob);
        cachedFinalApngBlobUrl = URL.createObjectURL(result.apngBlob);
        cachedPreviewBlob = result.webpBlob;
        cachedPreviewBlobUrl = URL.createObjectURL(result.webpBlob);

        const webpKB = (result.webpBlob.size / 1024).toFixed(1);
        const apngKB = (result.apngBlob.size / 1024).toFixed(1);
        if (previewMeta) {
          previewMeta.innerText = 'Final Render: WebP (' + webpKB + ' KB) + APNG (' + apngKB + ' KB) • ' + payload.width + '×' + payload.height + 'px • ' + payload.fps + ' FPS (' + elapsed + 's)';
        }
      } else {
        const singleUrl = URL.createObjectURL(result.blob);
        if (payload.format === 'webp') {
          cachedFinalWebpBlobUrl = singleUrl;
        } else {
          cachedFinalApngBlobUrl = singleUrl;
        }
        cachedPreviewBlob = result.blob;
        cachedPreviewBlobUrl = URL.createObjectURL(result.blob);

        const sizeKB = (result.blob.size / 1024).toFixed(1);
        if (previewMeta) {
          previewMeta.innerText = 'Final Render: ' + payload.format.toUpperCase() + ' • ' + payload.width + '×' + payload.height + 'px • ' + payload.fps + ' FPS • ' + sizeKB + ' KB (' + elapsed + 's)';
        }
      }

      cachedFinalSignature = currentSig;

      if (previewImg) {
        previewImg.src = cachedPreviewBlobUrl;
        previewImg.style.display = 'block';
      }
    }

    if (signatureCheckPayload.format === 'both') {
      triggerFileDownload(cachedFinalWebpBlobUrl, baseFilename + '.webp');
      setTimeout(() => {
        triggerFileDownload(cachedFinalApngBlobUrl, baseFilename + '.png');
      }, 250);
    } else if (signatureCheckPayload.format === 'webp') {
      triggerFileDownload(cachedFinalWebpBlobUrl, baseFilename + '.webp');
    } else {
      triggerFileDownload(cachedFinalApngBlobUrl, baseFilename + '.png');
    }
  } catch (err) {
    stopProgressPolling();
    if (err.name === 'AbortError') {
      if (placeholder) {
        placeholder.innerText = 'Render canceled.';
        placeholder.style.display = 'block';
      }
    } else {
      alert('Export failed: ' + err.message);
    }
  } finally {
    activeAbortController = null;
    activeJobId = null;
    updateDownloadButtonLabel();
    setRenderButtonsState(false);
  }
}

window.openExportModal = openExportModal;
window.closeExportModal = closeExportModal;
window.setExportResolution = setExportResolution;
window.applyExportProfile = applyExportProfile;
window.generatePreview = generatePreview;
window.replayPreview = replayPreview;
window.cancelCurrentRender = cancelCurrentRender;
window.downloadFinal = downloadFinal;