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
)

// SelectionState represents canonical object selection identity.
type SelectionState struct {
	Type SelectionType `json:"type"`
	ID   StringID      `json:"id"`
}

// GetSelection returns the canonical active selection.
func (s *Scene) GetSelection() SelectionState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.selection
}

// SetSelection validates that the requested object exists and sets canonical selection.
func (s *Scene) SetSelection(selType SelectionType, id StringID) (SelectionState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	switch selType {
	case SelectionNone, "":
		s.selection = SelectionState{Type: SelectionNone, ID: ""}
		return s.selection, nil

	case SelectionNode:
		if _, ok := s.nodes[id]; !ok {
			return s.selection, errors.New("node not found: " + string(id))
		}
		s.selection = SelectionState{Type: SelectionNode, ID: id}
		return s.selection, nil

	case SelectionFlow:
		if _, ok := s.flows[id]; !ok {
			return s.selection, errors.New("flow not found: " + string(id))
		}
		s.selection = SelectionState{Type: SelectionFlow, ID: id}
		return s.selection, nil

	case SelectionGlow:
		if _, ok := s.glows[id]; !ok {
			return s.selection, errors.New("glow not found: " + string(id))
		}
		s.selection = SelectionState{Type: SelectionGlow, ID: id}
		return s.selection, nil

	case SelectionRipple:
		if _, ok := s.ripples[id]; !ok {
			return s.selection, errors.New("ripple not found: " + string(id))
		}
		s.selection = SelectionState{Type: SelectionRipple, ID: id}
		return s.selection, nil

	default:
		return s.selection, errors.New("unsupported selection type: " + string(selType))
	}
}

// ClearSelection resets canonical selection to none.
func (s *Scene) ClearSelection() SelectionState {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.selection = SelectionState{Type: SelectionNone, ID: ""}
	return s.selection
}
