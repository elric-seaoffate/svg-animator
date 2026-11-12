package scene

import (
	"errors"
)

// SelectionType identifies the type of an independently selectable scene object.
type SelectionType string

const (
	SelectionNone   SelectionType = "none"
	SelectionNode   SelectionType = "node"
	SelectionFlow   SelectionType = "flow"
	SelectionGlow   SelectionType = "glow"
	SelectionRipple SelectionType = "ripple"
	SelectionGroup  SelectionType = "group"
	SelectionImage  SelectionType = "image"
)

// SelectionItem represents a single selected object reference in a selection set.
type SelectionItem struct {
	Type SelectionType `json:"type"`
	ID   StringID      `json:"id"`
}

// SelectionState represents canonical object selection identity, supporting both
// primary/active selection (for property inspectors) and multiple selected items.
type SelectionState struct {
	Type  SelectionType   `json:"type"`
	ID    StringID        `json:"id"`
	Items []SelectionItem `json:"items,omitempty"`
}

// Equal returns whether two SelectionStates represent identical selection sets and primary targets.
func (s SelectionState) Equal(o SelectionState) bool {
	if s.Type != o.Type || s.ID != o.ID || len(s.Items) != len(o.Items) {
		return false
	}
	for i := range s.Items {
		if s.Items[i] != o.Items[i] {
			return false
		}
	}
	return true
}

// GetSelection returns the canonical active selection.
func (s *Scene) GetSelection() SelectionState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.selection
}

// objectExistsLocked verifies whether an object of given type and ID exists in the scene.
func (s *Scene) objectExistsLocked(selType SelectionType, id StringID) bool {
	switch selType {
	case SelectionNode:
		_, ok := s.nodes[id]
		return ok
	case SelectionFlow:
		_, ok := s.flows[id]
		return ok
	case SelectionGlow:
		_, ok := s.glows[id]
		return ok
	case SelectionRipple:
		_, ok := s.ripples[id]
		return ok
	case SelectionGroup:
		_, ok := s.groups[id]
		return ok
	case SelectionImage:
		_, ok := s.images[id]
		return ok
	default:
		return false
	}
}

// SetSelection validates that the requested object exists and sets canonical single selection.
func (s *Scene) SetSelection(selType SelectionType, id StringID) (SelectionState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	switch selType {
	case SelectionNone, "":
		s.selection = SelectionState{Type: SelectionNone, ID: "", Items: nil}
		return s.selection, nil

	case SelectionNode, SelectionFlow, SelectionGlow, SelectionRipple, SelectionImage:
		if !s.objectExistsLocked(selType, id) {
			return s.selection, errors.New(string(selType) + " not found: " + string(id))
		}
		item := SelectionItem{Type: selType, ID: id}
		s.selection = SelectionState{
			Type:  selType,
			ID:    id,
			Items: []SelectionItem{item},
		}
		return s.selection, nil

	case SelectionGroup:
		grp, exists := s.groups[id]
		if !exists {
			return s.selection, errors.New("group not found: " + string(id))
		}
		items := make([]SelectionItem, len(grp.Members))
		for i, m := range grp.Members {
			items[i] = SelectionItem{Type: m.Type, ID: m.ID}
		}
		s.selection = SelectionState{
			Type:  SelectionGroup,
			ID:    id,
			Items: items,
		}
		return s.selection, nil

	default:
		return s.selection, errors.New("unsupported selection type: " + string(selType))
	}
}

// SetMultiSelection sets multiple selected objects, validating existence and deduplicating.
func (s *Scene) SetMultiSelection(items []SelectionItem, primary *SelectionItem) (SelectionState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(items) == 0 {
		s.selection = SelectionState{Type: SelectionNone, ID: "", Items: nil}
		return s.selection, nil
	}

	seen := make(map[string]bool, len(items))
	validItems := make([]SelectionItem, 0, len(items))

	for _, item := range items {
		if item.Type == SelectionGroup {
			continue // groups cannot be multi-selected items
		}
		key := string(item.Type) + ":" + string(item.ID)
		if seen[key] {
			continue
		}
		if !s.objectExistsLocked(item.Type, item.ID) {
			continue
		}
		seen[key] = true
		validItems = append(validItems, item)
	}

	if len(validItems) == 0 {
		s.selection = SelectionState{Type: SelectionNone, ID: "", Items: nil}
		return s.selection, nil
	}

	// Determine primary selection
	primaryItem := validItems[len(validItems)-1]
	if primary != nil && primary.ID != "" && s.objectExistsLocked(primary.Type, primary.ID) {
		primaryKey := string(primary.Type) + ":" + string(primary.ID)
		if seen[primaryKey] {
			primaryItem = *primary
		}
	}

	s.selection = SelectionState{
		Type:  primaryItem.Type,
		ID:    primaryItem.ID,
		Items: validItems,
	}
	return s.selection, nil
}

