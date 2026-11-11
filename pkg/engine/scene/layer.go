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
		var visPtr *bool
		if e.Visible != nil {
			_ = s.setObjectVisibilityLocked(e.Type, e.ID, *e.Visible)
			vVal := *e.Visible
			visPtr = &vVal
		}
		var lockPtr *bool
		if e.Locked != nil {
			_ = s.setObjectLockedLocked(e.Type, e.ID, *e.Locked)
			lVal := *e.Locked
			lockPtr = &lVal
		}
		validated = append(validated, LayerEntry{Type: e.Type, ID: e.ID, Visible: visPtr, Locked: lockPtr})
	}

	s.layers = validated
	s.ensureLayersInitializedLocked()
	s.revision++
	return nil
}

func isValidLayerTargetType(t SelectionType) bool {
	switch t {
	case SelectionNode, SelectionFlow, SelectionGlow, SelectionRipple, SelectionImage, SelectionGroup:
		return true
	default:
		return false
	}
}

// fixupAllGroupContiguitiesLocked ensures that members of each group are stored contiguously in s.layers.
func (s *Scene) fixupAllGroupContiguitiesLocked() {
	for _, grp := range s.groups {
		s.coalesceGroupMembersInLayersLocked(grp)
	}
}

// resolveTargetLayerKeys expands SelectionItems (including groups) into an ordered slice of unique layer keys.
func (s *Scene) resolveTargetLayerKeys(targets []SelectionItem) (map[string]bool, []string, error) {
	if len(targets) == 0 {
		return nil, nil, errors.New("no target objects specified")
	}

	keyMap := make(map[string]bool)
	var orderedKeys []string

	for _, t := range targets {
		if !isValidLayerTargetType(t.Type) {
			return nil, nil, fmt.Errorf("invalid target type %q", t.Type)
		}
		if t.ID == "" {
			return nil, nil, fmt.Errorf("empty ID for target type %q", t.Type)
		}

		if t.Type == SelectionGroup {
			grp, ok := s.groups[t.ID]
			if !ok {
				return nil, nil, fmt.Errorf("group %q not found", t.ID)
			}
			if len(grp.Members) == 0 {
				return nil, nil, fmt.Errorf("group %q has no members", t.ID)
			}
			for _, m := range grp.Members {
				if !s.objectExistsLocked(m.Type, m.ID) {
					return nil, nil, fmt.Errorf("group member %s:%s does not exist", m.Type, m.ID)
				}
				k := string(m.Type) + ":" + string(m.ID)
				if !keyMap[k] {
					keyMap[k] = true
					orderedKeys = append(orderedKeys, k)
				}
			}
		} else {
			if !s.objectExistsLocked(t.Type, t.ID) {
				return nil, nil, fmt.Errorf("target object %s:%s does not exist", t.Type, t.ID)
			}
			k := string(t.Type) + ":" + string(t.ID)
			if !keyMap[k] {
				keyMap[k] = true
				orderedKeys = append(orderedKeys, k)
			}
		}
	}

	if len(keyMap) == 0 {
		return nil, nil, errors.New("no valid targets found")
	}

	return keyMap, orderedKeys, nil
}

// BringToFront moves specified target object(s) or group to the top (end) of layer order.
func (s *Scene) BringToFront(targets []SelectionItem) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.ensureLayersInitializedLocked()
	targetMap, _, err := s.resolveTargetLayerKeys(targets)
	if err != nil {
		return false, err
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
	s.fixupAllGroupContiguitiesLocked()
	s.revision++
	return true, nil
}

// SendToBack moves specified target object(s) or group to the bottom (start) of layer order.
func (s *Scene) SendToBack(targets []SelectionItem) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.ensureLayersInitializedLocked()
	targetMap, _, err := s.resolveTargetLayerKeys(targets)
	if err != nil {
		return false, err
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
	s.fixupAllGroupContiguitiesLocked()
	s.revision++
	return true, nil
}

type layerBlock struct {
	entries  []LayerEntry
	isTarget bool
}

// buildLayerBlocksLocked partitions s.layers into contiguous semantic units (groups or individual objects).
func (s *Scene) buildLayerBlocksLocked(targetMap map[string]bool) []layerBlock {
	s.fixupAllGroupContiguitiesLocked()

	// Map each object to its group ID if any
	objGroup := make(map[string]StringID)
	for gid, grp := range s.groups {
		for _, m := range grp.Members {
			objGroup[string(m.Type)+":"+string(m.ID)] = gid
		}
	}

	var blocks []layerBlock
	i := 0
	for i < len(s.layers) {
		k := string(s.layers[i].Type) + ":" + string(s.layers[i].ID)
		gid, inGroup := objGroup[k]
		if inGroup {
			// Gather all contiguous entries belonging to the same group
			start := i
			hasTarget := false
			for i < len(s.layers) {
				curK := string(s.layers[i].Type) + ":" + string(s.layers[i].ID)
				if objGroup[curK] != gid {
					break
				}
				if targetMap[curK] {
					hasTarget = true
				}
				i++
			}
			blockEntries := make([]LayerEntry, i-start)
			copy(blockEntries, s.layers[start:i])
			blocks = append(blocks, layerBlock{
				entries:  blockEntries,
				isTarget: hasTarget,
			})
		} else {
			// Standalone entry
			blocks = append(blocks, layerBlock{
				entries:  []LayerEntry{s.layers[i]},
				isTarget: targetMap[k],
			})
			i++
		}
	}
	return blocks
}

// BringForward shifts target object(s) or group one position forward (towards top) in layer order.
func (s *Scene) BringForward(targets []SelectionItem) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.ensureLayersInitializedLocked()
	targetMap, _, err := s.resolveTargetLayerKeys(targets)
	if err != nil {
		return false, err
	}

	blocks := s.buildLayerBlocksLocked(targetMap)
	if len(blocks) <= 1 {
		return false, nil
	}

	// If the topmost block is already a target, can't move forward
	if blocks[len(blocks)-1].isTarget {
		return false, nil
	}

	changed := false
	for i := len(blocks) - 2; i >= 0; i-- {
		if blocks[i].isTarget && !blocks[i+1].isTarget {
			blocks[i], blocks[i+1] = blocks[i+1], blocks[i]
			changed = true
		}
	}

	if changed {
		newLayers := make([]LayerEntry, 0, len(s.layers))
		for _, b := range blocks {
			newLayers = append(newLayers, b.entries...)
		}
		s.layers = newLayers
		s.fixupAllGroupContiguitiesLocked()
		s.revision++
	}
	return changed, nil
}

// SendBackward shifts target object(s) or group one position backward (towards bottom) in layer order.
func (s *Scene) SendBackward(targets []SelectionItem) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.ensureLayersInitializedLocked()
	targetMap, _, err := s.resolveTargetLayerKeys(targets)
	if err != nil {
		return false, err
	}

	blocks := s.buildLayerBlocksLocked(targetMap)
	if len(blocks) <= 1 {
		return false, nil
	}

	// If the bottommost block is already a target, can't move backward
	if blocks[0].isTarget {
		return false, nil
	}

	changed := false
	for i := 1; i < len(blocks); i++ {
		if blocks[i].isTarget && !blocks[i-1].isTarget {
			blocks[i], blocks[i-1] = blocks[i-1], blocks[i]
			changed = true
		}
	}

	if changed {
		newLayers := make([]LayerEntry, 0, len(s.layers))
		for _, b := range blocks {
			newLayers = append(newLayers, b.entries...)
		}
		s.layers = newLayers
		s.fixupAllGroupContiguitiesLocked()
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
