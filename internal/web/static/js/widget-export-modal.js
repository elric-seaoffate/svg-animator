/**
 * Stage 16F — Compact Export as Widget Dialog (`window.WidgetExportDialog`)
 *
 * Provides a clean separation between Widget Maker / Component Builder (where
 * properties, events, conditional actions, and previews are authored) and the
 * Export menu (where the completed widget is saved).
 *
 * User-facing controls in `#widgetExportModal`:
 *  1. Filename (`#wxBaseNameInput`) — produces `<base>.svg` or `<base>.zip`.
 *  2. Rasterise embedded objects (`#wxRasterPolicySelect`) — 1x, 2x (Recommended), 3x, Original Size.
 *  3. Export format (`wxExportFormatRadio`) — "Widget only" (`svg`) or "ZIP package" (`zip`, 7 canonical files).
 *  4. Actions — Cancel (`#btnWxModalCancel`) and Export (`#btnWxExportConfirm`).
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sanitizeBaseName(raw) {
    const clean = String(raw || '')
      .trim()
      .replace(/\.(svg|zip|sva)$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return clean;
  }

  function getCanvasObjectTargetSet() {
    const targets = new Set(['root', 'global']);

    const liteList = (window.LiteEffects && (Array.isArray(window.LiteEffects.list) ? window.LiteEffects.list : (typeof window.LiteEffects.getAllLiteEffects === 'function' ? window.LiteEffects.getAllLiteEffects() : (window.LiteEffects.items || window.LiteEffects.effects)))) || [];
    if (Array.isArray(liteList)) {
      liteList.forEach((le) => targets.add(`lite-${le.id}`));
    }

    const nodeList = (window.DiagramNodes && (Array.isArray(window.DiagramNodes.list) ? window.DiagramNodes.list : (typeof window.DiagramNodes.getAllNodes === 'function' ? window.DiagramNodes.getAllNodes() : window.DiagramNodes.nodes))) || [];
    if (Array.isArray(nodeList)) {
      nodeList.forEach((n) => targets.add(`node-${n.id}`));
    }

    const flowList = (window.DataFlows && (Array.isArray(window.DataFlows.list) ? window.DataFlows.list : (typeof window.DataFlows.getAllFlows === 'function' ? window.DataFlows.getAllFlows() : window.DataFlows.flows))) || [];
    if (Array.isArray(flowList)) {
      flowList.forEach((f) => targets.add(`flow-${f.id}`));
    }

    const glowList = (window.Glows && (Array.isArray(window.Glows.list) ? window.Glows.list : (typeof window.Glows.getAllGlows === 'function' ? window.Glows.getAllGlows() : window.Glows.glows))) || [];
    if (Array.isArray(glowList)) {
      glowList.forEach((g) => targets.add(`glow-${g.id}`));
    }

    const rippleList = (window.Ripples && (Array.isArray(window.Ripples.list) ? window.Ripples.list : (typeof window.Ripples.getAllRipples === 'function' ? window.Ripples.getAllRipples() : window.Ripples.ripples))) || [];
    if (Array.isArray(rippleList)) {
      rippleList.forEach((r) => targets.add(`ripple-${r.id}`));
    }

    const imageList = (window.ImageObjects && (Array.isArray(window.ImageObjects.list) ? window.ImageObjects.list : (typeof window.ImageObjects.getAllImages === 'function' ? window.ImageObjects.getAllImages() : window.ImageObjects.images))) || [];
    if (Array.isArray(imageList)) {
      imageList.forEach((img) => {
        targets.add(`image-${img.id}`);
        targets.add(`image-image-${img.id}`);
        targets.add(String(img.id));
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
      targets.add(gid);
    });

    return targets;
  }

  const WidgetExportDialog = {
    isOpen: false,
    _bound: false,
    baseName: 'widget',
    rasterPolicy: '2x',
    exportFormat: 'zip', // 'svg' | 'zip'

    init() {
      if (this._bound) return;
      this._bound = true;

      document.getElementById('btnOpenWidgetExportModal')?.addEventListener('click', () => this.open());
      document.getElementById('btnWxModalClose')?.addEventListener('click', () => this.close());
      document.getElementById('btnWxModalCancel')?.addEventListener('click', () => this.close());

      const baseIn = document.getElementById('wxBaseNameInput');
      if (baseIn) {
        baseIn.addEventListener('input', () => {
          this.baseName = baseIn.value;
          this.hideError();
          this.updateOutputFilenameHint();
        });
      }

      const rasterSel = document.getElementById('wxRasterPolicySelect');
      if (rasterSel) {
        rasterSel.addEventListener('change', () => {
          this.setRasterPolicy(rasterSel.value);
        });
      }

      document.querySelectorAll('input[name="wxExportFormatRadio"]').forEach((radio) => {
        radio.addEventListener('change', () => {
          if (radio.checked) {
            this.setExportFormat(radio.value);
          }
        });
      });

      document.getElementById('btnWxExportConfirm')?.addEventListener('click', () => {
        this.executeExport();
      });
    },

    open(options = {}) {
      this.init();
      const modal = document.getElementById('widgetExportModal');
      if (!modal) return;

      const projName = (window.ProjectManager && window.ProjectManager.currentProjectName)
        ? String(window.ProjectManager.currentProjectName).trim()
        : '';
      const defaultName = (projName && projName.toLowerCase() !== 'untitled project')
        ? (sanitizeBaseName(projName) || 'widget')
        : 'widget';

      if (options.baseName !== undefined) {
        this.baseName = options.baseName;
      } else if (!this.baseName || this.baseName === 'widget') {
        this.baseName = defaultName;
      }

      if (options.rasterPolicy) {
        this.rasterPolicy = options.rasterPolicy;
      } else if (!this.rasterPolicy) {
        this.rasterPolicy = '2x';
      }

      if (options.exportFormat) {
        this.exportFormat = options.exportFormat === 'svg' ? 'svg' : 'zip';
      }

      const baseIn = document.getElementById('wxBaseNameInput');
      if (baseIn) baseIn.value = this.baseName;

      this.setRasterPolicy(this.rasterPolicy);
      this.setExportFormat(this.exportFormat);
      this.hideError();

      this.isOpen = true;
      modal.style.display = 'flex';
    },

    close() {
      this.isOpen = false;
      this.hideError();
      const modal = document.getElementById('widgetExportModal');
      if (modal) modal.style.display = 'none';
    },

    setRasterPolicy(policy) {
      const p = ['1x', '2x', '3x', 'original'].includes(policy) ? policy : '2x';
      this.rasterPolicy = p;
      const sel = document.getElementById('wxRasterPolicySelect');
      if (sel && sel.value !== p) sel.value = p;
    },

    setExportFormat(fmt) {
      const f = fmt === 'svg' ? 'svg' : 'zip';
      this.exportFormat = f;

      const rSvg = document.getElementById('wxFormatWidgetOnlyRadio');
      const rZip = document.getElementById('wxFormatZipPackageRadio');
      if (rSvg) rSvg.checked = (f === 'svg');
      if (rZip) rZip.checked = (f === 'zip');

      const lblSvg = document.getElementById('wxFormatOptionSvgLabel');
      const lblZip = document.getElementById('wxFormatOptionZipLabel');
      if (lblSvg) {
        lblSvg.style.borderColor = (f === 'svg') ? '#3fb950' : '#30363d';
        lblSvg.style.background = (f === 'svg') ? 'rgba(35, 134, 54, 0.14)' : '#161b22';
      }
      if (lblZip) {
        lblZip.style.borderColor = (f === 'zip') ? '#3fb950' : '#30363d';
        lblZip.style.background = (f === 'zip') ? 'rgba(35, 134, 54, 0.14)' : '#161b22';
      }

      this.updateOutputFilenameHint();
    },

    updateOutputFilenameHint() {
      const hint = document.getElementById('wxOutputFilenameHint');
      if (!hint) return;
      const clean = sanitizeBaseName(this.baseName);
      if (!clean) {
        hint.innerHTML = `<span style="color:#f85149;">Enter a valid filename (letters, numbers, hyphens, or underscores).</span>`;
        return;
      }
      const ext = this.exportFormat === 'svg' ? '.svg' : '.zip';
      hint.innerHTML = `Output file: <code style="color: #7ee787;">${escapeHtml(clean + ext)}</code>`;
    },

    showError(msg) {
      const box = document.getElementById('wxModalErrorBox');
      if (!box) return;
      box.style.display = 'block';
      box.textContent = msg;
    },

    hideError() {
      const box = document.getElementById('wxModalErrorBox');
      if (!box) return;
      box.style.display = 'none';
      box.textContent = '';
    },

    getAuthoritativeParameters() {
      if (window.EngineBridge && typeof window.EngineBridge.getWidgetParameters === 'function') {
        return window.EngineBridge.getWidgetParameters() || [];
      }
      return [];
    },

    /**
     * Unobtrusive export validation run when the user clicks Export.
     * Checks filename validity, canvas dimension bounds, and missing target objects
     * or invalid ranges on exposed parameters.
     */
    validate() {
      const errors = [];
      const baseIn = document.getElementById('wxBaseNameInput');
      if (baseIn && this.isOpen) {
        this.baseName = baseIn.value;
      }

      const rawName = String(this.baseName || '').trim();
      const cleanBase = sanitizeBaseName(rawName);
      if (!rawName || !cleanBase) {
        errors.push({
          code: 'ERR-FILENAME',
          message: 'Please enter a valid Filename (e.g. fleet) using letters, numbers, hyphens, or underscores.'
        });
      }

      const w = Number(document.getElementById('canvasWidthInput')?.value) || (window.Stage && window.Stage.canvasWidth) || 1280;
      const h = Number(document.getElementById('canvasHeightInput')?.value) || (window.Stage && window.Stage.canvasHeight) || 720;
      if (w < 20 || h < 20 || w > 3840 || h > 3840) {
        errors.push({
          code: 'ERR-CANVAS-DIM',
          message: `Canvas dimensions (${w} × ${h} px) must be between 20 × 20 px and 3840 × 3840 px.`
        });
      }

      const validTargets = getCanvasObjectTargetSet();
      const params = this.getAuthoritativeParameters();
      params.forEach((p) => {
        const pName = (p.name || p.Name || '').trim();
        const pType = (p.type || p.Type || 'number').toLowerCase();
        const pTarget = (p.target || p.Target || '').trim();
        const targets = Array.isArray(p.targets || p.Targets) ? (p.targets || p.Targets) : [];

        if (!pName || !/^[a-zA-Z0-9_-]+$/.test(pName)) {
          errors.push({
            code: 'ERR-PARAM-NAME',
            message: `Invalid parameter name "${pName || '(empty)'}".`
          });
        }

        if (pType === 'number' || pType === 'speed') {
          const minV = p.min !== undefined ? p.min : p.Min;
          const maxV = p.max !== undefined ? p.max : p.Max;
          if (minV !== undefined && maxV !== undefined && minV !== null && maxV !== null && Number(minV) > Number(maxV)) {
            errors.push({
              code: 'ERR-RANGE',
              message: `Parameter "${pName}" has minimum (${minV}) greater than maximum (${maxV}).`
            });
          }
        }

        if (pTarget && !validTargets.has(pTarget)) {
          errors.push({
            code: 'ERR-TARGET',
            message: `Parameter "${pName}" references target "${pTarget}", which does not exist on the canvas.`
          });
        }

        targets.forEach((tb) => {
          const tId = (tb.target !== undefined ? tb.target : tb.Target) || '';
          if (!tId || !validTargets.has(tId)) {
            errors.push({
              code: 'ERR-TARGET',
              message: `Action in parameter "${pName}" references target "${tId || '(empty)'}", which does not exist on the canvas.`
            });
          }
        });
      });

      return {
        valid: errors.length === 0,
        cleanBaseName: cleanBase || 'widget',
        errors
      };
    },

    buildIsolatedSVGString(cleanBase, rasterPolicy) {
      const state = window.SceneState ? window.SceneState.buildRenderState() : window.currentRenderState;
      if (!state || typeof window.buildFullSVG !== 'function') {
        throw new Error('Scene state is not ready for SVG generation.');
      }
      const rawSvg = window.buildFullSVG(state);
      let serializedSvg = rawSvg;
      if (typeof window.serializeSVGForExport === 'function' && typeof DOMParser !== 'undefined' && typeof XMLSerializer !== 'undefined') {
        try {
          serializedSvg = window.serializeSVGForExport(rawSvg);
        } catch (e) {
          serializedSvg = rawSvg;
        }
      }

      const params = this.getAuthoritativeParameters();
      let manifest = null;
      if (Array.isArray(params) && params.length > 0) {
        manifest = {
          schemaVersion: 1,
          widgetName: cleanBase,
          packageId: cleanBase,
          componentId: 'cmp-' + cleanBase,
          parameters: params
        };
      }

      if (window.SVGExportAdapter && typeof window.SVGExportAdapter.isolateWidget === 'function') {
        return window.SVGExportAdapter.isolateWidget(serializedSvg, cleanBase, {
          scopeCss: true,
          manifest,
          rasterPolicy: rasterPolicy || this.rasterPolicy || '2x'
        });
      }
      if (window.SVGWidget && typeof window.SVGWidget.isolate === 'function') {
        return window.SVGWidget.isolate(serializedSvg, {
          instanceId: cleanBase,
          scopeCss: true,
          manifest,
          rasterPolicy: rasterPolicy || this.rasterPolicy || '2x'
        });
      }
      return serializedSvg;
    },

    async executeExport() {
      const check = this.validate();
      if (!check.valid) {
        this.showError(check.errors[0].message);
        return { success: false, errors: check.errors };
      }
      this.hideError();

      const cleanBase = check.cleanBaseName;
      const policy = this.rasterPolicy || '2x';

      if (this.exportFormat === 'svg') {
        return this.exportWidgetOnlySVG(cleanBase, policy);
      }
      return await this.exportZipPackage(cleanBase, policy);
    },

    exportWidgetOnlySVG(cleanBase, policy) {
      try {
        const isolatedSvg = this.buildIsolatedSVGString(cleanBase, policy);
        const filename = cleanBase + '.svg';

        if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && document.body) {
          const blob = new Blob([isolatedSvg], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          if (typeof a.click === 'function') a.click();
          setTimeout(() => {
            if (a.parentNode) a.parentNode.removeChild(a);
            if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
          }, 150);
        }

        if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
          window.AppCoordinator.showNotification(`Exported widget SVG: ${filename}`, 'success');
        }
        this.close();
        return { success: true, format: 'svg', filename, svg: isolatedSvg };
      } catch (err) {
        this.showError('Export error: ' + err.message);
        return { success: false, error: err.message };
      }
    },

    async exportZipPackage(cleanBase, policy) {
      try {
        const state = window.SceneState ? window.SceneState.buildRenderState() : window.currentRenderState;
        if (!state || typeof window.buildFullSVG !== 'function') {
          throw new Error('Scene state is not ready for export.');
        }
        const rawSvg = window.buildFullSVG(state);
        let serializedSvg = rawSvg;
        if (typeof window.serializeSVGForExport === 'function' && typeof DOMParser !== 'undefined' && typeof XMLSerializer !== 'undefined') {
          try {
            serializedSvg = window.serializeSVGForExport(rawSvg);
          } catch (e) {
            serializedSvg = rawSvg;
          }
        }

        let widgetJs = '';
        if (typeof fetch === 'function') {
          try {
            const jsResp = await fetch('js/svg-widget.js');
            if (jsResp && jsResp.ok) widgetJs = await jsResp.text();
          } catch (e) {}
        }

        if (window.EngineBridge && typeof window.EngineBridge.buildWidgetPackage === 'function' && window.EngineBridge.isReady()) {
          const res = window.EngineBridge.buildWidgetPackage(cleanBase, serializedSvg, widgetJs, policy);
          if (res && res.success && res.zipB64) {
            const filename = res.filename || (cleanBase + '.zip');
            if (typeof atob === 'function' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && document.body) {
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
              a.download = filename;
              document.body.appendChild(a);
              if (typeof a.click === 'function') a.click();
              setTimeout(() => {
                if (a.parentNode) a.parentNode.removeChild(a);
                if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
              }, 150);
            }

            if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
              window.AppCoordinator.showNotification(`Exported widget package: ${filename}`, 'success');
            }
            this.close();
            return { success: true, format: 'zip', filename, zipB64: res.zipB64 };
          } else if (res && res.error) {
            throw new Error(res.error);
          }
        }
        throw new Error('WebAssembly widget package builder is not available.');
      } catch (err) {
        this.showError('Export error: ' + err.message);
        return { success: false, error: err.message };
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
