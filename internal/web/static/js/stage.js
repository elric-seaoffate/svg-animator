/**
 * Interactive Stage Viewport & Coordinate Math Module (`window.Stage`)
 *
 * Layer 3 (Operational Viewport & Coordinate Math — Zero DOM Dependencies):
 *   - `computeSnappedPosition(xPct, yPct, snapConfig)`
 *   - `computeSnappedPct(valPct, axis, snapConfig)`
 *   - `computeFitScale(viewportW, viewportH, canvasW, canvasH, padding)`
 *   - `rectClientToPct(clientX, clientY, rect)`
 *
 * Layer 1 (Stage UI, Zoom/Pan Controls, and Pointer/Drag Listeners):
 *   - `init(onPlaceCallback, onFileLoadedCallback)`, `initZoomControls()`,
 *     `snapPctToGrid(xPct, yPct)`, `setManualZoomPct(pct)`, `getFitScale()`,
 *     `getEffectiveScale()`, `syncOverlayBounds(canvasW, canvasH)`,
 *     `clientToCanvasPct(clientX, clientY)`, `setActive(target)`, `clearActive()`,
 *     `updateReticles(sX, sY, eX, eY)`, `loadFile(file, callback)`
 */
['dragenter', 'dragover', 'dragleave', 'drop'].forEach((evt) => {
  document.addEventListener(evt, (e) => e.preventDefault(), false);
});

