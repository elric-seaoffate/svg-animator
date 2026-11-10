/**
 * Project Persistence & SQLite Library Manager (`window.ProjectManager`)
 *
 * Layer 3 (Operational Serialization & REST Client):
 *   - `serializeStudioState()`, `applyStudioState(schemaJsonStr)` (Schema v1.2.0)
 *   - `fetchProjectsList()`, `fetchProjectById(id)`,
 *     `postSaveProject(payload)`, `postDeleteProject(id)`
 *
 * Layer 1 (Project Library Modal UI & Keyboard Shortcut Bindings):
 *   - `init()`, `openModal()`, `closeModal()`, `setStatusMessage(msg, isError)`,
 *     `updateHeaderBadge()`, `refreshProjectsList()`, `renderProjectsList()`,
 *     `quickSave()`, `saveProject(saveAsNew, silentQuickSave)`,
 *     `loadProject(id)`, `deleteProject(id)`, `resetToNewProject()`
 */
window.ProjectManager = {
  currentProjectId: 0,
  currentProjectName: 'Untitled Project',
  currentProjectDesc: '',
  projectsList: [],
  _initialized: false,

  // =========================================================================
  // Layer 3: Operational Serialization & REST API Client
  // =========================================================================

  escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  serializeStudioState() {
    const trackedIds = (window.HistoryManager && Array.isArray(window.HistoryManager.trackedControlIds))
      ? window.HistoryManager.trackedControlIds
      : (window.SceneState ? window.SceneState.trackedControlIds : []);

    let controls = {};
    if (window.ControlStateAdaptor && window.SceneState) {
      window.ControlStateAdaptor.syncFromDOM(trackedIds);
      controls = window.SceneState.getControlsSnapshot(trackedIds);
    }

    const loadedPhoto = (window.SceneState && typeof window.SceneState.getLoadedPhoto === 'function')
      ? window.SceneState.getLoadedPhoto()
      : (typeof window.getLoadedPhoto === 'function' ? window.getLoadedPhoto() : null);

    const presetState = (window.NodePresets && typeof window.NodePresets.getState === 'function')
      ? window.NodePresets.getState()
      : {
          preset: window.NodePresets ? JSON.parse(JSON.stringify(window.NodePresets.preset)) : null,
          autoApplyToNewNodes: window.NodePresets ? !!window.NodePresets.autoApplyToNewNodes : true
        };

    const nodeState = (window.DiagramNodes && typeof window.DiagramNodes.getState === 'function')
      ? window.DiagramNodes.getState()
      : {
          nodes: window.DiagramNodes ? window.DiagramNodes.list : [],
          nodesCounter: window.DiagramNodes ? window.DiagramNodes.counter : 0
        };

    const flowState = (window.DataFlows && typeof window.DataFlows.getState === 'function')
      ? window.DataFlows.getState()
      : {
          flows: window.DataFlows ? window.DataFlows.list : [],
          flowsCounter: window.DataFlows ? window.DataFlows.counter : 0
        };

    const glowState = (window.Glows && typeof window.Glows.getState === 'function')
      ? window.Glows.getState()
      : {
          glows: window.Glows ? window.Glows.list : [],
          glowsCounter: window.Glows ? window.Glows.counter : 0
        };

    const rippleState = (window.Ripples && typeof window.Ripples.getState === 'function')
      ? window.Ripples.getState()
      : {
          ripples: window.Ripples ? window.Ripples.list : [],
          ripplesCounter: window.Ripples ? window.Ripples.counter : 0
        };

    return JSON.stringify({
      version: '1.2.0',
      controls: controls,
      loadedPhoto: loadedPhoto,
      presets: presetState.preset,
      autoApplyPreset: presetState.autoApplyToNewNodes,
      nodes: nodeState.nodes,
      nodesCounter: nodeState.nodesCounter,
      flows: flowState.flows,
      flowsCounter: flowState.flowsCounter,
      glows: glowState.glows,
      glowsCounter: glowState.glowsCounter,
      ripples: rippleState.ripples,
      ripplesCounter: rippleState.ripplesCounter
    });
  },

  applyStudioState(schemaJsonStr, options = { coordinate: true }) {
    const data = typeof schemaJsonStr === 'string' ? JSON.parse(schemaJsonStr) : schemaJsonStr;
    if (!data || typeof data !== 'object') return;

    if (typeof window.setLoadedPhoto === 'function') {
      window.setLoadedPhoto(data.loadedPhoto || null);
    } else if (window.SceneState) {
      window.SceneState.setLoadedPhoto(data.loadedPhoto || null);
    }

    if (data.loadedPhoto) {
      if (!data.controls) data.controls = {};
      data.controls.canvasPatternSelect = 'photo';
      if (!data.controls.photoFitSelect) data.controls.photoFitSelect = 'match';
    }

    if (data.controls && window.ControlStateAdaptor) {
      window.ControlStateAdaptor.syncToDOM(data.controls);
    }

    if (data.presets && window.NodePresets) {
      if (typeof window.NodePresets.setState === 'function') {
        window.NodePresets.setState({
          preset: data.presets,
          autoApplyToNewNodes: data.autoApplyPreset !== undefined ? !!data.autoApplyPreset : true
        });
      } else {
        window.NodePresets.preset = data.presets;
      }
    } else if (window.NodePresets) {
      if (typeof window.NodePresets.resetToDefaults === 'function') {
        window.NodePresets.resetToDefaults();
      }
    }

    if (window.DiagramNodes) {
      if (typeof window.DiagramNodes.setState === 'function') {
        window.DiagramNodes.setState({
          nodes: data.nodes || [],
          nodesCounter: data.nodesCounter || 0
        });
      } else {
        window.DiagramNodes.list = data.nodes || [];
        window.DiagramNodes.counter = data.nodesCounter || 0;
      }
    }

    if (window.DataFlows) {
      if (typeof window.DataFlows.setState === 'function') {
        window.DataFlows.setState({
          flows: data.flows || [],
          flowsCounter: data.flowsCounter || 0
        });
      } else {
        window.DataFlows.list = data.flows || [];
        window.DataFlows.counter = data.flowsCounter || 0;
      }
    }

    if (window.Glows) {
      if (typeof window.Glows.setState === 'function') {
        window.Glows.setState({
          glows: data.glows || [],
          glowsCounter: data.glowsCounter || 0
        });
      } else {
        window.Glows.list = data.glows || [];
        window.Glows.counter = data.glowsCounter || 0;
      }
    }

    if (window.Ripples) {
      if (typeof window.Ripples.setState === 'function') {
        window.Ripples.setState({
          ripples: data.ripples || [],
          ripplesCounter: data.ripplesCounter || 0
        });
      } else {
        window.Ripples.list = data.ripples || [];
        window.Ripples.counter = data.ripplesCounter || 0;
      }
    }

    if (window.HistoryManager) {
      window.HistoryManager.undoStack = [];
      window.HistoryManager.redoStack = [];
      window.HistoryManager.recordImmediate();
    }

    if (options && options.coordinate !== false && window.AppCoordinator && typeof window.AppCoordinator.coordinatePostRestore === 'function') {
      window.AppCoordinator.coordinatePostRestore({ source: 'direct_apply' });
    }
  },

  async fetchProjectsList() {
    const res = await fetch('/api/export/projects', { cache: 'no-store' });
    if (!res.ok) {
      const text = await res.text();
      throw new Error('HTTP ' + res.status + ': ' + text.trim());
    }
    return await res.json();
  },

  async fetchProjectById(id) {
    const res = await fetch('/api/export/projects/get?id=' + encodeURIComponent(id), { cache: 'no-store' });
    if (!res.ok) {
      const text = await res.text();
      throw new Error('HTTP ' + res.status + ': ' + text.trim());
    }
    return await res.json();
  },

  async postSaveProject(payload) {
    const res = await fetch('/api/export/projects/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error('HTTP ' + res.status + ': ' + text.trim());
    }
    return await res.json();
  },

  async postDeleteProject(id) {
    const res = await fetch('/api/export/projects/delete?id=' + encodeURIComponent(id), { method: 'POST' });
    if (!res.ok) {
      const text = await res.text();
      throw new Error('HTTP ' + res.status + ': ' + text.trim());
    }
    return true;
  },

  // =========================================================================
  // Layer 1: UI Presentation & Modal Bindings
  // =========================================================================

  init() {
    if (this._initialized) return;
    this._initialized = true;

    document.getElementById('btnOpenProjectsModal')?.addEventListener('click', () => this.openModal());
    document.getElementById('btnQuickSaveProject')?.addEventListener('click', () => this.quickSave());
    document.getElementById('btnCloseProjectsTop')?.addEventListener('click', () => this.closeModal());
    document.getElementById('btnCloseProjectsBottom')?.addEventListener('click', () => this.closeModal());
    document.getElementById('btnSaveProjectOverwrite')?.addEventListener('click', () => this.saveProject(false));
    document.getElementById('btnSaveProjectAsNew')?.addEventListener('click', () => this.saveProject(true));
    document.getElementById('btnExportSVA')?.addEventListener('click', () => this.exportSVA());
    document.getElementById('btnImportSVA')?.addEventListener('click', () => {
      document.getElementById('inputImportSVA')?.click();
    });
    document.getElementById('inputImportSVA')?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.importSVA(e.target.files[0]);
        e.target.value = '';
      }
    });
    document.getElementById('btnNewBlankProject')?.addEventListener('click', () => this.resetToNewProject());

    const searchIn = document.getElementById('projectSearchInput');
    if (searchIn) {
      searchIn.addEventListener('input', () => this.renderProjectsList());
    }

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.quickSave();
      }
    });

    this.updateHeaderBadge();
  },

  updateHeaderBadge() {
    const lbl = document.getElementById('activeProjectHeaderName');
    if (lbl) {
      lbl.textContent = this.currentProjectId > 0
        ? ('#' + this.currentProjectId + ' ' + this.currentProjectName)
        : (this.currentProjectName + ' (Unsaved)');
    }
    const overwriteBtn = document.getElementById('btnSaveProjectOverwrite');
    if (overwriteBtn) {
      overwriteBtn.disabled = this.currentProjectId <= 0;
      overwriteBtn.textContent = this.currentProjectId > 0
        ? ('💾 Overwrite #' + this.currentProjectId)
        : '💾 Overwrite Current';
    }
  },

  async openModal() {
    const modal = document.getElementById('projectsModal');
    if (!modal) return;

    const nameIn = document.getElementById('projectNameInput');
    const descIn = document.getElementById('projectDescInput');
    if (nameIn) nameIn.value = this.currentProjectName || 'Untitled Project';
    if (descIn) descIn.value = this.currentProjectDesc || '';

    this.updateHeaderBadge();
    modal.style.display = 'flex';
    await this.refreshProjectsList();
  },

  closeModal() {
    const modal = document.getElementById('projectsModal');
    if (modal) modal.style.display = 'none';
  },

  setStatusMessage(msg, isError = false) {
    const el = document.getElementById('projectModalStatus');
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? '#ff7b72' : '#58a6ff';
  },

  async refreshProjectsList() {
    const container = document.getElementById('projectsListContainer');
    if (container) {
      container.innerHTML = '<div class="stage-hint" style="padding: 1rem; text-align: center;">Loading projects...</div>';
    }
    try {
      this.projectsList = await this.fetchProjectsList();
      this.renderProjectsList();
      this.setStatusMessage('Ready (' + this.projectsList.length + ' saved in SQLite).');
    } catch (err) {
      this.projectsList = [];
      if (container) {
        container.innerHTML =
          '<div class="stage-hint" style="padding: 1.25rem; text-align: center; color: #ff7b72;">' +
          'Could not reach SQLite endpoint (<code>/api/export/projects</code>).<br>' +
          'Ensure the old server process was stopped and the binary was rebuilt.' +
          '</div>';
      }
      this.setStatusMessage('Error loading projects: ' + err.message, true);
    }
  },

  renderProjectsList() {
    const container = document.getElementById('projectsListContainer');
    if (!container) return;

    const query = (document.getElementById('projectSearchInput')?.value || '').trim().toLowerCase();
    const filtered = this.projectsList.filter((p) => {
      if (!query) return true;
      return (p.name && p.name.toLowerCase().includes(query)) ||
             (p.description && p.description.toLowerCase().includes(query));
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div class="stage-hint" style="padding: 1.5rem; text-align: center;">No saved projects found in SQLite library.</div>';
      return;
    }

    container.innerHTML = '';
    filtered.forEach((p) => {
      const isCurrent = p.id === this.currentProjectId;
      const row = document.createElement('div');
      row.className = 'flow-list-item' + (isCurrent ? ' selected' : '');
      row.style.borderLeftColor = isCurrent ? '#2ea043' : '#58a6ff';
      row.style.padding = '0.65rem 0.8rem';

      row.innerHTML =
        '<div style="display:flex; flex-direction:column; gap:0.2rem; flex:1;">' +
          '<div style="display:flex; align-items:center; gap:0.5rem;">' +
            '<strong style="color:#e6edf3; font-size:0.88rem;">#' + p.id + ' &bull; ' + this.escapeHTML(p.name) + '</strong>' +
            '<span class="active-dim-pill">' + p.canvasWidth + '&times;' + p.canvasHeight + '</span>' +
            (isCurrent ? '<span style="font-size:0.68rem; background:rgba(46,160,67,0.2); color:#3fb950; border:1px solid rgba(46,160,67,0.5); padding:0.05rem 0.4rem; border-radius:4px;">ACTIVE</span>' : '') +
          '</div>' +
          (p.description ? '<div style="font-size:0.76rem; color:#8b949e;">' + this.escapeHTML(p.description) + '</div>' : '') +
          '<div style="font-size:0.7rem; color:#6e7681; font-family:monospace;">Updated: ' + this.escapeHTML(p.updatedAt) + '</div>' +
        '</div>' +
        '<div style="display:flex; gap:0.4rem; align-items:center;">' +
          '<button type="button" class="btn-primary" style="padding:0.35rem 0.75rem; font-size:0.76rem;" onclick="window.ProjectManager.loadProject(' + p.id + '); event.stopPropagation();">📂 Load</button>' +
          '<button type="button" class="btn-secondary" style="padding:0.35rem 0.6rem; font-size:0.76rem;" title="Export this project as .sva" onclick="window.ProjectManager.exportSVAById(' + p.id + '); event.stopPropagation();">📦</button>' +
          '<button type="button" class="btn-danger" style="padding:0.35rem 0.6rem; font-size:0.76rem;" onclick="window.ProjectManager.deleteProject(' + p.id + '); event.stopPropagation();">🗑️</button>' +
        '</div>';

      row.onclick = () => this.loadProject(p.id);
      container.appendChild(row);
    });
  },

  async quickSave() {
    if (this.currentProjectId <= 0) {
      this.openModal();
      return;
    }
    await this.saveProject(false, true);
  },

  async saveProject(saveAsNew = false, silentQuickSave = false) {
    const nameIn = document.getElementById('projectNameInput');
    const descIn = document.getElementById('projectDescInput');

    const name = silentQuickSave
      ? (this.currentProjectName || 'Untitled Project')
      : ((nameIn ? nameIn.value.trim() : '') || this.currentProjectName || 'Untitled Project');
    const desc = silentQuickSave
      ? (this.currentProjectDesc || '')
      : (descIn ? descIn.value.trim() : '');

    const dims = window.AppCoordinator
      ? window.AppCoordinator.getCanvasDimensions()
      : {
          width: parseInt(document.getElementById('canvasWidthInput')?.value || 1280, 10) || 1280,
          height: parseInt(document.getElementById('canvasHeightInput')?.value || 720, 10) || 720
        };

    const payload = {
      id: saveAsNew ? 0 : this.currentProjectId,
      name: name,
      description: desc,
      canvasWidth: dims.width,
      canvasHeight: dims.height,
      schemaJson: this.serializeStudioState()
    };

    try {
      const saved = await this.postSaveProject(payload);

      this.currentProjectId = saved.id;
      this.currentProjectName = saved.name;
      this.currentProjectDesc = saved.description;
      this.updateHeaderBadge();

      if (silentQuickSave) {
        const quickBtn = document.getElementById('btnQuickSaveProject');
        if (quickBtn) {
          const orig = quickBtn.innerHTML;
          quickBtn.innerHTML = '✅ Saved!';
          setTimeout(() => { quickBtn.innerHTML = orig; }, 1400);
        }
      } else {
        this.setStatusMessage('✅ Saved project #' + saved.id + ' ("' + saved.name + '") to SQLite.');
        await this.refreshProjectsList();
      }
    } catch (err) {
      if (silentQuickSave) {
        if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
          window.AppCoordinator.showNotification('Quick save failed: ' + err.message, 'error');
        } else {
          alert('Quick save failed: ' + err.message);
        }
      } else {
        this.setStatusMessage('Save error: ' + err.message, true);
      }
    }
  },

  async loadProject(id) {
    try {
      this.setStatusMessage('Loading project #' + id + '...');
      const proj = await this.fetchProjectById(id);

      this.applyStudioState(proj.schemaJson, { coordinate: false });
      this.currentProjectId = proj.id;
      this.currentProjectName = proj.name;
      this.currentProjectDesc = proj.description || '';

      const nameIn = document.getElementById('projectNameInput');
      const descIn = document.getElementById('projectDescInput');
      if (nameIn) nameIn.value = this.currentProjectName;
      if (descIn) descIn.value = this.currentProjectDesc;

      this.updateHeaderBadge();
      this.renderProjectsList();

      if (window.AppCoordinator && typeof window.AppCoordinator.coordinatePostRestore === 'function') {
        window.AppCoordinator.coordinatePostRestore({ source: 'project', projectId: proj.id });
      }

      this.setStatusMessage('✅ Loaded project #' + proj.id + ' ("' + proj.name + '").');
      setTimeout(() => this.closeModal(), 300);
    } catch (err) {
      this.setStatusMessage('Failed to load project: ' + err.message, true);
    }
  },

  async deleteProject(id) {
    if (!confirm('Delete project #' + id + ' permanently from the SQLite library?')) return;
    try {
      await this.postDeleteProject(id);
      if (this.currentProjectId === id) {
        this.currentProjectId = 0;
        this.updateHeaderBadge();
      }
      this.setStatusMessage('🗑️ Deleted project #' + id + '.');
      await this.refreshProjectsList();
    } catch (err) {
      this.setStatusMessage('Delete failed: ' + err.message, true);
    }
  },

  resetToNewProject() {
    if (!confirm('Clear the canvas and start a fresh blank project?')) return;
    this.currentProjectId = 0;
    this.currentProjectName = 'Untitled Project';
    this.currentProjectDesc = '';

    if (typeof window.setLoadedPhoto === 'function') window.setLoadedPhoto(null);
    if (window.ControlStateAdaptor) {
      window.ControlStateAdaptor.syncToDOM({
        canvasPatternSelect: 'blueprint',
        canvasWidthInput: 1280,
        canvasHeightInput: 720
      });
    } else {
      const patSel = document.getElementById('canvasPatternSelect');
      if (patSel) patSel.value = 'blueprint';
      const wIn = document.getElementById('canvasWidthInput');
      const hIn = document.getElementById('canvasHeightInput');
      if (wIn) wIn.value = 1280;
      if (hIn) hIn.value = 720;
    }

    if (window.DiagramNodes) {
      if (typeof window.DiagramNodes.setState === 'function') window.DiagramNodes.setState({ nodes: [], nodesCounter: 0 });
    }
    if (window.DataFlows) {
      if (typeof window.DataFlows.setState === 'function') window.DataFlows.setState({ flows: [], flowsCounter: 0 });
    }
    if (window.Glows) {
      if (typeof window.Glows.setState === 'function') window.Glows.setState({ glows: [], glowsCounter: 0 });
    }
    if (window.Ripples) {
      if (typeof window.Ripples.setState === 'function') window.Ripples.setState({ ripples: [], ripplesCounter: 0 });
    }
    if (window.NodePresets) {
      if (typeof window.NodePresets.resetToDefaults === 'function') {
        window.NodePresets.resetToDefaults();
      }
    }

    if (window.HistoryManager) {
      window.HistoryManager.undoStack = [];
      window.HistoryManager.redoStack = [];
      window.HistoryManager.recordImmediate();
    }

    this.updateHeaderBadge();
    this.renderProjectsList();

    if (window.AppCoordinator && typeof window.AppCoordinator.coordinatePostRestore === 'function') {
      window.AppCoordinator.coordinatePostRestore({ source: 'new_project' });
    }

    this.setStatusMessage('Started a new blank project.');
  },

  async exportSVA() {
    try {
      this.setStatusMessage('Encoding .sva project package...');
      const name = (document.getElementById('projectNameInput')?.value || this.currentProjectName || 'Untitled Project').trim();
      const desc = (document.getElementById('projectDescInput')?.value || this.currentProjectDesc || '').trim();
      const stateStr = this.serializeStudioState();
      let stateObj = null;
      try { stateObj = JSON.parse(stateStr); } catch (_) {}

      // Resolve any blob: or remote photo URLs to base64 before bundling
      if (stateObj && stateObj.loadedPhoto) {
        const photo = stateObj.loadedPhoto;
        const photoUrl = photo.src || photo.dataUrl || photo.dataURL || photo.url;
        if (!photo.b64 && photoUrl && (photoUrl.startsWith('blob:') || photoUrl.startsWith('http:') || photoUrl.startsWith('https:'))) {
          try {
            const resp = await fetch(photoUrl);
            const blob = await resp.blob();
            const reader = new FileReader();
            const dataUrl = await new Promise((resolve, reject) => {
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            if (dataUrl && typeof dataUrl === 'string' && dataUrl.includes(',')) {
              photo.b64 = dataUrl.split(',')[1];
            }
          } catch (e) {
            console.warn('Failed to resolve photo URL to base64 for SVA export:', e);
          }
        }
      }

      let b64 = null;
      let filename = (name || 'project').replace(/[^a-zA-Z0-9_\-]/g, '_') + '.sva';

      if (window.EngineBridge && typeof window.EngineBridge.encodeSVA === 'function' && window.EngineBridge.isReady()) {
        const wasmRes = window.EngineBridge.encodeSVA(name, desc, stateObj);
        if (wasmRes && wasmRes.success && wasmRes.dataB64) {
          b64 = wasmRes.dataB64;
          if (wasmRes.filename) filename = wasmRes.filename;
        } else if (wasmRes && wasmRes.error) {
          throw new Error(wasmRes.error);
        }
      }

      if (!b64) {
        // Fallback to server REST endpoint
        const res = await fetch('/api/projects/export-sva', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name, description: desc, schemaJson: stateObj })
        });
        if (!res.ok) {
          throw new Error('Server SVA export failed: ' + (await res.text()));
        }
        const blob = await res.blob();
        this._downloadBlob(blob, filename);
        this.setStatusMessage('Exported .sva package: ' + filename);
        return;
      }

      // Convert base64 to Blob and trigger browser download
      const binaryStr = atob(b64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/vnd.svg-animator.project+zip' });
      this._downloadBlob(blob, filename);
      this.setStatusMessage('Exported .sva package: ' + filename + ' (' + (bytes.length / 1024).toFixed(1) + ' KB)');
    } catch (err) {
      console.error('SVA export error:', err);
      this.setStatusMessage('Export .sva failed: ' + err.message, true);
    }
  },

  async exportSVAById(id) {
    try {
      this.setStatusMessage('Fetching SVA package for project #' + id + '...');
      const res = await fetch('/api/projects/export-sva?id=' + encodeURIComponent(id));
      if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (await res.text()));
      const blob = await res.blob();
      const p = this.projectsList.find((item) => Number(item.id) === Number(id));
      const filename = (p ? p.name : ('project_' + id)).replace(/[^a-zA-Z0-9_\-]/g, '_') + '.sva';
      this._downloadBlob(blob, filename);
      this.setStatusMessage('Downloaded .sva package: ' + filename);
    } catch (err) {
      this.setStatusMessage('Export failed: ' + err.message, true);
    }
  },

  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  async importSVA(file) {
    if (!file) return;
    try {
      this.setStatusMessage('Reading .sva package: ' + file.name + '...');

      // Read file into ArrayBuffer
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      const b64 = btoa(binary);

      let decodedState = null;
      let manifest = null;

      if (window.EngineBridge && typeof window.EngineBridge.decodeSVA === 'function' && window.EngineBridge.isReady()) {
        const wasmRes = window.EngineBridge.decodeSVA(b64);
        if (wasmRes && wasmRes.success) {
          decodedState = wasmRes.state;
          manifest = wasmRes.manifest;
        } else if (wasmRes && wasmRes.error) {
          throw new Error(wasmRes.error);
        }
      }

      if (!decodedState) {
        // Fallback to server REST endpoint
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/projects/import-sva', {
          method: 'POST',
          body: formData
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error('Import failed: ' + errText);
        }
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Server rejected SVA package');
        decodedState = data.schemaJson;
        manifest = data.manifest;
      }

      // Apply the decoded state transactionally
      this.applyStudioState(decodedState);

      const projName = (manifest && manifest.name) ? manifest.name : file.name.replace(/\.sva$/i, '');
      const projDesc = (manifest && manifest.description) ? manifest.description : '';

      this.currentProjectId = 0; // External import
      this.currentProjectName = projName;
      this.currentProjectDesc = projDesc;

      const nameIn = document.getElementById('projectNameInput');
      const descIn = document.getElementById('projectDescInput');
      if (nameIn) nameIn.value = projName;
      if (descIn) descIn.value = projDesc;

      this.updateHeaderBadge();
      this.setStatusMessage('Successfully imported .sva: ' + projName);

      if (window.AppCoordinator && typeof window.AppCoordinator.coordinatePostRestore === 'function') {
        window.AppCoordinator.coordinatePostRestore({ source: 'sva_import' });
      }
    } catch (err) {
      console.error('SVA import error:', err);
      this.setStatusMessage('Import failed: ' + err.message, true);
    }
  }
};
