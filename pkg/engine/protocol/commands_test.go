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


func TestDispatchUnknownCommand(t *testing.T) {
	_, err := Dispatch("Unknown.Action", nil)
	if err == nil {
		t.Errorf("expected error on unknown command")
	}
}
