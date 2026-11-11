package protocol

import (
	"encoding/json"
	"fmt"
	"testing"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/scene"
	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/timeline"
)

func floatPtr(v float64) *float64 { return &v }
func strPtr(v string) *string       { return &v }
func boolPtr(v bool) *bool          { return &v }
func intPtr(v int) *int             { return &v }

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
		Patch: NodeUpdatePayload{
			Width: floatPtr(320),
			Text:  strPtr("Updated Note"),
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
		Patch: FlowUpdatePayload{
			Label: strPtr("Encrypted Stream"),
			Color: strPtr("#a855f7"),
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
		Patch: GlowUpdatePayload{
			Color: strPtr("#00ff88"),
			Size:  floatPtr(35),
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
		Patch: RippleUpdatePayload{
			Color:  strPtr("#38bdf8"),
			OuterR: floatPtr(160),
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
		Camera: &CameraUpdatePayload{
			Motion:    strPtr("ken-burns"),
			Duration:  floatPtr(6.0),
			StartZoom: floatPtr(1.2),
			EndZoom:   floatPtr(1.8),
			StartX:    floatPtr(50),
			StartY:    floatPtr(50),
			EndX:      floatPtr(50),
			EndY:      floatPtr(50),
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
		Optical: &OpticsUpdatePayload{
			Type:      strPtr("focus-pull"),
			StartBlur: floatPtr(8),
			EndBlur:   floatPtr(0),
			FocusDur:  floatPtr(4),
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
		Frame: &FrameUpdatePayload{
			Enabled:  boolPtr(true),
			Style:    strPtr("cyber-hud"),
			Depth:    floatPtr(40),
			Lighting: boolPtr(true),
			LightInt: floatPtr(80),
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

func TestDispatchGroupAndClipboardCommands(t *testing.T) {
	// 1. Create two nodes
	n1Req, _ := json.Marshal(NodeCreateRequest{
		Initial: scene.Node{Shape: "rect", Text: "Server A", Width: 100, Height: 50, X: 15, Y: 20},
	})
	n1Bytes, _ := Dispatch("Node.Create", n1Req)
	var n1Created struct {
		Node scene.Node `json:"node"`
	}
	json.Unmarshal(n1Bytes, &n1Created)

	n2Req, _ := json.Marshal(NodeCreateRequest{
		Initial: scene.Node{Shape: "circle", Text: "Server B", Width: 80, Height: 80, X: 35, Y: 20},
	})
	n2Bytes, _ := Dispatch("Node.Create", n2Req)
	var n2Created struct {
		Node scene.Node `json:"node"`
	}
	json.Unmarshal(n2Bytes, &n2Created)

	// 2. Group.Create
	grpReq, _ := json.Marshal(GroupCreateRequest{
		Name: "Server Cluster",
		Members: []scene.GroupMember{
			{Type: scene.SelectionNode, ID: n1Created.Node.ID},
			{Type: scene.SelectionNode, ID: n2Created.Node.ID},
		},
	})
	grpBytes, err := Dispatch("Group.Create", grpReq)
	if err != nil {
		t.Fatalf("Group.Create failed: %v", err)
	}
	var grpRes GroupCreateResponse
	if err := json.Unmarshal(grpBytes, &grpRes); err != nil || !grpRes.Success {
		t.Fatalf("Group.Create failed: %+v", grpRes)
	}
	if grpRes.Group.Name != "Server Cluster" || len(grpRes.Group.Members) != 2 {
		t.Fatalf("Group.Create mismatch: %+v", grpRes.Group)
	}
	gID := grpRes.Group.ID

	// 3. Group.Get and Group.List
	getReq, _ := json.Marshal(GroupGetRequest{GroupID: gID})
	getBytes, _ := Dispatch("Group.Get", getReq)
	var getRes GroupGetResponse
	json.Unmarshal(getBytes, &getRes)
	if !getRes.Found || getRes.Group.ID != gID {
		t.Fatalf("Group.Get failed: %+v", getRes)
	}

	listBytes, _ := Dispatch("Group.List", nil)
	var listRes GroupListResponse
	json.Unmarshal(listBytes, &listRes)
	if listRes.Count < 1 {
		t.Fatalf("Group.List expected count >= 1, got %d", listRes.Count)
	}

	// 4. Group.FindByMember
	fmReq, _ := json.Marshal(GroupFindMemberRequest{Type: scene.SelectionNode, ID: n1Created.Node.ID})
	fmBytes, _ := Dispatch("Group.FindByMember", fmReq)
	var fmRes GroupFindMemberResponse
	json.Unmarshal(fmBytes, &fmRes)
	if !fmRes.Found || fmRes.Group.ID != gID {
		t.Fatalf("Group.FindByMember failed: %+v", fmRes)
	}

	// 5. Group.Rename
	renReq, _ := json.Marshal(GroupRenameRequest{GroupID: gID, Name: "Cluster Primary"})
	renBytes, _ := Dispatch("Group.Rename", renReq)
	var renRes GroupRenameResponse
	json.Unmarshal(renBytes, &renRes)
	if !renRes.Success || renRes.Group.Name != "Cluster Primary" {
		t.Fatalf("Group.Rename failed: %+v", renRes)
	}

	// 6. Group.Move
	moveReq, _ := json.Marshal(GroupMoveRequest{GroupID: gID, DX: 10, DY: 5})
	moveBytes, _ := Dispatch("Group.Move", moveReq)
	var moveRes GroupMoveResponse
	json.Unmarshal(moveBytes, &moveRes)
	if !moveRes.Success {
		t.Fatalf("Group.Move failed: %+v", moveRes)
	}

	// 7. Group.Bounds
	bReq, _ := json.Marshal(GroupBoundsRequest{GroupID: gID, CanvasW: 1000, CanvasH: 1000})
	bBytes, _ := Dispatch("Group.Bounds", bReq)
	var bRes GroupBoundsResponse
	json.Unmarshal(bBytes, &bRes)
	if !bRes.Success || bRes.MaxX <= bRes.MinX {
		t.Fatalf("Group.Bounds failed: %+v", bRes)
	}

	// 8. Scene.Duplicate
	dupReq, _ := json.Marshal(SceneDuplicateRequest{GroupID: gID, OffsetX: 5, OffsetY: 5})
	dupBytes, _ := Dispatch("Scene.Duplicate", dupReq)
	var dupRes SceneDuplicateResponse
	json.Unmarshal(dupBytes, &dupRes)
	if !dupRes.Success || dupRes.NewGroupID == "" || len(dupRes.NewItems) != 2 {
		t.Fatalf("Scene.Duplicate failed: %+v", dupRes)
	}

	// 9. Scene.Copy and Scene.Paste
	copyReq, _ := json.Marshal(SceneCopyRequest{GroupID: gID})
	copyBytes, _ := Dispatch("Scene.Copy", copyReq)
	var copyRes SceneCopyResponse
	json.Unmarshal(copyBytes, &copyRes)
	if !copyRes.Success || len(copyRes.Payload.Nodes) != 2 {
		t.Fatalf("Scene.Copy failed: %+v", copyRes)
	}

	pasteReq, _ := json.Marshal(ScenePasteRequest{Payload: copyRes.Payload, OffsetX: 10, OffsetY: 10})
	pasteBytes, _ := Dispatch("Scene.Paste", pasteReq)
	var pasteRes ScenePasteResponse
	json.Unmarshal(pasteBytes, &pasteRes)
	if !pasteRes.Success || len(pasteRes.NewItems) != 2 || pasteRes.NewGroupID == "" {
		t.Fatalf("Scene.Paste failed: %+v", pasteRes)
	}

	// 10. Group.Ungroup
	ungReq, _ := json.Marshal(GroupUngroupRequest{GroupID: gID})
	ungBytes, _ := Dispatch("Group.Ungroup", ungReq)
	var ungRes GroupUngroupResponse
	json.Unmarshal(ungBytes, &ungRes)
	if !ungRes.Success || len(ungRes.Members) != 2 {
		t.Fatalf("Group.Ungroup failed: %+v", ungRes)
	}

	// 11. Group.RemoveMembers
	n3Req, _ := json.Marshal(NodeCreateRequest{
		Initial: scene.Node{Shape: "diamond", Text: "Server C", Width: 50, Height: 50, X: 50, Y: 50},
	})
	n3Bytes, _ := Dispatch("Node.Create", n3Req)
	var n3Created struct {
		Node scene.Node `json:"node"`
	}
	json.Unmarshal(n3Bytes, &n3Created)

	grp3Req, _ := json.Marshal(GroupCreateRequest{
		Name: "Triple Group",
		Members: []scene.GroupMember{
			{Type: scene.SelectionNode, ID: n1Created.Node.ID},
			{Type: scene.SelectionNode, ID: n2Created.Node.ID},
			{Type: scene.SelectionNode, ID: n3Created.Node.ID},
		},
	})
	grp3Bytes, _ := Dispatch("Group.Create", grp3Req)
	var grp3Res GroupCreateResponse
	json.Unmarshal(grp3Bytes, &grp3Res)
	if !grp3Res.Success {
		t.Fatalf("Group.Create for 3 nodes failed: %+v", grp3Res)
	}

	// Remove 1 member -> 2 remain, not dissolved
	remReq1, _ := json.Marshal(GroupRemoveMembersRequest{
		GroupID: grp3Res.Group.ID,
		Members: []scene.GroupMember{{Type: scene.SelectionNode, ID: n3Created.Node.ID}},
	})
	remBytes1, _ := Dispatch("Group.RemoveMembers", remReq1)
	var remRes1 GroupRemoveMembersResponse
	json.Unmarshal(remBytes1, &remRes1)
	if !remRes1.Success || remRes1.Dissolved || len(remRes1.Group.Members) != 2 {
		t.Fatalf("Group.RemoveMembers step 1 failed: %+v", remRes1)
	}

	// Remove another member -> 1 remains -> group dissolved!
	remReq2, _ := json.Marshal(GroupRemoveMembersRequest{
		GroupID: grp3Res.Group.ID,
		Members: []scene.GroupMember{{Type: scene.SelectionNode, ID: n2Created.Node.ID}},
	})
	remBytes2, _ := Dispatch("Group.RemoveMembers", remReq2)
	var remRes2 GroupRemoveMembersResponse
	json.Unmarshal(remBytes2, &remRes2)
	if !remRes2.Success || !remRes2.Dissolved {
		t.Fatalf("Group.RemoveMembers step 2 failed (expected dissolved): %+v", remRes2)
	}
}

func TestDispatchImageAndLayerCommands(t *testing.T) {
	// 1. Image.Create
	imgReq, _ := json.Marshal(ImageCreateRequest{
		Image: scene.Image{
			Filename:     "test_photo.png",
			Width:        400,
			Height:       300,
			NaturalWidth: 800,
			NaturalHeight: 600,
		},
	})
	imgBytes, err := Dispatch("Image.Create", imgReq)
	if err != nil {
		t.Fatalf("Image.Create failed: %v", err)
	}
	var imgRes ImageCreateResponse
	if err := json.Unmarshal(imgBytes, &imgRes); err != nil || !imgRes.Success {
		t.Fatalf("Image.Create response mismatch: %+v", imgRes)
	}
	imgID := imgRes.Image.ID

	// 2. Image.Get
	getReq, _ := json.Marshal(ImageGetRequest{ID: imgID})
	getBytes, err := Dispatch("Image.Get", getReq)
	if err != nil {
		t.Fatalf("Image.Get failed: %v", err)
	}
	var getRes ImageGetResponse
	if err := json.Unmarshal(getBytes, &getRes); err != nil || !getRes.Found {
		t.Fatalf("Image.Get not found: %+v", getRes)
	}

	// 3. Image.Update
	upReq, _ := json.Marshal(ImageUpdateRequest{
		ID: imgID,
		Patch: ImageUpdatePayload{
			Name:  strPtr("Custom Photo Name"),
			Width: floatPtr(500),
		},
	})
	upBytes, err := Dispatch("Image.Update", upReq)
	if err != nil {
		t.Fatalf("Image.Update failed: %v", err)
	}
	var upRes ImageUpdateResponse
	if err := json.Unmarshal(upBytes, &upRes); err != nil || !upRes.Success || upRes.Image.Name != "Custom Photo Name" {
		t.Fatalf("Image.Update response mismatch: %+v", upRes)
	}

	// 4. Image.List
	listBytes, err := Dispatch("Image.List", nil)
	if err != nil {
		t.Fatalf("Image.List failed: %v", err)
	}
	var listRes ImageListResponse
	if err := json.Unmarshal(listBytes, &listRes); err != nil || listRes.Count == 0 {
		t.Fatalf("Image.List empty: %+v", listRes)
	}

	// 5. Layer.Get
	layerBytes, err := Dispatch("Layer.Get", nil)
	if err != nil {
		t.Fatalf("Layer.Get failed: %v", err)
	}
	var layerRes LayerGetResponse
	if err := json.Unmarshal(layerBytes, &layerRes); err != nil || layerRes.Count == 0 {
		t.Fatalf("Layer.Get empty: %+v", layerRes)
	}

	// 6. Layer.BringToFront
	frontReq, _ := json.Marshal(LayerReorderRequest{
		Targets: []scene.SelectionItem{{Type: scene.SelectionImage, ID: imgID}},
	})
	frontBytes, err := Dispatch("Layer.BringToFront", frontReq)
	if err != nil {
		t.Fatalf("Layer.BringToFront failed: %v", err)
	}
	var frontRes LayerReorderResponse
	if err := json.Unmarshal(frontBytes, &frontRes); err != nil || !frontRes.Success {
		t.Fatalf("Layer.BringToFront mismatch: %+v", frontRes)
	}

	// 7. Layer.SetVisibility and Layer.SetLocked
	visReq, _ := json.Marshal(LayerVisibilityRequest{
		Type:    scene.SelectionImage,
		ID:      imgID,
		Visible: false,
	})
	visBytes, err := Dispatch("Layer.SetVisibility", visReq)
	if err != nil {
		t.Fatalf("Layer.SetVisibility failed: %v", err)
	}
	var visRes LayerVisibilityResponse
	if err := json.Unmarshal(visBytes, &visRes); err != nil || !visRes.Success {
		t.Fatalf("Layer.SetVisibility mismatch: %+v", visRes)
	}

	lockReq, _ := json.Marshal(LayerLockedRequest{
		Type:   scene.SelectionImage,
		ID:     imgID,
		Locked: true,
	})
	lockBytes, err := Dispatch("Layer.SetLocked", lockReq)
	if err != nil {
		t.Fatalf("Layer.SetLocked failed: %v", err)
	}
	var lockRes LayerLockedResponse
	if err := json.Unmarshal(lockBytes, &lockRes); err != nil || !lockRes.Success {
		t.Fatalf("Layer.SetLocked mismatch: %+v", lockRes)
	}

	// 8. Layer.GetEffective
	effReq, _ := json.Marshal(LayerEffectiveRequest{
		Type: scene.SelectionImage,
		ID:   imgID,
	})
	effBytes, err := Dispatch("Layer.GetEffective", effReq)
	if err != nil {
		t.Fatalf("Layer.GetEffective failed: %v", err)
	}
	var effRes LayerEffectiveResponse
	if err := json.Unmarshal(effBytes, &effRes); err != nil || effRes.Visible != false || effRes.Locked != true {
		t.Fatalf("Layer.GetEffective expected visible=false, locked=true, got %+v", effRes)
	}

	// 8.5. Image.Crop and Image.ResetCrop
	cropW := 250.0
	cropH := 180.0
	cropReq, _ := json.Marshal(ImageCropRequest{
		ID: imgID,
		Crop: scene.ImageCrop{
			SourceX:      50,
			SourceY:      50,
			SourceWidth:  300,
			SourceHeight: 200,
		},
		NewW: &cropW,
		NewH: &cropH,
	})
	cropBytes, err := Dispatch("Image.Crop", cropReq)
	if err != nil {
		t.Fatalf("Image.Crop failed: %v", err)
	}
	var cropRes ImageCropResponse
	if err := json.Unmarshal(cropBytes, &cropRes); err != nil || !cropRes.Success || cropRes.Image.Crop == nil || !cropRes.Image.Crop.Enabled {
		t.Fatalf("Image.Crop mismatch: %+v", cropRes)
	}
	if cropRes.Image.Width != 250 || cropRes.Image.Height != 180 {
		t.Fatalf("Image.Crop expected 250x180, got %fx%f", cropRes.Image.Width, cropRes.Image.Height)
	}

	resetReq, _ := json.Marshal(ImageResetCropRequest{ID: imgID})
	resetBytes, err := Dispatch("Image.ResetCrop", resetReq)
	if err != nil {
		t.Fatalf("Image.ResetCrop failed: %v", err)
	}
	var resetRes ImageResetCropResponse
	if err := json.Unmarshal(resetBytes, &resetRes); err != nil || !resetRes.Success || resetRes.Image.Crop != nil {
		t.Fatalf("Image.ResetCrop mismatch: %+v", resetRes)
	}
	if resetRes.Image.Width != 500 {
		t.Fatalf("Image.ResetCrop expected restored width 500, got %f", resetRes.Image.Width)
	}

	// 8.6. Image.Clip and Image.ResetClip
	clipReq, _ := json.Marshal(ImageClipRequest{
		ID: imgID,
		Clip: scene.ImageClip{
			X:      20,
			Y:      15,
			Width:  180,
			Height: 120,
		},
	})
	clipBytes, err := Dispatch("Image.Clip", clipReq)
	if err != nil {
		t.Fatalf("Image.Clip failed: %v", err)
	}
	var clipRes ImageClipResponse
	if err := json.Unmarshal(clipBytes, &clipRes); err != nil || !clipRes.Success || clipRes.Image.Clip == nil || !clipRes.Image.Clip.Enabled {
		t.Fatalf("Image.Clip mismatch: %+v", clipRes)
	}
	if clipRes.Image.Clip.Width != 180 || clipRes.Image.Clip.Height != 120 {
		t.Fatalf("Image.Clip expected 180x120, got %fx%f", clipRes.Image.Clip.Width, clipRes.Image.Clip.Height)
	}

	resetClipReq, _ := json.Marshal(ImageResetClipRequest{ID: imgID})
	resetClipBytes, err := Dispatch("Image.ResetClip", resetClipReq)
	if err != nil {
		t.Fatalf("Image.ResetClip failed: %v", err)
	}
	var resetClipRes ImageResetClipResponse
	if err := json.Unmarshal(resetClipBytes, &resetClipRes); err != nil || !resetClipRes.Success || resetClipRes.Image.Clip != nil {
		t.Fatalf("Image.ResetClip mismatch: %+v", resetClipRes)
	}

	// 9. Image.Delete
	delReq, _ := json.Marshal(ImageDeleteRequest{ID: imgID})
	delBytes, err := Dispatch("Image.Delete", delReq)
	if err != nil {
		t.Fatalf("Image.Delete failed: %v", err)
	}
	var delRes ImageDeleteResponse
	if err := json.Unmarshal(delBytes, &delRes); err != nil || !delRes.Success {
		t.Fatalf("Image.Delete mismatch: %+v", delRes)
	}
}

func TestLayerReorderProtocolPayloads(t *testing.T) {
	activeScene = scene.NewScene()

	// Setup scene objects
	n1 := activeScene.CreateNode(scene.Node{Shape: "rect", Text: "Node 1"}, nil, false)
	n2 := activeScene.CreateNode(scene.Node{Shape: "circle", Text: "Node 2"}, nil, false)
	f1 := activeScene.CreateFlow(scene.Flow{Route: "straight", Color: "#ff0000"})
	g1 := activeScene.CreateGlow(scene.Glow{Name: "Glow 1", X: 10, Y: 10})
	img1, err := activeScene.CreateImage(scene.Image{Name: "Img 1", Width: 100, Height: 100})
	if err != nil {
		t.Fatalf("CreateImage failed: %v", err)
	}

	// Create a group with Node 1 and Flow 1
	grp1, err := activeScene.CreateGroup("Group 1", []scene.GroupMember{
		{Type: scene.SelectionNode, ID: n1.ID},
		{Type: scene.SelectionFlow, ID: f1.ID},
	})
	if err != nil {
		t.Fatalf("CreateGroup failed: %v", err)
	}

	// Create a group containing Image 1 and Glow 1
	grp2, err := activeScene.CreateGroup("Group 2", []scene.GroupMember{
		{Type: scene.SelectionImage, ID: img1.ID},
		{Type: scene.SelectionGlow, ID: g1.ID},
	})
	if err != nil {
		t.Fatalf("CreateGroup 2 failed: %v", err)
	}

	// 1. Regression test: malformed payload with object instead of array (the original defect)
	malformedJSON := []byte(`{"targets":{"type":"node","id":"` + string(n1.ID) + `"}}`)
	_, err = Dispatch("Layer.BringToFront", malformedJSON)
	if err == nil {
		t.Fatal("Expected error when targets is an object instead of array, got nil")
	}

	// 2. Empty selection test
	emptyJSON := []byte(`{"targets":[]}`)
	respBytes, err := Dispatch("Layer.BringToFront", emptyJSON)
	if err != nil {
		t.Fatalf("Dispatch Layer.BringToFront with empty array failed unexpectedly: %v", err)
	}
	var emptyResp LayerReorderResponse
	if err := json.Unmarshal(respBytes, &emptyResp); err != nil || emptyResp.Success {
		t.Fatalf("Expected failure for empty targets, got: %+v", emptyResp)
	}

	// 3. Invalid object type test
	invalidTypeJSON := []byte(`{"targets":[{"type":"camera","id":"start"}]}`)
	respBytes, err = Dispatch("Layer.BringToFront", invalidTypeJSON)
	if err != nil {
		t.Fatalf("Dispatch Layer.BringToFront failed: %v", err)
	}
	var invalidResp LayerReorderResponse
	if err := json.Unmarshal(respBytes, &invalidResp); err != nil || invalidResp.Success {
		t.Fatalf("Expected failure for invalid target type, got: %+v", invalidResp)
	}

	// 4. Nonexistent object test
	nonexistentJSON := []byte(`{"targets":[{"type":"node","id":"99999"}]}`)
	respBytes, err = Dispatch("Layer.BringToFront", nonexistentJSON)
	if err != nil {
		t.Fatalf("Dispatch Layer.BringToFront failed: %v", err)
	}
	var nonexistResp LayerReorderResponse
	if err := json.Unmarshal(respBytes, &nonexistResp); err != nil || nonexistResp.Success {
		t.Fatalf("Expected failure for nonexistent target, got: %+v", nonexistResp)
	}

	// 5. Valid single shape: all four commands
	commands := []string{"Layer.BringToFront", "Layer.SendToBack", "Layer.BringForward", "Layer.SendBackward"}
	for _, cmd := range commands {
		singleShapeJSON := []byte(`{"targets":[{"type":"node","id":"` + string(n2.ID) + `"}]}`)
		respBytes, err := Dispatch(cmd, singleShapeJSON)
		if err != nil {
			t.Fatalf("Dispatch %s failed: %v", cmd, err)
		}
		var resp LayerReorderResponse
		if err := json.Unmarshal(respBytes, &resp); err != nil || !resp.Success {
			t.Fatalf("%s failed: %+v", cmd, resp)
		}
	}

	// 6. Multiple selected shapes
	multiShapeJSON := []byte(`{"targets":[{"type":"node","id":"` + string(n1.ID) + `"},{"type":"node","id":"` + string(n2.ID) + `"}]}`)
	respBytes, err = Dispatch("Layer.BringToFront", multiShapeJSON)
	if err != nil {
		t.Fatalf("Dispatch Layer.BringToFront with multi-shapes failed: %v", err)
	}
	var multiResp LayerReorderResponse
	if err := json.Unmarshal(respBytes, &multiResp); err != nil || !multiResp.Success {
		t.Fatalf("Multi-shape reorder failed: %+v", multiResp)
	}

	// 7. Shape + Flow
	shapeFlowJSON := []byte(`{"targets":[{"type":"node","id":"` + string(n1.ID) + `"},{"type":"flow","id":"` + string(f1.ID) + `"}]}`)
	respBytes, err = Dispatch("Layer.SendToBack", shapeFlowJSON)
	if err != nil {
		t.Fatalf("Dispatch Layer.SendToBack with shape+flow failed: %v", err)
	}
	var sfResp LayerReorderResponse
	if err := json.Unmarshal(respBytes, &sfResp); err != nil || !sfResp.Success {
		t.Fatalf("Shape+Flow reorder failed: %+v", sfResp)
	}

	// 8. One imported image
	imageJSON := []byte(`{"targets":[{"type":"image","id":"` + string(img1.ID) + `"}]}`)
	respBytes, err = Dispatch("Layer.BringToFront", imageJSON)
	if err != nil {
		t.Fatalf("Dispatch Layer.BringToFront with image failed: %v", err)
	}
	var imgResp LayerReorderResponse
	if err := json.Unmarshal(respBytes, &imgResp); err != nil || !imgResp.Success {
		t.Fatalf("Image reorder failed: %+v", imgResp)
	}

	// 9. Selected group
	groupJSON := []byte(`{"targets":[{"type":"group","id":"` + string(grp1.ID) + `"}]}`)
	respBytes, err = Dispatch("Layer.BringToFront", groupJSON)
	if err != nil {
		t.Fatalf("Dispatch Layer.BringToFront with group failed: %v", err)
	}
	var grpResp LayerReorderResponse
	if err := json.Unmarshal(respBytes, &grpResp); err != nil || !grpResp.Success {
		t.Fatalf("Group reorder failed: %+v", grpResp)
	}

	// 10. Group containing Image + Glow
	grp2JSON := []byte(`{"targets":[{"type":"group","id":"` + string(grp2.ID) + `"}]}`)
	respBytes, err = Dispatch("Layer.SendToBack", grp2JSON)
	if err != nil {
		t.Fatalf("Dispatch Layer.SendToBack with group containing image failed: %v", err)
	}
	var grp2Resp LayerReorderResponse
	if err := json.Unmarshal(respBytes, &grp2Resp); err != nil || !grp2Resp.Success {
		t.Fatalf("Group 2 reorder failed: %+v", grp2Resp)
	}

	// 11. Numeric versus string IDs in JSON
	numericIDJSON := []byte(`{"targets":[{"type":"node","id":` + string(n1.ID) + `}]}`)
	respBytes, err = Dispatch("Layer.BringForward", numericIDJSON)
	if err != nil {
		t.Fatalf("Dispatch Layer.BringForward with numeric ID failed: %v", err)
	}
	var numResp LayerReorderResponse
	if err := json.Unmarshal(respBytes, &numResp); err != nil || !numResp.Success {
		t.Fatalf("Numeric ID reorder failed: %+v", numResp)
	}

	// 12. Duplicate IDs
	duplicateJSON := []byte(`{"targets":[{"type":"node","id":"` + string(n1.ID) + `"},{"type":"node","id":"` + string(n1.ID) + `"}]}`)
	respBytes, err = Dispatch("Layer.BringToFront", duplicateJSON)
	if err != nil {
		t.Fatalf("Dispatch Layer.BringToFront with duplicates failed: %v", err)
	}
	var dupResp LayerReorderResponse
	if err := json.Unmarshal(respBytes, &dupResp); err != nil || !dupResp.Success {
		t.Fatalf("Duplicate ID reorder failed: %+v", dupResp)
	}
}

func TestDispatchBackgroundCropLifecycle(t *testing.T) {
	// Set background
	bgReq := BackgroundSetRequest{
		Background: &scene.BackgroundConfig{
			Filename:      "landscape.png",
			Src:           "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
			NaturalWidth:  1920,
			NaturalHeight: 1080,
		},
	}
	bgJSON, _ := json.Marshal(bgReq)
	respBytes, err := Dispatch("Background.Set", bgJSON)
	if err != nil {
		t.Fatalf("Background.Set failed: %v", err)
	}

	// Background.Get
	respBytes, err = Dispatch("Background.Get", nil)
	if err != nil {
		t.Fatalf("Background.Get failed: %v", err)
	}
	var getResp struct {
		Background *scene.BackgroundConfig `json:"background"`
		HasPhoto   bool                    `json:"hasPhoto"`
	}
	if err := json.Unmarshal(respBytes, &getResp); err != nil || !getResp.HasPhoto || getResp.Background == nil {
		t.Fatalf("Background.Get invalid response: %+v", getResp)
	}

	// Background.Crop
	cropReq := BackgroundCropRequest{
		Name: "Banner Crop",
		Crop: scene.BackgroundCrop{
			Enabled:      true,
			SourceX:      100,
			SourceY:      50,
			SourceWidth:  1200,
			SourceHeight: 600,
		},
	}
	cropJSON, _ := json.Marshal(cropReq)
	respBytes, err = Dispatch("Background.Crop", cropJSON)
	if err != nil {
		t.Fatalf("Background.Crop failed: %v", err)
	}
	var cropResp BackgroundCropResponse
	if err := json.Unmarshal(respBytes, &cropResp); err != nil || !cropResp.Success {
		t.Fatalf("Background.Crop unmarshal error: %+v", cropResp)
	}
	if len(cropResp.Background.CropVersions) != 2 {
		t.Fatalf("Expected 2 crop versions (Original + Banner Crop), got %d", len(cropResp.Background.CropVersions))
	}
	bannerID := cropResp.Background.ActiveCropVersionID

	// Background.CropRename
	renameReq := BackgroundCropVersionRenameRequest{
		VersionID: bannerID,
		Name:      "Hero Header",
	}
	renameJSON, _ := json.Marshal(renameReq)
	respBytes, err = Dispatch("Background.CropRename", renameJSON)
	if err != nil {
		t.Fatalf("Background.CropRename failed: %v", err)
	}
	if err := json.Unmarshal(respBytes, &cropResp); err != nil || !cropResp.Success {
		t.Fatalf("Background.CropRename unmarshal error: %+v", cropResp)
	}
	if cropResp.Background.CropVersions[1].Name != "Hero Header" {
		t.Errorf("Expected renamed 'Hero Header', got %s", cropResp.Background.CropVersions[1].Name)
	}

	// Background.CropSelect Original
	origID := cropResp.Background.CropVersions[0].ID
	selReq := BackgroundCropVersionSelectRequest{VersionID: origID}
	selJSON, _ := json.Marshal(selReq)
	respBytes, err = Dispatch("Background.CropSelect", selJSON)
	if err != nil {
		t.Fatalf("Background.CropSelect failed: %v", err)
	}
	cropResp = BackgroundCropResponse{}
	if err := json.Unmarshal(respBytes, &cropResp); err != nil || !cropResp.Success {
		t.Fatalf("Background.CropSelect unmarshal error: %+v", cropResp)
	}
	if cropResp.Background.Crop != nil && cropResp.Background.Crop.Enabled {
		t.Errorf("Expected disabled crop on Original selection, got %+v", cropResp.Background.Crop)
	}

	// Background.CropReset
	respBytes, err = Dispatch("Background.CropReset", nil)
	if err != nil {
		t.Fatalf("Background.CropReset failed: %v", err)
	}
	cropResp = BackgroundCropResponse{}
	if err := json.Unmarshal(respBytes, &cropResp); err != nil || !cropResp.Success {
		t.Fatalf("Background.CropReset unmarshal error: %+v", cropResp)
	}

	// Background.CropDelete
	delReq := BackgroundCropVersionDeleteRequest{VersionID: bannerID}
	delJSON, _ := json.Marshal(delReq)
	respBytes, err = Dispatch("Background.CropDelete", delJSON)
	if err != nil {
		t.Fatalf("Background.CropDelete failed: %v", err)
	}
	cropResp = BackgroundCropResponse{}
	if err := json.Unmarshal(respBytes, &cropResp); err != nil || !cropResp.Success {
		t.Fatalf("Background.CropDelete unmarshal error: %+v", cropResp)
	}
	if len(cropResp.Background.CropVersions) != 1 {
		t.Fatalf("Expected 1 crop version remaining, got %d", len(cropResp.Background.CropVersions))
	}
}

func TestSafePartialUpdatesAndCommandContracts(t *testing.T) {
	// =========================================================================
	// TEST A: Omitted fields unchanged
	// =========================================================================
	t.Run("TestA_OmittedFieldsUnchanged", func(t *testing.T) {
		// 1. Node
		visTrue := true
		cnReq, _ := json.Marshal(NodeCreateRequest{
			Initial: scene.Node{
				X:           45,
				Y:           55,
				Width:       200,
				Height:      100,
				Text:        "InitialText",
				FillColor:   "#ff0000",
				StrokeWidth: 4,
				Opacity:     0.8,
				Locked:      true,
				Visible:     &visTrue,
			},
		})
		cnBytes, err := Dispatch("Node.Create", cnReq)
		if err != nil {
			t.Fatalf("Node.Create failed: %v", err)
		}
		var cnRes struct {
			Node scene.Node `json:"node"`
		}
		_ = json.Unmarshal(cnBytes, &cnRes)
		nodeID := cnRes.Node.ID

		// Partial update: only Width
		unReq, _ := json.Marshal(NodeUpdateRequest{
			ID: nodeID,
			Patch: NodeUpdatePayload{
				Width: floatPtr(250),
			},
		})
		unBytes, err := Dispatch("Node.Update", unReq)
		if err != nil {
			t.Fatalf("Node.Update failed: %v", err)
		}
		var unRes struct {
			Node scene.Node `json:"node"`
		}
		_ = json.Unmarshal(unBytes, &unRes)
		n := unRes.Node
		if n.Width != 250 {
			t.Errorf("expected Width 250, got %f", n.Width)
		}
		if n.X != 45 || n.Y != 55 || n.Height != 100 || n.Text != "InitialText" || n.FillColor != "#ff0000" || n.StrokeWidth != 4 || n.Opacity != 0.8 || !n.Locked {
			t.Errorf("omitted fields modified in Node: %+v", n)
		}

		// 2. Flow
		cfReq, _ := json.Marshal(FlowCreateRequest{
			Initial: scene.Flow{
				Nodes:       []geometry.Point{{X: 10, Y: 10}, {X: 90, Y: 90}},
				LineWidth:   3,
				Curvature:   0.5,
				Speed:       2.0,
				Delay:       1.0,
				Color:       "#ffffff",
				ShowLine:    true,
				HideOnDelay: true,
			},
		})
		cfBytes, err := Dispatch("Flow.Create", cfReq)
		if err != nil {
			t.Fatalf("Flow.Create failed: %v", err)
		}
		var cfRes struct {
			Flow scene.Flow `json:"flow"`
		}
		_ = json.Unmarshal(cfBytes, &cfRes)
		flowID := cfRes.Flow.ID

		// Partial update: only Color
		ufReq, _ := json.Marshal(FlowUpdateRequest{
			ID: flowID,
			Patch: FlowUpdatePayload{
				Color: strPtr("#00ff00"),
			},
		})
		ufBytes, err := Dispatch("Flow.Update", ufReq)
		if err != nil {
			t.Fatalf("Flow.Update failed: %v", err)
		}
		var ufRes struct {
			Flow scene.Flow `json:"flow"`
		}
		_ = json.Unmarshal(ufBytes, &ufRes)
		f := ufRes.Flow
		if f.Color != "#00ff00" {
			t.Errorf("expected Color #00ff00, got %s", f.Color)
		}
		if f.LineWidth != 3 || f.Curvature != 0.5 || f.Speed != 2.0 || f.Delay != 1.0 || !f.ShowLine || !f.HideOnDelay {
			t.Errorf("omitted fields modified in Flow: %+v", f)
		}

		// 3. Camera
		_, _ = Dispatch("Camera.Update", []byte(`{
			"camera": {
				"motion": "ken-burns",
				"camDuration": 8.0,
				"startZoom": 1.5,
				"endZoom": 2.0,
				"startX": 40,
				"startY": 60
			}
		}`))
		// Partial update: only EndZoom
		ucBytes, err := Dispatch("Camera.Update", []byte(`{"camera":{"endZoom":2.5}}`))
		if err != nil {
			t.Fatalf("Camera.Update failed: %v", err)
		}
		var ucRes struct {
			Camera scene.CameraConfig `json:"camera"`
		}
		_ = json.Unmarshal(ucBytes, &ucRes)
		c := ucRes.Camera
		if c.EndZoom != 2.5 {
			t.Errorf("expected EndZoom 2.5, got %f", c.EndZoom)
		}
		if c.Motion != "ken-burns" || c.Duration != 8.0 || c.StartZoom != 1.5 || c.StartX != 40 || c.StartY != 60 {
			t.Errorf("omitted fields modified in Camera: %+v", c)
		}

		// 4. Optics
		_, _ = Dispatch("Optics.Update", []byte(`{
			"optical": {
				"type": "focus-pull",
				"startBlur": 5.0,
				"endBlur": 10.0,
				"focusDur": 3.0
			}
		}`))
		// Partial update: only StartBlur
		uoBytes, err := Dispatch("Optics.Update", []byte(`{"optical":{"startBlur":2.0}}`))
		if err != nil {
			t.Fatalf("Optics.Update failed: %v", err)
		}
		var uoRes struct {
			Optical scene.OpticalConfig `json:"optical"`
		}
		_ = json.Unmarshal(uoBytes, &uoRes)
		opt := uoRes.Optical
		if opt.StartBlur != 2.0 {
			t.Errorf("expected StartBlur 2.0, got %f", opt.StartBlur)
		}
		if opt.Type != "focus-pull" || opt.EndBlur != 10.0 || opt.FocusDur != 3.0 {
			t.Errorf("omitted fields modified in Optics: %+v", opt)
		}

		// 5. Frame
		_, _ = Dispatch("Frame.Update", []byte(`{
			"frame": {
				"frame": true,
				"frameStyle": "cyber-hud",
				"frameDepth": 30.0,
				"frameLighting": true,
				"frameShadow": 0.7
			}
		}`))
		// Partial update: only Depth
		ufrBytes, err := Dispatch("Frame.Update", []byte(`{"frame":{"frameDepth":45.0}}`))
		if err != nil {
			t.Fatalf("Frame.Update failed: %v", err)
		}
		var ufrRes struct {
			Frame scene.FrameConfig `json:"frame"`
		}
		_ = json.Unmarshal(ufrBytes, &ufrRes)
		fr := ufrRes.Frame
		if fr.Depth != 45.0 {
			t.Errorf("expected Depth 45.0, got %f", fr.Depth)
		}
		if !fr.Enabled || fr.Style != "cyber-hud" || !fr.Lighting || fr.Shadow != 0.7 {
			t.Errorf("omitted fields modified in Frame: %+v", fr)
		}

		// 6. Image
		ciReq, _ := json.Marshal(ImageCreateRequest{
			Image: scene.Image{
				Width:               400,
				Height:              300,
				X:                   50,
				Y:                   50,
				Opacity:             0.9,
				MaintainAspectRatio: true,
				Locked:              true,
			},
		})
		ciBytes, err := Dispatch("Image.Create", ciReq)
		if err != nil {
			t.Fatalf("Image.Create failed: %v", err)
		}
		var ciRes ImageCreateResponse
		_ = json.Unmarshal(ciBytes, &ciRes)
		imgID := ciRes.Image.ID

		// Partial update: only Width
		uiReq, _ := json.Marshal(ImageUpdateRequest{
			ID: imgID,
			Patch: ImageUpdatePayload{
				Width: floatPtr(480),
			},
		})
		uiBytes, err := Dispatch("Image.Update", uiReq)
		if err != nil {
			t.Fatalf("Image.Update failed: %v", err)
		}
		var uiRes ImageUpdateResponse
		_ = json.Unmarshal(uiBytes, &uiRes)
		img := uiRes.Image
		if img.Width != 480 {
			t.Errorf("expected Width 480, got %f", img.Width)
		}
		if img.Height != 300 || img.X != 50 || img.Y != 50 || img.Opacity != 0.9 || !img.MaintainAspectRatio || !img.Locked {
			t.Errorf("omitted fields modified in Image: %+v", img)
		}
	})

	// =========================================================================
	// TEST B: Explicit zero/false applied
	// =========================================================================
	t.Run("TestB_ExplicitZeroFalseApplied", func(t *testing.T) {
		// 1. Node: explicit 0.0 coordinates, 0.0 fillOpacity, 0.0 strokeWidth, false locked
		nReq, _ := json.Marshal(NodeCreateRequest{
			Initial: scene.Node{
				X:           50,
				Y:           50,
				Width:       100,
				Height:      100,
				FillOpacity: 0.8,
				StrokeWidth: 5,
				Locked:      true,
			},
		})
		nBytes, _ := Dispatch("Node.Create", nReq)
		var nRes struct{ Node scene.Node }
		_ = json.Unmarshal(nBytes, &nRes)

		unReq, _ := json.Marshal(NodeUpdateRequest{
			ID: nRes.Node.ID,
			Patch: NodeUpdatePayload{
				X:           floatPtr(0.0),
				Y:           floatPtr(0.0),
				FillOpacity: floatPtr(0.0),
				StrokeWidth: floatPtr(0.0),
				Locked:      boolPtr(false),
			},
		})
		unBytes, err := Dispatch("Node.Update", unReq)
		if err != nil {
			t.Fatalf("Node.Update failed on explicit zeros: %v", err)
		}
		var unRes struct{ Node scene.Node }
		_ = json.Unmarshal(unBytes, &unRes)
		node := unRes.Node
		if node.X != 0.0 || node.Y != 0.0 {
			t.Errorf("expected X=0, Y=0, got %f, %f", node.X, node.Y)
		}
		if node.FillOpacity != 0.0 {
			t.Errorf("expected FillOpacity=0.0, got %f", node.FillOpacity)
		}
		if node.StrokeWidth != 0.0 {
			t.Errorf("expected StrokeWidth=0.0, got %f", node.StrokeWidth)
		}
		if node.Locked {
			t.Errorf("expected Locked=false, got true")
		}

		// 2. Flow: explicit 0.0 curvature, 0.0 delay, false showLine, false hideOnDelay
		fReq, _ := json.Marshal(FlowCreateRequest{
			Initial: scene.Flow{
				Nodes:       []geometry.Point{{X: 0, Y: 0}, {X: 50, Y: 50}},
				Curvature:   0.8,
				Delay:       2.5,
				EndDelay:    1.5,
				ShowLine:    true,
				HideOnDelay: true,
			},
		})
		fBytes, _ := Dispatch("Flow.Create", fReq)
		var fRes struct{ Flow scene.Flow }
		_ = json.Unmarshal(fBytes, &fRes)

		ufReq, _ := json.Marshal(FlowUpdateRequest{
			ID: fRes.Flow.ID,
			Patch: FlowUpdatePayload{
				Curvature:   floatPtr(0.0),
				Delay:       floatPtr(0.0),
				EndDelay:    floatPtr(0.0),
				ShowLine:    boolPtr(false),
				HideOnDelay: boolPtr(false),
			},
		})
		ufBytes, err := Dispatch("Flow.Update", ufReq)
		if err != nil {
			t.Fatalf("Flow.Update failed on explicit zeros: %v", err)
		}
		var ufRes struct{ Flow scene.Flow }
		_ = json.Unmarshal(ufBytes, &ufRes)
		flow := ufRes.Flow
		if flow.Curvature != 0.0 || flow.Delay != 0.0 || flow.EndDelay != 0.0 || flow.ShowLine || flow.HideOnDelay {
			t.Errorf("failed to apply explicit zero/false on flow: %+v", flow)
		}

		// 3. Glow: explicit 0.0 delay, 0.0 blur, false isRadar
		gReq, _ := json.Marshal(GlowCreateRequest{
			Initial: scene.Glow{
				Size:     40,
				Delay:    3.0,
				Blur:     12.0,
				IsRadar:  true,
				Duration: 2.0,
			},
		})
		gBytes, _ := Dispatch("Glow.Create", gReq)
		var gRes struct{ Glow scene.Glow }
		_ = json.Unmarshal(gBytes, &gRes)

		ugReq, _ := json.Marshal(GlowUpdateRequest{
			ID: gRes.Glow.ID,
			Patch: GlowUpdatePayload{
				Delay:   floatPtr(0.0),
				Blur:    floatPtr(0.0),
				IsRadar: boolPtr(false),
			},
		})
		ugBytes, err := Dispatch("Glow.Update", ugReq)
		if err != nil {
			t.Fatalf("Glow.Update failed on explicit zeros: %v", err)
		}
		var ugRes struct{ Glow scene.Glow }
		_ = json.Unmarshal(ugBytes, &ugRes)
		glow := ugRes.Glow
		if glow.Delay != 0.0 || glow.Blur != 0.0 || glow.IsRadar {
			t.Errorf("failed to apply explicit zero/false on glow: %+v", glow)
		}

		// 4. Ripple: explicit 0.0 innerR, 0.0 delay, 0.0 refraction
		rReq, _ := json.Marshal(RippleCreateRequest{
			Initial: scene.Ripple{
				InnerR:     15,
				OuterR:     60,
				Delay:      2.0,
				Refraction: 0.5,
				Duration:   2.0,
			},
		})
		rBytes, _ := Dispatch("Ripple.Create", rReq)
		var rRes struct{ Ripple scene.Ripple }
		_ = json.Unmarshal(rBytes, &rRes)

		urReq, _ := json.Marshal(RippleUpdateRequest{
			ID: rRes.Ripple.ID,
			Patch: RippleUpdatePayload{
				InnerR:     floatPtr(0.0),
				Delay:      floatPtr(0.0),
				Refraction: floatPtr(0.0),
			},
		})
		urBytes, err := Dispatch("Ripple.Update", urReq)
		if err != nil {
			t.Fatalf("Ripple.Update failed on explicit zeros: %v", err)
		}
		var urRes struct{ Ripple scene.Ripple }
		_ = json.Unmarshal(urBytes, &urRes)
		rip := urRes.Ripple
		if rip.InnerR != 0.0 || rip.Delay != 0.0 || rip.Refraction != 0.0 {
			t.Errorf("failed to apply explicit zero on ripple: %+v", rip)
		}

		// 5. Image: explicit 0.0 X, Y, Opacity, false MaintainAspectRatio, false Locked
		imgReq, _ := json.Marshal(ImageCreateRequest{
			Image: scene.Image{
				X:                   40,
				Y:                   40,
				Width:               200,
				Height:              150,
				Opacity:             0.8,
				MaintainAspectRatio: true,
				Locked:              true,
			},
		})
		imgBytes, _ := Dispatch("Image.Create", imgReq)
		var imgRes ImageCreateResponse
		_ = json.Unmarshal(imgBytes, &imgRes)

		uimgReq, _ := json.Marshal(ImageUpdateRequest{
			ID: imgRes.Image.ID,
			Patch: ImageUpdatePayload{
				X:                   floatPtr(0.0),
				Y:                   floatPtr(0.0),
				Opacity:             floatPtr(0.0),
				MaintainAspectRatio: boolPtr(false),
				Locked:              boolPtr(false),
			},
		})
		uimgBytes, err := Dispatch("Image.Update", uimgReq)
		if err != nil {
			t.Fatalf("Image.Update failed on explicit zeros: %v", err)
		}
		var uimgRes ImageUpdateResponse
		_ = json.Unmarshal(uimgBytes, &uimgRes)
		im := uimgRes.Image
		if im.X != 0.0 || im.Y != 0.0 || im.Opacity != 0.0 || im.MaintainAspectRatio || im.Locked {
			t.Errorf("failed to apply explicit zero/false on image: %+v", im)
		}

		// 6. Camera: explicit 0.0 StartX, StartY, EndX, EndY, Sway, Breathe, TiltX, TiltY, false BgTransparent
		_, _ = Dispatch("Camera.Update", []byte(`{
			"camera": {
				"startX": 50.0,
				"startY": 50.0,
				"endX": 50.0,
				"endY": 50.0,
				"sway": 10.0,
				"breathe": 5.0,
				"tiltX": 15.0,
				"tiltY": 15.0,
				"bgTransparent": true
			}
		}`))
		cBytes, err := Dispatch("Camera.Update", []byte(`{
			"camera": {
				"startX": 0.0,
				"startY": 0.0,
				"endX": 0.0,
				"endY": 0.0,
				"sway": 0.0,
				"breathe": 0.0,
				"tiltX": 0.0,
				"tiltY": 0.0,
				"bgTransparent": false
			}
		}`))
		if err != nil {
			t.Fatalf("Camera.Update failed on explicit zeros: %v", err)
		}
		var cRes struct{ Camera scene.CameraConfig }
		_ = json.Unmarshal(cBytes, &cRes)
		cam := cRes.Camera
		if cam.StartX != 0.0 || cam.StartY != 0.0 || cam.EndX != 0.0 || cam.EndY != 0.0 || cam.Sway != 0.0 || cam.Breathe != 0.0 || cam.TiltX != 0.0 || cam.TiltY != 0.0 || cam.BgTransparent {
			t.Errorf("failed to apply explicit zero/false on camera: %+v", cam)
		}

		// 7. Optics: explicit 0.0 StartBlur, EndBlur, MBInt, MBAng
		_, _ = Dispatch("Optics.Update", []byte(`{
			"optical": {
				"type": "motion-blur",
				"startBlur": 5.0,
				"endBlur": 5.0,
				"mbInt": 12.0,
				"mbAng": 45.0
			}
		}`))
		oBytes, err := Dispatch("Optics.Update", []byte(`{
			"optical": {
				"startBlur": 0.0,
				"endBlur": 0.0,
				"mbInt": 0.0,
				"mbAng": 0.0
			}
		}`))
		if err != nil {
			t.Fatalf("Optics.Update failed on explicit zeros: %v", err)
		}
		var oRes struct{ Optical scene.OpticalConfig }
		_ = json.Unmarshal(oBytes, &oRes)
		optical := oRes.Optical
		if optical.StartBlur != 0.0 || optical.EndBlur != 0.0 || optical.MBInt != 0.0 || optical.MBAng != 0.0 {
			t.Errorf("failed to apply explicit zero on optics: %+v", optical)
		}

		// 8. Frame: explicit false frame (enabled), false frameLighting, false frameFillet, 0.0 frameDepth, 0.0 frameShadow
		_, _ = Dispatch("Frame.Update", []byte(`{
			"frame": {
				"frame": true,
				"frameLighting": true,
				"frameFillet": true,
				"frameDepth": 25.0,
				"frameShadow": 0.8
			}
		}`))
		frBytes, err := Dispatch("Frame.Update", []byte(`{
			"frame": {
				"frame": false,
				"frameLighting": false,
				"frameFillet": false,
				"frameDepth": 0.0,
				"frameShadow": 0.0
			}
		}`))
		if err != nil {
			t.Fatalf("Frame.Update failed on explicit false/zero: %v", err)
		}
		var frRes struct{ Frame scene.FrameConfig }
		_ = json.Unmarshal(frBytes, &frRes)
		frame := frRes.Frame
		if frame.Enabled || frame.Lighting || frame.Fillet || frame.Depth != 0.0 || frame.Shadow != 0.0 {
			t.Errorf("failed to apply explicit false/zero on frame: %+v", frame)
		}
	})

	// =========================================================================
	// TEST C: Empty strings cleared
	// =========================================================================
	t.Run("TestC_EmptyStringsCleared", func(t *testing.T) {
		// Node: Name, Text, Subtext
		nReq, _ := json.Marshal(NodeCreateRequest{
			Initial: scene.Node{
				Name:    "CustomNodeName",
				Text:    "CustomText",
				Subtext: "CustomSubtext",
				Width:   120,
				Height:  80,
			},
		})
		nBytes, _ := Dispatch("Node.Create", nReq)
		var nRes struct{ Node scene.Node }
		_ = json.Unmarshal(nBytes, &nRes)

		unReq, _ := json.Marshal(NodeUpdateRequest{
			ID: nRes.Node.ID,
			Patch: NodeUpdatePayload{
				Name:    strPtr(""),
				Text:    strPtr(""),
				Subtext: strPtr(""),
			},
		})
		unBytes, err := Dispatch("Node.Update", unReq)
		if err != nil {
			t.Fatalf("Node.Update failed on clearing text: %v", err)
		}
		var unRes struct{ Node scene.Node }
		_ = json.Unmarshal(unBytes, &unRes)
		if unRes.Node.Name != "" || unRes.Node.Text != "" || unRes.Node.Subtext != "" {
			t.Errorf("expected cleared strings on node, got: %+v", unRes.Node)
		}

		// Flow: Name, Label
		fReq, _ := json.Marshal(FlowCreateRequest{
			Initial: scene.Flow{
				Nodes: []geometry.Point{{X: 0, Y: 0}, {X: 40, Y: 40}},
				Name:  "FlowNameToClear",
				Label: "FlowLabelToClear",
			},
		})
		fBytes, _ := Dispatch("Flow.Create", fReq)
		var fRes struct{ Flow scene.Flow }
		_ = json.Unmarshal(fBytes, &fRes)

		ufReq, _ := json.Marshal(FlowUpdateRequest{
			ID: fRes.Flow.ID,
			Patch: FlowUpdatePayload{
				Name:  strPtr(""),
				Label: strPtr(""),
			},
		})
		ufBytes, err := Dispatch("Flow.Update", ufReq)
		if err != nil {
			t.Fatalf("Flow.Update failed on clearing strings: %v", err)
		}
		var ufRes struct{ Flow scene.Flow }
		_ = json.Unmarshal(ufBytes, &ufRes)
		if ufRes.Flow.Name != "" || ufRes.Flow.Label != "" {
			t.Errorf("expected cleared strings on flow, got: %+v", ufRes.Flow)
		}

		// Glow: Name
		gReq, _ := json.Marshal(GlowCreateRequest{
			Initial: scene.Glow{
				Size: 30,
				Name: "GlowNameToClear",
			},
		})
		gBytes, _ := Dispatch("Glow.Create", gReq)
		var gRes struct{ Glow scene.Glow }
		_ = json.Unmarshal(gBytes, &gRes)

		ugReq, _ := json.Marshal(GlowUpdateRequest{
			ID: gRes.Glow.ID,
			Patch: GlowUpdatePayload{
				Name: strPtr(""),
			},
		})
		ugBytes, err := Dispatch("Glow.Update", ugReq)
		if err != nil {
			t.Fatalf("Glow.Update failed on clearing name: %v", err)
		}
		var ugRes struct{ Glow scene.Glow }
		_ = json.Unmarshal(ugBytes, &ugRes)
		if ugRes.Glow.Name != "" {
			t.Errorf("expected cleared name on glow, got: %q", ugRes.Glow.Name)
		}

		// Ripple: Name
		rReq, _ := json.Marshal(RippleCreateRequest{
			Initial: scene.Ripple{
				InnerR: 10,
				OuterR: 40,
				Name:   "RippleNameToClear",
			},
		})
		rBytes, _ := Dispatch("Ripple.Create", rReq)
		var rRes struct{ Ripple scene.Ripple }
		_ = json.Unmarshal(rBytes, &rRes)

		urReq, _ := json.Marshal(RippleUpdateRequest{
			ID: rRes.Ripple.ID,
			Patch: RippleUpdatePayload{
				Name: strPtr(""),
			},
		})
		urBytes, err := Dispatch("Ripple.Update", urReq)
		if err != nil {
			t.Fatalf("Ripple.Update failed on clearing name: %v", err)
		}
		var urRes struct{ Ripple scene.Ripple }
		_ = json.Unmarshal(urBytes, &urRes)
		if urRes.Ripple.Name != "" {
			t.Errorf("expected cleared name on ripple, got: %q", urRes.Ripple.Name)
		}

		// Image: Name
		imReq, _ := json.Marshal(ImageCreateRequest{
			Image: scene.Image{
				Name:   "ImageNameToClear",
				Width:  100,
				Height: 100,
			},
		})
		imBytes, _ := Dispatch("Image.Create", imReq)
		var imRes ImageCreateResponse
		_ = json.Unmarshal(imBytes, &imRes)

		uimReq, _ := json.Marshal(ImageUpdateRequest{
			ID: imRes.Image.ID,
			Patch: ImageUpdatePayload{
				Name: strPtr(""),
			},
		})
		uimBytes, err := Dispatch("Image.Update", uimReq)
		if err != nil {
			t.Fatalf("Image.Update failed on clearing name: %v", err)
		}
		var uimRes ImageUpdateResponse
		_ = json.Unmarshal(uimBytes, &uimRes)
		if uimRes.Image.Name != "" {
			t.Errorf("expected cleared name on image, got: %q", uimRes.Image.Name)
		}
	})

	// =========================================================================
	// TEST D: Atomic rejection on invalid input
	// =========================================================================
	t.Run("TestD_AtomicRejectionOnInvalidInput", func(t *testing.T) {
		// 1. Node negative width
		cnReq, _ := json.Marshal(NodeCreateRequest{
			Initial: scene.Node{Width: 150, Height: 100},
		})
		cnBytes, _ := Dispatch("Node.Create", cnReq)
		var cnRes struct{ Node scene.Node }
		_ = json.Unmarshal(cnBytes, &cnRes)
		revBefore := activeScene.Revision()

		unReq, _ := json.Marshal(NodeUpdateRequest{
			ID: cnRes.Node.ID,
			Patch: NodeUpdatePayload{
				Width: floatPtr(-50),
			},
		})
		_, err := Dispatch("Node.Update", unReq)
		if err == nil {
			t.Fatalf("expected Node.Update to fail on negative width")
		}
		if activeScene.Revision() != revBefore {
			t.Errorf("revision bumped on failed update: before=%d, after=%d", revBefore, activeScene.Revision())
		}
		nodeStill := activeScene.GetNode(cnRes.Node.ID)
		if nodeStill.Width != 150 {
			t.Errorf("node modified despite validation rejection: width=%f", nodeStill.Width)
		}

		// 2. Flow negative speed
		cfReq, _ := json.Marshal(FlowCreateRequest{
			Initial: scene.Flow{
				Nodes: []geometry.Point{{X: 0, Y: 0}, {X: 20, Y: 20}},
				Speed: 2.0,
			},
		})
		cfBytes, _ := Dispatch("Flow.Create", cfReq)
		var cfRes struct{ Flow scene.Flow }
		_ = json.Unmarshal(cfBytes, &cfRes)
		revBefore = activeScene.Revision()

		ufReq, _ := json.Marshal(FlowUpdateRequest{
			ID: cfRes.Flow.ID,
			Patch: FlowUpdatePayload{
				Speed: floatPtr(-1.0),
			},
		})
		_, err = Dispatch("Flow.Update", ufReq)
		if err == nil {
			t.Fatalf("expected Flow.Update to fail on negative speed")
		}
		if activeScene.Revision() != revBefore {
			t.Errorf("revision bumped on failed flow update")
		}
		flowStill := activeScene.GetFlow(cfRes.Flow.ID)
		if flowStill.Speed != 2.0 {
			t.Errorf("flow modified despite rejection: speed=%f", flowStill.Speed)
		}

		// 3. Glow zero duration
		cgReq, _ := json.Marshal(GlowCreateRequest{
			Initial: scene.Glow{Size: 30, Duration: 2.0},
		})
		cgBytes, _ := Dispatch("Glow.Create", cgReq)
		var cgRes struct{ Glow scene.Glow }
		_ = json.Unmarshal(cgBytes, &cgRes)
		revBefore = activeScene.Revision()

		ugReq, _ := json.Marshal(GlowUpdateRequest{
			ID: cgRes.Glow.ID,
			Patch: GlowUpdatePayload{
				Duration: floatPtr(0.0),
			},
		})
		_, err = Dispatch("Glow.Update", ugReq)
		if err == nil {
			t.Fatalf("expected Glow.Update to fail on zero duration")
		}
		if activeScene.Revision() != revBefore {
			t.Errorf("revision bumped on failed glow update")
		}
		glowStill := activeScene.GetGlow(cgRes.Glow.ID)
		if glowStill.Duration != 2.0 {
			t.Errorf("glow modified despite rejection: duration=%f", glowStill.Duration)
		}

		// 4. Ripple outer radius < inner radius
		crReq, _ := json.Marshal(RippleCreateRequest{
			Initial: scene.Ripple{InnerR: 20, OuterR: 50, Duration: 2.0},
		})
		crBytes, _ := Dispatch("Ripple.Create", crReq)
		var crRes struct{ Ripple scene.Ripple }
		_ = json.Unmarshal(crBytes, &crRes)
		revBefore = activeScene.Revision()

		urReq, _ := json.Marshal(RippleUpdateRequest{
			ID: crRes.Ripple.ID,
			Patch: RippleUpdatePayload{
				OuterR: floatPtr(10), // less than InnerR (20)
			},
		})
		_, err = Dispatch("Ripple.Update", urReq)
		if err == nil {
			t.Fatalf("expected Ripple.Update to fail when OuterR < InnerR")
		}
		if activeScene.Revision() != revBefore {
			t.Errorf("revision bumped on failed ripple update")
		}
		ripStill := activeScene.GetRipple(crRes.Ripple.ID)
		if ripStill.OuterR != 50 {
			t.Errorf("ripple modified despite rejection: OuterR=%f", ripStill.OuterR)
		}

		// 5. Image negative dimensions
		ciReq, _ := json.Marshal(ImageCreateRequest{
			Image: scene.Image{Width: 100, Height: 80},
		})
		ciBytes, _ := Dispatch("Image.Create", ciReq)
		var ciRes ImageCreateResponse
		_ = json.Unmarshal(ciBytes, &ciRes)
		revBefore = activeScene.Revision()

		uiReq, _ := json.Marshal(ImageUpdateRequest{
			ID: ciRes.Image.ID,
			Patch: ImageUpdatePayload{
				Width: floatPtr(-20),
			},
		})
		uiBytes, _ := Dispatch("Image.Update", uiReq)
		var uiRes ImageUpdateResponse
		_ = json.Unmarshal(uiBytes, &uiRes)
		if uiRes.Success {
			t.Fatalf("expected Image.Update to report Success: false on negative width")
		}
		if activeScene.Revision() != revBefore {
			t.Errorf("revision bumped on failed image update")
		}
		imgStill, _ := activeScene.GetImage(ciRes.Image.ID)
		if imgStill.Width != 100 {
			t.Errorf("image modified despite rejection: width=%f", imgStill.Width)
		}

		// 6. Camera invalid motion
		_, _ = Dispatch("Camera.Update", []byte(`{"camera":{"motion":"static"}}`))
		revBefore = activeScene.Revision()
		_, err = Dispatch("Camera.Update", []byte(`{"camera":{"motion":"invalid-warp-drive"}}`))
		if err == nil {
			t.Fatalf("expected Camera.Update to fail on invalid motion")
		}
		if activeScene.Revision() != revBefore {
			t.Errorf("revision bumped on failed camera update")
		}
		if activeScene.GetCamera().Motion != "static" {
			t.Errorf("camera modified despite rejection: motion=%s", activeScene.GetCamera().Motion)
		}

		// 7. Optics invalid type
		_, _ = Dispatch("Optics.Update", []byte(`{"optical":{"type":"none"}}`))
		revBefore = activeScene.Revision()
		_, err = Dispatch("Optics.Update", []byte(`{"optical":{"type":"holographic-xray"}}`))
		if err == nil {
			t.Fatalf("expected Optics.Update to fail on invalid type")
		}
		if activeScene.Revision() != revBefore {
			t.Errorf("revision bumped on failed optics update")
		}
		if activeScene.GetOptical().Type != "none" {
			t.Errorf("optics modified despite rejection: type=%s", activeScene.GetOptical().Type)
		}
	})

	// =========================================================================
	// TEST E: Scene.SetState wrapped forms
	// =========================================================================
	t.Run("TestE_SceneSetStateWrappedForms", func(t *testing.T) {
		// Case 1: Wrapped scene with revision 0, empty nodes and flows, but background photo present
		wrappedWithBg := []byte(`{
			"snapshot": {
				"revision": 0,
				"canvas": {
					"width": 1920,
					"height": 1080,
					"duration": 5.0,
					"loop": "loop"
				},
				"background": {
					"src": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
					"sourceWidth": 1920,
					"sourceHeight": 1080
				},
				"nodes": [],
				"flows": []
			}
		}`)
		respBytes, err := Dispatch("Scene.SetState", wrappedWithBg)
		if err != nil {
			t.Fatalf("Scene.SetState failed for wrapped snapshot with bg photo: %v", err)
		}
		var stateRes SetSceneStateResponse
		_ = json.Unmarshal(respBytes, &stateRes)
		if stateRes.Status != "ok" {
			t.Errorf("expected ok status, got %s", stateRes.Status)
		}
		currentSnap := activeScene.GetSnapshot()
		if currentSnap.Background == nil || currentSnap.Background.SourceWidth != 1920 {
			t.Fatalf("Background was lost or wiped during wrapped Scene.SetState: %+v", currentSnap.Background)
		}

		// Case 2: Wrapped empty scene
		wrappedEmpty := []byte(`{"snapshot": {}}`)
		respBytes, err = Dispatch("Scene.SetState", wrappedEmpty)
		if err != nil {
			t.Fatalf("Scene.SetState failed for wrapped empty snapshot: %v", err)
		}
		_ = json.Unmarshal(respBytes, &stateRes)
		if stateRes.Status != "ok" {
			t.Errorf("expected ok status, got %s", stateRes.Status)
		}

		// Case 3: Direct snapshot format
		directSnap := []byte(`{
			"revision": 12,
			"canvas": {"width": 1280, "height": 720},
			"nodes": [{"id": "direct-node-1", "shape": "rect", "width": 100, "height": 80}]
		}`)
		respBytes, err = Dispatch("Scene.SetState", directSnap)
		if err != nil {
			t.Fatalf("Scene.SetState failed for direct snapshot: %v", err)
		}
		if len(activeScene.GetSnapshot().Nodes) != 1 || activeScene.GetSnapshot().Nodes[0].ID != "direct-node-1" {
			t.Errorf("direct snapshot nodes not set properly: %+v", activeScene.GetSnapshot().Nodes)
		}

		// Case 4: Malformed payload returns clear error
		_, err = Dispatch("Scene.SetState", []byte(`{ not valid json`))
		if err == nil {
			t.Errorf("expected error on malformed JSON payload")
		}
	})

	// =========================================================================
	// TEST F: Consistent WASM response contract
	// =========================================================================
	t.Run("TestF_ConsistentWASMResponseContract", func(t *testing.T) {
		// Non-existent command returns error
		_, err := Dispatch("NonExistent.Command", []byte(`{}`))
		if err == nil {
			t.Errorf("expected error for non-existent command")
		}

		// Update on non-existent node returns error
		_, err = Dispatch("Node.Update", []byte(`{"id": "does-not-exist-999", "patch": {"width": 100}}`))
		if err == nil {
			t.Errorf("expected error when updating non-existent node")
		}

		// Update on non-existent flow returns error
		_, err = Dispatch("Flow.Update", []byte(`{"id": "does-not-exist-888", "patch": {"color": "#fff"}}`))
		if err == nil {
			t.Errorf("expected error when updating non-existent flow")
		}
	})
}

// TestTimelineEvaluateReadOnlyIsolation verifies that Timeline.Evaluate* with custom snapshot does not mutate activeScene.
func TestTimelineEvaluateReadOnlyIsolation(t *testing.T) {
	// 1. Establish baseline scene
	_, err := Dispatch("Scene.SetState", []byte(`{"canvas": {"width": 1280, "height": 720}, "nodes": [{"id": "node-1", "shape": "box", "x": 100, "y": 100, "width": 100, "height": 50}]}`))
	if err != nil {
		t.Fatalf("Scene.SetState failed: %v", err)
	}

	snapBeforeBytes, _ := Dispatch("Scene.GetState", []byte(`{}`))
	var snapBefore scene.Snapshot
	_ = json.Unmarshal(snapBeforeBytes, &snapBefore)
	revBefore := snapBefore.Revision

	// 2. Evaluate with a temporary snapshot containing a completely different scene
	tempSnapJSON := `{"snapshot": {"canvas": {"width": 800, "height": 600}, "nodes": [{"id": "temp-node-99", "shape": "circle", "x": 50, "y": 50, "width": 80, "height": 80}]}}`
	_, err = Dispatch("Timeline.EvaluateSceneAtTime", []byte(tempSnapJSON))
	if err != nil {
		t.Fatalf("Timeline.EvaluateSceneAtTime with snapshot failed: %v", err)
	}

	// 3. Verify activeScene is untouched
	snapAfterBytes, _ := Dispatch("Scene.GetState", []byte(`{}`))
	var snapAfter scene.Snapshot
	_ = json.Unmarshal(snapAfterBytes, &snapAfter)

	if snapAfter.Revision != revBefore {
		t.Errorf("expected activeScene revision %d, got %d", revBefore, snapAfter.Revision)
	}
	if len(snapAfter.Nodes) != 1 || snapAfter.Nodes[0].ID != "node-1" {
		t.Errorf("activeScene was overwritten by timeline evaluation: %+v", snapAfter.Nodes)
	}
	if snapAfter.Canvas.Width != 1280 {
		t.Errorf("activeScene canvas was overwritten by timeline evaluation: width = %f", snapAfter.Canvas.Width)
	}

	// 4. Test EvaluateBatch with snapshot
	batchReq := `{"times": [0.0, 1.0, 2.0], "snapshot": {"canvas": {"width": 640, "height": 480}, "nodes": []}}`
	_, err = Dispatch("Timeline.EvaluateBatch", []byte(batchReq))
	if err != nil {
		t.Fatalf("Timeline.EvaluateBatch with snapshot failed: %v", err)
	}

	snapBatchAfterBytes, _ := Dispatch("Scene.GetState", []byte(`{}`))
	var snapBatchAfter scene.Snapshot
	_ = json.Unmarshal(snapBatchAfterBytes, &snapBatchAfter)
	if snapBatchAfter.Revision != revBefore || len(snapBatchAfter.Nodes) != 1 {
		t.Errorf("activeScene was overwritten by Timeline.EvaluateBatch")
	}
}
