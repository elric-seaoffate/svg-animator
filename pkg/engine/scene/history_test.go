package scene

import (
	"fmt"
	"testing"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
)

func TestHistoryManagerDirect(t *testing.T) {
	h := NewHistoryManager(5)

	snap0 := Snapshot{Revision: 0}
	sel0 := SelectionState{Type: SelectionNone}
	snap1 := Snapshot{Revision: 1, Nodes: []Node{{ID: "1", Text: "A"}}}
	sel1 := SelectionState{Type: SelectionNode, ID: "1"}
	snap2 := Snapshot{Revision: 2, Nodes: []Node{{ID: "1", Text: "B"}}}
	sel2 := SelectionState{Type: SelectionNode, ID: "1"}

	// Initial record
	if !h.Record(snap0, sel0) {
		t.Fatalf("expected Record to return true for snap0")
	}
	// Duplicate record should be discarded
	if h.Record(snap0, sel0) {
		t.Errorf("expected duplicate record to return false")
	}

	h.Record(snap1, sel1)
	h.Record(snap2, sel2)

	uLen, rLen, canUndo, canRedo := h.GetState()
	if uLen != 3 || rLen != 0 || !canUndo || canRedo {
		t.Errorf("unexpected state: uLen=%d rLen=%d canUndo=%v canRedo=%v", uLen, rLen, canUndo, canRedo)
	}

	// Undo to snap1
	restored, err := h.Undo(snap2, sel2)
	if err != nil {
		t.Fatalf("unexpected undo error: %v", err)
	}
	if restored.Snapshot.Revision != 1 || restored.Selection.ID != "1" {
		t.Errorf("expected restored snap1, got rev %d", restored.Snapshot.Revision)
	}
	if !h.CanRedo() {
		t.Errorf("expected canRedo=true after undo")
	}

	// Redo to snap2
	redoRestored, err := h.Redo()
	if err != nil {
		t.Fatalf("unexpected redo error: %v", err)
	}
	if redoRestored.Snapshot.Revision != 2 {
		t.Errorf("expected redone snap2, got rev %d", redoRestored.Snapshot.Revision)
	}

	// Test max depth trimming
	for i := 3; i < 20; i++ {
		h.Record(Snapshot{Revision: int64(i)}, SelectionState{Type: SelectionNone})
	}
	if uCount, _, _, _ := h.GetState(); uCount > 5 {
		t.Errorf("expected max depth 5, got %d", uCount)
	}
}

