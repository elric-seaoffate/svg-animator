package scene

import (
	"errors"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
)

// GroupMember represents an object instance member in a persistent group.
type GroupMember struct {
	Type SelectionType `json:"type"` // "node", "flow", "glow", "ripple", "image", "lite"
	ID   StringID      `json:"id"`
}

// GroupTargetBinding maps a group-level semantic property to a specific member object property.
type GroupTargetBinding struct {
	MemberType SelectionType `json:"memberType"` // "node", "flow", "glow", "ripple", "image", "lite"
	MemberID   StringID      `json:"memberId"`
	Target     string        `json:"target"`   // Canonical target ID (e.g. "lite-1", "node-2")
	Property   string        `json:"property"` // Eligible property on that member (e.g. "value", "text", "color")
}

// GroupPropertyMapping defines a user-authored semantic property exposed on a Group.
type GroupPropertyMapping struct {
	Alias       string               `json:"alias"`       // Semantic property suffix (e.g. "cpu", "status-color", "headline")
	Label       string               `json:"label"`       // Human-friendly label
	Type        string               `json:"type"`        // "number", "color", "text", "boolean", "enum", "speed"
	Default     any                  `json:"default"`     // Authored default value
	Min         *float64             `json:"min,omitempty"`
	Max         *float64             `json:"max,omitempty"`
	Step        *float64             `json:"step,omitempty"`
	Unit        string               `json:"unit,omitempty"`
	Options     []string             `json:"options,omitempty"`
	Description string               `json:"description,omitempty"`
	Targets     []GroupTargetBinding `json:"targets"` // 1 or more member property bindings
}

// Group represents a persistent named visual object group entity.
type Group struct {
	ID               StringID               `json:"id"`
	Name             string                 `json:"name,omitempty"`             // User-editable display name
	CompositeID      StringID               `json:"compositeId,omitempty"`      // Optional project-local composite template provenance (Stage 16E-M3)
	ComponentID      string                 `json:"componentId,omitempty"`      // Stable logical reusable Component Definition ID
	ComponentVersion string                 `json:"componentVersion,omitempty"` // Pinned SemVer revision of the Component Definition
	InstanceID       string                 `json:"instanceId,omitempty"`       // Stable per-instance identity distinct from Group.ID
	ParentGroupID    StringID               `json:"parentGroupId,omitempty"`    // Optional parent group/component ID for nested composition
	Members          []GroupMember          `json:"members"`
	Mappings         []GroupPropertyMapping `json:"mappings,omitempty"`
	Visible          *bool                  `json:"visible,omitempty"`
	Locked           bool                   `json:"locked,omitempty"`
	Metadata         map[string]any         `json:"metadata,omitempty"` // Forward-compatible extension metadata
}

func (grp Group) IsVisible() bool {
	if grp.Visible == nil {
		return true
	}
	return *grp.Visible
}

func (grp Group) IsLocked() bool {
	return grp.Locked
}

// nextGroupID generates the next sequential group ID.
func (s *Scene) nextGroupID() StringID {
	for {
		s.groupsCounter++
		candidate := StringID("group-" + strconv.FormatInt(s.groupsCounter, 10))
		if _, exists := s.groups[candidate]; !exists {
			return candidate
		}
	}
}

// FindGroupByMember returns the innermost deterministic group containing the specified object instance, if any.
// When nested component wrapper groups exist, leaf child groups take precedence over parent wrappers.
func (s *Scene) FindGroupByMember(selType SelectionType, id StringID) (Group, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	parentIDs := make(map[StringID]bool)
	for _, g := range s.groups {
		if g.ParentGroupID != "" {
			parentIDs[g.ParentGroupID] = true
		}
	}

	var fallback Group
	hasFallback := false
	for _, gid := range s.groupIDs {
		g, ok := s.groups[gid]
		if !ok {
			continue
		}
		for _, m := range g.Members {
			if m.Type == selType && m.ID == id {
				if !parentIDs[g.ID] {
					return g, true
				}
				if !hasFallback {
					fallback = g
					hasFallback = true
				}
			}
		}
	}
	if hasFallback {
		return fallback, true
	}
	return Group{}, false
}

// findGroupByMemberLocked is an internal helper without mutex locking.
func (s *Scene) findGroupByMemberLocked(selType SelectionType, id StringID) (Group, bool) {
	for _, g := range s.groups {
		for _, m := range g.Members {
			if m.Type == selType && m.ID == id {
				return g, true
			}
		}
	}
	return Group{}, false
}

// GetGroup retrieves a group by ID.
func (s *Scene) GetGroup(groupID StringID) (Group, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	g, exists := s.groups[groupID]
	return g, exists
}

// GetAllGroups returns all groups in deterministic order.
func (s *Scene) GetAllGroups() []Group {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]Group, 0, len(s.groupIDs))
	for _, id := range s.groupIDs {
		if g, exists := s.groups[id]; exists {
			out = append(out, g)
		}
	}
	return out
}

// GroupsCounter returns the current group ID counter.
func (s *Scene) GroupsCounter() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.groupsCounter
}

