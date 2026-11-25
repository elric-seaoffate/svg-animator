/**
 * SVG Animator Studio — Stage 16F Component Builder
 *
 * Enables authoring arbitrary exposed component properties (Boolean, Choice/Enum,
 * Number, Colour, Text) that drive multiple unrelated canvas objects and animation
 * lifecycles simultaneously — with no grouping required.
 */
(function() {
  'use strict';

  const LIFECYCLE_ACTIONS = [
    { action: 'play', label: '▶ Start / Restart Animation (Play)', prop: 'play', isAnim: true, smilOk: true },
    { action: 'stop_reset', label: '⏹ Stop & Reset Animation', prop: 'play', isAnim: true, smilOk: true },
    { action: 'pause', label: '⏸ Pause Animation Mid-Cycle (Lite/Group)', prop: 'play', isAnim: true, smilOk: false },
    { action: 'resume', label: '⏯ Resume Paused Animation (Lite/Group)', prop: 'play', isAnim: true, smilOk: false },
    { action: 'enable', label: '👁️▶ Enable (Show & Start Animation)', prop: 'visibility', isAnim: true, smilOk: true },
    { action: 'disable', label: '🚫⏹ Disable (Stop & Hide Object)', prop: 'visibility', isAnim: true, smilOk: true }
  ];

  function getAllCanvasObjects() {
    const out = [];
    const liteList = (window.LiteEffects && (Array.isArray(window.LiteEffects.list) ? window.LiteEffects.list : (typeof window.LiteEffects.getAllLiteEffects === 'function' ? window.LiteEffects.getAllLiteEffects() : window.LiteEffects.items))) || [];
    if (Array.isArray(liteList)) {
      const kindMap = {
        'text-lite': 'Text Box Lite',
        'perimeter-tracer': 'Perimeter Tracer',
        'pulse': 'Pulse / Beacon',
        'flash': 'Flash / Strobe',
        'flow-lite': 'Flow Lite',
        'radar-lite': 'Radar Ping Lite',
        'gauge-lite': 'Gauge / Level Lite',
        'oscilloscope-lite': 'Oscilloscope Lite'
      };
      liteList.forEach((le) => {
        const kLabel = kindMap[le.kind] || le.kind || 'Lite';
        const disp = le.name ? `${le.name} (${kLabel} #${le.id})` : `${kLabel} #${le.id} (${le.labelText || le.variant || 'lite'})`;
        out.push({
          target: `lite-${le.id}`,
          type: 'lite',
          id: le.id,
          liteKind: le.kind || '',
          label: disp,
          isAnimated: le.kind !== 'gauge-lite' && (le.kind !== 'text-lite' || (le.textAnim && le.textAnim !== 'none'))
        });
      });
    }
    const nodeList = (window.DiagramNodes && (Array.isArray(window.DiagramNodes.list) ? window.DiagramNodes.list : (typeof window.DiagramNodes.getAllNodes === 'function' ? window.DiagramNodes.getAllNodes() : window.DiagramNodes.nodes))) || [];
    if (Array.isArray(nodeList)) {
      nodeList.forEach((n) => {
        const disp = n.name ? `${n.name} (Shape #${n.id})` : `Shape #${n.id} (${n.text || n.shape || 'node'})`;
        out.push({
          target: `node-${n.id}`,
          type: 'node',
          id: n.id,
          label: disp,
          isAnimated: Boolean(n.animation && n.animation !== 'none')
        });
      });
    }
    const flowList = (window.DataFlows && (Array.isArray(window.DataFlows.list) ? window.DataFlows.list : (typeof window.DataFlows.getAllFlows === 'function' ? window.DataFlows.getAllFlows() : window.DataFlows.flows))) || [];
    if (Array.isArray(flowList)) {
      flowList.forEach((f) => {
        const disp = f.name ? `${f.name} (DataFlow #${f.id})` : `DataFlow #${f.id}`;
        out.push({
          target: `flow-${f.id}`,
          type: 'flow',
          id: f.id,
          label: disp,
          isAnimated: true
        });
      });
    }
    const glowList = (window.Glows && (Array.isArray(window.Glows.list) ? window.Glows.list : (typeof window.Glows.getAllGlows === 'function' ? window.Glows.getAllGlows() : window.Glows.glows))) || [];
    if (Array.isArray(glowList)) {
      glowList.forEach((g) => {
        const disp = g.name ? `${g.name} (Glow #${g.id})` : `Glow #${g.id}`;
        out.push({
          target: `glow-${g.id}`,
          type: 'glow',
          id: g.id,
          label: disp,
          isAnimated: g.playback !== 'static'
        });
      });
    }
    const rippleList = (window.Ripples && (Array.isArray(window.Ripples.list) ? window.Ripples.list : (typeof window.Ripples.getAllRipples === 'function' ? window.Ripples.getAllRipples() : window.Ripples.ripples))) || [];
    if (Array.isArray(rippleList)) {
      rippleList.forEach((r) => {
        const disp = r.name ? `${r.name} (Ripple #${r.id})` : `Ripple #${r.id}`;
        out.push({
          target: `ripple-${r.id}`,
          type: 'ripple',
          id: r.id,
          label: disp,
          isAnimated: true
        });
      });
    }
    const imageList = (window.ImageObjects && (Array.isArray(window.ImageObjects.list) ? window.ImageObjects.list : (typeof window.ImageObjects.getAllImages === 'function' ? window.ImageObjects.getAllImages() : window.ImageObjects.images))) || [];
    if (Array.isArray(imageList)) {
      imageList.forEach((img) => {
        const disp = img.name ? `${img.name} (Image #${img.id})` : `Image #${img.id}`;
        out.push({
          target: `image-${img.id}`,
          type: 'image',
          id: img.id,
          label: disp,
          isAnimated: false
        });
      });
    }
    if (window.AppCoordinator && typeof window.AppCoordinator.getGroups === 'function') {
      const groups = window.AppCoordinator.getGroups() || [];
      groups.forEach((grp) => {
        const gId = String(grp.id).startsWith('group-') ? String(grp.id) : `group-${grp.id}`;
        const disp = grp.name ? `${grp.name} (Group ${gId})` : `Group ${gId}`;
        out.push({
          target: gId,
          type: 'group',
          id: gId,
          label: disp,
          isAnimated: true
        });
      });
    }
    return out;
  }

  function parseTargetKey(targetStr) {
    if (!targetStr) return { type: 'lite', id: '1' };
    if (String(targetStr).startsWith('group-')) {
      return { type: 'group', id: targetStr };
    }
    const idx = String(targetStr).indexOf('-');
    if (idx === -1) return { type: 'lite', id: targetStr };
    return {
      type: targetStr.slice(0, idx),
      id: targetStr.slice(idx + 1)
    };
  }

  function getSupportedOperationsForTarget(targetStr, propType) {
    const { type, id } = parseTargetKey(targetStr);
    const props = (typeof window.getSupportedPropertiesForMember === 'function')
      ? (window.getSupportedPropertiesForMember(type, id) || [])
      : [];
    const ops = [];
    const isStateBranchMode = (propType === 'boolean' || propType === 'enum');

    props.forEach((p) => {
      if (!isStateBranchMode) {
        // Direct pass-through mode (number, color, text): filter to compatible property types or allow explicit constant
        const isNum = (tp) => tp === 'number' || tp === 'speed';
        const compat = (p.type === propType) || (isNum(propType) && isNum(p.type)) || (isNum(propType) && p.type === 'text');
        if (!compat) return;
      }
      ops.push({
        key: `set:${p.prop}`,
        action: 'set',
        property: p.prop,
        label: `Set ${p.label} (${p.prop})`,
        valueType: p.type,
        min: p.min,
        max: p.max,
        step: p.step,
        options: p.options,
        desc: p.desc
      });
    });

    // Add animation lifecycle actions for animated object categories
    if (type !== 'image') {
      const isSmil = (type === 'node' || type === 'flow' || type === 'glow' || type === 'ripple');
      LIFECYCLE_ACTIONS.forEach((la) => {
        if (isSmil && !la.smilOk) return;
        ops.push({
          key: `act:${la.action}`,
          action: la.action,
          property: la.prop,
          label: la.label,
          valueType: 'action'
        });
      });
    }
    return ops;
  }

  function getAuthoredCanvasValue(targetStr, propName) {
    const { type, id } = parseTargetKey(targetStr);
    if (typeof window.getObjectPropValue === 'function') {
      return window.getObjectPropValue(type, id, propName);
    }
    return '';
  }

  const ComponentBuilder = {
    originalName: '',
    activeBranch: 'true',
    actionsByBranch: {
      true: [],
      false: [],
      always: []
    },
    _bound: false,

    init() {
      if (this._bound) return;
      this._bound = true;

      const openBtn = document.getElementById('btnOpenComponentBuilderModal');
      if (openBtn) {
        openBtn.addEventListener('click', () => this.open(null));
      }
      const closeBtn = document.getElementById('btnCbModalClose');
      if (closeBtn) closeBtn.addEventListener('click', () => this.close());
      const cancelBtn = document.getElementById('btnCbModalCancel');
      if (cancelBtn) cancelBtn.addEventListener('click', () => this.close());
      const newBtn = document.getElementById('btnCbModalNewProp');
      if (newBtn) newBtn.addEventListener('click', () => this.open(null));
      const quickLabelBtn = document.getElementById('btnCbModalQuickLabel');
      if (quickLabelBtn) quickLabelBtn.addEventListener('click', () => this.openQuickLabelPreset());
      const quickIconBtn = document.getElementById('btnCbModalQuickIcon');
      if (quickIconBtn) quickIconBtn.addEventListener('click', () => this.openQuickIconPreset());

      const typeSel = document.getElementById('cbModalTypeSelect');
      if (typeSel) {
        typeSel.addEventListener('change', () => {
          this._onTypeChanged();
        });
      }

      const optsIn = document.getElementById('cbModalOptionsInput');
      if (optsIn) {
        optsIn.addEventListener('change', () => {
          this._syncEnumBranches();
          this.renderBranchTabs();
          this.renderActionsList();
          this.validateForm();
        });
      }

      const nameIn = document.getElementById('cbModalNameInput');
      if (nameIn) {
        nameIn.addEventListener('input', () => {
          this.validateForm();
        });
      }

      const colorPick = document.getElementById('cbModalDefaultColorPicker');
      const defIn = document.getElementById('cbModalDefaultInput');
      if (colorPick && defIn) {
        colorPick.addEventListener('input', () => {
          defIn.value = colorPick.value;
          this.validateForm();
        });
      }

      const addActBtn = document.getElementById('btnCbAddActionRow');
      if (addActBtn) {
        addActBtn.addEventListener('click', () => {
          this.addDefaultActionToActiveBranch();
        });
      }

      const autoFalseBtn = document.getElementById('btnCbAutoFillFalseBranch');
      if (autoFalseBtn) {
        autoFalseBtn.addEventListener('click', () => {
          this.autoFillFalseBranchFromDefaults();
        });
      }

      const testBtn = document.getElementById('btnCbModalTestTrue');
      if (testBtn) {
        testBtn.addEventListener('click', () => {
          this.previewActiveBranchOnCanvas();
        });
      }

      const saveBtn = document.getElementById('btnCbModalSave');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          this.save();
        });
      }

      this.renderSection();
    },

    getComponentBuilderParameters() {
      if (!window.EngineBridge || typeof window.EngineBridge.getWidgetParameters !== 'function') {
        return [];
      }
      const all = window.EngineBridge.getWidgetParameters() || [];
      return all.filter((p) => {
        const t = (p.target || p.Target || '').toLowerCase();
        const targets = p.targets || p.Targets;
        return (!t || t === 'root' || t === 'global') && Array.isArray(targets) && targets.length > 0;
      });
    },

    renderSection() {
      const listEl = document.getElementById('componentBuilderParamsList');
      const badgeEl = document.getElementById('cbParamCountBadge');
      if (!listEl) return;

      const cbParams = this.getComponentBuilderParameters();
      if (badgeEl) badgeEl.textContent = String(cbParams.length);

      if (cbParams.length === 0) {
        listEl.innerHTML = '<div style="font-size: 0.72rem; color: #8b949e; text-align: center; padding: 6px 0; font-style: italic;">No multi-action component properties configured yet. Click <strong>+ New Component Property</strong> above.</div>';
        return;
      }

      listEl.innerHTML = '';
      cbParams.forEach((param) => {
        const card = document.createElement('div');
        card.className = 'cb-param-card';
        card.dataset.name = param.name;
        card.style.cssText = 'background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 7px 8px; display: flex; flex-direction: column; gap: 5px; font-size: 0.74rem;';

        const hdr = document.createElement('div');
        hdr.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 6px;';

        const trigVal = (param.eventTrigger || '').trim();
        const hoverBadge = trigVal
          ? `<span style="font-size:0.65rem; background:rgba(56,139,253,0.16); color:#79c0ff; padding:1px 4px; border-radius:3px;" title="Automatically triggers on browser event: ${trigVal}">🖱️ ${trigVal}</span>`
          : '';
        hdr.innerHTML = `
          <div style="display:flex; align-items:center; gap:5px; min-width:0; flex:1; flex-wrap:wrap;">
            <code style="color:#7ee787; background:rgba(63,185,80,0.14); padding:1px 5px; border-radius:3px; font-weight:600;">${param.name}</code>
            <span style="color:#8b949e; font-size:0.68rem;">(${param.type})</span>
            ${hoverBadge}
          </div>
        `;

        const btns = document.createElement('div');
        btns.style.cssText = 'display:flex; align-items:center; gap:4px;';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn-cb-edit';
        editBtn.style.cssText = 'background:#21262d; border:1px solid #30363d; color:#58a6ff; font-size:0.68rem; padding:2px 6px; border-radius:3px; cursor:pointer;';
        editBtn.textContent = '✏️ Edit';
        editBtn.addEventListener('click', () => this.open(param));

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn-cb-delete';
        delBtn.style.cssText = 'background:#21262d; border:1px solid #da3633; color:#f85149; font-size:0.68rem; padding:2px 6px; border-radius:3px; cursor:pointer;';
        delBtn.textContent = '✕';
        delBtn.title = `Delete component property "${param.name}"`;
        delBtn.addEventListener('click', () => {
          if (window.EngineBridge && typeof window.EngineBridge.removeWidgetParameter === 'function') {
            window.EngineBridge.removeWidgetParameter(param.name);
            if (window.AppCoordinator) {
              window.AppCoordinator.recordHistoryImmediate();
              window.AppCoordinator.showNotification(`Removed component property '${param.name}'`, 'info');
            }
            if (typeof window.renderWidgetParametersOverview === 'function') {
              window.renderWidgetParametersOverview();
            } else {
              this.renderSection();
            }
          }
        });

        btns.appendChild(editBtn);
        btns.appendChild(delBtn);
        hdr.appendChild(btns);
        card.appendChild(hdr);

        const targets = Array.isArray(param.targets) ? param.targets : [];
        const summaryRow = document.createElement('div');
        summaryRow.style.cssText = 'font-size:0.69rem; color:#8b949e; display:flex; justify-content:space-between; align-items:center; gap:6px;';
        summaryRow.innerHTML = `<span>🎯 ${targets.length} action(s) across canvas objects</span><span>Default: <strong style="color:#c9d1d9;">${String(param.default)}</strong></span>`;
        card.appendChild(summaryRow);

        // Quick live preview control inside Component Builder card
        const prevRow = document.createElement('div');
        prevRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:6px; padding-top:4px; border-top:1px dashed #21262d;';
        const prevLbl = document.createElement('span');
        prevLbl.style.cssText = 'font-size:0.69rem; color:#79c0ff; font-weight:600;';
        prevLbl.textContent = 'Live Test:';
        prevRow.appendChild(prevLbl);

        if (param.type === 'boolean') {
          const toggleWrap = document.createElement('div');
          toggleWrap.style.cssText = 'display:flex; gap:4px;';
          const btnTrue = document.createElement('button');
          btnTrue.type = 'button';
          btnTrue.className = 'btn-cb-test-true';
          btnTrue.style.cssText = 'background:#238636; border:1px solid #3fb950; color:#fff; font-size:0.67rem; padding:2px 8px; border-radius:3px; cursor:pointer; font-weight:600;';
          btnTrue.textContent = 'TRUE';
          btnTrue.addEventListener('click', () => this.applyParameterToStudioCanvas(param, true));

          const btnFalse = document.createElement('button');
          btnFalse.type = 'button';
          btnFalse.className = 'btn-cb-test-false';
          btnFalse.style.cssText = 'background:#21262d; border:1px solid #30363d; color:#c9d1d9; font-size:0.67rem; padding:2px 8px; border-radius:3px; cursor:pointer; font-weight:600;';
          btnFalse.textContent = 'FALSE';
          btnFalse.addEventListener('click', () => this.applyParameterToStudioCanvas(param, false));

          toggleWrap.appendChild(btnTrue);
          toggleWrap.appendChild(btnFalse);
          prevRow.appendChild(toggleWrap);
        } else if (param.type === 'enum' && Array.isArray(param.options)) {
          const sel = document.createElement('select');
          sel.style.cssText = 'background:#161b22; border:1px solid #30363d; color:#e6edf3; font-size:0.69rem; padding:2px 5px; border-radius:3px;';
          param.options.forEach((o) => {
            const opt = document.createElement('option');
            opt.value = o;
            opt.textContent = o;
            if (String(param.default) === o) opt.selected = true;
            sel.appendChild(opt);
          });
          sel.addEventListener('change', () => this.applyParameterToStudioCanvas(param, sel.value));
          prevRow.appendChild(sel);
        } else {
          const inp = document.createElement('input');
          inp.type = param.type === 'color' ? 'color' : (param.type === 'number' ? 'number' : 'text');
          inp.value = param.default !== undefined ? String(param.default) : '';
          inp.style.cssText = 'background:#161b22; border:1px solid #30363d; color:#e6edf3; font-size:0.69rem; padding:2px 5px; border-radius:3px; width:95px;';
          inp.addEventListener('input', () => {
            const v = param.type === 'number' ? parseFloat(inp.value) : inp.value;
            this.applyParameterToStudioCanvas(param, v);
          });
          prevRow.appendChild(inp);
        }

        card.appendChild(prevRow);
        listEl.appendChild(card);
      });
    },

    applyParameterToStudioCanvas(param, val) {
      const svgContainer = document.getElementById('svgContainer');
      if (!svgContainer) return;
      const svgEl = svgContainer.querySelector('svg');
      if (!svgEl || !window.SVGWidget) return;
      const targets = Array.isArray(param.targets) ? param.targets : [];
      targets.forEach((tb) => {
        const mTarget = tb.target || tb.Target;
        const mProp = tb.property || tb.Property || '';
        const mWhen = (tb.when !== undefined ? tb.when : tb.When) || '';
        const mAction = (tb.action !== undefined ? tb.action : tb.Action) || '';
        const mHasVal = tb.value !== undefined || tb.Value !== undefined;
        const mVal = tb.value !== undefined ? tb.value : tb.Value;
        const normWhen = String(mWhen).trim();
        if (normWhen && normWhen.toLowerCase() !== 'always' && normWhen !== String(val)) {
          return;
        }
        const memberEl = (typeof window.SVGWidget.resolveTargetElement === 'function')
          ? window.SVGWidget.resolveTargetElement(svgEl, null, mTarget)
          : svgEl.querySelector(`[data-semantic-target="${mTarget}"], [id="${mTarget}"]`);
        if (!memberEl) return;
        const act = String(mAction).trim().toLowerCase();
        if (act && act !== 'set' && typeof window.SVGWidget.applyLifecycleAction === 'function') {
          window.SVGWidget.applyLifecycleAction(memberEl, svgEl, act, false, null);
          return;
        }
        if (typeof window.SVGWidget.applyPropertyToElement === 'function') {
          const effVal = (mHasVal && mVal !== null) ? mVal : val;
          const targetVal = ((mProp === 'text' || mProp === 'textContent') && typeof effVal !== 'string') ? String(effVal) : effVal;
          window.SVGWidget.applyPropertyToElement(memberEl, mProp, targetVal, Object.assign({}, param, { target: mTarget, property: mProp }), null);
        }
      });
    },

    open(existingParam = null) {
      this.init();
      const modal = document.getElementById('componentBuilderModal');
      if (!modal) return;

      const nameIn = document.getElementById('cbModalNameInput');
      const labelIn = document.getElementById('cbModalLabelInput');
      const typeSel = document.getElementById('cbModalTypeSelect');
      const boolDefSel = document.getElementById('cbModalDefaultBoolSelect');
      const colorPick = document.getElementById('cbModalDefaultColorPicker');
      const defIn = document.getElementById('cbModalDefaultInput');
      const descIn = document.getElementById('cbModalDescInput');
      const hoverChk = document.getElementById('cbModalHoverTriggerChk');
      const trigSel = document.getElementById('cbModalEventTriggerSelect');
      const minIn = document.getElementById('cbModalMinInput');
      const maxIn = document.getElementById('cbModalMaxInput');
      const unitIn = document.getElementById('cbModalUnitInput');
      const optsIn = document.getElementById('cbModalOptionsInput');
      const titleEl = document.getElementById('cbModalTitle');

      this.actionsByBranch = { true: [], false: [], always: [] };

      if (existingParam && existingParam.name) {
        this.originalName = existingParam.name;
        if (titleEl) titleEl.textContent = `✏️ Edit Component Property ("${existingParam.name}")`;
        if (nameIn) nameIn.value = existingParam.name;
        if (labelIn) labelIn.value = existingParam.label || existingParam.name;
        const pType = existingParam.type || 'boolean';
        if (typeSel) typeSel.value = pType;
        if (descIn) descIn.value = existingParam.description || '';
        if (hoverChk) hoverChk.checked = (existingParam.eventTrigger === 'hover');
        if (trigSel) trigSel.value = existingParam.eventTrigger || '';
        if (minIn) minIn.value = existingParam.min !== undefined ? existingParam.min : 0;
        if (maxIn) maxIn.value = existingParam.max !== undefined ? existingParam.max : 100;
        if (unitIn) unitIn.value = existingParam.unit || '';
        if (optsIn && Array.isArray(existingParam.options) && existingParam.options.length > 0) {
          optsIn.value = existingParam.options.join(', ');
        }
        if (pType === 'boolean') {
          if (boolDefSel) boolDefSel.value = existingParam.default === true || existingParam.default === 'true' ? 'true' : 'false';
        } else if (pType === 'color') {
          const cVal = (typeof existingParam.default === 'string' && existingParam.default.startsWith('#')) ? existingParam.default : '#38bdf8';
          if (colorPick) colorPick.value = cVal;
          if (defIn) defIn.value = cVal;
        } else {
          if (defIn) defIn.value = existingParam.default !== undefined ? String(existingParam.default) : '';
        }

        this._syncEnumBranches();
        const rawTargets = Array.isArray(existingParam.targets) ? existingParam.targets : [];
        rawTargets.forEach((tb) => {
          const w = (tb.when !== undefined ? tb.when : tb.When) || (pType === 'boolean' ? 'true' : (pType === 'enum' ? (existingParam.options && existingParam.options[0]) || 'normal' : 'always'));
          const act = (tb.action !== undefined ? tb.action : tb.Action) || 'set';
          const prop = (tb.property !== undefined ? tb.property : tb.Property) || '';
          const tgt = (tb.target !== undefined ? tb.target : tb.Target) || '';
          const val = tb.value !== undefined ? tb.value : tb.Value;
          if (!this.actionsByBranch[w]) this.actionsByBranch[w] = [];
          this.actionsByBranch[w].push({
            target: tgt,
            action: act,
            property: prop,
            value: val
          });
        });

        if (pType === 'boolean') {
          this.activeBranch = 'true';
        } else if (pType === 'enum') {
          const opts = this._getEnumOptions();
          this.activeBranch = opts[0] || 'normal';
        } else {
          this.activeBranch = 'always';
        }
      } else {
        this.originalName = '';
        if (titleEl) titleEl.textContent = '⚡ Component Builder — New Multi-Action Property';
        if (nameIn) nameIn.value = 'MouseOver';
        if (labelIn) labelIn.value = 'Mouse Over State';
        if (typeSel) typeSel.value = 'boolean';
        if (boolDefSel) boolDefSel.value = 'false';
        if (colorPick) colorPick.value = '#38bdf8';
        if (defIn) defIn.value = 'false';
        if (descIn) descIn.value = 'Controls multiple object colours and animations from one exposed property';
        if (hoverChk) hoverChk.checked = false;
        if (trigSel) trigSel.value = '';
        if (minIn) minIn.value = '0';
        if (maxIn) maxIn.value = '100';
        if (unitIn) unitIn.value = '';
        if (optsIn) optsIn.value = 'normal, warning, critical';
        this.activeBranch = 'true';

        // Seed helpful initial actions from current canvas objects if available
        const objs = getAllCanvasObjects();
        if (objs.length > 0) {
          const textLiteObj = objs.find((o) => o.type === 'lite' && o.liteKind === 'text-lite');
          const animObj = objs.find((o) => o.isAnimated && (!textLiteObj || o.target !== textLiteObj.target)) || objs.find((o) => o.isAnimated);
          const otherObj = objs.find((o) => (!textLiteObj || o.target !== textLiteObj.target) && (!animObj || o.target !== animObj.target));

          if (textLiteObj) {
            this.actionsByBranch.true.push({
              target: textLiteObj.target,
              action: 'set',
              property: 'color',
              value: '#38bdf8'
            });
          } else {
            const first = objs[0];
            const firstProp = first.type === 'node' ? 'fill' : 'color';
            this.actionsByBranch.true.push({
              target: first.target,
              action: 'set',
              property: firstProp,
              value: '#38bdf8'
            });
          }
          if (otherObj) {
            const oProp = otherObj.type === 'node' ? 'fill' : 'color';
            this.actionsByBranch.true.push({
              target: otherObj.target,
              action: 'set',
              property: oProp,
              value: '#2563eb'
            });
          }
          if (animObj) {
            this.actionsByBranch.true.push({
              target: animObj.target,
              action: 'play',
              property: 'play',
              value: true
            });
          }
          this.autoFillFalseBranchFromDefaults(true);
        }
      }

      this._syncTypeControlsVisibility();
      this.renderBranchTabs();
      this.renderActionsList();
      this.validateForm();
      modal.style.display = 'flex';
    },

    close() {
      const modal = document.getElementById('componentBuilderModal');
      if (modal) modal.style.display = 'none';
      if (window.WidgetExportDialog && window.WidgetExportDialog._pausedForEdit && typeof window.WidgetExportDialog.resumeFromComponentBuilder === 'function') {
        window.WidgetExportDialog.resumeFromComponentBuilder();
      }
    },

    openQuickLabelPreset(targetId) {
      const objs = getAllCanvasObjects();
      const textObj = (targetId && objs.find((o) => o.target === targetId)) ||
        objs.find((o) => o.type === 'lite' && o.liteKind === 'text-lite') ||
        objs.find((o) => o.type === 'node');
      if (!textObj) {
        if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
          window.AppCoordinator.showNotification('Add a Text Box Lite or Shape to the canvas first to expose a Label property.', 'warning');
        }
        return;
      }
      const curText = getAuthoredCanvasValue(textObj.target, 'text') || 'Button Label';
      this.open({
        name: 'Label',
        label: 'Component Text Label',
        type: 'text',
        target: 'root',
        property: 'text',
        default: String(curText),
        description: 'Displayed text label for reusable component instances',
        targets: [
          { target: textObj.target, property: 'text', when: 'always', action: 'set', value: null }
        ]
      });
      this.originalName = '';
    },

    openQuickIconPreset(targetId) {
      const objs = getAllCanvasObjects();
      const imgObj = (targetId && objs.find((o) => o.target === targetId)) ||
        objs.find((o) => o.type === 'image');
      if (!imgObj) {
        if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
          window.AppCoordinator.showNotification('Import an Image object onto the canvas first to expose an Icon property.', 'warning');
        }
        return;
      }
      const curSrc = getAuthoredCanvasValue(imgObj.target, 'src') || '';
      this.open({
        name: 'Icon',
        label: 'Component Icon / Image Source',
        type: 'text',
        target: 'root',
        property: 'src',
        default: String(curSrc),
        description: 'Image or icon source (URL or data:image/... URI) for reusable component instances',
        targets: [
          { target: imgObj.target, property: 'src', when: 'always', action: 'set', value: null }
        ]
      });
      this.originalName = '';
    },

    _getEnumOptions() {
      const optsIn = document.getElementById('cbModalOptionsInput');
      const raw = (optsIn && optsIn.value) || 'normal, warning, critical';
      const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
      return list.length >= 2 ? list : ['normal', 'active'];
    },

    _syncEnumBranches() {
      const opts = this._getEnumOptions();
      opts.forEach((o) => {
        if (!Array.isArray(this.actionsByBranch[o])) {
          this.actionsByBranch[o] = [];
        }
      });
    },

    _onTypeChanged() {
      const typeSel = document.getElementById('cbModalTypeSelect');
      const pType = (typeSel && typeSel.value) || 'boolean';
      const defIn = document.getElementById('cbModalDefaultInput');
      const colorPick = document.getElementById('cbModalDefaultColorPicker');
      if (pType === 'boolean') {
        this.activeBranch = 'true';
        if (!this.actionsByBranch.true) this.actionsByBranch.true = [];
        if (!this.actionsByBranch.false) this.actionsByBranch.false = [];
      } else if (pType === 'enum') {
        this._syncEnumBranches();
        const opts = this._getEnumOptions();
        this.activeBranch = opts[0];
        if (defIn) defIn.value = opts[0];
      } else {
        this.activeBranch = 'always';
        if (!this.actionsByBranch.always) this.actionsByBranch.always = [];
        if (pType === 'number' && defIn) defIn.value = '50';
        else if (pType === 'color') {
          if (colorPick) colorPick.value = '#38bdf8';
          if (defIn) defIn.value = '#38bdf8';
        } else if (pType === 'text' && defIn) {
          defIn.value = 'Ready';
        }
      }
      this._syncTypeControlsVisibility();
      this.renderBranchTabs();
      this.renderActionsList();
      this.validateForm();
    },

    _syncTypeControlsVisibility() {
      const typeSel = document.getElementById('cbModalTypeSelect');
      const pType = (typeSel && typeSel.value) || 'boolean';
      const boolDefSel = document.getElementById('cbModalDefaultBoolSelect');
      const colorPick = document.getElementById('cbModalDefaultColorPicker');
      const defIn = document.getElementById('cbModalDefaultInput');
      const hoverWrap = document.getElementById('cbModalHoverTriggerWrap');
      const numWrap = document.getElementById('cbModalNumericConstraintsWrap');
      const enumWrap = document.getElementById('cbModalEnumOptionsWrap');
      const autoFalseBtn = document.getElementById('btnCbAutoFillFalseBranch');

      if (boolDefSel) boolDefSel.style.display = pType === 'boolean' ? 'block' : 'none';
      if (colorPick) colorPick.style.display = pType === 'color' ? 'block' : 'none';
      if (defIn) defIn.style.display = pType === 'boolean' ? 'none' : 'block';
      if (hoverWrap) hoverWrap.style.display = pType === 'boolean' ? 'block' : 'none';
      if (numWrap) numWrap.style.display = pType === 'number' ? 'grid' : 'none';
      if (enumWrap) enumWrap.style.display = pType === 'enum' ? 'block' : 'none';
      if (autoFalseBtn) autoFalseBtn.style.display = pType === 'boolean' ? 'inline-block' : 'none';
    },

    renderBranchTabs() {
      const tabsEl = document.getElementById('cbModalBranchTabs');
      if (!tabsEl) return;
      tabsEl.innerHTML = '';

      const typeSel = document.getElementById('cbModalTypeSelect');
      const pType = (typeSel && typeSel.value) || 'boolean';

      let branches = [];
      if (pType === 'boolean') {
        branches = [
          { key: 'true', label: `🟢 When TRUE (${(this.actionsByBranch.true || []).length} actions)` },
          { key: 'false', label: `⚪ When FALSE (${(this.actionsByBranch.false || []).length} actions)` }
        ];
      } else if (pType === 'enum') {
        const opts = this._getEnumOptions();
        branches = opts.map((o) => ({
          key: o,
          label: `🏷️ When "${o}" (${(this.actionsByBranch[o] || []).length})`
        }));
      } else {
        branches = [
          { key: 'always', label: `🎯 Multi-Target Actions (${(this.actionsByBranch.always || []).length} actions)` }
        ];
      }

      branches.forEach((b) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cb-branch-tab-btn';
        btn.dataset.branch = b.key;
        const isAct = (this.activeBranch === b.key);
        btn.style.cssText = isAct
          ? 'background: #1f6feb; border: 1px solid #58a6ff; color: #ffffff; font-size: 0.76rem; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 700;'
          : 'background: #0d1117; border: 1px solid #30363d; color: #8b949e; font-size: 0.75rem; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600;';
        btn.textContent = b.label;
        btn.addEventListener('click', () => {
          this.activeBranch = b.key;
          this.renderBranchTabs();
          this.renderActionsList();
        });
        tabsEl.appendChild(btn);
      });
    },

    addDefaultActionToActiveBranch() {
      const objs = getAllCanvasObjects();
      if (objs.length === 0) {
        this.validateForm('Add at least one object (Shape, Low-Load Effect, Flow, Glow, Ripple, or Group) to the canvas first.');
        return;
      }
      const typeSel = document.getElementById('cbModalTypeSelect');
      const pType = (typeSel && typeSel.value) || 'boolean';
      const firstObj = objs[0];
      const ops = getSupportedOperationsForTarget(firstObj.target, pType);
      const firstOp = ops[0] || { action: 'set', property: 'color', valueType: 'color' };

      let defaultVal = getAuthoredCanvasValue(firstObj.target, firstOp.property);
      if (pType !== 'boolean' && pType !== 'enum') {
        defaultVal = null; // pass incoming parameter value by default for number/color/text
      } else if (firstOp.action && firstOp.action !== 'set') {
        defaultVal = undefined;
      } else if (firstOp.valueType === 'color' && (!defaultVal || !String(defaultVal).startsWith('#'))) {
        defaultVal = '#38bdf8';
      }

      if (!Array.isArray(this.actionsByBranch[this.activeBranch])) {
        this.actionsByBranch[this.activeBranch] = [];
      }
      this.actionsByBranch[this.activeBranch].push({
        target: firstObj.target,
        action: firstOp.action || 'set',
        property: firstOp.property || 'color',
        value: defaultVal
      });
      this.renderBranchTabs();
      this.renderActionsList();
      this.validateForm();
    },

    autoFillFalseBranchFromDefaults(silent = false) {
      const trueActions = Array.isArray(this.actionsByBranch.true) ? this.actionsByBranch.true : [];
      if (trueActions.length === 0) {
        if (!silent) {
          this.validateForm('Add one or more actions under "When TRUE" first so "When FALSE" can auto-populate their inverse/authored defaults.');
        }
        return;
      }
      const falseActions = [];
      trueActions.forEach((ta) => {
        const act = (ta.action || 'set').toLowerCase();
        if (act === 'play') {
          falseActions.push({
            target: ta.target,
            action: 'stop_reset',
            property: 'play'
          });
        } else if (act === 'stop_reset') {
          falseActions.push({
            target: ta.target,
            action: 'play',
            property: 'play'
          });
        } else if (act === 'pause') {
          falseActions.push({
            target: ta.target,
            action: 'resume',
            property: 'play'
          });
        } else if (act === 'resume') {
          falseActions.push({
            target: ta.target,
            action: 'pause',
            property: 'play'
          });
        } else if (act === 'enable') {
          falseActions.push({
            target: ta.target,
            action: 'disable',
            property: 'visibility'
          });
        } else if (act === 'disable') {
          falseActions.push({
            target: ta.target,
            action: 'enable',
            property: 'visibility'
          });
        } else if (ta.property === 'visibility') {
          const isTrueVis = ta.value !== false && ta.value !== 'false';
          falseActions.push({
            target: ta.target,
            action: 'set',
            property: 'visibility',
            value: !isTrueVis
          });
        } else if (ta.property === 'play') {
          const isTruePlay = ta.value !== false && ta.value !== 'false';
          falseActions.push({
            target: ta.target,
            action: 'set',
            property: 'play',
            value: !isTruePlay
          });
        } else {
          let authoredVal = getAuthoredCanvasValue(ta.target, ta.property);
          if (authoredVal === undefined || authoredVal === null || authoredVal === '') {
            authoredVal = '#f8fafc';
          }
          falseActions.push({
            target: ta.target,
            action: 'set',
            property: ta.property,
            value: authoredVal
          });
        }
      });

      this.actionsByBranch.false = falseActions;
      this.renderBranchTabs();
      if (this.activeBranch === 'false') {
        this.renderActionsList();
      }
      this.validateForm();
      if (!silent && window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        window.AppCoordinator.showNotification(`Auto-populated ${falseActions.length} "When FALSE" restore action(s) from canvas defaults`, 'success');
      }
    },

    renderActionsList() {
      const container = document.getElementById('cbModalActionsList');
      if (!container) return;
      container.innerHTML = '';

      const typeSel = document.getElementById('cbModalTypeSelect');
      const pType = (typeSel && typeSel.value) || 'boolean';
      const isStateBranchMode = (pType === 'boolean' || pType === 'enum');

      const actions = Array.isArray(this.actionsByBranch[this.activeBranch])
        ? this.actionsByBranch[this.activeBranch]
        : [];
      const objs = getAllCanvasObjects();

      if (actions.length === 0) {
        container.innerHTML = `<div style="padding: 16px; text-align: center; color: #8b949e; border: 1px dashed #30363d; border-radius: 6px; font-size: 0.76rem;">No actions configured for this branch yet. Click <strong>+ Add Target Action</strong> above to add one.</div>`;
        return;
      }

      actions.forEach((actItem, idx) => {
        const row = document.createElement('div');
        row.className = 'cb-action-row';
        row.dataset.index = String(idx);
        row.style.cssText = 'display: grid; grid-template-columns: 28px 1.25fr 1.35fr 1.1fr 78px; gap: 8px; align-items: center; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 7px 9px;';

        // 1. Order index badge
        const numBadge = document.createElement('span');
        numBadge.style.cssText = 'font-size: 0.72rem; font-weight: 700; color: #58a6ff; text-align: center; background: rgba(56,139,253,0.12); padding: 3px 0; border-radius: 4px;';
        numBadge.textContent = `#${idx + 1}`;
        row.appendChild(numBadge);

        // 2. Target Object Selector
        const tgtSel = document.createElement('select');
        tgtSel.className = 'cb-row-target-sel';
        tgtSel.style.cssText = 'width: 100%; padding: 5px 7px; background: #161b22; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; font-size: 0.75rem;';
        objs.forEach((o) => {
          const opt = document.createElement('option');
          opt.value = o.target;
          opt.textContent = o.label;
          if (o.target === actItem.target) opt.selected = true;
          tgtSel.appendChild(opt);
        });
        if (!objs.some((o) => o.target === actItem.target) && actItem.target) {
          const missingOpt = document.createElement('option');
          missingOpt.value = actItem.target;
          missingOpt.textContent = `⚠️ ${actItem.target} (missing)`;
          missingOpt.selected = true;
          tgtSel.appendChild(missingOpt);
        }
        row.appendChild(tgtSel);

        // 3. Operation / Property Selector
        const opSel = document.createElement('select');
        opSel.className = 'cb-row-op-sel';
        opSel.style.cssText = 'width: 100%; padding: 5px 7px; background: #161b22; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; font-size: 0.75rem;';
        const ops = getSupportedOperationsForTarget(actItem.target, pType);
        const curOpKey = (actItem.action && actItem.action !== 'set')
          ? `act:${actItem.action}`
          : `set:${actItem.property}`;
        ops.forEach((op) => {
          const opt = document.createElement('option');
          opt.value = op.key;
          opt.textContent = op.label;
          if (op.key === curOpKey) opt.selected = true;
          opSel.appendChild(opt);
        });
        row.appendChild(opSel);

        // 4. Value Input Cell
        const valCell = document.createElement('div');
        valCell.style.cssText = 'display: flex; align-items: center; gap: 5px;';
        const activeOp = ops.find((op) => op.key === opSel.value) || ops[0] || { action: 'set', property: actItem.property, valueType: 'text' };

        if (activeOp.action && activeOp.action !== 'set') {
          const badge = document.createElement('span');
          badge.style.cssText = 'font-size: 0.71rem; color: #7ee787; background: rgba(63,185,80,0.12); padding: 4px 8px; border-radius: 4px; width: 100%; text-align: center;';
          badge.textContent = `⚡ Lifecycle: ${activeOp.action}`;
          valCell.appendChild(badge);
        } else if (!isStateBranchMode && (actItem.value === null || actItem.value === undefined)) {
          const passWrap = document.createElement('div');
          passWrap.style.cssText = 'display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 4px;';
          const passSpan = document.createElement('span');
          passSpan.style.cssText = 'font-size: 0.71rem; color: #79c0ff; background: rgba(56,139,253,0.12); padding: 4px 7px; border-radius: 4px; flex: 1;';
          passSpan.textContent = '⇥ Pass Incoming Value';
          const customBtn = document.createElement('button');
          customBtn.type = 'button';
          customBtn.style.cssText = 'background: #21262d; border: 1px solid #30363d; color: #8b949e; font-size: 0.66rem; padding: 3px 5px; border-radius: 3px; cursor: pointer;';
          customBtn.textContent = 'Fixed';
          customBtn.title = 'Override with a fixed constant value instead of passing incoming value';
          customBtn.addEventListener('click', () => {
            actItem.value = getAuthoredCanvasValue(actItem.target, activeOp.property);
            this.renderActionsList();
            this.validateForm();
          });
          passWrap.appendChild(passSpan);
          passWrap.appendChild(customBtn);
          valCell.appendChild(passWrap);
        } else if (activeOp.valueType === 'color') {
          const cPick = document.createElement('input');
          cPick.type = 'color';
          const cStr = (typeof actItem.value === 'string' && actItem.value.startsWith('#')) ? actItem.value : '#38bdf8';
          cPick.value = cStr;
          cPick.style.cssText = 'width: 30px; height: 26px; padding: 0; border: 1px solid #30363d; background: transparent; border-radius: 4px; cursor: pointer;';
          const cHex = document.createElement('input');
          cHex.type = 'text';
          cHex.className = 'cb-row-val-input';
          cHex.value = cStr;
          cHex.style.cssText = 'flex: 1; width: 65px; padding: 4px 6px; background: #161b22; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; font-size: 0.74rem; font-family: ui-monospace, monospace;';
          cPick.addEventListener('input', () => {
            cHex.value = cPick.value;
            actItem.value = cPick.value;
            this.validateForm();
          });
          cHex.addEventListener('input', () => {
            actItem.value = cHex.value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(actItem.value)) cPick.value = actItem.value;
            this.validateForm();
          });
          valCell.appendChild(cPick);
          valCell.appendChild(cHex);
        } else if (activeOp.valueType === 'boolean') {
          const bSel = document.createElement('select');
          bSel.className = 'cb-row-val-input';
          bSel.style.cssText = 'width: 100%; padding: 5px 7px; background: #161b22; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; font-size: 0.75rem;';
          const isTrue = actItem.value === true || actItem.value === 'true';
          bSel.innerHTML = `<option value="true" ${isTrue ? 'selected' : ''}>true</option><option value="false" ${!isTrue ? 'selected' : ''}>false</option>`;
          bSel.addEventListener('change', () => {
            actItem.value = (bSel.value === 'true');
            this.validateForm();
          });
          actItem.value = isTrue;
          valCell.appendChild(bSel);
        } else if (activeOp.valueType === 'enum' && Array.isArray(activeOp.options)) {
          const eSel = document.createElement('select');
          eSel.className = 'cb-row-val-input';
          eSel.style.cssText = 'width: 100%; padding: 5px 7px; background: #161b22; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; font-size: 0.75rem;';
          activeOp.options.forEach((o) => {
            const opt = document.createElement('option');
            opt.value = o;
            opt.textContent = o;
            if (String(actItem.value) === o) opt.selected = true;
            eSel.appendChild(opt);
          });
          eSel.addEventListener('change', () => {
            actItem.value = eSel.value;
            this.validateForm();
          });
          actItem.value = eSel.value;
          valCell.appendChild(eSel);
        } else {
          const vIn = document.createElement('input');
          vIn.className = 'cb-row-val-input';
          const isNum = activeOp.valueType === 'number' || activeOp.valueType === 'speed';
          vIn.type = isNum ? 'number' : 'text';
          if (isNum) {
            if (activeOp.min !== undefined) vIn.min = String(activeOp.min);
            if (activeOp.max !== undefined) vIn.max = String(activeOp.max);
            vIn.step = activeOp.step !== undefined ? String(activeOp.step) : 'any';
          }
          vIn.value = actItem.value !== undefined && actItem.value !== null ? String(actItem.value) : '';
          vIn.style.cssText = 'width: 100%; padding: 5px 7px; background: #161b22; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; font-size: 0.75rem;';
          vIn.addEventListener('input', () => {
            actItem.value = isNum ? parseFloat(vIn.value) : vIn.value;
            this.validateForm();
          });
          valCell.appendChild(vIn);
        }
        row.appendChild(valCell);

        // 5. Reorder Up / Down & Delete Buttons
        const ctrlWrap = document.createElement('div');
        ctrlWrap.style.cssText = 'display: flex; align-items: center; justify-content: flex-end; gap: 3px;';

        const upBtn = document.createElement('button');
        upBtn.type = 'button';
        upBtn.style.cssText = 'background: #21262d; border: 1px solid #30363d; color: #c9d1d9; font-size: 0.7rem; padding: 3px 5px; border-radius: 3px; cursor: pointer;';
        upBtn.textContent = '↑';
        upBtn.disabled = idx === 0;
        upBtn.addEventListener('click', () => {
          if (idx > 0) {
            const tmp = actions[idx - 1];
            actions[idx - 1] = actions[idx];
            actions[idx] = tmp;
            this.renderActionsList();
            this.validateForm();
          }
        });

        const dnBtn = document.createElement('button');
        dnBtn.type = 'button';
        dnBtn.style.cssText = 'background: #21262d; border: 1px solid #30363d; color: #c9d1d9; font-size: 0.7rem; padding: 3px 5px; border-radius: 3px; cursor: pointer;';
        dnBtn.textContent = '↓';
        dnBtn.disabled = idx === actions.length - 1;
        dnBtn.addEventListener('click', () => {
          if (idx < actions.length - 1) {
            const tmp = actions[idx + 1];
            actions[idx + 1] = actions[idx];
            actions[idx] = tmp;
            this.renderActionsList();
            this.validateForm();
          }
        });

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'cb-row-del-btn';
        delBtn.style.cssText = 'background: #21262d; border: 1px solid #da3633; color: #f85149; font-size: 0.7rem; padding: 3px 6px; border-radius: 3px; cursor: pointer;';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', () => {
          actions.splice(idx, 1);
          this.renderBranchTabs();
          this.renderActionsList();
          this.validateForm();
        });

        ctrlWrap.appendChild(upBtn);
        ctrlWrap.appendChild(dnBtn);
        ctrlWrap.appendChild(delBtn);
        row.appendChild(ctrlWrap);

        // Events for target and operation dropdown changes
        tgtSel.addEventListener('change', () => {
          actItem.target = tgtSel.value;
          const nextOps = getSupportedOperationsForTarget(actItem.target, pType);
          const firstNext = nextOps[0] || { action: 'set', property: 'color', valueType: 'color' };
          actItem.action = firstNext.action || 'set';
          actItem.property = firstNext.property || 'color';
          actItem.value = isStateBranchMode ? getAuthoredCanvasValue(actItem.target, actItem.property) : null;
          this.renderActionsList();
          this.validateForm();
        });

        opSel.addEventListener('change', () => {
          const chosen = ops.find((op) => op.key === opSel.value);
          if (chosen) {
            actItem.action = chosen.action || 'set';
            actItem.property = chosen.property || 'play';
            if (actItem.action !== 'set') {
              actItem.value = undefined;
            } else if (!isStateBranchMode) {
              actItem.value = null;
            } else {
              actItem.value = getAuthoredCanvasValue(actItem.target, actItem.property);
              if (chosen.valueType === 'color' && (!actItem.value || !String(actItem.value).startsWith('#'))) {
                actItem.value = '#38bdf8';
              } else if (chosen.valueType === 'boolean') {
                actItem.value = Boolean(actItem.value);
              }
            }
          }
          this.renderActionsList();
          this.validateForm();
        });

        container.appendChild(row);
      });
    },

    buildCandidatePayload() {
      const nameIn = document.getElementById('cbModalNameInput');
      const labelIn = document.getElementById('cbModalLabelInput');
      const typeSel = document.getElementById('cbModalTypeSelect');
      const boolDefSel = document.getElementById('cbModalDefaultBoolSelect');
      const defIn = document.getElementById('cbModalDefaultInput');
      const descIn = document.getElementById('cbModalDescInput');
      const hoverChk = document.getElementById('cbModalHoverTriggerChk');
      const trigSel = document.getElementById('cbModalEventTriggerSelect');
      const minIn = document.getElementById('cbModalMinInput');
      const maxIn = document.getElementById('cbModalMaxInput');
      const unitIn = document.getElementById('cbModalUnitInput');

      const name = (nameIn && nameIn.value ? nameIn.value.trim() : '');
      const label = (labelIn && labelIn.value ? labelIn.value.trim() : '') || name;
      const type = (typeSel && typeSel.value) || 'boolean';
      const description = (descIn && descIn.value ? descIn.value.trim() : '');

      let defVal = false;
      if (type === 'boolean') {
        defVal = (boolDefSel && boolDefSel.value === 'true');
      } else if (type === 'number') {
        defVal = parseFloat(defIn ? defIn.value : '0');
      } else {
        defVal = defIn ? defIn.value.trim() : '';
      }

      const targets = [];
      if (type === 'boolean') {
        ['true', 'false'].forEach((branch) => {
          const list = Array.isArray(this.actionsByBranch[branch]) ? this.actionsByBranch[branch] : [];
          list.forEach((a) => {
            const tb = {
              target: a.target,
              property: a.property || 'play',
              when: branch,
              action: a.action || 'set'
            };
            if (!tb.action || tb.action === 'set') {
              tb.value = a.value;
            }
            targets.push(tb);
          });
        });
      } else if (type === 'enum') {
        const opts = this._getEnumOptions();
        opts.forEach((optStr) => {
          const list = Array.isArray(this.actionsByBranch[optStr]) ? this.actionsByBranch[optStr] : [];
          list.forEach((a) => {
            const tb = {
              target: a.target,
              property: a.property || 'play',
              when: optStr,
              action: a.action || 'set'
            };
            if (!tb.action || tb.action === 'set') {
              tb.value = a.value;
            }
            targets.push(tb);
          });
        });
      } else {
        const list = Array.isArray(this.actionsByBranch.always) ? this.actionsByBranch.always : [];
        list.forEach((a) => {
          const tb = {
            target: a.target,
            property: a.property || 'value',
            when: 'always',
            action: a.action || 'set'
          };
          if (a.value !== null && a.value !== undefined && (!tb.action || tb.action === 'set')) {
            tb.value = a.value;
          }
          targets.push(tb);
        });
      }

      const payload = {
        name,
        label,
        type,
        target: 'root',
        property: targets.length > 0 ? (targets[0].property || 'state') : 'state',
        default: defVal,
        targets,
        description
      };
      if (type === 'boolean') {
        const chosenTrig = (trigSel && trigSel.value) ? trigSel.value.trim() : ((hoverChk && hoverChk.checked) ? 'hover' : '');
        if (chosenTrig) {
          payload.eventTrigger = chosenTrig;
        }
      }
      if (type === 'number') {
        const minV = parseFloat(minIn ? minIn.value : '0');
        const maxV = parseFloat(maxIn ? maxIn.value : '100');
        if (Number.isFinite(minV)) payload.min = minV;
        if (Number.isFinite(maxV)) payload.max = maxV;
        if (unitIn && unitIn.value.trim()) payload.unit = unitIn.value.trim();
      }
      if (type === 'enum') {
        payload.options = this._getEnumOptions();
      }
      return payload;
    },

    validateCandidate(payload) {
      const errors = [];
      if (!payload.name) {
        errors.push('Exposed Property Name is required (e.g. MouseOver).');
      } else if (!/^[a-zA-Z0-9_-]+$/.test(payload.name)) {
        errors.push('Property Name may only contain letters, digits, hyphens, and underscores.');
      }
      if (!Array.isArray(payload.targets) || payload.targets.length === 0) {
        errors.push('Add at least one Target Action.');
      }
      if (payload.type === 'number') {
        if (!Number.isFinite(payload.default)) {
          errors.push('Default Value must be a valid number.');
        } else if (Number.isFinite(payload.min) && Number.isFinite(payload.max)) {
          if (payload.min > payload.max) {
            errors.push('Min cannot be greater than Max.');
          } else if (payload.default < payload.min || payload.default > payload.max) {
            errors.push(`Default Value (${payload.default}) must be within [${payload.min}..${payload.max}].`);
          }
        }
      } else if (payload.type === 'enum') {
        if (!Array.isArray(payload.options) || payload.options.length < 2) {
          errors.push('Enum properties require at least 2 comma-separated choices.');
        } else if (!payload.options.includes(String(payload.default))) {
          errors.push(`Default Value "${payload.default}" must be one of: ${payload.options.join(', ')}.`);
        }
      }
      return { valid: errors.length === 0, errors };
    },

    validateForm(extraError = '') {
      const payload = this.buildCandidatePayload();
      const res = this.validateCandidate(payload);
      if (extraError) {
        res.valid = false;
        res.errors.unshift(extraError);
      }

      const valBox = document.getElementById('cbModalValidationBox');
      const saveBtn = document.getElementById('btnCbModalSave');
      if (valBox) {
        if (res.valid) {
          valBox.style.color = '#7ee787';
          valBox.innerHTML = `✓ <strong>Ready:</strong> <code>${payload.name}</code> (${payload.type}) drives <strong>${payload.targets.length}</strong> action(s) across canvas objects without grouping.`;
        } else {
          valBox.style.color = '#ffa198';
          valBox.innerHTML = `⚠️ ${res.errors.join(' • ')}`;
        }
      }
      if (saveBtn) {
        saveBtn.disabled = !res.valid;
        saveBtn.style.opacity = res.valid ? '1' : '0.45';
      }
      return res;
    },

    previewActiveBranchOnCanvas() {
      const payload = this.buildCandidatePayload();
      let testVal = payload.default;
      if (payload.type === 'boolean') {
        testVal = (this.activeBranch === 'true');
      } else if (payload.type === 'enum') {
        testVal = this.activeBranch;
      }
      this.applyParameterToStudioCanvas(payload, testVal);
      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        window.AppCoordinator.showNotification(`Previewed ${payload.name} = ${String(testVal)} on Studio canvas`, 'info');
      }
    },

    save() {
      const payload = this.buildCandidatePayload();
      const check = this.validateCandidate(payload);
      if (!check.valid) {
        this.validateForm();
        return false;
      }
      if (!window.EngineBridge || typeof window.EngineBridge.addWidgetParameter !== 'function') {
        this.validateForm('EngineBridge is not ready.');
        return false;
      }
      if (this.originalName && this.originalName !== payload.name && typeof window.EngineBridge.removeWidgetParameter === 'function') {
        window.EngineBridge.removeWidgetParameter(this.originalName);
      }
      const res = window.EngineBridge.addWidgetParameter(payload);
      if (res && res.error && res.success === false) {
        this.validateForm(res.error);
        return false;
      }
      this.originalName = payload.name;
      if (window.AppCoordinator) {
        window.AppCoordinator.recordHistoryImmediate();
        window.AppCoordinator.showNotification(`Saved Component Property '${payload.name}' (${payload.targets.length} actions)`, 'success');
      }
      if (typeof window.renderWidgetParametersOverview === 'function') {
        window.renderWidgetParametersOverview();
      } else {
        this.renderSection();
      }
      this.close();
      return true;
    }
  };

  window.ComponentBuilder = ComponentBuilder;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => ComponentBuilder.init());
    } else {
      setTimeout(() => ComponentBuilder.init(), 0);
    }
  }
})();
