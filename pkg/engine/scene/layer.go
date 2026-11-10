package scene

import (
	"errors"
	"fmt"
)

// ensureLayersInitializedLocked builds or repairs s.layers ensuring all existing scene objects
// are accounted for and no dangling entries remain.
func (s *Scene) ensureLayersInitializedLocked() {
	existingKeys := make(map[string]bool)
	validEntries := make([]LayerEntry, 0, len(s.layers))

	for _, entry := range s.layers {
		key := string(entry.Type) + ":" + string(entry.ID)
		if existingKeys[key] {
			continue // deduplicate
		}
		if s.objectExistsLocked(entry.Type, entry.ID) {
			existingKeys[key] = true
			validEntries = append(validEntries, entry)
		}
	}

	// If uninitialized or missing objects, append in canonical legacy order
	// Default legacy SVG stacking order: Ripples (bottom) -> Glows -> Flows -> Images -> Nodes (top)
	for _, id := range s.rippleIDs {
		key := "ripple:" + string(id)
		if !existingKeys[key] {
			existingKeys[key] = true
			validEntries = append(validEntries, LayerEntry{Type: SelectionRipple, ID: id})
		}
	}
	for _, id := range s.glowIDs {
		key := "glow:" + string(id)
		if !existingKeys[key] {
			existingKeys[key] = true
			validEntries = append(validEntries, LayerEntry{Type: SelectionGlow, ID: id})
		}
	}
	for _, id := range s.flowIDs {
		key := "flow:" + string(id)
		if !existingKeys[key] {
			existingKeys[key] = true
			validEntries = append(validEntries, LayerEntry{Type: SelectionFlow, ID: id})
		}
	}
	for _, id := range s.imageIDs {
		key := "image:" + string(id)
		if !existingKeys[key] {
			existingKeys[key] = true
			validEntries = append(validEntries, LayerEntry{Type: SelectionImage, ID: id})
		}
	}
	for _, id := range s.nodeIDs {
		key := "node:" + string(id)
		if !existingKeys[key] {
			existingKeys[key] = true
			validEntries = append(validEntries, LayerEntry{Type: SelectionNode, ID: id})
		}
	}

	s.layers = validEntries
}

// removeLayerEntryLocked removes an object entry from s.layers.
func (s *Scene) removeLayerEntryLocked(selType SelectionType, id StringID) {
	if len(s.layers) == 0 {
		return
	}
	out := make([]LayerEntry, 0, len(s.layers))
	for _, entry := range s.layers {
		if entry.Type == selType && entry.ID == id {
			continue
		}
		out = append(out, entry)
	}
	s.layers = out
}

// coalesceGroupMembersInLayersLocked ensures that all members of grp are placed contiguously in s.layers.
func (s *Scene) coalesceGroupMembersInLayersLocked(grp Group) {
	if len(grp.Members) < 2 || len(s.layers) == 0 {
		return
	}
	memberMap := make(map[string]bool, len(grp.Members))
	for _, m := range grp.Members {
		memberMap[string(m.Type)+":"+string(m.ID)] = true
	}

	maxIdx := -1
	for i, entry := range s.layers {
		k := string(entry.Type) + ":" + string(entry.ID)
		if memberMap[k] {
			maxIdx = i
		}
	}
	if maxIdx == -1 {
		return
	}

	var groupEntries []LayerEntry
	var nonGroupEntries []LayerEntry
	for _, entry := range s.layers {
		k := string(entry.Type) + ":" + string(entry.ID)
		if memberMap[k] {
			groupEntries = append(groupEntries, entry)
		} else {
			nonGroupEntries = append(nonGroupEntries, entry)
		}
	}

	nonGroupBefore := 0
	for i := 0; i <= maxIdx; i++ {
		k := string(s.layers[i].Type) + ":" + string(s.layers[i].ID)
		if !memberMap[k] {
			nonGroupBefore++
		}
	}

	result := make([]LayerEntry, 0, len(s.layers))
	result = append(result, nonGroupEntries[:nonGroupBefore]...)
	result = append(result, groupEntries...)
	result = append(result, nonGroupEntries[nonGroupBefore:]...)
	s.layers = result
}

