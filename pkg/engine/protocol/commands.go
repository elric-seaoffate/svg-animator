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

// ShapeDescribeRequest is the payload for "Shape.Describe".
type ShapeDescribeRequest struct {
	Shape    string  `json:"shape"`
	Width    float64 `json:"width"`
	Height   float64 `json:"height"`
	Text     string  `json:"text,omitempty"`
	Subtext  string  `json:"subtext,omitempty"`
	FontSize float64 `json:"fontSize,omitempty"`
}

// PresetApplyRequest is the payload for "Preset.Apply".
type PresetApplyRequest struct {
	Node   scene.Node         `json:"node"`
	Preset scene.PresetConfig `json:"preset"`
}

// PresetExtractRequest is the payload for "Preset.Extract".
type PresetExtractRequest struct {
	Node   scene.Node         `json:"node"`
	Preset scene.PresetConfig `json:"preset"`
}

// NodeCreateRequest is the payload for "Node.Create".
type NodeCreateRequest struct {
	Initial scene.Node          `json:"initial"`
	Preset  *scene.PresetConfig `json:"preset,omitempty"`
	Snap    bool                `json:"snap"`
}

// NodeUpdateRequest is the payload for "Node.Update".
type NodeUpdateRequest struct {
	ID    scene.StringID `json:"id"`
	Patch scene.Node     `json:"patch"`
}

// NodeDeleteRequest is the payload for "Node.Delete".
type NodeDeleteRequest struct {
	ID scene.StringID `json:"id"`
}

// NodeFindAtRequest is the payload for "Node.FindAt".
type NodeFindAtRequest struct {
	XPct    float64 `json:"xPct"`
	YPct    float64 `json:"yPct"`
	CanvasW float64 `json:"canvasW"`
	CanvasH float64 `json:"canvasH"`
}