// CreateGroup forms a new persistent group from 2 or more eligible scene objects.
func (s *Scene) CreateGroup(name string, members []GroupMember) (Group, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(members) < 2 {
		return Group{}, errors.New("at least 2 objects required to form a group")
	}

	validatedMembers := make([]GroupMember, 0, len(members))
	seen := make(map[string]bool)

	for _, m := range members {
		key := string(m.Type) + ":" + string(m.ID)
		if seen[key] {
			continue // deduplicate
		}
		seen[key] = true

		if m.Type == SelectionGroup {
			return Group{}, errors.New("nested groups are not supported")
		}

		// 1. Verify object exists
		if !s.objectExistsLocked(m.Type, m.ID) {
			return Group{}, fmt.Errorf("cannot group: %s %s does not exist", m.Type, m.ID)
		}

		// 2. Verify object is not already in another group
		if existingGrp, found := s.findGroupByMemberLocked(m.Type, m.ID); found {
			return Group{}, fmt.Errorf("cannot group: %s %s already belongs to group %q (%s)", m.Type, m.ID, existingGrp.Name, existingGrp.ID)
		}

		validatedMembers = append(validatedMembers, m)
	}

	if len(validatedMembers) < 2 {
		return Group{}, errors.New("at least 2 unique objects required to form a group")
	}

	newID := s.nextGroupID()
	displayName := name
	if displayName == "" {
		displayName = "Group " + strconv.FormatInt(s.groupsCounter, 10)
	}

	grp := Group{
		ID:      newID,
		Name:    displayName,
		Members: validatedMembers,
	}

	s.groups[newID] = grp
	s.groupIDs = append(s.groupIDs, newID)
	s.ensureLayersInitializedLocked()
	s.coalesceGroupMembersInLayersLocked(grp)
	s.revision++

	return grp, nil
}

// Ungroup disbands a persistent group while keeping all member objects intact in the scene.
func (s *Scene) Ungroup(groupID StringID) ([]GroupMember, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	grp, exists := s.groups[groupID]
	if !exists {
		return nil, fmt.Errorf("group not found: %s", groupID)
	}

	if grp.IsLocked() {
		return nil, fmt.Errorf("cannot ungroup locked group: %s", groupID)
	}

	delete(s.groups, groupID)
	newIDs := make([]StringID, 0, len(s.groupIDs))
	for _, id := range s.groupIDs {
		if id != groupID {
			newIDs = append(newIDs, id)
		}
	}
	s.groupIDs = newIDs
	s.pruneSelectionLocked(SelectionGroup, groupID)
	s.pruneParametersForTargetLocked(string(groupID))
	s.pruneParametersForTargetLocked("group-" + string(groupID))
	s.revision++

	return grp.Members, nil
}

// RemoveGroupMembers detaches one or more member objects from a persistent group without deleting them.
// If the group has fewer than 2 members remaining after removal, the group is disbanded.
// All objects remain intact in the scene.
func (s *Scene) RemoveGroupMembers(groupID StringID, membersToRemove []GroupMember) (remainingGroup Group, dissolved bool, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	grp, exists := s.groups[groupID]
	if !exists {
		return Group{}, false, fmt.Errorf("group not found: %s", groupID)
	}

	if grp.IsLocked() {
		return Group{}, false, fmt.Errorf("cannot remove members from locked group: %s", groupID)
	}

	if len(membersToRemove) == 0 {
		return grp, false, errors.New("no members specified to remove")
	}

	// 1. Validation pass: verify all requested members belong to this group
	toRemoveMap := make(map[string]bool, len(membersToRemove))
	for _, m := range membersToRemove {
		key := string(m.Type) + ":" + string(m.ID)
		if toRemoveMap[key] {
			continue
		}
		found := false
		for _, gm := range grp.Members {
			if gm.Type == m.Type && gm.ID == m.ID {
				found = true
				break
			}
		}
		if !found {
			return Group{}, false, fmt.Errorf("object %s %s does not belong to group %s", m.Type, m.ID, groupID)
		}
		toRemoveMap[key] = true
	}

	// 2. Filter out the members to remove
	filtered := make([]GroupMember, 0, len(grp.Members))
	for _, gm := range grp.Members {
		key := string(gm.Type) + ":" + string(gm.ID)
		if !toRemoveMap[key] {
			filtered = append(filtered, gm)
		}
	}

	// 3. Apply group dissolution policy (< 2 members remaining)
	if len(filtered) < 2 {
		delete(s.groups, groupID)
		newIDs := make([]StringID, 0, len(s.groupIDs))
		for _, id := range s.groupIDs {
			if id != groupID {
				newIDs = append(newIDs, id)
			}
		}
		s.groupIDs = newIDs
		s.pruneSelectionLocked(SelectionGroup, groupID)
		s.pruneParametersForTargetLocked(string(groupID))
		s.pruneParametersForTargetLocked("group-" + string(groupID))
		s.revision++
		return Group{}, true, nil
	}

	// 4. Update group with remaining members and prune any mappings bound to removed members
	grp.Members = filtered
	grp.Mappings = pruneGroupMappingsForMembers(grp.Mappings, toRemoveMap)
	s.groups[groupID] = grp
	s.syncGroupMappingsToWidgetParamsLocked(groupID)
	s.revision++

	return grp, false, nil
}

// RenameGroup updates the display name of a group.
func (s *Scene) RenameGroup(groupID StringID, newName string) (Group, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	grp, exists := s.groups[groupID]
	if !exists {
		return Group{}, fmt.Errorf("group not found: %s", groupID)
	}

	if grp.IsLocked() {
		return Group{}, fmt.Errorf("cannot rename locked group: %s", groupID)
	}

	oldName := grp.Name
	displayName := newName
	if displayName == "" {
		displayName = "Group " + string(groupID)
	}
	grp.Name = displayName
	s.groups[groupID] = grp

	targetID := string(groupID)
	prefixedID := targetID
	if !strings.HasPrefix(prefixedID, "group-") {
		prefixedID = "group-" + prefixedID
	}
	for i := range s.parameters {
		p := &s.parameters[i]
		if (p.Target == targetID || p.Target == prefixedID || (oldName != "" && p.Target == oldName)) && len(p.Targets) == 0 {
			p.Name = GenerateParameterName(displayName, p.Property, "group")
		}
	}
	s.syncGroupMappingsToWidgetParamsLocked(groupID)

	s.revision++

	return grp, nil
}