// GetLayers returns the canonical layer ordering (bottom to top).
func (s *Scene) GetLayers() []LayerEntry {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.ensureLayersInitializedLocked()
	out := make([]LayerEntry, len(s.layers))
	copy(out, s.layers)
	for i := range out {
		v := s.getEffectiveVisibilityLocked(out[i].Type, out[i].ID)
		l := s.getEffectiveLockedLocked(out[i].Type, out[i].ID)
		out[i].Visible = &v
		out[i].Locked = &l
	}
	return out
}

// SetLayers updates the entire layer ordering.
func (s *Scene) SetLayers(entries []LayerEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	seen := make(map[string]bool)
	validated := make([]LayerEntry, 0, len(entries))

	for _, e := range entries {
		key := string(e.Type) + ":" + string(e.ID)
		if seen[key] {
			continue
		}
		if !s.objectExistsLocked(e.Type, e.ID) {
			return fmt.Errorf("invalid layer entry: %s %s does not exist", e.Type, e.ID)
		}
		seen[key] = true
		if e.Visible != nil {
			_ = s.setObjectVisibilityLocked(e.Type, e.ID, *e.Visible)
		}
		if e.Locked != nil {
			_ = s.setObjectLockedLocked(e.Type, e.ID, *e.Locked)
		}
		validated = append(validated, LayerEntry{Type: e.Type, ID: e.ID})
	}

	s.layers = validated
	s.ensureLayersInitializedLocked()
	s.revision++
	return nil
}

// resolveTargetLayerKeys expands SelectionItems (including groups) into an ordered slice of unique layer keys.
func (s *Scene) resolveTargetLayerKeys(targets []SelectionItem) (map[string]bool, []string) {
	keyMap := make(map[string]bool)
	var orderedKeys []string

	for _, t := range targets {
		if t.Type == SelectionGroup {
			if grp, ok := s.groups[t.ID]; ok {
				for _, m := range grp.Members {
					k := string(m.Type) + ":" + string(m.ID)
					if !keyMap[k] {
						keyMap[k] = true
						orderedKeys = append(orderedKeys, k)
					}
				}
			}
		} else {
			k := string(t.Type) + ":" + string(t.ID)
			if !keyMap[k] {
				keyMap[k] = true
				orderedKeys = append(orderedKeys, k)
			}
		}
	}
	return keyMap, orderedKeys
}

// BringToFront moves specified target object(s) or group to the top (end) of layer order.
func (s *Scene) BringToFront(targets []SelectionItem) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(targets) == 0 {
		return false, errors.New("no target objects specified")
	}

	s.ensureLayersInitializedLocked()
	targetMap, _ := s.resolveTargetLayerKeys(targets)
	if len(targetMap) == 0 {
		return false, errors.New("no valid targets found")
	}

	// Check if already at the top
	allAtTop := true
	targetCount := len(targetMap)
	for i := len(s.layers) - targetCount; i < len(s.layers); i++ {
		if i < 0 {
			allAtTop = false
			break
		}
		k := string(s.layers[i].Type) + ":" + string(s.layers[i].ID)
		if !targetMap[k] {
			allAtTop = false
			break
		}
	}
	if allAtTop {
		return false, nil // Idempotent no-op
	}

	nonTargets := make([]LayerEntry, 0, len(s.layers)-targetCount)
	movingTargets := make([]LayerEntry, 0, targetCount)

	for _, e := range s.layers {
		k := string(e.Type) + ":" + string(e.ID)
		if targetMap[k] {
			movingTargets = append(movingTargets, e)
		} else {
			nonTargets = append(nonTargets, e)
		}
	}

	s.layers = append(nonTargets, movingTargets...)
	s.revision++
	return true, nil
}

// SendToBack moves specified target object(s) or group to the bottom (start) of layer order.
func (s *Scene) SendToBack(targets []SelectionItem) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(targets) == 0 {
		return false, errors.New("no target objects specified")
	}

	s.ensureLayersInitializedLocked()
	targetMap, _ := s.resolveTargetLayerKeys(targets)
	if len(targetMap) == 0 {
		return false, errors.New("no valid targets found")
	}

	// Check if already at bottom
	allAtBottom := true
	targetCount := len(targetMap)
	for i := 0; i < targetCount; i++ {
		if i >= len(s.layers) {
			allAtBottom = false
			break
		}
		k := string(s.layers[i].Type) + ":" + string(s.layers[i].ID)
		if !targetMap[k] {
			allAtBottom = false
			break
		}
	}
	if allAtBottom {
		return false, nil // Idempotent no-op
	}

	nonTargets := make([]LayerEntry, 0, len(s.layers)-targetCount)
	movingTargets := make([]LayerEntry, 0, targetCount)

	for _, e := range s.layers {
		k := string(e.Type) + ":" + string(e.ID)
		if targetMap[k] {
			movingTargets = append(movingTargets, e)
		} else {
			nonTargets = append(nonTargets, e)
		}
	}

	s.layers = append(movingTargets, nonTargets...)
	s.revision++
	return true, nil
}

