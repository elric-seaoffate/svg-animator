/**
 * SVG Animator Studio — Workspace Controller (`workspace.js`)
 *
 * Responsibilities:
 *   - Sliding drawers (left/right) with Blender-inspired icon rails
 *   - Tool accordion expansion, collapse, and panel switching
 *   - Maximized canvas stage mode toggle
 *   - Keyboard shortcuts for workspace navigation (T, N, Shift+Space, Esc)
 *   - Responsive mobile/desktop drawer state adaptation
 *
 * Layer 1 (UI Presentation).
 */

(function() {
  'use strict';

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
      'acc-image-tools': 'Crop, Clip & Snip',
      'acc-playback': 'Scene & Timeline',
      'acc-camera': 'Camera Rig & Motion',
      'acc-optics': 'Optical Effects',
      'acc-frame': 'Presentation Frame',
      'acc-export': 'Export & Render Studio'
    },

    showToolPanel(toolId) {
      if (!toolId) return;
      const isLeft = ['acc-background', 'acc-nodes', 'acc-presets', 'acc-flows', 'acc-glows', 'acc-ripples', 'acc-layers', 'acc-image-tools'].includes(toolId);
      const isRight = ['acc-playback', 'acc-camera', 'acc-optics', 'acc-frame', 'acc-export'].includes(toolId);
      if (!isLeft && !isRight) return;

      if (isLeft) {
        this.lastLeftAccId = toolId;
        if (!this.leftDrawerOpen) this.openLeftDrawer();

        const titleEl = document.getElementById('leftDrawerTitle');
        if (titleEl && this.toolTitles[toolId]) {
          titleEl.textContent = this.toolTitles[toolId];
        }

        const objectTools = ['acc-nodes', 'acc-flows', 'acc-glows', 'acc-ripples', 'acc-layers', 'acc-image-tools'];
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
            'acc-layers': 'image',
            'acc-image-tools': 'image'
          };
          if (typeMap[toolId] !== window.FloatingPropertiesEditor.activeType) {
            window.FloatingPropertiesEditor.close();
          }
        }

        const leftSections = ['acc-background', 'acc-nodes', 'acc-presets', 'acc-flows', 'acc-glows', 'acc-ripples', 'acc-layers', 'acc-image-tools'];
        leftSections.forEach((secId) => {
          const sec = document.getElementById(secId);
          if (sec && sec.classList) {
            const match = (secId === toolId);
            sec.classList.toggle('active-tool', match);
            sec.classList.toggle('open', match);
          }
        });
        if (toolId === 'acc-layers' && typeof window.renderLayersList === 'function') {
          window.renderLayersList();
        }
        if (toolId === 'acc-image-tools' && typeof window.syncImageToolsUI === 'function') {
          window.syncImageToolsUI();
        }
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
      const isLeftSection = ['acc-background', 'acc-nodes', 'acc-presets', 'acc-flows', 'acc-glows', 'acc-ripples', 'acc-layers', 'acc-image-tools'].includes(accId);
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
})();