func TestSceneHistoryAndObjectRenaming(t *testing.T) {
	s := NewScene()

	// Initial state in history
	s.RecordHistory()

	// Create node and record
	node := s.CreateNode(Node{Shape: "rounded", Text: "Diagram Label"}, nil, false)
	_, _ = s.SetSelection(SelectionNode, node.ID)
	s.RecordHistory()

	// 1. Rename node
	ok, err := s.RenameObject(SelectionNode, node.ID, "Primary Pump")
	if !ok || err != nil {
		t.Fatalf("failed to rename node: %v", err)
	}
	n := s.GetNode(node.ID)
	if n.Name != "Primary Pump" {
		t.Errorf("expected name 'Primary Pump', got %q", n.Name)
	}
	if n.Text != "Diagram Label" {
		t.Errorf("diagram text must remain unaffected by object rename, got %q", n.Text)
	}
	s.RecordHistory()

	// 2. Rename flow
	flow := s.CreateFlow(Flow{FromNodeID: node.ID, Label: "Midpoint Badge"})
	_, _ = s.SetSelection(SelectionFlow, flow.ID)
	s.RecordHistory()

	ok, err = s.RenameObject(SelectionFlow, flow.ID, "Cooling Water Line")
	if !ok || err != nil {
		t.Fatalf("failed to rename flow: %v", err)
	}
	fl := s.GetFlow(flow.ID)
	if fl.Name != "Cooling Water Line" {
		t.Errorf("expected flow name 'Cooling Water Line', got %q", fl.Name)
	}
	if fl.Label != "Midpoint Badge" {
		t.Errorf("flow midpoint badge label must remain unaffected, got %q", fl.Label)
	}
	s.RecordHistory()

	// 3. Rename glow and ripple
	glow := s.CreateGlow(Glow{Shape: "radar"})
	ok, err = s.RenameObject(SelectionGlow, glow.ID, "Critical Alarm")
	if !ok || err != nil || s.GetGlow(glow.ID).Name != "Critical Alarm" {
		t.Errorf("failed to rename glow: %v", err)
	}

	rip := s.CreateRipple(Ripple{Rings: 3})
	ok, err = s.RenameObject(SelectionRipple, rip.ID, "Vibration Wave")
	if !ok || err != nil || s.GetRipple(rip.ID).Name != "Vibration Wave" {
		t.Errorf("failed to rename ripple: %v", err)
	}

	// 4. Test Unicode and punctuation in object names
	unicodeName := "Станция #4 / 🚀 Sub-System (High Priority)"
	ok, err = s.RenameObject(SelectionNode, node.ID, unicodeName)
	if !ok || err != nil || s.GetNode(node.ID).Name != unicodeName {
		t.Errorf("failed to apply Unicode name: %v", err)
	}
	s.RecordHistory()

	// 5. Test undo of rename
	restored, err := s.UndoHistory()
	if err != nil {
		t.Fatalf("undo failed: %v", err)
	}
	_ = restored
	nodeAfterUndo := s.GetNode(node.ID)
	if nodeAfterUndo.Name == unicodeName {
		t.Errorf("expected name to be reverted from unicodeName after undo, got %q", nodeAfterUndo.Name)
	}

	// 6. Test redo of rename
	redoEntry, err := s.RedoHistory()
	if err != nil {
		t.Fatalf("redo failed: %v", err)
	}
	_ = redoEntry
	nodeAfterRedo := s.GetNode(node.ID)
	if nodeAfterRedo.Name != unicodeName {
		t.Errorf("expected name restored to %q after redo, got %q", unicodeName, nodeAfterRedo.Name)
	}

	// 7. Clear name by setting empty string
	ok, err = s.RenameObject(SelectionNode, node.ID, "")
	if !ok || err != nil || s.GetNode(node.ID).Name != "" {
		t.Errorf("failed to clear name: %v", err)
	}
}

func TestHistoryDepthFifty(t *testing.T) {
	s := NewScene()
	for i := 0; i < 70; i++ {
		s.CreateNode(Node{Shape: "rounded", Text: fmt.Sprintf("Node %d", i)}, nil, false)
		s.RecordHistory()
	}
	uCount, _, _, _ := s.History().GetState()
	if uCount != 50 {
		t.Errorf("expected exactly 50 history entries, got %d", uCount)
	}
}

