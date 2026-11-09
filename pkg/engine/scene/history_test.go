package scene

import (
	"fmt"
	"testing"
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
