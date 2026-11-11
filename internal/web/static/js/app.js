/**
 * Main Studio UI Controller & Initialization (`app.js`)
 *
 * Layer 1 (UI Presentation & Control Bindings):
 *   - Accordion expand/collapse (`window.openAccordionById`, `window.toggleAllAccordions`)
 *   - Canvas preset, orientation, background pattern, and photo crop UI bindings
 *   - Paired slider/number input synchronization and settings panel listeners
 *   - Standalone SVG/HTML download handlers
 *   - Shape Registry UI dropdown population (`window.populateShapeDropdowns`)
 *
 * Delegates Layer 2 coordination to `window.AppCoordinator` (`coordinator.js`)
 * and Layer 3 scene state / SVG compilation to `window.SceneState` (`scene-state.js`).
 */

// =========================================================================
// Layer 1 (UI Presentation): Shape Registry Dropdown Population & Unknown Shape Handling
// =========================================================================

function ensureShapeInDropdown(selectEl, shapeId) {
  if (!selectEl) return;
  if (!window.ShapeRegistry || typeof window.ShapeRegistry.has !== 'function') return;

  // Remove any previous temporary unknown shape option
  const existingTemp = selectEl.querySelector ? selectEl.querySelector('option[data-unknown-shape="true"]') : null;
  if (existingTemp) {
    if (typeof existingTemp.remove === 'function') {
      existingTemp.remove();
    } else if (existingTemp.parentElement) {
      existingTemp.parentElement.removeChild(existingTemp);
    }
  }

  if (window.ShapeRegistry.has(shapeId)) {
    selectEl.value = shapeId;
  } else if (shapeId) {
    // Add temporary disabled option to represent the unknown/legacy shape
    // without mutating the underlying data
    const tempOpt = document.createElement('option');
    tempOpt.value = shapeId;
    tempOpt.textContent = 'Unknown Shape: ' + shapeId;
    tempOpt.disabled = true;
    tempOpt.selected = true;
    tempOpt.setAttribute('data-unknown-shape', 'true');
    if (tempOpt.dataset) {
      tempOpt.dataset.unknownShape = 'true';
    }
    if (selectEl.firstChild) {
      selectEl.insertBefore(tempOpt, selectEl.firstChild);
    } else {
      selectEl.appendChild(tempOpt);
    }
    selectEl.value = shapeId;
  }
}

function populateShapeDropdowns() {
  if (!window.ShapeRegistry || typeof window.ShapeRegistry.getAll !== 'function') {
    return; // Preserve existing HTML fallback options
  }

  const shapes = window.ShapeRegistry.getAll();
  const dropdownIds = ['nodeShapeSelect', 'presetVal-shape'];

  dropdownIds.forEach((id) => {
    const selectEl = document.getElementById(id);
    if (!selectEl) return;

    const currentVal = selectEl.value;
    selectEl.innerHTML = '';
    if (Array.isArray(selectEl.children)) {
      selectEl.children.length = 0;
    }

    shapes.forEach((shape) => {
      const opt = document.createElement('option');
      opt.value = shape.id;
      opt.textContent = shape.displayName;
      selectEl.appendChild(opt);
    });

    // Clean up temporary unknown option on user change to a supported shape
    if (!selectEl._shapeChangeCleanupAttached && typeof selectEl.addEventListener === 'function') {
      selectEl._shapeChangeCleanupAttached = true;
      selectEl.addEventListener('change', (e) => {
        if (window.ShapeRegistry && window.ShapeRegistry.has(e.target.value)) {
          const temp = selectEl.querySelector ? selectEl.querySelector('option[data-unknown-shape="true"]') : null;
          if (temp) {
            if (typeof temp.remove === 'function') temp.remove();
            else if (temp.parentElement) temp.parentElement.removeChild(temp);
          }
        }
      });
    }

    ensureShapeInDropdown(selectEl, currentVal);
  });
}

window.ensureShapeInDropdown = ensureShapeInDropdown;
window.populateShapeDropdowns = populateShapeDropdowns;

// =========================================================================
// Layer 1 (Export Adapter): SVG XML Parsing, Validation, and Serialization
// =========================================================================

window.SVGExportAdapter = {
  serialize(rawSvg) {
    if (!rawSvg) throw new Error('SVG generation returned empty.');
    if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
      throw new Error('SVGExportAdapter requires a browser DOM environment with DOMParser and XMLSerializer.');
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(rawSvg, 'image/svg+xml');

    const parserError = xmlDoc.getElementsByTagName('parsererror');
    if (parserError.length > 0) {
      throw new Error('XML Parsing Failed: ' + parserError[0].textContent);
    }

    const svgRoot = xmlDoc.documentElement;
    const XLINK_NS = 'http://www.w3.org/1999/xlink';

    if (!svgRoot.hasAttribute('xmlns:xlink')) {
      svgRoot.setAttribute('xmlns:xlink', XLINK_NS);
    }

    const elementsWithHref = xmlDoc.querySelectorAll('[href]');
    elementsWithHref.forEach((el) => {
      const hrefVal = el.getAttribute('href');
      if (hrefVal) {
        el.setAttributeNS(XLINK_NS, 'xlink:href', hrefVal);
      }
    });

    const serializer = new XMLSerializer();
    return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + serializer.serializeToString(svgRoot);
  }
};

window.serializeSVGForExport = function(rawSvg) {
  if (window.SVGExportAdapter && typeof window.SVGExportAdapter.serialize === 'function') {
    return window.SVGExportAdapter.serialize(rawSvg);
  }
  if (window.SceneState && typeof window.SceneState.serializeSVGForExport === 'function') {
    return window.SceneState.serializeSVGForExport(rawSvg);
  }
  throw new Error('SVG export serialization requires SVGExportAdapter in browser environments.');
};

// =========================================================================
// Layer 1: Workspace Controller (Sliding Drawers, Icon Rails & Viewport HUD)
// =========================================================================