// restoreSelectionLocked restores the selection from a history snapshot, preserving multi-selection
// and filtering out any objects that no longer exist in the scene.
func (s *Scene) restoreSelectionLocked(sel SelectionState) {
	if len(sel.Items) > 1 {
		seen := make(map[string]bool, len(sel.Items))
		validItems := make([]SelectionItem, 0, len(sel.Items))
		for _, item := range sel.Items {
			if item.Type == SelectionGroup {
				continue
			}
			key := string(item.Type) + ":" + string(item.ID)
			if seen[key] || !s.objectExistsLocked(item.Type, item.ID) {
				continue
			}
			seen[key] = true
			validItems = append(validItems, item)
		}
		if len(validItems) > 1 {
			primaryType := validItems[0].Type
			primaryID := validItems[0].ID
			if sel.ID != "" && s.objectExistsLocked(sel.Type, sel.ID) {
				primaryType = sel.Type
				primaryID = sel.ID
			}
			s.selection = SelectionState{
				Type:  primaryType,
				ID:    primaryID,
				Items: validItems,
			}
			return
		} else if len(validItems) == 1 {
			s.selection = SelectionState{
				Type:  validItems[0].Type,
				ID:    validItems[0].ID,
				Items: validItems,
			}
			return
		}
	} else if len(sel.Items) == 1 {
		if s.objectExistsLocked(sel.Items[0].Type, sel.Items[0].ID) {
			s.selection = SelectionState{
				Type:  sel.Items[0].Type,
				ID:    sel.Items[0].ID,
				Items: []SelectionItem{sel.Items[0]},
			}
			return
		}
	} else if sel.Type != SelectionNone && sel.ID != "" {
		if s.objectExistsLocked(sel.Type, sel.ID) {
			s.selection = SelectionState{
				Type:  sel.Type,
				ID:    sel.ID,
				Items: []SelectionItem{{Type: sel.Type, ID: sel.ID}},
			}
			return
		}
	}
	s.selection = SelectionState{Type: SelectionNone, ID: "", Items: nil}
}

// AddToSelection adds an item to the selection set if it exists and is not already selected.
func (s *Scene) AddToSelection(item SelectionItem) (SelectionState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.objectExistsLocked(item.Type, item.ID) {
		return s.selection, errors.New(string(item.Type) + " not found: " + string(item.ID))
	}

	for _, existing := range s.selection.Items {
		if existing.Type == item.Type && existing.ID == item.ID {
			s.selection.Type = item.Type
			s.selection.ID = item.ID
			return s.selection, nil
		}
	}

	newItems := append(s.selection.Items, item)
	s.selection = SelectionState{
		Type:  item.Type,
		ID:    item.ID,
		Items: newItems,
	}
	return s.selection, nil
}

// ToggleSelection adds the item if not selected, or removes it if already selected.
func (s *Scene) ToggleSelection(item SelectionItem) (SelectionState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.objectExistsLocked(item.Type, item.ID) {
		return s.selection, errors.New(string(item.Type) + " not found: " + string(item.ID))
	}

	foundIdx := -1
	for idx, existing := range s.selection.Items {
		if existing.Type == item.Type && existing.ID == item.ID {
			foundIdx = idx
			break
		}
	}

	if foundIdx >= 0 {
		newItems := make([]SelectionItem, 0, len(s.selection.Items)-1)
		newItems = append(newItems, s.selection.Items[:foundIdx]...)
		newItems = append(newItems, s.selection.Items[foundIdx+1:]...)

		if len(newItems) == 0 {
			s.selection = SelectionState{Type: SelectionNone, ID: "", Items: nil}
			return s.selection, nil
		}

		primaryType := s.selection.Type
		primaryID := s.selection.ID
		if primaryType == item.Type && primaryID == item.ID {
			primaryType = newItems[len(newItems)-1].Type
			primaryID = newItems[len(newItems)-1].ID
		}

		s.selection = SelectionState{
			Type:  primaryType,
			ID:    primaryID,
			Items: newItems,
		}
		return s.selection, nil
	}

	newItems := append(s.selection.Items, item)
	s.selection = SelectionState{
		Type:  item.Type,
		ID:    item.ID,
		Items: newItems,
	}
	return s.selection, nil
}

// RemoveFromSelection removes an item from the selection set.
func (s *Scene) RemoveFromSelection(item SelectionItem) (SelectionState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	foundIdx := -1
	for idx, existing := range s.selection.Items {
		if existing.Type == item.Type && existing.ID == item.ID {
			foundIdx = idx
			break
		}
	}

	if foundIdx < 0 {
		return s.selection, nil
	}

	newItems := make([]SelectionItem, 0, len(s.selection.Items)-1)
	newItems = append(newItems, s.selection.Items[:foundIdx]...)
	newItems = append(newItems, s.selection.Items[foundIdx+1:]...)

	if len(newItems) == 0 {
		s.selection = SelectionState{Type: SelectionNone, ID: "", Items: nil}
		return s.selection, nil
	}

	primaryType := s.selection.Type
	primaryID := s.selection.ID
	if primaryType == item.Type && primaryID == item.ID {
		primaryType = newItems[len(newItems)-1].Type
		primaryID = newItems[len(newItems)-1].ID
	}

	s.selection = SelectionState{
		Type:  primaryType,
		ID:    primaryID,
		Items: newItems,
	}
	return s.selection, nil
}

// ClearSelection resets canonical selection to none.
func (s *Scene) ClearSelection() SelectionState {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.selection = SelectionState{Type: SelectionNone, ID: "", Items: nil}
	return s.selection
}

// pruneSelectionLocked removes any reference to a deleted object from the selection state.
func (s *Scene) pruneSelectionLocked(selType SelectionType, id StringID) {
	if len(s.selection.Items) == 0 {
		if s.selection.Type == selType && s.selection.ID == id {
			s.selection = SelectionState{Type: SelectionNone, ID: "", Items: nil}
		}
		return
	}

	newItems := make([]SelectionItem, 0, len(s.selection.Items))
	for _, item := range s.selection.Items {
		if !(item.Type == selType && item.ID == id) {
			newItems = append(newItems, item)
		}
	}

	if len(newItems) == 0 {
		s.selection = SelectionState{Type: SelectionNone, ID: "", Items: nil}
		return
	}

	primaryType := s.selection.Type
	primaryID := s.selection.ID
	if primaryType == selType && primaryID == id {
		primaryType = newItems[len(newItems)-1].Type
		primaryID = newItems[len(newItems)-1].ID
	}

	s.selection = SelectionState{
		Type:  primaryType,
		ID:    primaryID,
		Items: newItems,
	}
}