window.Stage = {
  activePlacement: 'start',
  isDragging: false,
  isPanningStage: false,
  isDraggingPhotoCrop: false,
  dragPhotoCropEnabled: false,
  spacePressed: false,
  canvasWidth: 1280,
  canvasHeight: 720,
  zoomMode: 'fit',
  zoomScale: 1.0,
  panX: 0,
  panY: 0,
  panStartClientX: 0,
  panStartClientY: 0,
  cropDragLastX: 0,
  cropDragLastY: 0,
  nodeGrabOffsetX: 0,
  nodeGrabOffsetY: 0,

  // =========================================================================
  // Layer 3: Operational Viewport & Coordinate Math (Zero DOM Dependencies)
  // =========================================================================

  computeSnappedPosition(xPct, yPct, snapConfig = {}) {
    if (!snapConfig || !snapConfig.enabled) {
      return {
        x: Math.round(Math.min(100, Math.max(0, xPct)) * 10) / 10,
        y: Math.round(Math.min(100, Math.max(0, yPct)) * 10) / 10
      };
    }

    const gridPx = Math.max(2, parseFloat(snapConfig.gridSizePx || 20) || 20);
    const w = snapConfig.canvasWidth || this.canvasWidth || 1280;
    const h = snapConfig.canvasHeight || this.canvasHeight || 720;

    const rawPxX = (xPct / 100) * w;
    const rawPxY = (yPct / 100) * h;

    const snappedPxX = Math.min(w, Math.max(0, Math.round(rawPxX / gridPx) * gridPx));
    const snappedPxY = Math.min(h, Math.max(0, Math.round(rawPxY / gridPx) * gridPx));

    return {
      x: Number(((snappedPxX / w) * 100).toFixed(3)),
      y: Number(((snappedPxY / h) * 100).toFixed(3))
    };
  },

  computeSnappedPct(valPct, axis = 'x', snapConfig = {}) {
    const pos = axis === 'y'
      ? this.computeSnappedPosition(0, valPct, snapConfig)
      : this.computeSnappedPosition(valPct, 0, snapConfig);
    return axis === 'y' ? pos.y : pos.x;
  },

  computeFitScale(viewportW, viewportH, canvasW, canvasH, padding = 28) {
    const cW = Math.max(1, canvasW || 1280);
    const cH = Math.max(1, canvasH || 720);
    const availW = Math.max(64, (viewportW || 0) - padding * 2);
    const availH = Math.max(64, (viewportH || 0) - padding * 2);
    return Math.min(availW / cW, availH / cH);
  },

  rectClientToPct(clientX, clientY, rect) {
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return { x: 50, y: 50 };
    }
    const rawX = ((clientX - rect.left) / rect.width) * 100;
    const rawY = ((clientY - rect.top) / rect.height) * 100;
    return {
      x: Math.round(Math.min(100, Math.max(0, rawX)) * 10) / 10,
      y: Math.round(Math.min(100, Math.max(0, rawY)) * 10) / 10
    };
  },

  // =========================================================================
  // Layer 1: Stage UI & Compatibility Methods
  // =========================================================================

  snapPctToGrid(xPct, yPct) {
    if (window.AppCoordinator && typeof window.AppCoordinator.getSnapConfig === 'function') {
      const cfg = window.AppCoordinator.getSnapConfig();
      cfg.canvasWidth = this.canvasWidth || cfg.canvasWidth || 1280;
      cfg.canvasHeight = this.canvasHeight || cfg.canvasHeight || 720;
      return this.computeSnappedPosition(xPct, yPct, cfg);
    }

    const snapChk = document.getElementById('chkSnapToGrid');
    const snapSizeEl = document.getElementById('snapGridSizeNum') || document.getElementById('snapGridSizeSlider');
    return this.computeSnappedPosition(xPct, yPct, {
      enabled: !!(snapChk && snapChk.checked),
      gridSizePx: parseFloat(snapSizeEl ? snapSizeEl.value : 20) || 20,
      canvasWidth: this.canvasWidth || 1280,
      canvasHeight: this.canvasHeight || 720
    });
  },

  init(onPlaceCallback, onFileLoadedCallback) {
    this.previewBox = document.getElementById('previewBox');
    this.svgContainer = document.getElementById('svgContainer');
    this.overlayLayer = document.getElementById('stageOverlayLayer');
    this.trajectorySvg = document.getElementById('trajectorySvg');
    this.borderBadge = document.getElementById('canvasBorderBadge');
    this.uploadDrop = document.getElementById('uploadDrop');
    this.fileInput = document.getElementById('fileInput');
    this.onPlaceCallback = onPlaceCallback;

    if (this.trajectorySvg && !document.getElementById('nodeSelectionBox')) {
      const ns = 'http://www.w3.org/2000/svg';
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('id', 'nodeSelectionBox');
      rect.setAttribute('rx', '8');
      rect.setAttribute('fill', 'none');
      rect.setAttribute('stroke', '#a371f7');
      rect.setAttribute('stroke-width', '2');
      rect.setAttribute('stroke-dasharray', '6,4');
      rect.style.display = 'none';
      this.trajectorySvg.appendChild(rect);
    }

    this.initZoomControls();

    // Prevent Spacebar from activating focused buttons when used to pan the stage
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) {
        e.preventDefault();
        this.spacePressed = true;
        if (this.previewBox) this.previewBox.classList.add('panning-stage');
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spacePressed = false;
        if (!this.isPanningStage && this.previewBox) {
          this.previewBox.classList.remove('panning-stage');
        }
      }
    });

    if (this.previewBox) {
      this.previewBox.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const currentPct = Math.round(this.getEffectiveScale() * 100);
          const delta = e.deltaY < 0 ? 15 : -15;
          this.setManualZoomPct(Math.min(300, Math.max(25, currentPct + delta)));
        }
      }, { passive: false });

      this.previewBox.addEventListener('pointerdown', (e) => {
        if (e.target && e.target.closest && e.target.closest('#floatingContextEditor')) {
          return;
        }

        if (e.button === 1 || (e.button === 0 && this.spacePressed)) {
          e.preventDefault();
          this.isPanningStage = true;
          this.panStartClientX = e.clientX - this.panX;
          this.panStartClientY = e.clientY - this.panY;
          this.previewBox.classList.add('panning-stage');
          try { this.previewBox.setPointerCapture(e.pointerId); } catch (_) {}
          return;
        }

        if (e.button !== 0) return;

        if (this.dragPhotoCropEnabled && typeof this.onPhotoCropDrag === 'function') {
          this.isDraggingPhotoCrop = true;
          this.cropDragLastX = e.clientX;
          this.cropDragLastY = e.clientY;
          try { this.previewBox.setPointerCapture(e.pointerId); } catch (_) {}
          return;
        }

        const coords = this.clientToCanvasPct(e.clientX, e.clientY);

        const flowReticle = e.target.closest ? e.target.closest('[data-flow-node-idx]') : null;
        if (flowReticle) {
          const idx = parseInt(flowReticle.getAttribute('data-flow-node-idx'), 10);
          if (!isNaN(idx)) {
            if (window.AppCoordinator && typeof window.AppCoordinator.selectWaypoint === 'function') {
              window.AppCoordinator.selectWaypoint(idx);
            } else if (window.DataFlows && typeof window.DataFlows.selectWaypoint === 'function') {
              window.DataFlows.selectWaypoint(idx);
            }
          }
          this.nodeGrabOffsetX = 0;
          this.nodeGrabOffsetY = 0;
          this.isDragging = true;
          try { this.previewBox.setPointerCapture(e.pointerId); } catch (_) {}
          const snappedFlow = this.snapPctToGrid(coords.x, coords.y);
          this.onPlaceCallback(this.activePlacement, snappedFlow.x, snappedFlow.y);
          return;
        }

        const otherOverlayActive =
          (window.DataFlows && window.DataFlows.activeId !== null) ||
          (window.Glows && window.Glows.activeId !== null) ||
          (window.Ripples && window.Ripples.activeId !== null);

        if (!otherOverlayActive && window.DiagramNodes) {
          let clickedNode = null;
          const nodeGroup = e.target.closest ? e.target.closest('[data-node-id]') : null;
          if (nodeGroup) {
            const clickedId = parseInt(nodeGroup.getAttribute('data-node-id'), 10);
            clickedNode = window.DiagramNodes.getNode
              ? window.DiagramNodes.getNode(clickedId)
              : (window.DiagramNodes.list.find((n) => n.id === clickedId) || null);
          }
          if (!clickedNode && typeof window.DiagramNodes.findNodeAtPct === 'function') {
            clickedNode = window.DiagramNodes.findNodeAtPct(coords.x, coords.y, this.canvasWidth, this.canvasHeight);
          }

          if (clickedNode) {
            if (window.AppCoordinator && typeof window.AppCoordinator.selectObject === 'function') {
              window.AppCoordinator.selectObject('node', clickedNode.id, { openAccordionId: 'acc-nodes' });
            }
            this.nodeGrabOffsetX = clickedNode.x - coords.x;
            this.nodeGrabOffsetY = clickedNode.y - coords.y;
          } else {
            this.nodeGrabOffsetX = 0;
            this.nodeGrabOffsetY = 0;
          }
        } else {
          this.nodeGrabOffsetX = 0;
          this.nodeGrabOffsetY = 0;
        }

        this.isDragging = true;
        try { this.previewBox.setPointerCapture(e.pointerId); } catch (_) {}

        const rawTargetX = Math.min(100, Math.max(0, coords.x + this.nodeGrabOffsetX));
        const rawTargetY = Math.min(100, Math.max(0, coords.y + this.nodeGrabOffsetY));
        const snapped = this.snapPctToGrid(rawTargetX, rawTargetY);
        this.onPlaceCallback(this.activePlacement, snapped.x, snapped.y);
      });

      this.previewBox.addEventListener('pointermove', (e) => {
        if (this.isPanningStage) {
          this.panX = e.clientX - this.panStartClientX;
          this.panY = e.clientY - this.panStartClientY;
          this.syncOverlayBounds(this.canvasWidth, this.canvasHeight);
          return;
        }

        if (this.isDraggingPhotoCrop && typeof this.onPhotoCropDrag === 'function') {
          const dx = e.clientX - this.cropDragLastX;
          const dy = e.clientY - this.cropDragLastY;
          this.cropDragLastX = e.clientX;
          this.cropDragLastY = e.clientY;
          this.onPhotoCropDrag(dx, dy);
          return;
        }

        if (!this.isDragging) return;
        const coords = this.clientToCanvasPct(e.clientX, e.clientY);
        const rawTargetX = Math.min(100, Math.max(0, coords.x + this.nodeGrabOffsetX));
        const rawTargetY = Math.min(100, Math.max(0, coords.y + this.nodeGrabOffsetY));
        const snapped = this.snapPctToGrid(rawTargetX, rawTargetY);
        this.onPlaceCallback(this.activePlacement, snapped.x, snapped.y);
      });

      const endDrag = (e) => {
        if (this.isPanningStage) {
          this.isPanningStage = false;
          if (!this.spacePressed && this.previewBox) {
            this.previewBox.classList.remove('panning-stage');
          }
        }
        const wasDragging = this.isDragging || this.isDraggingPhotoCrop;
        this.isDraggingPhotoCrop = false;
        this.isDragging = false;
        this.nodeGrabOffsetX = 0;
        this.nodeGrabOffsetY = 0;
        try { this.previewBox.releasePointerCapture(e.pointerId); } catch (_) {}

        if (wasDragging) {
          if (window.AppCoordinator && typeof window.AppCoordinator.requestRender === 'function') {
            window.AppCoordinator.requestRender();
          } else if (typeof window.triggerAppRender === 'function') {
            window.triggerAppRender();
          }
          if (window.AppCoordinator && typeof window.AppCoordinator.recordHistoryImmediate === 'function') {
            window.AppCoordinator.recordHistoryImmediate();
          } else if (window.HistoryManager) {
            window.HistoryManager.recordImmediate();
          }
        }
      };

      this.previewBox.addEventListener('pointerup', endDrag);
      this.previewBox.addEventListener('pointercancel', endDrag);

      if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
          this.syncOverlayBounds(this.canvasWidth, this.canvasHeight);
          if (window.AppCoordinator && typeof window.AppCoordinator.updateActiveOverlays === 'function') {
            window.AppCoordinator.updateActiveOverlays();
          }
        });
        ro.observe(this.previewBox);
      }
    }

    if (this.uploadDrop) {
      this.uploadDrop.addEventListener('dragover', () => this.uploadDrop.classList.add('drag-active'));
      this.uploadDrop.addEventListener('dragleave', () => this.uploadDrop.classList.remove('drag-active'));
      this.uploadDrop.addEventListener('drop', (e) => {
        this.uploadDrop.classList.remove('drag-active');
        if (e.dataTransfer && e.dataTransfer.files.length) {
          this.loadFile(e.dataTransfer.files[0], onFileLoadedCallback);
        }
      });
    }

    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
          this.loadFile(e.target.files[0], onFileLoadedCallback);
          this.fileInput.value = '';
        }
      });
    }
  },

  initZoomControls() {
    const slider = document.getElementById('stageZoomSlider');
    const btnIn = document.getElementById('btnZoomIn');
    const btnOut = document.getElementById('btnZoomOut');
    const btnFit = document.getElementById('btnZoomFit');
    const btn100 = document.getElementById('btnZoom100');

    if (slider) {
      slider.addEventListener('input', (e) => {
        this.setManualZoomPct(parseInt(e.target.value, 10));
      });
    }
    if (btnIn) {
      btnIn.addEventListener('click', () => {
        const cur = Math.round(this.getEffectiveScale() * 100);
        this.setManualZoomPct(Math.min(300, cur + 20));
      });
    }
    if (btnOut) {
      btnOut.addEventListener('click', () => {
        const cur = Math.round(this.getEffectiveScale() * 100);
        this.setManualZoomPct(Math.max(25, cur - 20));
      });
    }
    if (btnFit) {
      btnFit.addEventListener('click', () => {
        this.zoomMode = 'fit';
        this.panX = 0;
        this.panY = 0;
        this.syncOverlayBounds(this.canvasWidth, this.canvasHeight);
      });
    }
    if (btn100) {
      btn100.addEventListener('click', () => {
        this.panX = 0;
        this.panY = 0;
        this.setManualZoomPct(100);
      });
    }
  },

  setManualZoomPct(pct) {
    this.zoomMode = 'manual';
    this.zoomScale = pct / 100;
    const slider = document.getElementById('stageZoomSlider');
    if (slider) slider.value = pct;
    this.syncOverlayBounds(this.canvasWidth, this.canvasHeight);
  },

  getFitScale() {
    if (!this.previewBox) return 1.0;
    const rect = this.previewBox.getBoundingClientRect();
    return this.computeFitScale(rect.width, rect.height, this.canvasWidth, this.canvasHeight, 28);
  },

  getEffectiveScale() {
    return this.zoomMode === 'fit' ? this.getFitScale() : this.zoomScale;
  },

  syncOverlayBounds(canvasW, canvasH) {
    if (!this.previewBox) return;
    if (canvasW > 0 && canvasH > 0) {
      this.canvasWidth = canvasW;
      this.canvasHeight = canvasH;
    }

    const rect = this.previewBox.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const scale = this.getEffectiveScale();
    const renderedW = this.canvasWidth * scale;
    const renderedH = this.canvasHeight * scale;
    const offsetX = ((rect.width - renderedW) / 2) + this.panX;
    const offsetY = ((rect.height - renderedH) / 2) + this.panY;

    if (this.svgContainer) {
      this.svgContainer.style.left = offsetX + 'px';
      this.svgContainer.style.top = offsetY + 'px';
      this.svgContainer.style.width = renderedW + 'px';
      this.svgContainer.style.height = renderedH + 'px';
    }

    if (this.overlayLayer) {
      this.overlayLayer.style.left = offsetX + 'px';
      this.overlayLayer.style.top = offsetY + 'px';
      this.overlayLayer.style.width = renderedW + 'px';
      this.overlayLayer.style.height = renderedH + 'px';
    }

    if (this.trajectorySvg) {
      this.trajectorySvg.setAttribute('viewBox', '0 0 ' + this.canvasWidth + ' ' + this.canvasHeight);
    }

    const pct = Math.round(scale * 100);
    const zoomLabel = document.getElementById('stageZoomLabel');
    const zoomSlider = document.getElementById('stageZoomSlider');
    if (zoomLabel) zoomLabel.innerText = this.zoomMode === 'fit' ? ('Fit (' + pct + '%)') : (pct + '%');
    if (zoomSlider && this.zoomMode === 'fit') zoomSlider.value = Math.min(300, Math.max(25, pct));
    if (this.borderBadge) {
      const snapCfg = window.AppCoordinator
        ? window.AppCoordinator.getSnapConfig()
        : {
            enabled: !!document.getElementById('chkSnapToGrid')?.checked,
            gridSizePx: document.getElementById('snapGridSizeNum')?.value || 20
          };
      const snapTag = snapCfg.enabled ? (' &bull; 🧲 Grid ' + snapCfg.gridSizePx + 'px') : '';
      this.borderBadge.innerHTML = this.canvasWidth + ' &times; ' + this.canvasHeight + ' px &bull; ' + pct + '%' + snapTag;
    }
  },

  clientToCanvasPct(clientX, clientY) {
    const targetBox = this.svgContainer || this.overlayLayer || this.previewBox;
    if (!targetBox) return { x: 50, y: 50 };
    const rect = targetBox.getBoundingClientRect();
    return this.rectClientToPct(clientX, clientY, rect);
  },

  setActive(target) {
    if (window.AppCoordinator) {
      window.AppCoordinator.selectObject('camera', target, { skipStageClear: true });
    }
    this.activePlacement = target;
    const btnStart = document.getElementById('btnModeStart');
    const btnEnd = document.getElementById('btnModeEnd');
    const retS = document.getElementById('reticleStart');
    const retE = document.getElementById('reticleEnd');
    if (btnStart && btnEnd && retS && retE) {
      btnStart.className = target === 'start' ? 'mode-btn active-start' : 'mode-btn';
      btnEnd.className = target === 'end' ? 'mode-btn active-end' : 'mode-btn';
      retS.classList.toggle('active-reticle', target === 'start');
      retE.classList.toggle('active-reticle', target === 'end');
    }
  },

  clearActive() {
    const retS = document.getElementById('reticleStart');
    const retE = document.getElementById('reticleEnd');
    if (retS) retS.classList.remove('active-reticle');
    if (retE) retE.classList.remove('active-reticle');
  },

  updateReticles(sX, sY, eX, eY) {
    const retS = document.getElementById('reticleStart');
    const retE = document.getElementById('reticleEnd');
    const line = document.getElementById('flightLine');
    if (retS) {
      retS.style.left = sX + '%';
      retS.style.top = sY + '%';
    }
    if (retE) {
      retE.style.left = eX + '%';
      retE.style.top = eY + '%';
    }
    if (line) {
      line.setAttribute('x1', sX + '%');
      line.setAttribute('y1', sY + '%');
      line.setAttribute('x2', eX + '%');
      line.setAttribute('y2', eY + '%');
    }
  },

  loadFile(file, callback) {
    if (!file) return;
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      alert('Please choose a valid image file (JPEG, PNG, WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const img = new Image();
      img.onload = () => {
        callback({
          filename: file.name.replace(/\.[^/.]+$/, ''),
          mime: file.type || 'image/jpeg',
          b64: dataUrl.split(',')[1],
          width: img.naturalWidth,
          height: img.naturalHeight,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight
        });
      };
      img.onerror = () => alert('Failed to decode image data.');
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }
};
