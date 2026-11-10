package scene

import (
	"testing"
)

func TestLayerOrderAndOperations(t *testing.T) {
	sc := NewScene()

	n1 := sc.CreateNode(Node{Label: "N1"}, nil, false)
	n2 := sc.CreateNode(Node{Label: "N2"}, nil, false)
	f1 := sc.CreateFlow(Flow{Color: "#ff0000"})
	g1 := sc.CreateGlow(Glow{Color: "#00ff00"})
	r1 := sc.CreateRipple(Ripple{Color: "#0000ff"})
	img1, _ := sc.CreateImage(Image{Filename: "test.png"})

	// Canonical default legacy order when initialized:
	// Ripples -> Glows -> Flows -> Images -> Nodes
	layers := sc.GetLayers()
	if len(layers) != 6 {
		t.Fatalf("expected 6 layers, got %d", len(layers))
	}

	// Verify default order
	expectedInitial := []struct {
		typ SelectionType
		id  StringID
	}{
		{SelectionRipple, r1.ID},
		{SelectionGlow, g1.ID},
		{SelectionFlow, f1.ID},
		{SelectionImage, img1.ID},
		{SelectionNode, n1.ID},
		{SelectionNode, n2.ID},
	}
	for i, exp := range expectedInitial {
		if layers[i].Type != exp.typ || layers[i].ID != exp.id {
			t.Errorf("layer[%d] expected %s %s, got %s %s", i, exp.typ, exp.id, layers[i].Type, layers[i].ID)
		}
	}

	// 1. Bring r1 to front (top)
	changed, err := sc.BringToFront([]SelectionItem{{Type: SelectionRipple, ID: r1.ID}})
	if err != nil || !changed {
		t.Fatalf("BringToFront failed: %v", err)
	}
	layers = sc.GetLayers()
	if layers[len(layers)-1].Type != SelectionRipple || layers[len(layers)-1].ID != r1.ID {
		t.Errorf("expected r1 at top, got %+v", layers[len(layers)-1])
	}

	// Calling BringToFront again should be a no-op
	changed, err = sc.BringToFront([]SelectionItem{{Type: SelectionRipple, ID: r1.ID}})
	if err != nil || changed {
		t.Errorf("expected no change when already at front")
	}

	// 2. Send r1 to back (bottom)
	changed, err = sc.SendToBack([]SelectionItem{{Type: SelectionRipple, ID: r1.ID}})
	if err != nil || !changed {
		t.Fatalf("SendToBack failed: %v", err)
	}
	layers = sc.GetLayers()
	if layers[0].Type != SelectionRipple || layers[0].ID != r1.ID {
		t.Errorf("expected r1 at bottom, got %+v", layers[0])
	}

	// 3. Bring Forward r1 by one step
	changed, err = sc.BringForward([]SelectionItem{{Type: SelectionRipple, ID: r1.ID}})
	if err != nil || !changed {
		t.Fatalf("BringForward failed: %v", err)
	}
	layers = sc.GetLayers()
	if layers[1].Type != SelectionRipple || layers[1].ID != r1.ID {
		t.Errorf("expected r1 at index 1, got index 1: %+v", layers[1])
	}

	// 4. Send Backward r1 by one step
	changed, err = sc.SendBackward([]SelectionItem{{Type: SelectionRipple, ID: r1.ID}})
	if err != nil || !changed {
		t.Fatalf("SendBackward failed: %v", err)
	}
	layers = sc.GetLayers()
	if layers[0].Type != SelectionRipple || layers[0].ID != r1.ID {
		t.Errorf("expected r1 back at index 0, got index 0: %+v", layers[0])
	}
}