window.WorkspaceController = {
  leftDrawerOpen: true,
  rightDrawerOpen: true,
  isMaximized: false,
  savedLeftState: true,
  savedRightState: true,
  lastLeftAccId: 'acc-background',
  lastRightAccId: 'acc-playback',
  _initialized: false,

  toolTitles: {
    'acc-background': 'Canvas & Background',
    'acc-nodes': 'Diagram Shapes & Text',
    'acc-presets': 'Shape Presets',
    'acc-flows': 'Data Flows & Connectors',
    'acc-glows': 'Hotspots & Glows',
    'acc-ripples': 'Water Ripples',
    'acc-layers': 'Layers & Objects',
    'acc-playback': 'Scene & Timeline',
    'acc-camera': 'Camera Rig & Motion',
    'acc-optics': 'Optical Effects',
    'acc-frame': 'Presentation Frame',
    'acc-export': 'Export & Render Studio'
  },

  showToolPanel(toolId) {
    if (!toolId) return;
    const isLeft = ['acc-background', 'acc-nodes', 'acc-presets', 'acc-flows', 'acc-glows', 'acc-ripples', 'acc-layers'].includes(toolId);
    const isRight = ['acc-playback', 'acc-camera', 'acc-optics', 'acc-frame', 'acc-export'].includes(toolId);
    if (!isLeft && !isRight) return;

    if (isLeft) {
      this.lastLeftAccId = toolId;
      if (!this.leftDrawerOpen) this.openLeftDrawer();

      const titleEl = document.getElementById('leftDrawerTitle');
      if (titleEl && this.toolTitles[toolId]) {
        titleEl.textContent = this.toolTitles[toolId];
      }

      const objectTools = ['acc-nodes', 'acc-flows', 'acc-glows', 'acc-ripples', 'acc-layers'];
      const leftDrawer = document.getElementById('leftDrawer');
      if (leftDrawer && leftDrawer.classList) {
        leftDrawer.classList.toggle('expanded-inspector', objectTools.includes(toolId));
      }

      if (window.FloatingPropertiesEditor && window.FloatingPropertiesEditor.isOpen) {
        const typeMap = {
          'acc-nodes': 'node',
          'acc-flows': 'flow',
          'acc-glows': 'glow',
          'acc-ripples': 'ripple',
          'acc-layers': 'image'
        };
        if (typeMap[toolId] !== window.FloatingPropertiesEditor.activeType) {
          window.FloatingPropertiesEditor.close();
        }
      }

      const leftSections = ['acc-background', 'acc-nodes', 'acc-presets', 'acc-flows', 'acc-glows', 'acc-ripples', 'acc-layers'];
      leftSections.forEach((secId) => {
        const sec = document.getElementById(secId);
        if (sec && sec.classList) {
          const match = (secId === toolId);
          sec.classList.toggle('active-tool', match);
          sec.classList.toggle('open', match);
        }
      });
      this.syncRailForAccordion(toolId);
    } else if (isRight) {
      this.lastRightAccId = toolId;
      if (!this.rightDrawerOpen) this.openRightDrawer();

      if (window.FloatingPropertiesEditor && window.FloatingPropertiesEditor.isOpen) {
        window.FloatingPropertiesEditor.close();
      }

      const titleEl = document.getElementById('rightDrawerTitle');
      if (titleEl && this.toolTitles[toolId]) {
        titleEl.textContent = this.toolTitles[toolId];
      }

      const domSectionId = (toolId === 'acc-frame') ? 'acc-optics' : toolId;
      const rightSections = ['acc-playback', 'acc-camera', 'acc-optics', 'acc-export'];
      rightSections.forEach((secId) => {
        const sec = document.getElementById(secId);
        if (sec && sec.classList) {
          const match = (secId === domSectionId);
          sec.classList.toggle('active-tool', match);
          sec.classList.toggle('open', match);
          if (secId === 'acc-optics') {
            sec.classList.toggle('show-optics', toolId === 'acc-optics');
            sec.classList.toggle('show-frame', toolId === 'acc-frame');
          }
        }
      });
      this.syncRailForAccordion(toolId);
    }
    this._syncOverlays();
  },

  toggleLeftDrawer() {
    if (this.leftDrawerOpen) this.closeLeftDrawer();
    else this.openLeftDrawer();
  },

  openLeftDrawer() {
    this.leftDrawerOpen = true;
    const drawer = document.getElementById('leftDrawer');
    const toggleBtn = document.getElementById('railBtn-toggleLeft');
    const closeBtn = document.getElementById('btnCollapseLeftDrawer');
    if (drawer) {
      drawer.classList.remove('collapsed');
      drawer.removeAttribute('aria-hidden');
    }
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'true');
      const icon = toggleBtn.querySelector('.rail-icon');
      if (icon) icon.textContent = '◀';
    }
    if (closeBtn) closeBtn.setAttribute('aria-expanded', 'true');

    // On compact screens (< 1440px), auto-collapse opposite drawer to preserve canvas space
    if (typeof window !== 'undefined' && window.innerWidth && window.innerWidth < 1440 && this.rightDrawerOpen) {
      this.closeRightDrawer();
    }

    if (this.lastLeftAccId) {
      this.showToolPanel(this.lastLeftAccId);
    }

    this._syncOverlays();
    this._syncBackdrop();
  },

  closeLeftDrawer() {
    this.leftDrawerOpen = false;
    const drawer = document.getElementById('leftDrawer');
    const toggleBtn = document.getElementById('railBtn-toggleLeft');
    const closeBtn = document.getElementById('btnCollapseLeftDrawer');
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    const shouldRestoreFocus = !!(activeEl && drawer && typeof drawer.contains === 'function' && drawer.contains(activeEl));

    if (drawer) {
      drawer.classList.add('collapsed');
      drawer.classList.remove('expanded-inspector');
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'false');
      const icon = toggleBtn.querySelector('.rail-icon');
      if (icon) icon.textContent = '▶';
    }
    if (closeBtn) closeBtn.setAttribute('aria-expanded', 'false');
    document.querySelectorAll('.icon-rail-left .icon-rail-btn:not(.icon-rail-toggle)').forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-expanded', 'false');
    });

    if (shouldRestoreFocus && toggleBtn && typeof toggleBtn.focus === 'function') {
      toggleBtn.focus();
    }

    this._syncOverlays();
    this._syncBackdrop();
  },

  toggleRightDrawer() {
    if (this.rightDrawerOpen) this.closeRightDrawer();
    else this.openRightDrawer();
  },

  openRightDrawer() {
    this.rightDrawerOpen = true;
    const drawer = document.getElementById('rightDrawer');
    const toggleBtn = document.getElementById('railBtn-toggleRight');
    const closeBtn = document.getElementById('btnCollapseRightDrawer');
    if (drawer) {
      drawer.classList.remove('collapsed');
      drawer.removeAttribute('aria-hidden');
    }
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'true');
      const icon = toggleBtn.querySelector('.rail-icon');
      if (icon) icon.textContent = '▶';
    }
    if (closeBtn) closeBtn.setAttribute('aria-expanded', 'true');

    if (typeof window !== 'undefined' && window.innerWidth && window.innerWidth < 1440 && this.leftDrawerOpen) {
      this.closeLeftDrawer();
    }

    if (this.lastRightAccId) {
      this.showToolPanel(this.lastRightAccId);
    }

    this._syncOverlays();
    this._syncBackdrop();
  },

  closeRightDrawer() {
    this.rightDrawerOpen = false;
    const drawer = document.getElementById('rightDrawer');
    const toggleBtn = document.getElementById('railBtn-toggleRight');
    const closeBtn = document.getElementById('btnCollapseRightDrawer');
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    const shouldRestoreFocus = !!(activeEl && drawer && typeof drawer.contains === 'function' && drawer.contains(activeEl));

    if (drawer) {
      drawer.classList.add('collapsed');
      drawer.classList.remove('expanded-inspector');
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'false');
      const icon = toggleBtn.querySelector('.rail-icon');
      if (icon) icon.textContent = '◀';
    }
    if (closeBtn) closeBtn.setAttribute('aria-expanded', 'false');
    document.querySelectorAll('.icon-rail-right .icon-rail-btn:not(.icon-rail-toggle)').forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-expanded', 'false');
    });

    if (shouldRestoreFocus && toggleBtn && typeof toggleBtn.focus === 'function') {
      toggleBtn.focus();
    }

    this._syncOverlays();
    this._syncBackdrop();
  },

  toggleMaximizedCanvas() {
    this.setMaximized(!this.isMaximized);
  },

  setMaximized(maximized) {
    this.isMaximized = !!maximized;
    const maxBtn = document.getElementById('btnMaximizeCanvas');
    if (this.isMaximized) {
      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
      const leftEl = document.getElementById('leftDrawer');
      const rightEl = document.getElementById('rightDrawer');
      const focusInDrawer = !!(activeEl && ((leftEl && typeof leftEl.contains === 'function' && leftEl.contains(activeEl)) || (rightEl && typeof rightEl.contains === 'function' && rightEl.contains(activeEl))));

      this.savedLeftState = this.leftDrawerOpen;
      this.savedRightState = this.rightDrawerOpen;
      if (this.leftDrawerOpen) this.closeLeftDrawer();
      if (this.rightDrawerOpen) this.closeRightDrawer();
      if (maxBtn) {
        maxBtn.classList.add('active');
        maxBtn.textContent = '⛶ Restore';
        maxBtn.title = 'Restore Workspace Panels (Shift+Space / Esc)';
        if (focusInDrawer && typeof maxBtn.focus === 'function') {
          maxBtn.focus();
        }
      }
    } else {
      if (maxBtn) {
        maxBtn.classList.remove('active');
        maxBtn.textContent = '⛶ Maximize';
        maxBtn.title = 'Toggle Maximized Canvas Mode (Shift+Space)';
      }
      if (this.savedLeftState) this.openLeftDrawer();
      if (this.savedRightState) this.openRightDrawer();
    }
    this._syncOverlays();
    this._syncBackdrop();
  },

  syncRailForAccordion(accId) {
    if (!accId) return;
    const isLeftSection = ['acc-background', 'acc-nodes', 'acc-presets', 'acc-flows', 'acc-glows', 'acc-ripples'].includes(accId);
    const isRightSection = ['acc-playback', 'acc-camera', 'acc-optics', 'acc-frame', 'acc-export'].includes(accId);
    if (isLeftSection) this.lastLeftAccId = accId;
    if (isRightSection) this.lastRightAccId = accId;

    document.querySelectorAll('.icon-rail-left .icon-rail-btn[data-target-acc]').forEach((btn) => {
      const match = btn.getAttribute('data-target-acc') === accId;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-expanded', match && this.leftDrawerOpen ? 'true' : 'false');
    });
    document.querySelectorAll('.icon-rail-right .icon-rail-btn[data-target-acc]').forEach((btn) => {
      const match = btn.getAttribute('data-target-acc') === accId;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-expanded', match && this.rightDrawerOpen ? 'true' : 'false');
    });
  },

  _syncOverlays() {
    if (typeof window !== 'undefined') {
      if (window.AppCoordinator && typeof window.AppCoordinator.updateActiveOverlays === 'function') {
        window.AppCoordinator.updateActiveOverlays();
      }
      if (window.Stage && typeof window.Stage.syncOverlayBounds === 'function') {
        window.Stage.syncOverlayBounds(window.Stage.canvasWidth, window.Stage.canvasHeight);
      }
    }
  },

  _syncBackdrop() {
    if (typeof document === 'undefined') return;
    const backdrop = document.getElementById('drawerBackdrop');
    if (!backdrop) return;
    const isMobile = typeof window !== 'undefined' && window.innerWidth && window.innerWidth < 1024;
    const shouldShow = isMobile && (this.leftDrawerOpen || this.rightDrawerOpen) && !this.isMaximized;
    if (shouldShow) {
      backdrop.classList.add('active');
      backdrop.removeAttribute('aria-hidden');
    } else {
      backdrop.classList.remove('active');
      backdrop.setAttribute('aria-hidden', 'true');
    }
  },

  init() {
    if (this._initialized) return;
    this._initialized = true;

    const btnCollapseL = document.getElementById('btnCollapseLeftDrawer');
    if (btnCollapseL) btnCollapseL.addEventListener('click', () => this.toggleLeftDrawer());

    const btnToggleL = document.getElementById('railBtn-toggleLeft');
    if (btnToggleL) btnToggleL.addEventListener('click', () => this.toggleLeftDrawer());

    const btnCollapseR = document.getElementById('btnCollapseRightDrawer');
    if (btnCollapseR) btnCollapseR.addEventListener('click', () => this.toggleRightDrawer());

    const btnToggleR = document.getElementById('railBtn-toggleRight');
    if (btnToggleR) btnToggleR.addEventListener('click', () => this.toggleRightDrawer());

    const btnMax = document.getElementById('btnMaximizeCanvas');
    if (btnMax) btnMax.addEventListener('click', () => this.toggleMaximizedCanvas());

    const btnHdrExport = document.getElementById('btnHeaderExport');
    if (btnHdrExport) {
      btnHdrExport.addEventListener('click', () => {
        if (typeof window.openAccordionById === 'function') {
          window.openAccordionById('acc-export');
        }
      });
    }

    const backdrop = document.getElementById('drawerBackdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => {
        if (this.leftDrawerOpen) this.closeLeftDrawer();
        if (this.rightDrawerOpen) this.closeRightDrawer();
      });
    }

    document.querySelectorAll('.icon-rail-btn[data-target-acc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetAcc = btn.getAttribute('data-target-acc');
        const isLeft = !!btn.closest('.icon-rail-left');
        const isCurrentlyOpen = isLeft ? this.leftDrawerOpen : this.rightDrawerOpen;
        const isCurrentlyActive = btn.classList.contains('active');

        if (isCurrentlyOpen && isCurrentlyActive) {
          if (isLeft) this.closeLeftDrawer();
          else this.closeRightDrawer();
          return;
        }

        this.showToolPanel(targetAcc);
      });
    });

    // Initialize default active tool panels
    this.showToolPanel(this.lastLeftAccId);
    this.showToolPanel(this.lastRightAccId);

    ['leftDrawer', 'rightDrawer'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('transitionend', () => this._syncOverlays());
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        this._syncBackdrop();
        this._syncOverlays();
      });
    }

    if (typeof window !== 'undefined' && window.innerWidth) {
      if (window.innerWidth < 1024) {
        this.closeLeftDrawer();
        this.closeRightDrawer();
      } else if (window.innerWidth < 1440) {
        this.openLeftDrawer();
        this.closeRightDrawer();
      } else {
        this.openLeftDrawer();
        this.openRightDrawer();
      }
    }
    this._syncBackdrop();
  },

  handleKeydown(e) {
    if (!e) return false;
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    const tag = activeEl ? (activeEl.tagName || '') : '';
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (activeEl && activeEl.isContentEditable);
    if (isInput) return false;

    if (typeof document !== 'undefined') {
      const modalOpen = ['projectsModal', 'stillExportModal', 'exportModal'].some((id) => {
        const el = document.getElementById(id);
        return el && el.style && (el.style.display === 'flex' || el.style.display === 'block');
      });
      if (modalOpen) return false;
    }

    if (e.code === 'KeyT' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      this.toggleLeftDrawer();
      return true;
    } else if (e.code === 'KeyN' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      this.toggleRightDrawer();
      return true;
    } else if (e.code === 'Space' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      this.toggleMaximizedCanvas();
      return true;
    } else if (e.key === 'Escape') {
      if (window.AppCoordinator && typeof window.AppCoordinator.isInGroupEditMode === 'function' && window.AppCoordinator.isInGroupEditMode()) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        const grpId = window.AppCoordinator.getGroupEditModeGroupId();
        window.AppCoordinator.exitGroupEditMode();
        if (grpId) {
          window.AppCoordinator.selectGroup(grpId);
        }
        return true;
      }
      if (window.FloatingPropertiesEditor && window.FloatingPropertiesEditor.isOpen) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        window.FloatingPropertiesEditor.close(true);
        return true;
      }
      if (window.AppCoordinator && typeof window.AppCoordinator.getActiveSelection === 'function' && window.AppCoordinator.getActiveSelection().id !== null) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        window.AppCoordinator.clearSelection({ reason: 'escape_key' });
        return true;
      }
      if (this.isMaximized) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        this.setMaximized(false);
        return true;
      } else if (typeof window !== 'undefined' && window.innerWidth && window.innerWidth < 1024) {
        if (this.leftDrawerOpen) this.closeLeftDrawer();
        if (this.rightDrawerOpen) this.closeRightDrawer();
        return true;
      }
    }
    return false;
  }
};

