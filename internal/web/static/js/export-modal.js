(function initExportStudioModule() {
  let cachedPreviewBlob = null;
  let cachedPreviewBlobUrl = null;
  let cachedPreviewIsVideo = false;

  let cachedFinalWebpBlobUrl = null;
  let cachedFinalApngBlobUrl = null;
  let cachedFinalMp4BlobUrl = null;
  let cachedFinalSignature = null;
  let nativeAspectRatio = 16 / 9;
  let modalEventsBound = false;

  let loadedAudioB64 = '';
  let loadedAudioName = '';
  let loadedAudioTrueDuration = 0;

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

  function bindModalEvents() {
    if (modalEventsBound) return;
    if (!document.getElementById('exportModal')) return;
    modalEventsBound = true;

    const widthInput = document.getElementById('expWidth');
    const heightInput = document.getElementById('expHeight');
    const lockAspect = document.getElementById('expLockAspect');
    const formatSelect = document.getElementById('expFormat');
    const audioInput = document.getElementById('expAudioInput');
    const audioFitSelect = document.getElementById('expAudioFit');

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
    audioFitSelect?.addEventListener('change', () => {
      cachedFinalSignature = null;
    });

    audioInput?.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const lbl = document.getElementById('expAudioLabel');
      const clr = document.getElementById('btnClearExportAudio');
      const tools = document.getElementById('expAudioTools');
      const readout = document.getElementById('expAudioProbeReadout');

      if (lbl) lbl.textContent = '🔊 ' + file.name + ' (' + (file.size / 1024).toFixed(0) + ' KB)';
      if (clr) clr.style.display = 'inline-block';
      if (tools) tools.style.display = 'flex';
      if (readout) readout.innerHTML = '⏳ Decoding audio stream to verify true duration...';

      file.arrayBuffer().then((buf) => {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const actx = new AudioCtx();
        actx.decodeAudioData(buf.slice(0)).then((audioBuffer) => {
          if (loadedAudioTrueDuration <= 0 && audioBuffer && audioBuffer.duration > 0) {
            loadedAudioTrueDuration = Number(audioBuffer.duration.toFixed(2));
            if (readout && readout.textContent.includes('Decoding')) {
              readout.innerHTML = '✅ True Decoded Length: <strong style="color:#3fb950;">' + loadedAudioTrueDuration.toFixed(2) + 's</strong>';
            }
          }
          actx.close().catch(() => {});
        }).catch(() => {
          actx.close().catch(() => {});
        });
      }).catch(() => {});

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = String(ev.target.result || '');
        loadedAudioB64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
        loadedAudioName = file.name;
        cachedFinalSignature = null;

        await probeLoadedAudioOnServer(false);
      };
      reader.readAsDataURL(file);
    });
  }

  async function probeLoadedAudioOnServer(fixHeader = false) {
    if (!loadedAudioB64) return null;
    const readout = document.getElementById('expAudioProbeReadout');
    const fixBtn = document.getElementById('btnFixAndDownloadAudio');

    try {
      if (fixHeader && fixBtn) {
        fixBtn.disabled = true;
        fixBtn.textContent = '⏳ Rebuilding Header...';
      }

      const res = await fetch('/api/export/audio/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioB64: loadedAudioB64,
          audioName: loadedAudioName,
          fixHeader: fixHeader
        })
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      if (data.decodedDuration > 0) {
        loadedAudioTrueDuration = Number(data.decodedDuration.toFixed(2));
      }

      if (fixHeader && data.fixedAudioB64) {
        loadedAudioB64 = data.fixedAudioB64;
        cachedFinalSignature = null;
      }

      if (readout) {
        const decStr = loadedAudioTrueDuration.toFixed(2) + 's';
        const hdrStr = data.headerDuration ? data.headerDuration.toFixed(2) + 's' : 'N/A';
        if (data.headerMismatch) {
          readout.innerHTML =
            '⚠️ <strong>VBR Header Mismatch Detected:</strong> Header claims <span style="color:#ff7b72;">' + hdrStr + '</span>, ' +
            'but True Decoded Length is <strong style="color:#3fb950;">' + decStr + '</strong>.<br>' +
            '<span style="color:#8b949e; font-size:0.7rem;">(MP4 export automatically uses the true decoded stream).</span>';
        } else {
          readout.innerHTML =
            '✅ True Decoded Length: <strong style="color:#3fb950;">' + decStr + '</strong> ' +
            '<span style="color:#8b949e;">(Header: ' + hdrStr + ' — Verified Clean)</span>';
        }
      }

      return data;
    } catch (err) {
      if (readout && loadedAudioTrueDuration > 0) {
        readout.innerHTML = '✅ WebAudio Decoded Length: <strong style="color:#3fb950;">' + loadedAudioTrueDuration.toFixed(2) + 's</strong>';
      } else if (readout) {
        readout.innerHTML = '<span style="color:#ff7b72;">Audio probe error: ' + err.message + '</span>';
      }
      return null;
    } finally {
      if (fixBtn) {
        fixBtn.disabled = false;
        fixBtn.textContent = '🔧 Download Fixed Audio';
      }
    }
  }

  function matchVideoToAudioDuration() {
    if (loadedAudioTrueDuration <= 0) {
      alert('Attach an audio file first so its true duration can be measured.');
      return;
    }
    const rounded = Math.max(0.5, Number(loadedAudioTrueDuration.toFixed(1)));
    setElVal('expDuration', rounded);
    setElVal('durationSlider', rounded);
    setElVal('durationNum', rounded);
    if (typeof window.triggerAppRender === 'function') {
      window.triggerAppRender();
    }
    cachedFinalSignature = null;

    const camDur = document.getElementById('expCamDuration')?.value || document.getElementById('camDurationSlider')?.value || 7;
    const readout = document.getElementById('expAudioProbeReadout');
    if (readout) {
      readout.innerHTML =
        '✅ Total Scene/Video Length set to <strong style="color:#58a6ff;">' + rounded + 's</strong> ' +
        '(Camera Move stays at <strong>' + camDur + 's</strong>).';
    }
  }

  async function fixAndDownloadAudioFile() {
    if (!loadedAudioB64) return;
    const data = await probeLoadedAudioOnServer(true);
    if (!data || !data.fixedAudioB64) {
      alert('Failed to repair audio header.');
      return;
    }

    const extMatch = loadedAudioName.match(/\.[^/.]+$/);
    const ext = extMatch ? extMatch[0] : '.mp3';
    const base = loadedAudioName.replace(/\.[^/.]+$/, '');
    const mime = ext.toLowerCase() === '.wav' ? 'audio/wav' : 'audio/mpeg';

    const blob = await (await fetch('data:' + mime + ';base64,' + data.fixedAudioB64)).blob();
    const url = URL.createObjectURL(blob);
    triggerFileDownload(url, base + '_fixed' + ext);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function clearExportAudio() {
    loadedAudioB64 = '';
    loadedAudioName = '';
    loadedAudioTrueDuration = 0;
    const audioInput = document.getElementById('expAudioInput');
    const lbl = document.getElementById('expAudioLabel');
    const clr = document.getElementById('btnClearExportAudio');
    const tools = document.getElementById('expAudioTools');
    if (audioInput) audioInput.value = '';
    if (lbl) lbl.textContent = 'Attach .MP3 / .WAV / .M4A Audio...';
    if (clr) clr.style.display = 'none';
    if (tools) tools.style.display = 'none';
    cachedFinalSignature = null;
  }

  function updateDownloadButtonLabel() {
    const btnDown = document.getElementById('btnDownloadFinal');
    const formatSelect = document.getElementById('expFormat');
    const audioGroup = document.getElementById('expAudioGroup');
    if (!btnDown || !formatSelect) return;

    const fmt = formatSelect.value;
    if (audioGroup) {
      audioGroup.style.display = (fmt === 'mp4' || fmt === 'all') ? 'flex' : 'none';
    }

    if (fmt === 'all') {
      btnDown.innerText = 'Download All (MP4 + WebP + APNG)';
    } else if (fmt === 'both') {
      btnDown.innerText = 'Download Both (WebP + APNG)';
    } else if (fmt === 'mp4') {
      btnDown.innerText = 'Download Final MP4';
    } else if (fmt === 'apng') {
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

    const sceneDur = st.duration || 7;
    const camDur = (st.camera && st.camera.camDuration) ? st.camera.camDuration : 7;
    const camLoop = (st.camera && st.camera.camLoop) ? st.camera.camLoop : 'once';
    const containerLoop = st.loop || 'loop';

    setElVal('expWidth', w);
    setElVal('expHeight', h);
    setElVal('expDuration', sceneDur);
    setElVal('expCamDuration', camDur);
    setElVal('expCamLoop', camLoop);
    setElVal('expLoop', containerLoop);
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
    const vid = document.getElementById('previewVideo');
    if (vid) vid.pause();
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
      setElVal('expCamLoop', 'once');
      setElVal('expLoop', 'once');
      setElChecked('expEnableCamera', true);
      setElChecked('expEnableOptical', true);
      setElChecked('expEnableNodes', true);
      setElChecked('expEnableFlows', false);
      setElChecked('expEnableGlows', false);
      setElChecked('expEnableRipples', false);
    } else if (profile === 'overlays-loop') {
      setElVal('expCamLoop', 'once');
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

    const totalVideoDuration = Math.max(0.5, parseFloat(document.getElementById('expDuration')?.value) || payloadState.duration || 7);
    const cameraMoveDuration = Math.max(
      0.5,
      parseFloat(document.getElementById('expCamDuration')?.value) ||
      (payloadState.camera && payloadState.camera.camDuration) ||
      7
    );
    const cameraBehavior = document.getElementById('expCamLoop')?.value ||
      (payloadState.camera && payloadState.camera.camLoop) ||
      'once';
    const containerLoop = document.getElementById('expLoop')?.value || payloadState.loop || 'loop';

    const selectedFormat = document.getElementById('expFormat')?.value || 'mp4';
    const selectedFps = parseInt(document.getElementById('expFps')?.value, 10) || 24;
    const selectedAudioFit = document.getElementById('expAudioFit')?.value || 'loop';

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
      } else if (renderFormat === 'all') {
        renderFormat = 'mp4';
      }
    }

    payloadState.duration = totalVideoDuration;
    payloadState.loop = containerLoop;
    payloadState.camera.camDuration = cameraMoveDuration;
    payloadState.camera.camLoop = cameraBehavior;

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

    const backendState = JSON.parse(JSON.stringify(payloadState));
    backendState.duration = totalVideoDuration;
    backendState.loop = containerLoop;

    const includeAudio = (renderFormat === 'mp4' || renderFormat === 'all') && !!loadedAudioB64;

    return {
      jobId: jobId,
      format: renderFormat,
      duration: totalVideoDuration,
      fps: renderFps,
      width: renderWidth,
      height: renderHeight,
      svgMarkup: svgMarkup,
      audioB64: includeAudio ? loadedAudioB64 : '',
      audioName: includeAudio ? loadedAudioName : '',
      audioFit: selectedAudioFit,
      state: backendState
    };
  }

  function showPreviewMedia(blobUrl, isVideo) {
    const placeholder = document.getElementById('previewPlaceholder');
    const previewImg = document.getElementById('previewImage');
    const previewVid = document.getElementById('previewVideo');

    if (placeholder) placeholder.style.display = 'none';

    if (isVideo) {
      if (previewImg) {
        previewImg.style.display = 'none';
        previewImg.src = '';
      }
      if (previewVid) {
        previewVid.src = blobUrl;
        previewVid.style.display = 'block';
        previewVid.play().catch(() => {});
      }
    } else {
      if (previewVid) {
        previewVid.pause();
        previewVid.style.display = 'none';
        previewVid.src = '';
      }
      if (previewImg) {
        previewImg.src = blobUrl;
        previewImg.style.display = 'block';
      }
    }
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
    const previewMeta = document.getElementById('previewMeta');

    if (cachedPreviewBlobUrl) {
      showPreviewMedia(cachedPreviewBlobUrl, cachedPreviewIsVideo);
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

    if (payload.format === 'both' || payload.format === 'all') {
      const data = await response.json();
      const bId = encodeURIComponent(data.bundleId);
      const fetches = [
        fetch('/api/export/bundle?bundleId=' + bId + '&fmt=webp', { signal: signal }),
        fetch('/api/export/bundle?bundleId=' + bId + '&fmt=apng', { signal: signal })
      ];
      if (payload.format === 'all') {
        fetches.push(fetch('/api/export/bundle?bundleId=' + bId + '&fmt=mp4', { signal: signal }));
      }

      const responses = await Promise.all(fetches);
      if (responses.some((r) => !r.ok)) {
        throw new Error('Failed to stream rendered bundle files from server');
      }

      const webpBlob = await responses[0].blob();
      const apngBlob = await responses[1].blob();
      const mp4Blob = payload.format === 'all' ? await responses[2].blob() : null;
      return { mode: payload.format, webpBlob: webpBlob, apngBlob: apngBlob, mp4Blob: mp4Blob };
    }

    const singleBlob = await response.blob();
    return { mode: 'single', blob: singleBlob };
  }

  async function generatePreview() {
    const placeholder = document.getElementById('previewPlaceholder');
    const previewImg = document.getElementById('previewImage');
    const previewVid = document.getElementById('previewVideo');
    const previewMeta = document.getElementById('previewMeta');

    activeJobId = 'job-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    activeAbortController = new AbortController();

    const payload = buildExportPayload(true, activeJobId);
    const totalFrames = Math.max(1, Math.round(payload.duration * payload.fps * (payload.state.loop === 'pingpong' ? 2 : 1)));

    if (placeholder) placeholder.style.display = 'none';
    if (previewImg) previewImg.style.display = 'none';
    if (previewVid) { previewVid.pause(); previewVid.style.display = 'none'; }

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
      cachedPreviewIsVideo = payload.format === 'mp4';

      stopProgressPolling();
      showPreviewMedia(cachedPreviewBlobUrl, cachedPreviewIsVideo);

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      const sizeKB = (blob.size / 1024).toFixed(1);
      const audioNote = payload.audioName ? (' • 🔊 ' + payload.audioName) : '';
      if (previewMeta) {
        previewMeta.innerText = 'Preview: ' + payload.format.toUpperCase() + ' • ' + payload.width + '×' + payload.height + 'px (' + totalFrames + ' frames @ ' + PREVIEW_FPS + ' FPS)' + audioNote + ' • ' + sizeKB + ' KB (' + elapsed + 's)';
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
    if (!cachedPreviewBlob) return;

    if (cachedPreviewIsVideo) {
      const previewVid = document.getElementById('previewVideo');
      if (previewVid) {
        previewVid.currentTime = 0;
        previewVid.play().catch(() => {});
      }
      return;
    }

    const previewImg = document.getElementById('previewImage');
    if (!previewImg) return;

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
    const previewVid = document.getElementById('previewVideo');
    const placeholder = document.getElementById('previewPlaceholder');
    const baseFilename = (document.getElementById('expFilename')?.value || 'animation_export').replace(/\.(webp|png|apng|mp4)$/i, '');

    const signatureCheckPayload = buildExportPayload(false, '');
    const currentSig = JSON.stringify(signatureCheckPayload);

    try {
      const isCacheValid = cachedFinalSignature === currentSig &&
        ((signatureCheckPayload.format === 'all' && cachedFinalWebpBlobUrl && cachedFinalApngBlobUrl && cachedFinalMp4BlobUrl) ||
         (signatureCheckPayload.format === 'both' && cachedFinalWebpBlobUrl && cachedFinalApngBlobUrl) ||
         (signatureCheckPayload.format === 'webp' && cachedFinalWebpBlobUrl) ||
         (signatureCheckPayload.format === 'apng' && cachedFinalApngBlobUrl) ||
         (signatureCheckPayload.format === 'mp4' && cachedFinalMp4BlobUrl));

      if (!isCacheValid) {
        activeJobId = 'job-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
        activeAbortController = new AbortController();

        const payload = buildExportPayload(false, activeJobId);
        const totalFrames = Math.max(1, Math.round(payload.duration * payload.fps * (payload.state.loop === 'pingpong' ? 2 : 1)));

        if (btnDown) btnDown.innerText = 'Rendering (' + payload.width + '×' + payload.height + ')...';
        if (placeholder) placeholder.style.display = 'none';
        if (previewImg) previewImg.style.display = 'none';
        if (previewVid) { previewVid.pause(); previewVid.style.display = 'none'; }

        setRenderButtonsState(true);
        startProgressPolling(activeJobId, totalFrames);

        const startTime = performance.now();
        const result = await requestBitmapRender(payload, activeAbortController.signal);
        stopProgressPolling();

        if (cachedFinalWebpBlobUrl) { URL.revokeObjectURL(cachedFinalWebpBlobUrl); cachedFinalWebpBlobUrl = null; }
        if (cachedFinalApngBlobUrl) { URL.revokeObjectURL(cachedFinalApngBlobUrl); cachedFinalApngBlobUrl = null; }
        if (cachedFinalMp4BlobUrl) { URL.revokeObjectURL(cachedFinalMp4BlobUrl); cachedFinalMp4BlobUrl = null; }
        if (cachedPreviewBlobUrl) { URL.revokeObjectURL(cachedPreviewBlobUrl); cachedPreviewBlobUrl = null; }

        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

        if (result.mode === 'all') {
          cachedFinalWebpBlobUrl = URL.createObjectURL(result.webpBlob);
          cachedFinalApngBlobUrl = URL.createObjectURL(result.apngBlob);
          cachedFinalMp4BlobUrl = URL.createObjectURL(result.mp4Blob);
          cachedPreviewBlob = result.mp4Blob;
          cachedPreviewBlobUrl = URL.createObjectURL(result.mp4Blob);
          cachedPreviewIsVideo = true;

          const mp4KB = (result.mp4Blob.size / 1024).toFixed(1);
          const webpKB = (result.webpBlob.size / 1024).toFixed(1);
          const apngKB = (result.apngBlob.size / 1024).toFixed(1);
          if (previewMeta) {
            previewMeta.innerText = 'Final Render: MP4 (' + mp4KB + ' KB) + WebP (' + webpKB + ' KB) + APNG (' + apngKB + ' KB) • ' + payload.width + '×' + payload.height + 'px (' + elapsed + 's)';
          }
        } else if (result.mode === 'both') {
          cachedFinalWebpBlobUrl = URL.createObjectURL(result.webpBlob);
          cachedFinalApngBlobUrl = URL.createObjectURL(result.apngBlob);
          cachedPreviewBlob = result.webpBlob;
          cachedPreviewBlobUrl = URL.createObjectURL(result.webpBlob);
          cachedPreviewIsVideo = false;

          const webpKB = (result.webpBlob.size / 1024).toFixed(1);
          const apngKB = (result.apngBlob.size / 1024).toFixed(1);
          if (previewMeta) {
            previewMeta.innerText = 'Final Render: WebP (' + webpKB + ' KB) + APNG (' + apngKB + ' KB) • ' + payload.width + '×' + payload.height + 'px • ' + payload.fps + ' FPS (' + elapsed + 's)';
          }
        } else {
          const singleUrl = URL.createObjectURL(result.blob);
          if (payload.format === 'webp') {
            cachedFinalWebpBlobUrl = singleUrl;
            cachedPreviewIsVideo = false;
          } else if (payload.format === 'mp4') {
            cachedFinalMp4BlobUrl = singleUrl;
            cachedPreviewIsVideo = true;
          } else {
            cachedFinalApngBlobUrl = singleUrl;
            cachedPreviewIsVideo = false;
          }
          cachedPreviewBlob = result.blob;
          cachedPreviewBlobUrl = URL.createObjectURL(result.blob);

          const sizeKB = (result.blob.size / 1024).toFixed(1);
          if (previewMeta) {
            previewMeta.innerText = 'Final Render: ' + payload.format.toUpperCase() + ' • ' + payload.width + '×' + payload.height + 'px • ' + payload.fps + ' FPS • ' + sizeKB + ' KB (' + elapsed + 's)';
          }
        }

        cachedFinalSignature = currentSig;
        showPreviewMedia(cachedPreviewBlobUrl, cachedPreviewIsVideo);
      }

      if (signatureCheckPayload.format === 'all') {
        triggerFileDownload(cachedFinalMp4BlobUrl, baseFilename + '.mp4');
        setTimeout(() => triggerFileDownload(cachedFinalWebpBlobUrl, baseFilename + '.webp'), 250);
        setTimeout(() => triggerFileDownload(cachedFinalApngBlobUrl, baseFilename + '.png'), 500);
      } else if (signatureCheckPayload.format === 'both') {
        triggerFileDownload(cachedFinalWebpBlobUrl, baseFilename + '.webp');
        setTimeout(() => triggerFileDownload(cachedFinalApngBlobUrl, baseFilename + '.png'), 250);
      } else if (signatureCheckPayload.format === 'mp4') {
        triggerFileDownload(cachedFinalMp4BlobUrl, baseFilename + '.mp4');
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

  document.addEventListener('DOMContentLoaded', () => {
    bindModalEvents();
    document.getElementById('btnOpenBitmapModal')?.addEventListener('click', (e) => {
      e.preventDefault();
      openExportModal();
    });
  });

  window.openExportModal = openExportModal;
  window.closeExportModal = closeExportModal;
  window.setExportResolution = setExportResolution;
  window.applyExportProfile = applyExportProfile;
  window.clearExportAudio = clearExportAudio;
  window.matchVideoToAudioDuration = matchVideoToAudioDuration;
  window.fixAndDownloadAudioFile = fixAndDownloadAudioFile;
  window.generatePreview = generatePreview;
  window.replayPreview = replayPreview;
  window.cancelCurrentRender = cancelCurrentRender;
  window.downloadFinal = downloadFinal;
})();