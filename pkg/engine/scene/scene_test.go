package scene

import (
	"encoding/json"
	"sync"
	"testing"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
)

func TestNewSceneDefaults(t *testing.T) {
	s := NewScene()
	if s.Revision() != 1 {
		t.Errorf("expected initial revision 1, got %d", s.Revision())
	}
	if s.Canvas().Width != 1280 || s.Canvas().Height != 720 {
		t.Errorf("expected 1280x720 canvas, got %vx%v", s.Canvas().Width, s.Canvas().Height)
	}
}

func TestFlowCRUDAndRevision(t *testing.T) {
	s := NewScene()
	initialRev := s.Revision()

	flow := Flow{
		ID:        "flow-1",
		Nodes:     []geometry.Point{{X: 10, Y: 10}, {X: 80, Y: 80}},
		Curvature: 20,
		Speed:     2.5,
		Color:     "#38bdf8",
		Scale:     1.0,
		ShowLine:  true,
	}

	s.UpdateFlow(flow)
	if s.Revision() <= initialRev {
		t.Errorf("expected revision increment after UpdateFlow, got %d", s.Revision())
	}

	snap := s.GetSnapshot()
	if len(snap.Flows) != 1 || snap.Flows[0].ID != "flow-1" {
		t.Fatalf("expected 1 flow with ID flow-1, got %v", snap.Flows)
	}

	// Update existing flow
	flow.Speed = 3.0
	s.UpdateFlow(flow)
	snap2 := s.GetSnapshot()
	if len(snap2.Flows) != 1 || snap2.Flows[0].Speed != 3.0 {
		t.Errorf("expected updated speed 3.0, got %v", snap2.Flows[0].Speed)
	}

	// Remove flow
	ok := s.RemoveFlow("flow-1")
	if !ok {
		t.Errorf("expected RemoveFlow to return true")
	}
	snap3 := s.GetSnapshot()
	if len(snap3.Flows) != 0 {
		t.Errorf("expected 0 flows, got %d", len(snap3.Flows))
	}
}

func TestSnapshotRoundtrip(t *testing.T) {
	s := NewScene()
	s.UpdateGlow(Glow{ID: "glow-1", Size: 30, Color: "#f59e0b", Duration: 2.0})
	s.UpdateRipple(Ripple{ID: "rip-1", InnerR: 10, OuterR: 80, Duration: 3.0})

	snap := s.GetSnapshot()

	s2 := NewScene()
	s2.SetFromSnapshot(snap)

	snap2 := s2.GetSnapshot()
	if len(snap2.Glows) != 1 || snap2.Glows[0].ID != "glow-1" {
		t.Errorf("mismatch in glow roundtrip: %v", snap2.Glows)
	}
	if len(snap2.Ripples) != 1 || snap2.Ripples[0].ID != "rip-1" {
		t.Errorf("mismatch in ripple roundtrip: %v", snap2.Ripples)
	}
	if snap2.Revision != snap.Revision {
		t.Errorf("expected revision %d, got %d", snap.Revision, snap2.Revision)
	}
}

func TestConcurrentSceneAccess(t *testing.T) {
	s := NewScene()
	var wg sync.WaitGroup

	for i := 0; i < 50; i++ {
		wg.Add(2)
		go func(idx int) {
			defer wg.Done()
			s.UpdateFlow(Flow{ID: "flow-concur", Speed: float64(idx)})
			_ = s.GetSnapshot()
		}(i)

		go func() {
			defer wg.Done()
			_ = s.Revision()
			_ = s.Canvas()
		}()
	}

	wg.Wait()
	if s.Revision() <= 1 {
		t.Errorf("expected revision > 1, got %d", s.Revision())
	}
}