// DeleteGroup removes a group, optionally deleting all its member objects from the scene.
func (s *Scene) DeleteGroup(groupID StringID, deleteMembers bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	grp, exists := s.groups[groupID]
	if !exists {
		return fmt.Errorf("group not found: %s", groupID)
	}

	if grp.IsLocked() {
		return fmt.Errorf("cannot delete locked group: %s", groupID)
	}

	if deleteMembers {
		for _, m := range grp.Members {
			if s.getEffectiveLockedLocked(m.Type, m.ID) {
				return fmt.Errorf("cannot delete group with locked member %s %s", m.Type, m.ID)
			}
		}

		for _, m := range grp.Members {
			switch m.Type {
			case SelectionNode:
				s.removeNodeLocked(m.ID)
			case SelectionFlow:
				s.removeFlowLocked(m.ID)
			case SelectionGlow:
				s.removeGlowLocked(m.ID)
			case SelectionRipple:
				s.removeRippleLocked(m.ID)
			case SelectionLite:
				s.removeLiteEffectLocked(m.ID)
			case SelectionImage:
				s.removeImageLocked(m.ID)
			}
		}
	}

	delete(s.groups, groupID)
	newIDs := make([]StringID, 0, len(s.groupIDs))
	for _, id := range s.groupIDs {
		if id != groupID {
			newIDs = append(newIDs, id)
		}
	}
	s.groupIDs = newIDs
	s.pruneSelectionLocked(SelectionGroup, groupID)
	s.pruneParametersForTargetLocked(string(groupID))
	s.pruneParametersForTargetLocked("group-" + string(groupID))
	s.revision++

	return nil
}

// pruneGroupMembersLocked removes deleted object references from all groups.
// If a group is left with 0 or 1 members, it is automatically disbanded.
func (s *Scene) pruneGroupMembersLocked(deletedType SelectionType, deletedID StringID) {
	emptyOrSingle := make([]StringID, 0)

	for gID, g := range s.groups {
		filtered := make([]GroupMember, 0, len(g.Members))
		changed := false
		for _, m := range g.Members {
			if m.Type == deletedType && m.ID == deletedID {
				changed = true
				continue
			}
			filtered = append(filtered, m)
		}
		if changed {
			g.Members = filtered
			g.Mappings = pruneGroupMappingsForMembers(g.Mappings, map[string]bool{
				string(deletedType) + ":" + string(deletedID): true,
			})
			s.groups[gID] = g
			if len(filtered) < 2 {
				emptyOrSingle = append(emptyOrSingle, gID)
			} else {
				s.syncGroupMappingsToWidgetParamsLocked(gID)
			}
		}
	}

	for _, gID := range emptyOrSingle {
		delete(s.groups, gID)
		newIDs := make([]StringID, 0, len(s.groupIDs))
		for _, id := range s.groupIDs {
			if id != gID {
				newIDs = append(newIDs, id)
			}
		}
		s.groupIDs = newIDs
		s.pruneSelectionLocked(SelectionGroup, gID)
		s.pruneParametersForTargetLocked(string(gID))
		s.pruneParametersForTargetLocked("group-" + string(gID))
	}
}

// MoveGroup translates all member nodes, glows, ripples, and standalone flows of a group by (deltaX, deltaY).
// Internal flows between member nodes maintain their attachments and relative geometry without duplicate translation.
func (s *Scene) MoveGroup(groupID StringID, deltaX float64, deltaY float64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	grp, exists := s.groups[groupID]
	if !exists {
		return fmt.Errorf("group not found: %s", groupID)
	}

	if grp.IsLocked() {
		return fmt.Errorf("cannot move locked group: %s", groupID)
	}

	for _, m := range grp.Members {
		if s.getEffectiveLockedLocked(m.Type, m.ID) {
			return fmt.Errorf("cannot move group with locked member %s %s", m.Type, m.ID)
		}
	}

	// 1. Move member nodes
	nodeIDsInGroup := make(map[StringID]bool)
	for _, m := range grp.Members {
		if m.Type == SelectionNode {
			nodeIDsInGroup[m.ID] = true
			if n, exists := s.nodes[m.ID]; exists {
				n.X += deltaX
				n.Y += deltaY
				n.X = math.Max(-50.0, math.Min(150.0, n.X))
				n.Y = math.Max(-50.0, math.Min(150.0, n.Y))
				n.X = math.Round(n.X*1000.0) / 1000.0
				n.Y = math.Round(n.Y*1000.0) / 1000.0
				s.nodes[m.ID] = n
			}
		}
	}

	// 2. Recompute flow attachments and translate standalone or member flow waypoints
	for _, m := range grp.Members {
		if m.Type == SelectionFlow {
			if f, exists := s.flows[m.ID]; exists {
				fromIn := f.FromNodeID != "" && nodeIDsInGroup[f.FromNodeID]
				toIn := f.ToNodeID != "" && nodeIDsInGroup[f.ToNodeID]

				if fromIn && toIn {
					// Both nodes moved together. Translate internal waypoints (if any)
					for i := range f.Nodes {
						f.Nodes[i].X += deltaX
						f.Nodes[i].Y += deltaY
					}
					s.flows[m.ID] = f
				} else if f.FromNodeID == "" && f.ToNodeID == "" {
					// Standalone flow: translate all points
					for i := range f.Nodes {
						f.Nodes[i].X += deltaX
						f.Nodes[i].Y += deltaY
					}
					s.flows[m.ID] = f
				}
			}
		}
	}

	// Recompute all connected flows attached to moved nodes
	for nID := range nodeIDsInGroup {
		s.recalculateNodeConnectionsLocked(nID)
	}

	// 3. Move member Glows
	for _, m := range grp.Members {
		if m.Type == SelectionGlow {
			if g, exists := s.glows[m.ID]; exists {
				g.X += deltaX
				g.Y += deltaY
				g.X = math.Max(-50.0, math.Min(150.0, g.X))
				g.Y = math.Max(-50.0, math.Min(150.0, g.Y))
				g.X = math.Round(g.X*1000.0) / 1000.0
				g.Y = math.Round(g.Y*1000.0) / 1000.0
				s.glows[m.ID] = g
			}
		}
	}

	// 4. Move member Ripples
	for _, m := range grp.Members {
		if m.Type == SelectionRipple {
			if r, exists := s.ripples[m.ID]; exists {
				r.X += deltaX
				r.Y += deltaY
				r.X = math.Max(-50.0, math.Min(150.0, r.X))
				r.Y = math.Max(-50.0, math.Min(150.0, r.Y))
				r.X = math.Round(r.X*1000.0) / 1000.0
				r.Y = math.Round(r.Y*1000.0) / 1000.0
				s.ripples[m.ID] = r
			}
		}
	}

	// 5. Move member Images
	for _, m := range grp.Members {
		if m.Type == SelectionImage {
			if img, exists := s.images[m.ID]; exists {
				img.X += deltaX
				img.Y += deltaY
				img.X = math.Max(-50.0, math.Min(150.0, img.X))
				img.Y = math.Max(-50.0, math.Min(150.0, img.Y))
				img.X = math.Round(img.X*1000.0) / 1000.0
				img.Y = math.Round(img.Y*1000.0) / 1000.0
				s.images[m.ID] = img
			}
		}
	}

	// 6. Move member LiteEffects (coordinates stored in canvas pixels)
	cw := float64(s.canvas.Width)
	if cw <= 0 {
		cw = 1280.0
	}
	ch := float64(s.canvas.Height)
	if ch <= 0 {
		ch = 720.0
	}
	deltaXPx := (deltaX / 100.0) * cw
	deltaYPx := (deltaY / 100.0) * ch
	for _, m := range grp.Members {
		if m.Type == SelectionLite {
			if le, exists := s.liteEffects[m.ID]; exists {
				if le.Kind == "flow-lite" && len(le.Points) > 0 {
					for i := range le.Points {
						le.Points[i].X = math.Round((le.Points[i].X+deltaX)*1000.0) / 1000.0
						le.Points[i].Y = math.Round((le.Points[i].Y+deltaY)*1000.0) / 1000.0
					}
				} else {
					le.X = math.Round((le.X+deltaXPx)*100.0) / 100.0
					le.Y = math.Round((le.Y+deltaYPx)*100.0) / 100.0
				}
				s.liteEffects[m.ID] = le
			}
		}
	}

	s.revision++
	return nil
}

