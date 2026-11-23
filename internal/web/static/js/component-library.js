// ============================================================================
// Reusable Component Library & Save-as-Component Workflow
// Persistent SQLite-backed Global Component Library + Widget Maker integration
// ============================================================================

window.ComponentLibrary = {
  items: [],
  _bound: false,
  _activeSelection: null,
  _activeGroupId: '',

  init() {
    if (this._bound) return;
    this._bound = true;

    const searchIn = document.getElementById('compLibSearchInput');
    const catSel = document.getElementById('compLibCategoryFilter');
    const refreshBtn = document.getElementById('btnRefreshCompLib');
    const openSaveBtn = document.getElementById('btnOpenSaveComponentModal');
    const fctxSaveBtn = document.getElementById('fctx-btnSaveComponent');

    if (searchIn) searchIn.addEventListener('input', () => this.refreshList());
    if (catSel) catSel.addEventListener('change', () => this.refreshList());
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshList());
    if (openSaveBtn) openSaveBtn.addEventListener('click', () => this.openSaveModal());
    if (fctxSaveBtn) fctxSaveBtn.addEventListener('click', () => this.openSaveModal());

    // Save Component Modal bindings
    const closeBtn = document.getElementById('btnSaveCompModalClose');
    const cancelBtn = document.getElementById('btnSaveCompModalCancel');
    const confirmBtn = document.getElementById('btnSaveCompModalConfirm');
    const targetSel = document.getElementById('saveCompExistingSelect');
    const bumpSel = document.getElementById('saveCompBumpSelect');

    if (closeBtn) closeBtn.addEventListener('click', () => this.closeSaveModal());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeSaveModal());
    if (confirmBtn) confirmBtn.addEventListener('click', () => this.submitSaveModal());
    if (targetSel) targetSel.addEventListener('change', () => this._syncRevisionFields());
    if (bumpSel) bumpSel.addEventListener('change', () => this._syncRevisionFields());

    this.refreshList();
  },

  async fetchList(query = '', category = '', tag = '') {
    if (typeof window === 'undefined' || !window.location || !/^https?:/.test(window.location.protocol)) {
      return [];
    }
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (category && category !== 'all') params.set('category', category);
    if (tag) params.set('tag', tag);
    const qs = params.toString();
    const res = await fetch('/api/components' + (qs ? '?' + qs : ''));
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return Array.isArray(data.components) ? data.components : [];
  },

  async fetchComponent(componentId, version = '') {
    const params = new URLSearchParams({ id: String(componentId) });
    if (version) params.set('version', String(version));
    const res = await fetch('/api/components/get?' + params.toString());
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async saveToServer(payload) {
    const res = await fetch('/api/components/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async fetchUsage(componentId) {
    const res = await fetch('/api/components/usage?id=' + encodeURIComponent(String(componentId)));
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async fetchRevisions(componentId) {
    const res = await fetch('/api/components/revisions?id=' + encodeURIComponent(String(componentId)));
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async deleteFromServer(componentId, force = false) {
    const res = await fetch('/api/components/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ componentId: String(componentId), force: Boolean(force) })
    });
    const data = await res.json().catch(() => ({ success: false, error: 'Delete failed' }));
    if (!res.ok) {
      const err = new Error(data.error || 'Delete failed');
      err.usage = data.usage;
      throw err;
    }
    return data;
  },

  _bumpVersion(ver, kind) {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(ver || '1.0.0').trim());
    if (!m) return '1.0.0';
    const maj = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const pat = parseInt(m[3], 10);
    if (kind === 'major') return `${maj + 1}.0.0`;
    if (kind === 'minor') return `${maj}.${min + 1}.0`;
    return `${maj}.${min}.${pat + 1}`;
  },

  _escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _buildPreviewSVG() {
    try {
      if (typeof window.buildFullSVG === 'function' && window.SceneState) {
        const st = typeof window.SceneState.buildRenderState === 'function'
          ? window.SceneState.buildRenderState()
          : (window.currentRenderState || window.SceneState.currentRenderState);
        const raw = window.buildFullSVG(st);
        if (raw && raw.includes('<svg')) {
          return raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
        }
      }
    } catch (_) {}
    return '';
  },

  async refreshList() {
    const container = document.getElementById('compLibListContainer');
    const countBadge = document.getElementById('compLibCountBadge');
    const searchIn = document.getElementById('compLibSearchInput');
    const catSel = document.getElementById('compLibCategoryFilter');
    const q = searchIn ? searchIn.value.trim() : '';
    const cat = catSel ? catSel.value : 'all';

    try {
      this.items = await this.fetchList(q, cat, '');
    } catch (err) {
      console.warn('[ComponentLibrary] Failed loading components:', err);
      this.items = [];
    }

    if (countBadge) countBadge.textContent = String(this.items.length);
    if (!container) return;

    if (this.items.length === 0) {
      container.innerHTML = '<div style="font-size:0.72rem;color:#8b949e;text-align:center;padding:8px 4px;">No saved components in library yet. Select a group or object and click <strong>+ Save as Component</strong>.</div>';
      return;
    }

    container.innerHTML = '';
    this.items.forEach((comp) => {
      const card = document.createElement('div');
      card.className = 'comp-lib-card';
      card.dataset.componentId = comp.componentId;
      card.style.cssText = 'display:flex;gap:8px;align-items:center;padding:6px 8px;background:#0d1117;border:1px solid #30363d;border-radius:6px;';

      const thumb = document.createElement('div');
      thumb.style.cssText = 'width:40px;height:40px;flex-shrink:0;background:#161b22;border:1px solid #21262d;border-radius:4px;overflow:hidden;display:flex;align-items:center;justify-content:center;';
      if (comp.thumbnailSvg && comp.thumbnailSvg.includes('<svg')) {
        thumb.innerHTML = comp.thumbnailSvg;
        const svgNode = thumb.querySelector('svg');
        if (svgNode) {
          svgNode.style.width = '100%';
          svgNode.style.height = '100%';
        }
      } else {
        thumb.innerHTML = '<span style="font-size:1.1rem;">🧩</span>';
      }

      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';
      const tagsText = Array.isArray(comp.tags) && comp.tags.length > 0 ? comp.tags.slice(0, 3).join(', ') : comp.category || 'general';
      info.innerHTML = `
        <div style="display:flex;align-items:center;gap:5px;">
          <strong style="font-size:0.75rem;color:#e6edf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this._escapeHtml(comp.name)}</strong>
          <span style="font-size:0.64rem;background:#1f6feb33;color:#58a6ff;padding:0 4px;border-radius:3px;">v${this._escapeHtml(comp.latestVersion || '1.0.0')}</span>
        </div>
        <div style="font-size:0.66rem;color:#8b949e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${this._escapeHtml(comp.description || '')}">${this._escapeHtml(comp.description || tagsText)}</div>
      `;

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:4px;flex-shrink:0;';

      const insertBtn = document.createElement('button');
      insertBtn.type = 'button';
      insertBtn.className = 'btn btn-secondary btn-sm';
      insertBtn.textContent = '+ Insert';
      insertBtn.title = `Insert "${comp.name}" (v${comp.latestVersion}) as an independent instance`;
      insertBtn.style.cssText = 'font-size:0.68rem;padding:2px 6px;background:#238636;border-color:#3fb950;color:#fff;';
      insertBtn.addEventListener('click', () => this.insertComponent(comp.componentId));

      const updateBtn = document.createElement('button');
      updateBtn.type = 'button';
      updateBtn.className = 'btn btn-secondary btn-sm';
      updateBtn.textContent = '↻';
      updateBtn.title = `Update placed instances of "${comp.name}" in this scene to v${comp.latestVersion}`;
      updateBtn.style.cssText = 'font-size:0.68rem;padding:2px 5px;color:#58a6ff;';
      updateBtn.addEventListener('click', () => this.updatePlacedInstances(comp.componentId));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-secondary btn-sm';
      delBtn.textContent = '✕';
      delBtn.title = `Delete "${comp.name}" from library`;
      delBtn.style.cssText = 'font-size:0.68rem;padding:2px 5px;color:#f85149;';
      delBtn.addEventListener('click', () => this.deleteComponent(comp.componentId, comp.name));

      actions.appendChild(insertBtn);
      actions.appendChild(updateBtn);
      actions.appendChild(delBtn);

      card.appendChild(thumb);
      card.appendChild(info);
      card.appendChild(actions);
      container.appendChild(card);
    });
  },

  _resolveCurrentSelection() {
    const sel = (window.AppCoordinator && typeof window.AppCoordinator.getActiveSelection === 'function')
      ? window.AppCoordinator.getActiveSelection()
      : (window.AppCoordinator && window.AppCoordinator.activeSelection);
    if (!sel || !sel.type || sel.type === 'none') {
      return { groupId: '', items: [], defaultName: 'My Component' };
    }
    if (sel.type === 'group' && sel.id) {
      const grp = window.EngineBridge && typeof window.EngineBridge.getGroup === 'function'
        ? window.EngineBridge.getGroup(sel.id)
        : null;
      return {
        groupId: String(sel.id),
        items: [{ type: 'group', id: String(sel.id) }],
        defaultName: (grp && grp.name) || sel.name || 'Component',
        existingComponentId: (grp && grp.componentId) || ''
      };
    }
    if (sel.type === 'multi' && Array.isArray(sel.items) && sel.items.length > 0) {
      return {
        groupId: '',
        items: sel.items.map((it) => ({ type: String(it.type), id: String(it.id) })),
        defaultName: 'Composite Component',
        existingComponentId: ''
      };
    }
    if (sel.id != null) {
      return {
        groupId: '',
        items: [{ type: String(sel.type), id: String(sel.id) }],
        defaultName: sel.name || `${sel.type}-${sel.id}`,
        existingComponentId: ''
      };
    }
    return { groupId: '', items: [], defaultName: 'My Component', existingComponentId: '' };
  },

  openSaveModal() {
    const modal = document.getElementById('saveComponentModal');
    if (!modal) return;

    const resolved = this._resolveCurrentSelection();
    if (!resolved.groupId && (!resolved.items || resolved.items.length === 0)) {
      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        window.AppCoordinator.showNotification('Select an object, multi-selection, or group before saving as a Component.', 'warning');
      }
      return;
    }

    this._activeGroupId = resolved.groupId;
    this._activeSelection = resolved.items;

    const nameIn = document.getElementById('saveCompNameInput');
    const descIn = document.getElementById('saveCompDescInput');
    const catSel = document.getElementById('saveCompCategorySelect');
    const tagsIn = document.getElementById('saveCompTagsInput');
    const existingSel = document.getElementById('saveCompExistingSelect');
    const changelogIn = document.getElementById('saveCompChangelogInput');
    const previewBox = document.getElementById('saveCompPreviewBox');
    const paramsBox = document.getElementById('saveCompParamsChecklist');
    const statusEl = document.getElementById('saveCompModalStatus');

    if (nameIn) nameIn.value = resolved.defaultName;
    if (descIn) descIn.value = '';
    if (catSel) catSel.value = 'general';
    if (tagsIn) tagsIn.value = '';
    if (changelogIn) changelogIn.value = '';
    if (statusEl) statusEl.textContent = '';

    // Populate "Save Mode: New Component vs New Revision of Existing"
    if (existingSel) {
      existingSel.innerHTML = '<option value="">+ Save as New Component (v1.0.0)</option>';
      this.items.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.componentId;
        opt.textContent = `New Revision of "${c.name}" (current v${c.latestVersion || '1.0.0'})`;
        existingSel.appendChild(opt);
      });
      if (resolved.existingComponentId) {
        existingSel.value = resolved.existingComponentId;
      }
    }
    this._syncRevisionFields();

    // Render live preview
    if (previewBox) {
      const svgMarkup = this._buildPreviewSVG();
      previewBox.innerHTML = svgMarkup || '<span style="color:#8b949e;font-size:0.72rem;">Preview unavailable</span>';
      const svgEl = previewBox.querySelector('svg');
      if (svgEl) {
        svgEl.style.maxWidth = '100%';
        svgEl.style.maxHeight = '120px';
      }
    }

    // Populate exposed parameters checklist
    if (paramsBox) {
      const allParams = (window.EngineBridge && typeof window.EngineBridge.getWidgetParameters === 'function')
        ? (window.EngineBridge.getWidgetParameters() || [])
        : [];
      if (allParams.length === 0) {
        paramsBox.innerHTML = '<div style="font-size:0.71rem;color:#8b949e;">No exposed widget parameters on current selection (will save as a 0-parameter decorative component).</div>';
      } else {
        paramsBox.innerHTML = '';
        allParams.forEach((p) => {
          const pName = p.name || p.Name;
          const pType = p.type || p.Type || 'text';
          const lbl = document.createElement('label');
          lbl.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.73rem;color:#c9d1d9;cursor:pointer;';
          lbl.innerHTML = `<input type="checkbox" class="save-comp-param-chk" value="${this._escapeHtml(pName)}" checked style="accent-color:#388bfd;" /> <code>${this._escapeHtml(pName)}</code> <span style="color:#8b949e;font-size:0.68rem;">(${this._escapeHtml(pType)})</span>`;
          paramsBox.appendChild(lbl);
        });
      }
    }

    modal.style.display = 'flex';
  },

  _syncRevisionFields() {
    const existingSel = document.getElementById('saveCompExistingSelect');
    const bumpRow = document.getElementById('saveCompRevisionRow');
    const bumpSel = document.getElementById('saveCompBumpSelect');
    const verIn = document.getElementById('saveCompVersionInput');
    const nameIn = document.getElementById('saveCompNameInput');
    const descIn = document.getElementById('saveCompDescInput');
    const catSel = document.getElementById('saveCompCategorySelect');
    const tagsIn = document.getElementById('saveCompTagsInput');

    const cid = existingSel ? existingSel.value : '';
    if (!cid) {
      if (bumpRow) bumpRow.style.display = 'none';
      if (verIn) verIn.value = '1.0.0';
      return;
    }

    const found = this.items.find((c) => c.componentId === cid);
    if (bumpRow) bumpRow.style.display = 'flex';
    const curVer = (found && found.latestVersion) || '1.0.0';
    const bumpKind = (bumpSel && bumpSel.value) || 'minor';
    if (verIn) verIn.value = this._bumpVersion(curVer, bumpKind);
    if (found) {
      if (nameIn && !nameIn.value.trim()) nameIn.value = found.name;
      if (descIn && !descIn.value.trim()) descIn.value = found.description || '';
      if (catSel && found.category) catSel.value = found.category;
      if (tagsIn && !tagsIn.value.trim() && Array.isArray(found.tags)) tagsIn.value = found.tags.join(', ');
    }
  },

  closeSaveModal() {
    const modal = document.getElementById('saveComponentModal');
    if (modal) modal.style.display = 'none';
  },

  async submitSaveModal() {
    const nameIn = document.getElementById('saveCompNameInput');
    const descIn = document.getElementById('saveCompDescInput');
    const catSel = document.getElementById('saveCompCategorySelect');
    const tagsIn = document.getElementById('saveCompTagsInput');
    const existingSel = document.getElementById('saveCompExistingSelect');
    const verIn = document.getElementById('saveCompVersionInput');
    const changelogIn = document.getElementById('saveCompChangelogInput');
    const statusEl = document.getElementById('saveCompModalStatus');

    const name = nameIn ? nameIn.value.trim() : '';
    if (!name) {
      if (statusEl) { statusEl.style.color = '#f85149'; statusEl.textContent = 'Component name is required.'; }
      return;
    }

    const tags = (tagsIn ? tagsIn.value : '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const paramChks = document.querySelectorAll('.save-comp-param-chk');
    const hasParamCheckboxes = paramChks.length > 0;
    const selectedParamNames = [];
    paramChks.forEach((chk) => {
      if (chk.checked) selectedParamNames.push(chk.value);
    });

    const thumbSVG = this._buildPreviewSVG();
    const opts = {
      componentId: existingSel && existingSel.value ? existingSel.value : '',
      version: (verIn && verIn.value.trim()) || '1.0.0',
      name,
      description: descIn ? descIn.value.trim() : '',
      category: (catSel && catSel.value) || 'general',
      tags,
      thumbnailSvg: thumbSVG,
      filterParameters: hasParamCheckboxes,
      selectedParameterNames: selectedParamNames
    };

    const res = window.EngineBridge.createComponent(this._activeSelection, this._activeGroupId, opts);
    if (!res || !res.success || !res.composite) {
      const msg = (res && res.error) || 'Failed to package component in Go engine';
      if (statusEl) { statusEl.style.color = '#f85149'; statusEl.textContent = msg; }
      return;
    }

    const comp = res.composite;
    try {
      await this.saveToServer({
        componentId: comp.componentId,
        name: comp.name,
        description: comp.description || '',
        category: comp.category || 'general',
        tags: comp.tags || [],
        version: comp.version || '1.0.0',
        thumbnailSvg: comp.thumbnailSvg || thumbSVG,
        definitionJson: JSON.stringify(comp),
        contentSha256: comp.contentHash || '',
        changelog: changelogIn ? changelogIn.value.trim() : ''
      });
    } catch (err) {
      if (statusEl) { statusEl.style.color = '#f85149'; statusEl.textContent = 'Library save error: ' + err.message; }
      return;
    }

    this.closeSaveModal();
    await this.refreshList();
    if (typeof window.renderCompositesLibrary === 'function') window.renderCompositesLibrary();
    if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
      window.AppCoordinator.showNotification(`Saved Component "${comp.name}" (v${comp.version}) to Global Library`, 'success');
    }
  },

  async insertComponent(componentId, opts = {}) {
    try {
      const rec = await this.fetchComponent(componentId, opts.version || '');
      const def = JSON.parse(rec.definitionJson);
      const imp = window.EngineBridge.importLibraryComponent(def);
      if (!imp || !imp.success) {
        throw new Error((imp && imp.error) || 'Import into scene failed');
      }

      // Compute non-overlapping placement offset based on existing instances of this component
      const existingGroups = (window.EngineBridge && typeof window.EngineBridge.listGroups === 'function')
        ? (window.EngineBridge.listGroups() || [])
        : [];
      const sameCount = existingGroups.filter((g) => g.componentId === def.componentId).length;
      const offX = opts.offsetX !== undefined ? opts.offsetX : ((sameCount % 4) * 6);
      const offY = opts.offsetY !== undefined ? opts.offsetY : ((sameCount % 4) * 6);
      const scaleX = opts.scaleX || 1.0;
      const scaleY = opts.scaleY || 1.0;

      const inst = window.EngineBridge.instantiateComponent(def.componentId, opts.instanceName || '', offX, offY, scaleX, scaleY);
      if (!inst || !inst.success) {
        throw new Error((inst && inst.error) || 'Instantiation failed');
      }

      if (window.AppCoordinator) {
        if (inst.group && inst.group.id && typeof window.AppCoordinator.selectGroup === 'function') {
          window.AppCoordinator.selectGroup(inst.group.id);
        }
        window.AppCoordinator.recordHistoryImmediate();
        window.AppCoordinator.showNotification(`Inserted "${def.name}" as "${inst.group.name}"`, 'success');
      }
      if (typeof window.triggerRender === 'function') window.triggerRender();
      if (typeof window.renderLayersList === 'function') window.renderLayersList();
      if (typeof window.renderWidgetParametersOverview === 'function') window.renderWidgetParametersOverview();
      if (typeof window.renderCompositesLibrary === 'function') window.renderCompositesLibrary();
      return inst;
    } catch (err) {
      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        window.AppCoordinator.showNotification('Insert Component failed: ' + err.message, 'error');
      }
      return { success: false, error: err.message };
    }
  },

  async updatePlacedInstances(componentId) {
    try {
      const rec = await this.fetchComponent(componentId);
      const newDef = JSON.parse(rec.definitionJson);
      const groups = (window.EngineBridge && typeof window.EngineBridge.listGroups === 'function')
        ? (window.EngineBridge.listGroups() || [])
        : [];
      const matching = groups.filter((g) => g.componentId === componentId);
      if (matching.length === 0) {
        if (window.AppCoordinator) window.AppCoordinator.showNotification(`No placed instances of "${newDef.name}" in this project.`, 'info');
        return { updated: 0, blocked: 0 };
      }
      let updated = 0;
      let blocked = 0;
      for (const g of matching) {
        const res = window.EngineBridge.applyComponentUpdate(g.id, newDef, false);
        if (res && res.success) {
          updated++;
        } else {
          blocked++;
        }
      }
      if (typeof window.triggerRender === 'function') window.triggerRender();
      if (typeof window.renderWidgetParametersOverview === 'function') window.renderWidgetParametersOverview();
      if (window.AppCoordinator) {
        window.AppCoordinator.showNotification(
          `Updated ${updated} instance(s) of "${newDef.name}" to v${newDef.version}` + (blocked > 0 ? ` (${blocked} skipped due to breaking changes)` : ''),
          blocked > 0 ? 'warning' : 'success'
        );
      }
      return { updated, blocked };
    } catch (err) {
      if (window.AppCoordinator) window.AppCoordinator.showNotification('Update failed: ' + err.message, 'error');
      return { updated: 0, blocked: 0, error: err.message };
    }
  },

  async deleteComponent(componentId, name) {
    try {
      const usage = await this.fetchUsage(componentId);
      if (usage && usage.inUse) {
        const refs = []
          .concat((usage.parentComponents || []).map((c) => `Component: ${c}`))
          .concat((usage.projects || []).map((p) => `Project: ${p}`));
        const msg = `Cannot delete "${name}" because it is referenced by:\n- ${refs.join('\n- ')}`;
        if (window.AppCoordinator) window.AppCoordinator.showNotification(msg, 'warning');
        return { success: false, blocked: true, usage };
      }
      await this.deleteFromServer(componentId, false);
      await this.refreshList();
      if (window.AppCoordinator) window.AppCoordinator.showNotification(`Deleted component "${name}" from library`, 'info');
      return { success: true };
    } catch (err) {
      if (window.AppCoordinator) window.AppCoordinator.showNotification(err.message, 'warning');
      return { success: false, error: err.message };
    }
  }
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.ComponentLibrary.init());
  } else {
    window.ComponentLibrary.init();
  }
}
