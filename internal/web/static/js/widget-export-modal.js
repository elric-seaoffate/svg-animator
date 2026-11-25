/**
 * Stage 16F — Dedicated Four-Tab Export to Widget Dialog (`window.WidgetExportDialog`)
 *
 * Layer 1/2 Presentation & Coordination Module.
 * Brings together:
 *  - Tab 1: Widget Details & Export Settings (two-column layout, base name entered once with live derived filenames,
 *           2x/1x/3x/Original raster optimisation policies, read-only canvas/scene summary, and optional strict DT mode)
 *  - Tab 2: Properties, Events & Conditional Actions (Reusable Content vs Fixed Artwork audit, Browser Event Trigger
 *           review table, friendly object names instead of raw IDs, separate When TRUE / When FALSE action cards,
 *           and 1-click Edit in Component Builder round-trip)
 *  - Tab 3: Live Sandbox Preview & Interaction Test (isolated SVGWidget.mount() stage, Single vs Two-Instance comparison,
 *           interactive property controls, live browser event readout badge, and clean destroy() teardown)
 *  - Tab 4: Validation & Package Contents (blocking Errors vs non-blocking Warnings that never block export, passed checks,
 *           and the canonical 7-file package structure)
 */
(function () {
  'use strict';

  const LITE_KIND_LABELS = {
    'perimeter-tracer': 'Perimeter Tracer',
    'pulse': 'Pulse / Heartbeat',
    'flash': 'Flash / Strobe',
    'flow-lite': 'Flow Lite',
    'radar-lite': 'Radar Ping',
    'gauge-lite': 'Gauge / Level',
    'oscilloscope-lite': 'Oscilloscope',
    'text-lite': 'Text Box'
  };

  const EVENT_TRIGGER_LABELS = {
    '': 'None (External Only)',
    'hover': 'Hover (mouseenter / mouseleave)',
    'press': 'Press (pointerdown / pointerup)',
    'click': 'Click (toggle / pulse)',
    'focus': 'Focus (focus / blur)',
    'dblclick': 'Double-Click (dblclick)'
  };

  const ACTION_LABELS = {
    'set': 'Set Property',
    'play': 'Play Animation (from frame 0)',
    'pause': 'Pause Animation (mid-cycle)',
    'resume': 'Resume Animation',
    'stop_reset': 'Stop & Reset Animation',
    'enable': 'Enable & Show Object',
    'disable': 'Disable & Hide Object'
  };

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sanitizeBaseName(raw) {
    const clean = String(raw || 'widget')
      .trim()
      .replace(/\.(svg|zip|sva)$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return clean || 'widget';
  }

  function getCanvasSceneObjects() {
    const map = new Map();
    const list = [];

    const addObj = (entry) => {
      map.set(entry.target, entry);
      list.push(entry);
    };

    const liteList = (window.LiteEffects && (Array.isArray(window.LiteEffects.list) ? window.LiteEffects.list : (typeof window.LiteEffects.getAllLiteEffects === 'function' ? window.LiteEffects.getAllLiteEffects() : (window.LiteEffects.items || window.LiteEffects.effects)))) || [];
    if (Array.isArray(liteList)) {
      liteList.forEach((le) => {
        const kindLabel = LITE_KIND_LABELS[le.kind] || le.kind || 'Low-Load Effect';
        const customName = (le.name || '').trim();
        const textPreview = le.kind === 'text-lite' && (le.text || le.labelText) ? String(le.text || le.labelText).trim().slice(0, 28) : '';
        let friendly = `${kindLabel} #${le.id}`;
        if (customName) {
          friendly = `${kindLabel} "${customName}" (#${le.id})`;
        } else if (textPreview) {
          friendly = `${kindLabel} "${textPreview}" (#${le.id})`;
        }
        addObj({
          target: `lite-${le.id}`,
          type: 'lite',
          id: le.id,
          liteKind: le.kind || '',
          name: customName || textPreview || `${kindLabel} #${le.id}`,
          friendlyLabel: friendly,
          raw: le
        });
      });
    }

    const nodeList = (window.DiagramNodes && (Array.isArray(window.DiagramNodes.list) ? window.DiagramNodes.list : (typeof window.DiagramNodes.getAllNodes === 'function' ? window.DiagramNodes.getAllNodes() : window.DiagramNodes.nodes))) || [];
    if (Array.isArray(nodeList)) {
      nodeList.forEach((n) => {
        const label = (n.name || n.text || '').trim();
        const friendly = label ? `Shape "${label}" (#${n.id})` : `Shape #${n.id} (${n.shape || n.type || 'rect'})`;
        addObj({
          target: `node-${n.id}`,
          type: 'node',
          id: n.id,
          name: label || `Shape #${n.id}`,
          friendlyLabel: friendly,
          raw: n
        });
      });
    }

    const flowList = (window.DataFlows && (Array.isArray(window.DataFlows.list) ? window.DataFlows.list : (typeof window.DataFlows.getAllFlows === 'function' ? window.DataFlows.getAllFlows() : window.DataFlows.flows))) || [];
    if (Array.isArray(flowList)) {
      flowList.forEach((f) => {
        const label = (f.name || f.label || '').trim();
        const friendly = label ? `Data Flow "${label}" (#${f.id})` : `Data Flow #${f.id}`;
        addObj({
          target: `flow-${f.id}`,
          type: 'flow',
          id: f.id,
          name: label || `Data Flow #${f.id}`,
          friendlyLabel: friendly,
          raw: f
        });
      });
    }

    const glowList = (window.Glows && (Array.isArray(window.Glows.list) ? window.Glows.list : (typeof window.Glows.getAllGlows === 'function' ? window.Glows.getAllGlows() : window.Glows.glows))) || [];
    if (Array.isArray(glowList)) {
      glowList.forEach((g) => {
        const label = (g.name || '').trim();
        const friendly = label ? `Hotspot Glow "${label}" (#${g.id})` : `Hotspot Glow #${g.id}`;
        addObj({
          target: `glow-${g.id}`,
          type: 'glow',
          id: g.id,
          name: label || `Hotspot Glow #${g.id}`,
          friendlyLabel: friendly,
          raw: g
        });
      });
    }

    const rippleList = (window.Ripples && (Array.isArray(window.Ripples.list) ? window.Ripples.list : (typeof window.Ripples.getAllRipples === 'function' ? window.Ripples.getAllRipples() : window.Ripples.ripples))) || [];
    if (Array.isArray(rippleList)) {
      rippleList.forEach((r) => {
        const label = (r.name || '').trim();
        const friendly = label ? `Liquid Ripple "${label}" (#${r.id})` : `Liquid Ripple #${r.id}`;
        addObj({
          target: `ripple-${r.id}`,
          type: 'ripple',
          id: r.id,
          name: label || `Liquid Ripple #${r.id}`,
          friendlyLabel: friendly,
          raw: r
        });
      });
    }

    const imageList = (window.ImageObjects && (Array.isArray(window.ImageObjects.list) ? window.ImageObjects.list : (typeof window.ImageObjects.getAllImages === 'function' ? window.ImageObjects.getAllImages() : window.ImageObjects.images))) || [];
    if (Array.isArray(imageList)) {
      imageList.forEach((img) => {
        const label = (img.name || img.filename || '').trim();
        const friendly = label ? `Image "${label}" (#${img.id})` : `Image #${img.id}`;
        const canonicalTarget = String(img.id).startsWith('image-') ? `image-${img.id}` : `image-${img.id}`;
        const entry = {
          target: canonicalTarget,
          type: 'image',
          id: img.id,
          name: label || `Image #${img.id}`,
          friendlyLabel: friendly,
          raw: img
        };
        addObj(entry);
        // Also index `image-image-${id}` and `image-${id}` in map for compatibility with imported SVGs
        if (!String(img.id).startsWith('image-')) {
          map.set(`image-image-${img.id}`, entry);
        } else {
          map.set(String(img.id), entry);
        }
      });
    }

    let groups = [];
    if (window.EngineBridge && typeof window.EngineBridge.getGroups === 'function' && window.EngineBridge.isReady && window.EngineBridge.isReady()) {
      groups = window.EngineBridge.getGroups() || [];
    } else if (window.AppCoordinator && typeof window.AppCoordinator.getGroups === 'function') {
      groups = window.AppCoordinator.getGroups() || [];
    }
    groups.forEach((grp) => {
      const gid = String(grp.id || '').startsWith('group-') ? String(grp.id) : `group-${grp.id}`;
      const label = (grp.name || '').trim();
      const friendly = label ? `Group "${label}" (${gid})` : `Group (${gid})`;
      addObj({
        target: gid,
        type: 'group',
        id: gid,
        name: label || gid,
        friendlyLabel: friendly,
        raw: grp
      });
    });

    return { map, list };
  }

  function getPropertyFriendlyName(targetEntry, propName) {
    if (!propName) return '';
    if (targetEntry && typeof window.getSupportedPropertiesForMember === 'function') {
      const mId = targetEntry.type === 'group' ? targetEntry.id : targetEntry.id;
      const defs = window.getSupportedPropertiesForMember(targetEntry.type, mId) || [];
      const found = defs.find((d) => d.prop === propName);
      if (found && found.label) return found.label;
    }
    const fallbackLabels = {
      color: targetEntry && targetEntry.liteKind === 'text-lite' ? 'Text Colour' : 'Colour',
      bgColor: targetEntry && targetEntry.liteKind === 'text-lite' ? 'Box Background Colour' : 'Background Colour',
      borderColor: 'Border Colour',
      fill: 'Fill Colour',
      stroke: 'Stroke Colour',
      text: 'Text Content',
      src: 'Image Source (Icon / URL)',
      opacity: 'Opacity',
      bgOpacity: 'Background Opacity',
      visibility: 'Visibility',
      play: 'Play Animation',
      speed: 'Speed / Cycle Duration',
      period: 'Cycle Period (s)',
      strokeWidth: 'Stroke Thickness',
      fontSize: 'Font Size',
      value: 'Gauge Value'
    };
    return fallbackLabels[propName] || propName;
  }

  function describeBindingHumanReadable(tb, objMap) {
    const tgt = (tb.target !== undefined ? tb.target : tb.Target) || '';
    const prop = (tb.property !== undefined ? tb.property : tb.Property) || '';
    const act = ((tb.action !== undefined ? tb.action : tb.Action) || 'set').toLowerCase();
    const val = tb.value !== undefined ? tb.value : tb.Value;

    const objEntry = objMap.get(tgt);
    const objTitle = objEntry ? objEntry.friendlyLabel : (tgt === 'root' || tgt === 'global' ? 'Entire Widget' : `Missing Object (${tgt})`);
    const propTitle = getPropertyFriendlyName(objEntry, prop);

    if (act === 'play') {
      return `<strong>${escapeHtml(objTitle)}</strong> &rarr; <span style="color:#7ee787;">Play Animation</span> (start from frame 0)`;
    }
    if (act === 'pause') {
      return `<strong>${escapeHtml(objTitle)}</strong> &rarr; <span style="color:#d29922;">Pause Animation</span> (hold current frame)`;
    }
    if (act === 'resume') {
      return `<strong>${escapeHtml(objTitle)}</strong> &rarr; <span style="color:#7ee787;">Resume Animation</span>`;
    }
    if (act === 'stop_reset') {
      return `<strong>${escapeHtml(objTitle)}</strong> &rarr; <span style="color:#ffa198;">Stop &amp; Reset Animation</span>`;
    }
    if (act === 'enable') {
      return `<strong>${escapeHtml(objTitle)}</strong> &rarr; <span style="color:#7ee787;">Enable &amp; Show Object</span>`;
    }
    if (act === 'disable') {
      return `<strong>${escapeHtml(objTitle)}</strong> &rarr; <span style="color:#ffa198;">Disable &amp; Hide Object</span>`;
    }

    const valFormatted = (val === null || val === undefined || val === '')
      ? '<em>incoming parameter value</em>'
      : `<code style="color:#79c0ff; background:rgba(56,139,253,0.14); padding:1px 5px; border-radius:3px;">${escapeHtml(String(val))}</code>`;
    return `<strong>${escapeHtml(objTitle)}</strong> &rarr; Set <strong>${escapeHtml(propTitle)}</strong> (<code>${escapeHtml(prop)}</code>) to ${valFormatted}`;
  }

  const WidgetExportDialog = {
    isOpen: false,
    _bound: false,
    _pausedForEdit: false,
    activeTab: 'details',
    previewMode: 'single', // 'single' | 'dual'
    _previewInstA: null,
    _previewInstB: null,
    _previewCleanupFns: [],
    _draft: {
      widgetTitle: '',
      baseName: '',
      description: '',
      category: 'Controls',
      version: '1.0.0',
      tags: '',
      rasterPolicy: '2x',
      strictDT: false
    },

    init() {
      if (this._bound) return;
      this._bound = true;

      const openBtn1 = document.getElementById('btnOpenWidgetExportModal');
      if (openBtn1) {
        openBtn1.addEventListener('click', () => this.open());
      }
      const openBtn2 = document.getElementById('btnOpenWidgetExportFromMaker');
      if (openBtn2) {
        openBtn2.addEventListener('click', () => this.open());
      }

      document.getElementById('btnWxModalClose')?.addEventListener('click', () => this.close());
      document.getElementById('btnWxModalCancel')?.addEventListener('click', () => this.close());

      // Tab buttons
      document.querySelectorAll('#wxTabBar .wx-tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tab = btn.getAttribute('data-wx-tab') || 'details';
          this.switchTab(tab);
        });
      });

      // Tab 1 inputs
      const titleIn = document.getElementById('wxWidgetTitleInput');
      const baseIn = document.getElementById('wxBaseNameInput');
      const descIn = document.getElementById('wxDescriptionInput');
      const catSel = document.getElementById('wxCategorySelect');
      const verIn = document.getElementById('wxVersionInput');
      const tagsIn = document.getElementById('wxTagsInput');
      const rasterSel = document.getElementById('wxRasterPolicySelect');
      const strictChk = document.getElementById('wxStrictDTContractChk');

      if (titleIn) {
        titleIn.addEventListener('input', () => {
          this._draft.widgetTitle = titleIn.value;
          if (!this._userEditedBaseName && titleIn.value.trim()) {
            const slug = sanitizeBaseName(titleIn.value);
            this._draft.baseName = slug;
            if (baseIn) baseIn.value = slug;
            this._syncBaseNameToRightDrawer(slug);
          }
          this.updateDerivedFilenamesPreview();
          this.refreshValidationBadges();
        });
      }

      if (baseIn) {
        baseIn.addEventListener('input', () => {
          this._userEditedBaseName = true;
          this._draft.baseName = baseIn.value;
          this._syncBaseNameToRightDrawer(baseIn.value);
          this.updateDerivedFilenamesPreview();
          this.refreshValidationBadges();
        });
      }

      if (descIn) {
        descIn.addEventListener('input', () => {
          this._draft.description = descIn.value;
        });
      }
      if (catSel) {
        catSel.addEventListener('change', () => {
          this._draft.category = catSel.value;
        });
      }
      if (verIn) {
        verIn.addEventListener('input', () => {
          this._draft.version = verIn.value;
        });
      }
      if (tagsIn) {
        tagsIn.addEventListener('input', () => {
          this._draft.tags = tagsIn.value;
        });
      }

      if (rasterSel) {
        rasterSel.addEventListener('change', () => {
          this.setRasterPolicy(rasterSel.value);
        });
      }

      document.querySelectorAll('input[name="wxRasterPolicyRadio"]').forEach((radio) => {
        radio.addEventListener('change', () => {
          if (radio.checked) {
            this.setRasterPolicy(radio.value);
          }
        });
      });

      if (strictChk) {
        strictChk.addEventListener('change', () => {
          this._draft.strictDT = Boolean(strictChk.checked);
          this.refreshValidationBadges();
          if (this.activeTab === 'validation') {
            this.renderValidationTab();
          }
        });
      }

      // Tab 2: New Property in Component Builder
      document.getElementById('btnWxNewPropertyInCB')?.addEventListener('click', () => {
        this.openComponentBuilderForEdit(null);
      });

      // Tab 3: Preview mode toggle & reset
      document.getElementById('wxPreviewModeSingleBtn')?.addEventListener('click', () => {
        this.previewMode = 'single';
        this.renderPreviewTab();
      });
      document.getElementById('wxPreviewModeDualBtn')?.addEventListener('click', () => {
        this.previewMode = 'dual';
        this.renderPreviewTab();
      });
      document.getElementById('wxPreviewResetBtn')?.addEventListener('click', () => {
        this.renderPreviewTab();
      });

      // Footer export buttons
      document.getElementById('btnWxExportGuide')?.addEventListener('click', () => {
        this.exportPropertiesGuide();
      });
      document.getElementById('btnWxExportStandaloneSVG')?.addEventListener('click', () => {
        this.exportStandaloneSVG();
      });
      document.getElementById('btnWxExportPackageZip')?.addEventListener('click', () => {
        this.exportPackageZip();
      });
    },

    _syncBaseNameToRightDrawer(val) {
      const drawerInput = document.getElementById('widgetExportBaseNameInput');
      if (drawerInput) {
        drawerInput.value = sanitizeBaseName(val);
      }
    },

    setRasterPolicy(policy) {
      const p = ['1x', '2x', '3x', 'original'].includes(policy) ? policy : '2x';
      this._draft.rasterPolicy = p;

      const rasterSel = document.getElementById('wxRasterPolicySelect');
      if (rasterSel && rasterSel.value !== p) rasterSel.value = p;

      const drawerSel = document.getElementById('widgetExportImagePolicySelect');
      if (drawerSel && drawerSel.value !== p) drawerSel.value = p;

      const cards = [
        { id: 'wxRasterCard2x', val: '2x' },
        { id: 'wxRasterCard1x', val: '1x' },
        { id: 'wxRasterCard3x', val: '3x' },
        { id: 'wxRasterCardOriginal', val: 'original' }
      ];
      cards.forEach((c) => {
        const el = document.getElementById(c.id);
        if (!el) return;
        const radio = el.querySelector('input[type="radio"]');
        const active = c.val === p;
        if (radio) radio.checked = active;
        el.style.borderColor = active ? '#3fb950' : '#30363d';
        el.style.background = active ? 'rgba(35, 134, 54, 0.14)' : '#0d1117';
      });

      this.refreshValidationBadges();
      if (this.activeTab === 'preview') {
        this.renderPreviewTab();
      } else if (this.activeTab === 'validation') {
        this.renderValidationTab();
      }
    },

    getAuthoritativeParameters() {
      if (window.EngineBridge && typeof window.EngineBridge.getWidgetParameters === 'function') {
        return window.EngineBridge.getWidgetParameters() || [];
      }
      return [];
    },

    open(options = {}) {
      this.init();
      const modal = document.getElementById('widgetExportModal');
      if (!modal) return;

      if (!options.preserveDraft) {
        const drawerBase = document.getElementById('widgetExportBaseNameInput')?.value?.trim() || '';
        const projName = (window.ProjectManager && window.ProjectManager.currentProjectName) ? String(window.ProjectManager.currentProjectName).trim() : '';
        const initialBase = sanitizeBaseName(drawerBase || projName || 'widget');
        const initialTitle = projName || (drawerBase ? drawerBase : 'Reusable SVG Widget');
        const drawerPolicy = document.getElementById('widgetExportImagePolicySelect')?.value || '2x';

        this._draft.widgetTitle = initialTitle;
        this._draft.baseName = initialBase;
        this._draft.rasterPolicy = drawerPolicy;
        if (!this._draft.version) this._draft.version = '1.0.0';
        this._userEditedBaseName = Boolean(drawerBase);
      }

      this._applyDraftToInputs();
      this._pausedForEdit = false;
      this.isOpen = true;
      modal.style.display = 'flex';

      const targetTab = options.tab || this.activeTab || 'details';
      this.switchTab(targetTab);
    },

    _applyDraftToInputs() {
      const titleIn = document.getElementById('wxWidgetTitleInput');
      const baseIn = document.getElementById('wxBaseNameInput');
      const descIn = document.getElementById('wxDescriptionInput');
      const catSel = document.getElementById('wxCategorySelect');
      const verIn = document.getElementById('wxVersionInput');
      const tagsIn = document.getElementById('wxTagsInput');
      const strictChk = document.getElementById('wxStrictDTContractChk');

      if (titleIn) titleIn.value = this._draft.widgetTitle || '';
      if (baseIn) baseIn.value = this._draft.baseName || 'widget';
      if (descIn) descIn.value = this._draft.description || '';
      if (catSel && this._draft.category) catSel.value = this._draft.category;
      if (verIn) verIn.value = this._draft.version || '1.0.0';
      if (tagsIn) tagsIn.value = this._draft.tags || '';
      if (strictChk) strictChk.checked = Boolean(this._draft.strictDT);

      this.setRasterPolicy(this._draft.rasterPolicy || '2x');
      this.updateDerivedFilenamesPreview();
    },

    close() {
      this.destroyPreview();
      this.isOpen = false;
      this._pausedForEdit = false;
      const modal = document.getElementById('widgetExportModal');
      if (modal) modal.style.display = 'none';
    },

    switchTab(tabName) {
      const allowed = ['details', 'properties', 'preview', 'validation'];
      const target = allowed.includes(tabName) ? tabName : 'details';
      if (this.activeTab === 'preview' && target !== 'preview') {
        this.destroyPreview();
      }
      this.activeTab = target;

      const panels = {
        details: document.getElementById('wxTabPanelDetails'),
        properties: document.getElementById('wxTabPanelProperties'),
        preview: document.getElementById('wxTabPanelPreview'),
        validation: document.getElementById('wxTabPanelValidation')
      };
      Object.keys(panels).forEach((k) => {
        if (panels[k]) panels[k].style.display = k === target ? 'block' : 'none';
      });

      document.querySelectorAll('#wxTabBar .wx-tab-btn').forEach((btn) => {
        const isAct = btn.getAttribute('data-wx-tab') === target;
        btn.style.background = isAct ? '#0d1117' : 'transparent';
        btn.style.color = isAct ? '#58a6ff' : '#8b949e';
        btn.style.borderColor = isAct ? '#30363d' : 'transparent';
        btn.style.borderBottom = isAct ? '2px solid #58a6ff' : '1px solid transparent';
        btn.style.fontWeight = isAct ? '700' : '600';
      });

      this.refreshValidationBadges();
      if (target === 'details') {
        this.renderDetailsTab();
      } else if (target === 'properties') {
        this.renderPropertiesTab();
      } else if (target === 'preview') {
        this.renderPreviewTab();
      } else if (target === 'validation') {
        this.renderValidationTab();
      }
    },

    updateDerivedFilenamesPreview() {
      const box = document.getElementById('wxDerivedFilenamesPreview');
      if (!box) return;
      const base = sanitizeBaseName(this._draft.baseName);
      box.innerHTML =
        `Derived Package: <strong style="color: #7ee787;">${escapeHtml(base)}.zip</strong> &rarr; ` +
        `<code>${escapeHtml(base)}/${escapeHtml(base)}.svg</code>, ` +
        `<code>${escapeHtml(base)}/widget-manifest.json</code>, ` +
        `<code>${escapeHtml(base)}/js/svg-widget.js</code>, ` +
        `<code>${escapeHtml(base)}/${escapeHtml(base)}-properties.md</code>, ` +
        `<code>${escapeHtml(base)}/demo.html</code>, ` +
        `<code>${escapeHtml(base)}/README.md</code>, ` +
        `<code>${escapeHtml(base)}/preview.svg</code>`;
    },

    renderDetailsTab() {
      this.updateDerivedFilenamesPreview();
      const summaryBox = document.getElementById('wxCanvasSummaryBox');
      if (!summaryBox) return;

      const w = Number(document.getElementById('canvasWidthInput')?.value) || (window.Stage && window.Stage.canvasWidth) || 1280;
      const h = Number(document.getElementById('canvasHeightInput')?.value) || (window.Stage && window.Stage.canvasHeight) || 720;
      const { list } = getCanvasSceneObjects();
      const params = this.getAuthoritativeParameters();

      const counts = {
        lite: list.filter((o) => o.type === 'lite').length,
        node: list.filter((o) => o.type === 'node').length,
        flow: list.filter((o) => o.type === 'flow').length,
        glow: list.filter((o) => o.type === 'glow').length,
        ripple: list.filter((o) => o.type === 'ripple').length,
        image: list.filter((o) => o.type === 'image').length,
        group: list.filter((o) => o.type === 'group').length
      };

      const images = list.filter((o) => o.type === 'image');
      let imgSummary = 'None';
      if (images.length > 0) {
        const descs = images.map((im) => {
          const r = im.raw || {};
          const nw = r.naturalWidth || r.width || 0;
          const nh = r.naturalHeight || r.height || 0;
          const dw = Math.round(r.width || nw);
          const dh = Math.round(r.height || nh);
          return `${escapeHtml(im.name)} (${nw}&times;${nh} px source displayed at ${dw}&times;${dh} px)`;
        });
        imgSummary = descs.join('; ');
      }

      summaryBox.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px;">
          <div><span style="color:#8b949e;">Canvas Dimensions:</span> <strong style="color:#7ee787;">${w} &times; ${h} px</strong> (Authoritative limit: 20..3840 px)</div>
          <div><span style="color:#8b949e;">Exposed Parameters:</span> <strong style="color:#58a6ff;">${params.length}</strong></div>
          <div><span style="color:#8b949e;">Low-Load Effects:</span> <strong>${counts.lite}</strong></div>
          <div><span style="color:#8b949e;">Shapes / Flows / Glows / Ripples:</span> <strong>${counts.node} / ${counts.flow} / ${counts.glow} / ${counts.ripple}</strong></div>
          <div><span style="color:#8b949e;">Groups:</span> <strong>${counts.group}</strong></div>
          <div><span style="color:#8b949e;">Image Objects:</span> <strong>${counts.image}</strong></div>
        </div>
        <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #21262d; font-size: 0.73rem;">
          <span style="color:#8b949e;">Embedded Raster Artwork:</span> <span style="color:#c9d1d9;">${imgSummary}</span>
        </div>
      `;
    },

    validate() {
      const errors = [];
      const warnings = [];
      const passed = [];

      const rawBase = (this._draft.baseName || '').trim();
      const base = sanitizeBaseName(rawBase);
      if (!rawBase) {
        errors.push({
          code: 'ERR-BASENAME',
          title: 'Invalid Export Base Name',
          detail: 'Export Base Name cannot be empty. Enter a short alphanumeric identifier such as "fleet".'
        });
      } else {
        passed.push(`Canonical Export Base Name "${base}" produces ${base}.zip with 7 matched package files.`);
      }

      const w = Number(document.getElementById('canvasWidthInput')?.value) || (window.Stage && window.Stage.canvasWidth) || 1280;
      const h = Number(document.getElementById('canvasHeightInput')?.value) || (window.Stage && window.Stage.canvasHeight) || 720;
      if (w < 20 || h < 20 || w > 3840 || h > 3840) {
        errors.push({
          code: 'ERR-CANVAS-DIM',
          title: 'Canvas Dimensions Outside Authoritative Studio Range',
          detail: `Current canvas (${w} × ${h} px) must be between 20 × 20 px and 3840 × 3840 px.`
        });
      } else {
        passed.push(`Canvas dimensions (${w} × ${h} px) are within authoritative limits (20 × 20 to 3840 × 3840 px).`);
      }

      const { map: objMap, list: objList } = getCanvasSceneObjects();
      const params = this.getAuthoritativeParameters();

      // Check duplicate parameter names
      const seenNames = new Set();
      params.forEach((p) => {
        const name = (p.name || p.Name || '').trim();
        if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
          errors.push({
            code: 'ERR-PARAM-NAME',
            title: `Invalid Parameter Name "${name || '(empty)'}"`,
            detail: 'Parameter names must use only letters, numbers, hyphens (-), or underscores (_).'
          });
        } else if (seenNames.has(name.toLowerCase())) {
          errors.push({
            code: 'ERR-DUP-PARAM',
            title: `Duplicate Parameter Name "${name}"`,
            detail: `Multiple exposed parameters share the name "${name}".`
          });
        } else {
          seenNames.add(name.toLowerCase());
        }
      });

      // Check targets, conflicts, event triggers, and When TRUE / When FALSE branches
      const eventTriggerMap = new Map(); // trigger -> [paramName]
      const branchTargetActionMap = new Map(); // `${paramName}::${when}::${target}::${propOrLifecycle}` -> count

      params.forEach((p) => {
        const pName = p.name || p.Name || '';
        const pType = (p.type || p.Type || 'number').toLowerCase();
        const pTarget = (p.target || p.Target || '').trim();
        const pProp = (p.property || p.Property || '').trim();
        const pTrig = (p.eventTrigger || p.EventTrigger || '').toLowerCase().trim();
        const targets = Array.isArray(p.targets || p.Targets) ? (p.targets || p.Targets) : [];

        // Check numeric min/max
        if (pType === 'number' || pType === 'speed') {
          const minV = p.min !== undefined ? p.min : p.Min;
          const maxV = p.max !== undefined ? p.max : p.Max;
          if (minV !== undefined && maxV !== undefined && minV !== null && maxV !== null && Number(minV) > Number(maxV)) {
            errors.push({
              code: 'ERR-RANGE',
              title: `Invalid Numeric Range on "${pName}"`,
              detail: `Minimum (${minV}) is greater than Maximum (${maxV}).`
            });
          }
        }

        if (pType === 'enum') {
          const opts = p.options || p.Options || [];
          if (!Array.isArray(opts) || opts.length === 0) {
            errors.push({
              code: 'ERR-ENUM-EMPTY',
              title: `Empty Enum Options on "${pName}"`,
              detail: `Enum property "${pName}" must define at least one allowed option.`
            });
          }
        }

        // Event trigger tracking
        if (pTrig) {
          if (!eventTriggerMap.has(pTrig)) eventTriggerMap.set(pTrig, []);
          eventTriggerMap.get(pTrig).push(pName);
        } else {
          // Check if property has an event-like name but Event Trigger is None
          if (/^(mouseover|onhover|hover|onclick|onpress|press|pressed|onfocus|ondblclick)$/i.test(pName)) {
            warnings.push({
              code: 'WARN-EVENT-NAME-NONE',
              paramName: pName,
              title: `Property "${pName}" Has Event Trigger Set to None`,
              detail: `"${pName}" looks like a domestic browser interaction property, but its Event Trigger is set to None. It will only respond to programmatic setParameter("${pName}", ...) calls unless you assign an explicit Browser Event Trigger (such as Hover, Press, or Click) in Component Builder.`
            });
          }
        }

        // Direct single-target binding validation
        if (pTarget && pTarget !== 'root' && pTarget !== 'global') {
          if (!objMap.has(pTarget)) {
            errors.push({
              code: 'ERR-TARGET',
              paramName: pName,
              title: `Missing Target Object "${pTarget}" on "${pName}"`,
              detail: `Parameter "${pName}" references "${pTarget}", which no longer exists on the canvas.`
            });
          }
        }

        // Multi-action / fan-out target bindings validation
        if (targets.length > 0) {
          const trueActions = [];
          const falseActions = [];

          targets.forEach((tb) => {
            const tId = (tb.target !== undefined ? tb.target : tb.Target) || '';
            const tProp = (tb.property !== undefined ? tb.property : tb.Property) || '';
            const tWhen = ((tb.when !== undefined ? tb.when : tb.When) || (pType === 'boolean' ? 'true' : 'always')).toLowerCase();
            const tAct = ((tb.action !== undefined ? tb.action : tb.Action) || 'set').toLowerCase();

            if (!tId || (tId !== 'root' && tId !== 'global' && !objMap.has(tId))) {
              errors.push({
                code: 'ERR-TARGET',
                paramName: pName,
                title: `Deleted or Missing Target "${tId || '(empty)'}" in "${pName}"`,
                detail: `Conditional action in "${pName}" (when ${tWhen}) references "${tId}", which does not exist in the current scene.`
              });
            } else if (tId !== 'root' && tId !== 'global') {
              const objEntry = objMap.get(tId);
              if ((tAct === 'pause' || tAct === 'resume') && objEntry && objEntry.type !== 'lite' && objEntry.type !== 'group') {
                errors.push({
                  code: 'ERR-UNSUPPORTED-PAUSE',
                  paramName: pName,
                  title: `Mid-Cycle "${tAct}" Not Supported on ${objEntry.friendlyLabel}`,
                  detail: `Mid-cycle pause/resume is supported on Low-Load Effects and Groups. Use play or stop_reset for ${objEntry.friendlyLabel}.`
                });
              }
            }

            // Check conflicting actions on same target+property within same branch
            const lifecycleGroup = ['play', 'pause', 'resume', 'stop_reset'].includes(tAct)
              ? '__anim_lifecycle__'
              : (['enable', 'disable'].includes(tAct) ? '__enable_lifecycle__' : `prop:${tProp}`);
            const conflictKey = `${pName}::${tWhen}::${tId}::${lifecycleGroup}`;
            if (branchTargetActionMap.has(conflictKey)) {
              errors.push({
                code: 'ERR-CONFLICT',
                paramName: pName,
                title: `Conflicting Actions in "${pName}" (When ${tWhen.toUpperCase()})`,
                detail: `Multiple actions in the "${tWhen.toUpperCase()}" branch of "${pName}" modify the same target property or animation lifecycle on "${tId}".`
              });
            } else {
              branchTargetActionMap.set(conflictKey, true);
            }

            if (tWhen === 'true') trueActions.push({ tId, tProp, tAct });
            if (tWhen === 'false') falseActions.push({ tId, tProp, tAct });
          });

          // Check reverse-state completeness for Boolean properties
          if (pType === 'boolean' && trueActions.length > 0) {
            if (falseActions.length === 0) {
              warnings.push({
                code: 'WARN-NO-FALSE-BRANCH',
                paramName: pName,
                title: `No "When FALSE" Reverse Actions Configured on "${pName}"`,
                detail: `"${pName}" defines ${trueActions.length} action(s) when TRUE, but 0 actions when FALSE. Switching "${pName}" back to FALSE will not restore colours or stop animations.`
              });
            } else {
              // Check if each target modified in TRUE is also handled in FALSE
              const unTouchedInFalse = [];
              trueActions.forEach((ta) => {
                const objEntry = objMap.get(ta.tId);
                const label = objEntry ? objEntry.friendlyLabel : ta.tId;
                const isAnim = ['play', 'pause', 'resume', 'stop_reset'].includes(ta.tAct) || ta.tProp === 'play';
                const isEnable = ['enable', 'disable'].includes(ta.tAct);
                const matched = falseActions.some((fa) => {
                  if (fa.tId !== ta.tId) return false;
                  if (isAnim) return ['play', 'pause', 'resume', 'stop_reset'].includes(fa.tAct) || fa.tProp === 'play';
                  if (isEnable) return ['enable', 'disable'].includes(fa.tAct) || fa.tProp === 'visibility';
                  return fa.tProp === ta.tProp;
                });
                if (!matched) {
                  const pLabel = isAnim ? 'Animation state' : (isEnable ? 'Visibility' : getPropertyFriendlyName(objEntry, ta.tProp));
                  unTouchedInFalse.push(`${label} (${pLabel})`);
                }
              });
              if (unTouchedInFalse.length > 0) {
                warnings.push({
                  code: 'WARN-PARTIAL-RESTORE',
                  paramName: pName,
                  title: `Partial Reverse-State Restoration on "${pName}"`,
                  detail: `When TRUE modifies ${unTouchedInFalse.join(', ')}, which is not restored or stopped in When FALSE.`
                });
              }
            }
          }
        }
      });

      // Duplicate browser event triggers across multiple properties
      eventTriggerMap.forEach((pNames, trig) => {
        if (pNames.length > 1) {
          const trigFriendly = EVENT_TRIGGER_LABELS[trig] || trig;
          warnings.push({
            code: 'WARN-DUP-EVENT',
            title: `Multiple Properties Share Browser Event Trigger "${trigFriendly}"`,
            detail: `Properties [${pNames.join(', ')}] are all bound to "${trig}". Verify whether one of them (for example OnClick vs MouseOver) should use Press or Click instead.`
          });
        }
      });

      // Check oversized embedded raster images when Original policy is selected
      const images = objList.filter((o) => o.type === 'image');
      images.forEach((im) => {
        const r = im.raw || {};
        const nw = Number(r.naturalWidth) || 0;
        const nh = Number(r.naturalHeight) || 0;
        const dw = Number(r.width) || nw;
        const dh = Number(r.height) || nh;
        if (this._draft.rasterPolicy === 'original' && nw > dw * 3 && nh > dh * 3 && (nw > 256 || nh > 256)) {
          warnings.push({
            code: 'WARN-LARGE-RASTER',
            title: `High-Resolution Raster Image "${im.name}" Exported at Original Resolution`,
            detail: `"${im.name}" is ${nw}×${nh} px but displayed at ${Math.round(dw)}×${Math.round(dh)} px. Choosing "2× — Recommended" instead of "Original" will substantially reduce exported SVG file size.`
          });
        }
        // Check external image URL if strict DT contract is enabled
        const src = String(r.data || r.src || '');
        if (src && /^https?:\/\//i.test(src)) {
          if (this._draft.strictDT) {
            errors.push({
              code: 'ERR-DT-EXTERNAL-IMAGE',
              title: `External Image URL Not Permitted by Strict Digital Twin Contract`,
              detail: `Image "${im.name}" references an external URL (${src.slice(0, 48)}...). Digital Twin requires self-contained data:image/... URIs.`
            });
          } else {
            warnings.push({
              code: 'WARN-EXTERNAL-IMAGE',
              title: `Image "${im.name}" Uses an External URL`,
              detail: `External URLs work in general web browsers, but strict offline/Digital Twin environments require embedded data:image/... URIs.`
            });
          }
        }
      });

      if (errors.length === 0) {
        passed.push(`All ${params.length} exposed parameter(s) and conditional action target bindings are valid.`);
        passed.push(`Isolated CSS scoping and multi-instance ID prefixing ready (policy: ${this._draft.rasterPolicy}).`);
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        passed
      };
    },

    refreshValidationBadges() {
      const res = this.validate();
      const params = this.getAuthoritativeParameters();

      const tabParamCount = document.getElementById('wxTabParamCount');
      if (tabParamCount) tabParamCount.textContent = String(params.length);

      const tabDiagCount = document.getElementById('wxTabDiagCount');
      if (tabDiagCount) {
        if (res.errors.length > 0) {
          tabDiagCount.innerHTML = `<span style="color:#f85149;">${res.errors.length} err</span>`;
        } else if (res.warnings.length > 0) {
          tabDiagCount.innerHTML = `<span style="color:#d29922;">${res.warnings.length} warn</span>`;
        } else {
          tabDiagCount.innerHTML = `<span style="color:#7ee787;">OK</span>`;
        }
      }

      const hdrBadge = document.getElementById('wxHeaderStatusBadge');
      const footerText = document.getElementById('wxFooterStatusText');
      const btnSvg = document.getElementById('btnWxExportStandaloneSVG');
      const btnZip = document.getElementById('btnWxExportPackageZip');

      if (res.errors.length > 0) {
        if (hdrBadge) {
          hdrBadge.textContent = `❌ ${res.errors.length} Blocking Error(s)`;
          hdrBadge.style.background = 'rgba(248, 81, 73, 0.16)';
          hdrBadge.style.color = '#ffa198';
          hdrBadge.style.borderColor = 'rgba(248, 81, 73, 0.5)';
        }
        if (footerText) {
          footerText.innerHTML = `<span style="color:#f85149; font-weight:700;">❌ Export blocked:</span> Resolve ${res.errors.length} blocking error(s) in Tab 2 or Tab 4 before exporting.`;
        }
        if (btnSvg) {
          btnSvg.disabled = true;
          btnSvg.style.opacity = '0.45';
          btnSvg.style.cursor = 'not-allowed';
        }
        if (btnZip) {
          btnZip.disabled = true;
          btnZip.style.opacity = '0.45';
          btnZip.style.cursor = 'not-allowed';
        }
      } else {
        if (res.warnings.length > 0) {
          if (hdrBadge) {
            hdrBadge.textContent = `⚠️ Ready (${res.warnings.length} Advisory Warning${res.warnings.length > 1 ? 's' : ''})`;
            hdrBadge.style.background = 'rgba(210, 153, 34, 0.16)';
            hdrBadge.style.color = '#e3b341';
            hdrBadge.style.borderColor = 'rgba(210, 153, 34, 0.5)';
          }
          if (footerText) {
            footerText.innerHTML = `<span style="color:#7ee787; font-weight:700;">✓ Ready to export</span> <span style="color:#d29922;">(${res.warnings.length} non-blocking warning${res.warnings.length > 1 ? 's' : ''} — review in Tab 2 or Tab 4)</span>`;
          }
        } else {
          if (hdrBadge) {
            hdrBadge.textContent = '✓ Ready to Export';
            hdrBadge.style.background = 'rgba(63, 185, 80, 0.16)';
            hdrBadge.style.color = '#7ee787';
            hdrBadge.style.borderColor = 'rgba(63, 185, 80, 0.45)';
          }
          if (footerText) {
            footerText.innerHTML = `<span style="color:#7ee787; font-weight:700;">✓ All validation checks passed.</span> Ready to export <code>${escapeHtml(sanitizeBaseName(this._draft.baseName))}.zip</code>.`;
          }
        }
        if (btnSvg) {
          btnSvg.disabled = false;
          btnSvg.style.opacity = '1';
          btnSvg.style.cursor = 'pointer';
        }
        if (btnZip) {
          btnZip.disabled = false;
          btnZip.style.opacity = '1';
          btnZip.style.cursor = 'pointer';
        }
      }
      return res;
    },

    renderPropertiesTab() {
      const { map: objMap, list: objList } = getCanvasSceneObjects();
      const params = this.getAuthoritativeParameters();
      const validation = this.validate();

      // 1. Reusable Content vs Fixed Artwork Audit
      const reusableBox = document.getElementById('wxReusableContentBox');
      if (reusableBox) {
        const textObjects = objList.filter((o) => (o.type === 'lite' && o.liteKind === 'text-lite') || (o.type === 'node' && o.raw && o.raw.text));
        const imageObjects = objList.filter((o) => o.type === 'image');

        if (textObjects.length === 0 && imageObjects.length === 0) {
          reusableBox.innerHTML = `<div style="font-size:0.74rem; color:#8b949e; font-style:italic;">No Text Box or Image objects on the canvas.</div>`;
        } else {
          reusableBox.innerHTML = '';
          const checkBoundProp = (targetId, propName) => {
            return params.find((p) => {
              const t = p.target || p.Target || '';
              const pr = p.property || p.Property || '';
              if (t === targetId && pr === propName) return true;
              const targets = p.targets || p.Targets || [];
              return Array.isArray(targets) && targets.some((tb) => (tb.target || tb.Target) === targetId && (tb.property || tb.Property) === propName);
            });
          };

          textObjects.forEach((to) => {
            const boundParam = checkBoundProp(to.target, 'text');
            const curText = (to.raw && to.raw.text) ? String(to.raw.text) : '';
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:10px; padding:6px 10px; background:#0d1117; border:1px solid #21262d; border-radius:6px; font-size:0.75rem;';
            if (boundParam) {
              const pName = boundParam.name || boundParam.Name;
              row.innerHTML = `
                <div>
                  <span style="color:#7ee787; font-weight:700;">✓ Externally Configurable Text:</span>
                  <strong>${escapeHtml(to.friendlyLabel)}</strong> &mdash; current text <code>"${escapeHtml(curText)}"</code> exposed via parameter <code style="color:#58a6ff;">${escapeHtml(pName)}</code>
                </div>
                <span style="font-size:0.70rem; padding:2px 7px; background:rgba(63,185,80,0.15); color:#7ee787; border-radius:4px;">Exposed (${escapeHtml(pName)})</span>
              `;
            } else {
              row.innerHTML = `
                <div>
                  <span style="color:#d29922; font-weight:700;">🔒 Fixed Artwork Text:</span>
                  <strong>${escapeHtml(to.friendlyLabel)}</strong> &mdash; text <code>"${escapeHtml(curText)}"</code> is baked into the SVG
                </div>
              `;
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'btn btn-secondary btn-sm wx-expose-label-btn';
              btn.style.cssText = 'font-size:0.70rem; padding:3px 8px; color:#79c0ff; border-color:#388bfd;';
              btn.textContent = '+ Expose as Label in Component Builder';
              btn.addEventListener('click', () => {
                this.openQuickPresetInComponentBuilder('label', to.target);
              });
              row.appendChild(btn);
            }
            reusableBox.appendChild(row);
          });

          imageObjects.forEach((imo) => {
            const boundParam = checkBoundProp(imo.target, 'src');
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:10px; padding:6px 10px; background:#0d1117; border:1px solid #21262d; border-radius:6px; font-size:0.75rem;';
            if (boundParam) {
              const pName = boundParam.name || boundParam.Name;
              row.innerHTML = `
                <div>
                  <span style="color:#7ee787; font-weight:700;">✓ Externally Configurable Icon / Image:</span>
                  <strong>${escapeHtml(imo.friendlyLabel)}</strong> &mdash; exposed via parameter <code style="color:#58a6ff;">${escapeHtml(pName)}</code>
                </div>
                <span style="font-size:0.70rem; padding:2px 7px; background:rgba(63,185,80,0.15); color:#7ee787; border-radius:4px;">Exposed (${escapeHtml(pName)})</span>
              `;
            } else {
              row.innerHTML = `
                <div>
                  <span style="color:#d29922; font-weight:700;">🔒 Fixed Artwork Image:</span>
                  <strong>${escapeHtml(imo.friendlyLabel)}</strong> &mdash; icon/image is fixed across all widget instances
                </div>
              `;
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'btn btn-secondary btn-sm wx-expose-icon-btn';
              btn.style.cssText = 'font-size:0.70rem; padding:3px 8px; color:#79c0ff; border-color:#388bfd;';
              btn.textContent = '+ Expose as Icon in Component Builder';
              btn.addEventListener('click', () => {
                this.openQuickPresetInComponentBuilder('icon', imo.target);
              });
              row.appendChild(btn);
            }
            reusableBox.appendChild(row);
          });
        }
      }

      // 2. Browser Event Trigger Review Table & Event Warnings
      const eventWarnBox = document.getElementById('wxEventTriggerWarnings');
      const eventTableWrap = document.getElementById('wxEventTriggerTableWrap');
      if (eventWarnBox) {
        const evWarns = validation.warnings.filter((w) => w.code === 'WARN-DUP-EVENT' || w.code === 'WARN-EVENT-NAME-NONE');
        if (evWarns.length === 0) {
          eventWarnBox.innerHTML = '';
        } else {
          eventWarnBox.innerHTML = evWarns.map((w) => `
            <div style="padding:7px 10px; background:rgba(210,153,34,0.14); border:1px solid #d29922; border-radius:6px; font-size:0.74rem; color:#e3b341;">
              <strong>⚠️ ${escapeHtml(w.title)}:</strong> ${escapeHtml(w.detail)}
            </div>
          `).join('');
        }
      }

      if (eventTableWrap) {
        if (params.length === 0) {
          eventTableWrap.innerHTML = `<div style="font-size:0.74rem; color:#8b949e; font-style:italic;">No exposed properties configured yet.</div>`;
        } else {
          const rowsHtml = params.map((p) => {
            const pName = p.name || p.Name || '';
            const pType = (p.type || p.Type || 'number').toLowerCase();
            const pDef = p.default !== undefined ? p.default : p.Default;
            const pTrig = (p.eventTrigger || p.EventTrigger || '').toLowerCase().trim();
            const trigLabel = EVENT_TRIGGER_LABELS[pTrig] || 'None (External Only)';
            const isDomestic = Boolean(pTrig);
            const controlMode = isDomestic
              ? '<span style="color:#7ee787;">Domestic Browser Event + Consuming App API</span>'
              : '<span style="color:#79c0ff;">Externally Controlled by Consuming App API</span>';

            return `
              <tr style="border-bottom:1px solid #21262d;">
                <td style="padding:6px 8px;"><code style="color:#7ee787; font-weight:700;">${escapeHtml(pName)}</code></td>
                <td style="padding:6px 8px; color:#c9d1d9;">${escapeHtml(pType)}</td>
                <td style="padding:6px 8px;"><code>${escapeHtml(typeof pDef === 'string' && pDef.startsWith('data:image/') ? 'data:image/... (embedded)' : String(pDef ?? ''))}</code></td>
                <td style="padding:6px 8px; font-weight:600; color:${isDomestic ? '#e3b341' : '#8b949e'};">${escapeHtml(trigLabel)}</td>
                <td style="padding:6px 8px;">${controlMode}</td>
              </tr>
            `;
          }).join('');

          eventTableWrap.innerHTML = `
            <table style="width:100%; border-collapse:collapse; font-size:0.74rem; text-align:left;">
              <thead>
                <tr style="border-bottom:1px solid #30363d; color:#8b949e; text-transform:uppercase; font-size:0.69rem;">
                  <th style="padding:5px 8px;">Property Name</th>
                  <th style="padding:5px 8px;">Type</th>
                  <th style="padding:5px 8px;">Default Value</th>
                  <th style="padding:5px 8px;">Browser Event Trigger</th>
                  <th style="padding:5px 8px;">Control Mode</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          `;
        }
      }

      // 3. Exposed Component Properties & Conditional Action Cards
      const cardsList = document.getElementById('wxPropertyCardsList');
      if (!cardsList) return;
      cardsList.innerHTML = '';

      if (params.length === 0) {
        cardsList.innerHTML = `
          <div style="padding:18px; background:#161b22; border:1px dashed #30363d; border-radius:8px; text-align:center; font-size:0.78rem; color:#8b949e;">
            No component properties or widget parameters are currently exposed. Click <strong>+ New Property in Component Builder</strong> above to create one.
          </div>
        `;
        return;
      }

      params.forEach((p) => {
        const pName = p.name || p.Name || '';
        const pLabel = p.label || p.Label || pName;
        const pType = (p.type || p.Type || 'number').toLowerCase();
        const pDef = p.default !== undefined ? p.default : p.Default;
        const pTarget = (p.target || p.Target || '').trim();
        const pProp = (p.property || p.Property || '').trim();
        const pTrig = (p.eventTrigger || p.EventTrigger || '').toLowerCase().trim();
        const targets = Array.isArray(p.targets || p.Targets) ? (p.targets || p.Targets) : [];

        const cardWarns = validation.warnings.filter((w) => w.paramName === pName);
        const cardErrs = validation.errors.filter((e) => e.paramName === pName);

        const card = document.createElement('div');
        card.className = 'wx-property-review-card';
        card.dataset.paramName = pName;
        const borderCol = cardErrs.length > 0 ? '#f85149' : (cardWarns.length > 0 ? '#d29922' : '#30363d');
        card.style.cssText = `background:#161b22; border:1px solid ${borderCol}; border-radius:8px; padding:12px 14px; display:flex; flex-direction:column; gap:8px;`;

        // Header
        const hdr = document.createElement('div');
        hdr.style.cssText = 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; border-bottom:1px solid #21262d; padding-bottom:8px;';

        const defDisplay = (typeof pDef === 'string' && pDef.startsWith('data:image/'))
          ? 'data:image/... (embedded artwork)'
          : String(pDef ?? '');
        const trigBadge = pTrig
          ? `<span style="font-size:0.70rem; padding:2px 7px; background:rgba(210,153,34,0.16); color:#e3b341; border:1px solid rgba(210,153,34,0.4); border-radius:4px;">⚡ Event: ${escapeHtml(EVENT_TRIGGER_LABELS[pTrig] || pTrig)}</span>`
          : `<span style="font-size:0.70rem; padding:2px 7px; background:#21262d; color:#8b949e; border-radius:4px;">API / External Control</span>`;

        hdr.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <code style="font-size:0.84rem; font-weight:700; color:#7ee787; background:rgba(63,185,80,0.14); padding:2px 8px; border-radius:4px;">${escapeHtml(pName)}</code>
            <strong style="font-size:0.80rem; color:#e6edf3;">${escapeHtml(pLabel)}</strong>
            <span style="font-size:0.71rem; color:#8b949e;">(${escapeHtml(pType)} &bull; default: <code>${escapeHtml(defDisplay)}</code>)</span>
            ${trigBadge}
          </div>
        `;

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn-secondary btn-sm wx-edit-in-cb-btn';
        editBtn.style.cssText = 'font-size:0.72rem; padding:4px 10px; color:#58a6ff; border-color:#388bfd; font-weight:600;';
        editBtn.textContent = '✏️ Edit in Component Builder';
        editBtn.addEventListener('click', () => {
          this.openComponentBuilderForEdit(p);
        });
        hdr.appendChild(editBtn);
        card.appendChild(hdr);

        // Body: Separate When TRUE and When FALSE lists for Boolean multi-action, or branch lists
        const body = document.createElement('div');
        body.style.cssText = 'font-size:0.75rem; color:#c9d1d9;';

        if (targets.length > 0 && pType === 'boolean') {
          const trueList = targets.filter((tb) => ((tb.when !== undefined ? tb.when : tb.When) || 'true').toLowerCase() === 'true');
          const falseList = targets.filter((tb) => ((tb.when !== undefined ? tb.when : tb.When) || '').toLowerCase() === 'false');

          const trueItems = trueList.length > 0
            ? `<ul style="margin:4px 0 0 18px; padding:0; display:flex; flex-direction:column; gap:3px;">${trueList.map((tb) => `<li>${describeBindingHumanReadable(tb, objMap)}</li>`).join('')}</ul>`
            : `<div style="color:#8b949e; font-style:italic; margin-top:3px;">No actions configured for When TRUE.</div>`;

          const falseItems = falseList.length > 0
            ? `<ul style="margin:4px 0 0 18px; padding:0; display:flex; flex-direction:column; gap:3px;">${falseList.map((tb) => `<li>${describeBindingHumanReadable(tb, objMap)}</li>`).join('')}</ul>`
            : `<div style="color:#d29922; font-style:italic; margin-top:3px;">⚠️ No reverse-state actions configured for When FALSE.</div>`;

          body.innerHTML = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div style="background:#0d1117; border:1px solid rgba(63,185,80,0.35); border-radius:6px; padding:8px 10px;">
                <div style="font-size:0.72rem; font-weight:700; color:#7ee787; text-transform:uppercase;">When TRUE (${trueList.length} action${trueList.length === 1 ? '' : 's'})</div>
                ${trueItems}
              </div>
              <div style="background:#0d1117; border:1px solid ${falseList.length > 0 ? 'rgba(88,166,255,0.35)' : 'rgba(210,153,34,0.5)'}; border-radius:6px; padding:8px 10px;">
                <div style="font-size:0.72rem; font-weight:700; color:${falseList.length > 0 ? '#79c0ff' : '#e3b341'}; text-transform:uppercase;">When FALSE (${falseList.length} action${falseList.length === 1 ? '' : 's'})</div>
                ${falseItems}
              </div>
            </div>
          `;
        } else if (targets.length > 0) {
          body.innerHTML = `
            <div style="background:#0d1117; border:1px solid #21262d; border-radius:6px; padding:8px 10px;">
              <div style="font-size:0.72rem; font-weight:700; color:#79c0ff; text-transform:uppercase;">Target Actions (${targets.length})</div>
              <ul style="margin:4px 0 0 18px; padding:0; display:flex; flex-direction:column; gap:3px;">
                ${targets.map((tb) => {
                  const w = (tb.when !== undefined ? tb.when : tb.When) || 'always';
                  const prefix = (w && w !== 'always') ? `<span style="color:#e3b341;">[When ${escapeHtml(w)}]</span> ` : '';
                  return `<li>${prefix}${describeBindingHumanReadable(tb, objMap)}</li>`;
                }).join('')}
              </ul>
            </div>
          `;
        } else {
          // Single-target parameter
          const singleDesc = describeBindingHumanReadable({ target: pTarget, property: pProp, action: 'set', value: null }, objMap);
          body.innerHTML = `
            <div style="background:#0d1117; border:1px solid #21262d; border-radius:6px; padding:7px 10px;">
              🎯 Direct Binding: ${singleDesc}
            </div>
          `;
        }
        card.appendChild(body);

        // Card-level diagnostics
        if (cardErrs.length > 0 || cardWarns.length > 0) {
          const diagBox = document.createElement('div');
          diagBox.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
          cardErrs.forEach((er) => {
            const d = document.createElement('div');
            d.style.cssText = 'padding:5px 8px; background:rgba(248,81,73,0.12); border:1px solid #f85149; border-radius:5px; font-size:0.73rem; color:#ffa198;';
            d.innerHTML = `<strong>❌ ${escapeHtml(er.title)}:</strong> ${escapeHtml(er.detail)}`;
            diagBox.appendChild(d);
          });
          cardWarns.forEach((wn) => {
            const d = document.createElement('div');
            d.style.cssText = 'padding:5px 8px; background:rgba(210,153,34,0.12); border:1px solid #d29922; border-radius:5px; font-size:0.73rem; color:#e3b341;';
            d.innerHTML = `<strong>⚠️ ${escapeHtml(wn.title)}:</strong> ${escapeHtml(wn.detail)}`;
            diagBox.appendChild(d);
          });
          card.appendChild(diagBox);
        }

        cardsList.appendChild(card);
      });
    },

    openComponentBuilderForEdit(param) {
      this._pausedForEdit = true;
      const modal = document.getElementById('widgetExportModal');
      if (modal) modal.style.display = 'none';
      this.destroyPreview();

      if (!param) {
        if (window.ComponentBuilder && typeof window.ComponentBuilder.open === 'function') {
          window.ComponentBuilder.open(null);
        }
        return;
      }

      const pTarget = (param.target || param.Target || '').trim();
      const targets = Array.isArray(param.targets || param.Targets) ? (param.targets || param.Targets) : [];

      // If this is a Group Semantic Mapping (e.g., target starts with group- and has fan-out targets), open GroupMappingDialog if available
      if (pTarget.startsWith('group-') && targets.length > 0 && window.GroupMappingDialog && typeof window.GroupMappingDialog.open === 'function') {
        const grp = (window.EngineBridge && typeof window.EngineBridge.getGroup === 'function')
          ? window.EngineBridge.getGroup(pTarget)
          : null;
        const propAlias = param.property || param.Property || '';
        const existingMapping = grp && Array.isArray(grp.mappings)
          ? grp.mappings.find((m) => m.alias === propAlias)
          : null;
        if (grp && existingMapping) {
          window.GroupMappingDialog.open(pTarget, existingMapping);
          return;
        }
      }

      // Open Component Builder (normalizing single-target parameter into a multi-action draft if needed)
      let cbDraft = param;
      if (targets.length === 0 && pTarget && pTarget !== 'root' && pTarget !== 'global') {
        cbDraft = Object.assign({}, param, {
          target: 'root',
          targets: [
            {
              target: pTarget,
              property: param.property || param.Property || 'color',
              when: (param.type || param.Type) === 'boolean' ? 'true' : 'always',
              action: 'set',
              value: null
            }
          ]
        });
      }
      if (window.ComponentBuilder && typeof window.ComponentBuilder.open === 'function') {
        window.ComponentBuilder.open(cbDraft);
      }
    },

    openQuickPresetInComponentBuilder(kind, targetId) {
      this._pausedForEdit = true;
      const modal = document.getElementById('widgetExportModal');
      if (modal) modal.style.display = 'none';
      this.destroyPreview();

      if (window.ComponentBuilder) {
        if (kind === 'label' && typeof window.ComponentBuilder.openQuickLabelPreset === 'function') {
          window.ComponentBuilder.openQuickLabelPreset(targetId);
          return;
        }
        if (kind === 'icon' && typeof window.ComponentBuilder.openQuickIconPreset === 'function') {
          window.ComponentBuilder.openQuickIconPreset(targetId);
          return;
        }
      }
    },

    resumeFromComponentBuilder() {
      if (!this._pausedForEdit) return;
      this._pausedForEdit = false;
      this.isOpen = true;
      const modal = document.getElementById('widgetExportModal');
      if (modal) modal.style.display = 'flex';
      this._applyDraftToInputs();
      this.switchTab(this.activeTab || 'properties');
    },

    destroyPreview() {
      if (Array.isArray(this._previewCleanupFns)) {
        this._previewCleanupFns.forEach((fn) => {
          try { fn(); } catch (e) {}
        });
      }
      this._previewCleanupFns = [];

      if (this._previewInstA && typeof this._previewInstA.destroy === 'function') {
        try { this._previewInstA.destroy(); } catch (e) {}
      }
      if (this._previewInstB && typeof this._previewInstB.destroy === 'function') {
        try { this._previewInstB.destroy(); } catch (e) {}
      }
      this._previewInstA = null;
      this._previewInstB = null;

      const s1 = document.getElementById('wxPreviewStageSingle');
      const sA = document.getElementById('wxPreviewSlotA');
      const sB = document.getElementById('wxPreviewSlotB');
      if (s1) s1.innerHTML = '';
      if (sA) sA.innerHTML = '';
      if (sB) sB.innerHTML = '';
    },

    _buildIsolatedPreviewSVGAndManifest() {
      const state = window.SceneState ? window.SceneState.buildRenderState() : window.currentRenderState;
      const rawSvg = (typeof window.buildFullSVG === 'function' && state) ? window.buildFullSVG(state) : '';
      const base = sanitizeBaseName(this._draft.baseName);
      const params = this.getAuthoritativeParameters();
      const manifest = {
        schemaVersion: 1,
        widgetName: base,
        displayName: this._draft.widgetTitle || base,
        packageId: base,
        componentId: 'cmp-' + base,
        parameters: params
      };
      const rasterPolicy = this._draft.rasterPolicy || '2x';
      const isolatedSvg = (window.SVGExportAdapter && typeof window.SVGExportAdapter.isolateWidget === 'function')
        ? window.SVGExportAdapter.isolateWidget(rawSvg, base, { scopeCss: true, manifest, rasterPolicy })
        : (window.SVGWidget && typeof window.SVGWidget.isolate === 'function')
          ? window.SVGWidget.isolate(rawSvg, { instanceId: base, scopeCss: true, manifest, rasterPolicy })
          : rawSvg;
      return { isolatedSvg, manifest, params };
    },

    _ensureSVGWidgetRuntime() {
      if (window.SVGWidget && typeof window.SVGWidget.mount === 'function') {
        return Promise.resolve(window.SVGWidget);
      }
      if (this._loadingRuntimePromise) {
        return this._loadingRuntimePromise;
      }
      if (typeof document === 'undefined' || !document.head || typeof document.createElement !== 'function') {
        return Promise.resolve(null);
      }
      this._loadingRuntimePromise = new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'js/svg-widget.js?v=6.0';
        s.onload = () => resolve(window.SVGWidget || null);
        s.onerror = () => resolve(null);
        document.head.appendChild(s);
      });
      return this._loadingRuntimePromise;
    },

    renderPreviewTab() {
      this.destroyPreview();

      const singleBtn = document.getElementById('wxPreviewModeSingleBtn');
      const dualBtn = document.getElementById('wxPreviewModeDualBtn');
      const singleStage = document.getElementById('wxPreviewStageSingle');
      const dualStage = document.getElementById('wxPreviewStageDual');
      const slotA = document.getElementById('wxPreviewSlotA');
      const slotB = document.getElementById('wxPreviewSlotB');
      const badge = document.getElementById('wxPreviewMountBadge');
      const readout = document.getElementById('wxPreviewEventReadout');
      const controlsDeck = document.getElementById('wxPreviewControlsDeck');
      const instBQuick = document.getElementById('wxPreviewInstanceBQuickControls');

      const isDual = this.previewMode === 'dual';
      if (singleBtn) {
        singleBtn.className = isDual ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm';
        singleBtn.style.background = isDual ? '' : '#1f6feb';
        singleBtn.style.borderColor = isDual ? '' : '#58a6ff';
        singleBtn.style.color = isDual ? '' : '#fff';
      }
      if (dualBtn) {
        dualBtn.className = isDual ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
        dualBtn.style.background = isDual ? '#1f6feb' : '';
        dualBtn.style.borderColor = isDual ? '#58a6ff' : '';
        dualBtn.style.color = isDual ? '#fff' : '';
      }
      if (singleStage) singleStage.style.display = isDual ? 'none' : 'flex';
      if (dualStage) dualStage.style.display = isDual ? 'flex' : 'none';
      if (badge) badge.textContent = isDual ? 'instances: wx-preview-a, wx-preview-b' : 'instance: wx-preview-a';
      if (readout) readout.textContent = 'Event Readout: Hover, press, or click the widget preview';

      if (!window.SVGWidget || typeof window.SVGWidget.mount !== 'function') {
        if (singleStage) {
          singleStage.innerHTML = `<div style="color:#8b949e; font-size:0.78rem;">Loading SVGWidget sandbox runtime...</div>`;
        }
        this._ensureSVGWidgetRuntime().then((rt) => {
          if (rt && this.isOpen && this.activeTab === 'preview') {
            this.renderPreviewTab();
          }
        });
        return;
      }

      const { isolatedSvg, manifest, params } = this._buildIsolatedPreviewSVGAndManifest();
      const mountTargetA = isDual ? slotA : singleStage;
      if (!mountTargetA) return;

      try {
        this._previewInstA = window.SVGWidget.mount(mountTargetA, isolatedSvg, {
          manifest: manifest,
          instanceId: 'wx-preview-a',
          visibilityAware: false
        });
      } catch (err) {
        mountTargetA.innerHTML = `<div style="color:#f85149; font-size:0.76rem;">Preview mount error: ${escapeHtml(err.message)}</div>`;
        return;
      }

      const bindReadoutEvents = (containerEl, labelPrefix) => {
        if (!containerEl || !readout) return;
        const onEnter = () => {
          readout.textContent = `Event Readout [${labelPrefix}]: mouseenter (Hover → true)`;
          readout.style.color = '#7ee787';
          syncControlsFromInstanceA();
        };
        const onLeave = () => {
          readout.textContent = `Event Readout [${labelPrefix}]: mouseleave (Hover → false)`;
          readout.style.color = '#79c0ff';
          syncControlsFromInstanceA();
        };
        const onDown = () => {
          readout.textContent = `Event Readout [${labelPrefix}]: pointerdown (Press → true)`;
          readout.style.color = '#e3b341';
          syncControlsFromInstanceA();
        };
        const onUp = () => {
          readout.textContent = `Event Readout [${labelPrefix}]: pointerup (Press → false)`;
          readout.style.color = '#79c0ff';
          syncControlsFromInstanceA();
        };
        const onClick = () => {
          readout.textContent = `Event Readout [${labelPrefix}]: click`;
          readout.style.color = '#58a6ff';
          syncControlsFromInstanceA();
        };
        containerEl.addEventListener('mouseenter', onEnter);
        containerEl.addEventListener('mouseleave', onLeave);
        containerEl.addEventListener('pointerdown', onDown);
        containerEl.addEventListener('pointerup', onUp);
        containerEl.addEventListener('click', onClick);
        this._previewCleanupFns.push(() => {
          containerEl.removeEventListener('mouseenter', onEnter);
          containerEl.removeEventListener('mouseleave', onLeave);
          containerEl.removeEventListener('pointerdown', onDown);
          containerEl.removeEventListener('pointerup', onUp);
          containerEl.removeEventListener('click', onClick);
        });
      };

      bindReadoutEvents(mountTargetA, 'Instance A');

      if (isDual && slotB) {
        const initOverridesB = {};
        const labelParam = params.find((p) => {
          const n = (p.name || p.Name || '').toLowerCase();
          return n === 'label' || ((p.type || p.Type) === 'text' && (p.property || p.Property) === 'text');
        });
        const iconParam = params.find((p) => {
          const n = (p.name || p.Name || '').toLowerCase();
          return n === 'icon' || (p.property || p.Property) === 'src';
        });

        if (labelParam) {
          const lName = labelParam.name || labelParam.Name;
          const defText = String((labelParam.default !== undefined ? labelParam.default : labelParam.Default) || 'Label');
          initOverridesB[lName] = defText + ' #2';
        }

        try {
          this._previewInstB = window.SVGWidget.mount(slotB, isolatedSvg, {
            manifest: manifest,
            instanceId: 'wx-preview-b',
            parameters: initOverridesB,
            visibilityAware: false
          });
          bindReadoutEvents(slotB, 'Instance B');
        } catch (err) {
          slotB.innerHTML = `<div style="color:#f85149; font-size:0.76rem;">Instance B mount error: ${escapeHtml(err.message)}</div>`;
        }

        // Quick Label & Icon override inputs for Instance B
        if (instBQuick) {
          instBQuick.innerHTML = '';
          if (labelParam && this._previewInstB) {
            const lName = labelParam.name || labelParam.Name;
            const inEl = document.createElement('input');
            inEl.type = 'text';
            inEl.id = 'wxPreviewInstBLabelInput';
            inEl.value = initOverridesB[lName] || '';
            inEl.placeholder = 'Instance B Label';
            inEl.style.cssText = 'padding:2px 6px; font-size:0.71rem; background:#161b22; border:1px solid #30363d; border-radius:4px; color:#e6edf3; width:130px;';
            inEl.addEventListener('input', () => {
              if (this._previewInstB) this._previewInstB.setParameter(lName, inEl.value);
            });
            instBQuick.appendChild(inEl);
          }
          if (iconParam && this._previewInstB) {
            const iName = iconParam.name || iconParam.Name;
            const altBadgeSvg = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="42" fill="#1e293b" stroke="#f59e0b" stroke-width="5"/><polygon points="48,18 57,38 78,40 62,55 66,76 48,65 30,76 34,55 18,40 39,38" fill="#fbbf24"/></svg>');
            const btnAltIcon = document.createElement('button');
            btnAltIcon.type = 'button';
            btnAltIcon.id = 'wxPreviewInstBAltIconBtn';
            btnAltIcon.className = 'btn btn-secondary btn-sm';
            btnAltIcon.style.cssText = 'font-size:0.69rem; padding:2px 7px;';
            btnAltIcon.textContent = '★ Test Alternate Icon on B';
            btnAltIcon.addEventListener('click', () => {
              if (this._previewInstB) this._previewInstB.setParameter(iName, altBadgeSvg);
            });
            instBQuick.appendChild(btnAltIcon);
          }
        }
      }

      // Render interactive controls deck for Instance A
      const controlInputs = new Map();
      const syncControlsFromInstanceA = () => {
        if (!this._previewInstA || typeof this._previewInstA.getValues !== 'function') return;
        const vals = this._previewInstA.getValues() || {};
        controlInputs.forEach((ctrl, pName) => {
          if (!(pName in vals)) return;
          const v = vals[pName];
          if (ctrl.type === 'checkbox') {
            ctrl.el.checked = Boolean(v);
            if (ctrl.stateLbl) ctrl.stateLbl.textContent = v ? 'TRUE' : 'FALSE';
          } else if (ctrl.el) {
            if (typeof v === 'string' && v.startsWith('data:image/')) {
              // don't overwrite a clean placeholder with a huge data URI
            } else {
              ctrl.el.value = String(v ?? '');
            }
          }
        });
      };

      if (!controlsDeck) return;
      controlsDeck.innerHTML = '';
      if (params.length === 0) {
        controlsDeck.innerHTML = `<div style="font-size:0.74rem; color:#8b949e; font-style:italic;">No exposed properties to control.</div>`;
        return;
      }

      params.forEach((p) => {
        const pName = p.name || p.Name || '';
        const pLabel = p.label || p.Label || pName;
        const pType = (p.type || p.Type || 'number').toLowerCase();
        const pDef = p.default !== undefined ? p.default : p.Default;
        const pTrig = (p.eventTrigger || p.EventTrigger || '').toLowerCase().trim();

        const row = document.createElement('div');
        row.style.cssText = 'padding:8px 10px; background:#0d1117; border:1px solid #21262d; border-radius:6px; display:flex; justify-content:space-between; align-items:center; gap:10px;';

        const left = document.createElement('div');
        left.style.cssText = 'min-width:0; flex:1;';
        const trigHint = pTrig ? ` <span style="color:#e3b341; font-size:0.68rem;">(⚡ ${escapeHtml(pTrig)})</span>` : '';
        left.innerHTML = `
          <div style="font-size:0.75rem; font-weight:700; color:#e6edf3;"><code style="color:#7ee787;">${escapeHtml(pName)}</code> &mdash; ${escapeHtml(pLabel)}${trigHint}</div>
          <div style="font-size:0.69rem; color:#8b949e;">Type: ${escapeHtml(pType)}</div>
        `;
        row.appendChild(left);

        const right = document.createElement('div');
        right.style.cssText = 'display:flex; align-items:center; gap:6px;';

        if (pType === 'boolean') {
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.className = 'wx-preview-bool-toggle';
          chk.dataset.paramName = pName;
          chk.checked = (pDef === true || pDef === 'true' || pDef === 1);
          chk.style.cssText = 'width:16px; height:16px; accent-color:#3fb950; cursor:pointer;';
          const stateLbl = document.createElement('span');
          stateLbl.style.cssText = 'font-size:0.72rem; font-family:ui-monospace,monospace; font-weight:700; color:#79c0ff; min-width:42px;';
          stateLbl.textContent = chk.checked ? 'TRUE' : 'FALSE';
          chk.addEventListener('change', () => {
            stateLbl.textContent = chk.checked ? 'TRUE' : 'FALSE';
            if (this._previewInstA) {
              this._previewInstA.setParameter(pName, chk.checked);
            }
            if (readout) {
              readout.textContent = `API Call: setParameter("${pName}", ${chk.checked})`;
              readout.style.color = '#7ee787';
            }
          });
          right.appendChild(chk);
          right.appendChild(stateLbl);
          controlInputs.set(pName, { type: 'checkbox', el: chk, stateLbl });
        } else if (pType === 'enum') {
          const sel = document.createElement('select');
          sel.className = 'wx-preview-enum-select';
          sel.dataset.paramName = pName;
          sel.style.cssText = 'padding:3px 7px; background:#161b22; border:1px solid #30363d; border-radius:4px; color:#e6edf3; font-size:0.73rem;';
          const opts = Array.isArray(p.options || p.Options) ? (p.options || p.Options) : ['normal'];
          opts.forEach((o) => {
            const opt = document.createElement('option');
            opt.value = o;
            opt.textContent = o;
            if (String(pDef) === String(o)) opt.selected = true;
            sel.appendChild(opt);
          });
          sel.addEventListener('change', () => {
            if (this._previewInstA) this._previewInstA.setParameter(pName, sel.value);
          });
          right.appendChild(sel);
          controlInputs.set(pName, { type: 'select', el: sel });
        } else if (pType === 'color') {
          const col = document.createElement('input');
          col.type = 'color';
          col.className = 'wx-preview-color-input';
          col.dataset.paramName = pName;
          col.value = (typeof pDef === 'string' && /^#[0-9a-fA-F]{6}$/.test(pDef)) ? pDef : '#38bdf8';
          col.style.cssText = 'width:32px; height:24px; border:none; background:none; cursor:pointer;';
          col.addEventListener('input', () => {
            if (this._previewInstA) this._previewInstA.setParameter(pName, col.value);
          });
          right.appendChild(col);
          controlInputs.set(pName, { type: 'color', el: col });
        } else if (pType === 'number' || pType === 'speed') {
          const num = document.createElement('input');
          num.type = 'number';
          num.className = 'wx-preview-number-input';
          num.dataset.paramName = pName;
          if (p.min !== undefined) num.min = p.min;
          if (p.max !== undefined) num.max = p.max;
          num.step = p.step !== undefined ? p.step : (pType === 'speed' ? '0.1' : '1');
          num.value = pDef !== undefined ? pDef : 0;
          num.style.cssText = 'width:76px; padding:3px 6px; background:#161b22; border:1px solid #30363d; border-radius:4px; color:#e6edf3; font-size:0.73rem;';
          num.addEventListener('input', () => {
            const v = parseFloat(num.value);
            if (Number.isFinite(v) && this._previewInstA) {
              this._previewInstA.setParameter(pName, v);
            }
          });
          right.appendChild(num);
          controlInputs.set(pName, { type: 'number', el: num });
        } else {
          const txt = document.createElement('input');
          txt.type = 'text';
          txt.className = 'wx-preview-text-input';
          txt.dataset.paramName = pName;
          const isDataUri = typeof pDef === 'string' && pDef.startsWith('data:image/');
          txt.value = isDataUri ? '' : String(pDef ?? '');
          txt.placeholder = isDataUri ? 'Embedded data:image/... (paste URL/URI)' : 'Enter text...';
          txt.style.cssText = 'width:155px; padding:3px 7px; background:#161b22; border:1px solid #30363d; border-radius:4px; color:#e6edf3; font-size:0.73rem;';
          txt.addEventListener('input', () => {
            if (this._previewInstA) this._previewInstA.setParameter(pName, txt.value);
          });
          right.appendChild(txt);
          controlInputs.set(pName, { type: 'text', el: txt });
        }

        row.appendChild(right);
        controlsDeck.appendChild(row);
      });
    },

    renderValidationTab() {
      const res = this.refreshValidationBadges();
      const errBox = document.getElementById('wxValidationErrorsList');
      const warnBox = document.getElementById('wxValidationWarningsList');
      const passBox = document.getElementById('wxValidationPassedList');
      const filesBox = document.getElementById('wxPackageFilesTable');

      if (errBox) {
        if (res.errors.length === 0) {
          errBox.innerHTML = `<div style="color:#7ee787;">✓ 0 blocking errors detected.</div>`;
        } else {
          errBox.innerHTML = res.errors.map((e) => `
            <div style="padding:7px 10px; background:rgba(248,81,73,0.12); border:1px solid #f85149; border-radius:6px; color:#ffa198;">
              <strong>❌ [${escapeHtml(e.code)}] ${escapeHtml(e.title)}</strong>
              <div style="margin-top:2px; color:#e6edf3; font-size:0.73rem;">${escapeHtml(e.detail)}</div>
            </div>
          `).join('');
        }
      }

      if (warnBox) {
        if (res.warnings.length === 0) {
          warnBox.innerHTML = `<div style="color:#8b949e;">✓ 0 advisory warnings.</div>`;
        } else {
          warnBox.innerHTML = res.warnings.map((w) => `
            <div style="padding:7px 10px; background:rgba(210,153,34,0.12); border:1px solid #d29922; border-radius:6px; color:#e3b341;">
              <strong>⚠️ [${escapeHtml(w.code)}] ${escapeHtml(w.title)}</strong>
              <div style="margin-top:2px; color:#e6edf3; font-size:0.73rem;">${escapeHtml(w.detail)}</div>
            </div>
          `).join('');
        }
      }

      if (passBox) {
        passBox.innerHTML = res.passed.map((msg) => `<div>✓ ${escapeHtml(msg)}</div>`).join('');
      }

      if (filesBox) {
        const base = sanitizeBaseName(this._draft.baseName);
        const files = [
          { path: `${base}/${base}.svg`, role: 'Isolated reusable SVG widget with scoped CSS, non-corrupted data-*-id attributes, embedded manifest, and optimised raster artwork.' },
          { path: `${base}/widget-manifest.json`, role: 'Canonical Stage 16C/16F widget manifest containing metadata, exposed parameters, conditional actions, and explicit event triggers.' },
          { path: `${base}/js/svg-widget.js`, role: 'Self-contained Stage 16C/16F SVGWidget browser runtime supporting multi-action When TRUE/FALSE rules, lifecycle actions, and domestic event triggers.' },
          { path: `${base}/${base}-properties.md`, role: 'Developer & integration reference guide documenting every exposed property, event trigger, conditional action, and mount snippet.' },
          { path: `${base}/demo.html`, role: 'Interactive offline verification harness and live control deck mounting the widget with event trigger and parameter controls.' },
          { path: `${base}/README.md`, role: 'Quick-start package overview and file manifest.' },
          { path: `${base}/preview.svg`, role: 'Static thumbnail/preview vector asset for library browsers.' }
        ];

        filesBox.innerHTML = `
          <div style="margin-bottom:8px; padding:6px 10px; background:#0d1117; border:1px solid #21262d; border-radius:6px; color:#7ee787; font-family:ui-monospace,monospace;">
            Archive: <strong>${escapeHtml(base)}.zip</strong> (7 canonical files &bull; 0 redundant duplicates)
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:0.73rem;">
            <thead>
              <tr style="border-bottom:1px solid #30363d; color:#8b949e; text-align:left;">
                <th style="padding:5px 6px;">ZIP Entry Path</th>
                <th style="padding:5px 6px;">Purpose</th>
              </tr>
            </thead>
            <tbody>
              ${files.map((f) => `
                <tr style="border-bottom:1px solid #21262d;">
                  <td style="padding:6px; white-space:nowrap;"><code style="color:#79c0ff; font-weight:600;">${escapeHtml(f.path)}</code></td>
                  <td style="padding:6px; color:#c9d1d9;">${escapeHtml(f.role)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }
    },

    exportStandaloneSVG() {
      const check = this.validate();
      if (!check.valid) {
        this.switchTab('validation');
        return;
      }
      this._syncBaseNameToRightDrawer(this._draft.baseName);
      const drawerPolicy = document.getElementById('widgetExportImagePolicySelect');
      if (drawerPolicy) drawerPolicy.value = this._draft.rasterPolicy || '2x';
      document.getElementById('btnDownloadWidgetSVG')?.click();
    },

    exportPropertiesGuide() {
      this._syncBaseNameToRightDrawer(this._draft.baseName);
      document.getElementById('btnDownloadWidgetGuide')?.click();
    },

    async exportPackageZip() {
      const check = this.validate();
      if (!check.valid) {
        this.switchTab('validation');
        return;
      }

      try {
        const base = sanitizeBaseName(this._draft.baseName);
        this._syncBaseNameToRightDrawer(base);
        const state = window.SceneState ? window.SceneState.buildRenderState() : window.currentRenderState;
        if (!state || typeof window.buildFullSVG !== 'function') return;
        const rawSvg = window.buildFullSVG(state);
        const rasterPolicy = this._draft.rasterPolicy || '2x';

        let widgetJs = '';
        try {
          const jsResp = await fetch('js/svg-widget.js');
          if (jsResp.ok) widgetJs = await jsResp.text();
        } catch (e) {}

        const tagsList = String(this._draft.tags || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

        const meta = {
          displayName: (this._draft.widgetTitle || '').trim() || base,
          description: (this._draft.description || '').trim(),
          category: (this._draft.category || 'Controls').trim(),
          version: (this._draft.version || '1.0.0').trim(),
          tags: tagsList
        };

        if (window.EngineBridge && typeof window.EngineBridge.buildWidgetPackage === 'function' && window.EngineBridge.isReady()) {
          const res = window.EngineBridge.buildWidgetPackage(base, rawSvg, widgetJs, rasterPolicy, meta);
          if (res && res.success && res.zipB64) {
            const binaryStr = atob(res.zipB64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'application/zip' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = res.filename || (base + '.zip');
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }, 150);

            const sizeKb = (bytes.length / 1024).toFixed(1);
            if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
              window.AppCoordinator.showNotification(`Exported complete 7-file Widget Package: ${a.download} (${sizeKb} KB)`, 'success');
            }
            return res;
          } else if (res && res.error) {
            throw new Error(res.error);
          }
        }
        throw new Error('WebAssembly widget package builder is not available.');
      } catch (err) {
        if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
          window.AppCoordinator.showNotification('Widget Package Error: ' + err.message, 'error');
        } else {
          alert('Widget Package Error: ' + err.message);
        }
        return null;
      }
    }
  };

  window.WidgetExportDialog = WidgetExportDialog;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => WidgetExportDialog.init());
  } else {
    WidgetExportDialog.init();
  }
})();