// ComputeGroupBounds computes collective bounding box of a group in percentage coordinates [0..100].
func (s *Scene) ComputeGroupBounds(groupID StringID, canvasW, canvasH float64) (minX, minY, maxX, maxY float64, err error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	grp, exists := s.groups[groupID]
	if !exists {
		return 0, 0, 0, 0, fmt.Errorf("group not found: %s", groupID)
	}

	if canvasW <= 0 {
		canvasW = 1280.0
	}
	if canvasH <= 0 {
		canvasH = 720.0
	}

	minX, minY = 1000.0, 1000.0
	maxX, maxY = -1000.0, -1000.0
	count := 0

	for _, m := range grp.Members {
		switch m.Type {
		case SelectionNode:
			if n, exists := s.nodes[m.ID]; exists {
				eff := s.GetNodeEffectiveProps(n)
				hwPct := (eff.Width / 2.0 / canvasW) * 100.0
				hhPct := (eff.Height / 2.0 / canvasH) * 100.0
				minX = math.Min(minX, n.X-hwPct)
				maxX = math.Max(maxX, n.X+hwPct)
				minY = math.Min(minY, n.Y-hhPct)
				maxY = math.Max(maxY, n.Y+hhPct)
				count++
			}
		case SelectionGlow:
			if g, exists := s.glows[m.ID]; exists {
				hw := math.Max(16.0, g.Size)
				hh := hw
				if g.Shape == "custom" && g.CustomW > 0 && g.CustomH > 0 {
					scale := g.Scale
					if scale <= 0 {
						scale = 1.0
					}
					hw = (g.CustomW * scale) / 2.0
					hh = (g.CustomH * scale) / 2.0
				}
				hwPct := (hw / canvasW) * 100.0
				hhPct := (hh / canvasH) * 100.0
				minX = math.Min(minX, g.X-hwPct)
				maxX = math.Max(maxX, g.X+hwPct)
				minY = math.Min(minY, g.Y-hhPct)
				maxY = math.Max(maxY, g.Y+hhPct)
				count++
			}
		case SelectionRipple:
			if r, exists := s.ripples[m.ID]; exists {
				hitR := math.Max(20.0, r.OuterR)
				rxPct := (hitR / canvasW) * 100.0
				ryPct := (hitR / canvasH) * 100.0
				minX = math.Min(minX, r.X-rxPct)
				maxX = math.Max(maxX, r.X+rxPct)
				minY = math.Min(minY, r.Y-ryPct)
				maxY = math.Max(maxY, r.Y+ryPct)
				count++
			}
		case SelectionFlow:
			if f, exists := s.flows[m.ID]; exists && len(f.Nodes) > 0 {
				for _, p := range f.Nodes {
					minX = math.Min(minX, p.X)
					maxX = math.Max(maxX, p.X)
					minY = math.Min(minY, p.Y)
					maxY = math.Max(maxY, p.Y)
					count++
				}
			}
		case SelectionImage:
			if img, exists := s.images[m.ID]; exists {
				hwPct := (img.Width / 2.0 / canvasW) * 100.0
				hhPct := (img.Height / 2.0 / canvasH) * 100.0
				minX = math.Min(minX, img.X-hwPct)
				maxX = math.Max(maxX, img.X+hwPct)
				minY = math.Min(minY, img.Y-hhPct)
				maxY = math.Max(maxY, img.Y+hhPct)
				count++
			}
		case SelectionLite:
			if le, exists := s.liteEffects[m.ID]; exists {
				MigrateLegacyLiteEffect(&le)
				if le.Kind == "flow-lite" && len(le.Points) >= 2 {
					bounds, _ := geometry.ComputeFlowLiteBounds(le.Points, le.Bends, le.Curvature, canvasW, canvasH)
					minX = math.Min(minX, (bounds.MinX/canvasW)*100.0)
					maxX = math.Max(maxX, (bounds.MaxX/canvasW)*100.0)
					minY = math.Min(minY, (bounds.MinY/canvasH)*100.0)
					maxY = math.Max(maxY, (bounds.MaxY/canvasH)*100.0)
					count++
				} else {
					w := le.Width
					if w <= 0 {
						w = 56
					}
					h := le.Height
					if h <= 0 {
						h = 56
					}
					cxPct := (le.X / canvasW) * 100.0
					cyPct := (le.Y / canvasH) * 100.0
					hwPct := (w / 2.0 / canvasW) * 100.0
					hhPct := (h / 2.0 / canvasH) * 100.0
					minX = math.Min(minX, cxPct-hwPct)
					maxX = math.Max(maxX, cxPct+hwPct)
					minY = math.Min(minY, cyPct-hhPct)
					maxY = math.Max(maxY, cyPct+hhPct)
					count++
				}
			}
		}
	}

	if count == 0 {
		return 0, 0, 0, 0, errors.New("group has no geometric members")
	}

	return minX, minY, maxX, maxY, nil
}