// BringForward shifts target object(s) or group one position forward (towards top) in layer order.
func (s *Scene) BringForward(targets []SelectionItem) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(targets) == 0 {
		return false, errors.New("no target objects specified")
	}

	s.ensureLayersInitializedLocked()
	targetMap, _ := s.resolveTargetLayerKeys(targets)
	if len(targetMap) == 0 {
		return false, errors.New("no valid targets found")
	}

	// If the topmost target is already at the very top of layers, can't move forward
	topIdx := -1
	for i := len(s.layers) - 1; i >= 0; i-- {
		k := string(s.layers[i].Type) + ":" + string(s.layers[i].ID)
		if targetMap[k] {
			topIdx = i
			break
		}
	}
	if topIdx == len(s.layers)-1 {
		// Target already includes the top item
		return false, nil
	}

	// Swap each target block with the item immediately above it (scanning top to bottom)
	changed := false
	for i := len(s.layers) - 2; i >= 0; i-- {
		curKey := string(s.layers[i].Type) + ":" + string(s.layers[i].ID)
		aboveKey := string(s.layers[i+1].Type) + ":" + string(s.layers[i+1].ID)
		if targetMap[curKey] && !targetMap[aboveKey] {
			s.layers[i], s.layers[i+1] = s.layers[i+1], s.layers[i]
			changed = true
		}
	}

	if changed {
		s.revision++
	}
	return changed, nil
}

// SendBackward shifts target object(s) or group one position backward (towards bottom) in layer order.
func (s *Scene) SendBackward(targets []SelectionItem) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(targets) == 0 {
		return false, errors.New("no target objects specified")
	}

	s.ensureLayersInitializedLocked()
	targetMap, _ := s.resolveTargetLayerKeys(targets)
	if len(targetMap) == 0 {
		return false, errors.New("no valid targets found")
	}

	// If the bottommost target is already at index 0, can't move backward
	bottomIdx := -1
	for i := 0; i < len(s.layers); i++ {
		k := string(s.layers[i].Type) + ":" + string(s.layers[i].ID)
		if targetMap[k] {
			bottomIdx = i
			break
		}
	}
	if bottomIdx == 0 {
		return false, nil
	}

	// Swap each target block with the item immediately below it (scanning bottom to top)
	changed := false
	for i := 1; i < len(s.layers); i++ {
		curKey := string(s.layers[i].Type) + ":" + string(s.layers[i].ID)
		belowKey := string(s.layers[i-1].Type) + ":" + string(s.layers[i-1].ID)
		if targetMap[curKey] && !targetMap[belowKey] {
			s.layers[i], s.layers[i-1] = s.layers[i-1], s.layers[i]
			changed = true
		}
	}

	if changed {
		s.revision++
	}
	return changed, nil
}

func (s *Scene) setObjectVisibilityLocked(selType SelectionType, id StringID, visible bool) error {
	switch selType {
	case SelectionNode:
		n, exists := s.nodes[id]
		if !exists {
			return fmt.Errorf("node not found: %s", id)
		}
		n.Visible = &visible
		s.nodes[id] = n
	case SelectionFlow:
		f, exists := s.flows[id]
		if !exists {
			return fmt.Errorf("flow not found: %s", id)
		}
		f.Visible = &visible
		s.flows[id] = f
	case SelectionGlow:
		g, exists := s.glows[id]
		if !exists {
			return fmt.Errorf("glow not found: %s", id)
		}
		g.Visible = &visible
		s.glows[id] = g
	case SelectionRipple:
		r, exists := s.ripples[id]
		if !exists {
			return fmt.Errorf("ripple not found: %s", id)
		}
		r.Visible = &visible
		s.ripples[id] = r
	case SelectionImage:
		img, exists := s.images[id]
		if !exists {
			return fmt.Errorf("image not found: %s", id)
		}
		img.Visible = &visible
		s.images[id] = img
	case SelectionGroup:
		grp, exists := s.groups[id]
		if !exists {
			return fmt.Errorf("group not found: %s", id)
		}
		grp.Visible = &visible
		s.groups[id] = grp
	default:
		return fmt.Errorf("unsupported object type: %s", selType)
	}

	s.revision++
	return nil
}

