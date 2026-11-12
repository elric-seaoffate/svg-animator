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
    if (!['node', 'flow', 'glow', 'ripple', 'group', 'image'].includes(type) || id === null || id === undefined) {
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

    const iconEl = document.getElementById('floatingEditorIcon');
    const badgeEl = document.getElementById('floatingEditorBadge');
    if (badgeEl) {
      badgeEl.className = 'floating-editor-badge badge-' + type;
      badgeEl.textContent = type.toUpperCase();
    }
    if (iconEl) {
      const icons = { node: '🔷', flow: '⚡', glow: '✨', ripple: '💧', group: '👥', image: '🖼️' };
      iconEl.textContent = icons[type] || '⚙️';
    }

    const sections = {
      node: document.getElementById('fctx-nodeSection'),
      flow: document.getElementById('fctx-flowSection'),
      glow: document.getElementById('fctx-glowSection'),
      ripple: document.getElementById('fctx-rippleSection'),
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
    if (!sel || !sel.type || sel.id === null || !['node', 'flow', 'glow', 'ripple', 'group', 'image'].includes(sel.type)) {
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
        this._setVal('fctx-nodeAnimSelect', node.animation || 'none');
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
        this._setPair('fctx-rippleDur', ripple.dur !== undefined ? ripple.dur : 3.0);
        this._setPair('fctx-rippleInnerR', ripple.innerR !== undefined ? ripple.innerR : 0);
        this._setPair('fctx-rippleOuterR', ripple.outerR !== undefined ? ripple.outerR : 150);
        this._setPair('fctx-rippleRings', ripple.rings !== undefined ? ripple.rings : 3);
        this._setPair('fctx-rippleThick', ripple.thick !== undefined ? ripple.thick : 8);
        this._setPair('fctx-rippleDelay', ripple.delay !== undefined ? ripple.delay : 0.0);
        this._setPair('fctx-rippleEndDelay', ripple.endDelay !== undefined ? ripple.endDelay : 1.0);
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
        animation: ['nodeAnimSelect']
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
        speed: ['flowSpeedSlider', 'flowSpeedNum'],
        delay: ['flowDelaySlider', 'flowDelayNum'],
        endDelay: ['flowEndDelaySlider', 'flowEndDelayNum'],
        hideOnDelay: ['flowHideOnDelay']
      },
      glow: {
        name: ['glowNameInput'],
        shape: ['glowShapeSelect'],
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
      { key: 'fontSize', prefix: 'fctx-nodeFontSize' }
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
      const key = id.includes('Shape') ? 'shape' : (id.includes('StrokeStyle') ? 'strokeStyle' : 'animation');
      el.addEventListener('change', (e) => {
        if (this._isSyncing || this.activeType !== 'node') return;
        if (window.DiagramNodes && typeof window.DiagramNodes.updateActive === 'function') {
          window.DiagramNodes.updateActive(key, e.target.value);
          this._syncSidebar('node', key, e.target.value);
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
      });
    });

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

    ['fctx-flowRouteSelect', 'fctx-flowLineStyleSelect', 'fctx-flowArrowSelect', 'fctx-flowTypeSelect'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const key = id.includes('Route') ? 'route' : (id.includes('LineStyle') ? 'lineStyle' : (id.includes('Arrow') ? 'arrow' : 'type'));
      el.addEventListener('change', (e) => {
        if (this._isSyncing || this.activeType !== 'flow') return;
        if (window.DataFlows && typeof window.DataFlows.updateActive === 'function') {
          window.DataFlows.updateActive(key, e.target.value);
          this._syncSidebar('flow', key, e.target.value);
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
      });
    });

    ['fctx-flowShowLine', 'fctx-flowHideOnDelay'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const key = id.includes('ShowLine') ? 'showLine' : 'hideOnDelay';
      el.addEventListener('change', (e) => {
        if (this._isSyncing || this.activeType !== 'flow') return;
        if (window.DataFlows && typeof window.DataFlows.updateActive === 'function') {
          window.DataFlows.updateActive(key, e.target.checked);
          this._syncSidebar('flow', key, e.target.checked);
        }
        if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
      });
    });

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
        if (slider) slider.value = val;
        if (num) num.value = val;
        if (window.Ripples && typeof window.Ripples.updateActive === 'function') {
          window.Ripples.updateActive(key, parsed);
          this._syncSidebar('ripple', key, parsed);
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
        if (window.ImageObjects) {
          window.ImageObjects.updateImage(this.activeId, { name: e.target.value });
        }
        if (window.EngineBridge && typeof window.EngineBridge.updateImage === 'function' && window.EngineBridge.isReady()) {
          window.EngineBridge.updateImage(this.activeId, { name: e.target.value });
        }
        const titleEl = document.getElementById('floatingEditorTitle');
        if (titleEl) titleEl.textContent = 'Image: ' + (e.target.value || this.activeId);
        if (window.AppCoordinator) {
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

      window.ImageObjects.updateImage(this.activeId, patch);
      if (window.EngineBridge && typeof window.EngineBridge.updateImage === 'function' && window.EngineBridge.isReady()) {
        window.EngineBridge.updateImage(this.activeId, patch);
      }
      if (window.AppCoordinator) {
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
        if (window.ImageObjects) window.ImageObjects.updateImage(this.activeId, { maintainAspectRatio: e.target.checked });
        if (window.EngineBridge && typeof window.EngineBridge.updateImage === 'function' && window.EngineBridge.isReady()) {
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
      if (window.ImageObjects) window.ImageObjects.updateImage(this.activeId, { opacity: parsed });
      if (window.EngineBridge && typeof window.EngineBridge.updateImage === 'function' && window.EngineBridge.isReady()) {
        window.EngineBridge.updateImage(this.activeId, { opacity: parsed });
      }
      if (window.AppCoordinator) {
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
          this.close();
          if (window.ImageObjects) window.ImageObjects.deleteImage(id);
          if (window.EngineBridge && typeof window.EngineBridge.deleteImage === 'function' && window.EngineBridge.isReady()) {
            window.EngineBridge.deleteImage(id);
          }
          if (window.AppCoordinator) {
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

            const accordionIds = { node: 'acc-nodes', flow: 'acc-flows', glow: 'acc-glows', ripple: 'acc-ripples', image: 'acc-layers' };
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

          const accordionIds = { node: 'acc-nodes', flow: 'acc-flows', glow: 'acc-glows', ripple: 'acc-ripples', image: 'acc-layers' };
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
          if (['node', 'flow', 'glow', 'ripple', 'group', 'image'].includes(sel.type)) {
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

})();