func TestBatch3_DeepSnapshotIsolation(t *testing.T) {
	s := NewScene()

	// 1. Create a node with metadata and waypoints flow
	node := s.CreateNode(Node{Shape: "rounded", Text: "Original Text", Metadata: map[string]any{"key": "val1"}}, nil, false)
	flow := s.CreateFlow(Flow{
		Nodes: []geometry.Point{{X: 10, Y: 20}, {X: 30, Y: 40}},
	})
	img, err := s.CreateImage(Image{
		Filename: "diagram.png",
		Crop:     &ImageCrop{Enabled: true, SourceX: 10, SourceY: 10, SourceWidth: 100, SourceHeight: 100},
	})
	if err != nil {
		t.Fatalf("CreateImage failed: %v", err)
	}
	s.RecordHistory() // Baseline state with original values

	// 2. Mutate live objects
	node.Text = "Mutated Live Text"
	node.Metadata["key"] = "mutated"
	s.UpdateNode(node)

	flow.Nodes = []geometry.Point{{X: 99, Y: 99}}
	s.UpdateFlow(flow)

	img.Crop = &ImageCrop{Enabled: true, SourceX: 50, SourceY: 50, SourceWidth: 200, SourceHeight: 200}
	s.UpdateImage(img.ID, img)
	s.RecordHistory() // Second state with mutated values

	// Undo back to step 1
	restored, err := s.UndoHistory()
	if err != nil {
		t.Fatalf("Undo failed: %v", err)
	}
	if len(restored.Snapshot.Nodes) == 0 || restored.Snapshot.Nodes[0].Text != "Original Text" {
		t.Errorf("expected Original Text, got %+v", restored.Snapshot.Nodes)
	}
	if restored.Snapshot.Nodes[0].Metadata["key"] != "val1" {
		t.Errorf("expected val1, got %v", restored.Snapshot.Nodes[0].Metadata["key"])
	}
	if len(restored.Snapshot.Flows) == 0 || len(restored.Snapshot.Flows[0].Nodes) == 0 || restored.Snapshot.Flows[0].Nodes[0].X != 10 {
		t.Errorf("expected flow point X=10, got %+v", restored.Snapshot.Flows)
	}
	if len(restored.Snapshot.Images) == 0 || restored.Snapshot.Images[0].Crop.SourceX != 10 {
		t.Errorf("expected image crop SourceX=10, got %+v", restored.Snapshot.Images)
	}

	// Redo and verify the mutated state was preserved in redo stack
	redoEntry, err := s.RedoHistory()
	if err != nil {
		t.Fatalf("Redo failed: %v", err)
	}
	if len(redoEntry.Snapshot.Nodes) == 0 || redoEntry.Snapshot.Nodes[0].Text != "Mutated Live Text" {
		t.Errorf("expected Mutated Live Text in redo, got %+v", redoEntry.Snapshot.Nodes)
	}
	if len(redoEntry.Snapshot.Flows) == 0 || len(redoEntry.Snapshot.Flows[0].Nodes) == 0 || redoEntry.Snapshot.Flows[0].Nodes[0].X != 99 {
		t.Errorf("expected flow point X=99 in redo, got %+v", redoEntry.Snapshot.Flows)
	}
}

func TestBatch3_SelectionRestoration(t *testing.T) {
	s := NewScene()
	s.RecordHistory()

	n1 := s.CreateNode(Node{Shape: "rounded", Text: "N1"}, nil, false)
	n2 := s.CreateNode(Node{Shape: "circle", Text: "N2"}, nil, false)
	img, err := s.CreateImage(Image{Filename: "photo.png"})
	if err != nil {
		t.Fatalf("CreateImage failed: %v", err)
	}

	// Step 1: select node 1
	_, _ = s.SetSelection(SelectionNode, n1.ID)
	s.RecordHistory()

	// Step 2: multi-select node 1 and node 2
	items := []SelectionItem{
		{Type: SelectionNode, ID: n1.ID},
		{Type: SelectionNode, ID: n2.ID},
	}
	_, _ = s.SetMultiSelection(items, &items[0])
	s.RecordHistory()

	// Step 3: select image
	_, _ = s.SetSelection(SelectionImage, img.ID)
	s.RecordHistory()

	// Undo to Step 2 (multi-selection)
	_, err = s.UndoHistory()
	if err != nil {
		t.Fatalf("Undo failed: %v", err)
	}
	sel := s.GetSelection()
	if len(sel.Items) != 2 || sel.ID != n1.ID {
		t.Errorf("expected multi-selection with 2 items, primary %s, got: %+v", n1.ID, sel)
	}

	// Undo to Step 1 (single node selection)
	_, err = s.UndoHistory()
	if err != nil {
		t.Fatalf("Undo failed: %v", err)
	}
	sel = s.GetSelection()
	if sel.Type != SelectionNode || sel.ID != n1.ID || len(sel.Items) != 1 {
		t.Errorf("expected single selection of %s, got: %+v", n1.ID, sel)
	}

	// Redo to Step 2
	_, err = s.RedoHistory()
	if err != nil {
		t.Fatalf("Redo failed: %v", err)
	}
	sel = s.GetSelection()
	if len(sel.Items) != 2 {
		t.Errorf("expected multi-selection on redo, got: %+v", sel)
	}

	// Redo to Step 3 (image selection)
	_, err = s.RedoHistory()
	if err != nil {
		t.Fatalf("Redo failed: %v", err)
	}
	sel = s.GetSelection()
	if sel.Type != SelectionImage || sel.ID != img.ID {
		t.Errorf("expected image selection on redo, got: %+v", sel)
	}

	// Delete image and verify restoration handles deleted object gracefully
	s.DeleteImage(img.ID)
	s.restoreSelectionLocked(SelectionState{Type: SelectionImage, ID: img.ID})
	sel = s.GetSelection()
	if sel.Type != SelectionNone || sel.ID != "" {
		t.Errorf("expected selection cleared when target deleted, got: %+v", sel)
	}
}

