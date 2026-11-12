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

func TestClipboardImageDeepCopyAndOffsets(t *testing.T) {
	sc := NewScene()

	img := Image{
		ID:            "image-1",
		Name:          "Hero Photo",
		X:             10.0,
		Y:             20.0,
		Width:         200.0,
		Height:        150.0,
		NaturalWidth:  400.0,
		NaturalHeight: 300.0,
		Crop: &ImageCrop{
			Enabled:      true,
			OrigX:        10.0,
			OrigY:        20.0,
			OrigWidth:    200.0,
			OrigHeight:   150.0,
			SourceX:      20.0,
			SourceY:      30.0,
			SourceWidth:  100.0,
			SourceHeight: 80.0,
		},
		Clip: &ImageClip{
			Enabled: true,
			X:       5.0,
			Y:       5.0,
			Width:   50.0,
			Height:  50.0,
		},
		CropVersions: []CropVersion{
			{
				ID:           "v1",
				Name:         "Version 1",
				OrigX:        10.0,
				OrigY:        20.0,
				X:            20.0,
				Y:            30.0,
				Width:        100.0,
				Height:       80.0,
				SourceX:      20.0,
				SourceY:      30.0,
				SourceWidth:  100.0,
				SourceHeight: 80.0,
			},
		},
		Metadata: map[string]any{
			"customTag": "test-val",
		},
	}

	created, err := sc.CreateImage(img)
	if err != nil {
		t.Fatalf("CreateImage failed: %v", err)
	}

	payload, err := sc.CopySelection([]SelectionItem{{Type: SelectionImage, ID: created.ID}}, "")
	if err != nil {
		t.Fatalf("CopySelection failed: %v", err)
	}
	if len(payload.Images) != 1 {
		t.Fatalf("expected 1 image in payload, got %d", len(payload.Images))
	}

	// Paste with offset (+5, +10)
	newItems, _, err := sc.PastePayload(payload, 5.0, 10.0)
	if err != nil {
		t.Fatalf("PastePayload failed: %v", err)
	}
	if len(newItems) != 1 {
		t.Fatalf("expected 1 pasted item, got %d", len(newItems))
	}

	pastedID := newItems[0].ID
	if pastedID == created.ID {
		t.Errorf("pasted image ID %s should not match original", pastedID)
	}

	pastedImg, exists := sc.GetImage(pastedID)
	if !exists {
		t.Fatalf("pasted image %s not found in scene", pastedID)
	}

	if pastedImg.X != 15.0 || pastedImg.Y != 30.0 {
		t.Errorf("expected pasted coords (15, 30), got (%f, %f)", pastedImg.X, pastedImg.Y)
	}

	// Verify deep copy of Crop and offset OrigX, OrigY
	if pastedImg.Crop == nil {
		t.Fatalf("expected pasted image to have Crop")
	}
	if pastedImg.Crop == created.Crop {
		t.Errorf("Crop reference was not deep-copied")
	}
	if pastedImg.Crop.OrigX != 15.0 || pastedImg.Crop.OrigY != 30.0 {
		t.Errorf("expected Crop OrigX=15, OrigY=30, got (%f, %f)", pastedImg.Crop.OrigX, pastedImg.Crop.OrigY)
	}

	// Verify deep copy of Clip
	if pastedImg.Clip == nil {
		t.Fatalf("expected pasted image to have Clip")
	}
	if pastedImg.Clip == created.Clip {
		t.Errorf("Clip reference was not deep-copied")
	}
	if pastedImg.Clip.Width != 50.0 || pastedImg.Clip.Height != 50.0 {
		t.Errorf("expected Clip dims 50x50, got %fx%f", pastedImg.Clip.Width, pastedImg.Clip.Height)
	}

	// Verify CropVersions deep copy and offset
	if len(pastedImg.CropVersions) != 1 {
		t.Fatalf("expected 1 CropVersion, got %d", len(pastedImg.CropVersions))
	}
	if pastedImg.CropVersions[0].OrigX != 15.0 || pastedImg.CropVersions[0].OrigY != 30.0 {
		t.Errorf("expected CropVersion OrigX=15, OrigY=30, got (%f, %f)", pastedImg.CropVersions[0].OrigX, pastedImg.CropVersions[0].OrigY)
	}
	if pastedImg.CropVersions[0].X != 25.0 || pastedImg.CropVersions[0].Y != 40.0 {
		t.Errorf("expected CropVersion X=25, Y=40, got (%f, %f)", pastedImg.CropVersions[0].X, pastedImg.CropVersions[0].Y)
	}

	// Verify Metadata deep copy
	if pastedImg.Metadata == nil || pastedImg.Metadata["customTag"] != "test-val" {
		t.Errorf("expected Metadata['customTag'] == 'test-val'")
	}
	// Mutating pasted metadata should not affect original
	pastedImg.Metadata["customTag"] = "modified"
	origImg, _ := sc.GetImage(created.ID)
	if origImg.Metadata["customTag"] != "test-val" {
		t.Errorf("original metadata was mutated: got %v", origImg.Metadata["customTag"])
	}
}
