package scene

import (
	"testing"
)

func TestSceneSelectionAndValidation(t *testing.T) {
	s := NewScene()

	// 1. Initial selection is none
	sel := s.GetSelection()
	if sel.Type != SelectionNone || sel.ID != "" {
		t.Fatalf("expected initial selection none, got %+v", sel)
	}

	// 2. Select nonexistent node fails
	_, err := s.SetSelection(SelectionNode, "node999")
	if err == nil {
		t.Errorf("expected error selecting nonexistent node")
	}

	// 3. Create node and select it
	node := s.CreateNode(Node{Shape: "rounded", Text: "Card 1"}, nil, false)
	sel, err = s.SetSelection(SelectionNode, node.ID)
	if err != nil {
		t.Fatalf("unexpected error selecting valid node: %v", err)
	}
	if sel.Type != SelectionNode || sel.ID != node.ID {
		t.Errorf("expected selection node %s, got %+v", node.ID, sel)
	}

	// 4. Create flow and select it
	flow := s.CreateFlow(Flow{FromNodeID: node.ID})
	sel, err = s.SetSelection(SelectionFlow, flow.ID)
	if err != nil {
		t.Fatalf("unexpected error selecting valid flow: %v", err)
	}
	if sel.Type != SelectionFlow || sel.ID != flow.ID {
		t.Errorf("expected selection flow %s, got %+v", flow.ID, sel)
	}

	// 5. Create glow and select it
	glow := s.CreateGlow(Glow{Shape: "radar", Size: 40})
	sel, err = s.SetSelection(SelectionGlow, glow.ID)
	if err != nil {
		t.Fatalf("unexpected error selecting valid glow: %v", err)
	}
	if sel.Type != SelectionGlow || sel.ID != glow.ID {
		t.Errorf("expected selection glow %s, got %+v", glow.ID, sel)
	}

	// 6. Create ripple and select it
	rip := s.CreateRipple(Ripple{Rings: 3})
	sel, err = s.SetSelection(SelectionRipple, rip.ID)
	if err != nil {
		t.Fatalf("unexpected error selecting valid ripple: %v", err)
	}
	if sel.Type != SelectionRipple || sel.ID != rip.ID {
		t.Errorf("expected selection ripple %s, got %+v", rip.ID, sel)
	}

	// 7. Clear selection
	cleared := s.ClearSelection()
	if cleared.Type != SelectionNone || cleared.ID != "" {
		t.Errorf("expected cleared selection none, got %+v", cleared)
	}
}