window.openAccordionById = function(accId) {
  let targetId = accId;
  if (accId === 'acc-duration') targetId = 'acc-playback';
  if (accId === 'acc-optical') targetId = 'acc-optics';

  if (window.WorkspaceController && typeof window.WorkspaceController.showToolPanel === 'function') {
    window.WorkspaceController.showToolPanel(targetId);
  } else {
    const section = document.getElementById((targetId === 'acc-frame') ? 'acc-optics' : targetId);
    if (section && section.classList) section.classList.add('open');
  }

  if (accId === 'acc-frame') {
    const chkFrame = document.getElementById('chkModuleFrame');
    const targetScroll = (chkFrame && chkFrame.closest) ? (chkFrame.closest('.toggle-switch') || chkFrame) : document.getElementById('groupFrame');
    if (targetScroll && typeof targetScroll.scrollIntoView === 'function') {
      try {
        targetScroll.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (_) {}
      return;
    }
  }

  const section = document.getElementById((targetId === 'acc-frame') ? 'acc-optics' : targetId);
  if (section && typeof section.scrollIntoView === 'function') {
    try {
      section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (_) {}
  }
};

window.toggleAllAccordions = function(panelId, expand) {
  if (typeof document === 'undefined') return;
  const panel = document.getElementById(panelId);
  if (!panel) return;
  if (expand) {
    const soloChk = document.getElementById('chkSoloPanels');
    if (soloChk) soloChk.checked = false;
  }
  if (panel.querySelectorAll) {
    panel.querySelectorAll('.accordion-section').forEach((sec) => {
      if (sec.classList) sec.classList.toggle('open', expand);
    });
  }
  if (window.WorkspaceController && typeof window.WorkspaceController.syncRailForAccordion === 'function') {
    const isLeft = (panelId === 'inputPanel');
    const railSel = isLeft ? '.icon-rail-left' : '.icon-rail-right';
    if (!expand) {
      document.querySelectorAll(`${railSel} .icon-rail-btn:not(.icon-rail-toggle)`).forEach((btn) => {
        btn.classList.remove('active');
        btn.setAttribute('aria-expanded', 'false');
      });
    } else {
      const firstOpen = panel.querySelector ? panel.querySelector('.accordion-section.open') : null;
      if (firstOpen && firstOpen.id) {
        window.WorkspaceController.syncRailForAccordion(firstOpen.id);
      }
    }
  }
};

// =========================================================================
// Layer 1: Studio Non-Blocking Notification UI System
// =========================================================================

window.StudioNotification = {
  show(message, type = 'info', durationMs = 3500) {
    if (typeof document === 'undefined' || !document.createElement) {
      if (typeof console !== 'undefined') console.log(`[StudioNotification:${type}] ${message}`);
      return null;
    }
    let container = document.getElementById('studioNotificationContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'studioNotificationContainer';
      container.className = 'studio-notification-container';
      container.setAttribute('aria-live', 'polite');
      if (document.body) document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'studio-notification notice-' + type;

    const icons = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };
    const iconSpan = document.createElement('span');
    iconSpan.textContent = icons[type] || 'ℹ️';

    const textSpan = document.createElement('span');
    textSpan.style.flex = '1';
    textSpan.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'studio-notification-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.onclick = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(6px)';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 250);
    };

    toast.appendChild(iconSpan);
    toast.appendChild(textSpan);
    toast.appendChild(closeBtn);
    if (container) container.appendChild(toast);

    if (durationMs > 0) {
      setTimeout(() => {
        if (toast.parentNode) {
          toast.style.opacity = '0';
          toast.style.transform = 'translateY(6px)';
          setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
          }, 250);
        }
      }, durationMs);
    }
    return toast;
  }
};

if (window.AppCoordinator && typeof window.AppCoordinator.on === 'function') {
  window.AppCoordinator.on('notification:show', (ev) => {
    if (ev && window.StudioNotification) {
      window.StudioNotification.show(ev.message, ev.type, ev.durationMs);
    }
  });
}

// =========================================================================
// Layer 1: Floating Contextual Object Properties Editor
// =========================================================================

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
          window.AppCoordinator.bringSelectionToFront({ type: this.activeType, id: this.activeId });
        }
      });
    }

    const btnLayerUp = document.getElementById('fctx-btnLayerUp');
    if (btnLayerUp) {
      btnLayerUp.addEventListener('click', () => {
        if (this.activeType && this.activeId !== null && window.AppCoordinator) {
          window.AppCoordinator.bringSelectionForward({ type: this.activeType, id: this.activeId });
        }
      });
    }

    const btnLayerDown = document.getElementById('fctx-btnLayerDown');
    if (btnLayerDown) {
      btnLayerDown.addEventListener('click', () => {
        if (this.activeType && this.activeId !== null && window.AppCoordinator) {
          window.AppCoordinator.sendSelectionBackward({ type: this.activeType, id: this.activeId });
        }
      });
    }

    const btnLayerBottom = document.getElementById('fctx-btnLayerBottom');
    if (btnLayerBottom) {
      btnLayerBottom.addEventListener('click', () => {
        if (this.activeType && this.activeId !== null && window.AppCoordinator) {
          window.AppCoordinator.sendSelectionToBack({ type: this.activeType, id: this.activeId });
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
  },

  _resolveTargetObject(target) {
    if (!target || !target.closest) return null;

    if (target.closest('#groupSelectionBox') || target.closest('#groupSelectionOverlay')) {
      if (window.AppCoordinator && window.AppCoordinator.activeSelection && window.AppCoordinator.activeSelection.type === 'group') {
        return { type: 'group', id: window.AppCoordinator.activeSelection.id };
      }
    }

    // 1. Nodes: SVG node group or child elements, or active node selection box
    const nodeEl = target.closest('[data-node-id]');
    if (nodeEl && nodeEl.getAttribute) {
      const rawId = nodeEl.getAttribute('data-node-id');
      const id = parseInt(rawId, 10);
      return { type: 'node', id: !isNaN(id) ? id : rawId };
    }
    if (target.closest('#nodeSelectionBox') && window.DiagramNodes && window.DiagramNodes.activeId !== null) {
      return { type: 'node', id: window.DiagramNodes.activeId };
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
      return { type: 'image', id: !isNaN(iid) ? iid : rawId };
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

window.TimelinePlayer = {
  status: 'stopped', // 'stopped' | 'playing' | 'paused' | 'ended'
  isPlaying: false,  // legacy boolean matching status === 'playing'
  currentTime: 0.0,
  duration: 7.0,
  loopMode: 'once',  // 'once' | 'loop' | 'pingpong'
  _lastTimestamp: null,
  _rafId: null,
  _initialized: false,

  init() {
    if (this._initialized) {
      this.syncFromScene();
      return;
    }
    this._initialized = true;
    this._bindUI();
    this.syncFromScene();
  },

  syncFromScene() {
    if (window.SceneState && typeof window.SceneState.getNumControl === 'function') {
      this.duration = window.SceneState.getNumControl('durationSlider', 7.0) || 7.0;
      this.loopMode = window.SceneState.getControl('loopSelect', 'once') || 'once';
    }
    if (this.currentTime > this.duration) {
      this.currentTime = this.duration;
      if (this.status === 'playing' && this.loopMode === 'once') {
        this.pause();
        this.status = 'ended';
      }
    }
    const scrubber = document.getElementById('timelineScrubber');
    if (scrubber) {
      scrubber.max = String(this.duration);
    }
    this.updateUI();
  },

  // Called whenever the SVG document in #svgContainer is re-rendered (by user edits, presets, project load, etc.)
  onSceneRedrawn() {
    this.syncFromScene();
    this.evaluateAndApply(this.currentTime);
    this.updateUI();
  },

  play() {
    if (this.status === 'playing') return;
    if (this.status === 'ended' || this.currentTime >= this.duration) {
      this.currentTime = 0.0;
    }
    this.status = 'playing';
    this.isPlaying = true;
    this._lastTimestamp = null;
    this.updatePlayButton();

    if (this._rafId) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this._rafId);
      }
      this._rafId = null;
    }
    this._loop();
  },

  pause() {
    if (this.status !== 'playing' && !this.isPlaying) return;
    this.status = 'paused';
    this.isPlaying = false;
    if (this._rafId) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this._rafId);
      }
      this._rafId = null;
    }
    this._lastTimestamp = null;
    this.updatePlayButton();
    this.updateUI();
  },

  stop() {
    this.status = 'stopped';
    this.isPlaying = false;
    if (this._rafId) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this._rafId);
      }
      this._rafId = null;
    }
    this._lastTimestamp = null;
    this.currentTime = 0.0;
    this.updatePlayButton();
    this.evaluateAndApply(0.0);
    this.updateUI();
  },

  reset() {
    this.stop();
  },

  restart() {
    this.seek(0.0);
    this.play();
  },

  toggle() {
    if (this.status === 'playing') this.pause();
    else this.play();
  },

  seek(timeSec) {
    this.currentTime = Math.max(0, Math.min(this.duration, Number(timeSec) || 0));
    if (this.status === 'ended' && this.currentTime < this.duration) {
      this.status = 'paused';
      this.updatePlayButton();
    }
    this.evaluateAndApply(this.currentTime);
    this.updateUI();
  },

  _loop(timestamp) {
    if (this.status !== 'playing') return;
    if (this._lastTimestamp !== null && timestamp) {
      const dt = (timestamp - this._lastTimestamp) / 1000.0;
      const cappedDt = Math.min(dt, 0.1);
      this.currentTime += cappedDt;

      if (this.currentTime >= this.duration) {
        if (this.loopMode === 'loop') {
          this.currentTime = this.currentTime % this.duration;
        } else if (this.loopMode === 'pingpong') {
          // Handled mathematically in evaluator
        } else {
          // 'once' mode: Stop at end, freeze presentation, do not loop
          this.currentTime = this.duration;
          this.status = 'ended';
          this.isPlaying = false;
          if (this._rafId) {
            if (typeof cancelAnimationFrame === 'function') {
              cancelAnimationFrame(this._rafId);
            }
            this._rafId = null;
          }
          this._lastTimestamp = null;
          this.updatePlayButton();
          this.evaluateAndApply(this.currentTime);
          this.updateUI();
          return;
        }
      }
    }
    this._lastTimestamp = timestamp || null;
    this.evaluateAndApply(this.currentTime);
    this.updateUI();

    if (this.status === 'playing' && typeof requestAnimationFrame === 'function') {
      this._rafId = requestAnimationFrame((ts) => this._loop(ts));
    }
  },

  evaluateAndApply(timeSec) {
    if (!window.EngineBridge || typeof window.EngineBridge.evaluateSceneAtTime !== 'function') return;
    const frame = window.EngineBridge.evaluateSceneAtTime(timeSec);
    if (!frame) return;

    this.applyFrameToDOM(frame);
  },

  applyFrameToDOM(frame) {
    const container = document.getElementById('svgContainer');
    if (!container || !frame) return;

    // 1. Camera (Ken Burns, Pan, Drift, 3D Perspective Tilt)
    if (frame.camera && frame.camera.transform) {
      const camRig = container.querySelector('.camera-rig');
      if (camRig) {
        if (frame.camera.motion && frame.camera.motion !== 'static') {
          camRig.style.animation = 'none';
          camRig.style.transform = frame.camera.transform;
        } else {
          camRig.style.transform = '';
        }
      }
      const camStage = container.querySelector('#cameraStage3D') || container.querySelector('.camera-stage-3d');
      if (camStage && frame.camera.stage3d) {
        camStage.style.transform = frame.camera.stage3d;
      }
    }

    // 2. Optics (Focus Pull, Tilt-Shift, Motion Blur)
    if (frame.optical && (frame.optical.isActive || frame.optical.active)) {
      // Neutralize declarative SMIL animations inside optics filters in the live editor preview
      // so Go/WASM evaluation directly controls feGaussianBlur stdDeviation without SMIL overriding it.
      container.querySelectorAll('#opt-focus animate, #opt-ts-blur animate, #opt-mb-blur animate').forEach((el) => el.remove());

      if (frame.optical.type === 'focus-pull') {
        const fe = container.querySelector('#opt-focus feGaussianBlur');
        if (fe) fe.setAttribute('stdDeviation', String(frame.optical.blur.toFixed(2)));
      } else if (frame.optical.type === 'tilt-shift') {
        const fe = container.querySelector('#opt-ts-blur feGaussianBlur');
        if (fe) fe.setAttribute('stdDeviation', String(frame.optical.blur.toFixed(2)));
      } else if (frame.optical.type === 'motion-blur') {
        const fe = container.querySelector('#opt-mb-blur feGaussianBlur');
        if (fe) fe.setAttribute('stdDeviation', String(frame.optical.blur.toFixed(2)) + ' 0');
      }
    }
  },

  updateUI() {
    const timeDisplay = document.getElementById('timelineTimeDisplay');
    if (timeDisplay) {
      timeDisplay.textContent = this.currentTime.toFixed(2) + 's / ' + this.duration.toFixed(2) + 's';
    }
    const scrubber = document.getElementById('timelineScrubber');
    if (scrubber && document.activeElement !== scrubber) {
      scrubber.value = String(this.currentTime);
    }
    const badge = document.getElementById('timelineEngineBadge');
    if (badge && window.EngineBridge && typeof window.EngineBridge.getActiveEngineName === 'function') {
      const engineName = window.EngineBridge.getActiveEngineName();
      badge.textContent = 'Engine: ' + engineName;
      if (engineName.startsWith('WASM')) {
        badge.style.background = 'rgba(34, 197, 94, 0.15)';
        badge.style.color = '#4ade80';
        badge.style.borderColor = 'rgba(34, 197, 94, 0.3)';
      } else {
        badge.style.background = 'rgba(234, 179, 8, 0.15)';
        badge.style.color = '#facc15';
        badge.style.borderColor = 'rgba(234, 179, 8, 0.3)';
      }
    }
    const frameCount = document.getElementById('timelineFrameCount');
    if (frameCount && window.EngineBridge && window.EngineBridge._stats) {
      frameCount.textContent = window.EngineBridge._stats.framesEvaluated + ' frames';
    }
  },

  updatePlayButton() {
    const btn = document.getElementById('btnTimelinePlay');
    if (btn) {
      if (this.status === 'playing') {
        btn.textContent = '⏸ Pause Scene';
      } else if (this.status === 'paused') {
        btn.textContent = '▶ Resume Scene';
      } else {
        btn.textContent = '▶ Play Scene';
      }
    }
  },

  _bindUI() {
    const btnPlay = document.getElementById('btnTimelinePlay');
    if (btnPlay) {
      btnPlay.addEventListener('click', () => this.toggle());
    }
    const btnReset = document.getElementById('btnTimelineReset');
    if (btnReset) {
      btnReset.addEventListener('click', () => this.stop());
    }
    const scrubber = document.getElementById('timelineScrubber');
    if (scrubber) {
      scrubber.addEventListener('input', (e) => {
        this.seek(parseFloat(e.target.value) || 0);
      });
    }
  }
};

