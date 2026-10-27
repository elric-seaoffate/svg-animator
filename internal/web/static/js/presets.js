window.NodePresets = {
  _initialized: false,

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

  init() {
    if (this._initialized) return;
    this._initialized = true;

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
        this.presetKeys.forEach((k) => { this.preset[k].enabled = true; });
        this.syncAllRowsUI();
      });
    }

    const btnUnsetAll = document.getElementById('btnPresetUnsetAll');
    if (btnUnsetAll) {
      btnUnsetAll.addEventListener('click', () => {
        this.presetKeys.forEach((k) => { this.preset[k].enabled = false; });
        this.syncAllRowsUI();
      });
    }

    this.presetKeys.forEach((key) => {
      const chk = document.getElementById('presetChk-' + key);
      if (chk) {
        chk.addEventListener('change', (e) => {
          this.preset[key].enabled = e.target.checked;
          this.syncRowUI(key);
        });
      }

      const slider = document.getElementById('presetVal-' + key + 'Slider');
      const num = document.getElementById('presetVal-' + key + 'Num');
      if (slider && num) {
        slider.addEventListener('input', (e) => {
          num.value = e.target.value;
          this.preset[key].value = parseFloat(e.target.value);
        });
        num.addEventListener('input', (e) => {
          slider.value = e.target.value;
          this.preset[key].value = parseFloat(e.target.value);
        });
      }

      const single = document.getElementById('presetVal-' + key);
      if (single) {
        const updateSingle = (e) => {
          this.preset[key].value = e.target.value;
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
    this.presetKeys.forEach((key) => this.syncRowUI(key));
  },

  applyToNodeObject(node) {
    if (!node) return;
    this.presetKeys.forEach((key) => {
      const entry = this.preset[key];
      if (entry && entry.enabled) {
        node[key] = entry.value;
      }
    });
  },

  applyToActiveNode() {
    if (!window.DiagramNodes || window.DiagramNodes.activeId === null) {
      alert('Select a shape on the canvas or in the list first.');
      return;
    }
    const node = window.DiagramNodes.list.find((n) => n.id === window.DiagramNodes.activeId);
    if (!node) return;

    this.applyToNodeObject(node);
    window.DiagramNodes.selectNode(node.id, false);
    window.DiagramNodes.refreshAfterChange();
    if (window.HistoryManager) window.HistoryManager.recordImmediate();
  },

  applyToAllNodes() {
    if (!window.DiagramNodes || window.DiagramNodes.list.length === 0) return;
    window.DiagramNodes.list.forEach((node) => this.applyToNodeObject(node));
    if (window.DiagramNodes.activeId !== null) {
      window.DiagramNodes.selectNode(window.DiagramNodes.activeId, false);
    }
    window.DiagramNodes.refreshAfterChange();
    if (window.HistoryManager) window.HistoryManager.recordImmediate();
  },

  copyFromActiveNode() {
    if (!window.DiagramNodes || window.DiagramNodes.activeId === null) return;
    const node = window.DiagramNodes.list.find((n) => n.id === window.DiagramNodes.activeId);
    if (!node) return;

    this.presetKeys.forEach((key) => {
      if (node[key] !== undefined) {
        this.preset[key].value = node[key];
      }
    });
    this.syncAllRowsUI();
  }
};