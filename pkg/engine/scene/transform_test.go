package scene

import (
	"math"
	"testing"
)

func TestMoveNodes(t *testing.T) {
	s := NewScene()

	n1 := s.CreateNode(Node{Shape: "rounded", Text: "Node 1", X: 10, Y: 20}, nil, false)
	n2 := s.CreateNode(Node{Shape: "rounded", Text: "Node 2", X: 30, Y: 40}, nil, false)

	// Attach flow to n1
	flow := s.CreateFlow(Flow{FromNodeID: n1.ID})

	updated, err := s.MoveNodes([]StringID{n1.ID, n2.ID}, 5, -10)
	if err != nil {
		t.Fatalf("MoveNodes failed: %v", err)
	}
	if len(updated) != 2 {
		t.Fatalf("expected 2 updated nodes, got %d", len(updated))
	}

	gn1 := s.GetNode(n1.ID)
	gn2 := s.GetNode(n2.ID)
	if math.Abs(gn1.X-15) > 0.001 || math.Abs(gn1.Y-10) > 0.001 {
		t.Fatalf("expected n1 at (15, 10), got (%f, %f)", gn1.X, gn1.Y)
	}
	if math.Abs(gn2.X-35) > 0.001 || math.Abs(gn2.Y-30) > 0.001 {
		t.Fatalf("expected n2 at (35, 30), got (%f, %f)", gn2.X, gn2.Y)
	}

	// Verify connected flow endpoint was updated to n1's new position
	gFlow := s.GetFlow(flow.ID)
	if len(gFlow.Nodes) > 0 {
		if math.Abs(gFlow.Nodes[0].X-15) > 0.001 || math.Abs(gFlow.Nodes[0].Y-10) > 0.001 {
			t.Fatalf("expected flow start endpoint at (15, 10), got (%f, %f)", gFlow.Nodes[0].X, gFlow.Nodes[0].Y)
		}
	}
}

func TestAlignNodes(t *testing.T) {
	s := NewScene()

	// n1 at 20% (width 100px), n2 at 50% (width 200px) on 1000px canvas
	// n1 center = 200px, left = 150px, right = 250px
	// n2 center = 500px, left = 400px, right = 600px
	// collective bounds: left = 150px, right = 600px
	n1 := s.CreateNode(Node{Shape: "rounded", Width: 100, Height: 80, X: 20, Y: 30}, nil, false)
	n2 := s.CreateNode(Node{Shape: "rounded", Width: 200, Height: 120, X: 50, Y: 60}, nil, false)

	// Align Left
	updated, err := s.AlignNodes([]StringID{n1.ID, n2.ID}, "align-left", 1000, 1000)
	if err != nil {
		t.Fatalf("AlignNodes left failed: %v", err)
	}
	if len(updated) != 2 {
		t.Fatalf("expected 2 updated nodes, got %d", len(updated))
	}

	gn1 := s.GetNode(n1.ID)
	gn2 := s.GetNode(n2.ID)
	// minLeft = 150px.
	// n1 center = 150 + 50 = 200px (20%)
	// n2 center = 150 + 100 = 250px (25%)
	if math.Abs(gn1.X-20.0) > 0.01 {
		t.Fatalf("expected gn1.X = 20.0, got %f", gn1.X)
	}
	if math.Abs(gn2.X-25.0) > 0.01 {
		t.Fatalf("expected gn2.X = 25.0, got %f", gn2.X)
	}

	// Reset positions for testing Align Right
	s.UpdateNode(Node{ID: n1.ID, Shape: "rounded", Width: 100, Height: 80, X: 20, Y: 30})
	s.UpdateNode(Node{ID: n2.ID, Shape: "rounded", Width: 200, Height: 120, X: 50, Y: 60})

	// Align Right: maxRight = 600px
	// n1 center = 600 - 50 = 550px (55%)
	// n2 center = 600 - 100 = 500px (50%)
	_, err = s.AlignNodes([]StringID{n1.ID, n2.ID}, "align-right", 1000, 1000)
	if err != nil {
		t.Fatalf("AlignNodes right failed: %v", err)
	}
	gn1 = s.GetNode(n1.ID)
	gn2 = s.GetNode(n2.ID)
	if math.Abs(gn1.X-55.0) > 0.01 {
		t.Fatalf("expected gn1.X = 55.0, got %f", gn1.X)
	}
	if math.Abs(gn2.X-50.0) > 0.01 {
		t.Fatalf("expected gn2.X = 50.0, got %f", gn2.X)
	}
}

