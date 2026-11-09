package scene

import (
	"testing"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
)

func TestFlowLifecycleAndWaypoints(t *testing.T) {
	s := NewScene()

	// 1. Create flow with defaults
	f1 := s.CreateFlow(Flow{
		Color: "#00ffcc",
	})
	if f1.ID != "1" {
		t.Fatalf("expected flow ID '1', got %q", f1.ID)
	}
	if len(f1.Nodes) != 2 {
		t.Fatalf("expected 2 default waypoints, got %d", len(f1.Nodes))
	}
	if f1.Type != "orb" {
		t.Errorf("expected type 'orb', got %q", f1.Type)
	}
	if f1.RouteMode != "curve" {
		t.Errorf("expected routeMode 'curve', got %q", f1.RouteMode)
	}

	// 2. Add waypoint
	f1AfterAdd, idx, ok := s.AddWaypoint(f1.ID, nil, nil)
	if !ok || idx != 2 {
		t.Fatalf("AddWaypoint failed: ok=%v, idx=%d", ok, idx)
	}
	if len(f1AfterAdd.Nodes) != 3 {
		t.Fatalf("expected 3 waypoints, got %d", len(f1AfterAdd.Nodes))
	}

	// 3. Update waypoint
	f1AfterUpd, upOk := s.UpdateWaypoint(f1.ID, 2, 55, 65)
	if !upOk || f1AfterUpd.Nodes[2].X != 55 || f1AfterUpd.Nodes[2].Y != 65 {
		t.Fatalf("UpdateWaypoint failed: ok=%v, node=%+v", upOk, f1AfterUpd.Nodes[2])
	}

	// 4. Remove waypoint
	f1AfterRem, newIdx, remOk := s.RemoveWaypoint(f1.ID, 2)
	if !remOk || newIdx != 1 || len(f1AfterRem.Nodes) != 2 {
		t.Fatalf("RemoveWaypoint failed: ok=%v, newIdx=%d, len=%d", remOk, newIdx, len(f1AfterRem.Nodes))
	}

	// 5. Try removing below minimum (2 waypoints)
	_, _, failOk := s.RemoveWaypoint(f1.ID, 0)
	if failOk {
		t.Fatalf("RemoveWaypoint should reject reducing below 2 waypoints")
	}

	// 6. Delete flow
	delOk := s.RemoveFlow(f1.ID)
	if !delOk {
		t.Fatalf("RemoveFlow failed")
	}
	if s.GetFlow(f1.ID) != nil {
		t.Fatalf("expected flow to be deleted")
	}
}

func TestFlowHitTestingAndBounds(t *testing.T) {
	s := NewScene()

	f := s.CreateFlow(Flow{
		Nodes:     []geometry.Point{{X: 10, Y: 50}, {X: 90, Y: 50}},
		LineWidth: 4,
	})

	// Exact hit on center line (50%, 50%)
	hit := s.FindFlowAt(50, 50, 1000, 1000)
	if hit == nil || hit.ID != f.ID {
		t.Fatalf("expected hit on flow %s, got %+v", f.ID, hit)
	}

	// Near miss: within tolerance (e.g. 50%, 50.8% = 8px away on 1000px canvas)
	nearHit := s.FindFlowAt(50, 50.8, 1000, 1000)
	if nearHit == nil || nearHit.ID != f.ID {
		t.Fatalf("expected near hit on flow %s, got %+v", f.ID, nearHit)
	}

	// Far away (50%, 80%) -> miss
	miss := s.FindFlowAt(50, 80, 1000, 1000)
	if miss != nil {
		t.Fatalf("expected miss, got %+v", miss)
	}

	// Flow bounds
	bounds, mid := s.GetFlowBounds(f, 1000, 1000)
	if bounds.MinX != 100 || bounds.MaxX != 900 || bounds.MinY != 500 || bounds.MaxY != 500 {
		t.Errorf("unexpected bounds: %+v", bounds)
	}
	if mid.X != 500 || mid.Y != 500 {
		t.Errorf("unexpected midpoint: %+v", mid)
	}
}

func TestFlowToNodeConnections(t *testing.T) {
	s := NewScene()

	n1 := s.CreateNode(Node{Shape: "rect", X: 20, Y: 30, Width: 100, Height: 50}, nil, false)
	n2 := s.CreateNode(Node{Shape: "cylinder", X: 80, Y: 70, Width: 120, Height: 60}, nil, false)

	// Create flow attached to nodes
	flow := s.CreateFlow(Flow{
		FromNodeID: n1.ID,
		ToNodeID:   n2.ID,
	})

	if flow.Nodes[0].X != 20 || flow.Nodes[0].Y != 30 {
		t.Errorf("expected flow start connected to n1 (20, 30), got %+v", flow.Nodes[0])
	}
	if flow.Nodes[1].X != 80 || flow.Nodes[1].Y != 70 {
		t.Errorf("expected flow end connected to n2 (80, 70), got %+v", flow.Nodes[1])
	}

	// Move n1 to (25, 35) -> attached flow must update automatically
	n1.X = 25
	n1.Y = 35
	s.UpdateNode(n1)

	updatedFlow := s.GetFlow(flow.ID)
	if updatedFlow.Nodes[0].X != 25 || updatedFlow.Nodes[0].Y != 35 {
		t.Errorf("expected flow start to move to (25, 35), got %+v", updatedFlow.Nodes[0])
	}

	// Detach end node
	s.DetachFlowFromNode(flow.ID, true)
	detachedFlow := s.GetFlow(flow.ID)
	if detachedFlow.ToNodeID != "" {
		t.Errorf("expected ToNodeID to be cleared, got %q", detachedFlow.ToNodeID)
	}
	if detachedFlow.Nodes[1].X != 80 || detachedFlow.Nodes[1].Y != 70 {
		t.Errorf("coordinates should remain intact after detach, got %+v", detachedFlow.Nodes[1])
	}

	// Delete n1 -> flow start must be detached, preserving waypoint coordinates
	s.RemoveNode(n1.ID)
	afterNodeDel := s.GetFlow(flow.ID)
	if afterNodeDel.FromNodeID != "" {
		t.Errorf("expected FromNodeID to be detached on node delete, got %q", afterNodeDel.FromNodeID)
	}
	if afterNodeDel.Nodes[0].X != 25 || afterNodeDel.Nodes[0].Y != 35 {
		t.Errorf("start coordinates must be preserved after node delete, got %+v", afterNodeDel.Nodes[0])
	}
}
