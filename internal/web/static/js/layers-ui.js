/**
 * SVG Animator Studio — Unified Layers Drawer UI & Inspector Layer Presentation (`layers-ui.js`)
 *
 * Responsibilities:
 *   - Render layer list items with reverse z-order (top-most layer on top)
 *   - Display node, flow, glow, ripple, and image items with icon and title
 *   - Layer action buttons: Visibility toggle, Lock toggle, Click/Shift/Ctrl selection
 *   - Layer reordering toolbar buttons (Bring to Front, Forward, Backward, Send to Back)
 *   - Object inspector layer sub-sections (position label, lock, visibility, reorder)
 *   - Image editor inspector panel synchronization and event bindings
 *
 * Layer 1 (UI Presentation) — Reads authoritative layers from LayerManager (Layer 3).
 */

(function() {
  'use strict';

  function updateLayersToolbarState() {
    const btnToFront = document.getElementById('btnLayerToFront');
    const btnForward = document.getElementById('btnLayerForward');
    const btnBackward = document.getElementById('btnLayerBackward');
    const btnToBack = document.getElementById('btnLayerToBack');

    if (!btnToFront || !btnForward || !btnBackward || !btnToBack) return;

    if (!window.AppCoordinator) {
      btnToFront.disabled = true;
      btnForward.disabled = true;
      btnBackward.disabled = true;
      btnToBack.disabled = true;
      return;
    }

    const sel = (typeof window.AppCoordinator.getActiveSelection === 'function')
      ? window.AppCoordinator.getActiveSelection()
      : window.AppCoordinator.activeSelection;

    if (!sel) {
      btnToFront.disabled = true;
      btnForward.disabled = true;
      btnBackward.disabled = true;
      btnToBack.disabled = true;
      return;
    }

    // Determine target layer keys
    const targetKeys = new Set();
    if (sel.type === 'group' && sel.id) {
      const grp = (typeof window.AppCoordinator.getGroup === 'function') ? window.AppCoordinator.getGroup(sel.id) : null;
      if (grp && Array.isArray(grp.members)) {
        grp.members.forEach((m) => targetKeys.add(`${m.type}:${m.id}`));
      } else if (Array.isArray(sel.items)) {
        sel.items.forEach((m) => targetKeys.add(`${m.type}:${m.id}`));
      }
    } else if (Array.isArray(sel.items) && sel.items.length > 0) {
      sel.items.forEach((it) => {
        if (['node', 'flow', 'glow', 'ripple', 'image'].includes(it.type)) {
          const grp = (typeof window.AppCoordinator.findGroupByMember === 'function') ? window.AppCoordinator.findGroupByMember(it.type, it.id) : null;
          if (grp && Array.isArray(grp.members)) {
            grp.members.forEach((m) => targetKeys.add(`${m.type}:${m.id}`));
          } else {
            targetKeys.add(`${it.type}:${it.id}`);
          }
        }
      });
    } else if (sel.type && sel.id != null && ['node', 'flow', 'glow', 'ripple', 'image'].includes(sel.type)) {
      const grp = (typeof window.AppCoordinator.findGroupByMember === 'function') ? window.AppCoordinator.findGroupByMember(sel.type, sel.id) : null;
      if (grp && Array.isArray(grp.members)) {
        grp.members.forEach((m) => targetKeys.add(`${m.type}:${m.id}`));
      } else {
        targetKeys.add(`${sel.type}:${sel.id}`);
      }
    }

    if (targetKeys.size === 0) {
      btnToFront.disabled = true;
      btnForward.disabled = true;
      btnBackward.disabled = true;
      btnToBack.disabled = true;
      return;
    }

    const layers = (window.LayerManager && typeof window.LayerManager.getLayers === 'function')
      ? window.LayerManager.getLayers()
      : [];

    if (layers.length <= 1) {
      btnToFront.disabled = true;
      btnForward.disabled = true;
      btnBackward.disabled = true;
      btnToBack.disabled = true;
      return;
    }

    // Check if all targets are at the top (end of layers array)
    let allAtTop = true;
    const targetCount = targetKeys.size;
    const topStartIndex = layers.length - targetCount;
    if (topStartIndex < 0) {
      allAtTop = false;
    } else {
      for (let i = topStartIndex; i < layers.length; i++) {
        const k = `${layers[i].type}:${layers[i].id}`;
        if (!targetKeys.has(k)) {
          allAtTop = false;
          break;
        }
      }
    }

    // Check if all targets are at the bottom (start of layers array)
    let allAtBottom = true;
    if (targetCount > layers.length) {
      allAtBottom = false;
    } else {
      for (let i = 0; i < targetCount; i++) {
        const k = `${layers[i].type}:${layers[i].id}`;
        if (!targetKeys.has(k)) {
          allAtBottom = false;
          break;
        }
      }
    }

    btnToFront.disabled = allAtTop;
    btnForward.disabled = allAtTop;
    btnBackward.disabled = allAtBottom;
    btnToBack.disabled = allAtBottom;
  }

  function renderLayersList() {
    const container = document.getElementById('layersListContainer');
    if (!container) return;
    if (!window.LayerManager || typeof window.LayerManager.getLayers !== 'function') return;

    const layers = window.LayerManager.getLayers();
    if (!layers || layers.length === 0) {
      container.innerHTML = '<div style="padding: 12px; color: var(--text-dim, #8b949e); text-align: center; font-size: 0.8rem;">No layers in scene. Add shapes, flows, glows, ripples, or import an image.</div>';
      updateLayersToolbarState();
      return;
    }

    container.innerHTML = '';
    // Display in reverse order: top-most visual layer (highest index in array) at top of UI list
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const eff = window.LayerManager.getEffective(layer.type, layer.id);
      const isSel = (window.AppCoordinator && typeof window.AppCoordinator.isObjectSelected === 'function')
        ? window.AppCoordinator.isObjectSelected(layer.type, layer.id)
        : false;
      const isPrimary = (window.AppCoordinator && window.AppCoordinator.activeSelection &&
        window.AppCoordinator.activeSelection.type === layer.type &&
        String(window.AppCoordinator.activeSelection.id) === String(layer.id));

      const row = document.createElement('div');
      row.className = 'layer-item' +
        (isSel ? ' active' : '') +
        (isPrimary ? ' primary-selected' : '') +
        (!eff.visible ? ' hidden' : '') +
        (eff.locked ? ' locked' : '');

      let icon = '📦';
      let name = `${layer.type} #${layer.id}`;
      if (layer.type === 'node') {
        icon = '🔷';
        const n = window.DiagramNodes ? window.DiagramNodes.getNode(layer.id) : null;
        if (n) name = n.name || n.text || `Shape #${layer.id}`;
      } else if (layer.type === 'flow') {
        icon = '⚡';
        const f = window.DataFlows ? window.DataFlows.getFlow(layer.id) : null;
        if (f) name = f.name || f.label || `Flow #${layer.id}`;
      } else if (layer.type === 'glow') {
        icon = '✨';
        const g = window.Glows ? window.Glows.getGlow(layer.id) : null;
        if (g) name = g.name || `Glow #${layer.id}`;
      } else if (layer.type === 'ripple') {
        icon = '💧';
        const r = window.Ripples ? window.Ripples.getRipple(layer.id) : null;
        if (r) name = r.name || `Ripple #${layer.id}`;
      } else if (layer.type === 'image') {
        icon = '🖼️';
        const img = window.ImageObjects ? window.ImageObjects.getImage(layer.id) : null;
        if (img) name = img.name || img.filename || `Image #${layer.id}`;
      }

      const memberGrp = (window.AppCoordinator && typeof window.AppCoordinator.findGroupByMember === 'function')
        ? window.AppCoordinator.findGroupByMember(layer.type, layer.id)
        : null;

      const infoDiv = document.createElement('div');
      infoDiv.className = 'layer-item-info';

      const iconSpan = document.createElement('span');
      iconSpan.className = 'layer-item-icon';
      iconSpan.textContent = icon;
      infoDiv.appendChild(iconSpan);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'layer-item-title';
      titleSpan.textContent = name;
      titleSpan.title = `${name} (${layer.type} #${layer.id})`;
      infoDiv.appendChild(titleSpan);

      if (memberGrp) {
        const grpBadge = document.createElement('span');
        grpBadge.className = 'layer-item-badge';
        grpBadge.textContent = '👥 ' + (memberGrp.name || memberGrp.id);
        grpBadge.title = `Member of group: ${memberGrp.name || memberGrp.id}`;
        infoDiv.appendChild(grpBadge);
      }

      row.appendChild(infoDiv);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'layer-item-actions';

      const btnVis = document.createElement('button');
      btnVis.type = 'button';
      btnVis.className = 'layer-action-btn' + (!eff.visible ? ' active' : '');
      btnVis.textContent = eff.visible ? '👁️' : '🕶️';
      btnVis.title = eff.visible ? 'Hide layer' : 'Show layer';
      btnVis.addEventListener('click', (e) => {
        e.stopPropagation();
        window.LayerManager.setVisibility(layer.type, layer.id, !eff.visible);
        if (window.AppCoordinator) {
          window.AppCoordinator.requestRender();
          window.AppCoordinator.recordHistoryDebounced();
          window.AppCoordinator.updateActiveOverlays();
          window.AppCoordinator.emit('layers:changed');
        }
      });
      actionsDiv.appendChild(btnVis);

      const btnLock = document.createElement('button');
      btnLock.type = 'button';
      btnLock.className = 'layer-action-btn' + (eff.locked ? ' active' : '');
      btnLock.textContent = eff.locked ? '🔒' : '🔓';
      btnLock.title = eff.locked ? 'Unlock layer' : 'Lock layer';
      btnLock.addEventListener('click', (e) => {
        e.stopPropagation();
        window.LayerManager.setLocked(layer.type, layer.id, !eff.locked);
        if (window.AppCoordinator) {
          window.AppCoordinator.recordHistoryDebounced();
          window.AppCoordinator.updateActiveOverlays();
          window.AppCoordinator.emit('layers:changed');
        }
      });
      actionsDiv.appendChild(btnLock);

      row.appendChild(actionsDiv);

      row.addEventListener('click', (e) => {
        if (e.shiftKey) {
          if (window.AppCoordinator) window.AppCoordinator.addToSelection(layer.type, layer.id);
        } else if (e.ctrlKey || e.metaKey) {
          if (window.AppCoordinator) window.AppCoordinator.toggleObjectSelection(layer.type, layer.id);
        } else {
          if (window.AppCoordinator) {
            window.AppCoordinator.selectObject(layer.type, layer.id, { source: 'layers_list' });
          }
        }
      });

      row.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.FloatingPropertiesEditor) {
          window.FloatingPropertiesEditor.openFor(layer.type, layer.id);
        }
      });

      container.appendChild(row);
    }
    updateLayersToolbarState();
  }

  function initLayersToolbarEvents() {
    const btnToFront = document.getElementById('btnLayerToFront');
    const btnForward = document.getElementById('btnLayerForward');
    const btnBackward = document.getElementById('btnLayerBackward');
    const btnToBack = document.getElementById('btnLayerToBack');

    if (btnToFront && !btnToFront._hasLayerEvent) {
      btnToFront._hasLayerEvent = true;
      btnToFront.addEventListener('click', () => {
        if (window.AppCoordinator) window.AppCoordinator.bringSelectionToFront();
      });
    }

    if (btnForward && !btnForward._hasLayerEvent) {
      btnForward._hasLayerEvent = true;
      btnForward.addEventListener('click', () => {
        if (window.AppCoordinator) window.AppCoordinator.bringSelectionForward();
      });
    }

    if (btnBackward && !btnBackward._hasLayerEvent) {
      btnBackward._hasLayerEvent = true;
      btnBackward.addEventListener('click', () => {
        if (window.AppCoordinator) window.AppCoordinator.sendSelectionBackward();
      });
    }

    if (btnToBack && !btnToBack._hasLayerEvent) {
      btnToBack._hasLayerEvent = true;
      btnToBack.addEventListener('click', () => {
        if (window.AppCoordinator) window.AppCoordinator.sendSelectionToBack();
      });
    }
  }

  function syncInspectorLayerSections() {
    if (!window.LayerManager || typeof window.LayerManager.getLayers !== 'function') return;
    const layers = window.LayerManager.getLayers();
    const totalLayers = layers.length;

    const sel = (window.AppCoordinator && typeof window.AppCoordinator.getActiveSelection === 'function')
      ? window.AppCoordinator.getActiveSelection()
      : { type: null, id: null };

    const sections = [
      { prefix: 'Node', type: 'node', editorId: 'nodeEditor', sectionId: 'nodeLayerSection' },
      { prefix: 'Flow', type: 'flow', editorId: 'flowEditor', sectionId: 'flowLayerSection' },
      { prefix: 'Glow', type: 'glow', editorId: 'glowEditor', sectionId: 'glowLayerSection' },
      { prefix: 'Ripple', type: 'ripple', editorId: 'rippleEditor', sectionId: 'rippleLayerSection' },
      { prefix: 'Image', type: 'image', editorId: 'imageEditor', sectionId: 'imageLayerSection' },
      { prefix: 'Group', type: 'group', editorId: 'nodeMultiSelectToolbar', sectionId: 'groupLayerSection' },
    ];

    sections.forEach(({ prefix, type, editorId, sectionId }) => {
      const sectionEl = document.getElementById(sectionId);
      if (!sectionEl) return;

      const btnFront = document.getElementById(`btn${prefix}LayerToFront`);
      const btnFwd = document.getElementById(`btn${prefix}LayerForward`);
      const btnBack = document.getElementById(`btn${prefix}LayerBackward`);
      const btnToBack = document.getElementById(`btn${prefix}LayerToBack`);
      const posLabel = document.getElementById(`${prefix.toLowerCase()}LayerPositionLabel`);
      const btnVis = document.getElementById(`btn${prefix}LayerVis`);
      const btnLock = document.getElementById(`btn${prefix}LayerLock`);

      // Determine target ID for this section
      let targetId = null;
      let isTargetActive = false;

      if (type === 'group') {
        if (sel && sel.type === 'group' && sel.id) {
          targetId = sel.id;
          isTargetActive = true;
        }
      } else {
        if (sel && sel.type === type && sel.id != null) {
          targetId = sel.id;
          isTargetActive = true;
        } else {
          if (type === 'node' && window.DiagramNodes && window.DiagramNodes.activeId != null) {
            targetId = window.DiagramNodes.activeId;
            isTargetActive = true;
          } else if (type === 'flow' && window.DataFlows && window.DataFlows.activeId != null) {
            targetId = window.DataFlows.activeId;
            isTargetActive = true;
          } else if (type === 'glow' && window.Glows && window.Glows.activeId != null) {
            targetId = window.Glows.activeId;
            isTargetActive = true;
          } else if (type === 'ripple' && window.Ripples && window.Ripples.activeId != null) {
            targetId = window.Ripples.activeId;
            isTargetActive = true;
          } else if (type === 'image' && window.ImageObjects && window.ImageObjects.activeId != null) {
            targetId = window.ImageObjects.activeId;
            isTargetActive = true;
          }
        }
      }

      if (!isTargetActive || targetId === null || totalLayers === 0) {
        if (btnFront) btnFront.disabled = true;
        if (btnFwd) btnFwd.disabled = true;
        if (btnBack) btnBack.disabled = true;
        if (btnToBack) btnToBack.disabled = true;
        if (posLabel) posLabel.textContent = 'Position: —';
        return;
      }

      let minIdx = -1;
      let maxIdx = -1;

      if (type === 'group') {
        const grp = (window.AppCoordinator && typeof window.AppCoordinator.getGroup === 'function')
          ? window.AppCoordinator.getGroup(targetId)
          : (window.ObjectGroups && typeof window.ObjectGroups.getGroup === 'function' ? window.ObjectGroups.getGroup(targetId) : null);
        if (grp && Array.isArray(grp.members) && grp.members.length > 0) {
          const memberKeys = new Set(grp.members.map((m) => `${m.type}:${m.id}`));
          layers.forEach((l, idx) => {
            if (memberKeys.has(`${l.type}:${l.id}`)) {
              if (minIdx === -1 || idx < minIdx) minIdx = idx;
              if (maxIdx === -1 || idx > maxIdx) maxIdx = idx;
            }
          });
        }
      } else {
        const strId = String(targetId);
        const idx = layers.findIndex((l) => l.type === type && String(l.id) === strId);
        if (idx !== -1) {
          minIdx = idx;
          maxIdx = idx;
        }
      }

      if (minIdx === -1) {
        if (btnFront) btnFront.disabled = true;
        if (btnFwd) btnFwd.disabled = true;
        if (btnBack) btnBack.disabled = true;
        if (btnToBack) btnToBack.disabled = true;
        if (posLabel) posLabel.textContent = 'Position: —';
      } else {
        if (posLabel) {
          if (minIdx === maxIdx) {
            posLabel.textContent = `Position: ${minIdx + 1} of ${totalLayers}`;
          } else {
            posLabel.textContent = `Position: ${minIdx + 1}–${maxIdx + 1} of ${totalLayers}`;
          }
        }

        const isAtTop = (maxIdx >= totalLayers - 1) || (totalLayers <= 1);
        const isAtBottom = (minIdx <= 0) || (totalLayers <= 1);

        if (btnFront) btnFront.disabled = isAtTop;
        if (btnFwd) btnFwd.disabled = isAtTop;
        if (btnBack) btnBack.disabled = isAtBottom;
        if (btnToBack) btnToBack.disabled = isAtBottom;
      }

      if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
        const eff = window.LayerManager.getEffective(type, targetId);
        if (eff) {
          if (btnVis) {
            btnVis.textContent = eff.visible ? '👁 Visible' : '🕶️ Hidden';
            btnVis.title = eff.visible ? `Hide ${type}` : `Show ${type}`;
            btnVis.classList.toggle('active', !eff.visible);
          }
          if (btnLock) {
            btnLock.textContent = eff.locked ? '🔒 Locked' : '🔓 Unlocked';
            btnLock.title = eff.locked ? `Unlock ${type}` : `Lock ${type}`;
            btnLock.classList.toggle('active', eff.locked);
            btnLock.classList.toggle('locked', eff.locked);
          }
        }
      }
    });
  }

  function initInspectorLayerSectionEvents() {
    const configs = [
      { prefix: 'Node', type: 'node' },
      { prefix: 'Flow', type: 'flow' },
      { prefix: 'Glow', type: 'glow' },
      { prefix: 'Ripple', type: 'ripple' },
      { prefix: 'Image', type: 'image' },
      { prefix: 'Group', type: 'group' },
    ];

    configs.forEach(({ prefix, type }) => {
      const btnFront = document.getElementById(`btn${prefix}LayerToFront`);
      const btnFwd = document.getElementById(`btn${prefix}LayerForward`);
      const btnBack = document.getElementById(`btn${prefix}LayerBackward`);
      const btnToBack = document.getElementById(`btn${prefix}LayerToBack`);
      const btnVis = document.getElementById(`btn${prefix}LayerVis`);
      const btnLock = document.getElementById(`btn${prefix}LayerLock`);

      const getTargets = () => {
        if (type === 'group') {
          const sel = window.AppCoordinator ? window.AppCoordinator.getActiveSelection() : null;
          if (sel && sel.type === 'group' && sel.id) {
            return [{ type: 'group', id: String(sel.id) }];
          }
          return null;
        }
        const sel = window.AppCoordinator ? window.AppCoordinator.getActiveSelection() : null;
        if (sel && sel.type === type && sel.id != null) {
          return [{ type: type, id: String(sel.id) }];
        }
        let modId = null;
        if (type === 'node' && window.DiagramNodes) modId = window.DiagramNodes.activeId;
        else if (type === 'flow' && window.DataFlows) modId = window.DataFlows.activeId;
        else if (type === 'glow' && window.Glows) modId = window.Glows.activeId;
        else if (type === 'ripple' && window.Ripples) modId = window.Ripples.activeId;
        else if (type === 'image' && window.ImageObjects) modId = window.ImageObjects.activeId;
        if (modId !== null && modId !== undefined) {
          return [{ type: type, id: String(modId) }];
        }
        return null;
      };

      if (btnFront && !btnFront._hasLayerEvent) {
        btnFront._hasLayerEvent = true;
        btnFront.addEventListener('click', (e) => {
          e.stopPropagation();
          const targets = getTargets();
          if (window.AppCoordinator) window.AppCoordinator.bringSelectionToFront(targets);
        });
      }

      if (btnFwd && !btnFwd._hasLayerEvent) {
        btnFwd._hasLayerEvent = true;
        btnFwd.addEventListener('click', (e) => {
          e.stopPropagation();
          const targets = getTargets();
          if (window.AppCoordinator) window.AppCoordinator.bringSelectionForward(targets);
        });
      }

      if (btnBack && !btnBack._hasLayerEvent) {
        btnBack._hasLayerEvent = true;
        btnBack.addEventListener('click', (e) => {
          e.stopPropagation();
          const targets = getTargets();
          if (window.AppCoordinator) window.AppCoordinator.sendSelectionBackward(targets);
        });
      }

      if (btnToBack && !btnToBack._hasLayerEvent) {
        btnToBack._hasLayerEvent = true;
        btnToBack.addEventListener('click', (e) => {
          e.stopPropagation();
          const targets = getTargets();
          if (window.AppCoordinator) window.AppCoordinator.sendSelectionToBack(targets);
        });
      }

      if (btnVis && !btnVis._hasLayerEvent) {
        btnVis._hasLayerEvent = true;
        btnVis.addEventListener('click', (e) => {
          e.stopPropagation();
          const targets = getTargets();
          if (!targets || targets.length === 0) return;
          const target = targets[0];
          const eff = window.LayerManager ? window.LayerManager.getEffective(target.type, target.id) : { visible: true };
          const newVis = !eff.visible;
          if (window.LayerManager) {
            window.LayerManager.setVisibility(target.type, target.id, newVis);
          }
          if (window.AppCoordinator) {
            window.AppCoordinator.requestRender();
            window.AppCoordinator.recordHistoryDebounced();
            window.AppCoordinator.updateActiveOverlays();
            window.AppCoordinator.emit('layers:changed');
          }
        });
      }

      if (btnLock && !btnLock._hasLayerEvent) {
        btnLock._hasLayerEvent = true;
        btnLock.addEventListener('click', (e) => {
          e.stopPropagation();
          const targets = getTargets();
          if (!targets || targets.length === 0) return;
          const target = targets[0];
          const eff = window.LayerManager ? window.LayerManager.getEffective(target.type, target.id) : { locked: false };
          const newLock = !eff.locked;
          if (window.LayerManager) {
            window.LayerManager.setLocked(target.type, target.id, newLock);
          }
          if (window.AppCoordinator) {
            window.AppCoordinator.recordHistoryDebounced();
            window.AppCoordinator.updateActiveOverlays();
            window.AppCoordinator.emit('layers:changed');
          }
        });
      }
    });
  }

  function syncImageEditorUI() {
    const editor = document.getElementById('imageEditor');
    if (!editor) return;

    const sel = (window.AppCoordinator && typeof window.AppCoordinator.getActiveSelection === 'function')
      ? window.AppCoordinator.getActiveSelection()
      : { type: null, id: null };

    const isImage = (sel && sel.type === 'image' && sel.id != null);
    if (!isImage) {
      editor.style.display = 'none';
      return;
    }

    const img = window.ImageObjects ? window.ImageObjects.getImage(sel.id) : null;
    if (!img) {
      editor.style.display = 'none';
      return;
    }

    editor.style.display = 'block';

    const nameIn = document.getElementById('imageNameInput');
    if (nameIn && document.activeElement !== nameIn) nameIn.value = img.name || '';

    const wSlider = document.getElementById('imageWidthSlider');
    const wNum = document.getElementById('imageWidthNum');
    if (wSlider && document.activeElement !== wSlider) wSlider.value = img.width || 200;
    if (wNum && document.activeElement !== wNum) wNum.value = img.width || 200;

    const hSlider = document.getElementById('imageHeightSlider');
    const hNum = document.getElementById('imageHeightNum');
    if (hSlider && document.activeElement !== hSlider) hSlider.value = img.height || 150;
    if (hNum && document.activeElement !== hNum) hNum.value = img.height || 150;

    const lockChk = document.getElementById('imageLockAspect');
    if (lockChk) lockChk.checked = img.maintainAspectRatio !== undefined ? !!img.maintainAspectRatio : true;

    const opSlider = document.getElementById('imageOpacitySlider');
    const opNum = document.getElementById('imageOpacityNum');
    const opacityVal = img.opacity !== undefined ? img.opacity : 1.0;
    if (opSlider && document.activeElement !== opSlider) opSlider.value = opacityVal;
    if (opNum && document.activeElement !== opNum) opNum.value = opacityVal;

    const cropStatusLabel = document.getElementById('imageCropStatusLabel');
    const btnResetCrop = document.getElementById('btnResetCropImage');
    const fctxBtnReset = document.getElementById('fctx-btnResetCrop');
    if (img.crop && img.crop.enabled && img.crop.sourceWidth > 0 && img.crop.sourceHeight > 0) {
      if (cropStatusLabel) cropStatusLabel.innerText = `Crop: ${Math.round(img.crop.sourceWidth)} \u00d7 ${Math.round(img.crop.sourceHeight)} px`;
      if (btnResetCrop) btnResetCrop.disabled = false;
      if (fctxBtnReset) fctxBtnReset.disabled = false;
    } else {
      if (cropStatusLabel) cropStatusLabel.innerText = 'Crop: Full Image';
      if (btnResetCrop) btnResetCrop.disabled = true;
      if (fctxBtnReset) fctxBtnReset.disabled = true;
    }
  }

  function initImageEditorEvents() {
    const nameIn = document.getElementById('imageNameInput');
    if (nameIn && !nameIn._hasBound) {
      nameIn._hasBound = true;
      nameIn.addEventListener('input', (e) => {
        const sel = window.AppCoordinator ? window.AppCoordinator.getActiveSelection() : null;
        if (!sel || sel.type !== 'image' || !sel.id) return;
        if (window.ImageObjects) window.ImageObjects.updateImage(sel.id, { name: e.target.value });
        if (window.EngineBridge && window.EngineBridge.isReady()) window.EngineBridge.updateImage(sel.id, { name: e.target.value });
        if (window.AppCoordinator) {
          window.AppCoordinator.requestRender();
          window.AppCoordinator.recordHistoryDebounced();
        }
        if (typeof window.renderLayersList === 'function') window.renderLayersList();
      });
    }

    const handleImageDimChange = (dim, val) => {
      const sel = window.AppCoordinator ? window.AppCoordinator.getActiveSelection() : null;
      if (!sel || sel.type !== 'image' || !sel.id || !window.ImageObjects) return;
      const img = window.ImageObjects.getImage(sel.id);
      if (!img) return;

      const patch = {};
      const numVal = Math.max(10, parseFloat(val) || 10);
      patch[dim] = numVal;

      const lockAspect = document.getElementById('imageLockAspect')?.checked;
      if (lockAspect && img.width > 0 && img.height > 0) {
        if (dim === 'width') {
          const ratio = (img.naturalHeight && img.naturalWidth)
            ? (img.naturalHeight / img.naturalWidth)
            : (img.height / img.width);
          patch.height = Math.round(numVal * ratio);
          const hSlider = document.getElementById('imageHeightSlider');
          const hNum = document.getElementById('imageHeightNum');
          if (hSlider) hSlider.value = patch.height;
          if (hNum) hNum.value = patch.height;
        } else if (dim === 'height') {
          const ratio = (img.naturalWidth && img.naturalHeight)
            ? (img.naturalWidth / img.naturalHeight)
            : (img.width / img.height);
          patch.width = Math.round(numVal * ratio);
          const wSlider = document.getElementById('imageWidthSlider');
          const wNum = document.getElementById('imageWidthNum');
          if (wSlider) wSlider.value = patch.width;
          if (wNum) wNum.value = patch.width;
        }
      }

      window.ImageObjects.updateImage(sel.id, patch);
      if (window.EngineBridge && window.EngineBridge.isReady()) window.EngineBridge.updateImage(sel.id, patch);
      if (window.AppCoordinator) {
        window.AppCoordinator.requestRender();
        window.AppCoordinator.recordHistoryDebounced();
        window.AppCoordinator.updateActiveOverlays();
      }
    };

    ['Slider', 'Num'].forEach((suffix) => {
      const wEl = document.getElementById('imageWidth' + suffix);
      if (wEl && !wEl._hasBound) {
        wEl._hasBound = true;
        wEl.addEventListener('input', (e) => {
          const other = document.getElementById(suffix === 'Slider' ? 'imageWidthNum' : 'imageWidthSlider');
          if (other) other.value = e.target.value;
          handleImageDimChange('width', e.target.value);
        });
      }

      const hEl = document.getElementById('imageHeight' + suffix);
      if (hEl && !hEl._hasBound) {
        hEl._hasBound = true;
        hEl.addEventListener('input', (e) => {
          const other = document.getElementById(suffix === 'Slider' ? 'imageHeightNum' : 'imageHeightSlider');
          if (other) other.value = e.target.value;
          handleImageDimChange('height', e.target.value);
        });
      }
    });

    const lockChk = document.getElementById('imageLockAspect');
    if (lockChk && !lockChk._hasBound) {
      lockChk._hasBound = true;
      lockChk.addEventListener('change', (e) => {
        const sel = window.AppCoordinator ? window.AppCoordinator.getActiveSelection() : null;
        if (!sel || sel.type !== 'image' || !sel.id) return;
        if (window.ImageObjects) window.ImageObjects.updateImage(sel.id, { maintainAspectRatio: e.target.checked });
        if (window.EngineBridge && window.EngineBridge.isReady()) window.EngineBridge.updateImage(sel.id, { maintainAspectRatio: e.target.checked });
      });
    }

    const handleOpacity = (val) => {
      const sel = window.AppCoordinator ? window.AppCoordinator.getActiveSelection() : null;
      if (!sel || sel.type !== 'image' || !sel.id) return;
      const parsed = Math.max(0, Math.min(1, parseFloat(val) || 0));
      const opSlider = document.getElementById('imageOpacitySlider');
      const opNum = document.getElementById('imageOpacityNum');
      if (opSlider) opSlider.value = parsed;
      if (opNum) opNum.value = parsed;
      if (window.ImageObjects) window.ImageObjects.updateImage(sel.id, { opacity: parsed });
      if (window.EngineBridge && window.EngineBridge.isReady()) window.EngineBridge.updateImage(sel.id, { opacity: parsed });
      if (window.AppCoordinator) {
        window.AppCoordinator.requestRender();
        window.AppCoordinator.recordHistoryDebounced();
      }
    };

    const opSlider = document.getElementById('imageOpacitySlider');
    if (opSlider && !opSlider._hasBound) {
      opSlider._hasBound = true;
      opSlider.addEventListener('input', (e) => handleOpacity(e.target.value));
    }

    const opNum = document.getElementById('imageOpacityNum');
    if (opNum && !opNum._hasBound) {
      opNum._hasBound = true;
      opNum.addEventListener('input', (e) => handleOpacity(e.target.value));
    }

    const btnDel = document.getElementById('btnDeleteImage');
    if (btnDel && !btnDel._hasBound) {
      btnDel._hasBound = true;
      btnDel.addEventListener('click', () => {
        const sel = window.AppCoordinator ? window.AppCoordinator.getActiveSelection() : null;
        if (!sel || sel.type !== 'image' || !sel.id) return;
        const id = sel.id;
        if (window.ImageObjects) window.ImageObjects.deleteImage(id);
        if (window.EngineBridge && window.EngineBridge.isReady()) window.EngineBridge.deleteImage(id);
        if (window.AppCoordinator) {
          window.AppCoordinator.clearSelection();
          window.AppCoordinator.requestRender();
          window.AppCoordinator.recordHistoryImmediate();
          window.AppCoordinator.updateActiveOverlays();
        }
      });
    }

    const btnCrop = document.getElementById('btnCropImage');
    if (btnCrop && !btnCrop._hasBound) {
      btnCrop._hasBound = true;
      btnCrop.addEventListener('click', () => {
        const sel = window.AppCoordinator ? window.AppCoordinator.getActiveSelection() : null;
        if (!sel || sel.type !== 'image' || !sel.id || !window.Stage) return;
        window.Stage.startCropMode(sel.id);
      });
    }

    const btnClip = document.getElementById('btnClipImage');
    if (btnClip && !btnClip._hasBound) {
      btnClip._hasBound = true;
      btnClip.addEventListener('click', () => {
        const sel = window.AppCoordinator ? window.AppCoordinator.getActiveSelection() : null;
        if (!sel || sel.type !== 'image' || !sel.id || !window.Stage) return;
        window.Stage.startClipMode(sel.id);
      });
    }

    const btnOpenTools = document.getElementById('btnOpenImageTools');
    if (btnOpenTools && !btnOpenTools._hasBound) {
      btnOpenTools._hasBound = true;
      btnOpenTools.addEventListener('click', () => {
        if (window.WorkspaceController) {
          window.WorkspaceController.showToolPanel('acc-image-tools');
        }
      });
    }

    const btnResetCrop = document.getElementById('btnResetCropImage');
    if (btnResetCrop && !btnResetCrop._hasBound) {
      btnResetCrop._hasBound = true;
      btnResetCrop.addEventListener('click', () => {
        const sel = window.AppCoordinator ? window.AppCoordinator.getActiveSelection() : null;
        if (!sel || sel.type !== 'image' || !sel.id) return;
        if (window.ImageObjects) {
          window.ImageObjects.resetCrop(sel.id);
          window.ImageObjects.resetClip(sel.id);
        }
        if (window.HistoryManager) window.HistoryManager.recordImmediate();
        if (typeof window.triggerRender === 'function') window.triggerRender();
        syncImageEditorUI();
        if (typeof window.syncImageToolsUI === 'function') window.syncImageToolsUI();
      });
    }

    const btnBake = document.getElementById('btnBakeImage');
    if (btnBake && !btnBake._hasBound) {
      btnBake._hasBound = true;
      btnBake.addEventListener('click', () => {
        const sel = window.AppCoordinator ? window.AppCoordinator.getActiveSelection() : null;
        if (!sel || sel.type !== 'image' || !sel.id || !window.ImageObjects) return;
        const img = window.ImageObjects.getImage(sel.id);
        if (img && typeof window.openBakeModal === 'function') {
          window.openBakeModal(img);
        }
      });
    }

    const btnExtractBg = document.getElementById('btnExtractBackgroundRegion');
    if (btnExtractBg && !btnExtractBg._hasBound) {
      btnExtractBg._hasBound = true;
      btnExtractBg.addEventListener('click', () => {
        if (window.Stage && typeof window.Stage.startBgExtractMode === 'function') {
          window.Stage.startBgExtractMode();
        }
      });
    }

    const btnBakeClose = document.getElementById('btnBakeModalClose');
    const btnBakeCancel = document.getElementById('btnBakeCancel');
    if (btnBakeClose && !btnBakeClose._hasBound) {
      btnBakeClose._hasBound = true;
      btnBakeClose.addEventListener('click', () => {
        if (typeof window.closeBakeModal === 'function') window.closeBakeModal();
      });
    }
    if (btnBakeCancel && !btnBakeCancel._hasBound) {
      btnBakeCancel._hasBound = true;
      btnBakeCancel.addEventListener('click', () => {
        if (typeof window.closeBakeModal === 'function') window.closeBakeModal();
      });
    }

    const btnBakeRemove = document.getElementById('btnBakeAndRemove');
    if (btnBakeRemove && !btnBakeRemove._hasBound) {
      btnBakeRemove._hasBound = true;
      btnBakeRemove.addEventListener('click', () => {
        if (window._bakeTargetImage) {
          const fn = window.executeBakeImage || (typeof executeBakeImage === 'function' ? executeBakeImage : null);
          if (typeof fn === 'function') fn(window._bakeTargetImage, 'remove');
        }
      });
    }

    const btnBakeKeep = document.getElementById('btnBakeAndKeep');
    if (btnBakeKeep && !btnBakeKeep._hasBound) {
      btnBakeKeep._hasBound = true;
      btnBakeKeep.addEventListener('click', () => {
        if (window._bakeTargetImage) {
          const fn = window.executeBakeImage || (typeof executeBakeImage === 'function' ? executeBakeImage : null);
          if (typeof fn === 'function') fn(window._bakeTargetImage, 'keep');
        }
      });
    }
  }

  window.renderLayersList = renderLayersList;
  window.updateLayersToolbarState = updateLayersToolbarState;
  window.initLayersToolbarEvents = initLayersToolbarEvents;
  window.syncInspectorLayerSections = syncInspectorLayerSections;
  window.initInspectorLayerSectionEvents = initInspectorLayerSectionEvents;
  window.syncImageEditorUI = syncImageEditorUI;
  window.initImageEditorEvents = initImageEditorEvents;
})();