// SetObjectVisibility updates visibility for a single object instance.
func (s *Scene) SetObjectVisibility(selType SelectionType, id StringID, visible bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.setObjectVisibilityLocked(selType, id, visible)
}

func (s *Scene) setObjectLockedLocked(selType SelectionType, id StringID, locked bool) error {
	switch selType {
	case SelectionNode:
		n, exists := s.nodes[id]
		if !exists {
			return fmt.Errorf("node not found: %s", id)
		}
		n.Locked = locked
		s.nodes[id] = n
	case SelectionFlow:
		f, exists := s.flows[id]
		if !exists {
			return fmt.Errorf("flow not found: %s", id)
		}
		f.Locked = locked
		s.flows[id] = f
	case SelectionGlow:
		g, exists := s.glows[id]
		if !exists {
			return fmt.Errorf("glow not found: %s", id)
		}
		g.Locked = locked
		s.glows[id] = g
	case SelectionRipple:
		r, exists := s.ripples[id]
		if !exists {
			return fmt.Errorf("ripple not found: %s", id)
		}
		r.Locked = locked
		s.ripples[id] = r
	case SelectionImage:
		img, exists := s.images[id]
		if !exists {
			return fmt.Errorf("image not found: %s", id)
		}
		img.Locked = locked
		s.images[id] = img
	case SelectionGroup:
		grp, exists := s.groups[id]
		if !exists {
			return fmt.Errorf("group not found: %s", id)
		}
		grp.Locked = locked
		s.groups[id] = grp
	default:
		return fmt.Errorf("unsupported object type: %s", selType)
	}

	s.revision++
	return nil
}

// SetObjectLocked updates locked state for a single object instance.
func (s *Scene) SetObjectLocked(selType SelectionType, id StringID, locked bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.setObjectLockedLocked(selType, id, locked)
}

func (s *Scene) getEffectiveVisibilityLocked(selType SelectionType, id StringID) bool {
	if grp, found := s.findGroupByMemberLocked(selType, id); found {
		if !grp.IsVisible() {
			return false
		}
	}

	switch selType {
	case SelectionNode:
		if n, ok := s.nodes[id]; ok {
			return n.IsVisible()
		}
	case SelectionFlow:
		if f, ok := s.flows[id]; ok {
			return f.IsVisible()
		}
	case SelectionGlow:
		if g, ok := s.glows[id]; ok {
			return g.IsVisible()
		}
	case SelectionRipple:
		if r, ok := s.ripples[id]; ok {
			return r.IsVisible()
		}
	case SelectionImage:
		if img, ok := s.images[id]; ok {
			return img.IsVisible()
		}
	case SelectionGroup:
		if grp, ok := s.groups[id]; ok {
			return grp.IsVisible()
		}
	}
	return false
}

// GetEffectiveVisibility returns whether an object is visibly rendered,
// taking into account both its individual visibility and parent group visibility.
func (s *Scene) GetEffectiveVisibility(selType SelectionType, id StringID) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.getEffectiveVisibilityLocked(selType, id)
}

func (s *Scene) getEffectiveLockedLocked(selType SelectionType, id StringID) bool {
	if grp, found := s.findGroupByMemberLocked(selType, id); found {
		if grp.IsLocked() {
			return true
		}
	}

	switch selType {
	case SelectionNode:
		if n, ok := s.nodes[id]; ok {
			return n.IsLocked()
		}
	case SelectionFlow:
		if f, ok := s.flows[id]; ok {
			return f.IsLocked()
		}
	case SelectionGlow:
		if g, ok := s.glows[id]; ok {
			return g.IsLocked()
		}
	case SelectionRipple:
		if r, ok := s.ripples[id]; ok {
			return r.IsLocked()
		}
	case SelectionImage:
		if img, ok := s.images[id]; ok {
			return img.IsLocked()
		}
	case SelectionGroup:
		if grp, ok := s.groups[id]; ok {
			return grp.IsLocked()
		}
	}
	return false
}

// GetEffectiveLocked returns whether an object is locked from editing,
// taking into account both its individual lock state and parent group lock state.
func (s *Scene) GetEffectiveLocked(selType SelectionType, id StringID) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.getEffectiveLockedLocked(selType, id)
}
