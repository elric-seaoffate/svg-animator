package protocol

import (
	"encoding/json"
	"errors"
	"fmt"
	"runtime"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/scene"
	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/timeline"
)

// ProtocolVersion defines the current contract version between engine and host/bridge.
const ProtocolVersion = "1.0.0"

var activeScene = scene.NewScene()

// EngineInfo describes the Go WebAssembly runtime and capabilities.
type EngineInfo struct {
	Version   string `json:"version"`
	GoVersion string `json:"goVersion"`
	Platform  string `json:"platform"`
	Status    string `json:"status"`
}

// GenerateFlowPathRequest is the payload for "Geometry.GenerateFlowPath".
type GenerateFlowPathRequest struct {
	Nodes     []geometry.Point `json:"nodes"`
	Curvature float64          `json:"curvature"`
	Width     float64          `json:"width"`
	Height    float64          `json:"height"`
	RouteMode string           `json:"routeMode"`
}

// GenerateFlowPathResponse contains the computed SVG path string and midpoint.
type GenerateFlowPathResponse struct {
	Path     string         `json:"path"`
	Midpoint geometry.Point `json:"midpoint"`
}

// ComputeSnappedPositionRequest is the payload for "Geometry.ComputeSnappedPosition".
type ComputeSnappedPositionRequest struct {
	XPct       float64             `json:"xPct"`
	YPct       float64             `json:"yPct"`
	SnapConfig geometry.SnapConfig `json:"snapConfig"`
}

// ComputeSnappedPositionResponse contains the snapped point.
type ComputeSnappedPositionResponse struct {
	Point geometry.Point `json:"point"`
}

// SetSceneStateRequest is the payload for "Scene.SetState".
type SetSceneStateRequest struct {
	Snapshot scene.Snapshot `json:"snapshot"`
}

// SetSceneStateResponse reports the active scene revision after state replacement.
type SetSceneStateResponse struct {
	Revision   int64  `json:"revision"`
	FlowsCount int    `json:"flowsCount"`
	Status     string `json:"status"`
}

// EvaluateSceneAtTimeRequest is the payload for "Timeline.EvaluateSceneAtTime".
type EvaluateSceneAtTimeRequest struct {
	Time     float64         `json:"time"`
	Snapshot *scene.Snapshot `json:"snapshot,omitempty"`
}

// EvaluateBatchRequest is the payload for "Timeline.EvaluateBatch".
type EvaluateBatchRequest struct {
	Times    []float64       `json:"times"`
	Snapshot *scene.Snapshot `json:"snapshot,omitempty"`
}

// Dispatch processes incoming commands and returns JSON-encoded responses.
func Dispatch(command string, payloadJSON []byte) ([]byte, error) {
	switch command {
	case "Engine.Ping":
		info := EngineInfo{
			Version:   ProtocolVersion,
			GoVersion: runtime.Version(),
			Platform:  runtime.GOOS + "/" + runtime.GOARCH,
			Status:    "ready",
		}
		return json.Marshal(info)

	case "Geometry.GenerateFlowPath":
		var req GenerateFlowPathRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding GenerateFlowPathRequest: %w", err)
		}
		path := geometry.GenerateFlowPath(req.Nodes, req.Curvature, req.Width, req.Height, req.RouteMode)
		mid := geometry.GetFlowMidpoint(req.Nodes, req.Curvature, req.Width, req.Height)
		return json.Marshal(GenerateFlowPathResponse{
			Path:     path,
			Midpoint: mid,
		})

	case "Geometry.ComputeSnappedPosition":
		var req ComputeSnappedPositionRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding ComputeSnappedPositionRequest: %w", err)
		}
		pt := geometry.ComputeSnappedPosition(req.XPct, req.YPct, req.SnapConfig)
		return json.Marshal(ComputeSnappedPositionResponse{
			Point: pt,
		})

	case "Scene.SetState":
		var req SetSceneStateRequest
		if err := json.Unmarshal(payloadJSON, &req); err == nil && (len(req.Snapshot.Flows) > 0 || req.Snapshot.Revision > 0 || len(req.Snapshot.Nodes) > 0) {
			activeScene.SetFromSnapshot(req.Snapshot)
			return json.Marshal(SetSceneStateResponse{
				Revision:   activeScene.Revision(),
				FlowsCount: len(req.Snapshot.Flows),
				Status:     "ok",
			})
		}
		var directSnap scene.Snapshot
		if err := json.Unmarshal(payloadJSON, &directSnap); err != nil {
			return nil, fmt.Errorf("decoding SetSceneStateRequest: %w", err)
		}
		activeScene.SetFromSnapshot(directSnap)
		return json.Marshal(SetSceneStateResponse{
			Revision:   activeScene.Revision(),
			FlowsCount: len(directSnap.Flows),
			Status:     "ok",
		})

	case "Scene.GetState":
		snap := activeScene.GetSnapshot()
		return json.Marshal(snap)

	case "Scene.UpdateFlow":
		var f scene.Flow
		if err := json.Unmarshal(payloadJSON, &f); err != nil {
			return nil, fmt.Errorf("decoding UpdateFlow: %w", err)
		}
		activeScene.UpdateFlow(f)
		return json.Marshal(map[string]any{"revision": activeScene.Revision(), "status": "ok"})

	case "Scene.RemoveFlow":
		var req struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding RemoveFlow: %w", err)
		}
		ok := activeScene.RemoveFlow(req.ID)
		return json.Marshal(map[string]any{"removed": ok, "revision": activeScene.Revision()})

	case "Timeline.EvaluateSceneAtTime":
		var req EvaluateSceneAtTimeRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding EvaluateSceneAtTimeRequest: %w", err)
		}
		if req.Snapshot != nil {
			activeScene.SetFromSnapshot(*req.Snapshot)
		}
		res := timeline.EvaluateSceneAtTime(activeScene, req.Time)
		return json.Marshal(res)

	case "Timeline.EvaluateBatch":
		var req EvaluateBatchRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding EvaluateBatchRequest: %w", err)
		}
		if req.Snapshot != nil {
			activeScene.SetFromSnapshot(*req.Snapshot)
		}
		results := make([]timeline.FrameResult, len(req.Times))
		for i, t := range req.Times {
			results[i] = timeline.EvaluateSceneAtTime(activeScene, t)
		}
		return json.Marshal(results)

	default:
		return nil, errors.New("unknown engine command: " + command)
	}
}
