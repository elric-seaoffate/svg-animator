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
    // Go/WASM Engine integration with seamless JS fallback
    if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
      const wasmPt = window.EngineBridge.computeSnappedPosition(xPct, yPct, snapConfig);
      if (wasmPt && typeof wasmPt.x === 'number' && typeof wasmPt.y === 'number') {
        return wasmPt;
      }
    }

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

  _startMixedDrag(items, anchorPct, coords, e, potentialSingleType = null, potentialSingleId = null) {
    this.isGroupDragging = true;
    this.potentialSingleSelectType = potentialSingleType;
    this.potentialSingleSelectId = potentialSingleId;
    this.dragAnchorNode = { x: anchorPct.x, y: anchorPct.y };
    this.dragInitialAnchorPct = { x: anchorPct.x, y: anchorPct.y };
    this.groupDragInitialPositions = { items: [] };

    (items || []).forEach((it) => {
      if (it.type === 'node' && window.DiagramNodes) {
        const n = window.DiagramNodes.getNode(it.id);
        if (n) {
          this.groupDragInitialPositions.items.push({
            type: 'node',
            id: n.id,
            initX: n.x,
            initY: n.y
          });
        }
      } else if (it.type === 'glow' && window.Glows) {
        const g = window.Glows.getGlow(it.id);
        if (g) {
          this.groupDragInitialPositions.items.push({
            type: 'glow',
            id: g.id,
            initX: g.x,
            initY: g.y
          });
        }
      } else if (it.type === 'ripple' && window.Ripples) {
        const rp = window.Ripples.getRipple(it.id);
        if (rp) {
          this.groupDragInitialPositions.items.push({
            type: 'ripple',
            id: rp.id,
            initX: rp.x,
            initY: rp.y
          });
        }
      } else if (it.type === 'image' && window.ImageObjects) {
        const img = window.ImageObjects.getImage(it.id);
        if (img) {
          this.groupDragInitialPositions.items.push({
            type: 'image',
            id: img.id,
            initX: img.x,
            initY: img.y
          });
        }
      } else if (it.type === 'flow' && window.DataFlows) {
        const f = window.DataFlows.getFlow(it.id);
        if (f && Array.isArray(f.nodes)) {
          this.groupDragInitialPositions.items.push({
            type: 'flow',
            id: f.id,
            fromNodeId: f.fromNodeId,
            toNodeId: f.toNodeId,
            initNodes: f.nodes.map((p) => ({ x: p.x, y: p.y }))
          });
        }
      }
    });

    this.nodeGrabOffsetX = anchorPct.x - coords.x;
    this.nodeGrabOffsetY = anchorPct.y - coords.y;
    this.dragStartClientX = e.clientX;
    this.dragStartClientY = e.clientY;
    this.hasMovedDrag = false;
    this.isDragging = true;
    try { this.previewBox.setPointerCapture(e.pointerId); } catch (_) {}
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

        // 1. Flow waypoint reticle
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

        // 2. Active camera placement mode
        const isCameraMode = window.AppCoordinator &&
          typeof window.AppCoordinator.getActiveSelection === 'function' &&
          window.AppCoordinator.getActiveSelection().type === 'camera';
        if (isCameraMode && this.activePlacement) {
          this.isDragging = true;
          try { this.previewBox.setPointerCapture(e.pointerId); } catch (_) {}
          const snappedCam = this.snapPctToGrid(coords.x, coords.y);
          this.onPlaceCallback(this.activePlacement, snappedCam.x, snappedCam.y);
          return;
        }

        // 3. Node hit testing
        let clickedNode = null;
        const nodeGroup = e.target.closest ? e.target.closest('[data-node-id]') : null;
        if (nodeGroup) {
          const rawId = nodeGroup.getAttribute('data-node-id');
          const clickedId = parseInt(rawId, 10);
          const queryId = !isNaN(clickedId) ? clickedId : rawId;
          clickedNode = window.DiagramNodes && typeof window.DiagramNodes.getNode === 'function'
            ? (window.DiagramNodes.getNode(queryId) || window.DiagramNodes.getNode(rawId))
            : (window.DiagramNodes && window.DiagramNodes.list ? window.DiagramNodes.list.find((n) => String(n.id) === String(rawId)) : null);
        } else if (window.DiagramNodes && typeof window.DiagramNodes.findNodeAtPct === 'function') {
          const otherOverlay = (window.DataFlows && window.DataFlows.activeId !== null) ||
            (window.Glows && window.Glows.activeId !== null) ||
            (window.Ripples && window.Ripples.activeId !== null);
          if (!otherOverlay) {
            clickedNode = window.DiagramNodes.findNodeAtPct(coords.x, coords.y, this.canvasWidth, this.canvasHeight);
          }
        }

        if (clickedNode) {
          if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
            const effL = window.LayerManager.getEffective('node', clickedNode.id);
            if (effL && (effL.locked || !effL.visible)) {
              clickedNode = null;
            }
          }
        }

        if (clickedNode) {
          const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;
          const currentSelectedItems = (window.AppCoordinator && typeof window.AppCoordinator.getSelectedItems === 'function')
            ? window.AppCoordinator.getSelectedItems()
            : [];
          const isNodeSelected = currentSelectedItems.some((it) => it.type === 'node' && String(it.id) === String(clickedNode.id));

          if (isModifier) {
            if (window.AppCoordinator && typeof window.AppCoordinator.toggleObjectSelection === 'function') {
              window.AppCoordinator.toggleObjectSelection('node', clickedNode.id);
            }
            this.isDragging = false;
            return;
          }

          const memberGroup = (window.AppCoordinator && !window.AppCoordinator.isInGroupEditMode())
            ? window.AppCoordinator.findGroupByMember('node', clickedNode.id)
            : null;

          if (memberGroup) {
            window.AppCoordinator.selectGroup(memberGroup.id);
            this._startMixedDrag(memberGroup.members, { x: clickedNode.x, y: clickedNode.y }, coords, e);
            return;
          }

          if (currentSelectedItems.length > 1 && isNodeSelected) {
            // Node is part of existing multi-selection -> prepare group drag
            this._startMixedDrag(currentSelectedItems, { x: clickedNode.x, y: clickedNode.y }, coords, e, 'node', clickedNode.id);
            return;
          }

          // Single selection
          this.isGroupDragging = false;
          this.potentialSingleSelectType = null;
          this.potentialSingleSelectId = null;
          this.groupDragInitialPositions = null;
          if (window.AppCoordinator && typeof window.AppCoordinator.selectObject === 'function') {
            window.AppCoordinator.selectObject('node', clickedNode.id, { openAccordionId: 'acc-nodes' });
          }
          this.nodeGrabOffsetX = clickedNode.x - coords.x;
          this.nodeGrabOffsetY = clickedNode.y - coords.y;
          this.dragStartClientX = e.clientX;
          this.dragStartClientY = e.clientY;
          this.hasMovedDrag = false;
          this.isDragging = true;
          try { this.previewBox.setPointerCapture(e.pointerId); } catch (_) {}
          return;
        }

        // 3b. Image hit testing
        let clickedImage = null;
        const imgEl = e.target.closest ? e.target.closest('[data-image-id], [id^="img-image-"]') : null;
        if (imgEl && window.ImageObjects) {
          let rawId = imgEl.getAttribute('data-image-id');
          if (!rawId && imgEl.id) {
            rawId = imgEl.id.replace(/^img-/, '');
          }
          if (rawId) {
            clickedImage = window.ImageObjects.getImage(rawId);
          }
        } else if (window.ImageObjects && typeof window.ImageObjects.findImageAtPct === 'function') {
          clickedImage = window.ImageObjects.findImageAtPct(coords.x, coords.y, this.canvasWidth, this.canvasHeight);
        }

        if (clickedImage) {
          if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
            const effL = window.LayerManager.getEffective('image', clickedImage.id);
            if (effL && (effL.locked || !effL.visible)) {
              clickedImage = null;
            }
          }
        }

        if (clickedImage) {
          const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;
          const currentSelectedItems = (window.AppCoordinator && typeof window.AppCoordinator.getSelectedItems === 'function')
            ? window.AppCoordinator.getSelectedItems()
            : [];
          const isImgSelected = currentSelectedItems.some((it) => it.type === 'image' && String(it.id) === String(clickedImage.id));

          if (isModifier) {
            if (window.AppCoordinator && typeof window.AppCoordinator.toggleObjectSelection === 'function') {
              window.AppCoordinator.toggleObjectSelection('image', clickedImage.id);
            }
            this.isDragging = false;
            return;
          }

          const memberGroup = (window.AppCoordinator && !window.AppCoordinator.isInGroupEditMode())
            ? window.AppCoordinator.findGroupByMember('image', clickedImage.id)
            : null;
          if (memberGroup) {
            window.AppCoordinator.selectGroup(memberGroup.id);
            this._startMixedDrag(memberGroup.members, { x: clickedImage.x, y: clickedImage.y }, coords, e);
            return;
          }

          if (currentSelectedItems.length > 1 && isImgSelected) {
            this._startMixedDrag(currentSelectedItems, { x: clickedImage.x, y: clickedImage.y }, coords, e, 'image', clickedImage.id);
            return;
          }

          // Single selection
          this.isGroupDragging = false;
          this.potentialSingleSelectType = null;
          this.potentialSingleSelectId = null;
          this.groupDragInitialPositions = null;
          if (window.AppCoordinator && typeof window.AppCoordinator.selectObject === 'function') {
            window.AppCoordinator.selectObject('image', clickedImage.id, { openAccordionId: 'acc-layers' });
          }
          this.nodeGrabOffsetX = clickedImage.x - coords.x;
          this.nodeGrabOffsetY = clickedImage.y - coords.y;
          this.dragStartClientX = e.clientX;
          this.dragStartClientY = e.clientY;
          this.hasMovedDrag = false;
          this.isDragging = true;
          try { this.previewBox.setPointerCapture(e.pointerId); } catch (_) {}
          return;
        }

        // 4. Glow hit testing
        const glowEl = e.target.closest ? e.target.closest('[data-glow-id], #glowReticleTarget') : null;
        if (glowEl && window.Glows) {
          let glowId = null;
          if (glowEl.getAttribute && glowEl.getAttribute('data-glow-id')) {
            glowId = parseInt(glowEl.getAttribute('data-glow-id'), 10);
          } else if (window.Glows.activeId !== null) {
            glowId = window.Glows.activeId;
          }
          if (glowId !== null && !isNaN(glowId)) {
            if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
              const effL = window.LayerManager.getEffective('glow', glowId);
              if (effL && (effL.locked || !effL.visible)) {
                glowId = null;
              }
            }
          }
          if (glowId !== null && !isNaN(glowId)) {
            const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;
            if (isModifier) {
              if (window.AppCoordinator && typeof window.AppCoordinator.toggleObjectSelection === 'function') {
                window.AppCoordinator.toggleObjectSelection('glow', glowId);
              }
              this.isDragging = false;
              return;
            }

            const memberGroup = (window.AppCoordinator && !window.AppCoordinator.isInGroupEditMode())
              ? window.AppCoordinator.findGroupByMember('glow', glowId)
              : null;
            if (memberGroup) {
              window.AppCoordinator.selectGroup(memberGroup.id);
              const g = window.Glows.getGlow(glowId);
              this._startMixedDrag(memberGroup.members, { x: g ? g.x : coords.x, y: g ? g.y : coords.y }, coords, e);
              return;
            }

            const currentSelectedItems = (window.AppCoordinator && typeof window.AppCoordinator.getSelectedItems === 'function')
              ? window.AppCoordinator.getSelectedItems()
              : [];
            const isGlowSelected = currentSelectedItems.some((it) => it.type === 'glow' && String(it.id) === String(glowId));
            if (currentSelectedItems.length > 1 && isGlowSelected) {
              const g = window.Glows.getGlow(glowId);
              this._startMixedDrag(currentSelectedItems, { x: g ? g.x : coords.x, y: g ? g.y : coords.y }, coords, e, 'glow', glowId);
              return;
            }

            // Single selection
            this.isGroupDragging = false;
            this.potentialSingleSelectType = null;
            this.potentialSingleSelectId = null;
            this.groupDragInitialPositions = null;
            if (window.AppCoordinator && typeof window.AppCoordinator.selectObject === 'function') {
              window.AppCoordinator.selectObject('glow', glowId, { openAccordionId: 'acc-glows' });
            }
            const g = window.Glows.getGlow(glowId);
            this.nodeGrabOffsetX = g ? (g.x - coords.x) : 0;
            this.nodeGrabOffsetY = g ? (g.y - coords.y) : 0;
            this.isDragging = true;
            try { this.previewBox.setPointerCapture(e.pointerId); } catch (_) {}
            return;
          }
        }

        // 5. Ripple hit testing
        const rippleEl = e.target.closest ? e.target.closest('[data-ripple-id], #rippleReticleTarget') : null;
        if (rippleEl && window.Ripples) {
          let rippleId = null;
          if (rippleEl.getAttribute && rippleEl.getAttribute('data-ripple-id')) {
            rippleId = parseInt(rippleEl.getAttribute('data-ripple-id'), 10);
          } else if (window.Ripples.activeId !== null) {
            rippleId = window.Ripples.activeId;
          }
          if (rippleId !== null && !isNaN(rippleId)) {
            if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
              const effL = window.LayerManager.getEffective('ripple', rippleId);
              if (effL && (effL.locked || !effL.visible)) {
                rippleId = null;
              }
            }
          }
          if (rippleId !== null && !isNaN(rippleId)) {
            const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;
            if (isModifier) {
              if (window.AppCoordinator && typeof window.AppCoordinator.toggleObjectSelection === 'function') {
                window.AppCoordinator.toggleObjectSelection('ripple', rippleId);
              }
              this.isDragging = false;
              return;
            }

            const memberGroup = (window.AppCoordinator && !window.AppCoordinator.isInGroupEditMode())
              ? window.AppCoordinator.findGroupByMember('ripple', rippleId)
              : null;
            if (memberGroup) {
              window.AppCoordinator.selectGroup(memberGroup.id);
              const rp = window.Ripples.getRipple(rippleId);
              this._startMixedDrag(memberGroup.members, { x: rp ? rp.x : coords.x, y: rp ? rp.y : coords.y }, coords, e);
              return;
            }

            const currentSelectedItems = (window.AppCoordinator && typeof window.AppCoordinator.getSelectedItems === 'function')
              ? window.AppCoordinator.getSelectedItems()
              : [];
            const isRippleSelected = currentSelectedItems.some((it) => it.type === 'ripple' && String(it.id) === String(rippleId));
            if (currentSelectedItems.length > 1 && isRippleSelected) {
              const rp = window.Ripples.getRipple(rippleId);
              this._startMixedDrag(currentSelectedItems, { x: rp ? rp.x : coords.x, y: rp ? rp.y : coords.y }, coords, e, 'ripple', rippleId);
              return;
            }

            // Single selection
            this.isGroupDragging = false;
            this.potentialSingleSelectType = null;
            this.potentialSingleSelectId = null;
            this.groupDragInitialPositions = null;
            if (window.AppCoordinator && typeof window.AppCoordinator.selectObject === 'function') {
              window.AppCoordinator.selectObject('ripple', rippleId, { openAccordionId: 'acc-ripples' });
            }
            const rp = window.Ripples.getRipple(rippleId);
            this.nodeGrabOffsetX = rp ? (rp.x - coords.x) : 0;
            this.nodeGrabOffsetY = rp ? (rp.y - coords.y) : 0;
            this.isDragging = true;
            try { this.previewBox.setPointerCapture(e.pointerId); } catch (_) {}
            return;
          }
        }

        // 6. Flow track hit testing
        const flowEl = e.target.closest ? e.target.closest('.flow-track-path, [data-flow-id], [id^="flowPath-"]') : null;
        if (flowEl && window.DataFlows) {
          let flowId = null;
          if (flowEl.getAttribute && flowEl.getAttribute('data-flow-id')) {
            flowId = parseInt(flowEl.getAttribute('data-flow-id'), 10);
          } else if (flowEl.id && flowEl.id.startsWith('flowPath-')) {
            const m = flowEl.id.match(/flowPath-(\d+)/);
            if (m) flowId = parseInt(m[1], 10);
          }
          if (flowId !== null && !isNaN(flowId)) {
            if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
              const effL = window.LayerManager.getEffective('flow', flowId);
              if (effL && (effL.locked || !effL.visible)) {
                flowId = null;
              }
            }
          }
          if (flowId !== null && !isNaN(flowId)) {
            const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;
            if (isModifier) {
              if (window.AppCoordinator && typeof window.AppCoordinator.toggleObjectSelection === 'function') {
                window.AppCoordinator.toggleObjectSelection('flow', flowId);
              }
              this.isDragging = false;
              return;
            }

            const memberGroup = (window.AppCoordinator && !window.AppCoordinator.isInGroupEditMode())
              ? window.AppCoordinator.findGroupByMember('flow', flowId)
              : null;
            if (memberGroup) {
              window.AppCoordinator.selectGroup(memberGroup.id);
              return;
            }

            if (window.AppCoordinator && typeof window.AppCoordinator.selectObject === 'function') {
              window.AppCoordinator.selectObject('flow', flowId, { openAccordionId: 'acc-flows' });
            }
            this.isDragging = false;
            return;
          }
        }

        // 7. Blank Canvas Click in normal Select mode -> Clear Selection & Marquee selection
        this.nodeGrabOffsetX = 0;
        this.nodeGrabOffsetY = 0;
        this.isDragging = false;
        this.isMarqueeSelecting = true;
        this.marqueeAdditive = (e.shiftKey || e.ctrlKey || e.metaKey);
        this.marqueeStartPct = { x: coords.x, y: coords.y };
        this.marqueeStartClient = { x: e.clientX, y: e.clientY };
        this.marqueeBox = document.getElementById('marqueeSelectionBox');
        if (!this.marqueeAdditive && window.AppCoordinator && typeof window.AppCoordinator.clearSelection === 'function') {
          window.AppCoordinator.clearSelection({ reason: 'blank_canvas_click' });
        }
        try { this.previewBox.setPointerCapture(e.pointerId); } catch (_) {}
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

        if (this.isMarqueeSelecting) {
          const dist = Math.hypot(e.clientX - this.marqueeStartClient.x, e.clientY - this.marqueeStartClient.y);
          if (dist > 3) {
            const curCoords = this.clientToCanvasPct(e.clientX, e.clientY);
            const x1 = (Math.min(this.marqueeStartPct.x, curCoords.x) / 100) * this.canvasWidth;
            const x2 = (Math.max(this.marqueeStartPct.x, curCoords.x) / 100) * this.canvasWidth;
            const y1 = (Math.min(this.marqueeStartPct.y, curCoords.y) / 100) * this.canvasHeight;
            const y2 = (Math.max(this.marqueeStartPct.y, curCoords.y) / 100) * this.canvasHeight;
            const w = x2 - x1;
            const h = y2 - y1;
            if (this.marqueeBox) {
              this.marqueeBox.setAttribute('x', x1.toFixed(1));
              this.marqueeBox.setAttribute('y', y1.toFixed(1));
              this.marqueeBox.setAttribute('width', w.toFixed(1));
              this.marqueeBox.setAttribute('height', h.toFixed(1));
              this.marqueeBox.style.display = 'block';
            }
          }
          return;
        }

        if (!this.isDragging) return;
        if (Math.hypot(e.clientX - (this.dragStartClientX || e.clientX), e.clientY - (this.dragStartClientY || e.clientY)) > 2) {
          this.hasMovedDrag = true;
        }

        if (this.isGroupDragging && this.groupDragInitialPositions && Array.isArray(this.groupDragInitialPositions.items)) {
          const coords = this.clientToCanvasPct(e.clientX, e.clientY);
          const rawTargetX = coords.x + this.nodeGrabOffsetX;
          const rawTargetY = coords.y + this.nodeGrabOffsetY;
          const snapped = this.snapPctToGrid(rawTargetX, rawTargetY);
          const deltaX = snapped.x - this.dragInitialAnchorPct.x;
          const deltaY = snapped.y - this.dragInitialAnchorPct.y;

          this.groupDragInitialPositions.items.forEach((item) => {
            if (item.type === 'node') {
              const n = window.DiagramNodes ? window.DiagramNodes.getNode(item.id) : null;
              if (n) {
                n.x = Math.max(-50, Math.min(150, item.initX + deltaX));
                n.y = Math.max(-50, Math.min(150, item.initY + deltaY));
                const liveGroup = document.querySelector('#svgContainer [data-node-id="' + n.id + '"]');
                if (liveGroup) {
                  const cx = (n.x / 100) * this.canvasWidth;
                  const cy = (n.y / 100) * this.canvasHeight;
                  liveGroup.setAttribute('transform', 'translate(' + cx.toFixed(2) + ', ' + cy.toFixed(2) + ')');
                }
              }
            } else if (item.type === 'glow') {
              const g = window.Glows ? window.Glows.getGlow(item.id) : null;
              if (g) {
                g.x = Math.max(-50, Math.min(150, item.initX + deltaX));
                g.y = Math.max(-50, Math.min(150, item.initY + deltaY));
                const liveGlow = document.querySelector('#svgContainer [data-glow-id="' + g.id + '"]');
                if (liveGlow) {
                  const cx = (g.x / 100) * this.canvasWidth;
                  const cy = (g.y / 100) * this.canvasHeight;
                  liveGlow.setAttribute('transform', 'translate(' + cx.toFixed(2) + ', ' + cy.toFixed(2) + ')');
                }
              }
            } else if (item.type === 'ripple') {
              const rp = window.Ripples ? window.Ripples.getRipple(item.id) : null;
              if (rp) {
                rp.x = Math.max(-50, Math.min(150, item.initX + deltaX));
                rp.y = Math.max(-50, Math.min(150, item.initY + deltaY));
                const liveRipple = document.querySelector('#svgContainer [data-ripple-id="' + rp.id + '"]');
                if (liveRipple) {
                  const cx = (rp.x / 100) * this.canvasWidth;
                  const cy = (rp.y / 100) * this.canvasHeight;
                  liveRipple.setAttribute('transform', 'translate(' + cx.toFixed(2) + ', ' + cy.toFixed(2) + ')');
                }
              }
            } else if (item.type === 'image') {
              const img = window.ImageObjects ? window.ImageObjects.getImage(item.id) : null;
              if (img) {
                img.x = Math.max(-50, Math.min(150, item.initX + deltaX));
                img.y = Math.max(-50, Math.min(150, item.initY + deltaY));
                const liveImg = document.querySelector('#svgContainer [data-image-id="' + img.id + '"]');
                if (liveImg) {
                  const cx = (img.x / 100) * this.canvasWidth;
                  const cy = (img.y / 100) * this.canvasHeight;
                  const w = img.width || 200;
                  const h = img.height || 150;
                  liveImg.setAttribute('x', (cx - w / 2).toFixed(2));
                  liveImg.setAttribute('y', (cy - h / 2).toFixed(2));
                }
              }
            } else if (item.type === 'flow') {
              const f = window.DataFlows ? window.DataFlows.getFlow(item.id) : null;
              if (f && Array.isArray(f.nodes) && item.initNodes && (!f.fromNodeId || !f.toNodeId)) {
                f.nodes.forEach((pt, idx) => {
                  if (item.initNodes[idx]) {
                    pt.x = Math.round((item.initNodes[idx].x + deltaX) * 1000) / 1000;
                    pt.y = Math.round((item.initNodes[idx].y + deltaY) * 1000) / 1000;
                  }
                });
              }
            }
          });
          if (window.AppCoordinator) {
            window.AppCoordinator.updateActiveOverlays();
          }
          return;
        }

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

        if (this.isMarqueeSelecting) {
          this.isMarqueeSelecting = false;
          if (this.marqueeBox) this.marqueeBox.style.display = 'none';
          const dist = Math.hypot(e.clientX - this.marqueeStartClient.x, e.clientY - this.marqueeStartClient.y);
          if (dist > 4) {
            const curCoords = this.clientToCanvasPct(e.clientX, e.clientY);
            const minX = Math.min(this.marqueeStartPct.x, curCoords.x);
            const maxX = Math.max(this.marqueeStartPct.x, curCoords.x);
            const minY = Math.min(this.marqueeStartPct.y, curCoords.y);
            const maxY = Math.max(this.marqueeStartPct.y, curCoords.y);

            const hits = [];
            const isEligible = (type, id) => {
              if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
                const eff = window.LayerManager.getEffective(type, id);
                if (eff && (eff.locked || !eff.visible)) return false;
              }
              return true;
            };

            // 1. Nodes
            const allNodes = window.DiagramNodes ? window.DiagramNodes.getAllNodes() : [];
            allNodes.forEach((n) => {
              const eff = window.DiagramNodes.getNodeEffectiveProps(n);
              const hwPct = ((eff.width || 170) / this.canvasWidth) * 50;
              const hhPct = ((eff.height || 80) / this.canvasHeight) * 50;
              const nMinX = n.x - hwPct;
              const nMaxX = n.x + hwPct;
              const nMinY = n.y - hhPct;
              const nMaxY = n.y + hhPct;
              const intersects = !(nMaxX < minX || nMinX > maxX || nMaxY < minY || nMinY > maxY);
              if (intersects && isEligible('node', n.id)) hits.push({ type: 'node', id: n.id });
            });

            // 2. Glows
            const allGlows = window.Glows ? window.Glows.getAllGlows() : [];
            allGlows.forEach((g) => {
              let hw = Math.max(16, g.size || 25);
              let hh = hw;
              if (g.shape === 'custom' && g.customW && g.customH) {
                const scale = g.scale || 1.0;
                hw = (g.customW * scale) / 2;
                hh = (g.customH * scale) / 2;
              }
              const hwPct = (hw / this.canvasWidth) * 100;
              const hhPct = (hh / this.canvasHeight) * 100;
              const gMinX = g.x - hwPct;
              const gMaxX = g.x + hwPct;
              const gMinY = g.y - hhPct;
              const gMaxY = g.y + hhPct;
              const intersects = !(gMaxX < minX || gMinX > maxX || gMaxY < minY || gMinY > maxY);
              if (intersects && isEligible('glow', g.id)) hits.push({ type: 'glow', id: g.id });
            });

            // 3. Ripples
            const allRipples = window.Ripples ? window.Ripples.getAllRipples() : [];
            allRipples.forEach((rp) => {
              const hitR = Math.max(20, rp.outerR || 100);
              const rxPct = (hitR / this.canvasWidth) * 100;
              const ryPct = (hitR / this.canvasHeight) * 100;
              const rMinX = rp.x - rxPct;
              const rMaxX = rp.x + rxPct;
              const rMinY = rp.y - ryPct;
              const rMaxY = rp.y + ryPct;
              const intersects = !(rMaxX < minX || rMinX > maxX || rMaxY < minY || rMinY > maxY);
              if (intersects && isEligible('ripple', rp.id)) hits.push({ type: 'ripple', id: rp.id });
            });

            // 4. Images
            const allImages = window.ImageObjects ? window.ImageObjects.getAll() : [];
            allImages.forEach((img) => {
              const hwPct = ((img.width || 200) / this.canvasWidth) * 50;
              const hhPct = ((img.height || 150) / this.canvasHeight) * 50;
              const iMinX = img.x - hwPct;
              const iMaxX = img.x + hwPct;
              const iMinY = img.y - hhPct;
              const iMaxY = img.y + hhPct;
              const intersects = !(iMaxX < minX || iMinX > maxX || iMaxY < minY || iMinY > maxY);
              if (intersects && isEligible('image', img.id)) hits.push({ type: 'image', id: img.id });
            });

            // 5. Flows
            const allFlows = window.DataFlows && Array.isArray(window.DataFlows.list) ? window.DataFlows.list : [];
            allFlows.forEach((f) => {
              if (Array.isArray(f.nodes)) {
                const hasPtInBox = f.nodes.some((p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
                if (hasPtInBox && isEligible('flow', f.id)) hits.push({ type: 'flow', id: f.id });
              }
            });

            if (this.marqueeAdditive && window.AppCoordinator) {
              const existingItems = window.AppCoordinator.getSelectedItems();
              const combined = [...existingItems];
              hits.forEach((h) => {
                if (!combined.some((it) => it.type === h.type && String(it.id) === String(h.id))) {
                  combined.push(h);
                }
              });
              if (combined.length > 0) {
                window.AppCoordinator.setMultiSelection(combined, combined[0].id);
              }
            } else if (hits.length > 0 && window.AppCoordinator) {
              window.AppCoordinator.setMultiSelection(hits, hits[0].id);
            } else if (window.AppCoordinator) {
              window.AppCoordinator.clearSelection({ reason: 'marquee_empty' });
            }
          } else {
            // Simple blank click
            if (window.AppCoordinator && typeof window.AppCoordinator.clearSelection === 'function') {
              window.AppCoordinator.clearSelection({ reason: 'blank_canvas_click' });
            }
          }
          try { this.previewBox.releasePointerCapture(e.pointerId); } catch (_) {}
          return;
        }

        if (this.isGroupDragging) {
          const wasMoved = this.hasMovedDrag;
          const groupPositions = this.groupDragInitialPositions;
          const potentialType = this.potentialSingleSelectType;
          const potentialId = this.potentialSingleSelectId;
          this.isGroupDragging = false;
          this.potentialSingleSelectType = null;
          this.potentialSingleSelectId = null;
          this.groupDragInitialPositions = null;
          this.isDragging = false;
          this.nodeGrabOffsetX = 0;
          this.nodeGrabOffsetY = 0;
          try { this.previewBox.releasePointerCapture(e.pointerId); } catch (_) {}

          if (wasMoved && groupPositions && Array.isArray(groupPositions.items)) {
            // Commit moved coordinates to Go Engine / modules
            groupPositions.items.forEach((item) => {
              if (item.type === 'node') {
                const n = window.DiagramNodes ? window.DiagramNodes.getNode(item.id) : null;
                if (n && window.EngineBridge && typeof window.EngineBridge.updateNode === 'function') {
                  window.EngineBridge.updateNode(n.id, { x: n.x, y: n.y });
                }
              } else if (item.type === 'glow') {
                const g = window.Glows ? window.Glows.getGlow(item.id) : null;
                if (g && window.EngineBridge && typeof window.EngineBridge.updateGlow === 'function') {
                  window.EngineBridge.updateGlow(g.id, { x: g.x, y: g.y });
                }
              } else if (item.type === 'ripple') {
                const rp = window.Ripples ? window.Ripples.getRipple(item.id) : null;
                if (rp && window.EngineBridge && typeof window.EngineBridge.updateRipple === 'function') {
                  window.EngineBridge.updateRipple(rp.id, { x: rp.x, y: rp.y });
                }
              } else if (item.type === 'image') {
                const img = window.ImageObjects ? window.ImageObjects.getImage(item.id) : null;
                if (img && window.EngineBridge && typeof window.EngineBridge.updateImage === 'function') {
                  window.EngineBridge.updateImage(img.id, { x: img.x, y: img.y });
                }
              } else if (item.type === 'flow') {
                const f = window.DataFlows ? window.DataFlows.getFlow(item.id) : null;
                if (f && window.EngineBridge && typeof window.EngineBridge.updateFlow === 'function') {
                  window.EngineBridge.updateFlow(f.id, { nodes: f.nodes });
                }
              }
            });

            if (window.DiagramNodes && typeof window.DiagramNodes.refreshAfterChange === 'function') {
              window.DiagramNodes.refreshAfterChange();
            }
            if (window.AppCoordinator) {
              window.AppCoordinator.requestRender();
              window.AppCoordinator.recordHistoryImmediate();
              window.AppCoordinator.updateActiveOverlays();
            }
          } else if (potentialType && potentialId) {
            // Click without drag on multi-selected item -> narrow selection to single clicked item
            const accMap = { node: 'acc-nodes', glow: 'acc-glows', ripple: 'acc-ripples', flow: 'acc-flows', image: 'acc-layers' };
            if (window.AppCoordinator) {
              window.AppCoordinator.selectObject(potentialType, potentialId, { openAccordionId: accMap[potentialType] });
            }
          }
          return;
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
      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        window.AppCoordinator.showNotification('Please choose a valid image file (JPEG, PNG, WEBP).', 'error');
      } else {
        alert('Please choose a valid image file (JPEG, PNG, WEBP).');
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const img = new Image();
      img.onload = () => {
        const nw = (img.naturalWidth && img.naturalWidth > 0) ? img.naturalWidth : (img.width > 0 ? img.width : 1280);
        const nh = (img.naturalHeight && img.naturalHeight > 0) ? img.naturalHeight : (img.height > 0 ? img.height : 720);
        callback({
          filename: file.name.replace(/\.[^/.]+$/, ''),
          mime: file.type || 'image/jpeg',
          b64: dataUrl.split(',')[1],
          width: nw,
          height: nh,
          naturalWidth: nw,
          naturalHeight: nh
        });
      };
      img.onerror = () => {
        if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
          window.AppCoordinator.showNotification('Failed to decode image data.', 'error');
        } else {
          alert('Failed to decode image data.');
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }
};