window.CustomColorPicker = {
  isOpen: false,
  activeInput: null,
  initialColor: '#58a6ff',
  currentColor: '#58a6ff',
  currentHsv: { h: 212, s: 0.65, v: 1 },
  recentColors: [],
  favColors: [],
  quickPalette: [
    '#ffffff', '#e6edf3', '#8b949e', '#30363d',
    '#161b22', '#0d1117', '#58a6ff', '#1f6feb',
    '#238636', '#3fb950', '#d29922', '#f0883e',
    '#f85149', '#ff7b72', '#a371f7', '#bc8cff'
  ],

  init() {
    this.loadSwatches();

    const popover = document.getElementById('customColorPickerModal');
    const btnClose = document.getElementById('btnColorPickerClose');
    const btnCancel = document.getElementById('btnColorPickerCancel');
    const btnApply = document.getElementById('btnColorPickerApply');
    const btnAddFav = document.getElementById('btnColorPickerAddFav');
    const curSwatch = document.getElementById('colorPickerCurrentSwatch');
    const hexInput = document.getElementById('colorPickerHexInput');
    const hueSlider = document.getElementById('colorPickerHueSlider');
    const btnPipette = document.getElementById('btnColorPickerPipette');
    const svSquare = document.getElementById('colorPickerSvSquare');

    if (btnClose) btnClose.addEventListener('click', () => this.cancel());
    if (btnCancel) btnCancel.addEventListener('click', () => this.cancel());
    if (btnApply) btnApply.addEventListener('click', () => this.apply());
    if (curSwatch) curSwatch.addEventListener('click', () => this.setColor(this.initialColor));
    if (btnAddFav) btnAddFav.addEventListener('click', () => this.addFavourite(this.currentColor));

    // 1. Saturation / Value square pointer tracking
    if (svSquare) {
      let isDraggingSv = false;
      const updateFromSv = (e) => {
        const rect = svSquare.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        const s = rect.width > 0 ? (x / rect.width) : 0;
        const v = rect.height > 0 ? (1 - (y / rect.height)) : 1;
        this.currentHsv.s = Math.max(0, Math.min(1, s));
        this.currentHsv.v = Math.max(0, Math.min(1, v));
        this.syncAllFromHsv({ skipSvHandle: false });
      };

      svSquare.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        isDraggingSv = true;
        try { svSquare.setPointerCapture(e.pointerId); } catch (_) {}
        updateFromSv(e);
      });

      svSquare.addEventListener('pointermove', (e) => {
        if (!isDraggingSv) return;
        updateFromSv(e);
      });

      const stopSv = (e) => {
        if (isDraggingSv) {
          isDraggingSv = false;
          try { svSquare.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      };
      svSquare.addEventListener('pointerup', stopSv);
      svSquare.addEventListener('pointercancel', stopSv);
    }

    // 2. Hue slider band
    if (hueSlider) {
      hueSlider.addEventListener('input', (e) => {
        this.currentHsv.h = parseFloat(e.target.value) || 0;
        this.syncAllFromHsv({ skipHueSlider: true });
      });
    }

    // 3. Eyedropper API
    if (btnPipette) {
      if (!window.EyeDropper) {
        btnPipette.style.display = 'none';
      } else {
        btnPipette.addEventListener('click', async () => {
          try {
            const eyeDropper = new window.EyeDropper();
            const res = await eyeDropper.open();
            if (res && res.sRGBHex) {
              this.setColor(res.sRGBHex);
            }
          } catch (_) {}
        });
      }
    }

    // 4. RGB sliders & numeric inputs
    ['R', 'G', 'B'].forEach((channel) => {
      const slider = document.getElementById('colorPicker' + channel + 'Slider');
      const num = document.getElementById('colorPicker' + channel + 'Num');
      if (slider && num) {
        const onValChange = (val) => {
          slider.value = val;
          num.value = val;
          this.syncFromRgbSliders();
        };
        slider.addEventListener('input', (e) => onValChange(parseInt(e.target.value, 10) || 0));
        num.addEventListener('input', (e) => onValChange(Math.max(0, Math.min(255, parseInt(e.target.value, 10) || 0))));
      }
    });

    // 5. Hex input
    if (hexInput) {
      hexInput.addEventListener('input', (e) => {
        let val = e.target.value.trim();
        if (!val.startsWith('#')) val = '#' + val;
        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
          const rgb = this.hexToRgb(val);
          this.currentHsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
          this.syncAllFromHsv({ skipHexInput: true });
        }
      });
    }

    // 6. Click-outside to cancel & close non-modal popover
    document.addEventListener('pointerdown', (e) => {
      if (!this.isOpen) return;
      if (popover && !popover.contains(e.target)) {
        if (!this.activeInput || !this.activeInput.contains(e.target)) {
          this.cancel();
        }
      }
    });

    // 7. Event delegation for opening custom colour picker on any input[type="color"]
    document.addEventListener('click', (e) => {
      const colorInput = e.target.closest ? e.target.closest('input[type="color"]') : null;
      if (colorInput) {
        e.preventDefault();
        e.stopPropagation();
        this.openFor(colorInput);
      }
    });
  },

  loadSwatches() {
    try {
      const rec = JSON.parse(localStorage.getItem('svg_animator_recent_colors') || '[]');
      this.recentColors = Array.isArray(rec) ? rec : [];
    } catch (_) {
      this.recentColors = [];
    }
    try {
      const fav = JSON.parse(localStorage.getItem('svg_animator_fav_colors') || '[]');
      this.favColors = Array.isArray(fav) ? fav : [];
    } catch (_) {
      this.favColors = [];
    }
  },

  saveSwatches() {
    try {
      localStorage.setItem('svg_animator_recent_colors', JSON.stringify(this.recentColors.slice(0, 12)));
      localStorage.setItem('svg_animator_fav_colors', JSON.stringify(this.favColors));
    } catch (_) {}
  },

  normalizeHex(colorStr) {
    if (!colorStr) return '#58a6ff';
    let c = String(colorStr).trim();
    if (!c.startsWith('#')) c = '#' + c;
    if (c.length === 4) {
      c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    }
    return c.toLowerCase();
  },

  hexToRgb(hex) {
    const norm = this.normalizeHex(hex).slice(1);
    const num = parseInt(norm, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  },

  rgbToHex(r, g, b) {
    const h = ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1);
    return '#' + h.toLowerCase();
  },

  rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s, v };
  },

  hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor((h / 60) % 6);
    const f = (h / 60) - Math.floor(h / 60);
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  },

  syncFromRgbSliders() {
    const r = parseInt(document.getElementById('colorPickerRSlider')?.value || 0, 10);
    const g = parseInt(document.getElementById('colorPickerGSlider')?.value || 0, 10);
    const b = parseInt(document.getElementById('colorPickerBSlider')?.value || 0, 10);
    this.currentHsv = this.rgbToHsv(r, g, b);
    this.syncAllFromHsv({ skipRgbSliders: true });
  },

  openFor(inputEl) {
    if (!inputEl) return;
    this.activeInput = inputEl;
    this.initialColor = this.normalizeHex(inputEl.value || '#58a6ff');
    this.currentColor = this.initialColor;
    this.isOpen = true;

    const rgb = this.hexToRgb(this.initialColor);
    this.currentHsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);

    // Update Original swatch
    const curSwatch = document.getElementById('colorPickerCurrentSwatch');
    if (curSwatch) curSwatch.style.background = this.initialColor;

    this.renderQuickPalette();
    this.renderRecentSwatches();
    this.renderFavSwatches();
    this.syncAllFromHsv();

    this.positionNear(inputEl);
  },

  positionNear(inputEl) {
    const popover = document.getElementById('customColorPickerModal');
    if (!popover || !inputEl) return;
    popover.style.display = 'flex';
    popover.style.visibility = 'hidden';

    const rect = inputEl.getBoundingClientRect();
    const popW = popover.offsetWidth || 340;
    const popH = popover.offsetHeight || 500;

    let left = rect.left;
    if (left + popW > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - popW - 12);
    }
    if (left < 12) left = 12;

    let top = rect.bottom + 6;
    if (top + popH > window.innerHeight - 12) {
      const topAbove = rect.top - popH - 6;
      if (topAbove >= 12) {
        top = topAbove;
      } else {
        top = Math.max(12, window.innerHeight - popH - 12);
      }
    }

    popover.style.top = top + 'px';
    popover.style.left = left + 'px';
    popover.style.visibility = 'visible';
  },

  syncAllFromHsv(options = {}) {
    const rgb = this.hsvToRgb(this.currentHsv.h, this.currentHsv.s, this.currentHsv.v);
    const hex = this.rgbToHex(rgb.r, rgb.g, rgb.b);
    this.currentColor = hex;

    // 1. SV square background & handle
    const svSquare = document.getElementById('colorPickerSvSquare');
    const svHandle = document.getElementById('colorPickerSvHandle');
    if (svSquare) svSquare.style.backgroundColor = 'hsl(' + this.currentHsv.h + ', 100%, 50%)';
    if (svHandle && !options.skipSvHandle) {
      svHandle.style.left = (this.currentHsv.s * 100).toFixed(1) + '%';
      svHandle.style.top = ((1 - this.currentHsv.v) * 100).toFixed(1) + '%';
    }

    // 2. Hue slider
    if (!options.skipHueSlider) {
      const hueSlider = document.getElementById('colorPickerHueSlider');
      if (hueSlider) hueSlider.value = this.currentHsv.h;
    }

    // 3. New preview swatch
    const pendSwatch = document.getElementById('colorPickerPendingSwatch');
    if (pendSwatch) pendSwatch.style.background = hex;

    // 4. Hex input
    if (!options.skipHexInput) {
      const hexIn = document.getElementById('colorPickerHexInput');
      if (hexIn) hexIn.value = hex.toUpperCase();
    }

    // 5. RGB sliders & nums
    if (!options.skipRgbSliders) {
      ['R', 'G', 'B'].forEach((channel) => {
        const val = rgb[channel.toLowerCase()];
        const slider = document.getElementById('colorPicker' + channel + 'Slider');
        const num = document.getElementById('colorPicker' + channel + 'Num');
        if (slider) slider.value = val;
        if (num) num.value = val;
      });
    }

    // 6. Live transactional preview on active input
    if (this.activeInput) {
      this.activeInput.value = hex;
      this.activeInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  },

  setColor(hex, options = {}) {
    const norm = this.normalizeHex(hex);
    const rgb = this.hexToRgb(norm);
    this.currentHsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
    this.syncAllFromHsv(options);
  },

  renderQuickPalette() {
    const grid = document.getElementById('colorPickerQuickPalette');
    if (!grid) return;
    grid.innerHTML = '';
    this.quickPalette.forEach((hex) => {
      const item = document.createElement('div');
      item.className = 'color-mini-swatch';
      item.style.background = hex;
      item.title = hex.toUpperCase();
      item.onclick = () => this.setColor(hex);
      grid.appendChild(item);
    });
  },

  renderRecentSwatches() {
    const grid = document.getElementById('colorPickerRecentSwatches');
    if (!grid) return;
    grid.innerHTML = '';
    if (this.recentColors.length === 0) {
      grid.innerHTML = '<span style="font-size:0.65rem; color:#8b949e;">None</span>';
      return;
    }
    this.recentColors.forEach((hex) => {
      const item = document.createElement('div');
      item.className = 'color-mini-swatch';
      item.style.background = hex;
      item.title = hex.toUpperCase();
      item.onclick = () => this.setColor(hex);
      grid.appendChild(item);
    });
  },

  renderFavSwatches() {
    const grid = document.getElementById('colorPickerFavSwatches');
    if (!grid) return;
    grid.innerHTML = '';
    if (this.favColors.length === 0) {
      grid.innerHTML = '<span style="font-size:0.65rem; color:#8b949e;">None</span>';
      return;
    }
    this.favColors.forEach((hex, idx) => {
      const item = document.createElement('div');
      item.className = 'color-mini-swatch';
      item.style.background = hex;
      item.title = hex.toUpperCase();
      item.onclick = () => this.setColor(hex);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'swatch-delete-btn';
      delBtn.innerHTML = '&times;';
      delBtn.title = 'Remove favourite';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        this.removeFavourite(idx);
      };
      item.appendChild(delBtn);
      grid.appendChild(item);
    });
  },

  addFavourite(hex) {
    const norm = this.normalizeHex(hex);
    if (!this.favColors.map((c) => c.toLowerCase()).includes(norm)) {
      this.favColors.push(norm);
      this.saveSwatches();
      this.renderFavSwatches();
      if (window.AppCoordinator) window.AppCoordinator.showNotification('Added ' + norm.toUpperCase() + ' to favourites', 'info', 1500);
    }
  },

  removeFavourite(idx) {
    if (idx >= 0 && idx < this.favColors.length) {
      this.favColors.splice(idx, 1);
      this.saveSwatches();
      this.renderFavSwatches();
    }
  },

  apply() {
    const finalColor = this.currentColor;
    if (this.activeInput) {
      this.activeInput.value = finalColor;
      this.activeInput.dispatchEvent(new Event('input', { bubbles: true }));
      this.activeInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    this.recentColors = [finalColor, ...this.recentColors.filter((c) => c.toLowerCase() !== finalColor.toLowerCase())].slice(0, 12);
    this.saveSwatches();
    this.close();
    if (window.AppCoordinator) {
      window.AppCoordinator.recordHistoryImmediate();
    }
  },

  cancel() {
    if (this.activeInput) {
      this.activeInput.value = this.initialColor;
      this.activeInput.dispatchEvent(new Event('input', { bubbles: true }));
      this.activeInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    this.close();
  },

  close() {
    this.isOpen = false;
    this.activeInput = null;
    const popover = document.getElementById('customColorPickerModal');
    if (popover) popover.style.display = 'none';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  let currentImage = null;
  window.currentRenderState = null;

  window.getLoadedPhoto = function() {
    return window.SceneState ? window.SceneState.getLoadedPhoto() : null;
  };

  window.setLoadedPhoto = function(photoObj) {
    const normalized = window.SceneState
      ? window.SceneState.setLoadedPhoto(photoObj)
      : (photoObj || null);
    const dropLabel = document.getElementById('uploadDropLabel');
    const dropMeta = document.getElementById('uploadPhotoMeta');
    if (normalized) {
      if (dropLabel) dropLabel.innerText = '📷 ' + (normalized.filename || 'Loaded Photo');
      if (dropMeta) dropMeta.innerText = 'Native: ' + normalized.naturalWidth + ' \u00d7 ' + normalized.naturalHeight + 'px (Click to replace)';
    } else {
      if (dropLabel) dropLabel.innerText = 'Upload Background Photo';
      if (dropMeta) dropMeta.innerText = 'Drop JPEG, PNG, or WebP here';
    }
  };

  const paperSpecs = (window.SceneState && window.SceneState.paperSpecs) || {
    '1123x794':  { name: 'A4 Landscape',        dpi300: '3508 × 2480 px' },
    '794x1123':  { name: 'A4 Portrait',         dpi300: '2480 × 3508 px' },
    '1587x1123': { name: 'A3 Landscape',        dpi300: '4960 × 3508 px' },
    '1123x1587': { name: 'A3 Portrait',         dpi300: '3508 × 4960 px' },
    '794x559':   { name: 'A5 Landscape',        dpi300: '2480 × 1748 px' },
    '559x794':   { name: 'A5 Portrait',         dpi300: '1748 × 2480 px' },
    '1056x816':  { name: 'US Letter Landscape', dpi300: '3300 × 2550 px' },
    '816x1056':  { name: 'US Letter Portrait',  dpi300: '2550 × 3300 px' },
    '1344x816':  { name: 'US Legal Landscape',  dpi300: '4200 × 2550 px' },
    '816x1344':  { name: 'US Legal Portrait',   dpi300: '2550 × 4200 px' },
    '1632x1056': { name: 'Tabloid Landscape',   dpi300: '5100 × 3300 px' },
    '1056x1632': { name: 'Tabloid Portrait',    dpi300: '3300 × 5100 px' }
  };

  function recordImmediate() {
    if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
    else if (window.HistoryManager) window.HistoryManager.recordImmediate();
  }

  function recordDebounced() {
    if (window.AppCoordinator) window.AppCoordinator.recordHistoryDebounced();
    else if (window.HistoryManager) window.HistoryManager.recordDebounced();
  }

  function initAccordions() {
    document.querySelectorAll('.accordion-header').forEach((header) => {
      header.addEventListener('click', () => {
        const section = header.parentElement;
        if (!section) return;
        if (window.WorkspaceController && typeof window.WorkspaceController.showToolPanel === 'function') {
          window.WorkspaceController.showToolPanel(section.id);
        } else {
          section.classList.toggle('open');
        }
      });
    });
  }

  initAccordions();

  if (window.WorkspaceController && typeof window.WorkspaceController.init === 'function') {
    window.WorkspaceController.init();
  }

  // Workspace keyboard shortcuts: T (Left Drawer), N (Right Drawer), Shift+Space (Maximize Stage), Esc
  window.addEventListener('keydown', (e) => {
    if (window.CustomColorPicker && window.CustomColorPicker.isOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        window.CustomColorPicker.cancel();
        return;
      }
      if (e.key === 'Enter' && e.target && e.target.id === 'colorPickerHexInput') {
        e.preventDefault();
        window.CustomColorPicker.apply();
        return;
      }
    }

    if (window.WorkspaceController && typeof window.WorkspaceController.handleKeydown === 'function') {
      window.WorkspaceController.handleKeydown(e);
    }

    const isEditable = e.target && (
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) ||
      e.target.isContentEditable
    );
    if (!isEditable) {
      // 1. Ctrl/Cmd+A: Select all shapes
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        const allNodes = window.DiagramNodes ? window.DiagramNodes.getAllNodes() : [];
        if (allNodes.length > 0 && window.AppCoordinator) {
          const items = allNodes.map((n) => ({ type: 'node', id: n.id }));
          window.AppCoordinator.setMultiSelection(items, allNodes[0].id);
        }
        return;
      }

      // 2. Delete / Backspace: Delete selected objects
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (window.AppCoordinator && window.AppCoordinator.getSelectedItems().length > 0) {
          e.preventDefault();
          window.AppCoordinator.deleteSelectedObjects();
        }
        return;
      }

      // 3. Arrow keys: Nudge selected shapes
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        if (window.AppCoordinator && window.AppCoordinator.getSelectedNodeIds().length > 0) {
          e.preventDefault();
          const step = e.shiftKey ? 2 : 0.5;
          let dx = 0, dy = 0;
          if (e.key === 'ArrowLeft') dx = -step;
          else if (e.key === 'ArrowRight') dx = step;
          else if (e.key === 'ArrowUp') dy = -step;
          else if (e.key === 'ArrowDown') dy = step;
          window.AppCoordinator.moveSelectedNodes(dx, dy);
          window.AppCoordinator.recordHistoryDebounced();
        }
        return;
      }

      // 4. Ctrl/Cmd+G: Group selected objects
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        if (window.AppCoordinator) window.AppCoordinator.createGroupFromSelection();
        return;
      }

      // 5. Ctrl/Cmd+Shift+G: Ungroup selected group
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        if (window.AppCoordinator) window.AppCoordinator.ungroupSelectedGroup();
        return;
      }

      // 6. Ctrl/Cmd+D: Duplicate selection
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        if (window.AppCoordinator) window.AppCoordinator.duplicateSelection();
        return;
      }

      // 7. Ctrl/Cmd+C: Copy selection
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        if (window.AppCoordinator) window.AppCoordinator.copySelection();
        return;
      }

      // 8. Ctrl/Cmd+V: Paste clipboard
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        if (window.AppCoordinator) window.AppCoordinator.pasteClipboard();
        return;
      }

      // 9. Layer ordering shortcuts
      // Ctrl/Cmd + Shift + ]: Bring to Front
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === ']' || e.key === '}')) {
        e.preventDefault();
        if (window.AppCoordinator) window.AppCoordinator.bringSelectionToFront();
        return;
      }

      // Ctrl/Cmd + ]: Bring Forward
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === ']')) {
        e.preventDefault();
        if (window.AppCoordinator) window.AppCoordinator.bringSelectionForward();
        return;
      }

      // Ctrl/Cmd + Shift + [: Send to Back
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === '[' || e.key === '{')) {
        e.preventDefault();
        if (window.AppCoordinator) window.AppCoordinator.sendSelectionToBack();
        return;
      }

      // Ctrl/Cmd + [: Send Backward
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === '[')) {
        e.preventDefault();
        if (window.AppCoordinator) window.AppCoordinator.sendSelectionBackward();
        return;
      }
    }
  });

  function setDragPhotoCropMode(enabled) {
    if (!window.Stage) return;
    window.Stage.dragPhotoCropEnabled = enabled;
    const btn = document.getElementById('btnDragPhotoCrop');
    const previewBox = document.getElementById('previewBox');
    if (btn) {
      btn.classList.toggle('active-tool-btn', enabled);
      btn.innerText = enabled
        ? '🖐️ Dragging Photo Inside Frame (Active — Click to Lock)'
        : '🖐️ Drag Photo Inside Frame (Off)';
    }
    if (previewBox) {
      previewBox.classList.toggle('dragging-photo-crop', enabled);
    }
  }

  function updateOrientationAndPaperUI() {
    const wEl = document.getElementById('canvasWidthInput');
    const hEl = document.getElementById('canvasHeightInput');
    const btnLand = document.getElementById('btnOrientLandscape');
    const btnPort = document.getElementById('btnOrientPortrait');
    const hintEl = document.getElementById('paperPrintHint');
    if (!wEl || !hEl) return;

    const w = parseInt(wEl.value || 1280, 10);
    const h = parseInt(hEl.value || 720, 10);
    if (btnLand) btnLand.classList.toggle('active-orient', w >= h);
    if (btnPort) btnPort.classList.toggle('active-orient', h > w);

    const key = w + 'x' + h;
    if (hintEl) {
      if (paperSpecs[key]) {
        hintEl.style.display = 'block';
        hintEl.innerHTML = '🖨️ <strong>' + paperSpecs[key].name + '</strong>: 300 DPI Print Export = ' + paperSpecs[key].dpi300;
      } else {
        hintEl.style.display = 'none';
      }
    }
  }

  function applyCanvasDimensionSwap(targetMode) {
    const wEl = document.getElementById('canvasWidthInput');
    const hEl = document.getElementById('canvasHeightInput');
    if (!wEl || !hEl) return;

    const w = parseInt(wEl.value || 1280, 10);
    const h = parseInt(hEl.value || 720, 10);

    if (targetMode === 'landscape' && w >= h) return;
    if (targetMode === 'portrait' && h >= w) return;

    wEl.value = h;
    hEl.value = w;

    const loadedPhoto = window.getLoadedPhoto();
    const fitSelect = document.getElementById('photoFitSelect');
    const patSelect = document.getElementById('canvasPatternSelect');
    if (loadedPhoto && patSelect && patSelect.value === 'photo' && fitSelect && fitSelect.value === 'match') {
      fitSelect.value = 'cover';
      syncBackgroundUIVisibility();
    }

    syncPresetDropdownFromInputs();
    updateOrientationAndPaperUI();
    render();
    recordImmediate();
  }

  function syncBackgroundUIVisibility() {
    const patternSelect = document.getElementById('canvasPatternSelect');
    const pattern = patternSelect ? patternSelect.value : 'blueprint';
    const fitSelect = document.getElementById('photoFitSelect');
    const fitMode = fitSelect ? fitSelect.value : 'match';

    const photoSizingControls = document.getElementById('photoSizingControls');
    const photoCropSliders = document.getElementById('photoCropSliders');
    const btnMatchPhoto = document.getElementById('btnMatchPhotoSize');
    const bgColorRow = document.getElementById('canvasBgColorRow');
    const gridControlsRow = document.getElementById('gridControlsRow');
    const gridSizeWrap = document.getElementById('gridSizeControlWrap');
    const gridColorLabel = document.getElementById('gridColorLabel');

    const loadedPhoto = window.getLoadedPhoto();
    const isPhotoMode = pattern === 'photo' && !!loadedPhoto;

    if (photoSizingControls) photoSizingControls.style.display = isPhotoMode ? 'block' : 'none';
    if (photoCropSliders) {
      const showCrop = isPhotoMode && fitMode === 'cover';
      photoCropSliders.style.display = showCrop ? 'block' : 'none';
      if (!showCrop) setDragPhotoCropMode(false);
    }
    if (btnMatchPhoto) btnMatchPhoto.style.display = isPhotoMode ? 'inline-block' : 'none';

    if (bgColorRow) {
      const showBgColor = !isPhotoMode || fitMode === 'contain';
      bgColorRow.style.display = showBgColor ? 'flex' : 'none';
    }

    if (gridControlsRow) {
      const usesGridOrRadial = !isPhotoMode && ['blueprint', 'dots', 'graph', 'dark-radial'].includes(pattern);
      gridControlsRow.style.display = usesGridOrRadial ? 'block' : 'none';
      if (gridColorLabel) {
        gridColorLabel.innerText = pattern === 'dark-radial' ? 'Inner Vignette Colour' : 'Background Grid Colour';
      }
      if (gridSizeWrap) {
        gridSizeWrap.style.display = ['blueprint', 'dots', 'graph'].includes(pattern) ? 'flex' : 'none';
      }
    }
  }

  function syncPresetDropdownFromInputs() {
    const wEl = document.getElementById('canvasWidthInput');
    const hEl = document.getElementById('canvasHeightInput');
    const w = parseInt(wEl ? wEl.value : 1280, 10);
    const h = parseInt(hEl ? hEl.value : 720, 10);
    const presetSelect = document.getElementById('canvasPresetSelect');
    if (!presetSelect) return;
    const key = w + 'x' + h;
    const revKey = h + 'x' + w;
    const match = Array.from(presetSelect.options).find((opt) => opt.value === key || opt.value === revKey);
    presetSelect.value = match ? match.value : 'custom';
    if (window.SceneState) {
      window.SceneState.setControl('canvasPresetSelect', presetSelect.value);
    }
  }

  window.buildFullSVG = function(state, overrides = {}) {
    if (window.SceneState && typeof window.SceneState.buildFullSVG === 'function') {
      return window.SceneState.buildFullSVG(state, overrides);
    }
    return '';
  };

  function getExportSVG() {
    const rawSvg = window.buildFullSVG(window.currentRenderState);
    return window.serializeSVGForExport(rawSvg);
  }

  function getCleanBaseName() {
    if (!currentImage || !currentImage.filename) return 'export';
    return currentImage.filename.includes('.') ? currentImage.filename.split('.')[0] : currentImage.filename;
  }

  function syncVal(id, val) {
    if (window.ControlStateAdaptor) {
      window.ControlStateAdaptor.setPairValue(id, val);
    } else {
      const el = document.getElementById(id + 'Slider');
      const num = document.getElementById(id + 'Num');
      if (el) el.value = val;
      if (num) num.value = val;
    }
  }

  Stage.init((placement, x, y) => {
    if (window.DataFlows && window.DataFlows.activeId !== null) {
      window.DataFlows.handleStageClick(x, y);
      return;
    }
    if (window.Glows && window.Glows.activeId !== null) {
      window.Glows.handleStageClick(x, y);
      return;
    }
    if (window.Ripples && window.Ripples.activeId !== null) {
      window.Ripples.handleStageClick(x, y);
      return;
    }
    if (window.DiagramNodes && window.DiagramNodes.activeId !== null) {
      window.DiagramNodes.handleStageClick(x, y);
      return;
    }
    if (window.AppCoordinator && window.AppCoordinator.activeSelection && window.AppCoordinator.activeSelection.type === 'image' && window.ImageObjects) {
      const imgId = window.AppCoordinator.activeSelection.id;
      window.ImageObjects.updateImage(imgId, { x, y });
      if (window.EngineBridge && typeof window.EngineBridge.updateImage === 'function' && window.EngineBridge.isReady()) {
        window.EngineBridge.updateImage(imgId, { x, y });
      }
      render();
      window.AppCoordinator.updateActiveOverlays();
      return;
    }

    const camSel = document.getElementById('cameraMotionSelect');
    const mode = camSel ? camSel.value : 'static';
    if (mode === 'ken-burns') {
      if (placement === 'start') {
        syncVal('startX', x);
        syncVal('startY', y);
      } else {
        syncVal('endX', x);
        syncVal('endY', y);
      }
    } else if (mode === 'static') {
      syncVal('staticX', x);
      syncVal('staticY', y);
    } else if (mode === 'handheld-drift') {
      syncVal('handX', x);
      syncVal('handY', y);
    } else if (mode === 'perspective-tilt') {
      syncVal('perspX', x);
      syncVal('perspY', y);
    }
    render();
  }, (imgData) => {
    window.setLoadedPhoto(imgData);
    const patternSelect = document.getElementById('canvasPatternSelect');
    if (patternSelect) patternSelect.value = 'photo';

    const fitSelect = document.getElementById('photoFitSelect');
    if (fitSelect) fitSelect.value = 'match';

    const widthInput = document.getElementById('canvasWidthInput');
    const heightInput = document.getElementById('canvasHeightInput');
    if (widthInput) widthInput.value = imgData.naturalWidth;
    if (heightInput) heightInput.value = imgData.naturalHeight;
    syncPresetDropdownFromInputs();
    updateOrientationAndPaperUI();

    syncBackgroundUIVisibility();
    render();
    recordImmediate();
  });

  document.getElementById('btnOrientLandscape')?.addEventListener('click', () => applyCanvasDimensionSwap('landscape'));
  document.getElementById('btnOrientPortrait')?.addEventListener('click', () => applyCanvasDimensionSwap('portrait'));
  document.getElementById('btnOrientSwap')?.addEventListener('click', () => applyCanvasDimensionSwap('swap'));

  document.getElementById('chkSnapToGrid')?.addEventListener('change', () => {
    if (window.ControlStateAdaptor) window.ControlStateAdaptor.syncFromDOM(['chkSnapToGrid']);
    if (window.Stage) window.Stage.syncOverlayBounds(window.Stage.canvasWidth, window.Stage.canvasHeight);
    recordImmediate();
  });

  document.getElementById('btnSyncSnapToBgGrid')?.addEventListener('click', () => {
    const bgGridVal = parseFloat(document.getElementById('canvasGridSizeNum')?.value || 40) || 40;
    syncVal('snapGridSize', bgGridVal);
    const chk = document.getElementById('chkSnapToGrid');
    if (chk) chk.checked = true;
    if (window.ControlStateAdaptor) window.ControlStateAdaptor.syncFromDOM(['chkSnapToGrid', 'snapGridSizeSlider', 'snapGridSizeNum']);
    if (window.Stage) window.Stage.syncOverlayBounds(window.Stage.canvasWidth, window.Stage.canvasHeight);
    recordImmediate();
  });

  window.Stage.onPhotoCropDrag = (dx, dy) => {
    const loadedPhoto = window.getLoadedPhoto();
    if (!loadedPhoto || !currentImage) return;
    const w = currentImage.width;
    const h = currentImage.height;
    const natW = loadedPhoto.naturalWidth || w;
    const natH = loadedPhoto.naturalHeight || h;
    const czEl = document.getElementById('photoCropZoomSlider');
    const cropZoom = Math.max(1.0, parseFloat(czEl ? czEl.value : 100) / 100);
    const scale = window.Stage.getEffectiveScale() || 1.0;

    const baseScale = Math.max(w / natW, h / natH) * cropZoom;
    const overflowX = Math.max(1, (natW * baseScale) - w);
    const overflowY = Math.max(1, (natH * baseScale) - h);

    const cxEl = document.getElementById('photoCropXSlider');
    const cyEl = document.getElementById('photoCropYSlider');
    const curX = parseFloat(cxEl ? cxEl.value : 50);
    const curY = parseFloat(cyEl ? cyEl.value : 50);

    const nextX = Math.min(100, Math.max(0, curX - ((dx / scale) / overflowX) * 100));
    const nextY = Math.min(100, Math.max(0, curY - ((dy / scale) / overflowY) * 100));

    syncVal('photoCropX', Math.round(nextX));
    syncVal('photoCropY', Math.round(nextY));
    render();
  };

  document.getElementById('btnDragPhotoCrop')?.addEventListener('click', () => {
    setDragPhotoCropMode(!window.Stage.dragPhotoCropEnabled);
  });

  const presetSel = document.getElementById('canvasPresetSelect');
  if (presetSel) {
    presetSel.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'custom') return;
      const parts = val.split('x').map(Number);
      let pw = parts[0];
      let ph = parts[1];
      if (pw > 0 && ph > 0) {
        const isCurrentlyPortrait = document.getElementById('btnOrientPortrait')?.classList.contains('active-orient');
        if (isCurrentlyPortrait && pw > ph) {
          const tmp = pw;
          pw = ph;
          ph = tmp;
        }
        document.getElementById('canvasWidthInput').value = pw;
        document.getElementById('canvasHeightInput').value = ph;

        const dpiSel = document.getElementById('stillDpiSelect');
        if (dpiSel && paperSpecs[pw + 'x' + ph]) {
          dpiSel.value = '3.125';
        }

        const loadedPhoto = window.getLoadedPhoto();
        const fitSelect = document.getElementById('photoFitSelect');
        const patSelect = document.getElementById('canvasPatternSelect');
        if (loadedPhoto && patSelect && patSelect.value === 'photo' && fitSelect && fitSelect.value === 'match') {
          fitSelect.value = 'cover';
          syncBackgroundUIVisibility();
        }
        updateOrientationAndPaperUI();
        render();
        recordImmediate();
      }
    });
  }

  const patSel = document.getElementById('canvasPatternSelect');
  if (patSel) {
    patSel.addEventListener('change', (e) => {
      if (e.target.value === 'photo' && !window.getLoadedPhoto()) {
        document.getElementById('fileInput')?.click();
      }
      syncBackgroundUIVisibility();
      render();
      recordImmediate();
    });
  }

  const fitSel = document.getElementById('photoFitSelect');
  if (fitSel) {
    fitSel.addEventListener('change', () => {
      syncBackgroundUIVisibility();
      render();
      recordImmediate();
    });
  }

  const btnMatch = document.getElementById('btnMatchPhotoSize');
  if (btnMatch) {
    btnMatch.addEventListener('click', () => {
      const loadedPhoto = window.getLoadedPhoto();
      if (!loadedPhoto) return;
      document.getElementById('canvasWidthInput').value = loadedPhoto.naturalWidth;
      document.getElementById('canvasHeightInput').value = loadedPhoto.naturalHeight;
      document.getElementById('photoFitSelect').value = 'match';
      syncPresetDropdownFromInputs();
      updateOrientationAndPaperUI();
      syncBackgroundUIVisibility();
      render();
      recordImmediate();
    });
  }

  ['canvasWidthInput', 'canvasHeightInput'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        syncPresetDropdownFromInputs();
        updateOrientationAndPaperUI();
        const loadedPhoto = window.getLoadedPhoto();
        const fitSelect = document.getElementById('photoFitSelect');
        const patSelect = document.getElementById('canvasPatternSelect');
        if (loadedPhoto && patSelect && patSelect.value === 'photo' && fitSelect && fitSelect.value === 'match') {
          fitSelect.value = 'cover';
          syncBackgroundUIVisibility();
        }
        render();
        recordDebounced();
      });
    }
  });

  ['canvasBgColorPicker', 'canvasGridColorPicker'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', render);
      el.addEventListener('change', () => {
        render();
        recordImmediate();
      });
    }
  });

  const bgTrans = document.getElementById('canvasBgTransparent');
  if (bgTrans) {
    bgTrans.addEventListener('change', () => {
      render();
      recordImmediate();
    });
  }

  document.getElementById('btnModeStart')?.addEventListener('click', () => {
    if (window.AppCoordinator) {
      window.AppCoordinator.selectObject('camera', 'start', { skipStageClear: true });
    }
    if (window.Stage) Stage.setActive('start');
  });

  document.getElementById('btnModeEnd')?.addEventListener('click', () => {
    if (window.AppCoordinator) {
      window.AppCoordinator.selectObject('camera', 'end', { skipStageClear: true });
    }
    if (window.Stage) Stage.setActive('end');
  });

  document.querySelectorAll('.slider-row').forEach((row) => {
    const slider = row.querySelector('input[type="range"]');
    const num = row.querySelector('input[type="number"]');
    if (slider && num) {
      num.value = slider.value;
      slider.addEventListener('input', () => {
        num.value = slider.value;
        render();
        recordDebounced();
      });
      num.addEventListener('input', () => {
        slider.value = num.value;
        render();
        recordDebounced();
      });
    }
  });

  function syncCameraPanelVisibility(v) {
    document.getElementById('panel-cam-static').style.display = v === 'static' ? 'block' : 'none';
    document.getElementById('panel-cam-kenburns').style.display = v === 'ken-burns' ? 'block' : 'none';
    document.getElementById('panel-cam-handheld').style.display = v === 'handheld-drift' ? 'block' : 'none';
    document.getElementById('panel-cam-perspective').style.display = v === 'perspective-tilt' ? 'block' : 'none';
    const timingBox = document.getElementById('panel-cam-timing');
    if (timingBox) {
      timingBox.style.display = (v === 'ken-burns' || v === 'handheld-drift') ? 'block' : 'none';
    }
  }

  const camMotionSel = document.getElementById('cameraMotionSelect');
  if (camMotionSel) {
    camMotionSel.addEventListener('change', (e) => {
      syncCameraPanelVisibility(e.target.value);
      render();
      recordImmediate();
    });
  }

  const effSel = document.getElementById('effectSelect');
  if (effSel) {
    effSel.addEventListener('change', (e) => {
      const v = e.target.value;
      document.getElementById('panel-opt-focus').style.display = v === 'focus-pull' ? 'block' : 'none';
      document.getElementById('panel-opt-tiltshift').style.display = v === 'tilt-shift' ? 'block' : 'none';
      document.getElementById('panel-opt-motionblur').style.display = v === 'motion-blur' ? 'block' : 'none';
      render();
      recordImmediate();
    });
  }

  const chkFrame = document.getElementById('chkModuleFrame');
  if (chkFrame) {
    chkFrame.addEventListener('change', (e) => {
      const group = document.getElementById('groupFrame');
      if (group) group.style.display = e.target.checked ? 'flex' : 'none';
      render();
      recordImmediate();
    });
  }

  const chkFrameLight = document.getElementById('chkFrameLighting');
  if (chkFrameLight) {
    chkFrameLight.addEventListener('change', (e) => {
      const details = document.getElementById('frameLightingDetails');
      if (details) details.style.display = e.target.checked ? 'flex' : 'none';
      render();
      recordImmediate();
    });
  }

  document.querySelectorAll('#settingsPanel select, #settingsPanel input[type="checkbox"], #settingsPanel input[type="color"]').forEach((el) => {
    el.addEventListener('change', () => {
      render();
      recordImmediate();
    });
    if (el.type === 'color') el.addEventListener('input', render);
  });

  window.syncUIAfterHistoryRestore = function() {
    syncPresetDropdownFromInputs();
    syncBackgroundUIVisibility();
    updateOrientationAndPaperUI();
    const cm = document.getElementById('cameraMotionSelect')?.value || 'static';
    syncCameraPanelVisibility(cm);

    const ef = document.getElementById('effectSelect')?.value || 'none';
    document.getElementById('panel-opt-focus').style.display = ef === 'focus-pull' ? 'block' : 'none';
    document.getElementById('panel-opt-tiltshift').style.display = ef === 'tilt-shift' ? 'block' : 'none';
    document.getElementById('panel-opt-motionblur').style.display = ef === 'motion-blur' ? 'block' : 'none';

    const fr = document.getElementById('chkModuleFrame')?.checked;
    const grp = document.getElementById('groupFrame');
    if (grp) grp.style.display = fr ? 'flex' : 'none';

    const flOn = document.getElementById('chkFrameLighting')?.checked !== false;
    const flDetails = document.getElementById('frameLightingDetails');
    if (flDetails) flDetails.style.display = flOn ? 'flex' : 'none';

    render();
  };

  function render() {
    if (window.ControlStateAdaptor) {
      window.ControlStateAdaptor.syncFromDOM();
    }

    const state = window.SceneState ? window.SceneState.buildRenderState() : null;
    if (!state || !state.image) return;
    currentImage = state.image;

    if (window.SceneState && window.SceneState.controls.canvasPatternSelect === 'blueprint') {
      const patSelEl = document.getElementById('canvasPatternSelect');
      if (patSelEl && patSelEl.value === 'photo' && !window.getLoadedPhoto()) {
        patSelEl.value = 'blueprint';
      }
    }

    if (currentImage.pattern === 'photo' && currentImage.photoFit === 'match' && window.getLoadedPhoto()) {
      const wInput = document.getElementById('canvasWidthInput');
      const hInput = document.getElementById('canvasHeightInput');
      if (wInput) wInput.value = currentImage.width;
      if (hInput) hInput.value = currentImage.height;
      syncPresetDropdownFromInputs();
    }

    const dim = document.getElementById('imgDimensions');
    if (dim) {
      dim.innerHTML = currentImage.width + ' &times; ' + currentImage.height + (currentImage.isBlankCanvas ? ' (Canvas)' : '');
    }

    if (window.Stage) {
      window.Stage.syncOverlayBounds(currentImage.width, currentImage.height);
    }

    const camMode = state.camera.motion;
    const sx = state.camera.startX;
    const sy = state.camera.startY;
    const ex = state.camera.endX;
    const ey = state.camera.endY;

    const rStart = document.getElementById('reticleStart');
    const rEnd = document.getElementById('reticleEnd');
    const rCenter = document.getElementById('reticleCenter');

    if (rStart) rStart.style.display = (camMode === 'ken-burns') ? 'flex' : 'none';
    if (rEnd) rEnd.style.display = (camMode === 'ken-burns') ? 'flex' : 'none';
    if (rCenter) {
      rCenter.style.display = (camMode !== 'ken-burns') ? 'flex' : 'none';
      rCenter.style.left = sx + '%';
      rCenter.style.top = sy + '%';
    }

    const editingNode = window.DiagramNodes ? window.DiagramNodes.activeId !== null : false;
    const editingFlow = window.DataFlows ? window.DataFlows.activeId !== null : false;
    const editingGlow = window.Glows ? window.Glows.activeId !== null : false;
    const editingRipple = window.Ripples ? window.Ripples.activeId !== null : false;

    if (!editingNode && !editingFlow && !editingGlow && !editingRipple && window.Stage) {
      window.Stage.updateReticles(sx, sy, ex, ey);
    }
    if (window.AppCoordinator && typeof window.AppCoordinator.updateActiveOverlays === 'function') {
      window.AppCoordinator.updateActiveOverlays();
    }

    try {
      const svgContainer = document.getElementById('svgContainer');
      if (svgContainer) {
        svgContainer.innerHTML = window.buildFullSVG(state);
      }
      if (window.EngineBridge && typeof window.EngineBridge.syncScene === 'function') {
        window.EngineBridge.syncScene();
      }
      if (window.TimelinePlayer && typeof window.TimelinePlayer.onSceneRedrawn === 'function') {
        window.TimelinePlayer.onSceneRedrawn();
      } else if (window.TimelinePlayer && typeof window.TimelinePlayer.syncFromScene === 'function') {
        window.TimelinePlayer.syncFromScene();
      }
    } catch (e) {
      console.error('SVG Render Exception:', e);
    }
  }

  window.triggerAppRender = render;
  if (window.AppCoordinator) {
    window.AppCoordinator.registerRenderHandler(render);
  }

  document.getElementById('btnReplay')?.addEventListener('click', () => {
    if (window.TimelinePlayer && typeof window.TimelinePlayer.restart === 'function') {
      window.TimelinePlayer.restart();
    } else {
      const container = document.getElementById('svgContainer');
      if (!container || !window.currentRenderState) return;
      container.innerHTML = '';
      setTimeout(() => {
        container.innerHTML = window.buildFullSVG(window.currentRenderState);
      }, 10);
    }
  });

  document.getElementById('btnDownloadSVG')?.addEventListener('click', () => {
    try {
      if (!currentImage || !window.currentRenderState) return;
      const svgData = getExportSVG();
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = getCleanBaseName() + '_animated.svg';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 150);
    } catch (err) {
      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        window.AppCoordinator.showNotification('SVG Download Error: ' + err.message, 'error');
      } else {
        alert('SVG Download Error: ' + err.message);
      }
    }
  });

  document.getElementById('btnDownloadHTML')?.addEventListener('click', () => {
    try {
      if (!currentImage || !window.currentRenderState) return;
      const w = currentImage.width || 1280;
      const h = currentImage.height || 720;
      const isTransparent = !!(window.currentRenderState.camera && window.currentRenderState.camera.bgTransparent);
      const bgColor = isTransparent
        ? 'transparent'
        : ((window.currentRenderState.camera && window.currentRenderState.camera.bgColor) || '#0d1117');
      const svgData = getExportSVG();

      const htmlData =
        '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n' +
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '  <title>Animated Diagram &amp; Topology</title>\n' +
        '  <style>\n' +
        '    * { box-sizing: border-box; margin: 0; padding: 0; }\n' +
        '    body { background: ' + bgColor + '; display: flex; justify-content: center; align-items: center; width: 100vw; height: 100vh; overflow: hidden; }\n' +
        '    .stage-frame { width: min(100vw, calc(100vh * (' + w + ' / ' + h + '))); height: min(100vh, calc(100vw * (' + h + ' / ' + w + '))); aspect-ratio: ' + w + ' / ' + h + '; display: flex; justify-content: center; align-items: center; }\n' +
        '    svg { width: 100%; height: 100%; display: block; }\n' +
        '  </style>\n</head>\n<body>\n  <div class="stage-frame">\n    ' + svgData + '\n  </div>\n</body>\n</html>';

      const blob = new Blob([htmlData], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = getCleanBaseName() + '_animated.html';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 150);
    } catch (err) {
      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        window.AppCoordinator.showNotification('HTML Download Error: ' + err.message, 'error');
      } else {
        alert('HTML Download Error: ' + err.message);
      }
    }
  });

  if (typeof populateShapeDropdowns === 'function') {
    populateShapeDropdowns();
  }

  if (window.EngineBridge && typeof window.EngineBridge.init === 'function') {
    window.EngineBridge.init('wasm/engine.wasm').then((ready) => {
      if (window.TimelinePlayer && typeof window.TimelinePlayer.init === 'function') {
        window.TimelinePlayer.init();
      }
      if (ready && typeof window.triggerAppRender === 'function') {
        window.triggerAppRender();
      }
    });
  }

  function renderLayersList() {
    const container = document.getElementById('layersListContainer');
    if (!container) return;
    if (!window.LayerManager || typeof window.LayerManager.getLayers !== 'function') return;

    const layers = window.LayerManager.getLayers();
    if (!layers || layers.length === 0) {
      container.innerHTML = '<div style="padding: 12px; color: var(--text-dim, #8b949e); text-align: center; font-size: 0.8rem;">No layers in scene. Add shapes, flows, glows, ripples, or import an image.</div>';
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
  }

  window.renderLayersList = renderLayersList;
  if (window.AppCoordinator) {
    window.AppCoordinator.on('layers:changed', () => renderLayersList());
    window.AppCoordinator.on('selection:changed', () => renderLayersList());
  }

  document.getElementById('btnLayerToFront')?.addEventListener('click', () => {
    if (window.AppCoordinator) window.AppCoordinator.bringSelectionToFront();
  });

  document.getElementById('btnLayerForward')?.addEventListener('click', () => {
    if (window.AppCoordinator) window.AppCoordinator.bringSelectionForward();
  });

  document.getElementById('btnLayerBackward')?.addEventListener('click', () => {
    if (window.AppCoordinator) window.AppCoordinator.sendSelectionBackward();
  });

  document.getElementById('btnLayerToBack')?.addEventListener('click', () => {
    if (window.AppCoordinator) window.AppCoordinator.sendSelectionToBack();
  });

  const btnImportImg = document.getElementById('btnImportImageObject');
  const inputImportImg = document.getElementById('inputImportImageObject');
  if (btnImportImg && inputImportImg) {
    btnImportImg.addEventListener('click', () => {
      inputImportImg.click();
    });

    inputImportImg.addEventListener('change', () => {
      if (!inputImportImg.files || inputImportImg.files.length === 0) return;
      const file = inputImportImg.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const tempImg = new Image();
        tempImg.onload = () => {
          const nw = tempImg.naturalWidth || 200;
          const nh = tempImg.naturalHeight || 150;
          let initialW = nw;
          let initialH = nh;
          const maxDim = 400;
          if (initialW > maxDim || initialH > maxDim) {
            const ratio = Math.min(maxDim / initialW, maxDim / initialH);
            initialW = Math.round(initialW * ratio);
            initialH = Math.round(initialH * ratio);
          }
          const filename = file.name || 'image';
          const cleanName = filename.replace(/\.[^/.]+$/, "");

          let createdId = null;
          if (window.EngineBridge && typeof window.EngineBridge.createImage === 'function' && window.EngineBridge.isReady()) {
            createdId = window.EngineBridge.createImage({
              name: cleanName,
              filename: filename,
              data: dataUrl,
              naturalWidth: nw,
              naturalHeight: nh,
              width: initialW,
              height: initialH,
              maintainAspectRatio: true,
              x: 50,
              y: 50,
              opacity: 1.0
            });
          } else if (window.ImageObjects) {
            createdId = window.ImageObjects.createImage({
              name: cleanName,
              filename: filename,
              data: dataUrl,
              naturalWidth: nw,
              naturalHeight: nh,
              width: initialW,
              height: initialH,
              maintainAspectRatio: true,
              x: 50,
              y: 50,
              opacity: 1.0
            });
          }

          if (createdId !== null) {
            if (window.LayerManager) {
              window.LayerManager.addEntry('image', createdId);
            }
            if (window.AppCoordinator) {
              window.AppCoordinator.selectObject('image', createdId, { openAccordionId: 'acc-layers' });
              window.AppCoordinator.requestRender();
              window.AppCoordinator.recordHistoryImmediate();
              window.AppCoordinator.showNotification('Imported image: ' + cleanName, 'success');
            }
          }
          inputImportImg.value = '';
        };
        tempImg.onerror = () => {
          if (window.AppCoordinator) {
            window.AppCoordinator.showNotification('Failed to decode image file: ' + file.name, 'error');
          }
          inputImportImg.value = '';
        };
        tempImg.src = dataUrl;
      };
      reader.onerror = () => {
        if (window.AppCoordinator) {
          window.AppCoordinator.showNotification('Failed to read image file: ' + file.name, 'error');
        }
        inputImportImg.value = '';
      };
      reader.readAsDataURL(file);
    });
  }

  if (window.DiagramNodes) window.DiagramNodes.init();
  if (window.DataFlows) window.DataFlows.init();
  if (window.Glows) window.Glows.init();
  if (window.Ripples) window.Ripples.init();
  if (window.CustomColorPicker) window.CustomColorPicker.init();
  if (window.TimelinePlayer && typeof window.TimelinePlayer.init === 'function') {
    window.TimelinePlayer.init();
  }
  syncBackgroundUIVisibility();
  updateOrientationAndPaperUI();
  if (camMotionSel) camMotionSel.dispatchEvent(new Event('change'));
  if (effSel) effSel.dispatchEvent(new Event('change'));
  if (chkFrame) chkFrame.dispatchEvent(new Event('change'));
  if (window.FloatingPropertiesEditor) window.FloatingPropertiesEditor.init();
  if (window.HistoryManager) window.HistoryManager.init();
  if (window.ProjectManager) window.ProjectManager.init();
  renderLayersList();
});
