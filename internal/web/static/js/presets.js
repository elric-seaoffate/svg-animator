/**
 * Shape Presets Module (`window.NodePresets`)
 *
 * Layer 3 (Operational API):
 *   - `getState()`, `setState(data)`, `setPresetParam(key, value, enabled)`,
 *     `setAllEnabled(enabled)`, `applyToNodeObject(node)`, `extractFromNodeObject(node)`
 *   - Zero direct DOM dependencies.
 *
 * Layer 1 (UI Presentation & Compatibility):
 *   - `init()`, `syncRowUI(key)`, `syncAllRowsUI()`,
 *     `applyToActiveNode()`, `applyToAllNodes()`, `copyFromActiveNode()`
 */
window.NodePresets = {
  _initialized: false,
  autoApplyToNewNodes: true,

  presetKeys: [
    'width',
    'height',
    'fillColor',
    'strokeColor',
    'textColor',
    'fontSize',
    'fillOpacity',
    'strokeWidth',
    'strokeStyle',
    'shape',
    'anim'
  ],

  preset: {
    width:       { enabled: true,  value: 170 },
    height:      { enabled: false, value: 80 },
    fillColor:   { enabled: true,  value: '#161b22' },
    strokeColor: { enabled: true,  value: '#58a6ff' },
    textColor:   { enabled: true,  value: '#e6edf3' },
    fontSize:    { enabled: true,  value: 15 },
    fillOpacity: { enabled: false, value: 0.92 },
    strokeWidth: { enabled: false, value: 2 },
    strokeStyle: { enabled: false, value: 'solid' },
    shape:       { enabled: false, value: 'rounded' },
    anim:        { enabled: false, value: 'none' }
  },

  // =========================================================================
  // Layer 3: Operational Functionality (Zero DOM Dependencies)
  // =========================================================================

  getState() {
    return {
      preset: JSON.parse(JSON.stringify(this.preset)),
      autoApplyToNewNodes: !!this.autoApplyToNewNodes
    };
  },

  setState(data) {
    if (!data || typeof data !== 'object') return this.getState();
    const sourcePreset = data.preset && typeof data.preset === 'object' ? data.preset : data;
    this.presetKeys.forEach((key) => {
      if (sourcePreset[key] && typeof sourcePreset[key] === 'object') {
        this.preset[key] = {
          enabled: !!sourcePreset[key].enabled,
          value: sourcePreset[key].value
        };
      }
    });
    if (data.autoApplyToNewNodes !== undefined) {
      this.autoApplyToNewNodes = !!data.autoApplyToNewNodes;
    } else if (data.autoApplyPreset !== undefined) {
      this.autoApplyToNewNodes = !!data.autoApplyPreset;
    }
    return this.getState();
  },

  setPresetParam(key, value, enabled) {
    if (!this.preset[key]) return false;
    if (value !== undefined) {
      this.preset[key].value = value;
    }
    if (enabled !== undefined) {
      this.preset[key].enabled = !!enabled;
    }
    return true;
  },

  setAllEnabled(enabled) {
    const flag = !!enabled;
    this.presetKeys.forEach((k) => {
      if (this.preset[k]) {
        this.preset[k].enabled = flag;
      }
    });
  },

  applyToNodeObject(node) {
    if (!node || typeof node !== 'object') return false;
    let changed = false;
    this.presetKeys.forEach((key) => {
      const entry = this.preset[key];
      if (entry && entry.enabled) {
        node[key] = entry.value;
        changed = true;
      }
    });
    return changed;
  },

  extractFromNodeObject(node) {
    if (!node || typeof node !== 'object') return false;
    this.presetKeys.forEach((key) => {
      if (node[key] !== undefined && this.preset[key]) {
        this.preset[key].value = node[key];
      }
    });
    return true;
  },

  // =========================================================================
  // Layer 1: UI Presentation & DOM Bindings
  // =========================================================================

  init() {
    if (this._initialized) return;
    this._initialized = true;

    const autoChk = document.getElementById('chkAutoApplyPreset');
    if (autoChk) {
      this.autoApplyToNewNodes = !!autoChk.checked;
      autoChk.addEventListener('change', (e) => {
        this.autoApplyToNewNodes = !!e.target.checked;
        if (window.SceneState) {
          window.SceneState.setControl('chkAutoApplyPreset', this.autoApplyToNewNodes);
        }
      });
    }

    const btnSnapInline = document.getElementById('btnSnapNodeToPreset');
    if (btnSnapInline) btnSnapInline.addEventListener('click', () => this.applyToActiveNode());

    const btnCopyInline = document.getElementById('btnCopyNodeToPreset');
    if (btnCopyInline) btnCopyInline.addEventListener('click', () => this.copyFromActiveNode());

    const btnApplySel = document.getElementById('btnPresetApplySelected');
    if (btnApplySel) btnApplySel.addEventListener('click', () => this.applyToActiveNode());

    const btnApplyAll = document.getElementById('btnPresetApplyAll');
    if (btnApplyAll) btnApplyAll.addEventListener('click', () => this.applyToAllNodes());

    const btnSetAll = document.getElementById('btnPresetSetAll');
    if (btnSetAll) {
      btnSetAll.addEventListener('click', () => {
        this.setAllEnabled(true);
        this.syncAllRowsUI();
      });
    }

    const btnUnsetAll = document.getElementById('btnPresetUnsetAll');
    if (btnUnsetAll) {
      btnUnsetAll.addEventListener('click', () => {
        this.setAllEnabled(false);
        this.syncAllRowsUI();
      });
    }

    this.presetKeys.forEach((key) => {
      const chk = document.getElementById('presetChk-' + key);
      if (chk) {
        chk.addEventListener('change', (e) => {
          this.setPresetParam(key, undefined, e.target.checked);
          this.syncRowUI(key);
        });
      }

      const slider = document.getElementById('presetVal-' + key + 'Slider');
      const num = document.getElementById('presetVal-' + key + 'Num');
      if (slider && num) {
        slider.addEventListener('input', (e) => {
          num.value = e.target.value;
          this.setPresetParam(key, parseFloat(e.target.value));
        });
        num.addEventListener('input', (e) => {
          slider.value = e.target.value;
          this.setPresetParam(key, parseFloat(e.target.value));
        });
      }

      const single = document.getElementById('presetVal-' + key);
      if (single) {
        const updateSingle = (e) => {
          this.setPresetParam(key, e.target.value);
        };
        single.addEventListener('input', updateSingle);
        single.addEventListener('change', updateSingle);
      }
    });

    this.syncAllRowsUI();
  },

  syncRowUI(key) {
    const entry = this.preset[key];
    if (!entry) return;
    const row = document.getElementById('presetRow-' + key);
    const chk = document.getElementById('presetChk-' + key);
    const pill = document.getElementById('presetPill-' + key);

    if (chk) chk.checked = !!entry.enabled;
    if (row) {
      row.classList.toggle('is-set', !!entry.enabled);
      row.classList.toggle('is-unset', !entry.enabled);
    }
    if (pill) {
      pill.textContent = entry.enabled ? 'SET' : 'UNSET';
      pill.className = 'preset-state-pill ' + (entry.enabled ? 'pill-set' : 'pill-unset');
    }

    const slider = document.getElementById('presetVal-' + key + 'Slider');
    const num = document.getElementById('presetVal-' + key + 'Num');
    const single = document.getElementById('presetVal-' + key);

    if (slider) slider.value = entry.value;
    if (num) num.value = entry.value;
    if (single) single.value = entry.value;
  },

  syncAllRowsUI() {
    const autoChk = document.getElementById('chkAutoApplyPreset');
    if (autoChk) {
      autoChk.checked = !!this.autoApplyToNewNodes;
    }
    this.presetKeys.forEach((key) => this.syncRowUI(key));
  },

  applyToActiveNode() {
    if (!window.DiagramNodes || window.DiagramNodes.activeId === null) {
      alert('Select a shape on the canvas or in the list first.');
      return;
    }
    const node = window.DiagramNodes.getNode(window.DiagramNodes.activeId);
    if (!node) return;

    this.applyToNodeObject(node);
    window.DiagramNodes.selectNode(node.id, false);
    window.DiagramNodes.refreshAfterChange();
    if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
    else if (window.HistoryManager) window.HistoryManager.recordImmediate();
  },

  applyToAllNodes() {
    if (!window.DiagramNodes || window.DiagramNodes.list.length === 0) return;
    window.DiagramNodes.list.forEach((node) => this.applyToNodeObject(node));
    if (window.DiagramNodes.activeId !== null) {
      window.DiagramNodes.selectNode(window.DiagramNodes.activeId, false);
    }
    window.DiagramNodes.refreshAfterChange();
    if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
    else if (window.HistoryManager) window.HistoryManager.recordImmediate();
  },

  copyFromActiveNode() {
    if (!window.DiagramNodes || window.DiagramNodes.activeId === null) return;
    const node = window.DiagramNodes.getNode(window.DiagramNodes.activeId);
    if (!node) return;

    this.extractFromNodeObject(node);
    this.syncAllRowsUI();
  }
};