func TestLayerGroupContiguityAndOrdering(t *testing.T) {
	sc := NewScene()

	n1 := sc.CreateNode(Node{Label: "N1"}, nil, false)
	g1 := sc.CreateGlow(Glow{Color: "#00ff00"})
	img1, _ := sc.CreateImage(Image{Filename: "icon.png"})
	n2 := sc.CreateNode(Node{Label: "N2"}, nil, false)

	// Create group containing g1 and n1 (which are non-contiguous initially)
	grp, err := sc.CreateGroup("Cluster", []GroupMember{
		{Type: SelectionGlow, ID: g1.ID},
		{Type: SelectionNode, ID: n1.ID},
	})
	if err != nil {
		t.Fatalf("CreateGroup failed: %v", err)
	}

	// Verify group members became contiguous in layers
	layers := sc.GetLayers()
	var gIdx, nIdx int = -1, -1
	for i, l := range layers {
		if l.Type == SelectionGlow && l.ID == g1.ID {
			gIdx = i
		}
		if l.Type == SelectionNode && l.ID == n1.ID {
			nIdx = i
		}
	}
	if gIdx == -1 || nIdx == -1 {
		t.Fatalf("group members not found in layers")
	}
	diff := gIdx - nIdx
	if diff != 1 && diff != -1 {
		t.Errorf("expected group members to be adjacent/contiguous, got gIdx=%d, nIdx=%d", gIdx, nIdx)
	}

	// Moving group to back should move all members to back together
	changed, err := sc.SendToBack([]SelectionItem{{Type: SelectionGroup, ID: grp.ID}})
	if err != nil || !changed {
		t.Fatalf("SendToBack group failed: %v", err)
	}
	layers = sc.GetLayers()
	if (layers[0].ID != g1.ID && layers[0].ID != n1.ID) || (layers[1].ID != g1.ID && layers[1].ID != n1.ID) {
		t.Errorf("expected both group members at indices 0 and 1, got %+v and %+v", layers[0], layers[1])
	}
	_ = img1
	_ = n2
}

func TestEffectiveVisibilityAndLocked(t *testing.T) {
	sc := NewScene()

	n1 := sc.CreateNode(Node{Label: "N1"}, nil, false)
	img1, _ := sc.CreateImage(Image{Filename: "logo.png"})

	grp, _ := sc.CreateGroup("Banner", []GroupMember{
		{Type: SelectionNode, ID: n1.ID},
		{Type: SelectionImage, ID: img1.ID},
	})

	// Defaults: visible=true, locked=false
	if !sc.GetEffectiveVisibility(SelectionNode, n1.ID) {
		t.Errorf("expected n1 to be visibly rendered")
	}
	if sc.GetEffectiveLocked(SelectionNode, n1.ID) {
		t.Errorf("expected n1 to be unlocked")
	}

	// Lock the parent group -> n1 and img1 should both have GetEffectiveLocked=true
	err := sc.SetObjectLocked(SelectionGroup, grp.ID, true)
	if err != nil {
		t.Fatalf("SetObjectLocked failed: %v", err)
	}
	if !sc.GetEffectiveLocked(SelectionNode, n1.ID) {
		t.Errorf("expected n1 to be effectively locked via parent group")
	}
	if !sc.GetEffectiveLocked(SelectionImage, img1.ID) {
		t.Errorf("expected img1 to be effectively locked via parent group")
	}

	// Hide parent group -> n1 and img1 should both have GetEffectiveVisibility=false
	err = sc.SetObjectVisibility(SelectionGroup, grp.ID, false)
	if err != nil {
		t.Fatalf("SetObjectVisibility failed: %v", err)
	}
	if sc.GetEffectiveVisibility(SelectionNode, n1.ID) {
		t.Errorf("expected n1 to be effectively hidden via parent group")
	}
	if sc.GetEffectiveVisibility(SelectionImage, img1.ID) {
		t.Errorf("expected img1 to be effectively hidden via parent group")
	}

	// Unhide group, but hide individual image
	_ = sc.SetObjectVisibility(SelectionGroup, grp.ID, true)
	_ = sc.SetObjectVisibility(SelectionImage, img1.ID, false)
	if !sc.GetEffectiveVisibility(SelectionNode, n1.ID) {
		t.Errorf("expected n1 to be visible")
	}
	if sc.GetEffectiveVisibility(SelectionImage, img1.ID) {
		t.Errorf("expected individual img1 to be hidden")
	}
}
