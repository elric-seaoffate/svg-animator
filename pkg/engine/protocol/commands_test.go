package protocol

import (
	"encoding/json"
	"testing"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/scene"
	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/timeline"
)

func TestDispatchPing(t *testing.T) {
	respBytes, err := Dispatch("Engine.Ping", nil)
	if err != nil {
		t.Fatalf("dispatch ping failed: %v", err)
	}
	var info EngineInfo
	if err := json.Unmarshal(respBytes, &info); err != nil {
		t.Fatalf("unmarshal info failed: %v", err)
	}
	if info.Version != ProtocolVersion || info.Status != "ready" {
		t.Errorf("unexpected ping response: %+v", info)
	}
}

func TestDispatchGenerateFlowPath(t *testing.T) {
	req := GenerateFlowPathRequest{
		Nodes:     []geometry.Point{{X: 10, Y: 20}, {X: 90, Y: 80}},
		Curvature: 0,
		Width:     800,
		Height:    600,
		RouteMode: "curve",
	}
	reqBytes, _ := json.Marshal(req)
	respBytes, err := Dispatch("Geometry.GenerateFlowPath", reqBytes)
	if err != nil {
		t.Fatalf("dispatch flowpath failed: %v", err)
	}
	var resp GenerateFlowPathResponse
	if err := json.Unmarshal(respBytes, &resp); err != nil {
		t.Fatalf("unmarshal response failed: %v", err)
	}
	expected := "M 80,120 L 720,480"
	if resp.Path != expected {
		t.Errorf("expected %q, got %q", expected, resp.Path)
	}
}

func TestDispatchComputeSnappedPosition(t *testing.T) {
	req := ComputeSnappedPositionRequest{
		XPct: 24.3,
		YPct: 51.2,
		SnapConfig: geometry.SnapConfig{
			Enabled:      true,
			GridSizePx:   20,
			CanvasWidth:  1000,
			CanvasHeight: 1000,
		},
	}
	reqBytes, _ := json.Marshal(req)
	respBytes, err := Dispatch("Geometry.ComputeSnappedPosition", reqBytes)
	if err != nil {
		t.Fatalf("dispatch snap failed: %v", err)
	}
	var resp ComputeSnappedPositionResponse
	if err := json.Unmarshal(respBytes, &resp); err != nil {
		t.Fatalf("unmarshal response failed: %v", err)
	}
	if resp.Point.X != 24.0 || resp.Point.Y != 52.0 {
		t.Errorf("expected (24.0, 52.0), got (%v, %v)", resp.Point.X, resp.Point.Y)
	}
}

func TestDispatchSceneAndTimelineEvaluation(t *testing.T) {
	snap := scene.Snapshot{
		Revision: 10,
		Canvas: scene.CanvasConfig{
			Width:        1000,
			Height:       1000,
			Duration:     8.0,
			PlaybackMode: "loop",
		},
		Flows: []scene.Flow{
			{
				ID:        "flow-proto-1",
				Nodes:     []geometry.Point{{X: 0, Y: 0}, {X: 100, Y: 100}},
				Curvature: 0,
				RouteMode: "direct",
				Speed:     4.0,
				Opacity:   1.0,
			},
		},
	}
	snapBytes, _ := json.Marshal(snap)

	// 1. Scene.SetState
	setResp, err := Dispatch("Scene.SetState", snapBytes)
	if err != nil {
		t.Fatalf("Scene.SetState failed: %v", err)
	}
	var setInfo SetSceneStateResponse
	if err := json.Unmarshal(setResp, &setInfo); err != nil {
		t.Fatalf("unmarshal SetSceneStateResponse failed: %v", err)
	}
	if setInfo.Revision != 10 || setInfo.FlowsCount != 1 {
		t.Errorf("unexpected SetSceneStateResponse: %+v", setInfo)
	}

	// 2. Timeline.EvaluateSceneAtTime
	evalReq := EvaluateSceneAtTimeRequest{Time: 2.0}
	evalBytes, _ := json.Marshal(evalReq)
	evalResp, err := Dispatch("Timeline.EvaluateSceneAtTime", evalBytes)
	if err != nil {
		t.Fatalf("Timeline.EvaluateSceneAtTime failed: %v", err)
	}
	var frame timeline.FrameResult
	if err := json.Unmarshal(evalResp, &frame); err != nil {
		t.Fatalf("unmarshal FrameResult failed: %v", err)
	}
	if len(frame.Flows) != 1 {
		t.Fatalf("expected 1 flow in frame result, got %d", len(frame.Flows))
	}
	if frame.Flows[0].ID != "flow-proto-1" {
		t.Errorf("expected flow-proto-1, got %v", frame.Flows[0].ID)
	}
	if frame.Time != 2.0 {
		t.Errorf("expected time 2.0, got %v", frame.Time)
	}
}

