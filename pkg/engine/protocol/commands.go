package protocol

import (
	"encoding/json"
	"errors"
	"fmt"
	"runtime"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
)

// ProtocolVersion defines the current contract version between engine and host/bridge.
const ProtocolVersion = "1.0.0"

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

	default:
		return nil, errors.New("unknown engine command: " + command)
	}
}