func TestDistributeNodes(t *testing.T) {
	s := NewScene()

	// 3 nodes on 1000px canvas with width 100px each
	// n1 at 10% (center 100, L=50, R=150)
	// n2 at 30% (center 300, L=250, R=350)
	// n3 at 70% (center 700, L=650, R=750)
	// Total span = 750 - 50 = 700px
	// Total widths = 300px
	// Gap space = 400px / 2 = 200px gap
	// n1 stays at L=50, center 100 (10%)
	// n2 left = 150 + 200 = 350, center = 350 + 50 = 400 (40%)
	// n3 stays at R=750, center 700 (70%)
	n1 := s.CreateNode(Node{Shape: "rounded", Width: 100, Height: 50, X: 10, Y: 50}, nil, false)
	n2 := s.CreateNode(Node{Shape: "rounded", Width: 100, Height: 50, X: 30, Y: 50}, nil, false)
	n3 := s.CreateNode(Node{Shape: "rounded", Width: 100, Height: 50, X: 70, Y: 50}, nil, false)

	updated, err := s.DistributeNodes([]StringID{n1.ID, n2.ID, n3.ID}, "distribute-horizontal", 1000, 1000)
	if err != nil {
		t.Fatalf("DistributeNodes failed: %v", err)
	}
	if len(updated) != 3 {
		t.Fatalf("expected 3 updated nodes, got %d", len(updated))
	}

	gn2 := s.GetNode(n2.ID)
	if math.Abs(gn2.X-40.0) > 0.01 {
		t.Fatalf("expected gn2 distributed X to be 40.0, got %f", gn2.X)
	}

	// Fewer than 3 nodes should fail
	_, err = s.DistributeNodes([]StringID{n1.ID, n2.ID}, "distribute-horizontal", 1000, 1000)
	if err == nil {
		t.Fatalf("expected error distributing fewer than 3 nodes")
	}
}

func TestBatch4TransformLockEnforcement(t *testing.T) {
	s := NewScene()

	n1 := s.CreateNode(Node{Shape: "rounded", Width: 100, Height: 50, X: 10, Y: 50}, nil, false)
	n2 := s.CreateNode(Node{Shape: "rounded", Width: 100, Height: 50, X: 30, Y: 50}, nil, false)
	n3 := s.CreateNode(Node{Shape: "rounded", Width: 100, Height: 50, X: 70, Y: 50}, nil, false)

	// Lock n2
	if err := s.SetObjectLocked(SelectionNode, n2.ID, true); err != nil {
		t.Fatalf("SetObjectLocked failed: %v", err)
	}

	// 1. MoveNodes should fail because n2 is locked
	if _, err := s.MoveNodes([]StringID{n1.ID, n2.ID}, 5, 5); err == nil {
		t.Fatalf("expected error moving locked node")
	}

	// 2. AlignNodes should fail because n2 is locked
	if _, err := s.AlignNodes([]StringID{n1.ID, n2.ID}, "align-left", 1000, 1000); err == nil {
		t.Fatalf("expected error aligning locked node")
	}

	// 3. DistributeNodes should fail because n2 is locked
	if _, err := s.DistributeNodes([]StringID{n1.ID, n2.ID, n3.ID}, "distribute-horizontal", 1000, 1000); err == nil {
		t.Fatalf("expected error distributing locked node")
	}

	// Unlock n2 but put n1 into a locked group
	_ = s.SetObjectLocked(SelectionNode, n2.ID, false)
	n4 := s.CreateNode(Node{Shape: "rounded", Width: 100, Height: 50, X: 80, Y: 50}, nil, false)
	grp, err := s.CreateGroup("Locked Transform Group", []GroupMember{
		{Type: SelectionNode, ID: n1.ID},
		{Type: SelectionNode, ID: n4.ID},
	})
	if err != nil {
		t.Fatalf("CreateGroup failed: %v", err)
	}
	_ = s.SetObjectLocked(SelectionGroup, grp.ID, true)

	// MoveNodes with n1 should fail because its parent group is locked
	if _, err := s.MoveNodes([]StringID{n1.ID, n2.ID}, 5, 5); err == nil {
		t.Fatalf("expected error moving node in locked group")
	}
}