func TestDispatchNumericSceneSetState(t *testing.T) {
	// Directly replicate the browser payload with numeric Node.id, Flow.id, Glow.id, Ripple.id
	rawJSON := `{
		"revision": 202,
		"canvas": {"width": 1280, "height": 720, "duration": 7.0, "loop": "once"},
		"camera": {"motion": "static"},
		"nodes": [{"id": 1, "shape": "rounded", "text": "Node 1", "x": 100, "y": 100}],
		"flows": [{"id": 1, "nodes": [{"x": 10, "y": 10}, {"x": 50, "y": 50}], "speed": 2.0}],
		"glows": [{"id": 1, "shape": "circle", "x": 50, "y": 50}],
		"ripples": [{"id": 1, "x": 50, "y": 50}]
	}`
	resp, err := Dispatch("Scene.SetState", []byte(rawJSON))
	if err != nil {
		t.Fatalf("Dispatch Scene.SetState with numeric IDs failed: %v", err)
	}
	var setInfo SetSceneStateResponse
	if err := json.Unmarshal(resp, &setInfo); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if setInfo.Revision != 202 || setInfo.FlowsCount != 1 {
		t.Errorf("unexpected setInfo: %+v", setInfo)
	}
}



func TestDispatchShapePresetAndNodeCommands(t *testing.T) {
	// 1. Shape.GetCatalog
	catBytes, err := Dispatch("Shape.GetCatalog", nil)
	if err != nil {
		t.Fatalf("Shape.GetCatalog failed: %v", err)
	}
	var catalog []geometry.ShapeDefinition
	if err := json.Unmarshal(catBytes, &catalog); err != nil || len(catalog) < 12 {
		t.Fatalf("Failed to decode shape catalog: %v, count=%d", err, len(catalog))
	}

	// 2. Shape.Describe
	descReq, _ := json.Marshal(ShapeDescribeRequest{
		Shape:    "cylinder",
		Width:    200,
		Height:   90,
		Text:     "PostgreSQL",
		Subtext:  "Primary DB",
		FontSize: 16,
	})
	descBytes, err := Dispatch("Shape.Describe", descReq)
	if err != nil {
		t.Fatalf("Shape.Describe failed: %v", err)
	}
	var desc geometry.ShapeGeometryDescription
	if err := json.Unmarshal(descBytes, &desc); err != nil || desc.Shape != "cylinder" {
		t.Fatalf("Failed to decode shape description: %v, desc=%+v", err, desc)
	}
	if len(desc.Elements) != 2 {
		t.Errorf("Cylinder should produce 2 elements (body + cap), got %d", len(desc.Elements))
	}

	// 3. Preset.GetDefaults
	defBytes, err := Dispatch("Preset.GetDefaults", nil)
	if err != nil {
		t.Fatalf("Preset.GetDefaults failed: %v", err)
	}
	var defPreset scene.PresetConfig
	if err := json.Unmarshal(defBytes, &defPreset); err != nil || len(defPreset.Preset) != 11 {
		t.Fatalf("Failed to decode default preset: %v", err)
	}

	// 4. Preset.Apply
	applyReq, _ := json.Marshal(PresetApplyRequest{
		Node:   scene.Node{Shape: "rect", Width: 100, Height: 60},
		Preset: defPreset,
	})
	applyBytes, err := Dispatch("Preset.Apply", applyReq)
	if err != nil {
		t.Fatalf("Preset.Apply failed: %v", err)
	}
	var applyRes struct {
		Node    scene.Node `json:"node"`
		Changed bool       `json:"changed"`
	}
	if err := json.Unmarshal(applyBytes, &applyRes); err != nil || !applyRes.Changed || applyRes.Node.Width != 170 {
		t.Fatalf("Preset.Apply result mismatch: %+v", applyRes)
	}

	// 5. Node.Create
	createReq, _ := json.Marshal(NodeCreateRequest{
		Initial: scene.Node{
			Shape: "callout",
			Text:  "Note Callout",
			X:     50,
			Y:     50,
		},
		Preset: &defPreset,
		Snap:   false,
	})
	createBytes, err := Dispatch("Node.Create", createReq)
	if err != nil {
		t.Fatalf("Node.Create failed: %v", err)
	}
	var createRes struct {
		Node     scene.Node `json:"node"`
		Revision int64      `json:"revision"`
	}
	if err := json.Unmarshal(createBytes, &createRes); err != nil || createRes.Node.Shape != "callout" {
		t.Fatalf("Node.Create result mismatch: %+v", createRes)
	}
	nodeID := createRes.Node.ID

	// 6. Node.GetBounds
	boundsReq, _ := json.Marshal(NodeGetBoundsRequest{
		ID:      nodeID,
		CanvasW: 1000,
		CanvasH: 1000,
	})
	boundsBytes, err := Dispatch("Node.GetBounds", boundsReq)
	if err != nil {
		t.Fatalf("Node.GetBounds failed: %v", err)
	}
	var boundsRes struct {
		Cx         float64              `json:"cx"`
		Cy         float64              `json:"cy"`
		Bounds     geometry.ShapeBounds `json:"bounds"`
		ScreenRect map[string]float64   `json:"screenRect"`
	}
	if err := json.Unmarshal(boundsBytes, &boundsRes); err != nil || boundsRes.Cx != 500 || boundsRes.Cy != 500 {
		t.Fatalf("Node.GetBounds mismatch: %+v", boundsRes)
	}

	// 7. Node.FindAt
	findReq, _ := json.Marshal(NodeFindAtRequest{
		XPct:    50,
		YPct:    50,
		CanvasW: 1000,
		CanvasH: 1000,
	})
	findBytes, err := Dispatch("Node.FindAt", findReq)
	if err != nil {
		t.Fatalf("Node.FindAt failed: %v", err)
	}
	var foundNode *scene.Node
	if err := json.Unmarshal(findBytes, &foundNode); err != nil || foundNode == nil || foundNode.ID != nodeID {
		t.Fatalf("Node.FindAt mismatch: %+v", foundNode)
	}

	// 8. Node.Update
	updateReq, _ := json.Marshal(NodeUpdateRequest{
		ID: nodeID,
		Patch: scene.Node{
			Width: 320,
			Text:  "Updated Note",
		},
	})
	updateBytes, err := Dispatch("Node.Update", updateReq)
	if err != nil {
		t.Fatalf("Node.Update failed: %v", err)
	}
	var updateRes struct {
		Node     scene.Node `json:"node"`
		Revision int64      `json:"revision"`
	}
	if err := json.Unmarshal(updateBytes, &updateRes); err != nil || updateRes.Node.Width != 320 || updateRes.Node.Text != "Updated Note" {
		t.Fatalf("Node.Update mismatch: %+v", updateRes)
	}

	// 9. Node.Delete
	delReq, _ := json.Marshal(NodeDeleteRequest{ID: nodeID})
	delBytes, err := Dispatch("Node.Delete", delReq)
	if err != nil {
		t.Fatalf("Node.Delete failed: %v", err)
	}
	var delRes struct {
		Deleted  bool  `json:"deleted"`
		Revision int64 `json:"revision"`
	}
	if err := json.Unmarshal(delBytes, &delRes); err != nil || !delRes.Deleted {
		t.Fatalf("Node.Delete mismatch: %+v", delRes)
	}
}

func TestDispatchUnknownCommand(t *testing.T) {
	_, err := Dispatch("Unknown.Action", nil)
	if err == nil {
		t.Errorf("expected error on unknown command")
	}
}