var reGroupAlias = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_-]{0,47}$`)
var reHexOrCSSColor = regexp.MustCompile(`^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]{3,24})$`)

var reservedGroupPropertyAliases = map[string]bool{
	"opacity":        true,
	"visibility":     true,
	"speed":          true,
	"playbackrate":   true,
	"state":          true,
	"operatingstate": true,
}

func isLiteEffectPropertySupportedByKind(kind, prop string) bool {
	if kind == "" {
		return true
	}
	switch prop {
	case "text", "borderColor", "scrollSpeed", "typeSpeed":
		return kind == "text-lite"
	case "lineGapRatio", "burstCycles", "pauseSeconds", "pauseVisibility":
		return kind == "perimeter-tracer"
	case "segments":
		return kind == "perimeter-tracer" || kind == "gauge-lite" || kind == "oscilloscope-lite"
	case "strokeWidth", "showGuide":
		return kind == "perimeter-tracer" || kind == "flow-lite" || kind == "radar-lite" || kind == "gauge-lite" || kind == "oscilloscope-lite" || kind == "text-lite"
	case "startOffset":
		return kind == "perimeter-tracer" || kind == "oscilloscope-lite" || kind == "text-lite"
	case "value", "minValue", "maxValue":
		return kind == "gauge-lite"
	case "bgColor":
		return kind == "gauge-lite" || kind == "oscilloscope-lite" || kind == "text-lite"
	case "direction":
		return kind == "perimeter-tracer" || kind == "flow-lite" || kind == "gauge-lite" || kind == "oscilloscope-lite" || kind == "text-lite"
	case "playbackMode":
		return kind == "perimeter-tracer" || kind == "flow-lite" || kind == "text-lite"
	case "dashLength", "gapLength", "dotSize":
		return kind == "flow-lite"
	case "scale":
		return kind == "pulse" || kind == "radar-lite"
	case "period":
		return kind == "pulse" || kind == "radar-lite" || kind == "flow-lite" || kind == "perimeter-tracer" || kind == "oscilloscope-lite"
	case "trigger", "duration", "repeat", "repeatInterval":
		return kind == "flash"
	case "intensity":
		return kind == "pulse" || kind == "flash" || kind == "oscilloscope-lite"
	case "samples":
		return kind == "oscilloscope-lite"
	case "armThickness":
		return kind == "pulse" || kind == "flash"
	case "speed":
		return kind == "perimeter-tracer" || kind == "pulse" || kind == "flow-lite" || kind == "radar-lite" || kind == "oscilloscope-lite" || kind == "text-lite"
	default:
		return true
	}
}

func canonicalMemberTargetID(mType SelectionType, mID StringID) string {
	raw := string(mID)
	prefix := PrefixForType(mType)
	if strings.HasPrefix(raw, prefix) {
		return raw
	}
	return prefix + raw
}

func pruneGroupMappingsForMembers(mappings []GroupPropertyMapping, removedKeys map[string]bool) []GroupPropertyMapping {
	if len(mappings) == 0 || len(removedKeys) == 0 {
		return mappings
	}
	var keptMappings []GroupPropertyMapping
	for _, m := range mappings {
		var keptTargets []GroupTargetBinding
		for _, t := range m.Targets {
			key := string(t.MemberType) + ":" + string(t.MemberID)
			if !removedKeys[key] {
				keptTargets = append(keptTargets, t)
			}
		}
		if len(keptTargets) > 0 {
			mCopy := DeepCopyGroupPropertyMapping(m)
			mCopy.Targets = keptTargets
			keptMappings = append(keptMappings, mCopy)
		}
	}
	return keptMappings
}

func (s *Scene) validateGroupPropertyMappingLocked(grp Group, mapping GroupPropertyMapping) (GroupPropertyMapping, error) {
	alias := strings.TrimSpace(mapping.Alias)
	if alias == "" {
		return GroupPropertyMapping{}, errors.New("group property mapping alias cannot be empty")
	}
	if !reGroupAlias.MatchString(alias) {
		return GroupPropertyMapping{}, fmt.Errorf("invalid mapping alias %q: must start with a letter and contain only letters, digits, underscores, or hyphens (max 48 chars)", alias)
	}
	lowerAlias := strings.ToLower(alias)
	if reservedGroupPropertyAliases[lowerAlias] {
		return GroupPropertyMapping{}, fmt.Errorf("mapping alias %q is reserved for built-in group properties", alias)
	}

	mType := strings.TrimSpace(strings.ToLower(mapping.Type))
	switch mType {
	case "color", "number", "boolean", "text", "enum", "speed":
		// valid
	default:
		return GroupPropertyMapping{}, fmt.Errorf("unsupported mapping type %q: must be color, number, boolean, text, enum, or speed", mapping.Type)
	}

	if mType != "number" && mType != "speed" {
		if mapping.Min != nil || mapping.Max != nil {
			return GroupPropertyMapping{}, fmt.Errorf("mapping %q of type %q cannot define numeric min or max limits", alias, mType)
		}
	}
	if mapping.Min != nil && mapping.Max != nil && *mapping.Min > *mapping.Max {
		return GroupPropertyMapping{}, fmt.Errorf("mapping %q min (%v) cannot be greater than max (%v)", alias, *mapping.Min, *mapping.Max)
	}
	if mType == "enum" {
		if len(mapping.Options) == 0 {
			return GroupPropertyMapping{}, fmt.Errorf("enum mapping %q must specify at least one option", alias)
		}
		for _, opt := range mapping.Options {
			if strings.TrimSpace(opt) == "" {
				return GroupPropertyMapping{}, fmt.Errorf("enum mapping %q options cannot contain empty strings", alias)
			}
		}
	}
	if (mType == "number" || mType == "speed") && mapping.Default != nil {
		defNum := toFloat64(mapping.Default, math.NaN())
		if math.IsNaN(defNum) {
			return GroupPropertyMapping{}, fmt.Errorf("mapping %q default (%v) must be a finite number", alias, mapping.Default)
		}
		if mapping.Min != nil && defNum < *mapping.Min {
			return GroupPropertyMapping{}, fmt.Errorf("mapping %q default (%v) cannot be less than min (%v)", alias, defNum, *mapping.Min)
		}
		if mapping.Max != nil && defNum > *mapping.Max {
			return GroupPropertyMapping{}, fmt.Errorf("mapping %q default (%v) cannot be greater than max (%v)", alias, defNum, *mapping.Max)
		}
	}
	if mType == "color" && mapping.Default != nil {
		colStr := strings.TrimSpace(fmt.Sprintf("%v", mapping.Default))
		if colStr == "" || !reHexOrCSSColor.MatchString(colStr) {
			return GroupPropertyMapping{}, fmt.Errorf("mapping %q default (%q) is not a valid colour", alias, colStr)
		}
	}
	if mType == "enum" && mapping.Default != nil {
		defStr := strings.TrimSpace(fmt.Sprintf("%v", mapping.Default))
		foundOpt := false
		for _, opt := range mapping.Options {
			if strings.TrimSpace(opt) == defStr {
				foundOpt = true
				break
			}
		}
		if !foundOpt {
			return GroupPropertyMapping{}, fmt.Errorf("enum mapping %q default (%q) must be one of its declared options (%v)", alias, defStr, mapping.Options)
		}
	}

	if len(mapping.Targets) == 0 {
		return GroupPropertyMapping{}, fmt.Errorf("mapping %q must bind to at least one member target property", alias)
	}

	memberSet := make(map[string]GroupMember, len(grp.Members))
	for _, gm := range grp.Members {
		memberSet[string(gm.Type)+":"+string(gm.ID)] = gm
		memberSet[canonicalMemberTargetID(gm.Type, gm.ID)] = gm
	}

	normalizedTargets := make([]GroupTargetBinding, 0, len(mapping.Targets))
	seenBinding := make(map[string]bool)

	var hasSharedMin, hasSharedMax, hasSharedStep bool
	var sharedMin, sharedMax, sharedStep float64
	var hasSharedEnum bool
	var sharedEnumSet map[string]bool

	for _, t := range mapping.Targets {
		var gm GroupMember
		var foundMember bool
		if t.MemberType != "" && t.MemberID != "" {
			gm, foundMember = memberSet[string(t.MemberType)+":"+string(t.MemberID)]
			if !foundMember {
				// Try stripping prefix from MemberID
				cleanID := strings.TrimPrefix(string(t.MemberID), PrefixForType(t.MemberType))
				gm, foundMember = memberSet[string(t.MemberType)+":"+cleanID]
				if !foundMember && t.MemberType == SelectionImage {
					gm, foundMember = memberSet[string(t.MemberType)+":image-"+cleanID]
				}
			}
		}
		if !foundMember && t.Target != "" {
			gm, foundMember = memberSet[strings.TrimSpace(t.Target)]
		}
		if !foundMember {
			targetDesc := t.Target
			if targetDesc == "" {
				targetDesc = string(t.MemberType) + "-" + string(t.MemberID)
			}
			return GroupPropertyMapping{}, fmt.Errorf("target %q does not belong to group %q (%s)", targetDesc, grp.Name, grp.ID)
		}
		if !s.objectExistsLocked(gm.Type, gm.ID) {
			return GroupPropertyMapping{}, fmt.Errorf("member object %s %s does not exist in scene", gm.Type, gm.ID)
		}

		prop := strings.TrimSpace(t.Property)
		if prop == "" {
			return GroupPropertyMapping{}, fmt.Errorf("target property cannot be empty for member %s %s", gm.Type, gm.ID)
		}

		eligible, err := s.ResolveMemberEligiblePropertyLocked(gm.Type, gm.ID, prop)
		if err != nil {
			return GroupPropertyMapping{}, err
		}

		// Type compatibility check: exact match, numeric/speed equivalence, OR numeric/speed group mapping driving a text property
		isNumOrSpeedMapping := (mType == "number" || mType == "speed")
		isNumOrSpeedTarget := (eligible.Type == "number" || eligible.Type == "speed")
		compatible := (mType == eligible.Type) ||
			(isNumOrSpeedMapping && isNumOrSpeedTarget) ||
			(isNumOrSpeedMapping && eligible.Type == "text")
		if !compatible {
			return GroupPropertyMapping{}, fmt.Errorf("mapping %q of type %q is incompatible with property %q (type %q) on member %s %s", alias, mType, prop, eligible.Type, gm.Type, gm.ID)
		}

		// Constraint compatibility & shared-domain intersection across all bindings
		if isNumOrSpeedMapping && isNumOrSpeedTarget {
			if eligible.Min != nil {
				if !hasSharedMin || *eligible.Min > sharedMin {
					sharedMin = *eligible.Min
					hasSharedMin = true
				}
				if mapping.Min != nil && *mapping.Min < *eligible.Min {
					return GroupPropertyMapping{}, fmt.Errorf("mapping %q min (%v) is below minimum allowed (%v) for property %q on member %s %s", alias, *mapping.Min, *eligible.Min, prop, gm.Type, gm.ID)
				}
				if mapping.Default != nil {
					defNum := toFloat64(mapping.Default, math.NaN())
					if !math.IsNaN(defNum) && defNum < *eligible.Min {
						return GroupPropertyMapping{}, fmt.Errorf("mapping %q default (%v) is below minimum allowed (%v) for property %q on member %s %s", alias, defNum, *eligible.Min, prop, gm.Type, gm.ID)
					}
				}
			}
			if eligible.Max != nil {
				if !hasSharedMax || *eligible.Max < sharedMax {
					sharedMax = *eligible.Max
					hasSharedMax = true
				}
				if mapping.Max != nil && *mapping.Max > *eligible.Max {
					return GroupPropertyMapping{}, fmt.Errorf("mapping %q max (%v) exceeds maximum allowed (%v) for property %q on member %s %s", alias, *mapping.Max, *eligible.Max, prop, gm.Type, gm.ID)
				}
				if mapping.Default != nil {
					defNum := toFloat64(mapping.Default, math.NaN())
					if !math.IsNaN(defNum) && defNum > *eligible.Max {
						return GroupPropertyMapping{}, fmt.Errorf("mapping %q default (%v) exceeds maximum allowed (%v) for property %q on member %s %s", alias, defNum, *eligible.Max, prop, gm.Type, gm.ID)
					}
				}
			}
			if eligible.Step != nil && *eligible.Step > 0 {
				if !hasSharedStep || *eligible.Step > sharedStep {
					sharedStep = *eligible.Step
					hasSharedStep = true
				}
			}
			if hasSharedMin && hasSharedMax && sharedMin > sharedMax {
				return GroupPropertyMapping{}, fmt.Errorf("mapping %q binds targets with incompatible non-overlapping numeric domains (shared min %v > shared max %v)", alias, sharedMin, sharedMax)
			}
		}
		if mType == "enum" && len(eligible.Options) > 0 {
			allowedOpts := make(map[string]bool, len(eligible.Options))
			for _, o := range eligible.Options {
				allowedOpts[o] = true
			}
			if !hasSharedEnum {
				hasSharedEnum = true
				sharedEnumSet = make(map[string]bool, len(allowedOpts))
				for k, v := range allowedOpts {
					sharedEnumSet[k] = v
				}
			} else {
				for k := range sharedEnumSet {
					if !allowedOpts[k] {
						delete(sharedEnumSet, k)
					}
				}
			}
			if len(sharedEnumSet) == 0 {
				return GroupPropertyMapping{}, fmt.Errorf("enum mapping %q binds targets with incompatible options (no shared permitted options across bound targets)", alias)
			}
			for _, o := range mapping.Options {
				if !allowedOpts[strings.TrimSpace(o)] {
					return GroupPropertyMapping{}, fmt.Errorf("enum mapping %q option %q is not supported by property %q on member %s %s (allowed: %v)", alias, o, prop, gm.Type, gm.ID, eligible.Options)
				}
			}
		}

		canonTarget := canonicalMemberTargetID(gm.Type, gm.ID)
		bKey := canonTarget + "::" + prop
		if seenBinding[bKey] {
			return GroupPropertyMapping{}, fmt.Errorf("mapping %q contains duplicate target binding %s.%s", alias, canonTarget, prop)
		}
		seenBinding[bKey] = true

		normalizedTargets = append(normalizedTargets, GroupTargetBinding{
			MemberType: gm.Type,
			MemberID:   gm.ID,
			Target:     canonTarget,
			Property:   prop,
		})
	}

	if len(normalizedTargets) == 0 {
		return GroupPropertyMapping{}, fmt.Errorf("mapping %q has no valid member targets", alias)
	}

	label := strings.TrimSpace(mapping.Label)
	if label == "" {
		label = alias
	}

	out := DeepCopyGroupPropertyMapping(mapping)
	out.Alias = alias
	out.Label = label
	out.Type = mType
	out.Targets = normalizedTargets
	out.Unit = strings.TrimSpace(mapping.Unit)
	if out.Unit == "" && (mType == "number" || mType == "speed") {
		for _, tb := range normalizedTargets {
			if tb.MemberType == SelectionLite {
				if le, ok := s.liteEffects[tb.MemberID]; ok && le.Kind == "gauge-lite" {
					if strings.TrimSpace(le.Unit) != "" {
						out.Unit = strings.TrimSpace(le.Unit)
					} else {
						out.Unit = "%"
					}
					break
				}
			}
		}
	}
	if mType == "number" || mType == "speed" {
		if out.Min == nil && hasSharedMin {
			out.Min = floatPtr(sharedMin)
		}
		if out.Max == nil && hasSharedMax {
			out.Max = floatPtr(sharedMax)
		}
		if out.Step == nil && hasSharedStep {
			out.Step = floatPtr(sharedStep)
		}
	}
	if out.Default == nil {
		// Provide sensible default if omitted
		switch mType {
		case "number":
			out.Default = 0.0
		case "speed":
			out.Default = 1.0
		case "boolean":
			out.Default = true
		case "color":
			out.Default = "#38bdf8"
		case "text":
			out.Default = ""
		case "enum":
			if len(out.Options) > 0 {
				out.Default = out.Options[0]
			}
		}
	}
	return out, nil
}

// syncGroupMappingsToWidgetParamsLocked synchronizes a group's semantic property mappings with the scene's WidgetParameters.
func (s *Scene) syncGroupMappingsToWidgetParamsLocked(groupID StringID) {
	grp, exists := s.groups[groupID]
	targetID := string(groupID)
	prefixedID := targetID
	if !strings.HasPrefix(prefixedID, "group-") {
		prefixedID = "group-" + prefixedID
	}

	builtInProps := map[string]bool{
		"opacity":    true,
		"visibility": true,
		"speed":      true,
		"play":       true,
	}

	customAliases := make(map[string]bool)
	if exists {
		for _, m := range grp.Mappings {
			customAliases[strings.ToLower(strings.TrimSpace(m.Alias))] = true
		}
	}

	// Keep all non-group parameters and built-in group parameters (unless overridden by a custom mapping with the same alias)
	kept := make([]WidgetParameter, 0, len(s.parameters))
	for _, p := range s.parameters {
		if p.Target == targetID || p.Target == prefixedID {
			if builtInProps[p.Property] && len(p.Targets) == 0 && !customAliases[strings.ToLower(p.Property)] {
				kept = append(kept, p)
			}
			continue
		}
		kept = append(kept, p)
	}

	if !exists || len(grp.Mappings) == 0 {
		s.parameters = kept
		return
	}

	grpName := grp.Name
	if grpName == "" {
		grpName = string(grp.ID)
	}

	for _, m := range grp.Mappings {
		wTargets := make([]WidgetTargetBinding, len(m.Targets))
		for i, t := range m.Targets {
			canon := t.Target
			if canon == "" {
				canon = canonicalMemberTargetID(t.MemberType, t.MemberID)
			}
			wTargets[i] = WidgetTargetBinding{
				Target:   canon,
				Property: t.Property,
			}
		}
		paramName := GenerateParameterName(grpName, m.Alias, "group")
		desc := m.Description
		if desc == "" {
			desc = fmt.Sprintf("%s on group %s (%d mapped target(s))", m.Label, grpName, len(wTargets))
		}
		// Resolve canonical runtime visual property from fan-out targets (e.g. "value", "color", "play")
		// rather than emitting an arbitrary semantic alias like "level" or "cpu" as WidgetParameter.Property.
		canonicalProp := m.Alias
		if len(wTargets) > 0 && strings.TrimSpace(wTargets[0].Property) != "" {
			canonicalProp = strings.TrimSpace(wTargets[0].Property)
		}
		unitVal := strings.TrimSpace(m.Unit)
		if unitVal == "" && (m.Type == "number" || m.Type == "speed") {
			for _, t := range m.Targets {
				if t.MemberType == SelectionLite {
					if le, ok := s.liteEffects[t.MemberID]; ok && le.Kind == "gauge-lite" {
						if strings.TrimSpace(le.Unit) != "" {
							unitVal = strings.TrimSpace(le.Unit)
						} else {
							unitVal = "%"
						}
						break
					}
				}
			}
		}
		wp := WidgetParameter{
			Name:        paramName,
			Type:        m.Type,
			Default:     m.Default,
			Target:      string(grp.ID),
			Property:    canonicalProp,
			Targets:     wTargets,
			Min:         deepCopyFloatPtr(m.Min),
			Max:         deepCopyFloatPtr(m.Max),
			Step:        deepCopyFloatPtr(m.Step),
			Unit:        unitVal,
			Options:     append([]string(nil), m.Options...),
			Description: desc,
		}
		kept = append(kept, wp)
	}

	s.parameters = kept
}

// SetGroupPropertyMapping creates or updates a semantic property mapping on a group and synchronizes its WidgetParameter.
func (s *Scene) SetGroupPropertyMapping(groupID StringID, mapping GroupPropertyMapping) (Group, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	grp, exists := s.groups[groupID]
	if !exists {
		return Group{}, fmt.Errorf("group not found: %s", groupID)
	}
	if grp.IsLocked() {
		return Group{}, fmt.Errorf("cannot modify mappings on locked group: %s", groupID)
	}

	validated, err := s.validateGroupPropertyMappingLocked(grp, mapping)
	if err != nil {
		return Group{}, err
	}

	updated := false
	for i := range grp.Mappings {
		if strings.EqualFold(grp.Mappings[i].Alias, validated.Alias) {
			grp.Mappings[i] = validated
			updated = true
			break
		}
	}
	if !updated {
		grp.Mappings = append(grp.Mappings, validated)
	}

	s.groups[groupID] = grp
	s.syncGroupMappingsToWidgetParamsLocked(groupID)
	s.revision++
	if s.history != nil {
		s.history.Record(s.getSnapshotLocked(), s.selection)
	}

	return DeepCopyGroup(grp), nil
}

// RemoveGroupPropertyMapping removes a semantic property mapping by alias from a group and prunes its WidgetParameter.
func (s *Scene) RemoveGroupPropertyMapping(groupID StringID, alias string) (Group, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	grp, exists := s.groups[groupID]
	if !exists {
		return Group{}, fmt.Errorf("group not found: %s", groupID)
	}
	if grp.IsLocked() {
		return Group{}, fmt.Errorf("cannot modify mappings on locked group: %s", groupID)
	}

	cleanAlias := strings.TrimSpace(alias)
	if cleanAlias == "" {
		return Group{}, errors.New("mapping alias cannot be empty")
	}

	var kept []GroupPropertyMapping
	found := false
	for _, m := range grp.Mappings {
		if strings.EqualFold(m.Alias, cleanAlias) {
			found = true
			continue
		}
		kept = append(kept, m)
	}
	if !found {
		return Group{}, fmt.Errorf("mapping %q not found on group %s", cleanAlias, groupID)
	}

	grp.Mappings = kept
	s.groups[groupID] = grp
	s.syncGroupMappingsToWidgetParamsLocked(groupID)
	s.revision++
	if s.history != nil {
		s.history.Record(s.getSnapshotLocked(), s.selection)
	}

	return DeepCopyGroup(grp), nil
}