// NodeGetBoundsRequest is the payload for "Node.GetBounds".
type NodeGetBoundsRequest struct {
	ID      scene.StringID `json:"id"`
	CanvasW float64        `json:"canvasW"`
	CanvasH float64        `json:"canvasH"`
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
			ID scene.StringID `json:"id"`
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

	case "Shape.GetCatalog":
		catalog := geometry.GetShapeCatalog()
		return json.Marshal(catalog)

	case "Shape.Describe":
		var req ShapeDescribeRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding ShapeDescribeRequest: %w", err)
		}
		desc := geometry.DescribeShape(req.Shape, req.Width, req.Height, req.Text, req.Subtext, req.FontSize)
		return json.Marshal(desc)

	case "Preset.GetDefaults":
		defaults := scene.DefaultPreset()
		return json.Marshal(defaults)

	case "Preset.Apply":
		var req PresetApplyRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding PresetApplyRequest: %w", err)
		}
		changed := req.Preset.ApplyPresetToNode(&req.Node)
		return json.Marshal(map[string]any{
			"node":    req.Node,
			"changed": changed,
		})

	case "Preset.Extract":
		var req PresetExtractRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding PresetExtractRequest: %w", err)
		}
		req.Preset.ExtractPresetFromNode(req.Node)
		return json.Marshal(req.Preset)

	case "Node.Create":
		var req NodeCreateRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding NodeCreateRequest: %w", err)
		}
		created := activeScene.CreateNode(req.Initial, req.Preset, req.Snap)
		return json.Marshal(map[string]any{
			"node":     created,
			"revision": activeScene.Revision(),
		})

	case "Node.Update":
		var req NodeUpdateRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding NodeUpdateRequest: %w", err)
		}
		existing := activeScene.GetNode(req.ID)
		if existing == nil {
			return nil, fmt.Errorf("node with id %q not found", req.ID)
		}
		updated := *existing
		if req.Patch.Shape != "" {
			updated.Shape = geometry.NormalizeShapeID(req.Patch.Shape)
		}
		if req.Patch.Text != "" {
			updated.Text = req.Patch.Text
			updated.Label = req.Patch.Text
		} else if req.Patch.Label != "" {
			updated.Text = req.Patch.Label
			updated.Label = req.Patch.Label
		}
		if req.Patch.Subtext != "" {
			updated.Subtext = req.Patch.Subtext
		}
		if req.Patch.X != 0 {
			updated.X = req.Patch.X
		}
		if req.Patch.Y != 0 {
			updated.Y = req.Patch.Y
		}
		if req.Patch.Width > 0 {
			updated.Width = req.Patch.Width
		}
		if req.Patch.Height > 0 {
			updated.Height = req.Patch.Height
		}
		if req.Patch.FillColor != "" {
			updated.FillColor = req.Patch.FillColor
			updated.Fill = req.Patch.FillColor
		} else if req.Patch.Fill != "" {
			updated.FillColor = req.Patch.Fill
			updated.Fill = req.Patch.Fill
		}
		if req.Patch.StrokeColor != "" {
			updated.StrokeColor = req.Patch.StrokeColor
			updated.Stroke = req.Patch.StrokeColor
		} else if req.Patch.Stroke != "" {
			updated.StrokeColor = req.Patch.Stroke
			updated.Stroke = req.Patch.Stroke
		}
		if req.Patch.TextColor != "" {
			updated.TextColor = req.Patch.TextColor
		}
		if req.Patch.FontSize > 0 {
			updated.FontSize = req.Patch.FontSize
		}
		if req.Patch.FillOpacity > 0 {
			updated.FillOpacity = req.Patch.FillOpacity
		}
		if req.Patch.StrokeWidth > 0 {
			updated.StrokeWidth = req.Patch.StrokeWidth
		}
		if req.Patch.StrokeStyle != "" {
			updated.StrokeStyle = req.Patch.StrokeStyle
		}
		if req.Patch.Anim != "" {
			updated.Anim = req.Patch.Anim
			updated.Animation = req.Patch.Anim
		} else if req.Patch.Animation != "" {
			updated.Anim = req.Patch.Animation
			updated.Animation = req.Patch.Animation
		}
		activeScene.UpdateNode(updated)
		return json.Marshal(map[string]any{
			"node":     updated,
			"revision": activeScene.Revision(),
		})

	case "Node.Delete":
		var req NodeDeleteRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding NodeDeleteRequest: %w", err)
		}
		deleted := activeScene.RemoveNode(req.ID)
		return json.Marshal(map[string]any{
			"deleted":  deleted,
			"revision": activeScene.Revision(),
		})

	case "Node.Get":
		var req struct {
			ID scene.StringID `json:"id"`
		}
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding Node.Get request: %w", err)
		}
		node := activeScene.GetNode(req.ID)
		return json.Marshal(node)

	case "Node.FindAt":
		var req NodeFindAtRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding NodeFindAtRequest: %w", err)
		}
		found := activeScene.FindNodeAt(req.XPct, req.YPct, req.CanvasW, req.CanvasH)
		return json.Marshal(found)

	case "Node.GetBounds":
		var req NodeGetBoundsRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding NodeGetBoundsRequest: %w", err)
		}
		node := activeScene.GetNode(req.ID)
		if node == nil {
			return nil, fmt.Errorf("node %q not found", req.ID)
		}
		eff := activeScene.GetNodeEffectiveProps(*node)
		desc := geometry.DescribeShape(node.Shape, eff.Width, eff.Height, node.Text, node.Subtext, eff.FontSize)
		canvasW := req.CanvasW
		if canvasW <= 0 {
			canvasW = 1280
		}
		canvasH := req.CanvasH
		if canvasH <= 0 {
			canvasH = 720
		}
		cx := (node.X / 100.0) * canvasW
		cy := (node.Y / 100.0) * canvasH
		return json.Marshal(map[string]any{
			"node":   node,
			"cx":     cx,
			"cy":     cy,
			"bounds": desc.Bounds,
			"screenRect": map[string]float64{
				"left":   cx + desc.Bounds.MinX,
				"top":    cy + desc.Bounds.MinY,
				"right":  cx + desc.Bounds.MaxX,
				"bottom": cy + desc.Bounds.MaxY,
				"width":  desc.Bounds.Width,
				"height": desc.Bounds.Height,
			},
		})

	default:
		return nil, errors.New("unknown engine command: " + command)
	}
}