func TestBatch3_SceneReset(t *testing.T) {
	s := NewScene()
	n := s.CreateNode(Node{Shape: "rounded", Text: "Hello"}, nil, false)
	s.CreateFlow(Flow{FromNodeID: n.ID})
	s.CreateGlow(Glow{Shape: "radar"})
	s.CreateRipple(Ripple{Rings: 3})
	_, _ = s.CreateImage(Image{Filename: "diagram.png"})
	s.UpdateCamera(CameraConfig{Motion: "ken-burns", Duration: 5.0})
	s.UpdateOptical(OpticalConfig{Type: "focus-pull", FocusDur: 3.0})
	s.UpdateFrame(FrameConfig{Enabled: true, Style: "rounded"})
	s.SetBackground(&BackgroundConfig{Filename: "bg.jpg", SourceWidth: 800, SourceHeight: 600})
	_, _ = s.SetSelection(SelectionNode, n.ID)
	s.RecordHistory()

	// Reset scene
	s.Reset()

	snap := s.GetSnapshot()
	if snap.Canvas.Width != 1280 || snap.Canvas.Height != 720 {
		t.Errorf("expected canvas 1280x720, got %vx%v", snap.Canvas.Width, snap.Canvas.Height)
	}
	if len(snap.Nodes) != 0 || len(snap.Flows) != 0 || len(snap.Glows) != 0 || len(snap.Ripples) != 0 || len(snap.Images) != 0 || len(snap.Groups) != 0 || len(snap.Layers) != 0 {
		t.Errorf("expected all objects cleared, got %+v", snap)
	}
	if snap.Background != nil {
		t.Errorf("expected nil background, got %+v", snap.Background)
	}
	if snap.Frame.Enabled {
		t.Errorf("expected frame disabled, got %+v", snap.Frame)
	}
	sel := s.GetSelection()
	if sel.Type != SelectionNone || sel.ID != "" {
		t.Errorf("expected selection none, got %+v", sel)
	}
	uCount, rCount, canUndo, canRedo := s.History().GetState()
	if uCount != 1 || rCount != 0 || canUndo || canRedo {
		t.Errorf("expected 1 baseline history entry with undo/redo disabled, got uCount=%d rCount=%d canUndo=%v canRedo=%v", uCount, rCount, canUndo, canRedo)
	}
}

func TestBatch3_EmptyGroupsAndDisabledFrameSnapshotRoundtrip(t *testing.T) {
	s := NewScene()
	// Explicitly empty groups and disabled frame
	snap := Snapshot{
		Canvas:  CanvasConfig{Width: 1000, Height: 700},
		Groups:  []Group{},
		Images:  []Image{},
		Frame:   FrameConfig{Enabled: false, Style: "none"},
		Optical: OpticalConfig{Type: "none"},
	}
	s.SetFromSnapshot(snap)

	outSnap := s.GetSnapshot()
	if len(outSnap.Groups) != 0 || outSnap.Groups == nil {
		if outSnap.Groups == nil {
			t.Errorf("expected non-nil empty slice for Groups, got nil")
		}
	}
	if outSnap.Frame.Enabled {
		t.Errorf("expected frame disabled in snapshot")
	}
}
