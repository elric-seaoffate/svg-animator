package scene

import (
	"errors"
	"fmt"
	"math"
	"strconv"
)

// GroupMember represents an object instance member in a persistent group.
type GroupMember struct {
	Type SelectionType `json:"type"` // "node", "flow", "glow", "ripple", "image"
	ID   StringID      `json:"id"`
}

// Group represents a persistent named visual object group entity.
type Group struct {
	ID       StringID       `json:"id"`
	Name     string         `json:"name,omitempty"` // User-editable display name
	Members  []GroupMember  `json:"members"`
	Visible  *bool          `json:"visible,omitempty"`
	Locked   bool           `json:"locked,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"` // Forward-compatible extension metadata
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
	s.groupsCounter++
	return StringID("group-" + strconv.FormatInt(s.groupsCounter, 10))
}

// FindGroupByMember returns the group containing the specified object instance, if any.
func (s *Scene) FindGroupByMember(selType SelectionType, id StringID) (Group, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, g := range s.groups {
		for _, m := range g.Members {
			if m.Type == selType && m.ID == id {
				return g, true
			}
		}
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

	delete(s.groups, groupID)
	newIDs := make([]StringID, 0, len(s.groupIDs)-1)
	for _, id := range s.groupIDs {
		if id != groupID {
			newIDs = append(newIDs, id)
		}
	}
	s.groupIDs = newIDs
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
		newIDs := make([]StringID, 0, len(s.groupIDs)-1)
		for _, id := range s.groupIDs {
			if id != groupID {
				newIDs = append(newIDs, id)
			}
		}
		s.groupIDs = newIDs
		s.revision++
		return Group{}, true, nil
	}

	// 4. Update group with remaining members
	grp.Members = filtered
	s.groups[groupID] = grp
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

	displayName := newName
	if displayName == "" {
		displayName = "Group " + string(groupID)
	}
	grp.Name = displayName
	s.groups[groupID] = grp
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

	if deleteMembers {
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
			}
		}
	}

	delete(s.groups, groupID)
	newIDs := make([]StringID, 0, len(s.groupIDs)-1)
	for _, id := range s.groupIDs {
		if id != groupID {
			newIDs = append(newIDs, id)
		}
	}
	s.groupIDs = newIDs
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
			s.groups[gID] = g
			if len(filtered) < 2 {
				emptyOrSingle = append(emptyOrSingle, gID)
			}
		}
	}

	for _, gID := range emptyOrSingle {
		delete(s.groups, gID)
		newIDs := make([]StringID, 0, len(s.groupIDs)-1)
		for _, id := range s.groupIDs {
			if id != gID {
				newIDs = append(newIDs, id)
			}
		}
		s.groupIDs = newIDs
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
		}
	}

	if count == 0 {
		return 0, 0, 0, 0, errors.New("group has no geometric members")
	}

	return minX, minY, maxX, maxY, nil
}