func TestNumericAndMixedIDDecoding(t *testing.T) {
	// Tests that numeric IDs (as produced by legacy JS counters) unmarshal cleanly into StringID
	rawJSON := `{
		"revision": 5,
		"canvas": {"width": 1000, "height": 1000, "duration": 7.0, "loop": "once"},
		"camera": {"motion": "static"},
		"nodes": [{"id": 1, "shape": "rounded", "text": "Node 1", "x": 10, "y": 20}],
		"flows": [{"id": 2, "fromNodeId": 1, "toNodeId": "node-target", "nodes": [{"x": 0, "y": 0}, {"x": 50, "y": 50}], "speed": 3}],
		"glows": [{"id": 3, "shape": "radar", "rings": 3, "x": 30, "y": 30}],
		"ripples": [{"id": 4, "innerR": 5, "outerR": 80, "x": 40, "y": 40}]
	}`

	var snap Snapshot
	if err := json.Unmarshal([]byte(rawJSON), &snap); err != nil {
		t.Fatalf("failed to unmarshal JSON with numeric IDs: %v", err)
	}

	if snap.Nodes[0].ID != "1" {
		t.Errorf("expected node ID '1', got %q", snap.Nodes[0].ID)
	}
	if snap.Flows[0].ID != "2" {
		t.Errorf("expected flow ID '2', got %q", snap.Flows[0].ID)
	}
	if snap.Flows[0].FromNodeID != "1" {
		t.Errorf("expected fromNodeId '1', got %q", snap.Flows[0].FromNodeID)
	}
	if snap.Flows[0].ToNodeID != "node-target" {
		t.Errorf("expected toNodeId 'node-target', got %q", snap.Flows[0].ToNodeID)
	}
	if snap.Glows[0].ID != "3" {
		t.Errorf("expected glow ID '3', got %q", snap.Glows[0].ID)
	}
	if snap.Ripples[0].ID != "4" {
		t.Errorf("expected ripple ID '4', got %q", snap.Ripples[0].ID)
	}

	// Verify scene methods with unmarshaled snapshot
	s := NewScene()
	s.SetFromSnapshot(snap)
	if s.Revision() != 5 {
		t.Errorf("expected revision 5, got %d", s.Revision())
	}
	snapExport := s.GetSnapshot()
	if snapExport.Nodes[0].ID != "1" || snapExport.Flows[0].ID != "2" {
		t.Errorf("snapshot export failed: %+v", snapExport)
	}
}

func TestNodeCRUDAndHitTesting(t *testing.T) {
	s := NewScene()

	// 1. Create Node without preset
	node1 := s.CreateNode(Node{
		Shape: "pill",
		Text:  "Database Service",
		X:     25,
		Y:     30,
		Width: 200,
	}, nil, false)

	if node1.ID != "1" {
		t.Errorf("Expected node ID '1', got %q", node1.ID)
	}
	if node1.Shape != "pill" {
		t.Errorf("Expected shape 'pill', got %q", node1.Shape)
	}
	if node1.Width != 200 {
		t.Errorf("Expected width 200, got %v", node1.Width)
	}

	// 2. Create Node with preset auto-applied
	preset := DefaultPreset()
	preset.Preset["strokeColor"] = PresetParam{Enabled: true, Value: "#f43f5e"}
	preset.Preset["fontSize"] = PresetParam{Enabled: true, Value: float64(22)}

	node2 := s.CreateNode(Node{
		Shape: "hexagon",
		Text:  "Hexagon Node",
		X:     70,
		Y:     65,
	}, &preset, false)

	if node2.ID != "2" {
		t.Errorf("Expected node ID '2', got %q", node2.ID)
	}
	if node2.StrokeColor != "#f43f5e" {
		t.Errorf("Expected strokeColor '#f43f5e' from preset, got %q", node2.StrokeColor)
	}
	if node2.FontSize != 22 {
		t.Errorf("Expected fontSize 22 from preset, got %v", node2.FontSize)
	}

	// 3. GetNode and GetAllNodes
	retrieved := s.GetNode("1")
	if retrieved == nil || retrieved.Text != "Database Service" {
		t.Fatalf("Failed to retrieve node 1: %+v", retrieved)
	}
	all := s.GetAllNodes()
	if len(all) != 2 {
		t.Fatalf("Expected 2 nodes, got %d", len(all))
	}

	// 4. Hit testing with FindNodeAt
	// Node 1 is at 25%, 30% on 1280x720 canvas
	found1 := s.FindNodeAt(25, 30, 1280, 720)
	if found1 == nil || found1.ID != "1" {
		t.Errorf("Hit-test failed at (25%%, 30%%): expected node 1, got %+v", found1)
	}
	// Miss target
	miss := s.FindNodeAt(95, 95, 1280, 720)
	if miss != nil {
		t.Errorf("Expected nil on hit miss, got %+v", miss)
	}

	// 5. Remove Node
	removed := s.RemoveNode("1")
	if !removed {
		t.Errorf("Expected RemoveNode to succeed")
	}
	if s.GetNode("1") != nil {
		t.Errorf("Node 1 should be nil after removal")
	}
	if len(s.GetAllNodes()) != 1 {
		t.Errorf("Expected 1 node remaining, got %d", len(s.GetAllNodes()))
	}
}
