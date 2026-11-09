package protocol

import (
	"encoding/json"
	"testing"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
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

func TestDispatchUnknownCommand(t *testing.T) {
	_, err := Dispatch("Unknown.Action", nil)
	if err == nil {
		t.Errorf("expected error on unknown command")
	}
}
