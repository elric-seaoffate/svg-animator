package protocol

import (
	"encoding/json"
	"fmt"
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

func TestDispatchFlowLifecycleAndOperations(t *testing.T) {
	// 1. Flow.Create
	createReq, _ := json.Marshal(FlowCreateRequest{
		Initial: scene.Flow{
			Color: "#38bdf8",
			Speed: 3.5,
		},
	})
	createBytes, err := Dispatch("Flow.Create", createReq)
	if err != nil {
		t.Fatalf("Flow.Create failed: %v", err)
	}
	var createRes struct {
		Flow     scene.Flow `json:"flow"`
		Revision int64      `json:"revision"`
	}
	if err := json.Unmarshal(createBytes, &createRes); err != nil {
		t.Fatalf("Unmarshal Flow.Create failed: %v", err)
	}
	flowID := createRes.Flow.ID
	if flowID == "" || createRes.Flow.Color != "#38bdf8" || len(createRes.Flow.Nodes) != 2 {
		t.Fatalf("Unexpected created flow: %+v", createRes.Flow)
	}

	// 2. Flow.Get
	getReq, _ := json.Marshal(map[string]any{"id": flowID})
	getBytes, err := Dispatch("Flow.Get", getReq)
	if err != nil {
		t.Fatalf("Flow.Get failed: %v", err)
	}
	var gotFlow scene.Flow
	if err := json.Unmarshal(getBytes, &gotFlow); err != nil || gotFlow.ID != flowID {
		t.Fatalf("Flow.Get mismatch: got %+v", gotFlow)
	}

	// 3. Flow.GetAll
	getAllBytes, err := Dispatch("Flow.GetAll", nil)
	if err != nil {
		t.Fatalf("Flow.GetAll failed: %v", err)
	}
	var allFlows []scene.Flow
	if err := json.Unmarshal(getAllBytes, &allFlows); err != nil || len(allFlows) == 0 {
		t.Fatalf("Flow.GetAll failed or empty: %v", err)
	}

	// 4. Flow.AddWaypoint
	addWpReq, _ := json.Marshal(FlowAddWaypointRequest{
		ID: flowID,
	})
	addWpBytes, err := Dispatch("Flow.AddWaypoint", addWpReq)
	if err != nil {
		t.Fatalf("Flow.AddWaypoint failed: %v", err)
	}
	var addWpRes struct {
		Flow        scene.Flow `json:"flow"`
		WaypointIdx int        `json:"waypointIdx"`
		Success     bool       `json:"success"`
	}
	if err := json.Unmarshal(addWpBytes, &addWpRes); err != nil || !addWpRes.Success || len(addWpRes.Flow.Nodes) != 3 {
		t.Fatalf("Flow.AddWaypoint mismatch: %+v", addWpRes)
	}

	// 5. Flow.UpdateWaypoint
	upWpReq, _ := json.Marshal(FlowUpdateWaypointRequest{
		ID:          flowID,
		WaypointIdx: 2,
		X:           60,
		Y:           70,
	})
	upWpBytes, err := Dispatch("Flow.UpdateWaypoint", upWpReq)
	if err != nil {
		t.Fatalf("Flow.UpdateWaypoint failed: %v", err)
	}
	var upWpRes struct {
		Flow    scene.Flow `json:"flow"`
		Success bool       `json:"success"`
	}
	if err := json.Unmarshal(upWpBytes, &upWpRes); err != nil || !upWpRes.Success || upWpRes.Flow.Nodes[2].X != 60 {
		t.Fatalf("Flow.UpdateWaypoint mismatch: %+v", upWpRes)
	}

	// 6. Flow.Describe
	descReq, _ := json.Marshal(FlowDescribeRequest{
		Nodes:     upWpRes.Flow.Nodes,
		Curvature: 0.3,
		Width:     1280,
		Height:    720,
		RouteMode: "curve",
	})
	descBytes, err := Dispatch("Flow.Describe", descReq)
	if err != nil {
		t.Fatalf("Flow.Describe failed: %v", err)
	}
	var descRes geometry.FlowGeometryDescription
	if err := json.Unmarshal(descBytes, &descRes); err != nil || descRes.PathD == "" || descRes.Length <= 0 {
		t.Fatalf("Flow.Describe invalid: %+v", descRes)
	}

	// 7. Flow.GetBounds
	boundsReq, _ := json.Marshal(FlowGetBoundsRequest{
		ID:      flowID,
		CanvasW: 1280,
		CanvasH: 720,
	})
	boundsBytes, err := Dispatch("Flow.GetBounds", boundsReq)
	if err != nil {
		t.Fatalf("Flow.GetBounds failed: %v", err)
	}
	var boundsRes struct {
		Bounds geometry.FlowBounds `json:"bounds"`
	}
	if err := json.Unmarshal(boundsBytes, &boundsRes); err != nil || boundsRes.Bounds.Width <= 0 {
		t.Fatalf("Flow.GetBounds mismatch: %+v", boundsRes)
	}

	// 8. Flow.FindAt
	findReq, _ := json.Marshal(FlowFindAtRequest{
		XPct:    25,
		YPct:    50,
		CanvasW: 1280,
		CanvasH: 720,
	})
	findBytes, err := Dispatch("Flow.FindAt", findReq)
	if err != nil {
		t.Fatalf("Flow.FindAt failed: %v", err)
	}
	var foundFlow *scene.Flow
	if err := json.Unmarshal(findBytes, &foundFlow); err != nil || foundFlow == nil || foundFlow.ID != flowID {
		t.Fatalf("Flow.FindAt expected to find flow %v, got %+v", flowID, foundFlow)
	}

	// 9. Flow.Update
	updateReq, _ := json.Marshal(FlowUpdateRequest{
		ID: flowID,
		Patch: scene.Flow{
			Label: "Encrypted Stream",
			Color: "#a855f7",
		},
	})
	updateBytes, err := Dispatch("Flow.Update", updateReq)
	if err != nil {
		t.Fatalf("Flow.Update failed: %v", err)
	}
	var updateRes struct {
		Flow scene.Flow `json:"flow"`
	}
	if err := json.Unmarshal(updateBytes, &updateRes); err != nil || updateRes.Flow.Label != "Encrypted Stream" || updateRes.Flow.Color != "#a855f7" {
		t.Fatalf("Flow.Update mismatch: %+v", updateRes)
	}

	// 10. Flow.RemoveWaypoint
	remWpReq, _ := json.Marshal(FlowRemoveWaypointRequest{
		ID:          flowID,
		WaypointIdx: 2,
	})
	remWpBytes, err := Dispatch("Flow.RemoveWaypoint", remWpReq)
	if err != nil {
		t.Fatalf("Flow.RemoveWaypoint failed: %v", err)
	}
	var remWpRes struct {
		Flow    scene.Flow `json:"flow"`
		Success bool       `json:"success"`
	}
	if err := json.Unmarshal(remWpBytes, &remWpRes); err != nil || !remWpRes.Success || len(remWpRes.Flow.Nodes) != 2 {
		t.Fatalf("Flow.RemoveWaypoint mismatch: %+v", remWpRes)
	}

	// 11. Flow.Delete
	delReq, _ := json.Marshal(FlowDeleteRequest{ID: flowID})
	delBytes, err := Dispatch("Flow.Delete", delReq)
	if err != nil {
		t.Fatalf("Flow.Delete failed: %v", err)
	}
	var delRes struct {
		Deleted bool `json:"deleted"`
	}
	if err := json.Unmarshal(delBytes, &delRes); err != nil || !delRes.Deleted {
		t.Fatalf("Flow.Delete mismatch: %+v", delRes)
	}
}

func TestDispatchGlowLifecycleAndOperations(t *testing.T) {
	// 1. Glow.Create
	createReq, _ := json.Marshal(GlowCreateRequest{
		Initial: scene.Glow{
			Shape:   "circle",
			Color:   "#ff0044",
			X:       40,
			Y:       50,
			Size:    30,
			Opacity: 0.8,
		},
	})
	createBytes, err := Dispatch("Glow.Create", createReq)
	if err != nil {
		t.Fatalf("Glow.Create failed: %v", err)
	}
	var createRes struct {
		Glow scene.Glow `json:"glow"`
	}
	if err := json.Unmarshal(createBytes, &createRes); err != nil || createRes.Glow.ID == "" {
		t.Fatalf("unmarshal Glow.Create failed: %v", err)
	}
	glowID := createRes.Glow.ID

	// 2. Glow.Get
	getReq, _ := json.Marshal(map[string]any{"id": glowID})
	getBytes, err := Dispatch("Glow.Get", getReq)
	if err != nil {
		t.Fatalf("Glow.Get failed: %v", err)
	}
	var fetchedGlow scene.Glow
	if err := json.Unmarshal(getBytes, &fetchedGlow); err != nil || fetchedGlow.ID != glowID {
		t.Fatalf("Glow.Get mismatch: %+v", fetchedGlow)
	}

	// 3. Glow.FindAt
	findReq, _ := json.Marshal(GlowFindAtRequest{
		XPct:    40,
		YPct:    50,
		CanvasW: 1000,
		CanvasH: 1000,
	})
	findBytes, err := Dispatch("Glow.FindAt", findReq)
	if err != nil {
		t.Fatalf("Glow.FindAt failed: %v", err)
	}
	var foundGlow *scene.Glow
	if err := json.Unmarshal(findBytes, &foundGlow); err != nil || foundGlow == nil || foundGlow.ID != glowID {
		t.Fatalf("Glow.FindAt mismatch: %+v", foundGlow)
	}

	// 4. Glow.GetBounds
	boundsReq, _ := json.Marshal(GlowGetBoundsRequest{
		ID:      glowID,
		CanvasW: 1000,
		CanvasH: 1000,
	})
	boundsBytes, err := Dispatch("Glow.GetBounds", boundsReq)
	if err != nil {
		t.Fatalf("Glow.GetBounds failed: %v", err)
	}
	var boundsRes struct {
		Bounds geometry.FlowBounds `json:"bounds"`
		Center geometry.Point      `json:"center"`
	}
	if err := json.Unmarshal(boundsBytes, &boundsRes); err != nil || boundsRes.Center.X != 400 || boundsRes.Center.Y != 500 {
		t.Fatalf("Glow.GetBounds mismatch: %+v", boundsRes)
	}

	// 5. Glow.Describe
	descReq, _ := json.Marshal(GlowDescribeRequest{
		ID:      glowID,
		CanvasW: 1000,
		CanvasH: 1000,
	})
	descBytes, err := Dispatch("Glow.Describe", descReq)
	if err != nil {
		t.Fatalf("Glow.Describe failed: %v", err)
	}
	var descRes scene.GlowDescription
	if err := json.Unmarshal(descBytes, &descRes); err != nil || descRes.ID != glowID {
		t.Fatalf("Glow.Describe mismatch: %+v", descRes)
	}

	// 6. Glow.Update
	updateReq, _ := json.Marshal(GlowUpdateRequest{
		ID: glowID,
		Patch: scene.Glow{
			Color: "#00ff88",
			Size:  35,
		},
	})
	updateBytes, err := Dispatch("Glow.Update", updateReq)
	if err != nil {
		t.Fatalf("Glow.Update failed: %v", err)
	}
	var updateRes struct {
		Glow scene.Glow `json:"glow"`
	}
	if err := json.Unmarshal(updateBytes, &updateRes); err != nil || updateRes.Glow.Color != "#00ff88" || updateRes.Glow.Size != 35 {
		t.Fatalf("Glow.Update mismatch: %+v", updateRes)
	}

	// 7. Glow.Delete
	delReq, _ := json.Marshal(GlowDeleteRequest{ID: glowID})
	delBytes, err := Dispatch("Glow.Delete", delReq)
	if err != nil {
		t.Fatalf("Glow.Delete failed: %v", err)
	}
	var delRes struct {
		Deleted bool `json:"deleted"`
	}
	if err := json.Unmarshal(delBytes, &delRes); err != nil || !delRes.Deleted {
		t.Fatalf("Glow.Delete mismatch: %+v", delRes)
	}
}

func TestDispatchRippleLifecycleAndOperations(t *testing.T) {
	// 1. Ripple.Create
	createReq, _ := json.Marshal(RippleCreateRequest{
		Initial: scene.Ripple{
			Color:      "#ffffff",
			Opacity:    0.4,
			InnerR:     0,
			OuterR:     120,
			Rings:      3,
			Thick:      8,
			Refraction: 35,
			Duration:   3.0,
			X:          50,
			Y:          50,
		},
	})
	createBytes, err := Dispatch("Ripple.Create", createReq)
	if err != nil {
		t.Fatalf("Ripple.Create failed: %v", err)
	}
	var createRes struct {
		Ripple scene.Ripple `json:"ripple"`
	}
	if err := json.Unmarshal(createBytes, &createRes); err != nil || createRes.Ripple.ID == "" {
		t.Fatalf("unmarshal Ripple.Create failed: %v", err)
	}
	rippleID := createRes.Ripple.ID

	// 2. Ripple.Get
	getReq, _ := json.Marshal(map[string]any{"id": rippleID})
	getBytes, err := Dispatch("Ripple.Get", getReq)
	if err != nil {
		t.Fatalf("Ripple.Get failed: %v", err)
	}
	var fetchedRipple scene.Ripple
	if err := json.Unmarshal(getBytes, &fetchedRipple); err != nil || fetchedRipple.ID != rippleID {
		t.Fatalf("Ripple.Get mismatch: %+v", fetchedRipple)
	}

	// 3. Ripple.FindAt
	findReq, _ := json.Marshal(RippleFindAtRequest{
		XPct:    50,
		YPct:    50,
		CanvasW: 1000,
		CanvasH: 1000,
	})
	findBytes, err := Dispatch("Ripple.FindAt", findReq)
	if err != nil {
		t.Fatalf("Ripple.FindAt failed: %v", err)
	}
	var foundRipple *scene.Ripple
	if err := json.Unmarshal(findBytes, &foundRipple); err != nil || foundRipple == nil || foundRipple.ID != rippleID {
		t.Fatalf("Ripple.FindAt mismatch: %+v", foundRipple)
	}

	// 4. Ripple.GetBounds
	boundsReq, _ := json.Marshal(RippleGetBoundsRequest{
		ID:      rippleID,
		CanvasW: 1000,
		CanvasH: 1000,
	})
	boundsBytes, err := Dispatch("Ripple.GetBounds", boundsReq)
	if err != nil {
		t.Fatalf("Ripple.GetBounds failed: %v", err)
	}
	var boundsRes struct {
		Bounds geometry.FlowBounds `json:"bounds"`
		Center geometry.Point      `json:"center"`
	}
	if err := json.Unmarshal(boundsBytes, &boundsRes); err != nil || boundsRes.Center.X != 500 || boundsRes.Center.Y != 500 {
		t.Fatalf("Ripple.GetBounds mismatch: %+v", boundsRes)
	}

	// 5. Ripple.Describe
	descReq, _ := json.Marshal(RippleDescribeRequest{
		ID:      rippleID,
		CanvasW: 1000,
		CanvasH: 1000,
	})
	descBytes, err := Dispatch("Ripple.Describe", descReq)
	if err != nil {
		t.Fatalf("Ripple.Describe failed: %v", err)
	}
	var descRes scene.RippleDescription
	if err := json.Unmarshal(descBytes, &descRes); err != nil || descRes.ID != rippleID {
		t.Fatalf("Ripple.Describe mismatch: %+v", descRes)
	}

	// 6. Ripple.Update
	updateReq, _ := json.Marshal(RippleUpdateRequest{
		ID: rippleID,
		Patch: scene.Ripple{
			Color:  "#38bdf8",
			OuterR: 160,
		},
	})
	updateBytes, err := Dispatch("Ripple.Update", updateReq)
	if err != nil {
		t.Fatalf("Ripple.Update failed: %v", err)
	}
	var updateRes struct {
		Ripple scene.Ripple `json:"ripple"`
	}
	if err := json.Unmarshal(updateBytes, &updateRes); err != nil || updateRes.Ripple.Color != "#38bdf8" || updateRes.Ripple.OuterR != 160 {
		t.Fatalf("Ripple.Update mismatch: %+v", updateRes)
	}

	// 7. Ripple.Delete
	delReq, _ := json.Marshal(RippleDeleteRequest{ID: rippleID})
	delBytes, err := Dispatch("Ripple.Delete", delReq)
	if err != nil {
		t.Fatalf("Ripple.Delete failed: %v", err)
	}
	var delRes struct {
		Deleted bool `json:"deleted"`
	}
	if err := json.Unmarshal(delBytes, &delRes); err != nil || !delRes.Deleted {
		t.Fatalf("Ripple.Delete mismatch: %+v", delRes)
	}
}

func TestDispatchCameraCommands(t *testing.T) {
	// 1. Camera.Get initial
	getBytes, err := Dispatch("Camera.Get", nil)
	if err != nil {
		t.Fatalf("Camera.Get failed: %v", err)
	}
	var cam scene.CameraConfig
	if err := json.Unmarshal(getBytes, &cam); err != nil {
		t.Fatalf("unmarshal camera failed: %v", err)
	}

	// 2. Camera.Update
	updateReq, _ := json.Marshal(CameraUpdateRequest{
		Camera: scene.CameraConfig{
			Motion:    "ken-burns",
			Duration:  6.0,
			StartZoom: 1.2,
			EndZoom:   1.8,
			StartX:    50,
			StartY:    50,
			EndX:      50,
			EndY:      50,
		},
	})
	upBytes, err := Dispatch("Camera.Update", updateReq)
	if err != nil {
		t.Fatalf("Camera.Update failed: %v", err)
	}
	var upRes struct {
		Camera   scene.CameraConfig `json:"camera"`
		Revision int64              `json:"revision"`
	}
	if err := json.Unmarshal(upBytes, &upRes); err != nil || upRes.Camera.Motion != "ken-burns" {
		t.Fatalf("Camera.Update mismatch: %+v", upRes)
	}

	// 3. Camera.Evaluate
	evalReq, _ := json.Marshal(CameraEvaluateRequest{
		Time:    3.0,
		CanvasW: 1920,
		CanvasH: 1080,
	})
	evalBytes, err := Dispatch("Camera.Evaluate", evalReq)
	if err != nil {
		t.Fatalf("Camera.Evaluate failed: %v", err)
	}
	var evalRes struct {
		Scale     float64 `json:"scale"`
		Transform string  `json:"transform"`
	}
	if err := json.Unmarshal(evalBytes, &evalRes); err != nil || evalRes.Scale < 1.4 {
		t.Fatalf("Camera.Evaluate mismatch: %+v", evalRes)
	}
}

func TestDispatchOpticsCommands(t *testing.T) {
	// 1. Optics.Get initial
	getBytes, err := Dispatch("Optics.Get", nil)
	if err != nil {
		t.Fatalf("Optics.Get failed: %v", err)
	}
	var opt scene.OpticalConfig
	if err := json.Unmarshal(getBytes, &opt); err != nil {
		t.Fatalf("unmarshal optics failed: %v", err)
	}

	// 2. Optics.Update
	upReq, _ := json.Marshal(OpticsUpdateRequest{
		Optical: scene.OpticalConfig{
			Type:      "focus-pull",
			StartBlur: 8,
			EndBlur:   0,
			FocusDur:  4,
		},
	})
	upBytes, err := Dispatch("Optics.Update", upReq)
	if err != nil {
		t.Fatalf("Optics.Update failed: %v", err)
	}
	var upRes struct {
		Optical  scene.OpticalConfig `json:"optical"`
		Revision int64               `json:"revision"`
	}
	if err := json.Unmarshal(upBytes, &upRes); err != nil || upRes.Optical.Type != "focus-pull" {
		t.Fatalf("Optics.Update mismatch: %+v", upRes)
	}

	// 3. Optics.Evaluate
	evalReq, _ := json.Marshal(OpticsEvaluateRequest{
		Time:        2.0,
		CamDuration: 4.0,
		CamLoop:     "once",
	})
	evalBytes, err := Dispatch("Optics.Evaluate", evalReq)
	if err != nil {
		t.Fatalf("Optics.Evaluate failed: %v", err)
	}
	var evalRes struct {
		Blur       float64 `json:"blur"`
		FilterAttr string  `json:"filterAttr"`
		IsActive   bool    `json:"isActive"`
	}
	if err := json.Unmarshal(evalBytes, &evalRes); err != nil || !evalRes.IsActive || evalRes.Blur <= 0 {
		t.Fatalf("Optics.Evaluate mismatch: %+v", evalRes)
	}
}

func TestDispatchFrameCommands(t *testing.T) {
	// 1. Frame.Get initial
	getBytes, err := Dispatch("Frame.Get", nil)
	if err != nil {
		t.Fatalf("Frame.Get failed: %v", err)
	}
	var frame scene.FrameConfig
	if err := json.Unmarshal(getBytes, &frame); err != nil {
		t.Fatalf("unmarshal frame failed: %v", err)
	}

	// 2. Frame.Update
	upReq, _ := json.Marshal(FrameUpdateRequest{
		Frame: scene.FrameConfig{
			Enabled:  true,
			Style:    "cyber-hud",
			Depth:    40,
			Lighting: true,
			LightInt: 80,
		},
	})
	upBytes, err := Dispatch("Frame.Update", upReq)
	if err != nil {
		t.Fatalf("Frame.Update failed: %v", err)
	}
	var upRes struct {
		Frame    scene.FrameConfig `json:"frame"`
		Revision int64             `json:"revision"`
	}
	if err := json.Unmarshal(upBytes, &upRes); err != nil || upRes.Frame.Style != "cyber-hud" {
		t.Fatalf("Frame.Update mismatch: %+v", upRes)
	}

	// 3. Frame.Describe
	descReq, _ := json.Marshal(FrameDescribeRequest{
		CanvasW: 1920,
		CanvasH: 1080,
	})
	descBytes, err := Dispatch("Frame.Describe", descReq)
	if err != nil {
		t.Fatalf("Frame.Describe failed: %v", err)
	}
	var descRes struct {
		Defs    string `json:"defs"`
		Markup  string `json:"markup"`
		Enabled bool   `json:"enabled"`
	}
	if err := json.Unmarshal(descBytes, &descRes); err != nil || !descRes.Enabled || descRes.Markup == "" {
		t.Fatalf("Frame.Describe mismatch: %+v", descRes)
	}
}

func TestDispatchUnknownCommand(t *testing.T) {
	_, err := Dispatch("Unknown.Action", nil)
	if err == nil {
		t.Errorf("expected error on unknown command")
	}
}

func TestDispatchSelectionCommands(t *testing.T) {
	// 1. Create a node to select
	cReq, _ := json.Marshal(NodeCreateRequest{
		Initial: scene.Node{Shape: "rounded", Text: "SelTarget"},
	})
	cBytes, _ := Dispatch("Node.Create", cReq)
	var cRes struct {
		Node scene.Node `json:"node"`
	}
	_ = json.Unmarshal(cBytes, &cRes)
	node := cRes.Node

	// 2. Selection.Set valid
	sReq, _ := json.Marshal(SelectionSetRequest{
		Type: "node",
		ID:   node.ID,
	})
	sBytes, err := Dispatch("Selection.Set", sReq)
	if err != nil {
		t.Fatalf("Selection.Set failed: %v", err)
	}
	var sRes SelectionResponse
	if err := json.Unmarshal(sBytes, &sRes); err != nil || !sRes.Success || sRes.ID != node.ID {
		t.Fatalf("Selection.Set response mismatch: %+v", sRes)
	}

	// 3. Selection.Get
	gBytes, err := Dispatch("Selection.Get", nil)
	if err != nil {
		t.Fatalf("Selection.Get failed: %v", err)
	}
	var gRes SelectionResponse
	if err := json.Unmarshal(gBytes, &gRes); err != nil || gRes.ID != node.ID {
		t.Fatalf("Selection.Get mismatch: %+v", gRes)
	}

	// 4. Selection.Clear
	clrBytes, err := Dispatch("Selection.Clear", nil)
	if err != nil {
		t.Fatalf("Selection.Clear failed: %v", err)
	}
	var clrRes SelectionResponse
	if err := json.Unmarshal(clrBytes, &clrRes); err != nil || clrRes.Type != "none" {
		t.Fatalf("Selection.Clear mismatch: %+v", clrRes)
	}

	// 5. Multi-selection commands: Selection.Add, Selection.Toggle, Selection.Remove
	node2Req, _ := json.Marshal(NodeCreateRequest{
		Initial: scene.Node{Shape: "hexagon", Text: "Node 2", Width: 100, Height: 80, X: 40, Y: 50},
	})
	n2Bytes, _ := Dispatch("Node.Create", node2Req)
	var n2Created struct {
		Node scene.Node `json:"node"`
	}
	json.Unmarshal(n2Bytes, &n2Created)
	node2 := n2Created.Node

	// Selection.Add node 1 and node 2
	Dispatch("Selection.Set", []byte(`{"type":"node","id":"`+node.ID+`"}`))
	addBytes, err := Dispatch("Selection.Add", []byte(`{"type":"node","id":"`+node2.ID+`"}`))
	if err != nil {
		t.Fatalf("Selection.Add failed: %v", err)
	}
	var addRes SelectionResponse
	json.Unmarshal(addBytes, &addRes)
	if len(addRes.Items) != 2 || addRes.Count != 2 {
		t.Fatalf("expected 2 items after Selection.Add, got %+v", addRes)
	}

	// Selection.Toggle node 2 (should remove)
	togBytes, err := Dispatch("Selection.Toggle", []byte(`{"type":"node","id":"`+node2.ID+`"}`))
	if err != nil {
		t.Fatalf("Selection.Toggle failed: %v", err)
	}
	var togRes SelectionResponse
	json.Unmarshal(togBytes, &togRes)
	if len(togRes.Items) != 1 {
		t.Fatalf("expected 1 item after Selection.Toggle, got %+v", togRes)
	}

	// Nodes.MoveGroup
	moveReq, _ := json.Marshal(NodesMoveGroupRequest{
		IDs: []scene.StringID{node.ID, node2.ID},
		DX:  10,
		DY:  -5,
	})
	mBytes, err := Dispatch("Nodes.MoveGroup", moveReq)
	if err != nil {
		t.Fatalf("Nodes.MoveGroup failed: %v", err)
	}
	var mRes NodesTransformResponse
	if err := json.Unmarshal(mBytes, &mRes); err != nil || !mRes.Success || mRes.Count != 2 {
		t.Fatalf("Nodes.MoveGroup response mismatch: %+v", mRes)
	}

	// Nodes.Align
	alignReq, _ := json.Marshal(NodesAlignRequest{
		IDs:     []scene.StringID{node.ID, node2.ID},
		Mode:    "align-left",
		CanvasW: 1000,
		CanvasH: 1000,
	})
	aBytes, err := Dispatch("Nodes.Align", alignReq)
	if err != nil {
		t.Fatalf("Nodes.Align failed: %v", err)
	}
	var aRes NodesTransformResponse
	if err := json.Unmarshal(aBytes, &aRes); err != nil || !aRes.Success || aRes.Count != 2 {
		t.Fatalf("Nodes.Align response mismatch: %+v", aRes)
	}
}

func TestDispatchHistoryCommands(t *testing.T) {
	// 1. History.Clear
	Dispatch("History.Clear", nil)

	// 2. History.Record initial
	recBytes, err := Dispatch("History.Record", nil)
	if err != nil {
		t.Fatalf("History.Record failed: %v", err)
	}
	var recRes HistoryStateResponse
	if err := json.Unmarshal(recBytes, &recRes); err != nil || recRes.UndoCount < 1 {
		t.Fatalf("History.Record mismatch: %+v", recRes)
	}

	// 3. Modify scene and record
	cReq, _ := json.Marshal(NodeCreateRequest{
		Initial: scene.Node{Shape: "pill", Text: "HistNode"},
	})
	Dispatch("Node.Create", cReq)
	Dispatch("History.Record", nil)

	// 4. Check state
	stBytes, _ := Dispatch("History.GetState", nil)
	var stRes HistoryStateResponse
	_ = json.Unmarshal(stBytes, &stRes)
	if !stRes.CanUndo || stRes.UndoCount < 2 {
		t.Fatalf("expected canUndo with >= 2 entries, got %+v", stRes)
	}

	// 5. History.Undo
	uBytes, err := Dispatch("History.Undo", nil)
	if err != nil {
		t.Fatalf("History.Undo failed: %v", err)
	}
	var uRes HistoryRestoreResponse
	if err := json.Unmarshal(uBytes, &uRes); err != nil || !uRes.Success {
		t.Fatalf("History.Undo response mismatch: %+v", uRes)
	}

	// 6. History.Redo
	rBytes, err := Dispatch("History.Redo", nil)
	if err != nil {
		t.Fatalf("History.Redo failed: %v", err)
	}
	var rRes HistoryRestoreResponse
	if err := json.Unmarshal(rBytes, &rRes); err != nil || !rRes.Success {
		t.Fatalf("History.Redo response mismatch: %+v", rRes)
	}
}

func TestDispatchObjectRenameCommands(t *testing.T) {
	// Create a node
	cReq, _ := json.Marshal(NodeCreateRequest{
		Initial: scene.Node{Shape: "diamond", Text: "DiamondLabel"},
	})
	cBytes, _ := Dispatch("Node.Create", cReq)
	var cRes struct {
		Node scene.Node `json:"node"`
	}
	_ = json.Unmarshal(cBytes, &cRes)
	node := cRes.Node

	// Object.Rename
	rReq, _ := json.Marshal(ObjectRenameRequest{
		Type: "node",
		ID:   node.ID,
		Name: "Core Pump Unit 1",
	})
	rBytes, err := Dispatch("Object.Rename", rReq)
	if err != nil {
		t.Fatalf("Object.Rename failed: %v", err)
	}
	var rRes ObjectRenameResponse
	if err := json.Unmarshal(rBytes, &rRes); err != nil || !rRes.Success || rRes.Name != "Core Pump Unit 1" {
		t.Fatalf("Object.Rename response mismatch: %+v", rRes)
	}

	// Verify Node.Get has Name and unchanged Text
	gBytes, _ := Dispatch("Node.Get", []byte(fmt.Sprintf(`{"id":"%s"}`, node.ID)))
	var gNode scene.Node
	_ = json.Unmarshal(gBytes, &gNode)
	if gNode.Name != "Core Pump Unit 1" {
		t.Errorf("expected node name 'Core Pump Unit 1', got %q", gNode.Name)
	}
	if gNode.Text != "DiamondLabel" {
		t.Errorf("node text must remain untouched, got %q", gNode.Text)
	}
}

func TestDispatchAllObjectTypesRenameAndClear(t *testing.T) {
	// 1. Flow
	cfReq, _ := json.Marshal(FlowCreateRequest{
		Initial: scene.Flow{RouteMode: "direct", Label: "Badge 1"},
	})
	cfBytes, _ := Dispatch("Flow.Create", cfReq)
	var cfRes struct {
		Flow scene.Flow `json:"flow"`
	}
	_ = json.Unmarshal(cfBytes, &cfRes)
	flow := cfRes.Flow

	rfReq, _ := json.Marshal(ObjectRenameRequest{
		Type: "flow",
		ID:   flow.ID,
		Name: "Main Cooling Loop #1 (High Flux) / 冷却水供給",
	})
	rfBytes, err := Dispatch("Object.Rename", rfReq)
	if err != nil {
		t.Fatalf("rename flow failed: %v", err)
	}
	var rfRes ObjectRenameResponse
	_ = json.Unmarshal(rfBytes, &rfRes)
	if !rfRes.Success || rfRes.Name != "Main Cooling Loop #1 (High Flux) / 冷却水供給" {
		t.Fatalf("rename flow response mismatch: %+v", rfRes)
	}

	// Verify Flow.Get preserves label
	gfBytes, _ := Dispatch("Flow.Get", []byte(fmt.Sprintf(`{"id":"%s"}`, flow.ID)))
	var gFlow scene.Flow
	_ = json.Unmarshal(gfBytes, &gFlow)
	if gFlow.Name != "Main Cooling Loop #1 (High Flux) / 冷却水供給" {
		t.Errorf("flow name mismatch: %q", gFlow.Name)
	}
	if gFlow.Label != "Badge 1" {
		t.Errorf("flow label must not be altered by rename: %q", gFlow.Label)
	}

	// 2. Glow
	cgReq, _ := json.Marshal(GlowCreateRequest{
		Initial: scene.Glow{Shape: "circle", Size: 30},
	})
	cgBytes, _ := Dispatch("Glow.Create", cgReq)
	var cgRes struct {
		Glow scene.Glow `json:"glow"`
	}
	_ = json.Unmarshal(cgBytes, &cgRes)
	glow := cgRes.Glow

	rgReq, _ := json.Marshal(ObjectRenameRequest{
		Type: "glow",
		ID:   glow.ID,
		Name: "Primary Overheat Hotspot",
	})
	rgBytes, err := Dispatch("Object.Rename", rgReq)
	if err != nil {
		t.Fatalf("rename glow failed: %v", err)
	}
	var rgRes ObjectRenameResponse
	_ = json.Unmarshal(rgBytes, &rgRes)
	if !rgRes.Success || rgRes.Name != "Primary Overheat Hotspot" {
		t.Fatalf("rename glow response mismatch: %+v", rgRes)
	}

	// 3. Ripple
	crReq, _ := json.Marshal(RippleCreateRequest{
		Initial: scene.Ripple{Rings: 4},
	})
	crBytes, _ := Dispatch("Ripple.Create", crReq)
	var crRes struct {
		Ripple scene.Ripple `json:"ripple"`
	}
	_ = json.Unmarshal(crBytes, &crRes)
	rip := crRes.Ripple

	rrReq, _ := json.Marshal(ObjectRenameRequest{
		Type: "ripple",
		ID:   rip.ID,
		Name: "Cavitation Wave",
	})
	rrBytes, err := Dispatch("Object.Rename", rrReq)
	if err != nil {
		t.Fatalf("rename ripple failed: %v", err)
	}
	var rrRes ObjectRenameResponse
	_ = json.Unmarshal(rrBytes, &rrRes)
	if !rrRes.Success || rrRes.Name != "Cavitation Wave" {
		t.Fatalf("rename ripple response mismatch: %+v", rrRes)
	}

	// 4. Clear names
	for _, obj := range []struct {
		typ string
		id  scene.StringID
	}{
		{"flow", flow.ID},
		{"glow", glow.ID},
		{"ripple", rip.ID},
	} {
		clrReq, _ := json.Marshal(ObjectRenameRequest{
			Type: obj.typ,
			ID:   obj.id,
			Name: "",
		})
		clrBytes, err := Dispatch("Object.Rename", clrReq)
		if err != nil {
			t.Fatalf("clear name failed for %s: %v", obj.typ, err)
		}
		var clrRes ObjectRenameResponse
		_ = json.Unmarshal(clrBytes, &clrRes)
		if !clrRes.Success || clrRes.Name != "" {
			t.Errorf("expected empty name for %s, got %+v", obj.typ, clrRes)
		}
	}
}

func TestDispatchSVACommands(t *testing.T) {
	// 1. Create a node with custom name
	cnReq, _ := json.Marshal(NodeCreateRequest{
		Initial: scene.Node{
			Shape: "rounded",
			Text:  "Database Primary",
			Name:  "Primary PostgreSQL Instance",
			X:     30,
			Y:     40,
		},
	})
	_, err := Dispatch("Node.Create", cnReq)
	if err != nil {
		t.Fatalf("Node.Create failed: %v", err)
	}

	// 2. Encode to SVA
	encReq, _ := json.Marshal(EncodeSVARequest{
		Name:        "Test Cluster",
		Description: "Mission critical HA topology",
	})
	encBytes, err := Dispatch("Project.EncodeSVA", encReq)
	if err != nil {
		t.Fatalf("Project.EncodeSVA failed: %v", err)
	}
	var encRes EncodeSVAResponse
	if err := json.Unmarshal(encBytes, &encRes); err != nil {
		t.Fatalf("Unmarshal EncodeSVAResponse failed: %v", err)
	}
	if !encRes.Success || encRes.DataB64 == "" {
		t.Fatalf("Project.EncodeSVA unsuccessful: %+v", encRes)
	}
	if encRes.Filename != "Test Cluster.sva" {
		t.Errorf("expected filename 'Test Cluster.sva', got %q", encRes.Filename)
	}

	// 3. Validate SVA
	valReq, _ := json.Marshal(ValidateSVARequest{DataB64: encRes.DataB64})
	valBytes, err := Dispatch("Project.ValidateSVA", valReq)
	if err != nil {
		t.Fatalf("Project.ValidateSVA failed: %v", err)
	}
	var valRes ValidateSVAResponse
	if err := json.Unmarshal(valBytes, &valRes); err != nil {
		t.Fatalf("Unmarshal ValidateSVAResponse failed: %v", err)
	}
	if !valRes.Success || valRes.Manifest == nil || valRes.Manifest.Name != "Test Cluster" {
		t.Fatalf("Project.ValidateSVA unexpected response: %+v", valRes)
	}

	// 4. Decode SVA
	decReq, _ := json.Marshal(DecodeSVARequest{DataB64: encRes.DataB64})
	decBytes, err := Dispatch("Project.DecodeSVA", decReq)
	if err != nil {
		t.Fatalf("Project.DecodeSVA failed: %v", err)
	}
	var decRes DecodeSVAResponse
	if err := json.Unmarshal(decBytes, &decRes); err != nil {
		t.Fatalf("Unmarshal DecodeSVAResponse failed: %v", err)
	}
	if !decRes.Success || decRes.Manifest == nil || decRes.Manifest.Name != "Test Cluster" {
		t.Fatalf("Project.DecodeSVA unexpected response: %+v", decRes)
	}

	var restoredState map[string]any
	if err := json.Unmarshal(decRes.State, &restoredState); err != nil {
		t.Fatalf("Unmarshal restored state failed: %v", err)
	}
	nodes, ok := restoredState["nodes"].([]any)
	if !ok || len(nodes) == 0 {
		t.Fatalf("restored state has no nodes: %+v", restoredState)
	}
}
