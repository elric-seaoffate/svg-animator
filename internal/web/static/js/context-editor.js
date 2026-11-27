/**
 * SVG Animator Studio — Context-Sensitive Floating Properties Editor (`context-editor.js`)
 *
 * Responsibilities:
 *   - Context-sensitive floating property inspector (#floatingContextEditor)
 *   - Object-specific inspector views for Node, Flow, Glow, Ripple, Image, and Group
 *   - Multi-selection alignment, distribution, group creation, and color tools
 *   - Draggable inspector header with viewport boundary clamping
 *   - Dispatches property mutations authoritatively to Go engine
 *   - Syncs form fields from authoritative Go scene objects
 *
 * Layer 1 (UI Presentation) — Coordinates with AppCoordinator and dispatches to Go engine.
 */

(function() {
  'use strict';

window.FloatingPropertiesEditor = {
  isOpen: false,
  activeType: null,
  activeId: null,
  _isSyncing: false,
  _customPos: null,
  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;
    this._bindControls();
    this._bindEvents();
  },

  openFor(type, id, options = {}) {
    if (!['node', 'flow', 'glow', 'ripple', 'lite', 'group', 'image'].includes(type) || id === null || id === undefined) {
      this.close();
      return;
    }
    const normalizedId = (type === 'group' || type === 'image') ? String(id) : parseInt(id, 10);
    if (type !== 'group' && type !== 'image' && isNaN(normalizedId)) {
      this.close();
      return;
    }

    const editor = document.getElementById('floatingContextEditor');
    if (!editor) return;

    this.isOpen = true;
    this.activeType = type;
    this.activeId = normalizedId;

    if (options.resetPosition) {
      this._customPos = null;
    }

    if (options.clickCoords) {
      this._clickCoords = options.clickCoords;
    } else if (options.resetPosition) {
      this._clickCoords = null;
    }

    if (options.focusWidgetSection || options.autoExpose) {
      setTimeout(() => {
        const sec = document.getElementById('fctx-widgetSection');
        if (sec) {
          sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 80);
    }

    const iconEl = document.getElementById('floatingEditorIcon');
    const badgeEl = document.getElementById('floatingEditorBadge');
    if (badgeEl) {
      badgeEl.className = 'floating-editor-badge badge-' + type;
      badgeEl.textContent = type.toUpperCase();
    }
    if (iconEl) {
      const icons = { node: '🔷', flow: '⚡', glow: '✨', ripple: '💧', lite: '⚡', group: '👥', image: '🖼️' };
      iconEl.textContent = icons[type] || '⚙️';
    }

    const sections = {
      node: document.getElementById('fctx-nodeSection'),
      flow: document.getElementById('fctx-flowSection'),
      glow: document.getElementById('fctx-glowSection'),
      ripple: document.getElementById('fctx-rippleSection'),
      lite: document.getElementById('fctx-liteSection'),
      image: document.getElementById('fctx-imageSection'),
      group: document.getElementById('fctx-groupSection')
    };
    Object.keys(sections).forEach((k) => {
      if (sections[k]) {
        sections[k].style.display = (k === type ? 'block' : 'none');
      }
    });

    editor.style.display = 'flex';

    this._syncMultiBar();
    this.syncFromActiveObject();
    this.updatePosition(options.resetPosition);
  },

  _syncMultiBar() {
    const multiBar = document.getElementById('fctx-multiBar');
    if (!multiBar) return;
    const isGroup = window.AppCoordinator && window.AppCoordinator.activeSelection && window.AppCoordinator.activeSelection.type === 'group';
    const btnGroupMulti = document.getElementById('fctx-btnGroupMulti');
    const items = (window.AppCoordinator && typeof window.AppCoordinator.getSelectedItems === 'function')
      ? window.AppCoordinator.getSelectedItems()
      : [];

    if (isGroup) {
      multiBar.style.display = 'flex';
      const textEl = document.getElementById('fctx-multiBarText');
      const countEl = document.getElementById('fctx-multiCount');
      const grp = window.AppCoordinator.getGroup(window.AppCoordinator.activeSelection.id);
      const name = (grp && grp.name) ? grp.name : window.AppCoordinator.activeSelection.id;
      const label = `Group: ${name} (${items.length} members)`;
      if (textEl) textEl.textContent = label;
      if (countEl) countEl.textContent = label;
      if (btnGroupMulti) {
        btnGroupMulti.textContent = '🔓 Ungroup';
        btnGroupMulti.title = 'Ungroup this group (Ctrl+Shift+G)';
      }
    } else if (items.length >= 2) {
      multiBar.style.display = 'flex';
      const textEl = document.getElementById('fctx-multiBarText');
      const countEl = document.getElementById('fctx-multiCount');
      const allNodes = items.every((it) => (it.type || '').toLowerCase() === 'node');
      const label = `${items.length} ${allNodes ? 'Shapes' : 'Objects'} Selected`;
      if (textEl) textEl.textContent = label;
      if (countEl) countEl.textContent = label;
      if (btnGroupMulti) {
        btnGroupMulti.textContent = '👥 Group';
        btnGroupMulti.title = 'Group selected objects (Ctrl+G)';
      }
    } else {
      multiBar.style.display = 'none';
    }
    if (window.AppCoordinator) {
      if (typeof window.AppCoordinator.bindMultiStaggerControls === 'function') {
        window.AppCoordinator.bindMultiStaggerControls(multiBar);
      }
      if (typeof window.AppCoordinator.syncMultiStaggerUI === 'function') {
        window.AppCoordinator.syncMultiStaggerUI(multiBar);
      }
    }
  },

  close(clearSelection = true) {
    if (!this.isOpen && (!document.getElementById('floatingContextEditor') || document.getElementById('floatingContextEditor').style.display === 'none')) {
      return;
    }
    this.isOpen = false;
    this.activeType = null;
    this.activeId = null;
    this._customPos = null;
    this._clickCoords = null;

    const editor = document.getElementById('floatingContextEditor');
    if (editor) {
      editor.style.display = 'none';
    }

    if (clearSelection !== false && window.AppCoordinator && typeof window.AppCoordinator.clearSelection === 'function') {
      window.AppCoordinator.clearSelection({ reason: 'floating_editor_closed' });
    }
  },

  toggle(type, id) {
    if (this.isOpen && this.activeType === type && this.activeId === (type === 'group' ? String(id) : parseInt(id, 10))) {
      this.close();
    } else {
      this.openFor(type, id);
    }
  },

  handleSelectionChanged(sel) {
    if (!sel || !sel.type || sel.id === null || !['node', 'flow', 'glow', 'ripple', 'lite', 'group', 'image'].includes(sel.type)) {
      if (this.isOpen) this.close(false);
      return;
    }

    if (this.isOpen) {
      this.openFor(sel.type, sel.id, { resetPosition: false });
    }
  },

  handleRenderCompleted() {
    if (this.isOpen) {
      this.syncFromActiveObject();
    }
  },

  getTargetScreenRect(type, id) {
    if (!type || id === null) return null;
    let el = null;
    if (type === 'node') {
      const nodeEl = document.querySelector ? document.querySelector('#svgContainer [data-node-id="' + id + '"]') : null;
      if (nodeEl) {
        // Query the underlying SVG geometry element to obtain the true shape boundary
        // without drop-shadow blur margins
        const shapeEl = nodeEl.querySelector ? nodeEl.querySelector('rect, polygon, path, circle, ellipse') : null;
        el = shapeEl || nodeEl;
      }
      if (!el) {
        const selBox = document.getElementById('nodeSelectionBox');
        if (selBox && selBox.style && selBox.style.display !== 'none') el = selBox;
      }
    } else if (type === 'image') {
      el = (document.querySelector ? document.querySelector('#svgContainer [data-image-id="' + id + '"]') : null) ||
           document.getElementById('nodeSelectionBox');
    } else if (type === 'flow') {
      el = (document.querySelector ? document.querySelector('#svgContainer [data-flow-id="' + id + '"]') : null) ||
           (document.querySelector ? document.querySelector('#svgContainer #flowPath-' + id) : null) ||
           document.getElementById('flowCurvePath') ||
           (document.querySelector ? document.querySelector('#dynamicFlowReticles [data-flow-node-idx]') : null);
    } else if (type === 'glow') {
      el = (document.querySelector ? document.querySelector('#svgContainer [data-glow-id="' + id + '"] .glow-hit-target') : null) ||
           (document.querySelector ? document.querySelector('#svgContainer [data-glow-id="' + id + '"]') : null) ||
           document.getElementById('glowReticleTarget');
    } else if (type === 'ripple') {
      el = (document.querySelector ? document.querySelector('#svgContainer [data-ripple-id="' + id + '"] .ripple-hit-target') : null) ||
           (document.querySelector ? document.querySelector('#svgContainer [data-ripple-id="' + id + '"]') : null) ||
           document.getElementById('rippleReticleTarget');
    } else if (type === 'lite') {
      el = (document.querySelector ? document.querySelector('#svgContainer [data-lite-id="' + id + '"] .lite-hit-target') : null) ||
           (document.querySelector ? document.querySelector('#svgContainer [data-lite-id="' + id + '"]') : null);
    } else if (type === 'group') {
      const box = document.getElementById('groupSelectionBox');
      if (box && box.style && box.style.display !== 'none') el = box;
    }

    if (el && typeof el.getBoundingClientRect === 'function') {
      const rect = el.getBoundingClientRect();
      if (rect && (rect.width > 0 || rect.height > 0)) return rect;
    }

    const stageMain = document.getElementById('stageMain') || (document.querySelector ? document.querySelector('.stage') : null);
    if (stageMain && typeof stageMain.getBoundingClientRect === 'function') {
      const sRect = stageMain.getBoundingClientRect();
      if (sRect) {
        return {
          left: sRect.left + (sRect.width || 800) * 0.4,
          right: sRect.left + (sRect.width || 800) * 0.6,
          top: sRect.top + (sRect.height || 600) * 0.35,
          bottom: sRect.top + (sRect.height || 600) * 0.55,
          width: (sRect.width || 800) * 0.2,
          height: (sRect.height || 600) * 0.2
        };
      }
    }
    return null;
  },

  updatePosition(forceReset = false) {
    const editor = document.getElementById('floatingContextEditor');
    if (!editor || !this.isOpen) return;

    const winW = (typeof window !== 'undefined' && window.innerWidth) || 1280;
    const winH = (typeof window !== 'undefined' && window.innerHeight) || 720;

    if (winW < 768) {
      editor.style.left = '';
      editor.style.top = '';
      editor.style.right = '';
      editor.style.bottom = '';
      return;
    }

    const stageMain = document.getElementById('stageMain') || (document.querySelector ? document.querySelector('.stage') : null);
    const stageRect = (stageMain && typeof stageMain.getBoundingClientRect === 'function')
      ? stageMain.getBoundingClientRect()
      : { left: 0, top: 0, right: winW, bottom: winH, width: winW, height: winH };

    const editorW = editor.offsetWidth || 380;
    const editorH = editor.offsetHeight || 360;

    if (this._customPos && !forceReset) {
      let left = Math.max(stageRect.left + 8, Math.min(stageRect.right - editorW - 8, this._customPos.left));
      let top = Math.max(stageRect.top + 8, Math.min(stageRect.bottom - editorH - 8, this._customPos.top));
      editor.style.left = `${Math.round(left)}px`;
      editor.style.top = `${Math.round(top)}px`;
      editor.style.right = 'auto';
      editor.style.bottom = 'auto';
      return;
    }

    let left, top;

    if (this._clickCoords && typeof this._clickCoords.clientX === 'number') {
      left = this._clickCoords.clientX + 14;
      top = this._clickCoords.clientY + 10;

      if (left + editorW > stageRect.right - 10) {
        const leftCandidate = this._clickCoords.clientX - editorW - 14;
        if (leftCandidate >= stageRect.left + 10) {
          left = leftCandidate;
        } else {
          left = stageRect.right - editorW - 16;
        }
      }

      if (top + editorH > stageRect.bottom - 10) {
        top = Math.max(stageRect.top + 10, stageRect.bottom - editorH - 10);
      }
      if (top < stageRect.top + 10) {
        top = stageRect.top + 10;
      }
    } else {
      const targetRect = this.getTargetScreenRect(this.activeType, this.activeId);
      if (targetRect) {
        left = targetRect.right + 14;
        top = targetRect.top;

        if (left + editorW > stageRect.right - 10) {
          const leftCandidate = targetRect.left - editorW - 14;
          if (leftCandidate >= stageRect.left + 10) {
            left = leftCandidate;
          } else {
            left = stageRect.right - editorW - 16;
          }
        }

        if (top + editorH > stageRect.bottom - 10) {
          top = Math.max(stageRect.top + 10, stageRect.bottom - editorH - 10);
        }
        if (top < stageRect.top + 10) {
          top = stageRect.top + 10;
        }
      } else {
        left = Math.max(stageRect.left + 16, stageRect.right - editorW - 24);
        top = stageRect.top + 24;
      }
    }

    left = Math.max(stageRect.left + 8, Math.min(stageRect.right - editorW - 8, left));
    top = Math.max(stageRect.top + 8, Math.min(stageRect.bottom - editorH - 8, top));

    editor.style.left = `${Math.round(left)}px`;
    editor.style.top = `${Math.round(top)}px`;
    editor.style.right = 'auto';
    editor.style.bottom = 'auto';
  },

  syncSelection() {
    this.syncFromActiveObject();
  },

  syncFromActiveObject() {
    if (!this.isOpen || this._isSyncing) return;
    this._syncMultiBar();
    this._isSyncing = true;
    try {
      const titleEl = document.getElementById('floatingEditorTitle');

      if (this.activeType === 'node') {
        const node = window.DiagramNodes ? window.DiagramNodes.getNode(this.activeId) : null;
        if (!node) {
          this.close();
          return;
        }
        if (titleEl) {
          titleEl.textContent = 'Node #' + node.id + (node.name ? ' (' + node.name + ')' : (node.text ? ': ' + node.text : ''));
        }
        this._setVal('fctx-nodeNameInput', node.name || '');
        this._setVal('fctx-nodeShapeSelect', node.shape || 'rounded');
        this._setVal('fctx-nodeTextInput', node.text || '');
        this._setVal('fctx-nodeSubtextInput', node.subtext || '');
        this._setPair('fctx-nodeWidth', node.width);
        this._setPair('fctx-nodeHeight', node.height);
        this._setVal('fctx-nodeFillColorPicker', node.fillColor || '#161b22');
        this._setVal('fctx-nodeStrokeColorPicker', node.strokeColor || '#58a6ff');
        this._setVal('fctx-nodeTextColorPicker', node.textColor || '#e6edf3');
        this._setPair('fctx-nodeFillOpacity', node.fillOpacity !== undefined ? node.fillOpacity : 0.92);
        this._setPair('fctx-nodeStrokeWidth', node.strokeWidth !== undefined ? node.strokeWidth : 2);
        this._setVal('fctx-nodeStrokeStyleSelect', node.strokeStyle || 'solid');
        this._setPair('fctx-nodeFontSize', node.fontSize || 15);
        const animVal = node.anim || node.animation || 'none';
        this._setVal('fctx-nodeAnimSelect', animVal);
        const timingGrp = document.getElementById('fctx-nodeAnimTimingGroup');
        if (timingGrp) {
          timingGrp.style.display = animVal !== 'none' ? 'block' : 'none';
        }
        this._setChk('fctx-nodePlayChk', node.play !== false);
        const defDur = (window.DiagramNodes && typeof window.DiagramNodes.getDefaultAnimDuration === 'function')
          ? window.DiagramNodes.getDefaultAnimDuration(animVal)
          : (animVal === 'pulse-border' ? 2.6 : (animVal === 'float' ? 3.2 : 1.2));
        const effDur = (node.animDur !== undefined && node.animDur !== null && Number(node.animDur) > 0)
          ? Number(node.animDur)
          : defDur;
        this._setPair('fctx-nodeAnimDur', effDur);
        const effDelay = (node.animDelay !== undefined && node.animDelay !== null && Number(node.animDelay) >= 0)
          ? Number(node.animDelay)
          : 0;
        this._setPair('fctx-nodeAnimDelay', effDelay);
      } else if (this.activeType === 'flow') {
        const flow = window.DataFlows ? window.DataFlows.getFlow(this.activeId) : null;
        if (!flow) {
          this.close();
          return;
        }
        if (titleEl) {
          titleEl.textContent = 'Flow #' + flow.id + (flow.name ? ' (' + flow.name + ')' : (flow.label ? ': ' + flow.label : ''));
        }
        this._setVal('fctx-flowNameInput', flow.name || '');
        const nodeSlider = document.getElementById('fctx-flowNodeSlider');
        const nodeNum = document.getElementById('fctx-flowNodeNum');
        if (nodeSlider && flow.nodes) {
          nodeSlider.max = Math.max(1, flow.nodes.length - 1);
          nodeSlider.value = window.DataFlows.activeNodeIdx || 0;
          if (nodeNum) nodeNum.value = nodeSlider.value;
        }
        this._setVal('fctx-flowRouteSelect', flow.route || 'curve');
        this._setVal('fctx-flowLineStyleSelect', flow.lineStyle || 'dashed');
        this._setVal('fctx-flowArrowSelect', flow.arrow || 'none');
        this._setPair('fctx-flowLineWidth', flow.lineWidth !== undefined ? flow.lineWidth : 2.5);
        this._setPair('fctx-flowCurvature', flow.curvature !== undefined ? flow.curvature : 0);
        this._setVal('fctx-flowLabelInput', flow.label || '');
        this._setVal('fctx-flowTypeSelect', flow.type || 'orb');
        this._setChk('fctx-flowShowLine', flow.showLine !== false);
        this._setVal('fctx-flowColorPicker', flow.color || '#00ffcc');
        this._setPair('fctx-flowOpacity', flow.opacity !== undefined ? flow.opacity : 1.0);
        this._setPair('fctx-flowGlow', flow.glow !== undefined ? flow.glow : 0);
        this._setPair('fctx-flowScale', flow.scale !== undefined ? flow.scale : 1.0);
        this._setChk('fctx-flowPlayChk', flow.play !== false);
        this._setVal('fctx-flowPlaybackModeSelect', flow.playbackMode === 'once' ? 'once' : 'loop');
        this._setPair('fctx-flowSpeed', flow.speed !== undefined ? flow.speed : 2.0);
        this._setPair('fctx-flowDelay', flow.delay !== undefined ? flow.delay : 0.0);
        this._setPair('fctx-flowEndDelay', flow.endDelay !== undefined ? flow.endDelay : 0.0);
        this._setChk('fctx-flowHideOnDelay', flow.hideOnDelay !== false);
      } else if (this.activeType === 'glow') {
        const glow = window.Glows ? window.Glows.getGlow(this.activeId) : null;
        if (!glow) {
          this.close();
          return;
        }
        if (titleEl) {
          titleEl.textContent = 'Glow #' + glow.id + (glow.name ? ' (' + glow.name + ')' : '');
        }
        this._setVal('fctx-glowNameInput', glow.name || '');
        this._setVal('fctx-glowShapeSelect', glow.shape || 'circle');
        this._setChk('fctx-glowPlayChk', glow.play !== false);
        this._setVal('fctx-glowPlaybackSelect', glow.playback || 'pingpong');
        this._setVal('fctx-glowColorPicker', glow.color || '#ff0044');
        this._setPair('fctx-glowOpacity', glow.opacity !== undefined ? glow.opacity : 1.0);
        this._setPair('fctx-glowBlur', glow.blur !== undefined ? glow.blur : 50);
        this._setPair('fctx-glowSize', glow.size !== undefined ? glow.size : 25);
        this._setPair('fctx-glowRings', glow.rings !== undefined ? glow.rings : 1);
        this._setPair('fctx-glowCoreR', glow.coreR !== undefined ? glow.coreR : 5);
        this._setPair('fctx-glowThick', glow.thick !== undefined ? glow.thick : 2);
        this._setPair('fctx-glowDur', glow.dur !== undefined ? glow.dur : 2.0);
        this._setPair('fctx-glowDelay', glow.delay !== undefined ? glow.delay : 0.0);
        this._setPair('fctx-glowEndDelay', glow.endDelay !== undefined ? glow.endDelay : 0.0);
        this._setChk('fctx-glowHideOnDelay', glow.hideOnDelay !== false);

        const isRadar = glow.shape === 'radar';
        ['fctx-glowRadarRow1', 'fctx-glowRadarRow2', 'fctx-glowRadarRow3'].forEach((rId) => {
          const rEl = document.getElementById(rId);
          if (rEl) rEl.style.display = isRadar ? 'flex' : 'none';
        });
      } else if (this.activeType === 'ripple') {
        const ripple = window.Ripples ? window.Ripples.getRipple(this.activeId) : null;
        if (!ripple) {
          this.close();
          return;
        }
        if (titleEl) {
          titleEl.textContent = 'Ripple #' + ripple.id + (ripple.name ? ' (' + ripple.name + ')' : '');
        }
        this._setVal('fctx-rippleNameInput', ripple.name || '');
        this._setVal('fctx-rippleColorPicker', ripple.color || '#ffffff');
        this._setPair('fctx-rippleOpacity', ripple.opacity !== undefined ? ripple.opacity : 0.4);
        this._setPair('fctx-rippleRefraction', ripple.refraction !== undefined ? ripple.refraction : 35);
        this._setChk('fctx-ripplePlayChk', ripple.play !== false);
        this._setPair('fctx-rippleDur', ripple.dur !== undefined ? ripple.dur : 3.0);
        this._setPair('fctx-rippleInnerR', ripple.innerR !== undefined ? ripple.innerR : 0);
        this._setPair('fctx-rippleOuterR', ripple.outerR !== undefined ? ripple.outerR : 150);
        this._setPair('fctx-rippleRings', ripple.rings !== undefined ? ripple.rings : 3);
        this._setPair('fctx-rippleThick', ripple.thick !== undefined ? ripple.thick : 8);
        this._setPair('fctx-rippleDelay', ripple.delay !== undefined ? ripple.delay : 0.0);
        this._setPair('fctx-rippleEndDelay', ripple.endDelay !== undefined ? ripple.endDelay : 1.0);
      } else if (this.activeType === 'lite') {
        const le = window.LiteEffects ? window.LiteEffects.getLiteEffect(this.activeId) : null;
        if (!le) {
          this.close();
          return;
        }
        if (titleEl) {
          titleEl.textContent = 'Lite #' + le.id + (le.name ? ' (' + le.name + ')' : ' (' + le.kind + ')');
        }
        const variantSel = document.getElementById('fctx-liteVariantSelect');
        if (variantSel) {
          const optsByKind = {
            'perimeter-tracer': ['rounded', 'rect', 'circle', 'ellipse'],
            'pulse': ['circle', 'square', 'diamond', 'cross', 'ring'],
            'flash': ['diamond', 'circle', 'square', 'cross', 'star'],
            'flow-lite': ['dashed', 'dotted', 'single'],
            'radar-lite': ['multi', 'single', 'fading-ping'],
            'gauge-lite': ['ring', 'hbar', 'vbar', 'segmented', 'level'],
            'oscilloscope-lite': ['ecg', 'sine', 'square', 'triangle', 'sawtooth', 'polyline', 'bezier'],
            'text-lite': ['rounded', 'rect', 'pill', 'none', 'curved']
          };
          const labelsByOpt = {
            'multi': 'Multiple Pings (multi)',
            'single': 'Single Ping (single)',
            'fading-ping': 'Fading Ping (fading-ping)',
            'ring': 'Circular / Ring Gauge (ring)',
            'hbar': 'Horizontal Bar Gauge (hbar)',
            'vbar': 'Vertical Bar Gauge (vbar)',
            'segmented': 'Segmented Bar Gauge (segmented)',
            'level': 'Filled-Level Indicator (level)',
            'ecg': 'ECG / Heartbeat (ecg)',
            'sine': 'Sine Wave (sine)',
            'square': 'Square Wave (square)',
            'triangle': 'Triangle Wave (triangle)',
            'sawtooth': 'Sawtooth Wave (sawtooth)',
            'polyline': 'Angular Polyline (polyline)',
            'bezier': 'Bézier-Smoothed Curve (bezier)',
            'rounded': 'Rounded Box (rounded)',
            'rect': 'Rectangle Box (rect)',
            'pill': 'Pill / Capsule (pill)',
            'none': 'Floating Text / No Box (none)',
            'curved': 'Curved Text on Arc (curved)'
          };
          const opts = optsByKind[le.kind] || ['circle'];
          variantSel.innerHTML = opts.map((o) => `<option value="${o}">${(['radar-lite', 'gauge-lite', 'oscilloscope-lite', 'text-lite'].includes(le.kind)) && labelsByOpt[o] ? labelsByOpt[o] : o}</option>`).join('');
        }
        const durMs = Math.round((Number(le.dur) || 0.10) * 1000);
        this._setVal('fctx-liteNameInput', le.name || '');
        this._setVal('fctx-liteVariantSelect', le.variant || '');
        this._setVal('fctx-liteColorPicker', le.color || '#38bdf8');
        this._setPair('fctx-liteOpacity', le.opacity !== undefined ? le.opacity : 0.9);
        this._setChk('fctx-litePlayChk', le.play !== false);
        this._setPair('fctx-liteDelay', le.delay || 0);
        const fctxStartDelayRow = document.getElementById('fctx-liteStartDelayRow');
        if (fctxStartDelayRow) {
          const showSharedDelay = ['perimeter-tracer', 'pulse', 'flash', 'radar-lite'].includes(le.kind) ||
            (le.kind === 'text-lite' && Boolean(le.textAnim) && le.textAnim !== 'none');
          fctxStartDelayRow.style.display = showSharedDelay ? '' : 'none';
        }
        this._setPair('fctx-liteWidth', Math.round(Number(le.width) || (le.kind === 'perimeter-tracer' ? 140 : (le.kind === 'text-lite' ? 220 : 56))));
        this._setPair('fctx-liteHeight', Math.round(Number(le.height) || (le.kind === 'perimeter-tracer' ? 80 : 56)));
        this._setPair('fctx-liteRotation', Math.round(Number(le.rotation) || 0));
        this._setPair('fctx-liteArmThickness', le.armThickness !== undefined ? le.armThickness : 3);
        this._setChk('fctx-liteLockAspectChk', le.kind === 'perimeter-tracer' && le.variant === 'circle' ? true : Boolean(le.maintainAspectRatio));
        this._setChk('fctx-liteShowGuideChk', le.showGuide !== false);
        this._setPair('fctx-liteCornerRadius', Math.round(Number(le.cornerRadius != null ? le.cornerRadius : 10)));
        this._setPair('fctx-liteStrokeWidth', le.strokeWidth !== undefined ? le.strokeWidth : 2.5);
        this._setPair('fctx-liteSegments', le.segments !== undefined ? le.segments : 2);
        const fctxRatio = le.lineGapRatio || '1:3';
        const knownRatios = ['1:1', '1:2', '1:3', '1:4', '1:5', '1:6', '2:1', '2:3', '3:1', '3:2'];
        const isKnown = knownRatios.includes(fctxRatio);
        this._setVal('fctx-liteRatioPresetSelect', isKnown ? fctxRatio : 'custom');
        this._setVal('fctx-liteRatioInput', fctxRatio);
        const fctxCustomRow = document.getElementById('fctx-liteRatioCustomRow');
        if (fctxCustomRow) fctxCustomRow.style.display = isKnown ? 'none' : '';
        this._setVal('fctx-liteDirectionSelect', le.direction || 'cw');
        this._setVal('fctx-litePlaybackModeSelect', le.playbackMode || 'loop');
        this._setPair('fctx-liteSpeed', le.speed !== undefined ? le.speed : 3.0);
        this._setVal('fctx-liteBurstCyclesNum', Math.round(Number(le.burstCycles) || 0));
        this._setVal('fctx-litePauseSecondsNum', Number(le.pauseSeconds) || 0);
        this._setVal('fctx-litePauseVisibilitySelect', le.pauseVisibility || 'hide');
        this._setPair('fctx-liteMinScale', le.minScale !== undefined ? le.minScale : 0.85);
        this._setPair('fctx-liteMaxScale', le.maxScale !== undefined ? le.maxScale : 1.15);
        this._setPair('fctx-litePeriod', le.period !== undefined ? le.period : 1.8);
        this._setPair('fctx-liteFlashDur', durMs);
        this._setChk('fctx-liteRepeatChk', le.repeat);
        this._setPair('fctx-liteFlashRepeatInterval', le.repeatInterval !== undefined ? le.repeatInterval : 2.0);

        const dimGrp = document.getElementById('fctx-liteDimensionsGroup');
        const tg = document.getElementById('fctx-liteTracerGroup');
        const crRow = document.getElementById('fctx-liteCornerRadiusRow');
        const armRow = document.getElementById('fctx-liteArmThicknessRow');
        const pg = document.getElementById('fctx-litePulseGroup');
        const fg = document.getElementById('fctx-liteFlashGroup');
        const flg = document.getElementById('fctx-liteFlowGroup');
        const rdg = document.getElementById('fctx-liteRadarGroup');
        const gg = document.getElementById('fctx-liteGaugeGroup');
        const og = document.getElementById('fctx-liteOscGroup');
        const txGrp = document.getElementById('fctx-liteTextGroup');
        const trigBtn = document.getElementById('fctx-btnTriggerLiteFlash');
        if (dimGrp) dimGrp.style.display = le.kind === 'flow-lite' ? 'none' : '';
        if (tg) tg.style.display = le.kind === 'perimeter-tracer' ? 'block' : 'none';
        if (crRow) crRow.style.display = ((le.kind === 'perimeter-tracer' && le.variant === 'rounded') || (le.kind === 'gauge-lite' && ['hbar', 'vbar', 'level'].includes(le.variant)) || le.kind === 'oscilloscope-lite' || (le.kind === 'text-lite' && le.variant === 'rounded')) ? '' : 'none';
        if (armRow) armRow.style.display = ((le.kind === 'pulse' || le.kind === 'flash') && (le.variant === 'cross' || le.variant === 'star')) ? '' : 'none';
        if (pg) pg.style.display = le.kind === 'pulse' ? 'block' : 'none';
        if (fg) fg.style.display = le.kind === 'flash' ? 'block' : 'none';
        if (flg) flg.style.display = le.kind === 'flow-lite' ? 'block' : 'none';
        if (rdg) rdg.style.display = le.kind === 'radar-lite' ? 'block' : 'none';
        if (gg) gg.style.display = le.kind === 'gauge-lite' ? 'block' : 'none';
        if (og) og.style.display = le.kind === 'oscilloscope-lite' ? 'block' : 'none';
        if (txGrp) txGrp.style.display = le.kind === 'text-lite' ? 'block' : 'none';
        if (trigBtn) trigBtn.style.display = le.kind === 'flash' ? 'inline-block' : 'none';

        if (le.kind === 'text-lite') {
          const isCurved = le.variant === 'curved';
          const isBoxed = le.variant === 'rect' || le.variant === 'rounded' || le.variant === 'pill';
          const anim = le.textAnim || 'none';
          this._setVal('fctx-liteTextContentInput', le.labelText !== undefined ? le.labelText : 'System Ready');
          this._setVal('fctx-liteTextFontSelect', le.fontFamily || 'modern-sans');
          this._setPair('fctx-liteTextFontSize', le.fontSize || 18);
          this._setVal('fctx-liteTextFontWeightSelect', le.fontWeight || '600');
          this._setPair('fctx-liteTextLetterSpacing', le.letterSpacing !== undefined ? le.letterSpacing : 0);
          this._setVal('fctx-liteTextAlignSelect', le.textAlign || 'center');
          this._setVal('fctx-liteTextVerticalAlignSelect', le.verticalAlign || 'middle');
          this._setPair('fctx-liteTextPadding', le.padding !== undefined ? le.padding : 12);
          this._setVal('fctx-liteTextBgColorPicker', le.bgColor || '#0f172a');
          this._setPair('fctx-liteTextBgOpacity', le.bgOpacity !== undefined ? le.bgOpacity : (isBoxed ? 0.85 : 0));
          this._setVal('fctx-liteTextBorderColorPicker', le.borderColor || '#38bdf8');
          this._setPair('fctx-liteTextStrokeWidth', le.strokeWidth !== undefined ? le.strokeWidth : (isBoxed ? 1.5 : 0));
          this._setPair('fctx-liteTextCurvature', le.curvature !== undefined ? le.curvature : 35);
          this._setPair('fctx-liteTextStartOffset', le.startOffset !== undefined ? le.startOffset : 50);
          this._setChk('fctx-liteTextShowGuideChk', Boolean(le.showGuide));

          const animSel = document.getElementById('fctx-liteTextAnimSelect');
          if (animSel) {
            Array.from(animSel.options).forEach((opt) => {
              opt.disabled = isCurved && ['ticker-h', 'ticker-v', 'stacked-v', 'slide', 'scramble'].includes(opt.value);
            });
          }
          const normAnim = anim === 'overtype' ? 'typewriter' : anim;
          this._setVal('fctx-liteTextAnimSelect', normAnim);
          this._setVal('fctx-liteTextPlaybackModeSelect', ['loop', 'once', 'pingpong'].includes(le.playbackMode) ? le.playbackMode : 'loop');
          this._setPair('fctx-liteTextScrollSpeed', le.scrollSpeed || 90);
          this._setPair('fctx-liteTextLinesPerSec', le.linesPerSec || 1.2);
          this._setPair('fctx-liteTextLineSpacing', le.lineSpacing || 1.25);
          this._setChk('fctx-liteTextWordWrapChk', le.wordWrap !== false);
          this._setVal('fctx-liteTextDirectionSelect', (le.direction === 'reverse' || le.direction === 'ccw') ? 'reverse' : 'forward');
          this._setPair('fctx-liteTextTypeSpeed', le.typeSpeed || 14);
          const normTypeMode = le.typeMode === 'loop' ? 'delete' : (le.typeMode || 'hold');
          this._setVal('fctx-liteTextTypeModeSelect', normTypeMode);
          const normRepeat = le.typeMode === 'loop' ? true : (le.typeRepeat !== undefined ? Boolean(le.typeRepeat) : (normTypeMode === 'delete' || normTypeMode === 'delete-forward'));
          this._setChk('fctx-liteTextTypeRepeatChk', normRepeat);
          this._setPair('fctx-liteTextCycleSpeed', le.speed !== undefined ? le.speed : (normAnim === 'flash' ? 0.15 : 0.8));
          this._setPair('fctx-liteTextHoldDelay', le.holdDelay !== undefined ? le.holdDelay : 1.5);
          this._setChk('fctx-liteTextLockOnOffChk', Boolean(le.lockOnOff));
          this._setPair('fctx-liteTextClearDuration', le.lockOnOff && normAnim === 'flash' ? (le.holdDelay !== undefined ? le.holdDelay : 1.5) : (le.clearDuration !== undefined ? le.clearDuration : 0.6));

          const vAlignRow = document.getElementById('fctx-liteTextVerticalAlignRow');
          const boxStyleGroup = document.getElementById('fctx-liteTextBoxStyleGroup');
          const curvedGroup = document.getElementById('fctx-liteTextCurvedGroup');
          const playbackRow = document.getElementById('fctx-liteTextPlaybackModeRow');
          const scrollSpdRow = document.getElementById('fctx-liteTextScrollSpeedRow');
          const lpsRow = document.getElementById('fctx-liteTextLinesPerSecRow');
          const lsRow = document.getElementById('fctx-liteTextLineSpacingRow');
          const wwRow = document.getElementById('fctx-liteTextWordWrapRow');
          const dirRow = document.getElementById('fctx-liteTextDirectionRow');
          const typeSpdRow = document.getElementById('fctx-liteTextTypeSpeedRow');
          const typeSpdLbl = document.getElementById('fctx-liteTextTypeSpeedLabel');
          const typeModeRow = document.getElementById('fctx-liteTextTypeModeRow');
          const typeRepRow = document.getElementById('fctx-liteTextTypeRepeatRow');
          const cycleSpdRow = document.getElementById('fctx-liteTextCycleSpeedRow');
          const cycleSpdLbl = document.getElementById('fctx-liteTextCycleSpeedLabel');
          const holdRow = document.getElementById('fctx-liteTextHoldDelayRow');
          const holdLbl = document.getElementById('fctx-liteTextHoldDelayLabel');
          const lockRow = document.getElementById('fctx-liteTextLockOnOffRow');
          const clearRow = document.getElementById('fctx-liteTextClearDurationRow');
          const clearLbl = document.getElementById('fctx-liteTextClearDurationLabel');

          if (vAlignRow) vAlignRow.style.display = isCurved ? 'none' : '';
          if (boxStyleGroup) boxStyleGroup.style.display = isBoxed ? '' : 'none';
          if (curvedGroup) curvedGroup.style.display = isCurved ? '' : 'none';
          if (playbackRow) playbackRow.style.display = (normAnim !== 'none' && normAnim !== 'typewriter') ? '' : 'none';
          if (scrollSpdRow) scrollSpdRow.style.display = normAnim === 'ticker-h' ? '' : 'none';
          if (lpsRow) lpsRow.style.display = normAnim === 'ticker-v' ? '' : 'none';
          if (lsRow) lsRow.style.display = (normAnim === 'none' || normAnim === 'ticker-v' || normAnim === 'stacked-v') ? '' : 'none';
          if (wwRow) wwRow.style.display = normAnim === 'ticker-v' ? '' : 'none';
          if (dirRow) dirRow.style.display = (['ticker-h', 'ticker-v', 'stacked-v', 'slide'].includes(normAnim)) ? '' : 'none';
          if (typeSpdRow) typeSpdRow.style.display = (['typewriter', 'scramble', 'stacked-v'].includes(normAnim)) ? '' : 'none';
          if (typeSpdLbl) typeSpdLbl.textContent = normAnim === 'stacked-v' ? 'Scroll (ch/s)' : 'Rate (ch/s)';
          if (typeModeRow) typeModeRow.style.display = normAnim === 'typewriter' ? '' : 'none';
          if (typeRepRow) typeRepRow.style.display = normAnim === 'typewriter' ? '' : 'none';
          if (cycleSpdRow) cycleSpdRow.style.display = (['fade', 'flash', 'slide', 'blur-in', 'blur-out'].includes(normAnim)) ? '' : 'none';
          if (cycleSpdLbl) {
            cycleSpdLbl.textContent = normAnim === 'fade' ? 'Fade Dur (s)' : (normAnim === 'flash' ? 'Fade-In (s)' : 'Trans Dur (s)');
          }
          if (holdRow) holdRow.style.display = (['typewriter', 'fade', 'flash', 'slide', 'blur-in', 'blur-out', 'scramble'].includes(normAnim)) ? '' : 'none';
          if (holdLbl) {
            holdLbl.textContent = normAnim === 'fade' ? 'Vis Hold (s)' : (normAnim === 'flash' ? 'On Hold (s)' : 'Hold (s)');
          }
          if (lockRow) lockRow.style.display = normAnim === 'flash' ? '' : 'none';
          if (clearRow) clearRow.style.display = (normAnim === 'fade' || normAnim === 'flash') ? '' : 'none';
          if (clearLbl) {
            clearLbl.textContent = normAnim === 'flash' ? 'Off Dur (s)' : 'Clear Dur (s)';
          }
        }

        if (le.kind === 'gauge-lite') {
          const minV = le.minValue !== undefined ? le.minValue : 0;
          const maxV = le.maxValue !== undefined ? le.maxValue : 100;
          const valSlider = document.getElementById('fctx-liteGaugeValueSlider');
          if (valSlider) {
            valSlider.min = String(minV);
            valSlider.max = String(maxV);
            valSlider.step = String(Math.max(0.01, Math.round(((maxV - minV) / 200) * 100) / 100));
          }
          this._setPair('fctx-liteGaugeValue', le.value !== undefined ? le.value : 65);
          this._setVal('fctx-liteGaugeMinNum', minV);
          this._setVal('fctx-liteGaugeMaxNum', maxV);
          this._setVal('fctx-liteGaugeBgColorPicker', le.bgColor || '#1e293b');
          this._setVal('fctx-liteGaugeDirectionSelect', (le.direction === 'reverse' || le.direction === 'ccw') ? 'reverse' : 'forward');
          this._setPair('fctx-liteGaugeSegments', le.segments || 10);
          this._setPair('fctx-liteGaugeStrokeWidth', le.strokeWidth || (le.variant === 'ring' ? 8.0 : 2.0));
          this._setChk('fctx-liteGaugeShowGuideChk', le.showGuide !== false);
          this._setVal('fctx-liteGaugeUnitInput', le.unit !== undefined ? le.unit : '%');
          this._setVal('fctx-liteGaugeLabelInput', le.labelText || '');
          const bands = (Array.isArray(le.thresholds) && le.thresholds.length === 4)
            ? le.thresholds
            : [
                { enabled: false, value: 40, color: '#22c55e' },
                { enabled: false, value: 60, color: '#eab308' },
                { enabled: Boolean(le.useThresholds), value: le.warnThreshold !== undefined ? le.warnThreshold : 70, color: le.warnColor || '#f59e0b' },
                { enabled: Boolean(le.useThresholds), value: le.critThreshold !== undefined ? le.critThreshold : 90, color: le.critColor || '#ef4444' }
              ];
          this._setChk('fctx-liteGaugeUseThresholdsChk', bands.some((b) => b.enabled));
          this._setChk('fctx-liteGaugeThresh1Chk', Boolean(bands[0].enabled));
          this._setVal('fctx-liteGaugeThresh1Num', bands[0].value);
          this._setVal('fctx-liteGaugeThresh1ColorPicker', bands[0].color || '#22c55e');
          this._setChk('fctx-liteGaugeThresh2Chk', Boolean(bands[1].enabled));
          this._setVal('fctx-liteGaugeThresh2Num', bands[1].value);
          this._setVal('fctx-liteGaugeThresh2ColorPicker', bands[1].color || '#eab308');
          this._setChk('fctx-liteGaugeThresh3Chk', Boolean(bands[2].enabled));
          this._setVal('fctx-liteGaugeWarnThresholdNum', bands[2].value);
          this._setVal('fctx-liteGaugeWarnColorPicker', bands[2].color || '#f59e0b');
          this._setChk('fctx-liteGaugeThresh4Chk', Boolean(bands[3].enabled));
          this._setVal('fctx-liteGaugeCritThresholdNum', bands[3].value);
          this._setVal('fctx-liteGaugeCritColorPicker', bands[3].color || '#ef4444');
          const fctxSegRow = document.getElementById('fctx-liteGaugeSegmentsRow');
          if (fctxSegRow) fctxSegRow.style.display = le.variant === 'segmented' ? '' : 'none';
        }

        if (le.kind === 'oscilloscope-lite') {
          const mode = ['static', 'animated', 'sampled'].includes(le.playbackMode) ? le.playbackMode : 'animated';
          this._setVal('fctx-liteOscModeSelect', mode);
          this._setVal('fctx-liteOscBgColorPicker', le.bgColor || '#0b1322');
          this._setChk('fctx-liteOscShowGuideChk', le.showGuide !== false);
          this._setPair('fctx-liteOscAmplitude', le.intensity !== undefined ? le.intensity : 0.75);
          this._setPair('fctx-liteOscCycles', le.segments || 2);
          this._setPair('fctx-liteOscBaseline', le.startOffset !== undefined ? le.startOffset : 50);
          this._setPair('fctx-liteOscStrokeWidth', le.strokeWidth || 2.2);
          this._setPair('fctx-liteOscSpeed', le.speed || le.period || 2.4);
          this._setVal('fctx-liteOscDirectionSelect', (le.direction === 'reverse' || le.direction === 'ccw') ? 'reverse' : 'forward');
          this._setVal('fctx-liteOscSamplesInput', le.samples || '0, 0.4, 0.9, 0.3, -0.5, -0.9, -0.2, 0.6, 1.0, 0.2, -0.4, 0');
          const cycRow = document.getElementById('fctx-liteOscCyclesRow');
          const spdRow = document.getElementById('fctx-liteOscSpeedRow');
          const dirRow = document.getElementById('fctx-liteOscDirectionRow');
          const smpRow = document.getElementById('fctx-liteOscSamplesRow');
          if (cycRow) cycRow.style.display = mode === 'sampled' ? 'none' : '';
          if (spdRow) spdRow.style.display = mode === 'animated' ? '' : 'none';
          if (dirRow) dirRow.style.display = mode === 'animated' ? '' : 'none';
          if (smpRow) smpRow.style.display = mode === 'sampled' ? '' : 'none';
        }

        if (le.kind === 'radar-lite') {
          this._setChk('fctx-liteRadarShowGuideChk', le.showGuide !== false);
          this._setPair('fctx-liteRadarRings', le.variant === 'single' ? 1 : (le.rings || 3));
          this._setPair('fctx-liteRadarMinScale', le.minScale !== undefined ? le.minScale : 0.15);
          this._setPair('fctx-liteRadarMaxScale', le.maxScale !== undefined ? le.maxScale : 1.0);
          this._setPair('fctx-liteRadarPeriod', le.period || le.speed || 2.4);
          this._setPair('fctx-liteRadarStrokeWidth', le.strokeWidth || 2.0);
          const fctxRingsRow = document.getElementById('fctx-liteRadarRingsRow');
          if (fctxRingsRow) fctxRingsRow.style.display = le.variant === 'single' ? 'none' : '';
        }

        if (le.kind === 'flow-lite') {
          const pts = Array.isArray(le.points) && le.points.length >= 2 ? le.points : [{ x: 25, y: 50 }, { x: 75, y: 50 }];
          const bends = Array.isArray(le.bends) ? le.bends : new Array(pts.length - 1).fill(0);
          const ptIdx = Math.max(0, Math.min(pts.length - 1, (window.LiteEffects && window.LiteEffects.activePointIndex) || 0));
          const activePt = pts[ptIdx] || pts[0];
          const secIdx = Math.min(pts.length - 2, ptIdx);
          const secBend = Number(bends[secIdx]) || 0;

          const ptSlider = document.getElementById('fctx-liteFlowActivePtSlider');
          const ptNum = document.getElementById('fctx-liteFlowActivePtNum');
          if (ptSlider) { ptSlider.max = String(pts.length); ptSlider.value = String(ptIdx + 1); }
          if (ptNum) { ptNum.max = String(pts.length); ptNum.value = String(ptIdx + 1); }
          const dropBtn = document.getElementById('fctx-btnDropLiteFlowNode');
          if (dropBtn) dropBtn.disabled = pts.length <= 2;

          this._setPair('fctx-liteFlowPtX', Math.round(activePt.x * 10) / 10);
          this._setPair('fctx-liteFlowPtY', Math.round(activePt.y * 10) / 10);
          this._setPair('fctx-liteFlowSectionBend', secBend);
          this._setPair('fctx-liteFlowCurvature', Number(le.curvature) || 0);
          this._setChk('fctx-liteFlowShowGuideChk', le.showGuide !== false);
          this._setPair('fctx-liteFlowDashLength', le.dashLength || (le.variant === 'single' ? 36 : 18));
          this._setPair('fctx-liteFlowGapLength', le.gapLength || 14);
          this._setPair('fctx-liteFlowDotSize', le.dotSize || 5);
          this._setPair('fctx-liteFlowStrokeWidth', le.strokeWidth || 3);
          this._setVal('fctx-liteFlowCapStyleSelect', le.segmentStyle || 'rounded');
          this._setVal('fctx-liteFlowStartModeSelect', le.startMode || 'tunnel');
          this._setVal('fctx-liteFlowEndModeSelect', le.endMode || 'tunnel');
          this._setVal('fctx-liteFlowDirectionSelect', le.direction === 'reverse' ? 'reverse' : 'forward');
          this._setVal('fctx-liteFlowPlaybackModeSelect', le.playbackMode || 'loop');
          this._setPair('fctx-liteFlowSpeed', le.speed || 2.0);
          this._setPair('fctx-liteFlowDelay', le.delay || 0);
          this._setPair('fctx-liteFlowEndDelay', le.endDelay || 0);

          const isDotted = le.variant === 'dotted';
          const isSingle = le.variant === 'single';
          const dashRow = document.getElementById('fctx-liteFlowDashLengthRow');
          const gapRow = document.getElementById('fctx-liteFlowGapLengthRow');
          const dotRow = document.getElementById('fctx-liteFlowDotSizeRow');
          const swRow = document.getElementById('fctx-liteFlowStrokeWidthRow');
          const capRow = document.getElementById('fctx-liteFlowCapStyleRow');
          if (dashRow) dashRow.style.display = isDotted ? 'none' : '';
          if (gapRow) gapRow.style.display = isSingle ? 'none' : '';
          if (dotRow) dotRow.style.display = isDotted ? '' : 'none';
          if (swRow) swRow.style.display = isDotted ? 'none' : '';
          if (capRow) capRow.style.display = isDotted ? 'none' : '';
        }
      } else if (this.activeType === 'image') {
        const img = window.ImageObjects ? window.ImageObjects.getImage(this.activeId) : null;
        if (!img) {
          this.close();
          return;
        }
        if (titleEl) {
          titleEl.textContent = 'Image: ' + (img.name || img.filename || img.id);
        }
        this._setVal('fctx-imageNameInput', img.name || '');
        this._setPair('fctx-imageWidth', img.width || 200);
        this._setPair('fctx-imageHeight', img.height || 150);
        this._setChk('fctx-imageLockAspect', img.maintainAspectRatio !== false);
        this._setPair('fctx-imageOpacity', img.opacity !== undefined ? img.opacity : 1.0);
        const fctxResetCrop = document.getElementById('fctx-btnResetCrop');
        if (fctxResetCrop) {
          fctxResetCrop.disabled = !(img.crop && img.crop.enabled);
        }
      } else if (this.activeType === 'group') {
        const grp = window.AppCoordinator ? window.AppCoordinator.getGroup(this.activeId) : null;
        if (!grp) {
          this.close();
          return;
        }
        if (titleEl) {
          titleEl.textContent = 'Group: ' + (grp.name || grp.id);
        }
        this._setVal('fctx-groupNameInput', grp.name || '');
        const memberCountEl = document.getElementById('fctx-groupMemberCount');
        const members = Array.isArray(grp.members) ? grp.members : [];
        if (memberCountEl) {
          const count = members.length;
          memberCountEl.textContent = count + (count === 1 ? ' member' : ' members');
        }

        const membersListEl = document.getElementById('fctx-groupMembersList');
        if (membersListEl) {
          membersListEl.innerHTML = '';
          members.forEach((m) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:3px 6px; background:rgba(255,255,255,0.04); border-radius:4px; font-size:11px;';

            let icon = '📦';
            let label = `${m.type} #${m.id}`;
            if (m.type === 'node') {
              icon = '🔷';
              const n = window.DiagramNodes ? window.DiagramNodes.getNode(m.id) : null;
              if (n && (n.name || n.text)) label = `Shape: ${n.name || n.text}`;
            } else if (m.type === 'flow') {
              icon = '🔀';
              const f = window.DataFlows ? window.DataFlows.getFlow(m.id) : null;
              if (f && (f.name || f.label)) label = `Flow: ${f.name || f.label}`;
            } else if (m.type === 'glow') {
              icon = '✨';
              const g = window.Glows ? window.Glows.getGlow(m.id) : null;
              if (g && g.name) label = `Glow: ${g.name}`;
            } else if (m.type === 'ripple') {
              icon = '🌊';
              const r = window.Ripples ? window.Ripples.getRipple(m.id) : null;
              if (r && r.name) label = `Ripple: ${r.name}`;
            } else if (m.type === 'image') {
              icon = '🖼️';
              const img = window.ImageObjects ? window.ImageObjects.getImage(m.id) : null;
              if (img && (img.name || img.filename)) label = `Image: ${img.name || img.filename}`;
            } else if (m.type === 'lite') {
              icon = '⚡';
              const le = window.LiteEffects ? window.LiteEffects.getLiteEffect(m.id) : null;
              if (le) {
                const kindMap = { 'perimeter-tracer': 'Tracer', 'pulse': 'Pulse', 'flash': 'Flash', 'flow-lite': 'Flow Lite', 'radar-lite': 'Radar Lite', 'gauge-lite': 'Gauge Lite', 'oscilloscope-lite': 'Osc Lite', 'text-lite': 'Text Lite' };
                const kindLabel = kindMap[le.kind] || 'Lite Effect';
                label = le.name ? `${kindLabel}: ${le.name}` : `${kindLabel} #${m.id}`;
              }
            }

            const labelSpan = document.createElement('span');
            labelSpan.textContent = `${icon} ${label}`;
            labelSpan.style.cssText = 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px; color:#c9d1d9;';

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.innerHTML = '&times;';
            removeBtn.title = `Remove ${m.type} #${m.id} from group`;
            removeBtn.style.cssText = 'background:none; border:none; color:#f85149; font-size:14px; cursor:pointer; padding:0 4px; line-height:1; font-weight:bold;';
            removeBtn.addEventListener('click', (ev) => {
              ev.stopPropagation();
              if (window.AppCoordinator && typeof window.AppCoordinator.removeSelectedMembersFromGroup === 'function') {
                window.AppCoordinator.removeSelectedMembersFromGroup([{ type: m.type, id: m.id }], grp.id);
                if (window.AppCoordinator.getGroup(grp.id)) {
                  this.syncFromActiveObject();
                }
              }
            });

            row.appendChild(labelSpan);
            row.appendChild(removeBtn);
            membersListEl.appendChild(row);
          });
        }
      }

      // Check group membership for active object (when inspecting a grouped member object)
      const memberBar = document.getElementById('fctx-memberOfGroupBar');
      const memberNameSpan = document.getElementById('fctx-memberOfGroupName');
      if (memberBar) {
        const grp = (this.activeType && this.activeType !== 'group' && this.activeId !== null && window.AppCoordinator && typeof window.AppCoordinator.findGroupByMember === 'function')
          ? window.AppCoordinator.findGroupByMember(this.activeType, this.activeId)
          : null;
        if (grp) {
          memberBar.style.display = 'flex';
          if (memberNameSpan) {
            memberNameSpan.textContent = `👥 In Group: ${grp.name || grp.id}`;
          }
        } else {
          memberBar.style.display = 'none';
        }
      }

      if (this.activeType && this.activeId !== null && window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
        const eff = window.LayerManager.getEffective(this.activeType, this.activeId);
        const btnVis = document.getElementById('fctx-btnToggleVis');
        const btnLock = document.getElementById('fctx-btnToggleLock');
        if (btnVis) {
          btnVis.textContent = eff.visible ? '👁️' : '🕶️';
          btnVis.title = eff.visible ? 'Hide Object' : 'Show Object';
        }
        if (btnLock) {
          btnLock.textContent = eff.locked ? '🔒' : '🔓';
          btnLock.title = eff.locked ? 'Unlock Object' : 'Lock Object';
        }

        if (typeof window.LayerManager.getLayers === 'function') {
          const layers = window.LayerManager.getLayers();
          const strId = String(this.activeId);
          const idx = layers.findIndex((l) => l.type === this.activeType && String(l.id) === strId);
          const btnLayerTop = document.getElementById('fctx-btnLayerTop');
          const btnLayerUp = document.getElementById('fctx-btnLayerUp');
          const btnLayerDown = document.getElementById('fctx-btnLayerDown');
          const btnLayerBottom = document.getElementById('fctx-btnLayerBottom');
          if (idx !== -1) {
            const isAtTop = (idx >= layers.length - 1) || (layers.length <= 1);
            const isAtBottom = (idx <= 0) || (layers.length <= 1);
            if (btnLayerTop) btnLayerTop.disabled = isAtTop;
            if (btnLayerUp) btnLayerUp.disabled = isAtTop;
            if (btnLayerDown) btnLayerDown.disabled = isAtBottom;
            if (btnLayerBottom) btnLayerBottom.disabled = isAtBottom;
          }
        }
      }

      this._syncWidgetControls();
    } finally {
      this._isSyncing = false;
    }
  },

  _setVal(id, val) {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
  },

  _setChk(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  },

  _setPair(prefix, val) {
    if (val === undefined || val === null) return;
    const slider = document.getElementById(prefix + 'Slider');
    const num = document.getElementById(prefix + 'Num');
    if (slider) slider.value = val;
    if (num) num.value = val;
  },

  _syncSidebar(type, key, val) {
    if (val === undefined || val === null) return;
    const map = {
      node: {
        name: ['nodeNameInput'],
        text: ['nodeTextInput'],
        subtext: ['nodeSubtextInput'],
        shape: ['nodeShapeSelect'],
        width: ['nodeWidthSlider', 'nodeWidthNum'],
        height: ['nodeHeightSlider', 'nodeHeightNum'],
        fillColor: ['nodeFillColorPicker'],
        strokeColor: ['nodeStrokeColorPicker'],
        textColor: ['nodeTextColorPicker'],
        fillOpacity: ['nodeFillOpacitySlider', 'nodeFillOpacityNum'],
        strokeWidth: ['nodeStrokeWidthSlider', 'nodeStrokeWidthNum'],
        strokeStyle: ['nodeStrokeStyleSelect'],
        fontSize: ['nodeFontSizeSlider', 'nodeFontSizeNum'],
        anim: ['nodeAnimSelect'],
        animation: ['nodeAnimSelect'],
        play: ['nodePlayChk'],
        animDur: ['nodeAnimDurSlider', 'nodeAnimDurNum'],
        animDelay: ['nodeAnimDelaySlider', 'nodeAnimDelayNum']
      },
      flow: {
        name: ['flowNameInput'],
        label: ['flowLabelInput'],
        route: ['flowRouteSelect'],
        lineStyle: ['flowLineStyleSelect'],
        arrow: ['flowArrowSelect'],
        lineWidth: ['flowLineWidthSlider', 'flowLineWidthNum'],
        curvature: ['flowCurvatureSlider', 'flowCurvatureNum'],
        type: ['flowTypeSelect'],
        showLine: ['flowShowLine'],
        color: ['flowColorPicker'],
        opacity: ['flowOpacitySlider', 'flowOpacityNum'],
        glow: ['flowGlowSlider', 'flowGlowNum'],
        scale: ['flowScaleSlider', 'flowScaleNum'],
        play: ['flowPlayChk'],
        playbackMode: ['flowPlaybackModeSelect'],
        speed: ['flowSpeedSlider', 'flowSpeedNum'],
        delay: ['flowDelaySlider', 'flowDelayNum'],
        endDelay: ['flowEndDelaySlider', 'flowEndDelayNum'],
        hideOnDelay: ['flowHideOnDelay']
      },
      glow: {
        name: ['glowNameInput'],
        shape: ['glowShapeSelect'],
        play: ['glowPlayChk'],
        playback: ['glowPlaybackSelect'],
        color: ['glowColorPicker'],
        opacity: ['glowOpacitySlider', 'glowOpacityNum'],
        blur: ['glowBlurSlider', 'glowBlurNum'],
        size: ['glowSizeSlider', 'glowSizeNum'],
        rings: ['glowRingsSlider', 'glowRingsNum'],
        coreR: ['glowCoreRSlider', 'glowCoreRNum'],
        thick: ['glowThickSlider', 'glowThickNum'],
        dur: ['glowDurSlider', 'glowDurNum'],
        delay: ['glowDelaySlider', 'glowDelayNum'],
        endDelay: ['glowEndDelaySlider', 'glowEndDelayNum'],
        hideOnDelay: ['glowHideOnDelay']
      },
      ripple: {
        name: ['rippleNameInput'],
        color: ['rippleColorPicker'],
        opacity: ['rippleOpacitySlider', 'rippleOpacityNum'],
        refraction: ['rippleRefractionSlider', 'rippleRefractionNum'],
        play: ['ripplePlayChk'],
        dur: ['rippleDurSlider', 'rippleDurNum'],
        innerR: ['rippleInnerRSlider', 'rippleInnerRNum'],
        outerR: ['rippleOuterRSlider', 'rippleOuterRNum'],
        rings: ['rippleRingsSlider', 'rippleRingsNum'],
        thick: ['rippleThickSlider', 'rippleThickNum'],
        delay: ['rippleDelaySlider', 'rippleDelayNum'],
        endDelay: ['rippleEndDelaySlider', 'rippleEndDelayNum']
      }
    };
    const ids = (map[type] && map[type][key]) || [];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        if (el.type === 'checkbox') el.checked = !!val;
        else el.value = val;
      }
    });
  },

  _bindControls() {
    const closeBtn = document.getElementById('btnFloatingEditorClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        this.close();
      });
    }

    const header = document.getElementById('floatingEditorHeader');
    const editor = document.getElementById('floatingContextEditor');
    if (header && editor && typeof window !== 'undefined') {
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let initLeft = 0;
      let initTop = 0;

      const onPointerMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        const maxLeft = Math.max(0, (window.innerWidth || 1280) - (editor.offsetWidth || 380));
        const maxTop = Math.max(0, (window.innerHeight || 720) - (editor.offsetHeight || 360));

        const newLeft = Math.max(0, Math.min(maxLeft, initLeft + dx));
        const newTop = Math.max(0, Math.min(maxTop, initTop + dy));

        editor.style.left = `${Math.round(newLeft)}px`;
        editor.style.top = `${Math.round(newTop)}px`;
        this._customPos = { left: newLeft, top: newTop };
      };

      const onPointerUp = () => {
        isDragging = false;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      };

      header.addEventListener('pointerdown', (e) => {
        if (e.target && e.target.closest && e.target.closest('#btnFloatingEditorClose')) return;
        if (window.innerWidth && window.innerWidth < 768) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = (typeof editor.getBoundingClientRect === 'function')
          ? editor.getBoundingClientRect()
          : { left: 0, top: 0 };
        initLeft = rect.left;
        initTop = rect.top;
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
      });
    }

    // Node Property Bindings
    const nodePairs = [
      { key: 'width', prefix: 'fctx-nodeWidth' },
      { key: 'height', prefix: 'fctx-nodeHeight' },
      { key: 'fillOpacity', prefix: 'fctx-nodeFillOpacity' },
      { key: 'strokeWidth', prefix: 'fctx-nodeStrokeWidth' },
      { key: 'fontSize', prefix: 'fctx-nodeFontSize' },
      { key: 'animDur', prefix: 'fctx-nodeAnimDur' },
      { key: 'animDelay', prefix: 'fctx-nodeAnimDelay' }
    ];
    nodePairs.forEach(({ key, prefix }) => {
      const slider = document.getElementById(prefix + 'Slider');
      const num = document.getElementById(prefix + 'Num');
      const handleInput = (val) => {
        if (this._isSyncing || this.activeType !== 'node') return;
        const parsed = parseFloat(val);
        if (slider) slider.value = val;
        if (num) num.value = val;
        if (window.DiagramNodes && typeof window.DiagramNodes.updateActive === 'function') {
          window.DiagramNodes.updateActive(key, parsed);
          this._syncSidebar('node', key, parsed);
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
      };
      if (slider) slider.addEventListener('input', (e) => handleInput(e.target.value));
      if (num) num.addEventListener('input', (e) => handleInput(e.target.value));
    });

    const nodeNameIn = document.getElementById('fctx-nodeNameInput');
    if (nodeNameIn) {
      nodeNameIn.addEventListener('input', (e) => {
        if (this._isSyncing || this.activeType !== 'node') return;
        if (window.DiagramNodes && typeof window.DiagramNodes.updateActive === 'function') {
          window.DiagramNodes.updateActive('name', e.target.value);
          this._syncSidebar('node', 'name', e.target.value);
        }
        const titleEl = document.getElementById('floatingEditorTitle');
        if (titleEl) {
          const activeNode = window.DiagramNodes ? window.DiagramNodes.getNode(this.activeId) : null;
          titleEl.textContent = 'Node #' + this.activeId + (e.target.value ? ' (' + e.target.value + ')' : (activeNode && activeNode.text ? ': ' + activeNode.text : ''));
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
      });
    }

    const nodeTextIn = document.getElementById('fctx-nodeTextInput');
    if (nodeTextIn) {
      nodeTextIn.addEventListener('input', (e) => {
        if (this._isSyncing || this.activeType !== 'node') return;
        if (window.DiagramNodes && typeof window.DiagramNodes.updateActive === 'function') {
          window.DiagramNodes.updateActive('text', e.target.value);
          this._syncSidebar('node', 'text', e.target.value);
        }
        const titleEl = document.getElementById('floatingEditorTitle');
        if (titleEl) titleEl.textContent = 'Node #' + this.activeId + (e.target.value ? ': ' + e.target.value : '');
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
      });
    }

    const nodeSubIn = document.getElementById('fctx-nodeSubtextInput');
    if (nodeSubIn) {
      nodeSubIn.addEventListener('input', (e) => {
        if (this._isSyncing || this.activeType !== 'node') return;
        if (window.DiagramNodes && typeof window.DiagramNodes.updateActive === 'function') {
          window.DiagramNodes.updateActive('subtext', e.target.value);
          this._syncSidebar('node', 'subtext', e.target.value);
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
      });
    }

    ['fctx-nodeFillColorPicker', 'fctx-nodeStrokeColorPicker', 'fctx-nodeTextColorPicker'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const key = id.includes('Fill') ? 'fillColor' : (id.includes('Stroke') ? 'strokeColor' : 'textColor');
      el.addEventListener('input', (e) => {
        if (this._isSyncing || this.activeType !== 'node') return;
        if (window.DiagramNodes && typeof window.DiagramNodes.updateActive === 'function') {
          window.DiagramNodes.updateActive(key, e.target.value);
          this._syncSidebar('node', key, e.target.value);
        }
      });
      el.addEventListener('change', () => {
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
      });
    });

    ['fctx-nodeShapeSelect', 'fctx-nodeStrokeStyleSelect', 'fctx-nodeAnimSelect'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const key = id.includes('Shape') ? 'shape' : (id.includes('StrokeStyle') ? 'strokeStyle' : 'anim');
      el.addEventListener('change', (e) => {
        if (this._isSyncing || this.activeType !== 'node') return;
        if (window.DiagramNodes && typeof window.DiagramNodes.updateActive === 'function') {
          window.DiagramNodes.updateActive(key, e.target.value);
          this._syncSidebar('node', key, e.target.value);
          if (key === 'anim') {
            const activeNode = window.DiagramNodes.getNode(this.activeId);
            if (activeNode && typeof window.DiagramNodes.syncEditorUI === 'function') {
              window.DiagramNodes.syncEditorUI(activeNode);
            }
            this.syncFromActiveObject();
          }
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
      });
    });

    const fctxNodePlayChk = document.getElementById('fctx-nodePlayChk');
    if (fctxNodePlayChk) {
      fctxNodePlayChk.addEventListener('change', (e) => {
        if (this._isSyncing || this.activeType !== 'node') return;
        if (window.DiagramNodes && typeof window.DiagramNodes.updateActive === 'function') {
          window.DiagramNodes.updateActive('play', !!e.target.checked);
          this._syncSidebar('node', 'play', !!e.target.checked);
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
      });
    }

    const fctxBtnNodeDelayPlayhead = document.getElementById('fctx-btnNodeDelayFromPlayhead');
    if (fctxBtnNodeDelayPlayhead) {
      fctxBtnNodeDelayPlayhead.addEventListener('click', () => {
        if (this.activeType === 'node' && this.activeId !== null && window.AppCoordinator && typeof window.AppCoordinator.setStartDelayFromPlayhead === 'function') {
          window.AppCoordinator.setStartDelayFromPlayhead('node', this.activeId);
        }
      });
    }

    const btnSnapPreset = document.getElementById('fctx-btnSnapNodeToPreset');
    if (btnSnapPreset) {
      btnSnapPreset.addEventListener('click', () => {
        if (window.DiagramNodes && typeof window.DiagramNodes.applyPresetToActive === 'function') {
          window.DiagramNodes.applyPresetToActive();
          this.syncFromActiveObject();
        }
      });
    }

    const btnDelNode = document.getElementById('fctx-btnDeleteNode');
    if (btnDelNode) {
      btnDelNode.addEventListener('click', () => {
        if (this.activeType === 'node' && this.activeId !== null && window.DiagramNodes) {
          const id = this.activeId;
          this.close();
          window.DiagramNodes.removeNode(id);
        }
      });
    }

    // Flow Property Bindings
    const flowPairs = [
      { key: 'lineWidth', prefix: 'fctx-flowLineWidth' },
      { key: 'curvature', prefix: 'fctx-flowCurvature' },
      { key: 'opacity', prefix: 'fctx-flowOpacity' },
      { key: 'glow', prefix: 'fctx-flowGlow' },
      { key: 'scale', prefix: 'fctx-flowScale' },
      { key: 'speed', prefix: 'fctx-flowSpeed' },
      { key: 'delay', prefix: 'fctx-flowDelay' },
      { key: 'endDelay', prefix: 'fctx-flowEndDelay' }
    ];
    flowPairs.forEach(({ key, prefix }) => {
      const slider = document.getElementById(prefix + 'Slider');
      const num = document.getElementById(prefix + 'Num');
      const handleInput = (val) => {
        if (this._isSyncing || this.activeType !== 'flow') return;
        const parsed = parseFloat(val);
        if (slider) slider.value = val;
        if (num) num.value = val;
        if (window.DataFlows && typeof window.DataFlows.updateActive === 'function') {
          window.DataFlows.updateActive(key, parsed);
          this._syncSidebar('flow', key, parsed);
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
      };
      if (slider) slider.addEventListener('input', (e) => handleInput(e.target.value));
      if (num) num.addEventListener('input', (e) => handleInput(e.target.value));
    });

    const flowNameIn = document.getElementById('fctx-flowNameInput');
    if (flowNameIn) {
      flowNameIn.addEventListener('input', (e) => {
        if (this._isSyncing || this.activeType !== 'flow') return;
        if (window.DataFlows && typeof window.DataFlows.updateActive === 'function') {
          window.DataFlows.updateActive('name', e.target.value);
          this._syncSidebar('flow', 'name', e.target.value);
        }
        const titleEl = document.getElementById('floatingEditorTitle');
        if (titleEl) {
          const activeFlow = window.DataFlows ? window.DataFlows.getFlow(this.activeId) : null;
          titleEl.textContent = 'Flow #' + this.activeId + (e.target.value ? ' (' + e.target.value + ')' : (activeFlow && activeFlow.label ? ': ' + activeFlow.label : ''));
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
      });
    }

    const flowLblIn = document.getElementById('fctx-flowLabelInput');
    if (flowLblIn) {
      flowLblIn.addEventListener('input', (e) => {
        if (this._isSyncing || this.activeType !== 'flow') return;
        if (window.DataFlows && typeof window.DataFlows.updateActive === 'function') {
          window.DataFlows.updateActive('label', e.target.value);
          this._syncSidebar('flow', 'label', e.target.value);
        }
        const titleEl = document.getElementById('floatingEditorTitle');
        if (titleEl) titleEl.textContent = 'Flow #' + this.activeId + (e.target.value ? ': ' + e.target.value : '');
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
      });
    }

    const flowColPick = document.getElementById('fctx-flowColorPicker');
    if (flowColPick) {
      flowColPick.addEventListener('input', (e) => {
        if (this._isSyncing || this.activeType !== 'flow') return;
        if (window.DataFlows && typeof window.DataFlows.updateActive === 'function') {
          window.DataFlows.updateActive('color', e.target.value);
          this._syncSidebar('flow', 'color', e.target.value);
        }
      });
      flowColPick.addEventListener('change', () => {
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
      });
    }

    ['fctx-flowRouteSelect', 'fctx-flowLineStyleSelect', 'fctx-flowArrowSelect', 'fctx-flowTypeSelect', 'fctx-flowPlaybackModeSelect'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const key = id.includes('Route') ? 'route' : (id.includes('LineStyle') ? 'lineStyle' : (id.includes('Arrow') ? 'arrow' : (id.includes('PlaybackMode') ? 'playbackMode' : 'type')));
      el.addEventListener('change', (e) => {
        if (this._isSyncing || this.activeType !== 'flow') return;
        if (window.DataFlows && typeof window.DataFlows.updateActive === 'function') {
          window.DataFlows.updateActive(key, e.target.value);
          this._syncSidebar('flow', key, e.target.value);
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
      });
    });

    ['fctx-flowShowLine', 'fctx-flowHideOnDelay', 'fctx-flowPlayChk'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const key = id.includes('ShowLine') ? 'showLine' : (id.includes('Play') ? 'play' : 'hideOnDelay');
      el.addEventListener('change', (e) => {
        if (this._isSyncing || this.activeType !== 'flow') return;
        if (window.DataFlows && typeof window.DataFlows.updateActive === 'function') {
          window.DataFlows.updateActive(key, e.target.checked);
          this._syncSidebar('flow', key, e.target.checked);
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
      });
    });

    const fctxBtnFlowDelayPlayhead = document.getElementById('fctx-btnFlowDelayFromPlayhead');
    if (fctxBtnFlowDelayPlayhead) {
      fctxBtnFlowDelayPlayhead.addEventListener('click', () => {
        if (this.activeType === 'flow' && this.activeId !== null && window.AppCoordinator && typeof window.AppCoordinator.setStartDelayFromPlayhead === 'function') {
          window.AppCoordinator.setStartDelayFromPlayhead('flow', this.activeId);
        }
      });
    }

    const flowNodeSlider = document.getElementById('fctx-flowNodeSlider');
    if (flowNodeSlider) {
      flowNodeSlider.addEventListener('input', (e) => {
        if (this._isSyncing || this.activeType !== 'flow') return;
        const idx = parseInt(e.target.value, 10);
        if (window.DataFlows && typeof window.DataFlows.selectWaypoint === 'function') {
          window.DataFlows.selectWaypoint(idx);
        }
        const num = document.getElementById('fctx-flowNodeNum');
        if (num) num.value = idx;
      });
    }

    const btnFlowAddNode = document.getElementById('fctx-btnFlowAddNode');
    if (btnFlowAddNode) {
      btnFlowAddNode.addEventListener('click', () => {
        if (this.activeType === 'flow' && window.DataFlows && typeof window.DataFlows.addNodeToActive === 'function') {
          window.DataFlows.addNodeToActive();
          this.syncFromActiveObject();
        }
      });
    }

    const btnFlowDelNode = document.getElementById('fctx-btnFlowDelNode');
    if (btnFlowDelNode) {
      btnFlowDelNode.addEventListener('click', () => {
        if (this.activeType === 'flow' && window.DataFlows && typeof window.DataFlows.dropNodeFromActive === 'function') {
          window.DataFlows.dropNodeFromActive();
          this.syncFromActiveObject();
        }
      });
    }

    const btnDelFlow = document.getElementById('fctx-btnDeleteFlow');
    if (btnDelFlow) {
      btnDelFlow.addEventListener('click', () => {
        if (this.activeType === 'flow' && this.activeId !== null && window.DataFlows) {
          const id = this.activeId;
          this.close();
          window.DataFlows.removeFlow(id);
        }
      });
    }

    // Glow Property Bindings
    const glowPairs = [
      { key: 'opacity', prefix: 'fctx-glowOpacity' },
      { key: 'blur', prefix: 'fctx-glowBlur' },
      { key: 'size', prefix: 'fctx-glowSize' },
      { key: 'rings', prefix: 'fctx-glowRings' },
      { key: 'coreR', prefix: 'fctx-glowCoreR' },
      { key: 'thick', prefix: 'fctx-glowThick' },
      { key: 'dur', prefix: 'fctx-glowDur' },
      { key: 'delay', prefix: 'fctx-glowDelay' },
      { key: 'endDelay', prefix: 'fctx-glowEndDelay' }
    ];
    glowPairs.forEach(({ key, prefix }) => {
      const slider = document.getElementById(prefix + 'Slider');
      const num = document.getElementById(prefix + 'Num');
      const handleInput = (val) => {
        if (this._isSyncing || this.activeType !== 'glow') return;
        const parsed = parseFloat(val);
        if (slider) slider.value = val;
        if (num) num.value = val;
        if (window.Glows && typeof window.Glows.updateActive === 'function') {
          window.Glows.updateActive(key, parsed);
          this._syncSidebar('glow', key, parsed);
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
      };
      if (slider) slider.addEventListener('input', (e) => handleInput(e.target.value));
      if (num) num.addEventListener('input', (e) => handleInput(e.target.value));
    });

    const glowNameIn = document.getElementById('fctx-glowNameInput');
    if (glowNameIn) {
      glowNameIn.addEventListener('input', (e) => {
        if (this._isSyncing || this.activeType !== 'glow') return;
        if (window.Glows && typeof window.Glows.updateActive === 'function') {
          window.Glows.updateActive('name', e.target.value);
          this._syncSidebar('glow', 'name', e.target.value);
        }
        const titleEl = document.getElementById('floatingEditorTitle');
        if (titleEl) {
          titleEl.textContent = 'Glow #' + this.activeId + (e.target.value ? ' (' + e.target.value + ')' : '');
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
      });
    }

    const glowColPick = document.getElementById('fctx-glowColorPicker');
    if (glowColPick) {
      glowColPick.addEventListener('input', (e) => {
        if (this._isSyncing || this.activeType !== 'glow') return;
        if (window.Glows) {
          window.Glows.updateActive('color', e.target.value);
          this._syncSidebar('glow', 'color', e.target.value);
        }
      });
      glowColPick.addEventListener('change', () => {
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
      });
    }

    ['fctx-glowShapeSelect', 'fctx-glowPlaybackSelect'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const key = id.includes('Shape') ? 'shape' : 'playback';
      el.addEventListener('change', (e) => {
        if (this._isSyncing || this.activeType !== 'glow') return;
        if (window.Glows) {
          window.Glows.updateActive(key, e.target.value);
          this._syncSidebar('glow', key, e.target.value);
        }
        if (key === 'shape') {
          const isRadar = e.target.value === 'radar';
          ['fctx-glowRadarRow1', 'fctx-glowRadarRow2', 'fctx-glowRadarRow3'].forEach((rId) => {
            const rEl = document.getElementById(rId);
            if (rEl) rEl.style.display = isRadar ? 'flex' : 'none';
          });
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
      });
    });

    const glowHideDelay = document.getElementById('fctx-glowHideOnDelay');
    if (glowHideDelay) {
      glowHideDelay.addEventListener('change', (e) => {
        if (this._isSyncing || this.activeType !== 'glow') return;
        if (window.Glows) {
          window.Glows.updateActive('hideOnDelay', e.target.checked);
          this._syncSidebar('glow', 'hideOnDelay', e.target.checked);
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
      });
    }

    const fctxGlowPlayChk = document.getElementById('fctx-glowPlayChk');
    if (fctxGlowPlayChk) {
      fctxGlowPlayChk.addEventListener('change', (e) => {
        if (this._isSyncing || this.activeType !== 'glow') return;
        if (window.Glows) {
          window.Glows.updateActive('play', !!e.target.checked);
          this._syncSidebar('glow', 'play', !!e.target.checked);
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
      });
    }

    const fctxBtnGlowDelayPlayhead = document.getElementById('fctx-btnGlowDelayFromPlayhead');
    if (fctxBtnGlowDelayPlayhead) {
      fctxBtnGlowDelayPlayhead.addEventListener('click', () => {
        if (this.activeType === 'glow' && this.activeId !== null && window.AppCoordinator && typeof window.AppCoordinator.setStartDelayFromPlayhead === 'function') {
          window.AppCoordinator.setStartDelayFromPlayhead('glow', this.activeId);
        }
      });
    }

    const btnDelGlow = document.getElementById('fctx-btnDeleteGlow');
    if (btnDelGlow) {
      btnDelGlow.addEventListener('click', () => {
        if (this.activeType === 'glow' && this.activeId !== null && window.Glows) {
          const id = this.activeId;
          this.close();
          window.Glows.removeGlow(id);
        }
      });
    }

    // Ripple Property Bindings
    const ripplePairs = [
      { key: 'opacity', prefix: 'fctx-rippleOpacity' },
      { key: 'refraction', prefix: 'fctx-rippleRefraction' },
      { key: 'dur', prefix: 'fctx-rippleDur' },
      { key: 'innerR', prefix: 'fctx-rippleInnerR' },
      { key: 'outerR', prefix: 'fctx-rippleOuterR' },
      { key: 'rings', prefix: 'fctx-rippleRings' },
      { key: 'thick', prefix: 'fctx-rippleThick' },
      { key: 'delay', prefix: 'fctx-rippleDelay' },
      { key: 'endDelay', prefix: 'fctx-rippleEndDelay' }
    ];
    ripplePairs.forEach(({ key, prefix }) => {
      const slider = document.getElementById(prefix + 'Slider');
      const num = document.getElementById(prefix + 'Num');
      const handleInput = (val) => {
        if (this._isSyncing || this.activeType !== 'ripple') return;
        const parsed = parseFloat(val);
        if (isNaN(parsed)) return;
        if (slider) slider.value = val;
        if (num) num.value = val;
        if (window.Ripples && typeof window.Ripples.updateActive === 'function') {
          window.Ripples.updateActive(key, parsed);
          this._syncSidebar('ripple', key, parsed);
          const rp = window.Ripples.getRipple(this.activeId);
          if (rp) {
            if (key === 'innerR' && rp.outerR !== undefined) {
              this._setPair('fctx-rippleOuterR', rp.outerR);
              this._syncSidebar('ripple', 'outerR', rp.outerR);
            } else if (key === 'outerR' && rp.innerR !== undefined) {
              this._setPair('fctx-rippleInnerR', rp.innerR);
              this._syncSidebar('ripple', 'innerR', rp.innerR);
            }
          }
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
      };
      if (slider) slider.addEventListener('input', (e) => handleInput(e.target.value));
      if (num) num.addEventListener('input', (e) => handleInput(e.target.value));
    });

    const rippleNameIn = document.getElementById('fctx-rippleNameInput');
    if (rippleNameIn) {
      rippleNameIn.addEventListener('input', (e) => {
        if (this._isSyncing || this.activeType !== 'ripple') return;
        if (window.Ripples && typeof window.Ripples.updateActive === 'function') {
          window.Ripples.updateActive('name', e.target.value);
          this._syncSidebar('ripple', 'name', e.target.value);
        }
        const titleEl = document.getElementById('floatingEditorTitle');
        if (titleEl) {
          titleEl.textContent = 'Ripple #' + this.activeId + (e.target.value ? ' (' + e.target.value + ')' : '');
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
      });
    }

    const ripColPick = document.getElementById('fctx-rippleColorPicker');
    if (ripColPick) {
      ripColPick.addEventListener('input', (e) => {
        if (this._isSyncing || this.activeType !== 'ripple') return;
        if (window.Ripples) {
          window.Ripples.updateActive('color', e.target.value);
          this._syncSidebar('ripple', 'color', e.target.value);
        }
      });
      ripColPick.addEventListener('change', () => {
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
      });
    }

    const fctxRipplePlayChk = document.getElementById('fctx-ripplePlayChk');
    if (fctxRipplePlayChk) {
      fctxRipplePlayChk.addEventListener('change', (e) => {
        if (this._isSyncing || this.activeType !== 'ripple') return;
        if (window.Ripples) {
          window.Ripples.updateActive('play', !!e.target.checked);
          this._syncSidebar('ripple', 'play', !!e.target.checked);
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
      });
    }

    const fctxBtnRippleDelayPlayhead = document.getElementById('fctx-btnRippleDelayFromPlayhead');
    if (fctxBtnRippleDelayPlayhead) {
      fctxBtnRippleDelayPlayhead.addEventListener('click', () => {
        if (this.activeType === 'ripple' && this.activeId !== null && window.AppCoordinator && typeof window.AppCoordinator.setStartDelayFromPlayhead === 'function') {
          window.AppCoordinator.setStartDelayFromPlayhead('ripple', this.activeId);
        }
      });
    }

    const btnDelRipple = document.getElementById('fctx-btnDeleteRipple');
    if (btnDelRipple) {
      btnDelRipple.addEventListener('click', () => {
        if (this.activeType === 'ripple' && this.activeId !== null && window.Ripples) {
          const id = this.activeId;
          this.close();
          window.Ripples.removeRipple(id);
        }
      });
    }

    // Lite Effect Property Bindings
    const updateLiteAndSync = (prop, val) => {
      if (this._isSyncing || this.activeType !== 'lite' || !window.LiteEffects) return;
      window.LiteEffects.updateActive(prop, val);
      const le = window.LiteEffects.getLiteEffect(this.activeId);
      if (le) window.LiteEffects.syncEditorUI(le);
    };

    const litePairs = [
      ['fctx-liteOpacity', 'opacity', false],
      ['fctx-liteWidth', 'width', true],
      ['fctx-liteHeight', 'height', true],
      ['fctx-liteRotation', 'rotation', false],
      ['fctx-liteArmThickness', 'armThickness', false],
      ['fctx-liteCornerRadius', 'cornerRadius', true],
      ['fctx-liteStrokeWidth', 'strokeWidth', false],
      ['fctx-liteSegments', 'segments', true],
      ['fctx-liteSpeed', 'speed', false],
      ['fctx-liteMinScale', 'minScale', false],
      ['fctx-liteMaxScale', 'maxScale', false],
      ['fctx-litePeriod', 'period', false],
      ['fctx-liteFlashDur', 'durationMs', true],
      ['fctx-liteFlashRepeatInterval', 'repeatInterval', false],
      ['fctx-liteFlowCurvature', 'curvature', false],
      ['fctx-liteFlowDashLength', 'dashLength', false],
      ['fctx-liteFlowGapLength', 'gapLength', false],
      ['fctx-liteFlowDotSize', 'dotSize', false],
      ['fctx-liteFlowStrokeWidth', 'strokeWidth', false],
      ['fctx-liteFlowSpeed', 'speed', false],
      ['fctx-liteFlowDelay', 'delay', false],
      ['fctx-liteFlowEndDelay', 'endDelay', false],
      ['fctx-liteRadarRings', 'rings', true],
      ['fctx-liteRadarMinScale', 'minScale', false],
      ['fctx-liteRadarMaxScale', 'maxScale', false],
      ['fctx-liteRadarPeriod', 'period', false],
      ['fctx-liteRadarStrokeWidth', 'strokeWidth', false],
      ['fctx-liteGaugeValue', 'value', false],
      ['fctx-liteGaugeSegments', 'segments', true],
      ['fctx-liteGaugeStrokeWidth', 'strokeWidth', false],
      ['fctx-liteOscAmplitude', 'intensity', false],
      ['fctx-liteOscCycles', 'segments', true],
      ['fctx-liteOscBaseline', 'startOffset', false],
      ['fctx-liteOscStrokeWidth', 'strokeWidth', false],
      ['fctx-liteOscSpeed', 'speed', false],
      ['fctx-liteTextFontSize', 'fontSize', false],
      ['fctx-liteTextLetterSpacing', 'letterSpacing', false],
      ['fctx-liteTextPadding', 'padding', false],
      ['fctx-liteTextBgOpacity', 'bgOpacity', false],
      ['fctx-liteTextStrokeWidth', 'strokeWidth', false],
      ['fctx-liteTextCurvature', 'curvature', false],
      ['fctx-liteTextStartOffset', 'startOffset', false],
      ['fctx-liteTextScrollSpeed', 'scrollSpeed', false],
      ['fctx-liteTextLinesPerSec', 'linesPerSec', false],
      ['fctx-liteTextLineSpacing', 'lineSpacing', false],
      ['fctx-liteTextTypeSpeed', 'typeSpeed', false],
      ['fctx-liteTextCycleSpeed', 'speed', false],
      ['fctx-liteTextHoldDelay', 'holdDelay', false],
      ['fctx-liteTextClearDuration', 'clearDuration', false],
      ['fctx-liteDelay', 'delay', false]
    ];
    litePairs.forEach(([baseId, prop, isInt]) => {
      const slider = document.getElementById(baseId + 'Slider');
      const num = document.getElementById(baseId + 'Num');
      const onInput = (raw) => {
        if (this._isSyncing || this.activeType !== 'lite') return;
        const val = isInt ? parseInt(raw, 10) : parseFloat(raw);
        if (!Number.isFinite(val)) return;
        if (slider && slider.value !== String(val)) slider.value = val;
        if (num && num.value !== String(val)) num.value = val;
        updateLiteAndSync(prop, val);
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
      };
      if (slider) slider.addEventListener('input', (e) => onInput(e.target.value));
      if (num) num.addEventListener('input', (e) => onInput(e.target.value));
    });

    const liteNameIn = document.getElementById('fctx-liteNameInput');
    if (liteNameIn) {
      liteNameIn.addEventListener('input', (e) => {
        updateLiteAndSync('name', e.target.value);
        const titleEl = document.getElementById('floatingEditorTitle');
        if (titleEl && this.activeType === 'lite') {
          titleEl.textContent = 'Lite #' + this.activeId + (e.target.value ? ' (' + e.target.value + ')' : '');
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
      });
    }

    const bindLiteSimple = (elId, prop, evt = 'change', isBool = false) => {
      const el = document.getElementById(elId);
      if (!el) return;
      el.addEventListener(evt, (e) => {
        updateLiteAndSync(prop, isBool ? e.target.checked : e.target.value);
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
      });
    };
    bindLiteSimple('fctx-liteVariantSelect', 'variant', 'change');
    bindLiteSimple('fctx-liteColorPicker', 'color', 'input');
    bindLiteSimple('fctx-litePlayChk', 'play', 'change', true);
    bindLiteSimple('fctx-liteLockAspectChk', 'maintainAspectRatio', 'change', true);
    bindLiteSimple('fctx-liteShowGuideChk', 'showGuide', 'change', true);
    const fctxRatioPreset = document.getElementById('fctx-liteRatioPresetSelect');
    if (fctxRatioPreset) {
      fctxRatioPreset.addEventListener('change', (e) => {
        const val = e.target.value;
        const customRow = document.getElementById('fctx-liteRatioCustomRow');
        if (val === 'custom') {
          if (customRow) customRow.style.display = '';
        } else {
          if (customRow) customRow.style.display = 'none';
          updateLiteAndSync('lineGapRatio', val);
          if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
        }
      });
    }
    bindLiteSimple('fctx-liteRatioInput', 'lineGapRatio', 'input');
    bindLiteSimple('fctx-liteDirectionSelect', 'direction', 'change');
    bindLiteSimple('fctx-litePlaybackModeSelect', 'playbackMode', 'change');
    bindLiteSimple('fctx-liteBurstCyclesNum', 'burstCycles', 'input');
    bindLiteSimple('fctx-litePauseSecondsNum', 'pauseSeconds', 'input');
    bindLiteSimple('fctx-litePauseVisibilitySelect', 'pauseVisibility', 'change');
    bindLiteSimple('fctx-liteRepeatChk', 'repeat', 'change', true);
    bindLiteSimple('fctx-liteFlowShowGuideChk', 'showGuide', 'change', true);
    bindLiteSimple('fctx-liteFlowCapStyleSelect', 'segmentStyle', 'change');
    bindLiteSimple('fctx-liteFlowStartModeSelect', 'startMode', 'change');
    bindLiteSimple('fctx-liteFlowEndModeSelect', 'endMode', 'change');
    bindLiteSimple('fctx-liteFlowDirectionSelect', 'direction', 'change');
    bindLiteSimple('fctx-liteFlowPlaybackModeSelect', 'playbackMode', 'change');
    bindLiteSimple('fctx-liteRadarShowGuideChk', 'showGuide', 'change', true);
    bindLiteSimple('fctx-liteGaugeMinNum', 'minValue', 'input');
    bindLiteSimple('fctx-liteGaugeMaxNum', 'maxValue', 'input');
    bindLiteSimple('fctx-liteGaugeBgColorPicker', 'bgColor', 'input');
    bindLiteSimple('fctx-liteGaugeDirectionSelect', 'direction', 'change');
    bindLiteSimple('fctx-liteGaugeShowGuideChk', 'showGuide', 'change', true);
    bindLiteSimple('fctx-liteGaugeUnitInput', 'unit', 'input');
    bindLiteSimple('fctx-liteGaugeLabelInput', 'labelText', 'input');
    bindLiteSimple('fctx-liteGaugeUseThresholdsChk', 'useThresholds', 'change', true);
    bindLiteSimple('fctx-liteGaugeThresh1Chk', 'threshold1Enabled', 'change', true);
    bindLiteSimple('fctx-liteGaugeThresh1Num', 'threshold1Value', 'input');
    bindLiteSimple('fctx-liteGaugeThresh1ColorPicker', 'threshold1Color', 'input');
    bindLiteSimple('fctx-liteGaugeThresh2Chk', 'threshold2Enabled', 'change', true);
    bindLiteSimple('fctx-liteGaugeThresh2Num', 'threshold2Value', 'input');
    bindLiteSimple('fctx-liteGaugeThresh2ColorPicker', 'threshold2Color', 'input');
    bindLiteSimple('fctx-liteGaugeThresh3Chk', 'threshold3Enabled', 'change', true);
    bindLiteSimple('fctx-liteGaugeWarnThresholdNum', 'threshold3Value', 'input');
    bindLiteSimple('fctx-liteGaugeWarnColorPicker', 'threshold3Color', 'input');
    bindLiteSimple('fctx-liteGaugeThresh4Chk', 'threshold4Enabled', 'change', true);
    bindLiteSimple('fctx-liteGaugeCritThresholdNum', 'threshold4Value', 'input');
    bindLiteSimple('fctx-liteGaugeCritColorPicker', 'threshold4Color', 'input');
    bindLiteSimple('fctx-liteOscModeSelect', 'playbackMode', 'change');
    bindLiteSimple('fctx-liteOscBgColorPicker', 'bgColor', 'input');
    bindLiteSimple('fctx-liteOscShowGuideChk', 'showGuide', 'change', true);
    bindLiteSimple('fctx-liteOscDirectionSelect', 'direction', 'change');
    bindLiteSimple('fctx-liteOscSamplesInput', 'samples', 'input');
    bindLiteSimple('fctx-liteTextContentInput', 'labelText', 'input');
    bindLiteSimple('fctx-liteTextFontSelect', 'fontFamily', 'change');
    bindLiteSimple('fctx-liteTextFontWeightSelect', 'fontWeight', 'change');
    bindLiteSimple('fctx-liteTextAlignSelect', 'textAlign', 'change');
    bindLiteSimple('fctx-liteTextVerticalAlignSelect', 'verticalAlign', 'change');
    bindLiteSimple('fctx-liteTextBgColorPicker', 'bgColor', 'input');
    bindLiteSimple('fctx-liteTextBorderColorPicker', 'borderColor', 'input');
    bindLiteSimple('fctx-liteTextShowGuideChk', 'showGuide', 'change', true);
    bindLiteSimple('fctx-liteTextAnimSelect', 'textAnim', 'change');
    document.getElementById('fctx-liteTextAnimSelect')?.addEventListener('change', () => {
      if (!this._isSyncing) this.syncFromActiveObject();
    });
    document.getElementById('fctx-btnLiteDelayFromPlayhead')?.addEventListener('click', () => {
      if (this.activeType === 'lite' && this.activeId != null && window.AppCoordinator && typeof window.AppCoordinator.setStartDelayFromPlayhead === 'function') {
        window.AppCoordinator.setStartDelayFromPlayhead('lite', this.activeId);
      }
    });
    document.getElementById('fctx-btnLiteFlowDelayFromPlayhead')?.addEventListener('click', () => {
      if (this.activeType === 'lite' && this.activeId != null && window.AppCoordinator && typeof window.AppCoordinator.setStartDelayFromPlayhead === 'function') {
        window.AppCoordinator.setStartDelayFromPlayhead('lite', this.activeId);
      }
    });
    bindLiteSimple('fctx-liteTextPlaybackModeSelect', 'playbackMode', 'change');
    bindLiteSimple('fctx-liteTextWordWrapChk', 'wordWrap', 'change', true);
    bindLiteSimple('fctx-liteTextDirectionSelect', 'direction', 'change');
    bindLiteSimple('fctx-liteTextTypeModeSelect', 'typeMode', 'change');
    bindLiteSimple('fctx-liteTextTypeRepeatChk', 'typeRepeat', 'change', true);
    bindLiteSimple('fctx-liteTextLockOnOffChk', 'lockOnOff', 'change', true);

    document.getElementById('fctx-btnAddLiteFlowNode')?.addEventListener('click', () => {
      if (this.activeType === 'lite' && window.LiteEffects) {
        window.LiteEffects.addWaypointToActive();
      }
    });
    document.getElementById('fctx-btnDropLiteFlowNode')?.addEventListener('click', () => {
      if (this.activeType === 'lite' && window.LiteEffects) {
        window.LiteEffects.dropWaypointFromActive();
      }
    });

    const bindFctxFlowActivePt = (srcId, dstId) => {
      const src = document.getElementById(srcId);
      const dst = document.getElementById(dstId);
      if (!src) return;
      src.addEventListener('input', (e) => {
        if (this._isSyncing || this.activeType !== 'lite' || !window.LiteEffects) return;
        const idx = Math.max(0, (parseInt(e.target.value, 10) || 1) - 1);
        if (dst) dst.value = idx + 1;
        window.LiteEffects.selectWaypoint(idx);
      });
    };
    bindFctxFlowActivePt('fctx-liteFlowActivePtSlider', 'fctx-liteFlowActivePtNum');
    bindFctxFlowActivePt('fctx-liteFlowActivePtNum', 'fctx-liteFlowActivePtSlider');

    const bindFctxFlowPtCoord = (sliderId, numId, axis) => {
      const s = document.getElementById(sliderId);
      const n = document.getElementById(numId);
      const handle = (src, dst) => {
        if (!src) return;
        src.addEventListener('input', (e) => {
          if (this._isSyncing || this.activeType !== 'lite' || !window.LiteEffects) return;
          const val = parseFloat(e.target.value);
          if (!Number.isFinite(val)) return;
          if (dst) dst.value = val;
          window.LiteEffects.updateActiveWaypointCoord(axis, val);
        });
      };
      handle(s, n);
      handle(n, s);
    };
    bindFctxFlowPtCoord('fctx-liteFlowPtXSlider', 'fctx-liteFlowPtXNum', 'x');
    bindFctxFlowPtCoord('fctx-liteFlowPtYSlider', 'fctx-liteFlowPtYNum', 'y');

    const bindFctxFlowBend = (sliderId, numId) => {
      const s = document.getElementById(sliderId);
      const n = document.getElementById(numId);
      const handle = (src, dst) => {
        if (!src) return;
        src.addEventListener('input', (e) => {
          if (this._isSyncing || this.activeType !== 'lite' || !window.LiteEffects) return;
          const val = parseFloat(e.target.value);
          if (!Number.isFinite(val)) return;
          if (dst) dst.value = val;
          window.LiteEffects.updateActiveSectionBend(val);
        });
      };
      handle(s, n);
      handle(n, s);
    };
    bindFctxFlowBend('fctx-liteFlowSectionBendSlider', 'fctx-liteFlowSectionBendNum');

    const btnTriggerLiteFlash = document.getElementById('fctx-btnTriggerLiteFlash');
    if (btnTriggerLiteFlash) {
      btnTriggerLiteFlash.addEventListener('click', () => {
        if (this.activeType === 'lite' && this.activeId !== null && window.LiteEffects) {
          window.LiteEffects.triggerFlash(this.activeId);
        }
      });
    }

    const btnDelLite = document.getElementById('fctx-btnDeleteLite');
    if (btnDelLite) {
      btnDelLite.addEventListener('click', () => {
        if (this.activeType === 'lite' && this.activeId !== null && window.LiteEffects) {
          const id = this.activeId;
          this.close();
          window.LiteEffects.removeLite(id);
        }
      });
    }

    // Group Property Bindings
    const grpNameInput = document.getElementById('fctx-groupNameInput');
    if (grpNameInput) {
      grpNameInput.addEventListener('input', (e) => {
        if (this.activeType === 'group' && this.activeId && window.AppCoordinator) {
          window.AppCoordinator.renameSelectedGroup(e.target.value);
        }
      });
    }

    const btnUngroup = document.getElementById('fctx-btnUngroup');
    if (btnUngroup) {
      btnUngroup.addEventListener('click', () => {
        if (window.AppCoordinator && typeof window.AppCoordinator.ungroupSelectedGroup === 'function') {
          window.AppCoordinator.ungroupSelectedGroup();
        }
        this.close(false);
      });
    }

    const btnDupGrp = document.getElementById('fctx-btnDuplicateGroup');
    if (btnDupGrp) {
      btnDupGrp.addEventListener('click', () => {
        if (window.AppCoordinator && typeof window.AppCoordinator.duplicateSelection === 'function') {
          window.AppCoordinator.duplicateSelection();
        }
      });
    }

    const btnSaveComp = document.getElementById('fctx-btnSaveComposite');
    if (btnSaveComp) {
      btnSaveComp.addEventListener('click', () => {
        if (window.AppCoordinator && typeof window.AppCoordinator.saveSelectedGroupAsComposite === 'function') {
          window.AppCoordinator.saveSelectedGroupAsComposite();
        }
      });
    }

    const btnDelGrp = document.getElementById('fctx-btnDeleteGroup');
    if (btnDelGrp) {
      btnDelGrp.addEventListener('click', () => {
        if (window.AppCoordinator && typeof window.AppCoordinator.deleteSelectedObjects === 'function') {
          window.AppCoordinator.deleteSelectedObjects();
        }
        this.close(false);
      });
    }

    const btnRemoveFromGroup = document.getElementById('fctx-btnRemoveFromGroup');
    if (btnRemoveFromGroup) {
      btnRemoveFromGroup.addEventListener('click', () => {
        if (this.activeType && this.activeType !== 'group' && this.activeId !== null && window.AppCoordinator && typeof window.AppCoordinator.removeSelectedMembersFromGroup === 'function') {
          window.AppCoordinator.removeSelectedMembersFromGroup([{ type: this.activeType, id: this.activeId }]);
          this.syncFromActiveObject();
        }
      });
    }

    const btnEditMembers = document.getElementById('fctx-btnEditGroupMembers');
    if (btnEditMembers) {
      btnEditMembers.addEventListener('click', () => {
        if (this.activeType === 'group' && this.activeId && window.AppCoordinator) {
          const grpId = this.activeId;
          window.AppCoordinator.enterGroupEditMode(grpId);
          const grp = window.AppCoordinator.getGroup(grpId);
          if (grp && Array.isArray(grp.members) && grp.members.length > 0) {
            const first = grp.members[0];
            window.AppCoordinator.selectObject(first.type, first.id, { skipGroupResolve: true });
          } else {
            this.close();
          }
        }
      });
    }

    // Multi-Selection Floating Controls
    const btnGroupMulti = document.getElementById('fctx-btnGroupMulti');
    if (btnGroupMulti) {
      btnGroupMulti.addEventListener('click', () => {
        if (window.AppCoordinator) {
          const sel = window.AppCoordinator.getActiveSelection();
          if (sel && sel.type === 'group' && typeof window.AppCoordinator.ungroupSelectedGroup === 'function') {
            window.AppCoordinator.ungroupSelectedGroup();
            this.close(false);
          } else if (typeof window.AppCoordinator.createGroupFromSelection === 'function') {
            window.AppCoordinator.createGroupFromSelection();
          }
        }
      });
    }

    const btnDupMulti = document.getElementById('fctx-btnDuplicateMulti');
    if (btnDupMulti) {
      btnDupMulti.addEventListener('click', () => {
        if (window.AppCoordinator && typeof window.AppCoordinator.duplicateSelection === 'function') {
          window.AppCoordinator.duplicateSelection();
        }
      });
    }

    // Layer Quick-Bar Controls
    const btnLayerTop = document.getElementById('fctx-btnLayerTop');
    if (btnLayerTop) {
      btnLayerTop.addEventListener('click', () => {
        if (this.activeType && this.activeId !== null && window.AppCoordinator) {
          window.AppCoordinator.bringSelectionToFront([{ type: this.activeType, id: String(this.activeId) }]);
          this.syncFromActiveObject();
        }
      });
    }

    const btnLayerUp = document.getElementById('fctx-btnLayerUp');
    if (btnLayerUp) {
      btnLayerUp.addEventListener('click', () => {
        if (this.activeType && this.activeId !== null && window.AppCoordinator) {
          window.AppCoordinator.bringSelectionForward([{ type: this.activeType, id: String(this.activeId) }]);
          this.syncFromActiveObject();
        }
      });
    }

    const btnLayerDown = document.getElementById('fctx-btnLayerDown');
    if (btnLayerDown) {
      btnLayerDown.addEventListener('click', () => {
        if (this.activeType && this.activeId !== null && window.AppCoordinator) {
          window.AppCoordinator.sendSelectionBackward([{ type: this.activeType, id: String(this.activeId) }]);
          this.syncFromActiveObject();
        }
      });
    }

    const btnLayerBottom = document.getElementById('fctx-btnLayerBottom');
    if (btnLayerBottom) {
      btnLayerBottom.addEventListener('click', () => {
        if (this.activeType && this.activeId !== null && window.AppCoordinator) {
          window.AppCoordinator.sendSelectionToBack([{ type: this.activeType, id: String(this.activeId) }]);
          this.syncFromActiveObject();
        }
      });
    }

    const btnToggleVis = document.getElementById('fctx-btnToggleVis');
    if (btnToggleVis) {
      btnToggleVis.addEventListener('click', () => {
        if (this.activeType && this.activeId !== null && window.LayerManager) {
          const eff = window.LayerManager.getEffective(this.activeType, this.activeId);
          window.LayerManager.setVisibility(this.activeType, this.activeId, !eff.visible);
          this.syncFromActiveObject();
          if (window.AppCoordinator) {
            window.AppCoordinator.requestRender();
            window.AppCoordinator.recordHistoryDebounced();
            window.AppCoordinator.updateActiveOverlays();
          }
        }
      });
    }

    const btnToggleLock = document.getElementById('fctx-btnToggleLock');
    if (btnToggleLock) {
      btnToggleLock.addEventListener('click', () => {
        if (this.activeType && this.activeId !== null && window.LayerManager) {
          const eff = window.LayerManager.getEffective(this.activeType, this.activeId);
          window.LayerManager.setLocked(this.activeType, this.activeId, !eff.locked);
          this.syncFromActiveObject();
          if (window.AppCoordinator) {
            window.AppCoordinator.requestRender();
            window.AppCoordinator.recordHistoryDebounced();
            window.AppCoordinator.updateActiveOverlays();
          }
        }
      });
    }

    // Image Object Floating Controls
    const imgNameIn = document.getElementById('fctx-imageNameInput');
    if (imgNameIn) {
      imgNameIn.addEventListener('input', (e) => {
        if (this._isSyncing || this.activeType !== 'image') return;
        let res = null;
        if (window.ImageObjects && typeof window.ImageObjects.updateImage === 'function') {
          res = window.ImageObjects.updateImage(this.activeId, { name: e.target.value });
        } else if (window.EngineBridge && typeof window.EngineBridge.updateImage === 'function' && window.EngineBridge.isReady()) {
          res = window.EngineBridge.updateImage(this.activeId, { name: e.target.value });
        }
        const titleEl = document.getElementById('floatingEditorTitle');
        if (titleEl) titleEl.textContent = 'Image: ' + (e.target.value || this.activeId);
        if (res && window.AppCoordinator) {
          window.AppCoordinator.requestRender();
          window.AppCoordinator.recordHistoryDebounced();
        }
      });
    }

    const handleImageDimChange = (dim, val) => {
      if (this._isSyncing || this.activeType !== 'image' || !window.ImageObjects) return;
      const img = window.ImageObjects.getImage(this.activeId);
      if (!img) return;
      const patch = {};
      const numVal = Math.max(10, parseFloat(val) || 10);
      patch[dim] = numVal;

      const lockAspect = document.getElementById('fctx-imageLockAspect')?.checked;
      if (lockAspect && img.width > 0 && img.height > 0) {
        if (dim === 'width') {
          const ratio = (img.naturalHeight && img.naturalWidth)
            ? (img.naturalHeight / img.naturalWidth)
            : (img.height / img.width);
          patch.height = Math.round(numVal * ratio);
          this._setPair('fctx-imageHeight', patch.height);
        } else if (dim === 'height') {
          const ratio = (img.naturalWidth && img.naturalHeight)
            ? (img.naturalWidth / img.naturalHeight)
            : (img.width / img.height);
          patch.width = Math.round(numVal * ratio);
          this._setPair('fctx-imageWidth', patch.width);
        }
      }

      let res = null;
      if (window.ImageObjects && typeof window.ImageObjects.updateImage === 'function') {
        res = window.ImageObjects.updateImage(this.activeId, patch);
      } else if (window.EngineBridge && typeof window.EngineBridge.updateImage === 'function' && window.EngineBridge.isReady()) {
        res = window.EngineBridge.updateImage(this.activeId, patch);
      }
      if (res && window.AppCoordinator) {
        window.AppCoordinator.requestRender();
        window.AppCoordinator.recordHistoryDebounced();
        window.AppCoordinator.updateActiveOverlays();
      }
    };

    ['Slider', 'Num'].forEach((suffix) => {
      document.getElementById('fctx-imageWidth' + suffix)?.addEventListener('input', (e) => {
        const other = document.getElementById(suffix === 'Slider' ? 'fctx-imageWidthNum' : 'fctx-imageWidthSlider');
        if (other) other.value = e.target.value;
        handleImageDimChange('width', e.target.value);
      });
      document.getElementById('fctx-imageHeight' + suffix)?.addEventListener('input', (e) => {
        const other = document.getElementById(suffix === 'Slider' ? 'fctx-imageHeightNum' : 'fctx-imageHeightSlider');
        if (other) other.value = e.target.value;
        handleImageDimChange('height', e.target.value);
      });
    });

    const imgLockChk = document.getElementById('fctx-imageLockAspect');
    if (imgLockChk) {
      imgLockChk.addEventListener('change', (e) => {
        if (this._isSyncing || this.activeType !== 'image') return;
        if (window.ImageObjects && typeof window.ImageObjects.updateImage === 'function') {
          window.ImageObjects.updateImage(this.activeId, { maintainAspectRatio: e.target.checked });
        } else if (window.EngineBridge && typeof window.EngineBridge.updateImage === 'function' && window.EngineBridge.isReady()) {
          window.EngineBridge.updateImage(this.activeId, { maintainAspectRatio: e.target.checked });
        }
      });
    }

    const imgOpSlider = document.getElementById('fctx-imageOpacitySlider');
    const imgOpNum = document.getElementById('fctx-imageOpacityNum');
    const handleImgOp = (val) => {
      if (this._isSyncing || this.activeType !== 'image') return;
      const parsed = Math.max(0, Math.min(1, parseFloat(val) || 0));
      if (imgOpSlider) imgOpSlider.value = parsed;
      if (imgOpNum) imgOpNum.value = parsed;
      let res = null;
      if (window.ImageObjects && typeof window.ImageObjects.updateImage === 'function') {
        res = window.ImageObjects.updateImage(this.activeId, { opacity: parsed });
      } else if (window.EngineBridge && typeof window.EngineBridge.updateImage === 'function' && window.EngineBridge.isReady()) {
        res = window.EngineBridge.updateImage(this.activeId, { opacity: parsed });
      }
      if (res && window.AppCoordinator) {
        window.AppCoordinator.requestRender();
        window.AppCoordinator.recordHistoryDebounced();
      }
    };
    if (imgOpSlider) imgOpSlider.addEventListener('input', (e) => handleImgOp(e.target.value));
    if (imgOpNum) imgOpNum.addEventListener('input', (e) => handleImgOp(e.target.value));

    const btnDelImage = document.getElementById('fctx-btnDeleteImage');
    if (btnDelImage) {
      btnDelImage.addEventListener('click', () => {
        if (this.activeType === 'image' && this.activeId !== null) {
          const id = this.activeId;
          if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
            const eff = window.LayerManager.getEffective('image', id);
            if (eff && eff.locked) {
              if (window.StudioNotification && typeof window.StudioNotification.show === 'function') {
                window.StudioNotification.show('Cannot delete locked image.', 'warning', 2000);
              }
              return;
            }
          }
          this.close();
          let deleted = false;
          if (window.ImageObjects && typeof window.ImageObjects.deleteImage === 'function') {
            deleted = window.ImageObjects.deleteImage(id);
          } else if (window.EngineBridge && typeof window.EngineBridge.deleteImage === 'function' && window.EngineBridge.isReady()) {
            const res = window.EngineBridge.deleteImage(id);
            deleted = !!(res && res.success);
          }
          if (deleted && window.AppCoordinator) {
            window.AppCoordinator.clearSelection();
            window.AppCoordinator.requestRender();
            window.AppCoordinator.recordHistoryImmediate();
            window.AppCoordinator.updateActiveOverlays();
          }
        }
      });
    }

    const fctxBtnCrop = document.getElementById('fctx-btnCropImage');
    if (fctxBtnCrop) {
      fctxBtnCrop.addEventListener('click', () => {
        if (this.activeType === 'image' && this.activeId !== null && window.Stage) {
          const id = this.activeId;
          this.close();
          window.Stage.startCropMode(id);
        }
      });
    }

    const fctxBtnClip = document.getElementById('fctx-btnClipImage');
    if (fctxBtnClip) {
      fctxBtnClip.addEventListener('click', () => {
        if (this.activeType === 'image' && this.activeId !== null && window.Stage) {
          const id = this.activeId;
          this.close();
          window.Stage.startClipMode(id);
        }
      });
    }

    const fctxBtnResetCrop = document.getElementById('fctx-btnResetCrop');
    if (fctxBtnResetCrop) {
      fctxBtnResetCrop.addEventListener('click', () => {
        if (this.activeType === 'image' && this.activeId !== null && window.ImageObjects) {
          const id = this.activeId;
          window.ImageObjects.resetCrop(id);
          window.ImageObjects.resetClip(id);
          if (window.HistoryManager) window.HistoryManager.recordImmediate();
          if (typeof window.triggerRender === 'function') window.triggerRender();
          if (typeof window.syncImageEditorUI === 'function') window.syncImageEditorUI();
          if (typeof window.syncImageToolsUI === 'function') window.syncImageToolsUI();
          this.openFor('image', id);
        }
      });
    }

    const fctxBtnBake = document.getElementById('fctx-btnBakeImage');
    if (fctxBtnBake) {
      fctxBtnBake.addEventListener('click', () => {
        if (this.activeType === 'image' && this.activeId !== null && window.ImageObjects) {
          const img = window.ImageObjects.getImage(this.activeId);
          this.close();
          if (img && typeof window.openBakeModal === 'function') {
            window.openBakeModal(img);
          }
        }
      });
    }

    this._bindWidgetControls();
  },

  _debounceSaveWidgetBinding() {
    // Legacy helper kept for safety
  },

  _bindWidgetControls() {
    // Dynamic cards in #fctx-widgetPropertiesList are bound in _syncWidgetControls via window.renderWidgetPropertyCards
  },

  _syncWidgetControls() {
    const sec = document.getElementById("fctx-widgetSection");
    if (!sec) return;

    if (!["node", "flow", "glow", "ripple", "lite", "image", "group"].includes(this.activeType) || this.activeId === null) {
      sec.style.display = "none";
      return;
    }
    sec.style.display = "block";

    const propsList = document.getElementById("fctx-widgetPropertiesList");
    const statusMsg = document.getElementById("fctx-widgetStatusMsg");
    const countBadge = document.getElementById("fctx-widgetCountBadge");

    const sel = { type: this.activeType, id: this.activeId };
    if (propsList && typeof window.renderWidgetPropertyCards === "function") {
      window.renderWidgetPropertyCards(propsList, sel, statusMsg);
    }

    if (countBadge && window.EngineBridge && typeof window.EngineBridge.getWidgetParameters === "function") {
      const allParams = window.EngineBridge.getWidgetParameters() || [];
      const targetId = (this.activeType === "group" && String(this.activeId).startsWith("group-"))
        ? String(this.activeId)
        : `${this.activeType}-${this.activeId}`;
      const boundCount = allParams.filter(p => {
        const t = p.Target || p.target;
        return t === targetId || t === String(this.activeId);
      }).length;
      countBadge.textContent = `${boundCount} exposed`;
      countBadge.style.color = boundCount > 0 ? "#7ee787" : "#8b949e";
    }
  },

  _resolveTargetObject(target) {
    if (!target || !target.closest) return null;

    if (target.closest('#groupSelectionBox') || target.closest('#groupSelectionOverlay')) {
      if (window.AppCoordinator && window.AppCoordinator.activeSelection && window.AppCoordinator.activeSelection.type === 'group') {
        return { type: 'group', id: window.AppCoordinator.activeSelection.id };
      }
    }

    // Selection box resolution
    if (target.closest('#nodeSelectionBox')) {
      if (window.AppCoordinator && window.AppCoordinator.activeSelection) {
        const sel = window.AppCoordinator.activeSelection;
        if (sel.type === 'image' && sel.id !== null) {
          return { type: 'image', id: sel.id };
        }
        if (sel.type === 'lite' && sel.id !== null) {
          return { type: 'lite', id: sel.id };
        }
        if (sel.type === 'node' && sel.id !== null) {
          return { type: 'node', id: sel.id };
        }
      }
      if (window.DiagramNodes && window.DiagramNodes.activeId !== null) {
        return { type: 'node', id: window.DiagramNodes.activeId };
      }
    }

    if (target.closest('#cropOverlayGroup') || target.closest('#cropBoxRect')) {
      if (window.Stage && window.Stage.activeCropImageId) {
        return { type: 'image', id: window.Stage.activeCropImageId };
      }
    }

    // 1. Nodes: SVG node group or child elements, or active node selection box
    const nodeEl = target.closest('[data-node-id]');
    if (nodeEl && nodeEl.getAttribute) {
      const rawId = nodeEl.getAttribute('data-node-id');
      const id = parseInt(rawId, 10);
      return { type: 'node', id: !isNaN(id) ? id : rawId };
    }

    // 2. Flows: flow instance group, connector path, flow badge, or flow reticles
    const flowEl = target.closest('[data-flow-id]');
    if (flowEl && flowEl.getAttribute) {
      const fid = parseInt(flowEl.getAttribute('data-flow-id'), 10);
      if (!isNaN(fid)) return { type: 'flow', id: fid };
    }
    const flowReticle = target.closest('[data-flow-node-idx]');
    if (flowReticle && flowReticle.hasAttribute('data-lite-flow-pt-idx')) {
      if (window.LiteEffects && window.LiteEffects.activeId !== null) {
        return { type: 'lite', id: window.LiteEffects.activeId };
      }
    }
    const flowPath = target.closest('.flow-track-path') || (target.id && target.id.startsWith('flowPath-') ? target : null) || (target.closest && target.closest('[id^="flowPath-"]'));
    if (flowReticle || flowPath) {
      let flowId = null;
      if (flowPath && flowPath.id) {
        const m = flowPath.id.match(/flowPath-(\d+)/);
        if (m) flowId = parseInt(m[1], 10);
      }
      if (flowId === null && window.DataFlows && window.DataFlows.activeId !== null) {
        flowId = window.DataFlows.activeId;
      }
      if (flowId === null && window.DataFlows && window.DataFlows.list && window.DataFlows.list.length > 0) {
        flowId = window.DataFlows.list[0].id;
      }
      if (flowId !== null && !isNaN(flowId)) return { type: 'flow', id: flowId };
    }

    // 3. Glows: glow instance group (hit target or child), glow reticle, or glow layer element
    const glowEl = target.closest('[data-glow-id]');
    if (glowEl && glowEl.getAttribute) {
      const gid = parseInt(glowEl.getAttribute('data-glow-id'), 10);
      if (!isNaN(gid)) return { type: 'glow', id: gid };
    }
    const glowTarget = target.closest('#glowReticleTarget') || (target.id && target.id.startsWith('glow-') ? target : null) || (target.closest && target.closest('[id^="glow-"]'));
    if (glowTarget) {
      const glowId = window.Glows && window.Glows.activeId !== null
        ? window.Glows.activeId
        : (window.Glows && window.Glows.list && window.Glows.list.length > 0 ? window.Glows.list[0].id : null);
      if (glowId !== null) return { type: 'glow', id: glowId };
    }

    // 4. Ripples: ripple instance group (hit target or child), ripple reticle, or ripple layer element
    const ripEl = target.closest('[data-ripple-id]');
    if (ripEl && ripEl.getAttribute) {
      const rid = parseInt(ripEl.getAttribute('data-ripple-id'), 10);
      if (!isNaN(rid)) return { type: 'ripple', id: rid };
    }
    const rippleTarget = target.closest('#rippleReticleTarget') || (target.id && target.id.startsWith('ripple-') ? target : null) || (target.closest && target.closest('[id^="ripple-"]'));
    if (rippleTarget) {
      const rippleId = window.Ripples && window.Ripples.activeId !== null
        ? window.Ripples.activeId
        : (window.Ripples && window.Ripples.list && window.Ripples.list.length > 0 ? window.Ripples.list[0].id : null);
      if (rippleId !== null) return { type: 'ripple', id: rippleId };
    }

    // 5. Images: image element
    const imgEl = target.closest('[data-image-id]');
    if (imgEl && imgEl.getAttribute) {
      const rawId = imgEl.getAttribute('data-image-id');
      const iid = parseInt(rawId, 10);
      return { type: 'image', id: (!isNaN(iid) && String(iid) === rawId) ? iid : rawId };
    }

    // 5b. Lite Effects: [data-lite-id]
    const liteEl = target.closest('[data-lite-id]');
    if (liteEl && liteEl.getAttribute) {
      const lid = parseInt(liteEl.getAttribute('data-lite-id'), 10);
      if (!isNaN(lid)) return { type: 'lite', id: lid };
    }

    return null;
  },

  handleCanvasContextMenu(e) {
    // Clean extension point for future canvas-specific context menu.
    // SVG Animator Studio owns the interactive canvas context and suppresses the browser
    // native context menu without opening Properties or altering current selection.
    // No placeholder / empty custom menu is created.
  },

  _bindEvents() {
    const editor = document.getElementById('floatingContextEditor');
    if (editor) {
      const stopFn = (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      };
      editor.addEventListener('pointerdown', stopFn);
      editor.addEventListener('click', stopFn);
      editor.addEventListener('dblclick', stopFn);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          const gmModal = typeof document !== 'undefined' ? document.getElementById('groupMappingModal') : null;
          if (gmModal && gmModal.style && (gmModal.style.display === 'flex' || gmModal.style.display === 'block')) {
            return;
          }
          this.close(true);
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
        }
      });
    }

    if (window.AppCoordinator) {
      window.AppCoordinator.on('selection:changed', (sel) => this.handleSelectionChanged(sel));
      window.AppCoordinator.on('render:completed', () => this.handleRenderCompleted());
      window.AppCoordinator.on('state:restored', () => this.close(false));
    }

    const previewBox = document.getElementById('previewBox');
    if (previewBox) {
      // Right-click: SVG Animator Studio owns the interactive canvas context.
      previewBox.addEventListener('contextmenu', (e) => {
        // Retain native browser context menu for form inputs, editable fields, and floating editor controls
        const t = e.target;
        if (t) {
          const tag = (t.tagName || '').toLowerCase();
          if (tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable) {
            return;
          }
          if (t.closest && (
            t.closest('#floatingContextEditor') ||
            t.closest('input') ||
            t.closest('textarea') ||
            t.closest('select') ||
            t.closest('[contenteditable="true"]')
          )) {
            return;
          }
        }

        // Suppress browser native context menu across the interactive canvas
        e.preventDefault();
        e.stopPropagation();

        const obj = this._resolveTargetObject(e.target);
        if (obj) {
          const isAlreadyMultiSelected = window.AppCoordinator &&
            typeof window.AppCoordinator.isObjectSelected === 'function' &&
            window.AppCoordinator.isObjectSelected(obj.type, obj.id) &&
            typeof window.AppCoordinator.getSelectedItems === 'function' &&
            window.AppCoordinator.getSelectedItems().length >= 2;

          if (!isAlreadyMultiSelected) {
            const memberGroup = (obj.type !== 'group' && window.AppCoordinator && typeof window.AppCoordinator.findGroupByMember === 'function')
              ? window.AppCoordinator.findGroupByMember(obj.type, obj.id)
              : null;
            const inGroupEdit = (window.AppCoordinator && typeof window.AppCoordinator.isInGroupEditMode === 'function')
              ? window.AppCoordinator.isInGroupEditMode()
              : false;

            if (memberGroup && !inGroupEdit) {
              if (window.AppCoordinator && typeof window.AppCoordinator.selectGroup === 'function') {
                window.AppCoordinator.selectGroup(memberGroup.id);
              }
              this.openFor('group', memberGroup.id, {
                resetPosition: true,
                clickCoords: { clientX: e.clientX, clientY: e.clientY }
              });
              return;
            }

            const accordionIds = { node: 'acc-nodes', flow: 'acc-flows', glow: 'acc-glows', ripple: 'acc-ripples', lite: 'acc-lite-effects', image: 'acc-layers' };
            if (window.AppCoordinator && typeof window.AppCoordinator.selectObject === 'function') {
              window.AppCoordinator.selectObject(obj.type, obj.id, { openAccordionId: accordionIds[obj.type] });
            }
          }

          this.openFor(obj.type, obj.id, {
            resetPosition: true,
            clickCoords: { clientX: e.clientX, clientY: e.clientY }
          });
        } else {
          // Right-click on empty canvas:
          // Closes floating Properties if open and clears active selection
          if (this.isOpen) {
            this.close(true);
          } else if (window.AppCoordinator && typeof window.AppCoordinator.clearSelection === 'function') {
            window.AppCoordinator.clearSelection({ reason: 'empty_canvas_contextmenu' });
          }
          // Dispatches to clean extension point for future canvas-specific context menu.
          this.handleCanvasContextMenu(e);
        }
      });

      // Double-click: Open contextual properties for recognized editable objects
      previewBox.addEventListener('dblclick', (e) => {
        if (e.target && e.target.closest && e.target.closest('#floatingContextEditor')) return;

        const obj = this._resolveTargetObject(e.target);
        if (obj) {
          const memberGrp = (obj.type !== 'group' && window.AppCoordinator)
            ? window.AppCoordinator.findGroupByMember(obj.type, obj.id)
            : null;

          if (memberGrp) {
            window.AppCoordinator.enterGroupEditMode(memberGrp.id);
            window.AppCoordinator.selectObject(obj.type, obj.id, { skipGroupResolve: true });
            this.openFor(obj.type, obj.id, {
              resetPosition: false,
              clickCoords: { clientX: e.clientX, clientY: e.clientY }
            });
            return;
          }

          const accordionIds = { node: 'acc-nodes', flow: 'acc-flows', glow: 'acc-glows', ripple: 'acc-ripples', lite: 'acc-lite-effects', image: 'acc-layers' };
          if (window.AppCoordinator && typeof window.AppCoordinator.selectObject === 'function') {
            window.AppCoordinator.selectObject(obj.type, obj.id, { openAccordionId: accordionIds[obj.type] });
          }
          this.openFor(obj.type, obj.id, {
            resetPosition: false,
            clickCoords: { clientX: e.clientX, clientY: e.clientY }
          });
          return;
        }

        if (window.AppCoordinator && window.AppCoordinator.activeSelection && window.AppCoordinator.activeSelection.type && window.AppCoordinator.activeSelection.id !== null) {
          const sel = window.AppCoordinator.activeSelection;
          if (['node', 'flow', 'glow', 'ripple', 'lite', 'group', 'image'].includes(sel.type)) {
            this.openFor(sel.type, sel.id);
          }
        }
      });

      // Blank canvas click closes editor
      previewBox.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        const isInteractive = e.target && e.target.closest && (
          this._resolveTargetObject(e.target) ||
          e.target.closest('#floatingContextEditor') ||
          e.target.closest('.reticle')
        );
        if (!isInteractive && this.isOpen) {
          this.close();
        }
      }, true);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        if (this.isOpen) this.updatePosition();
      });
    }
  }
};

window.FloatingContextEditor = window.FloatingPropertiesEditor;

})();
