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
    _pasteCount: 0,
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

    getSelection() {
      return this.getActiveSelection();
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

        if (normalizedType && normalizedId !== null && ['node', 'flow', 'glow', 'ripple', 'lite', 'image', 'group'].includes(normalizedType) && options.source !== 'layers_list' && window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
          const eff = window.LayerManager.getEffective(normalizedType, normalizedId);
          if (eff && (eff.locked || !eff.visible)) {
            return false;
          }
        }

        if (options.toggle && normalizedType && normalizedId !== null) {
          this._toggleObjectSelectionInternal(normalizedType, normalizedId, options);
          return;
        }

        if (options.additive && normalizedType && normalizedId !== null && ['node', 'flow', 'glow', 'ripple', 'lite', 'image'].includes(normalizedType)) {
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

        const targetId = id !== null && id !== undefined ? id : null;
        let validatedType = normalizedType;
        let validatedId = targetId;
        let validatedItems = (normalizedType && normalizedId !== null)
          ? [{ type: normalizedType, id: targetId }]
          : [];

        // Validate selection with authoritative Go engine before committing local state
        if (window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
          if (normalizedId !== null && ['node', 'flow', 'glow', 'ripple', 'lite', 'image'].includes(normalizedType)) {
            const res = window.EngineBridge.setSelection(normalizedType, normalizedId, validatedItems);
            if (!res || res.success === false) {
              // Go rejected the selection (e.g. object not found, locked, or invalid) - preserve existing selection
              return false;
            }
            if (res.type) validatedType = res.type;
            if (res.id) {
              validatedId = typeof targetId === 'number' ? Number(res.id) : res.id;
            }
            if (Array.isArray(res.items)) {
              validatedItems = res.items.map((it) => ({
                type: it.type,
                id: (typeof targetId === 'number' && String(targetId) === String(it.id)) ? targetId : it.id
              }));
            }
          } else if (normalizedId === null) {
            window.EngineBridge.clearSelection();
          }
        }

        // Single selection replacement on other modules
        if (validatedType !== 'node' && window.DiagramNodes && window.DiagramNodes.activeId !== null) {
          window.DiagramNodes.deselectNode();
        }
        if (validatedType !== 'flow' && window.DataFlows && window.DataFlows.activeId !== null) {
          window.DataFlows.deselectFlow();
        }
        if (validatedType !== 'glow' && window.Glows && window.Glows.activeId !== null) {
          window.Glows.deselectGlow();
        }
        if (validatedType !== 'ripple' && window.Ripples && window.Ripples.activeId !== null) {
          window.Ripples.deselectRipple();
        }
        if (validatedType !== 'lite' && window.LiteEffects && window.LiteEffects.activeId !== null) {
          window.LiteEffects.deselectLite();
        }
        if (validatedType !== 'camera' && !options.skipStageClear && window.Stage && window.Stage.activePlacement) {
          window.Stage.clearActive();
        }

        // Activate the target object on its owner module if not already active
        if (!options.skipModuleSelect && validatedId !== null) {
          if (validatedType === 'node' && window.DiagramNodes && window.DiagramNodes.activeId !== validatedId) {
            window.DiagramNodes.selectNode(validatedId, false);
          } else if (validatedType === 'flow' && window.DataFlows && window.DataFlows.activeId !== validatedId) {
            window.DataFlows.selectFlow(validatedId);
          } else if (validatedType === 'glow' && window.Glows && window.Glows.activeId !== validatedId) {
            window.Glows.selectGlow(validatedId);
          } else if (validatedType === 'ripple' && window.Ripples && window.Ripples.activeId !== validatedId) {
            window.Ripples.selectRipple(validatedId);
          } else if (validatedType === 'lite' && window.LiteEffects && String(window.LiteEffects.activeId) !== String(validatedId)) {
            window.LiteEffects.selectLite(validatedId, { skipCoordinator: true });
          } else if (validatedType === 'image') {
            if (typeof window.syncImageEditorUI === 'function') {
              window.syncImageEditorUI();
            }
          } else if (validatedType === 'camera' && window.Stage && window.Stage.activePlacement !== validatedId) {
            window.Stage.setActive(validatedId);
          }
        }

        this.activeSelection = {
          type: validatedType,
          id: validatedId,
          items: validatedItems
        };

        if (options.openAccordionId && typeof window.openAccordionById === 'function') {
          window.openAccordionById(options.openAccordionId);
        }

        this._refreshAllInstanceLists();
        this.updateActiveOverlays();
        this.emit('selection:changed', this.getActiveSelection());
        return true;
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

      if (window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.setSelection(type, id, items);
        if (!res || res.success === false) {
          return false;
        }
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
      } else if (type === 'lite' && window.LiteEffects && typeof window.LiteEffects.selectLite === 'function') {
        window.LiteEffects.selectLite(id, { multi: true, skipCoordinator: true });
      }

      this._refreshAllInstanceLists();
      this.updateActiveOverlays();
      this.emit('selection:changed', this.getActiveSelection());
      return true;
    },

    _toggleObjectSelectionInternal(type, id, options = {}) {
      const items = Array.isArray(this.activeSelection.items) ? [...this.activeSelection.items] : [];
      const strId = String(id);
      const idx = items.findIndex((it) => it.type === type && String(it.id) === strId);

      let nextType = type;
      let nextId = id;
      let nextItems = items;

      if (idx >= 0) {
        nextItems = items.filter((it, i) => i !== idx);
        if (nextItems.length === 0) {
          this._isCoordinatingSelection = false;
          this.clearSelection();
          return true;
        }
        const last = nextItems[nextItems.length - 1];
        nextType = last.type;
        nextId = last.id;
      } else {
        nextItems = [...items, { type, id }];
        nextType = type;
        nextId = id;
      }

      if (window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.setSelection(nextType, nextId, nextItems);
        if (!res || res.success === false) {
          return false;
        }
      }

      this.activeSelection = {
        type: nextType,
        id: nextId,
        items: nextItems
      };

      if (nextType === 'node' && window.DiagramNodes && typeof window.DiagramNodes.selectNode === 'function') {
        window.DiagramNodes.selectNode(nextId, false, { multi: true, skipCoordinator: true });
      } else if (nextType === 'flow' && window.DataFlows && typeof window.DataFlows.selectFlow === 'function') {
        window.DataFlows.selectFlow(nextId, { multi: true, skipCoordinator: true });
      } else if (nextType === 'glow' && window.Glows && typeof window.Glows.selectGlow === 'function') {
        window.Glows.selectGlow(nextId, { multi: true, skipCoordinator: true });
      } else if (nextType === 'ripple' && window.Ripples && typeof window.Ripples.selectRipple === 'function') {
        window.Ripples.selectRipple(nextId, { multi: true, skipCoordinator: true });
      } else if (nextType === 'lite' && window.LiteEffects && typeof window.LiteEffects.selectLite === 'function') {
        window.LiteEffects.selectLite(nextId, { multi: true, skipCoordinator: true });
      }

      this._refreshAllInstanceLists();
      this.updateActiveOverlays();
      this.emit('selection:changed', this.getActiveSelection());
      return true;
    },

    _setMultiSelectionInternal(items, primaryId = null, options = {}) {
      if (!Array.isArray(items) || items.length === 0) {
        this._isCoordinatingSelection = false;
        this.clearSelection();
        return true;
      }

      const validItems = items.filter((it) => it && it.type && it.id != null);
      if (validItems.length === 0) {
        this._isCoordinatingSelection = false;
        this.clearSelection();
        return true;
      }

      let primary = validItems.find((it) => String(it.id) === String(primaryId));
      if (!primary) primary = validItems[validItems.length - 1];

      if (window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.setSelection(primary.type, primary.id, validItems);
        if (!res || res.success === false) {
          return false;
        }
      }

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
      } else if (primary.type === 'lite' && window.LiteEffects && typeof window.LiteEffects.selectLite === 'function') {
        window.LiteEffects.selectLite(primary.id, { multi: true, skipCoordinator: true });
      }

      this._refreshAllInstanceLists();
      this.updateActiveOverlays();
      this.emit('selection:changed', this.getActiveSelection());
      return true;
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
      if (window.LiteEffects && typeof window.LiteEffects.renderList === 'function') {
        window.LiteEffects.renderList();
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

      if (window.EngineBridge && typeof window.EngineBridge.isReady === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.setSelection('group', String(groupId), members);
        if (!res || res.success === false) {
          return false;
        }
      }

      this.activeSelection = {
        type: 'group',
        id: String(groupId),
        items: members,
        name: grp.name || ('Group ' + grp.id)
      };

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

    renameGroup(grpId, newName) {
      if (!grpId) return { success: false };
      let res = null;
      if (window.EngineBridge && typeof window.EngineBridge.renameGroup === 'function') {
        res = window.EngineBridge.renameGroup(grpId, newName);
      } else if (window.ObjectGroups && typeof window.ObjectGroups.renameGroup === 'function') {
        res = window.ObjectGroups.renameGroup(grpId, newName);
      }
      if (res && res.success) {
        if (this.activeSelection && this.activeSelection.type === 'group' && String(this.activeSelection.id) === String(grpId)) {
          this.activeSelection.name = newName;
        }
        this.emit('selection:changed', this.getActiveSelection());
        return res;
      }
      return res || { success: false };
    },

    saveSelectedGroupAsComposite(name = '', description = '') {
      let groupId = null;
      if (this.activeSelection && this.activeSelection.type === 'group' && this.activeSelection.id) {
        groupId = this.activeSelection.id;
      }
      if (!groupId) {
        this.showNotification('Select a group to save as a composite template.', 'warning', 2500);
        return null;
      }
      const grp = this.getGroup(groupId);
      const compName = (name && String(name).trim()) || (grp && grp.name) || String(groupId);
      if (window.EngineBridge && typeof window.EngineBridge.createCompositeFromGroup === 'function') {
        const res = window.EngineBridge.createCompositeFromGroup(groupId, compName, description);
        if (res && res.success && res.composite) {
          this._refreshAllInstanceLists();
          if (typeof window.renderCompositesList === 'function') window.renderCompositesList();
          if (typeof window.renderWidgetParametersOverview === 'function') window.renderWidgetParametersOverview();
          this.showNotification(`Saved composite template "${res.composite.name}" (${res.composite.id})`, 'success', 2500);
          return res.composite;
        }
        this.showNotification((res && res.error) || 'Failed to save composite template.', 'error', 3000);
      }
      return null;
    },

    instantiateComposite(compositeId, instanceName = '', offsetX = 5.0, offsetY = 5.0) {
      if (!compositeId) return null;
      if (window.EngineBridge && typeof window.EngineBridge.instantiateComposite === 'function') {
        const res = window.EngineBridge.instantiateComposite(compositeId, instanceName, offsetX, offsetY);
        if (res && res.success && res.group) {
          this._refreshAllInstanceLists();
          this.selectGroup(res.group.id);
          this.requestRender();
          if (typeof window.renderCompositesList === 'function') window.renderCompositesList();
          if (typeof window.renderWidgetParametersOverview === 'function') window.renderWidgetParametersOverview();
          this.showNotification(`Placed composite instance "${res.group.name}" (${res.group.id})`, 'success', 2200);
          return res.group;
        }
        this.showNotification((res && res.error) || 'Failed to instantiate composite template.', 'error', 3000);
      }
      return null;
    },

    deleteComposite(compositeId) {
      if (!compositeId) return false;
      if (window.EngineBridge && typeof window.EngineBridge.deleteComposite === 'function') {
        const res = window.EngineBridge.deleteComposite(compositeId);
        if (res && res.success) {
          if (typeof window.renderCompositesList === 'function') window.renderCompositesList();
          this.showNotification(`Deleted composite template ${compositeId}`, 'info', 2000);
          return true;
        }
      }
      return false;
    },

    duplicateSelection() {
      let items = [], groupId = null;
      if (this.activeSelection.type === 'group' && this.activeSelection.id) {
        groupId = this.activeSelection.id;
      } else if (Array.isArray(this.activeSelection.items) && this.activeSelection.items.length > 0) {
        items = this.activeSelection.items.filter((it) => it.type !== 'camera');
      } else if (this.activeSelection.type && this.activeSelection.id) {
        if (this.activeSelection.type === 'camera') {
          this.showNotification('Camera cannot be duplicated.', 'warning', 2000);
          return false;
        }
        items = [{ type: this.activeSelection.type, id: this.activeSelection.id }];
      }
      if (!groupId && items.length === 0) {
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

    clearClipboard() {
      this._clipboardPayload = null;
      this._pasteCount = 0;
    },

    copySelection() {
      let items = [], groupId = null;
      if (this.activeSelection.type === 'group' && this.activeSelection.id) {
        groupId = this.activeSelection.id;
      } else if (Array.isArray(this.activeSelection.items) && this.activeSelection.items.length > 0) {
        items = this.activeSelection.items.filter((it) => it.type !== 'camera');
      } else if (this.activeSelection.type && this.activeSelection.id) {
        if (this.activeSelection.type === 'camera') {
          this.showNotification('Camera cannot be copied.', 'warning', 2000);
          return false;
        }
        items = [{ type: this.activeSelection.type, id: this.activeSelection.id }];
      }
      if (!groupId && items.length === 0) {
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
        this._pasteCount = 0;
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
      this._pasteCount = (this._pasteCount || 0) + 1;
      const offset = 5.0 + (this._pasteCount - 1) * 20.0;
      let res = null;
      if (window.EngineBridge && typeof window.EngineBridge.pastePayload === 'function') {
        res = window.EngineBridge.pastePayload(this._clipboardPayload, offset, offset);
      } else if (window.ObjectGroups && typeof window.ObjectGroups.pastePayload === 'function') {
        res = window.ObjectGroups.pastePayload(this._clipboardPayload, offset, offset);
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
        if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
          const eff = window.LayerManager.getEffective('group', this.activeSelection.id);
          if (eff && eff.locked) return false;
        }
        let res = null;
        if (window.EngineBridge && typeof window.EngineBridge.moveGroup === 'function') {
          res = window.EngineBridge.moveGroup(this.activeSelection.id, deltaX, deltaY);
        } else if (window.ObjectGroups && typeof window.ObjectGroups.moveGroup === 'function') {
          res = window.ObjectGroups.moveGroup(this.activeSelection.id, deltaX, deltaY);
        }
        if (res && res.success === false) {
          return false;
        }
        if (!res && window.EngineBridge && window.EngineBridge.isReady()) {
          return false;
        }
        if (window.DiagramNodes && typeof window.DiagramNodes.refreshAfterChange === 'function') {
          window.DiagramNodes.refreshAfterChange();
        }
        if (window.LiteEffects && window.EngineBridge && typeof window.EngineBridge.getAllLiteEffects === 'function' && window.EngineBridge.isReady()) {
          const goLites = window.EngineBridge.getAllLiteEffects();
          if (Array.isArray(goLites)) {
            window.LiteEffects.list = goLites.map((l) => window.LiteEffects._migrateLiteEffect(l));
            window.LiteEffects.renderList();
          }
        }
        this.requestRender();
        this.updateActiveOverlays();
        return true;
      }
      const ids = this.getSelectedNodeIds();
      if (ids.length === 0) return false;
      const unlockedIds = ids.filter((id) => {
        if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
          const eff = window.LayerManager.getEffective('node', id);
          if (eff && eff.locked) return false;
        }
        return true;
      });
      if (unlockedIds.length === 0) return false;
      let res = null;
      if (window.EngineBridge && typeof window.EngineBridge.moveNodesGroup === 'function') {
        res = window.EngineBridge.moveNodesGroup(unlockedIds, deltaX, deltaY);
      }
      if (window.EngineBridge && window.EngineBridge.isReady()) {
        if (!res || res.success === false) {
          return false;
        }
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
      if (res && res.flows && window.DataFlows && Array.isArray(window.DataFlows.list)) {
        res.flows.forEach((uf) => {
          const existing = window.DataFlows.getFlow(uf.id);
          if (existing) {
            existing.nodes = uf.nodes;
            existing.fromNodeId = uf.fromNodeId;
            existing.toNodeId = uf.toNodeId;
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
      const unlockedIds = ids.filter((id) => {
        if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
          const eff = window.LayerManager.getEffective('node', id);
          if (eff && eff.locked) return false;
        }
        return true;
      });
      if (unlockedIds.length < 2) {
        this.showNotification('Select at least 2 unlocked shapes to align.', 'warning');
        return false;
      }
      const dims = this.getCanvasDimensions();
      let res = null;
      if (window.EngineBridge && typeof window.EngineBridge.alignNodes === 'function') {
        res = window.EngineBridge.alignNodes(unlockedIds, mode, dims.width, dims.height);
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
      if (res.flows && window.DataFlows && Array.isArray(window.DataFlows.list)) {
        res.flows.forEach((uf) => {
          const existing = window.DataFlows.getFlow(uf.id);
          if (existing) {
            existing.nodes = uf.nodes;
            existing.fromNodeId = uf.fromNodeId;
            existing.toNodeId = uf.toNodeId;
          }
        });
      }
      if (window.DiagramNodes && typeof window.DiagramNodes.refreshAfterChange === 'function') {
        window.DiagramNodes.refreshAfterChange();
      }
      this.requestRender();
      this.recordHistoryImmediate();
      this.updateActiveOverlays();
      this.showNotification(`Aligned ${unlockedIds.length} shapes.`, 'info', 2000);
      return true;
    },

    distributeSelectedNodes(mode) {
      const ids = this.getSelectedNodeIds();
      const unlockedIds = ids.filter((id) => {
        if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
          const eff = window.LayerManager.getEffective('node', id);
          if (eff && eff.locked) return false;
        }
        return true;
      });
      if (unlockedIds.length < 3) {
        this.showNotification('Select at least 3 unlocked shapes to distribute.', 'warning');
        return false;
      }
      const dims = this.getCanvasDimensions();
      let res = null;
      if (window.EngineBridge && typeof window.EngineBridge.distributeNodes === 'function') {
        res = window.EngineBridge.distributeNodes(unlockedIds, mode, dims.width, dims.height);
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
      if (res.flows && window.DataFlows && Array.isArray(window.DataFlows.list)) {
        res.flows.forEach((uf) => {
          const existing = window.DataFlows.getFlow(uf.id);
          if (existing) {
            existing.nodes = uf.nodes;
            existing.fromNodeId = uf.fromNodeId;
            existing.toNodeId = uf.toNodeId;
          }
        });
      }
      if (window.DiagramNodes && typeof window.DiagramNodes.refreshAfterChange === 'function') {
        window.DiagramNodes.refreshAfterChange();
      }
      this.requestRender();
      this.recordHistoryImmediate();
      this.updateActiveOverlays();
      this.showNotification(`Distributed ${unlockedIds.length} shapes.`, 'info', 2000);
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
          const hasLockedMember = grp.members.some((m) => {
            if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
              const eff = window.LayerManager.getEffective(m.type, m.id);
              if (eff && eff.locked) return true;
            }
            return false;
          });
          if (hasLockedMember) {
            this.showNotification('Cannot delete group containing locked members.', 'warning', 2000);
            return false;
          }
        }
        if (window.EngineBridge && typeof window.EngineBridge.deleteGroup === 'function' && window.EngineBridge.isReady()) {
          window.EngineBridge.deleteGroup(grpId, true);
        } else {
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
              } else if (m.type === 'lite' && window.LiteEffects && typeof window.LiteEffects.deleteLiteEffect === 'function') {
                window.LiteEffects.deleteLiteEffect(m.id);
              } else if (m.type === 'image' && window.ImageObjects && typeof window.ImageObjects.deleteImage === 'function') {
                window.ImageObjects.deleteImage(m.id);
              }
            });
          }
          if (window.ObjectGroups && typeof window.ObjectGroups.deleteGroup === 'function') {
            window.ObjectGroups.deleteGroup(grpId, true);
          }
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
        } else if (it.type === 'lite' && window.LiteEffects && typeof window.LiteEffects.deleteLiteEffect === 'function') {
          window.LiteEffects.deleteLiteEffect(it.id);
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
      if (this.activeSelection && this.activeSelection.type === 'lite' && window.LiteEffects && typeof window.LiteEffects.selectWaypoint === 'function') {
        window.LiteEffects.selectWaypoint(index);
        return true;
      }
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
          const isVis = !window.LayerManager || typeof window.LayerManager.getEffective !== 'function' ||
            window.LayerManager.getEffective('node', window.DiagramNodes.activeId)?.visible !== false;
          const activeNode = isVis && (typeof window.DiagramNodes.getNode === 'function'
            ? window.DiagramNodes.getNode(window.DiagramNodes.activeId)
            : (window.DiagramNodes.list && window.DiagramNodes.list.find((n) => n.id === window.DiagramNodes.activeId)));
          if (typeof window.DiagramNodes.updateUIOverlay === 'function') {
            window.DiagramNodes.updateUIOverlay(activeNode || null);
          }
        } else if ((this.getSelectedItems().length > 0 || ((this.activeSelection.type === 'image' || this.activeSelection.type === 'lite') && this.activeSelection.id != null)) && typeof window.DiagramNodes.updateUIOverlay === 'function') {
          window.DiagramNodes.updateUIOverlay(null);
        }
      }
      if (window.DataFlows && window.DataFlows.activeId !== null) {
        const isVis = !window.LayerManager || typeof window.LayerManager.getEffective !== 'function' ||
          window.LayerManager.getEffective('flow', window.DataFlows.activeId)?.visible !== false;
        if (typeof window.DataFlows.updateUIOverlay === 'function') {
          window.DataFlows.updateUIOverlay(isVis ? undefined : null);
        }
      }
      if (window.Glows && window.Glows.activeId !== null) {
        const isVis = !window.LayerManager || typeof window.LayerManager.getEffective !== 'function' ||
          window.LayerManager.getEffective('glow', window.Glows.activeId)?.visible !== false;
        const activeGlow = isVis && (typeof window.Glows.getGlow === 'function'
          ? window.Glows.getGlow(window.Glows.activeId)
          : (window.Glows.list && window.Glows.list.find((g) => g.id === window.Glows.activeId)));
        if (typeof window.Glows.updateUIOverlay === 'function') {
          window.Glows.updateUIOverlay(activeGlow || null);
        }
      }
      if (window.Ripples && window.Ripples.activeId !== null) {
        const isVis = !window.LayerManager || typeof window.LayerManager.getEffective !== 'function' ||
          window.LayerManager.getEffective('ripple', window.Ripples.activeId)?.visible !== false;
        const activeRipple = isVis && (typeof window.Ripples.getRipple === 'function'
          ? window.Ripples.getRipple(window.Ripples.activeId)
          : (window.Ripples.list && window.Ripples.list.find((r) => r.id === window.Ripples.activeId)));
        if (typeof window.Ripples.updateUIOverlay === 'function') {
          window.Ripples.updateUIOverlay(activeRipple || null);
        }
      }
      if (window.LiteEffects && typeof window.LiteEffects.updateUIOverlay === 'function') {
        if (window.LiteEffects.activeId !== null) {
          const isVis = !window.LayerManager || typeof window.LayerManager.getEffective !== 'function' ||
            window.LayerManager.getEffective('lite', window.LiteEffects.activeId)?.visible !== false;
          const activeLite = isVis ? window.LiteEffects.getLiteEffect(window.LiteEffects.activeId) : null;
          window.LiteEffects.updateUIOverlay(activeLite || null);
        } else {
          window.LiteEffects.updateUIOverlay(null);
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
      if (options && (options.source === 'new_project' || options.source === 'project')) {
        this.clearClipboard();
        if (window.ImageToolsController && typeof window.ImageToolsController.clearCache === 'function') {
          window.ImageToolsController.clearCache();
        }
      }
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
        } else if (rSel.type === 'lite' && window.LiteEffects && Array.isArray(window.LiteEffects.list) && window.LiteEffects.list.some((l) => String(l.id) === idStr)) {
          selectionRestored = true;
          this.selectObject('lite', rSel.id);
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
     * Stage 17-M3: Returns current playhead position in seconds (rounded to 0.01s, clamped to 0..60s).
     */
    getCurrentPlayheadSeconds() {
      let sec = 0;
      if (window.TimelinePlayer && typeof window.TimelinePlayer.currentTime === 'number' && !isNaN(window.TimelinePlayer.currentTime)) {
        sec = window.TimelinePlayer.currentTime;
      } else if (window.TimelinePlayer && typeof window.TimelinePlayer.currentTimeMs === 'number' && !isNaN(window.TimelinePlayer.currentTimeMs)) {
        sec = window.TimelinePlayer.currentTimeMs / 1000;
      } else if (window.TimelinePlayer && typeof window.TimelinePlayer.getState === 'function') {
        const st = window.TimelinePlayer.getState();
        if (st && typeof st.currentTime === 'number' && !isNaN(st.currentTime)) {
          sec = st.currentTime;
        } else if (st && typeof st.currentTimeMs === 'number' && !isNaN(st.currentTimeMs)) {
          sec = st.currentTimeMs / 1000;
        }
      }
      return Math.round(Math.max(0, Math.min(60, sec)) * 100) / 100;
    },

    /**
     * Stage 17-M3: Determines whether a selection item supports animated Start Delay assignment.
     *
     * @param {{type: string, id: number|string}} item
     * @returns {{eligible: boolean, reason: string, field: string|null, obj: Object|null, label: string}}
     */
    getAnimationEligibility(item) {
      if (!item || !item.type || item.id == null) {
        return { eligible: false, reason: 'invalid', field: null, obj: null, label: '' };
      }
      if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
        const eff = window.LayerManager.getEffective(item.type, item.id);
        if (eff && eff.locked) {
          return { eligible: false, reason: 'locked', field: null, obj: null, label: `${item.type} #${item.id}` };
        }
      }
      if (item.type === 'node') {
        const n = window.DiagramNodes && typeof window.DiagramNodes.getNode === 'function'
          ? window.DiagramNodes.getNode(item.id)
          : null;
        if (!n) return { eligible: false, reason: 'missing', field: null, obj: null, label: `Shape #${item.id}` };
        const label = n.name || n.title || `Shape #${n.id}`;
        if (!n.anim || n.anim === 'none') {
          return { eligible: false, reason: 'static', field: 'animDelay', obj: n, label };
        }
        return { eligible: true, reason: 'animated', field: 'animDelay', obj: n, label };
      }
      if (item.type === 'flow') {
        const f = window.DataFlows && typeof window.DataFlows.getFlow === 'function'
          ? window.DataFlows.getFlow(item.id)
          : null;
        if (!f) return { eligible: false, reason: 'missing', field: null, obj: null, label: `Flow #${item.id}` };
        const label = f.name || f.label || `Flow #${f.id}`;
        if (f.type === 'line-only' && f.lineStyle !== 'marching') {
          return { eligible: false, reason: 'static', field: 'delay', obj: f, label };
        }
        return { eligible: true, reason: 'animated', field: 'delay', obj: f, label };
      }
      if (item.type === 'glow') {
        const g = window.Glows && typeof window.Glows.getGlow === 'function'
          ? window.Glows.getGlow(item.id)
          : null;
        if (!g) return { eligible: false, reason: 'missing', field: null, obj: null, label: `Glow #${item.id}` };
        const label = g.name || `Glow #${g.id}`;
        if (g.playback === 'static') {
          return { eligible: false, reason: 'static', field: 'delay', obj: g, label };
        }
        return { eligible: true, reason: 'animated', field: 'delay', obj: g, label };
      }
      if (item.type === 'ripple') {
        const r = window.Ripples && typeof window.Ripples.getRipple === 'function'
          ? window.Ripples.getRipple(item.id)
          : null;
        if (!r) return { eligible: false, reason: 'missing', field: null, obj: null, label: `Ripple #${item.id}` };
        const label = r.name || `Ripple #${r.id}`;
        return { eligible: true, reason: 'animated', field: 'delay', obj: r, label };
      }
      if (item.type === 'lite') {
        const le = window.LiteEffects && typeof window.LiteEffects.getLiteEffect === 'function'
          ? window.LiteEffects.getLiteEffect(item.id)
          : null;
        if (!le) return { eligible: false, reason: 'missing', field: null, obj: null, label: `Lite #${item.id}` };
        const label = le.name || `${le.kind} (${le.id})`;
        if (le.kind === 'gauge-lite' || le.kind === 'oscilloscope-lite') {
          return { eligible: false, reason: 'static', field: 'delay', obj: le, label };
        }
        if (le.kind === 'text-lite' && (!le.textAnim || le.textAnim === 'none')) {
          return { eligible: false, reason: 'static', field: 'delay', obj: le, label };
        }
        return { eligible: true, reason: 'animated', field: 'delay', obj: le, label };
      }
      return { eligible: false, reason: 'unsupported', field: null, obj: null, label: `${item.type} #${item.id}` };
    },

    /**
     * Stage 17-M3: Inspects the current selection in deterministic selection order
     * and returns eligible animated items alongside skipped static/locked items.
     */
    getEligibleAnimatedSelection() {
      const items = this.getSelectedItems();
      const eligible = [];
      const skipped = [];
      items.forEach((it, index) => {
        const info = this.getAnimationEligibility(it);
        const entry = Object.assign({ type: it.type, id: it.id, selectionIndex: index }, info);
        if (info.eligible) {
          eligible.push(entry);
        } else {
          skipped.push(entry);
        }
      });
      return { total: items.length, eligible, skipped };
    },

    /**
     * Stage 17-M3: Sets Start Delay on a single object without recording history or re-rendering
     * (used as an internal primitive by both setStartDelayFromPlayhead and staggerSelectedObjects).
     */
    _applyObjectStartDelayInternal(type, id, delaySec) {
      const clamped = Math.round(Math.max(0, Math.min(60, Number(delaySec) || 0)) * 100) / 100;
      if (type === 'node' && window.DiagramNodes) {
        if (typeof window.DiagramNodes.updateNode === 'function') {
          return !!window.DiagramNodes.updateNode(id, { animDelay: clamped });
        }
        const n = window.DiagramNodes.getNode(id);
        if (!n) return false;
        n.animDelay = clamped;
        return true;
      }
      if (type === 'flow' && window.DataFlows) {
        if (typeof window.DataFlows.updateFlow === 'function') {
          return !!window.DataFlows.updateFlow(id, { delay: clamped });
        }
        const f = window.DataFlows.getFlow(id);
        if (!f) return false;
        f.delay = clamped;
        return true;
      }
      if (type === 'glow' && window.Glows) {
        if (typeof window.Glows.updateGlow === 'function') {
          return !!window.Glows.updateGlow(id, { delay: clamped });
        }
        const g = window.Glows.getGlow(id);
        if (!g) return false;
        g.delay = clamped;
        return true;
      }
      if (type === 'ripple' && window.Ripples) {
        if (typeof window.Ripples.updateRipple === 'function') {
          return !!window.Ripples.updateRipple(id, { delay: clamped });
        }
        const r = window.Ripples.getRipple(id);
        if (!r) return false;
        r.delay = clamped;
        return true;
      }
      if (type === 'lite' && window.LiteEffects) {
        if (typeof window.LiteEffects.updateLiteEffect === 'function') {
          return !!window.LiteEffects.updateLiteEffect(id, { delay: clamped });
        }
        const le = window.LiteEffects.getLiteEffect(id);
        if (!le) return false;
        le.delay = clamped;
        return true;
      }
      return false;
    },

    /**
     * Stage 17-M3 (E3): Sets an object's Start Delay from the current timeline playhead position.
     *
     * @param {string} [targetType] - Defaults to activeSelection.type
     * @param {number|string} [targetId] - Defaults to activeSelection.id
     * @returns {{success: boolean, delaySec: number}}
     */
    setStartDelayFromPlayhead(targetType = null, targetId = null) {
      const type = targetType || (this.activeSelection && this.activeSelection.type);
      const id = targetId != null ? targetId : (this.activeSelection && this.activeSelection.id);
      if (!type || id == null) {
        return { success: false, delaySec: 0 };
      }
      const delaySec = this.getCurrentPlayheadSeconds();
      const ok = this._applyObjectStartDelayInternal(type, id, delaySec);
      if (!ok) {
        return { success: false, delaySec: 0 };
      }
      if (type === 'node' && window.DiagramNodes && typeof window.DiagramNodes.syncEditorUI === 'function') {
        const n = window.DiagramNodes.getNode(id);
        if (n) window.DiagramNodes.syncEditorUI(n);
      } else if (type === 'flow' && window.DataFlows && typeof window.DataFlows.syncEditorUI === 'function') {
        const f = window.DataFlows.getFlow(id);
        if (f) window.DataFlows.syncEditorUI(f);
      } else if (type === 'glow' && window.Glows && typeof window.Glows.syncEditorUI === 'function') {
        const g = window.Glows.getGlow(id);
        if (g) window.Glows.syncEditorUI(g);
      } else if (type === 'ripple' && window.Ripples && typeof window.Ripples.syncEditorUI === 'function') {
        const r = window.Ripples.getRipple(id);
        if (r) window.Ripples.syncEditorUI(r);
      } else if (type === 'lite' && window.LiteEffects && typeof window.LiteEffects.syncEditorUI === 'function') {
        const le = window.LiteEffects.getLiteEffect(id);
        if (le) window.LiteEffects.syncEditorUI(le);
      }
      if (window.FloatingContextEditor && typeof window.FloatingContextEditor.syncFromActiveObject === 'function') {
        window.FloatingContextEditor.syncFromActiveObject();
      }
      this.requestRender();
      this.recordHistoryImmediate();
      this.showNotification(`Start Delay set to ${delaySec.toFixed(2).replace(/\.?0+$/, '') || '0'}s from playhead.`, 'info', 1800);
      return { success: true, delaySec };
    },

    /**
     * Stage 17-M3 (E4): Assigns sequential Start Delay values (`baseDelay + i * stepDelay`)
     * across eligible animated objects in deterministic selection order.
     * Ineligible static/locked objects are skipped safely without modification.
     * Records a single Undo/Redo history entry.
     *
     * @param {{baseDelay?: number, stepDelay?: number}} [options]
     * @returns {{success: boolean, appliedCount: number, skippedCount: number, assignments: Array}}
     */
    staggerSelectedObjects(options = {}) {
      const baseRaw = options.baseDelay !== undefined ? Number(options.baseDelay) : 0;
      const stepRaw = options.stepDelay !== undefined ? Number(options.stepDelay) : 0.5;
      const baseDelay = isNaN(baseRaw) ? 0 : Math.max(0, Math.min(60, baseRaw));
      const stepDelay = isNaN(stepRaw) ? 0.5 : Math.max(0, Math.min(30, stepRaw));

      const report = this.getEligibleAnimatedSelection();
      if (report.eligible.length === 0) {
        this.showNotification('No eligible animated objects in selection to stagger.', 'warning', 2500);
        return {
          success: false,
          appliedCount: 0,
          skippedCount: report.skipped.length,
          assignments: []
        };
      }

      const assignments = [];
      report.eligible.forEach((entry, index) => {
        const delaySec = Math.round(Math.max(0, Math.min(60, baseDelay + index * stepDelay)) * 100) / 100;
        const ok = this._applyObjectStartDelayInternal(entry.type, entry.id, delaySec);
        if (ok) {
          assignments.push({
            type: entry.type,
            id: entry.id,
            label: entry.label,
            delay: delaySec
          });
        }
      });

      if (this.activeSelection && this.activeSelection.type && this.activeSelection.id != null) {
        const activeType = this.activeSelection.type;
        const activeId = this.activeSelection.id;
        if (activeType === 'node' && window.DiagramNodes && typeof window.DiagramNodes.syncEditorUI === 'function') {
          const n = window.DiagramNodes.getNode(activeId);
          if (n) window.DiagramNodes.syncEditorUI(n);
        } else if (activeType === 'flow' && window.DataFlows && typeof window.DataFlows.syncEditorUI === 'function') {
          const f = window.DataFlows.getFlow(activeId);
          if (f) window.DataFlows.syncEditorUI(f);
        } else if (activeType === 'glow' && window.Glows && typeof window.Glows.syncEditorUI === 'function') {
          const g = window.Glows.getGlow(activeId);
          if (g) window.Glows.syncEditorUI(g);
        } else if (activeType === 'ripple' && window.Ripples && typeof window.Ripples.syncEditorUI === 'function') {
          const r = window.Ripples.getRipple(activeId);
          if (r) window.Ripples.syncEditorUI(r);
        } else if (activeType === 'lite' && window.LiteEffects && typeof window.LiteEffects.syncEditorUI === 'function') {
          const le = window.LiteEffects.getLiteEffect(activeId);
          if (le) window.LiteEffects.syncEditorUI(le);
        }
      }
      if (window.FloatingContextEditor && typeof window.FloatingContextEditor.syncFromActiveObject === 'function') {
        window.FloatingContextEditor.syncFromActiveObject();
      }
      this._refreshAllInstanceLists();
      this.requestRender();
      this.recordHistoryImmediate();

      const skippedMsg = report.skipped.length > 0 ? ` (${report.skipped.length} static/locked skipped)` : '';
      this.showNotification(
        `Staggered ${assignments.length} animated object${assignments.length === 1 ? '' : 's'} (base ${baseDelay}s, +${stepDelay}s)${skippedMsg}.`,
        'success',
        2600
      );
      return {
        success: true,
        appliedCount: assignments.length,
        skippedCount: report.skipped.length,
        assignments
      };
    },

    /**
     * Stage 17-M3 (E4): Synchronises the multi-selection stagger summary badge and button state
     * across any container possessing `.multi-stagger-section`.
     */
    syncMultiStaggerUI(containerEl = document) {
      const root = containerEl || document;
      if (typeof root.querySelectorAll !== 'function') return;
      const sections = root.querySelectorAll('.multi-stagger-section');
      if (!sections || sections.length === 0) return;

      const report = this.getEligibleAnimatedSelection();
      let summaryText = `${report.eligible.length} eligible in selection order`;
      if (report.skipped.length > 0) {
        summaryText = `${report.eligible.length} of ${report.total} eligible (${report.skipped.length} static skipped)`;
      }
      const tooltipParts = [];
      if (report.eligible.length > 0) {
        tooltipParts.push('Selection order: ' + report.eligible.map((e, idx) => `${idx + 1}. ${e.label}`).join(' → '));
      }
      if (report.skipped.length > 0) {
        tooltipParts.push('Skipped (static/locked): ' + report.skipped.map((s) => s.label).join(', '));
      }
      const tooltip = tooltipParts.join('\n') || 'Select animated objects to assign staggered Start Delays.';

      sections.forEach((sec) => {
        const sumEl = sec.querySelector('.multi-stagger-summary');
        if (sumEl) {
          sumEl.textContent = summaryText;
          sumEl.title = tooltip;
        }
        const applyBtn = sec.querySelector('.btn-apply-stagger');
        if (applyBtn) {
          applyBtn.disabled = report.eligible.length === 0;
          applyBtn.title = tooltip;
        }
      });
    },

    /**
     * Stage 17-M3 (E4): Binds event listeners on `.multi-stagger-section` blocks once.
     */
    bindMultiStaggerControls(containerEl = document) {
      const root = containerEl || document;
      if (typeof root.querySelectorAll !== 'function') return;
      const sections = root.querySelectorAll('.multi-stagger-section');
      sections.forEach((sec) => {
        if (sec.dataset.staggerBound === 'true') return;
        sec.dataset.staggerBound = 'true';

        const baseInput = sec.querySelector('.multi-stagger-base');
        const stepInput = sec.querySelector('.multi-stagger-step');
        const playheadBtn = sec.querySelector('.btn-stagger-base-playhead');
        const applyBtn = sec.querySelector('.btn-apply-stagger');

        if (playheadBtn && baseInput) {
          playheadBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const secNow = this.getCurrentPlayheadSeconds();
            baseInput.value = secNow;
            root.querySelectorAll('.multi-stagger-base').forEach((inp) => {
              inp.value = secNow;
            });
          });
        }
        if (baseInput) {
          baseInput.addEventListener('change', () => {
            const val = Math.max(0, Math.min(60, parseFloat(baseInput.value) || 0));
            baseInput.value = val;
            root.querySelectorAll('.multi-stagger-base').forEach((inp) => {
              inp.value = val;
            });
          });
        }
        if (stepInput) {
          stepInput.addEventListener('change', () => {
            const val = Math.max(0, Math.min(30, parseFloat(stepInput.value) || 0));
            stepInput.value = val;
            root.querySelectorAll('.multi-stagger-step').forEach((inp) => {
              inp.value = val;
            });
          });
        }
        if (applyBtn) {
          applyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const baseDelay = baseInput ? parseFloat(baseInput.value) : 0;
            const stepDelay = stepInput ? parseFloat(stepInput.value) : 0.5;
            this.staggerSelectedObjects({ baseDelay, stepDelay });
          });
        }
      });
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
