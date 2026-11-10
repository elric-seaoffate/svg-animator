package scene

import (
	"testing"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
)

func TestClipboardCopyAndPaste(t *testing.T) {
	sc := NewScene()

	n1 := sc.CreateNode(Node{Shape: "rect", X: 10, Y: 10, Width: 80, Height: 40, Name: "Node A"}, nil, false)
	n2 := sc.CreateNode(Node{Shape: "circle", X: 30, Y: 10, Width: 60, Height: 60, Name: "Node B"}, nil, false)

	fl := Flow{
		ID:         "1",
		FromNodeID: n1.ID,
		ToNodeID:   n2.ID,
		Name:       "Connector 1",
		Nodes: []geometry.Point{
			{X: 10, Y: 10},
			{X: 30, Y: 10},
		},
	}
	sc.UpdateFlow(fl)

	// Copy selection of n1, n2, and flow
	items := []SelectionItem{
		{Type: SelectionNode, ID: n1.ID},
		{Type: SelectionNode, ID: n2.ID},
		{Type: SelectionFlow, ID: fl.ID},
	}

	payload, err := sc.CopySelection(items, "")
	if err != nil {
		t.Fatalf("CopySelection failed: %v", err)
	}
	if len(payload.Nodes) != 2 {
		t.Errorf("expected 2 nodes in payload, got %d", len(payload.Nodes))
	}
	if len(payload.Flows) != 1 {
		t.Errorf("expected 1 flow in payload, got %d", len(payload.Flows))
	}

	// Paste with offset (+5, +5)
	newItems, newGrpID, err := sc.PastePayload(payload, 5.0, 5.0)
	if err != nil {
		t.Fatalf("PastePayload failed: %v", err)
	}
	if len(newItems) != 3 {
		t.Fatalf("expected 3 pasted items, got %d", len(newItems))
	}
	if newGrpID != "" {
		t.Errorf("expected no group ID when copying ungrouped objects, got %s", newGrpID)
	}

	// Verify newly created nodes have unique IDs and offset positions
	pastedN1ID := newItems[0].ID
	pastedN2ID := newItems[1].ID
	pastedFID := newItems[2].ID

	if pastedN1ID == n1.ID || pastedN2ID == n2.ID {
		t.Errorf("pasted node IDs must be distinct from originals")
	}

	pn1 := sc.nodes[pastedN1ID]
	if pn1.X != 15 || pn1.Y != 15 {
		t.Errorf("expected pasted n1 at (15, 15), got (%f, %f)", pn1.X, pn1.Y)
	}
	if pn1.Name != "Node A Copy" {
		t.Errorf("expected name 'Node A Copy', got %q", pn1.Name)
	}

	// Verify Flow remapping: the pasted flow must connect to the pasted nodes, NOT the originals!
	pfl := sc.flows[pastedFID]
	if pfl.FromNodeID != pastedN1ID {
		t.Errorf("expected pasted flow FromNodeID to be %s, got %s", pastedN1ID, pfl.FromNodeID)
	}
	if pfl.ToNodeID != pastedN2ID {
		t.Errorf("expected pasted flow ToNodeID to be %s, got %s", pastedN2ID, pfl.ToNodeID)
	}
}

func TestClipboardGroupDuplication(t *testing.T) {
	sc := NewScene()

	n1 := sc.CreateNode(Node{Shape: "rect", X: 10, Y: 10, Width: 80, Height: 40}, nil, false)
	n2 := sc.CreateNode(Node{Shape: "circle", X: 30, Y: 10, Width: 60, Height: 60}, nil, false)
	gl := Glow{ID: "1", X: 20, Y: 20, Size: 30}
	sc.UpdateGlow(gl)

	grp, err := sc.CreateGroup("Server Unit", []GroupMember{
		{Type: SelectionNode, ID: n1.ID},
		{Type: SelectionNode, ID: n2.ID},
		{Type: SelectionGlow, ID: gl.ID},
	})
	if err != nil {
		t.Fatalf("CreateGroup failed: %v", err)
	}

	// Duplicate the group
	newItems, newGrpID, err := sc.DuplicateSelection(nil, grp.ID, 8.0, 8.0)
	if err != nil {
		t.Fatalf("DuplicateSelection failed: %v", err)
	}
	if newGrpID == "" || newGrpID == grp.ID {
		t.Fatalf("expected fresh new group ID, got %s", newGrpID)
	}
	if len(newItems) != 3 {
		t.Errorf("expected 3 new items, got %d", len(newItems))
	}

	// Verify new group in scene
	dupGrp, exists := sc.GetGroup(newGrpID)
	if !exists {
		t.Fatalf("duplicated group not found in scene")
	}
	if dupGrp.Name != "Server Unit Copy" {
		t.Errorf("expected name 'Server Unit Copy', got %q", dupGrp.Name)
	}
	if len(dupGrp.Members) != 3 {
		t.Errorf("expected 3 members in duplicated group, got %d", len(dupGrp.Members))
	}

	// Ensure all duplicated members are distinct from originals
	for _, m := range dupGrp.Members {
		switch m.Type {
		case SelectionNode:
			if m.ID == n1.ID || m.ID == n2.ID {
				t.Errorf("duplicated node ID %s should not match original", m.ID)
			}
		case SelectionGlow:
			if m.ID == gl.ID {
				t.Errorf("duplicated glow ID %s should not match original", m.ID)
			}
		}
	}
}

func TestFlowPartialExternalAttachment(t *testing.T) {
	sc := NewScene()

	externalNode := sc.CreateNode(Node{Shape: "rect", X: 80, Y: 80, Width: 80, Height: 40}, nil, false)
	internalNode := sc.CreateNode(Node{Shape: "rect", X: 20, Y: 20, Width: 80, Height: 40}, nil, false)

	fl := Flow{
		ID:         "1",
		FromNodeID: internalNode.ID,
		ToNodeID:   externalNode.ID,
		Nodes: []geometry.Point{
			{X: 20, Y: 20},
			{X: 80, Y: 80},
		},
	}
	sc.UpdateFlow(fl)

	// Copy only internalNode and flow (externalNode is NOT copied)
	items := []SelectionItem{
		{Type: SelectionNode, ID: internalNode.ID},
		{Type: SelectionFlow, ID: fl.ID},
	}

	payload, _ := sc.CopySelection(items, "")
	newItems, _, err := sc.PastePayload(payload, 5.0, 5.0)
	if err != nil {
		t.Fatalf("PastePayload failed: %v", err)
	}

	pastedNodeID := newItems[0].ID
	pastedFlowID := newItems[1].ID

	pfl := sc.flows[pastedFlowID]
	// FromNodeID must be remapped to pastedNodeID
	if pfl.FromNodeID != pastedNodeID {
		t.Errorf("expected FromNodeID to be remapped to %s, got %s", pastedNodeID, pfl.FromNodeID)
	}
	// ToNodeID should retain externalNode.ID since externalNode exists in the same scene
	if pfl.ToNodeID != externalNode.ID {
		t.Errorf("expected ToNodeID to retain external node %s, got %s", externalNode.ID, pfl.ToNodeID)
	}
}
