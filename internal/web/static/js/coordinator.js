/**
 * Layer 2: Application Coordination (`window.AppCoordinator`)
 *
 * Coordinates cross-module selection transitions, history snapshot recording,
 * master SVG render requests, stage grid-snap/dimension lookups, and UI notifications.
 *
 * Maintains the strict one-way dependency direction:
 *   Layer 1 (UI Presentation) -> Layer 2 (AppCoordinator) -> Layer 3 (Operational Functionality)
 */
(function() {
  // Global render trigger helper ensuring any presentation module can request an authoritative scene render
  if (typeof window !== 'undefined') {
    window.triggerRender = function() {
      if (window.AppCoordinator && typeof window.AppCoordinator.requestRender === 'function') {
        window.AppCoordinator.requestRender();
      } else if (typeof window.triggerAppRender === 'function') {
        window.triggerAppRender();
      }
    };
  }

  window.AppCoordinator = {
    activeSelection: { type: null, id: null, items: [] },
    groupEditModeGroupId: null,
    _clipboardPayload: null,
    _listeners: {},
    _renderHandler: null,
    _isCoordinatingSelection: false,

    on(eventName, handler) {
      if (!eventName || typeof handler !== 'function') return;
      if (!this._listeners[eventName]) {
        this._listeners[eventName] = [];
      }
      if (!this._listeners[eventName].includes(handler)) {
        this._listeners[eventName].push(handler);
      }
    },

    off(eventName, handler) {
      if (!eventName || !this._listeners[eventName]) return;
      this._listeners[eventName] = this._listeners[eventName].filter((fn) => fn !== handler);
    },

    emit(eventName, payload) {
      const handlers = this._listeners[eventName];
      if (!handlers || handlers.length === 0) return;
      handlers.slice().forEach((fn) => {
        try {
          fn(payload);
        } catch (err) {
          console.error('AppCoordinator listener error [' + eventName + ']:', err);
        }
      });
    },

    registerRenderHandler(fn) {
      if (typeof fn === 'function') {
        this._renderHandler = fn;
      }
    },

    requestRender() {
      if (typeof this._renderHandler === 'function') {
        this._renderHandler();
      } else if (typeof window.triggerAppRender === 'function') {
        window.triggerAppRender();
      }
      this.emit('render:completed', {
        state: window.SceneState ? window.SceneState.currentRenderState : window.currentRenderState
      });
    },

    isHistoryRestoring() {
      return !!(window.HistoryManager && window.HistoryManager.isRestoring);
    },

    recordHistoryImmediate() {
      if (this.isHistoryRestoring()) return;
      if (window.HistoryManager && typeof window.HistoryManager.recordImmediate === 'function') {
        window.HistoryManager.recordImmediate();
      }
    },

    recordHistoryDebounced(delayMs = 280) {
      if (this.isHistoryRestoring()) return;
      if (window.HistoryManager && typeof window.HistoryManager.recordDebounced === 'function') {
        window.HistoryManager.recordDebounced(delayMs);
      }
    },

    getActiveSelection() {
      return {
        type: this.activeSelection.type,
        id: this.activeSelection.id,
        items: Array.isArray(this.activeSelection.items) ? [...this.activeSelection.items] : []
      };
    },

    getSelectedItems() {
      return Array.isArray(this.activeSelection.items) ? [...this.activeSelection.items] : [];
    },

    getSelectedNodeIds() {
      if (!Array.isArray(this.activeSelection.items)) return [];
      return this.activeSelection.items
        .filter((it) => it && it.type === 'node' && it.id != null)
        .map((it) => it.id);
    },

    isObjectSelected(type, id) {
      if (!Array.isArray(this.activeSelection.items)) return false;
      const strId = String(id);
      return this.activeSelection.items.some((it) => it.type === type && String(it.id) === strId);
    },

    /**
     * Coordinates active object selection across DiagramNodes, DataFlows,
     * Glows, Ripples, and Stage camera reticles without modules mutating each other directly.
     * Supports single-click selection replacement, Shift-click additive selection, and toggle selection.
     *
     * @param {string|null} type - 'node' | 'flow' | 'glow' | 'ripple' | 'camera' | null
     * @param {number|string|null} id - Object ID or camera placement ('start' | 'end')
     * @param {Object} [options] - Optional flags ({ openAccordionId, skipStageClear, skipModuleSelect, additive, toggle, items, primaryId })
     */
    selectObject(type, id, options = {}) {
      if (this._isCoordinatingSelection) return;
      this._isCoordinatingSelection = true;
      try {
        const normalizedType = (id !== null && id !== undefined) ? type : null;
        const normalizedId = (id !== null && id !== undefined) ? id : null;

        if (normalizedType && normalizedId !== null && options.source !== 'layers_list' && window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
          const eff = window.LayerManager.getEffective(normalizedType, normalizedId);
          if (eff && (eff.locked || !eff.visible)) {
            return;
          }
        }

        if (options.toggle && normalizedType && normalizedId !== null) {
          this._toggleObjectSelectionInternal(normalizedType, normalizedId, options);
          return;
        }

        if (options.additive && normalizedType && normalizedId !== null && ['node', 'flow', 'glow', 'ripple', 'image'].includes(normalizedType)) {
          this._addToSelectionInternal(normalizedType, normalizedId, options);
          return;
        }

        if (Array.isArray(options.items) && options.items.length > 0) {
          this._setMultiSelectionInternal(options.items, options.primaryId || normalizedId, options);
          return;
        }

        // Automatic group resolution: unless in group-edit mode or explicitly requested,
        // selecting a member of a group selects the parent group.
        if (normalizedType && normalizedId !== null && normalizedType !== 'camera' && !options.skipGroupResolve && !options.toggle && !options.additive) {
          if (this.groupEditModeGroupId) {
            const memberGroup = this.findGroupByMember(normalizedType, normalizedId);
            if (!memberGroup || String(memberGroup.id) !== String(this.groupEditModeGroupId)) {
              this.exitGroupEditMode();
              if (memberGroup) {
                this._isCoordinatingSelection = false;
                this.selectGroup(memberGroup.id, options);
                return;
              }
            }
          } else {
            const memberGroup = this.findGroupByMember(normalizedType, normalizedId);
            if (memberGroup) {
              this._isCoordinatingSelection = false;
              this.selectGroup(memberGroup.id, options);
              return;
            }
          }
        }

        // Single selection replacement
        if (normalizedType !== 'node' && window.DiagramNodes && window.DiagramNodes.activeId !== null) {
          window.DiagramNodes.deselectNode();
        }
        if (normalizedType !== 'flow' && window.DataFlows && window.DataFlows.activeId !== null) {
          window.DataFlows.deselectFlow();
        }
        if (normalizedType !== 'glow' && window.Glows && window.Glows.activeId !== null) {
          window.Glows.deselectGlow();
        }
        if (normalizedType !== 'ripple' && window.Ripples && window.Ripples.activeId !== null) {
          window.Ripples.deselectRipple();
        }
        if (normalizedType !== 'camera' && !options.skipStageClear && window.Stage && window.Stage.activePlacement) {
          window.Stage.clearActive();
        }

        // Activate the target object on its owner module if not already active
        if (!options.skipModuleSelect && normalizedId !== null) {
          if (normalizedType === 'node' && window.DiagramNodes && window.DiagramNodes.activeId !== normalizedId) {
            window.DiagramNodes.selectNode(normalizedId, false);
          } else if (normalizedType === 'flow' && window.DataFlows && window.DataFlows.activeId !== normalizedId) {
            window.DataFlows.selectFlow(normalizedId);
          } else if (normalizedType === 'glow' && window.Glows && window.Glows.activeId !== normalizedId) {
            window.Glows.selectGlow(normalizedId);
          } else if (normalizedType === 'ripple' && window.Ripples && window.Ripples.activeId !== normalizedId) {
            window.Ripples.selectRipple(normalizedId);
          } else if (normalizedType === 'image') {
            if (typeof window.syncImageEditorUI === 'function') {
              window.syncImageEditorUI();
            }
          } else if (normalizedType === 'camera' && window.Stage && window.Stage.activePlacement !== normalizedId) {
            window.Stage.setActive(normalizedId);
          }
        }

        const items = (normalizedType && normalizedId !== null)
          ? [{ type: normalizedType, id: normalizedId }]
          : [];

        this.activeSelection = {
          type: normalizedType,
          id: normalizedId,
          items: items
        };

        if (window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
          if (normalizedId !== null && ['node', 'flow', 'glow', 'ripple', 'image'].includes(normalizedType)) {
            window.EngineBridge.setSelection(normalizedType, normalizedId, items);
          } else {
            window.EngineBridge.clearSelection();
          }
        }

        if (options.openAccordionId && typeof window.openAccordionById === 'function') {
          window.openAccordionById(options.openAccordionId);
        }

        this._refreshAllInstanceLists();
        this.updateActiveOverlays();
        this.emit('selection:changed', this.getActiveSelection());
      } finally {
        this._isCoordinatingSelection = false;
      }
    },

    _addToSelectionInternal(type, id, options = {}) {
      const items = Array.isArray(this.activeSelection.items) ? [...this.activeSelection.items] : [];
      const strId = String(id);
      const existing = items.find((it) => it.type === type && String(it.id) === strId);
      if (!existing) {
        items.push({ type, id });
      }

      this.activeSelection = {
        type: type,
        id: id,
        items: items
      };

      if (type === 'node' && window.DiagramNodes && typeof window.DiagramNodes.selectNode === 'function') {
        window.DiagramNodes.selectNode(id, false, { multi: true, skipCoordinator: true });
      } else if (type === 'flow' && window.DataFlows && typeof window.DataFlows.selectFlow === 'function') {
        window.DataFlows.selectFlow(id, { multi: true, skipCoordinator: true });
      } else if (type === 'glow' && window.Glows && typeof window.Glows.selectGlow === 'function') {
        window.Glows.selectGlow(id, { multi: true, skipCoordinator: true });
      } else if (type === 'ripple' && window.Ripples && typeof window.Ripples.selectRipple === 'function') {
        window.Ripples.selectRipple(id, { multi: true, skipCoordinator: true });
      }

      if (window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        window.EngineBridge.setSelection(type, id, items);
      }

      this._refreshAllInstanceLists();
      this.updateActiveOverlays();
      this.emit('selection:changed', this.getActiveSelection());
    },

    _toggleObjectSelectionInternal(type, id, options = {}) {
      const items = Array.isArray(this.activeSelection.items) ? [...this.activeSelection.items] : [];
      const strId = String(id);
      const idx = items.findIndex((it) => it.type === type && String(it.id) === strId);

      if (idx >= 0) {
        items.splice(idx, 1);
        if (items.length === 0) {
          this._isCoordinatingSelection = false;
          this.clearSelection();
          return;
        }
        const last = items[items.length - 1];
        this.activeSelection = {
          type: last.type,
          id: last.id,
          items: items
        };
        if (last.type === 'node' && window.DiagramNodes && typeof window.DiagramNodes.selectNode === 'function') {
          window.DiagramNodes.selectNode(last.id, false, { multi: true, skipCoordinator: true });
        } else if (last.type === 'flow' && window.DataFlows && typeof window.DataFlows.selectFlow === 'function') {
          window.DataFlows.selectFlow(last.id, { multi: true, skipCoordinator: true });
        } else if (last.type === 'glow' && window.Glows && typeof window.Glows.selectGlow === 'function') {
          window.Glows.selectGlow(last.id, { multi: true, skipCoordinator: true });
        } else if (last.type === 'ripple' && window.Ripples && typeof window.Ripples.selectRipple === 'function') {
          window.Ripples.selectRipple(last.id, { multi: true, skipCoordinator: true });
        }
      } else {
        items.push({ type, id });
        this.activeSelection = {
          type: type,
          id: id,
          items: items
        };
        if (type === 'node' && window.DiagramNodes && typeof window.DiagramNodes.selectNode === 'function') {
          window.DiagramNodes.selectNode(id, false, { multi: true, skipCoordinator: true });
        } else if (type === 'flow' && window.DataFlows && typeof window.DataFlows.selectFlow === 'function') {
          window.DataFlows.selectFlow(id, { multi: true, skipCoordinator: true });
        } else if (type === 'glow' && window.Glows && typeof window.Glows.selectGlow === 'function') {
          window.Glows.selectGlow(id, { multi: true, skipCoordinator: true });
        } else if (type === 'ripple' && window.Ripples && typeof window.Ripples.selectRipple === 'function') {
          window.Ripples.selectRipple(id, { multi: true, skipCoordinator: true });
        }
      }

      if (window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        window.EngineBridge.setSelection(this.activeSelection.type, this.activeSelection.id, items);
      }

      this._refreshAllInstanceLists();
      this.updateActiveOverlays();
      this.emit('selection:changed', this.getActiveSelection());
    },

    _setMultiSelectionInternal(items, primaryId = null, options = {}) {
      if (!Array.isArray(items) || items.length === 0) {
        this._isCoordinatingSelection = false;
        this.clearSelection();
        return;
      }

      const validItems = items.filter((it) => it && it.type && it.id != null);
      if (validItems.length === 0) {
        this._isCoordinatingSelection = false;
        this.clearSelection();
        return;
      }

      let primary = validItems.find((it) => String(it.id) === String(primaryId));
      if (!primary) primary = validItems[validItems.length - 1];

      this.activeSelection = {
        type: primary.type,
        id: primary.id,
        items: validItems
      };

      if (primary.type === 'node' && window.DiagramNodes && typeof window.DiagramNodes.selectNode === 'function') {
        window.DiagramNodes.selectNode(primary.id, false, { multi: true, skipCoordinator: true });
      } else if (primary.type === 'flow' && window.DataFlows && typeof window.DataFlows.selectFlow === 'function') {
        window.DataFlows.selectFlow(primary.id, { multi: true, skipCoordinator: true });
      } else if (primary.type === 'glow' && window.Glows && typeof window.Glows.selectGlow === 'function') {
        window.Glows.selectGlow(primary.id, { multi: true, skipCoordinator: true });
      } else if (primary.type === 'ripple' && window.Ripples && typeof window.Ripples.selectRipple === 'function') {
        window.Ripples.selectRipple(primary.id, { multi: true, skipCoordinator: true });
      }

      if (window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        window.EngineBridge.setSelection(primary.type, primary.id, validItems);
      }

      this._refreshAllInstanceLists();
      this.updateActiveOverlays();
      this.emit('selection:changed', this.getActiveSelection());
    },

    _refreshAllInstanceLists() {
      if (window.DiagramNodes && typeof window.DiagramNodes.renderList === 'function') {
        window.DiagramNodes.renderList();
      }
      if (window.DataFlows && typeof window.DataFlows.renderList === 'function') {
        window.DataFlows.renderList();
      }
      if (window.Glows && typeof window.Glows.renderList === 'function') {
        window.Glows.renderList();
      }
      if (window.Ripples && typeof window.Ripples.renderList === 'function') {
        window.Ripples.renderList();
      }
      if (window.LayerManager && typeof window.LayerManager.syncFromEngine === 'function') {
        window.LayerManager.syncFromEngine();
      }
      this.emit('layers:changed', window.LayerManager ? window.LayerManager.getLayers() : []);
    },

    addToSelection(type, id, options = {}) {
      this.selectObject(type, id, Object.assign({}, options, { additive: true }));
    },

    toggleObjectSelection(type, id, options = {}) {
      this.selectObject(type, id, Object.assign({}, options, { toggle: true }));
    },

    setMultiSelection(items, primaryId = null, options = {}) {
      this.selectObject(null, null, Object.assign({}, options, { items, primaryId }));
    },

    isInGroupEditMode() {
      return this.groupEditModeGroupId !== null;
    },

    getGroupEditModeGroupId() {
      return this.groupEditModeGroupId;
    },

    enterGroupEditMode(groupId) {
      this.groupEditModeGroupId = String(groupId);
      this.emit('group:editmode', { groupId: this.groupEditModeGroupId });
      this.updateActiveOverlays();
    },

    exitGroupEditMode() {
      if (this.groupEditModeGroupId !== null) {
        const prev = this.groupEditModeGroupId;
        this.groupEditModeGroupId = null;
        this.emit('group:editmode', { groupId: null, previousGroupId: prev });
        this.updateActiveOverlays();
      }
    },

    findGroupByMember(type, id) {
      if (window.EngineBridge && typeof window.EngineBridge.findGroupByMember === 'function') {
        const found = window.EngineBridge.findGroupByMember(type, id);
        if (found) return found;
      }
      if (window.ObjectGroups && typeof window.ObjectGroups.findGroupByMember === 'function') {
        return window.ObjectGroups.findGroupByMember(type, id);
      }
      return null;
    },

    getGroup(groupId) {
      if (window.EngineBridge && typeof window.EngineBridge.getGroup === 'function') {
        const found = window.EngineBridge.getGroup(groupId);
        if (found) return found;
      }
      if (window.ObjectGroups && typeof window.ObjectGroups.getGroup === 'function') {
        return window.ObjectGroups.getGroup(groupId);
      }
      return null;
    },

    getAllGroups() {
      if (window.EngineBridge && typeof window.EngineBridge.listGroups === 'function') {
        const list = window.EngineBridge.listGroups();
        if (Array.isArray(list)) return list;
      }
      if (window.ObjectGroups && typeof window.ObjectGroups.getAllGroups === 'function') {
        return window.ObjectGroups.getAllGroups();
      }
      return [];
    },

    selectGroup(groupId, options = {}) {
      const grp = this.getGroup(groupId);
      if (!grp) return false;

      if (window.DiagramNodes && window.DiagramNodes.activeId !== null) {
        window.DiagramNodes.deselectNode();
      }
      if (window.DataFlows && window.DataFlows.activeId !== null) {
        window.DataFlows.deselectFlow();
      }
      if (window.Glows && window.Glows.activeId !== null) {
        window.Glows.deselectGlow();
      }
      if (window.Ripples && window.Ripples.activeId !== null) {
        window.Ripples.deselectRipple();
      }
      if (window.Stage && window.Stage.activePlacement) {
        window.Stage.clearActive();
      }

      const members = Array.isArray(grp.members) ? [...grp.members] : [];
      this.activeSelection = {
        type: 'group',
        id: String(groupId),
        items: members,
        name: grp.name || ('Group ' + grp.id)
      };

      if (window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        window.EngineBridge.setSelection('group', String(groupId), members);
      }

      this.updateActiveOverlays();
      this.emit('selection:changed', this.getActiveSelection());

      if (window.FloatingPropertiesEditor && typeof window.FloatingPropertiesEditor.openFor === 'function') {
        window.FloatingPropertiesEditor.openFor('group', String(groupId));
      }

      return true;
    },

    createGroupFromSelection(name = '') {
      let items = this.getSelectedItems();
      if (!Array.isArray(items) || items.length < 2) {
        this.showNotification('Select at least 2 objects to create a group.', 'warning', 2500);
        return null;
      }
      for (const it of items) {
        const existing = this.findGroupByMember(it.type, it.id);
        if (existing) {
          this.showNotification(`Object ${it.type} #${it.id} already belongs to group "${existing.name || existing.id}". Ungroup it first.`, 'warning', 3000);
          return null;
        }
      }
      let res = null;
      if (window.EngineBridge && typeof window.EngineBridge.createGroup === 'function') {
        res = window.EngineBridge.createGroup(name, items);
      } else if (window.ObjectGroups && typeof window.ObjectGroups.createGroup === 'function') {
        res = window.ObjectGroups.createGroup(name, items);
      }
      if (res && res.success && res.group) {
        this.selectGroup(res.group.id);
        this.requestRender();
        this.recordHistoryImmediate();
        this.showNotification(`Created group: ${res.group.name || res.group.id}`, 'success', 2000);
        return res.group;
      }
      this.showNotification((res && res.error) ? res.error : 'Failed to create group.', 'error', 3000);
      return null;
    },

    ungroupSelectedGroup() {
      let groupId = null;
      if (this.activeSelection.type === 'group' && this.activeSelection.id) {
        groupId = this.activeSelection.id;
      } else if (this.groupEditModeGroupId) {
        groupId = this.groupEditModeGroupId;
      } else if (this.activeSelection.type && this.activeSelection.id) {
        const grp = this.findGroupByMember(this.activeSelection.type, this.activeSelection.id);
        if (grp) groupId = grp.id;
      } else if (Array.isArray(this.activeSelection.items) && this.activeSelection.items.length > 0) {
        for (const it of this.activeSelection.items) {
          const grp = this.findGroupByMember(it.type, it.id);
          if (grp) {
            groupId = grp.id;
            break;
          }
        }
      }
      if (!groupId) {
        this.showNotification('No group selected to ungroup.', 'warning', 2500);
        return false;
      }
      let res = null;
      if (window.EngineBridge && typeof window.EngineBridge.ungroup === 'function') {
        res = window.EngineBridge.ungroup(groupId);
      } else if (window.ObjectGroups && typeof window.ObjectGroups.ungroup === 'function') {
        res = window.ObjectGroups.ungroup(groupId);
      }
      if (res && res.success) {
        this.exitGroupEditMode();
        if (Array.isArray(res.members) && res.members.length > 0) {
          this.setMultiSelection(res.members);
        } else {
          this.clearSelection();
        }
        this._refreshAllInstanceLists();
        this.updateActiveOverlays();
        this.requestRender();
        this.recordHistoryImmediate();
        this.showNotification('Ungrouped objects.', 'info', 2000);
        return true;
      }
      this.showNotification((res && res.error) ? res.error : 'Failed to ungroup.', 'error', 3000);
      return false;
    },

    removeSelectedMembersFromGroup(members = null, groupId = null) {
      if (!groupId) {
        if (this.groupEditModeGroupId) {
          groupId = this.groupEditModeGroupId;
        } else if (this.activeSelection.type === 'group' && this.activeSelection.id) {
          groupId = this.activeSelection.id;
        } else if (this.activeSelection.type && this.activeSelection.id) {
          const grp = this.findGroupByMember(this.activeSelection.type, this.activeSelection.id);
          if (grp) groupId = grp.id;
        }
      }

      if (!members) {
        if (this.activeSelection.type && this.activeSelection.id && this.activeSelection.type !== 'group') {
          members = [{ type: this.activeSelection.type, id: this.activeSelection.id }];
        } else if (Array.isArray(this.activeSelection.items) && this.activeSelection.items.length > 0) {
          members = this.activeSelection.items.filter((it) => it.type !== 'group');
        }
      }

      if (!groupId || !Array.isArray(members) || members.length === 0) {
        this.showNotification('No member selected to remove from group.', 'warning', 2500);
        return false;
      }

      let res = null;
      if (window.EngineBridge && typeof window.EngineBridge.removeGroupMembers === 'function') {
        res = window.EngineBridge.removeGroupMembers(groupId, members);
      } else if (window.ObjectGroups && typeof window.ObjectGroups.removeMembers === 'function') {
        res = window.ObjectGroups.removeMembers(groupId, members);
      }

      if (res && res.success) {
        if (res.dissolved) {
          this.exitGroupEditMode();
          this.showNotification('Removed from group. Group dissolved (< 2 members remaining).', 'info', 2500);
        } else {
          this.showNotification(`Removed ${members.length} object${members.length > 1 ? 's' : ''} from group.`, 'info', 2000);
        }
        this._refreshAllInstanceLists();
        this.updateActiveOverlays();
        this.requestRender();
        this.recordHistoryImmediate();
        this.emit('selection:changed', this.getActiveSelection());
        return true;
      }

      this.showNotification((res && res.error) ? res.error : 'Failed to remove member from group.', 'error', 3000);
      return false;
    },

    renameSelectedGroup(newName) {
      if (this.activeSelection.type !== 'group' || !this.activeSelection.id) return false;
      const grpId = this.activeSelection.id;
      let res = null;
      if (window.EngineBridge && typeof window.EngineBridge.renameGroup === 'function') {
        res = window.EngineBridge.renameGroup(grpId, newName);
      } else if (window.ObjectGroups && typeof window.ObjectGroups.renameGroup === 'function') {
        res = window.ObjectGroups.renameGroup(grpId, newName);
      }
      if (res && res.success) {
        this.activeSelection.name = newName;
        this.emit('selection:changed', this.getActiveSelection());
        this.recordHistoryDebounced();
        return true;
      }
      return false;
    },

    duplicateSelection() {
      let items = [], groupId = null;
      if (this.activeSelection.type === 'group' && this.activeSelection.id) {
        groupId = this.activeSelection.id;
      } else if (Array.isArray(this.activeSelection.items) && this.activeSelection.items.length > 0) {
        items = this.activeSelection.items;
      } else if (this.activeSelection.type && this.activeSelection.id) {
        items = [{ type: this.activeSelection.type, id: this.activeSelection.id }];
      } else {
        this.showNotification('Nothing selected to duplicate.', 'warning', 2000);
        return false;
      }
      let res = null;
      if (window.EngineBridge && typeof window.EngineBridge.duplicateSelection === 'function') {
        res = window.EngineBridge.duplicateSelection(items, groupId, 5.0, 5.0);
      } else if (window.ObjectGroups && typeof window.ObjectGroups.duplicateSelection === 'function') {
        res = window.ObjectGroups.duplicateSelection(items, groupId, 5.0, 5.0);
      }
      if (res && res.success) {
        this._refreshAllInstanceLists();
        if (res.newGroupId) {
          this.selectGroup(res.newGroupId);
        } else if (Array.isArray(res.newItems) && res.newItems.length > 0) {
          if (res.newItems.length === 1) {
            this.selectObject(res.newItems[0].type, res.newItems[0].id);
          } else {
            this.setMultiSelection(res.newItems);
          }
        }
        this.requestRender();
        this.recordHistoryImmediate();
        this.showNotification('Duplicated selection.', 'info', 1500);
        return true;
      }
      this.showNotification((res && res.error) ? res.error : 'Failed to duplicate.', 'error', 3000);
      return false;
    },

    copySelection() {
      let items = [], groupId = null;
      if (this.activeSelection.type === 'group' && this.activeSelection.id) {
        groupId = this.activeSelection.id;
      } else if (Array.isArray(this.activeSelection.items) && this.activeSelection.items.length > 0) {
        items = this.activeSelection.items;
      } else if (this.activeSelection.type && this.activeSelection.id) {
        items = [{ type: this.activeSelection.type, id: this.activeSelection.id }];
      } else {
        this.showNotification('Nothing selected to copy.', 'warning', 2000);
        return false;
      }
      let payload = null;
      if (window.EngineBridge && typeof window.EngineBridge.copySelection === 'function') {
        payload = window.EngineBridge.copySelection(items, groupId);
      } else if (window.ObjectGroups && typeof window.ObjectGroups.copySelection === 'function') {
        payload = window.ObjectGroups.copySelection(items, groupId);
      }
      if (payload) {
        this._clipboardPayload = payload;
        this.showNotification('Copied selection to clipboard.', 'info', 1500);
        return true;
      }
      this.showNotification('Failed to copy selection.', 'error', 2000);
      return false;
    },

    pasteClipboard() {
      if (!this._clipboardPayload) {
        this.showNotification('Clipboard is empty.', 'warning', 2000);
        return false;
      }
      let res = null;
      if (window.EngineBridge && typeof window.EngineBridge.pastePayload === 'function') {
        res = window.EngineBridge.pastePayload(this._clipboardPayload, 5.0, 5.0);
      } else if (window.ObjectGroups && typeof window.ObjectGroups.pastePayload === 'function') {
        res = window.ObjectGroups.pastePayload(this._clipboardPayload, 5.0, 5.0);
      }
      if (res && res.success) {
        this._refreshAllInstanceLists();
        if (res.newGroupId) {
          this.selectGroup(res.newGroupId);
        } else if (Array.isArray(res.newItems) && res.newItems.length > 0) {
          if (res.newItems.length === 1) {
            this.selectObject(res.newItems[0].type, res.newItems[0].id);
          } else {
            this.setMultiSelection(res.newItems);
          }
        }
        this.requestRender();
        this.recordHistoryImmediate();
        this.showNotification('Pasted from clipboard.', 'info', 1500);
        return true;
      }
      this.showNotification((res && res.error) ? res.error : 'Failed to paste.', 'error', 3000);
      return false;
    },

    moveSelectedNodes(deltaX, deltaY) {
      if (this.activeSelection.type === 'group' && this.activeSelection.id) {
        let res = null;
        if (window.EngineBridge && typeof window.EngineBridge.moveGroup === 'function') {
          res = window.EngineBridge.moveGroup(this.activeSelection.id, deltaX, deltaY);
        } else if (window.ObjectGroups && typeof window.ObjectGroups.moveGroup === 'function') {
          res = window.ObjectGroups.moveGroup(this.activeSelection.id, deltaX, deltaY);
        }
        if (window.DiagramNodes && typeof window.DiagramNodes.refreshAfterChange === 'function') {
          window.DiagramNodes.refreshAfterChange();
        }
        this.updateActiveOverlays();
        return true;
      }
      const ids = this.getSelectedNodeIds();
      if (ids.length === 0) return false;
      let res = null;
      if (window.EngineBridge && typeof window.EngineBridge.moveNodesGroup === 'function') {
        res = window.EngineBridge.moveNodesGroup(ids, deltaX, deltaY);
      }
      if (res && res.nodes && window.DiagramNodes && Array.isArray(window.DiagramNodes.list)) {
        res.nodes.forEach((un) => {
          const existing = window.DiagramNodes.getNode(un.id);
          if (existing) {
            existing.x = un.x;
            existing.y = un.y;
          }
        });
      }
      if (window.DiagramNodes && typeof window.DiagramNodes.refreshAfterChange === 'function') {
        window.DiagramNodes.refreshAfterChange();
      }
      this.updateActiveOverlays();
      return true;
    },

    alignSelectedNodes(mode) {
      const ids = this.getSelectedNodeIds();
      if (ids.length < 2) {
        this.showNotification('Select at least 2 shapes to align.', 'warning');
        return false;
      }
      const dims = this.getCanvasDimensions();
      let res = null;
      if (window.EngineBridge && typeof window.EngineBridge.alignNodes === 'function') {
        res = window.EngineBridge.alignNodes(ids, mode, dims.width, dims.height);
      }
      if (!res || !res.success) {
        this.showNotification((res && res.error) ? res.error : 'Alignment failed.', 'error');
        return false;
      }
      if (res.nodes && window.DiagramNodes && Array.isArray(window.DiagramNodes.list)) {
        res.nodes.forEach((un) => {
          const existing = window.DiagramNodes.getNode(un.id);
          if (existing) {
            existing.x = un.x;
            existing.y = un.y;
          }
        });
      }
      if (window.DiagramNodes && typeof window.DiagramNodes.refreshAfterChange === 'function') {
        window.DiagramNodes.refreshAfterChange();
      }
      this.requestRender();
      this.recordHistoryImmediate();
      this.updateActiveOverlays();
      this.showNotification(`Aligned ${ids.length} shapes.`, 'info', 2000);
      return true;
    },

    distributeSelectedNodes(mode) {
      const ids = this.getSelectedNodeIds();
      if (ids.length < 3) {
        this.showNotification('Select at least 3 shapes to distribute.', 'warning');
        return false;
      }
      const dims = this.getCanvasDimensions();
      let res = null;
      if (window.EngineBridge && typeof window.EngineBridge.distributeNodes === 'function') {
        res = window.EngineBridge.distributeNodes(ids, mode, dims.width, dims.height);
      }
      if (!res || !res.success) {
        this.showNotification((res && res.error) ? res.error : 'Distribution failed.', 'error');
        return false;
      }
      if (res.nodes && window.DiagramNodes && Array.isArray(window.DiagramNodes.list)) {
        res.nodes.forEach((un) => {
          const existing = window.DiagramNodes.getNode(un.id);
          if (existing) {
            existing.x = un.x;
            existing.y = un.y;
          }
        });
      }
      if (window.DiagramNodes && typeof window.DiagramNodes.refreshAfterChange === 'function') {
        window.DiagramNodes.refreshAfterChange();
      }
      this.requestRender();
      this.recordHistoryImmediate();
      this.updateActiveOverlays();
      this.showNotification(`Distributed ${ids.length} shapes.`, 'info', 2000);
      return true;
    },

    bringSelectionToFront(targets = null) {
      return this._coordinateLayerReorder('bringToFront', targets);
    },

    bringSelectionForward(targets = null) {
      return this._coordinateLayerReorder('bringForward', targets);
    },

    sendSelectionBackward(targets = null) {
      return this._coordinateLayerReorder('sendBackward', targets);
    },

    sendSelectionToBack(targets = null) {
      return this._coordinateLayerReorder('sendToBack', targets);
    },

    _coordinateLayerReorder(action, explicitTargets = null) {
      let targets = explicitTargets;
      if (targets && !Array.isArray(targets) && typeof targets === 'object' && targets.type) {
        targets = [targets];
      }
      if (!targets) {
        if (this.activeSelection.type === 'group' && this.activeSelection.id) {
          targets = [{ type: 'group', id: String(this.activeSelection.id) }];
        } else if (Array.isArray(this.activeSelection.items) && this.activeSelection.items.length > 0) {
          targets = this.activeSelection.items;
        } else if (this.activeSelection.type && this.activeSelection.id != null) {
          targets = [{ type: this.activeSelection.type, id: String(this.activeSelection.id) }];
        }
      }

      if (!targets || (Array.isArray(targets) && targets.length === 0)) {
        this.showNotification('Select an object or group to reorder.', 'warning', 2000);
        return false;
      }

      let res = null;
      if (window.EngineBridge && typeof window.EngineBridge[action] === 'function') {
        res = window.EngineBridge[action](targets);
      } else if (window.LayerManager && typeof window.LayerManager[action] === 'function') {
        res = window.LayerManager[action](targets);
      }

      if (res && res.success) {
        this.emit('layers:changed', window.LayerManager ? window.LayerManager.getLayers() : []);
        this.requestRender();
        this.recordHistoryImmediate();
        this.updateActiveOverlays();
        return true;
      } else if (res && res.error) {
        this.showNotification('Layer reorder failed: ' + res.error, 'error', 3000);
      }
      return false;
    },

    deleteSelectedObjects() {
      if (this.activeSelection.type === 'group' && this.activeSelection.id) {
        const grpId = this.activeSelection.id;
        if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
          const eff = window.LayerManager.getEffective('group', grpId);
          if (eff && eff.locked) {
            this.showNotification('Cannot delete locked group.', 'warning', 2000);
            return false;
          }
        }
        const grp = this.getGroup(grpId);
        if (grp && Array.isArray(grp.members)) {
          grp.members.forEach((m) => {
            if (m.type === 'node' && window.DiagramNodes && typeof window.DiagramNodes.deleteNode === 'function') {
              window.DiagramNodes.deleteNode(m.id);
            } else if (m.type === 'flow' && window.DataFlows && typeof window.DataFlows.deleteFlow === 'function') {
              window.DataFlows.deleteFlow(m.id);
            } else if (m.type === 'glow' && window.Glows && typeof window.Glows.deleteGlow === 'function') {
              window.Glows.deleteGlow(m.id);
            } else if (m.type === 'ripple' && window.Ripples && typeof window.Ripples.deleteRipple === 'function') {
              window.Ripples.deleteRipple(m.id);
            } else if (m.type === 'image' && window.ImageObjects && typeof window.ImageObjects.deleteImage === 'function') {
              window.ImageObjects.deleteImage(m.id);
            }
          });
        }
        if (window.EngineBridge && typeof window.EngineBridge.deleteGroup === 'function') {
          window.EngineBridge.deleteGroup(grpId, true);
        } else if (window.ObjectGroups && typeof window.ObjectGroups.deleteGroup === 'function') {
          window.ObjectGroups.deleteGroup(grpId, true);
        }
        this._refreshAllInstanceLists();
        this.clearSelection();
        this.requestRender();
        this.recordHistoryImmediate();
        this.showNotification('Deleted group and its members.', 'info', 2000);
        return true;
      }
      const items = this.getSelectedItems();
      if (items.length === 0) return false;
      let deletedCount = 0;
      let lockedSkipped = 0;
      const remainingItems = [];
      items.forEach((it) => {
        if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
          const eff = window.LayerManager.getEffective(it.type, it.id);
          if (eff && eff.locked) {
            lockedSkipped++;
            remainingItems.push(it);
            return;
          }
        }
        if (it.type === 'node' && window.DiagramNodes && typeof window.DiagramNodes.deleteNode === 'function') {
          window.DiagramNodes.deleteNode(it.id);
          deletedCount++;
        } else if (it.type === 'flow' && window.DataFlows && typeof window.DataFlows.deleteFlow === 'function') {
          window.DataFlows.deleteFlow(it.id);
          deletedCount++;
        } else if (it.type === 'glow' && window.Glows && typeof window.Glows.deleteGlow === 'function') {
          window.Glows.deleteGlow(it.id);
          deletedCount++;
        } else if (it.type === 'ripple' && window.Ripples && typeof window.Ripples.deleteRipple === 'function') {
          window.Ripples.deleteRipple(it.id);
          deletedCount++;
        } else if (it.type === 'image' && window.ImageObjects && typeof window.ImageObjects.deleteImage === 'function') {
          window.ImageObjects.deleteImage(it.id);
          deletedCount++;
        }
      });

      if (deletedCount === 0 && lockedSkipped > 0) {
        this.showNotification('Cannot delete locked object(s).', 'warning', 2000);
        return false;
      }

      this._refreshAllInstanceLists();
      if (remainingItems.length === 0) {
        this.clearSelection();
      } else {
        this.setMultiSelection(remainingItems);
      }
      this.requestRender();
      this.recordHistoryImmediate();
      if (lockedSkipped > 0) {
        this.showNotification(`Deleted ${deletedCount} object(s) (${lockedSkipped} locked skipped).`, 'info', 2500);
      } else {
        this.showNotification(`Deleted ${deletedCount} object(s).`, 'info', 2000);
      }
      return true;
    },

    /**
     * Coordinates active waypoint selection on DataFlows.
     *
     * @param {number|string} index - Waypoint index to activate
     * @returns {boolean} Whether the waypoint selection succeeded
     */
    selectWaypoint(index) {
      if (window.DataFlows && typeof window.DataFlows.selectWaypoint === 'function') {
        return window.DataFlows.selectWaypoint(index);
      }
      return false;
    },

    /**
     * Refreshes active UI overlays (reticles, selection outlines) for whichever
     * object is currently active across DiagramNodes, DataFlows, Glows, and Ripples.
     */
    updateActiveOverlays() {
      if (this.activeSelection.type === 'group' && this.activeSelection.id) {
        if (window.DiagramNodes && typeof window.DiagramNodes.updateGroupOverlay === 'function') {
          window.DiagramNodes.updateGroupOverlay(this.activeSelection.id);
        }
      } else {
        if (window.DiagramNodes && typeof window.DiagramNodes.hideGroupOverlay === 'function') {
          window.DiagramNodes.hideGroupOverlay();
        }
      }

      if (window.DiagramNodes) {
        if (window.DiagramNodes.activeId !== null) {
          const activeNode = typeof window.DiagramNodes.getNode === 'function'
            ? window.DiagramNodes.getNode(window.DiagramNodes.activeId)
            : (window.DiagramNodes.list && window.DiagramNodes.list.find((n) => n.id === window.DiagramNodes.activeId));
          if (activeNode && typeof window.DiagramNodes.updateUIOverlay === 'function') {
            window.DiagramNodes.updateUIOverlay(activeNode);
          }
        } else if ((this.getSelectedItems().length > 0 || (this.activeSelection.type === 'image' && this.activeSelection.id != null)) && typeof window.DiagramNodes.updateUIOverlay === 'function') {
          window.DiagramNodes.updateUIOverlay(null);
        }
      }
      if (window.DataFlows && window.DataFlows.activeId !== null) {
        if (typeof window.DataFlows.updateUIOverlay === 'function') {
          window.DataFlows.updateUIOverlay();
        }
      }
      if (window.Glows && window.Glows.activeId !== null) {
        const activeGlow = typeof window.Glows.getGlow === 'function'
          ? window.Glows.getGlow(window.Glows.activeId)
          : (window.Glows.list && window.Glows.list.find((g) => g.id === window.Glows.activeId));
        if (activeGlow && typeof window.Glows.updateUIOverlay === 'function') {
          window.Glows.updateUIOverlay(activeGlow);
        }
      }
      if (window.Ripples && window.Ripples.activeId !== null) {
        const activeRipple = typeof window.Ripples.getRipple === 'function'
          ? window.Ripples.getRipple(window.Ripples.activeId)
          : (window.Ripples.list && window.Ripples.list.find((r) => r.id === window.Ripples.activeId));
        if (activeRipple && typeof window.Ripples.updateUIOverlay === 'function') {
          window.Ripples.updateUIOverlay(activeRipple);
        }
      }
      if (typeof window.syncImageToolsUI === 'function') {
        window.syncImageToolsUI();
      }
    },

    /**
     * Clears active selection across all modules (Select None state).
     * Does not delete objects, disable effects, reset parameters, or pollute undo history.
     *
     * @param {Object|string} [options] - Options object ({ reason, exceptType }) or string exceptType
     */
    clearSelection(options = {}) {
      this.exitGroupEditMode();
      const exceptType = (typeof options === 'string')
        ? options
        : (options && options.exceptType ? options.exceptType : null);
      const opts = (typeof options === 'object' && options !== null) ? options : {};
      this.selectObject(exceptType, null, opts);
      if (window.DiagramNodes && typeof window.DiagramNodes.hideGroupOverlay === 'function') {
        window.DiagramNodes.hideGroupOverlay();
      }
      this._refreshAllInstanceLists();
    },

    /**
     * Coordinates the post-restoration presentation refresh across modules.
     * Clears selections and overlays, updates preset rows, invokes UI sync / render,
     * and emits 'state:restored'.
     *
     * @param {Object} [options] - Context info ({ source: 'undo'|'redo'|'project'|'new_project'|'direct_apply', projectId })
     */
    coordinatePostRestore(options = {}) {
      let selectionRestored = false;
      const rSel = options && options.restoredSelection;
      if (rSel && rSel.type && rSel.id !== null && rSel.id !== undefined) {
        const idStr = String(rSel.id);
        if (rSel.type === 'group' && (this.getGroup(idStr) || (window.ObjectGroups && window.ObjectGroups.getGroup(idStr)))) {
          selectionRestored = true;
          this.selectGroup(rSel.id);
        } else if (rSel.type === 'node' && window.DiagramNodes && Array.isArray(window.DiagramNodes.list) && window.DiagramNodes.list.some((n) => String(n.id) === idStr)) {
          selectionRestored = true;
          this.selectObject('node', rSel.id);
        } else if (rSel.type === 'flow' && window.DataFlows && Array.isArray(window.DataFlows.list) && window.DataFlows.list.some((f) => String(f.id) === idStr)) {
          selectionRestored = true;
          this.selectObject('flow', rSel.id);
        } else if (rSel.type === 'glow' && window.Glows && Array.isArray(window.Glows.list) && window.Glows.list.some((g) => String(g.id) === idStr)) {
          selectionRestored = true;
          this.selectObject('glow', rSel.id);
        } else if (rSel.type === 'ripple' && window.Ripples && Array.isArray(window.Ripples.list) && window.Ripples.list.some((r) => String(r.id) === idStr)) {
          selectionRestored = true;
          this.selectObject('ripple', rSel.id);
        }
      }

      if (!selectionRestored) {
        if (window.DiagramNodes && typeof window.DiagramNodes.deselectNode === 'function') {
          window.DiagramNodes.deselectNode();
        }
        if (window.DataFlows && typeof window.DataFlows.deselectFlow === 'function') {
          window.DataFlows.deselectFlow();
        }
        if (window.Glows && typeof window.Glows.deselectGlow === 'function') {
          window.Glows.deselectGlow();
        }
        if (window.Ripples && typeof window.Ripples.deselectRipple === 'function') {
          window.Ripples.deselectRipple();
        }
        if (window.Stage && typeof window.Stage.clearActive === 'function') {
          window.Stage.clearActive();
        }
        this.activeSelection = { type: null, id: null };
        if (window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
          window.EngineBridge.clearSelection();
        }
        this.emit('selection:changed', this.getActiveSelection());
      }

      if (window.NodePresets && typeof window.NodePresets.syncAllRowsUI === 'function') {
        window.NodePresets.syncAllRowsUI();
      }

      if (typeof window.syncUIAfterHistoryRestore === 'function') {
        window.syncUIAfterHistoryRestore();
      } else {
        this.requestRender();
      }

      if (options && (options.source === 'project' || options.source === 'new_project')) {
        if (window.TimelinePlayer && typeof window.TimelinePlayer.stop === 'function') {
          window.TimelinePlayer.stop();
        }
      }

      this.emit('state:restored', {
        source: options.source || 'restore',
        projectId: options.projectId !== undefined ? options.projectId : null
      });
    },

    getCanvasDimensions() {
      if (window.SceneState && window.SceneState.currentImage) {
        return {
          width: window.SceneState.currentImage.width || 1280,
          height: window.SceneState.currentImage.height || 720
        };
      }
      if (window.Stage && window.Stage.canvasWidth && window.Stage.canvasHeight) {
        return {
          width: window.Stage.canvasWidth,
          height: window.Stage.canvasHeight
        };
      }
      if (window.SceneState) {
        const w = (typeof window.SceneState.getNumControl === 'function'
          ? window.SceneState.getNumControl('canvasWidthInput', 1280)
          : parseInt(window.SceneState.controls && window.SceneState.controls.canvasWidthInput, 10)) || 1280;
        const h = (typeof window.SceneState.getNumControl === 'function'
          ? window.SceneState.getNumControl('canvasHeightInput', 720)
          : parseInt(window.SceneState.controls && window.SceneState.controls.canvasHeightInput, 10)) || 720;
        return { width: w, height: h };
      }
      return { width: 1280, height: 720 };
    },

    getSnapConfig() {
      if (window.ControlStateAdaptor) {
        window.ControlStateAdaptor.syncFromDOM(['chkSnapToGrid', 'snapGridSizeSlider', 'snapGridSizeNum', 'canvasWidthInput', 'canvasHeightInput']);
      }
      if (window.SceneState) {
        const cfg = window.SceneState.getSnapConfig();
        const dims = this.getCanvasDimensions();
        cfg.canvasWidth = dims.width;
        cfg.canvasHeight = dims.height;
        return cfg;
      }
      return {
        enabled: false,
        gridSizePx: 20,
        canvasWidth: 1280,
        canvasHeight: 720
      };
    },

    snapPctToGrid(valPct, axis = 'x') {
      const cfg = this.getSnapConfig();
      if (window.Stage && typeof window.Stage.computeSnappedPct === 'function') {
        return window.Stage.computeSnappedPct(valPct, axis, cfg);
      }
      if (!cfg.enabled) return valPct;
      const totalPx = axis === 'x' ? cfg.canvasWidth : cfg.canvasHeight;
      if (totalPx <= 0) return valPct;
      const rawPx = (valPct / 100) * totalPx;
      const snappedPx = Math.round(rawPx / cfg.gridSizePx) * cfg.gridSizePx;
      return Math.round(Math.max(0, Math.min(100, (snappedPx / totalPx) * 100)) * 10) / 10;
    },

    snapPosition(xPct, yPct) {
      const cfg = this.getSnapConfig();
      if (window.Stage && typeof window.Stage.computeSnappedPosition === 'function') {
        return window.Stage.computeSnappedPosition(xPct, yPct, cfg);
      }
      if (!cfg.enabled) {
        return {
          x: Math.round(Math.min(100, Math.max(0, xPct)) * 10) / 10,
          y: Math.round(Math.min(100, Math.max(0, yPct)) * 10) / 10
        };
      }
      const gridPx = Math.max(2, parseFloat(cfg.gridSizePx || 20) || 20);
      const w = cfg.canvasWidth || 1280;
      const h = cfg.canvasHeight || 720;
      const rawPxX = (xPct / 100) * w;
      const rawPxY = (yPct / 100) * h;
      const snappedPxX = Math.min(w, Math.max(0, Math.round(rawPxX / gridPx) * gridPx));
      const snappedPxY = Math.min(h, Math.max(0, Math.round(rawPxY / gridPx) * gridPx));
      return {
        x: Number(((snappedPxX / w) * 100).toFixed(3)),
        y: Number(((snappedPxY / h) * 100).toFixed(3))
      };
    },

    /**
     * Dispatches a non-blocking studio notification event.
     * Layer 1 UI presentation (app.js) handles DOM rendering in #studioNotificationContainer.
     *
     * @param {string} message - Notification text
     * @param {string} [type='info'] - 'info' | 'success' | 'warning' | 'error'
     * @param {number} [durationMs=3500] - Duration in ms before auto-dismiss
     */
    showNotification(message, type = 'info', durationMs = 3500) {
      if (typeof window !== 'undefined' && window.StudioNotification && typeof window.StudioNotification.show === 'function') {
        return window.StudioNotification.show(message, type, durationMs);
      }
      this.emit('notification:show', { message, type, durationMs });
      return null;
    }
  };

  if (typeof window !== 'undefined') {
    window.showStudioNotification = function(msg, type, duration) {
      if (window.AppCoordinator && typeof window.AppCoordinator.showNotification === 'function') {
        return window.AppCoordinator.showNotification(msg, type, duration);
      }
      if (window.StudioNotification && typeof window.StudioNotification.show === 'function') {
        return window.StudioNotification.show(msg, type, duration);
      }
      return null;
    };
  }
})();
