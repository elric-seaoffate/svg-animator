package scene

import (
	"errors"
	"math"
	"strconv"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
)

// ValidateFlow checks that flow properties conform to valid operational parameters.
func ValidateFlow(f *Flow) error {
	if f == nil {
		return errors.New("nil flow")
	}
	if len(f.Nodes) < 2 {
		return errors.New("flow must contain at least 2 waypoints")
	}
	if f.Speed <= 0 {
		return errors.New("speed must be greater than 0")
	}
	if f.Opacity < 0 || f.Opacity > 1.0 {
		return errors.New("opacity must be between 0.0 and 1.0")
	}
	return nil
}

// CreateFlow adds a new flow connector to the scene with authoritative defaults and identity.
func (s *Scene) CreateFlow(initial Flow) Flow {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.flowsCounter++
	if initial.ID == "" {
		initial.ID = StringID(strconv.FormatInt(s.flowsCounter, 10))
	} else if idNum, err := strconv.ParseInt(string(initial.ID), 10, 64); err == nil && idNum > s.flowsCounter {
		s.flowsCounter = idNum
	}

	if len(initial.Nodes) < 2 {
		initial.Nodes = []geometry.Point{{X: 25, Y: 50}, {X: 75, Y: 50}}
	} else {
		// Clone waypoints to avoid external mutation
		cloned := make([]geometry.Point, len(initial.Nodes))
		copy(cloned, initial.Nodes)
		initial.Nodes = cloned
	}

	if initial.Type == "" {
		initial.Type = "orb"
	}
	if initial.RouteMode == "" {
		if initial.Route != "" {
			initial.RouteMode = initial.Route
		} else {
			initial.RouteMode = "curve"
		}
	}
	if initial.LineStyle == "" {
		initial.LineStyle = "dashed"
	}
	if initial.Arrow == "" {
		initial.Arrow = "none"
	}
	if initial.LineWidth <= 0 {
		initial.LineWidth = 2.5
	}
	if initial.Color == "" {
		initial.Color = "#00ffcc"
	}
	if initial.Opacity <= 0 {
		initial.Opacity = 1.0
	}
	if initial.Glow <= 0 {
		initial.Glow = 20
	}
	if initial.Scale <= 0 {
		initial.Scale = 1.0
	}
	if initial.Speed <= 0 {
		initial.Speed = 2.0
	}

	// Always default showLine to true if not explicitly false
	// Note: in Go struct, zero-value is false, but SVG Animator default is showLine=true
	if !initial.ShowLine && initial.LineWidth >= 2.5 && initial.Color == "#00ffcc" && initial.Arrow == "none" {
		initial.ShowLine = true
	}

	// Connect endpoints to referenced nodes if they exist
	if initial.FromNodeID != "" {
		if fromNode, ok := s.nodes[initial.FromNodeID]; ok {
			initial.Nodes[0] = geometry.Point{X: fromNode.X, Y: fromNode.Y}
		}
	}
	if initial.ToNodeID != "" {
		if toNode, ok := s.nodes[initial.ToNodeID]; ok {
			initial.Nodes[len(initial.Nodes)-1] = geometry.Point{X: toNode.X, Y: toNode.Y}
		}
	}

	if _, exists := s.flows[initial.ID]; !exists {
		s.flowIDs = append(s.flowIDs, initial.ID)
		if len(s.layers) > 0 {
			s.layers = append(s.layers, LayerEntry{Type: SelectionFlow, ID: initial.ID})
		}
	}
	s.flows[initial.ID] = initial
	s.revision++

	return initial
}

// GetFlow returns a pointer to a copy of the flow by ID, or nil if not found.
func (s *Scene) GetFlow(id StringID) *Flow {
	s.mu.RLock()
	defer s.mu.RUnlock()
	f, exists := s.flows[id]
	if !exists {
		return nil
	}
	res := f
	return &res
}

// GetAllFlows returns all flows in scene order.
func (s *Scene) GetAllFlows() []Flow {
	s.mu.RLock()
	defer s.mu.RUnlock()
	res := make([]Flow, len(s.flowIDs))
	for i, id := range s.flowIDs {
		res[i] = s.flows[id]
	}
	return res
}

// FindFlowAt hit-tests canvas percent coordinates against all flows, returning the topmost match.
func (s *Scene) FindFlowAt(xPct, yPct, canvasW, canvasH float64) *Flow {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if canvasW <= 0 {
		canvasW = s.canvas.Width
	}
	if canvasW <= 0 {
		canvasW = 1280
	}
	if canvasH <= 0 {
		canvasH = s.canvas.Height
	}
	if canvasH <= 0 {
		canvasH = 720
	}

	testPx := (xPct / 100.0) * canvasW
	testPy := (yPct / 100.0) * canvasH

	// Inspect in reverse scene order (topmost first)
	for i := len(s.flowIDs) - 1; i >= 0; i-- {
		id := s.flowIDs[i]
		f := s.flows[id]
		routeMode := f.RouteMode
		if routeMode == "" {
			routeMode = f.Route
		}
		if routeMode == "" {
			routeMode = "curve"
		}

		dist := geometry.DistanceToFlowPath(f.Nodes, f.Curvature, canvasW, canvasH, routeMode, testPx, testPy)
		tolerance := math.Max(12.0, (f.LineWidth/2.0)+8.0)

		if dist <= tolerance {
			res := f
			return &res
		}
	}
	return nil
}

// GetFlowBounds calculates the pixel bounding box and midpoint for a flow.
func (s *Scene) GetFlowBounds(f Flow, canvasW, canvasH float64) (geometry.FlowBounds, geometry.Point) {
	if canvasW <= 0 {
		canvasW = s.canvas.Width
	}
	if canvasW <= 0 {
		canvasW = 1280
	}
	if canvasH <= 0 {
		canvasH = s.canvas.Height
	}
	if canvasH <= 0 {
		canvasH = 720
	}
	routeMode := f.RouteMode
	if routeMode == "" {
		routeMode = f.Route
	}
	if routeMode == "" {
		routeMode = "curve"
	}
	return geometry.ComputeFlowBounds(f.Nodes, f.Curvature, canvasW, canvasH, routeMode)
}

// AddWaypoint appends a new waypoint to the specified flow.
func (s *Scene) AddWaypoint(flowID StringID, x, y *float64) (Flow, int, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	f, exists := s.flows[flowID]
	if !exists || len(f.Nodes) == 0 {
		return Flow{}, 0, false
	}

	last := f.Nodes[len(f.Nodes)-1]
	var nextPt geometry.Point
	if x != nil && y != nil {
		nextPt = geometry.Point{X: *x, Y: *y}
	} else {
		nextPt = geometry.Point{
			X: math.Min(95, last.X+5),
			Y: math.Min(95, last.Y+5),
		}
	}

	f.Nodes = append(f.Nodes, nextPt)
	s.flows[flowID] = f
	s.revision++

	return f, len(f.Nodes) - 1, true
}

// RemoveWaypoint deletes a waypoint from the flow, ensuring at least 2 waypoints remain.
func (s *Scene) RemoveWaypoint(flowID StringID, waypointIdx int) (Flow, int, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	f, exists := s.flows[flowID]
	if !exists || len(f.Nodes) <= 2 {
		return Flow{}, 0, false
	}

	idx := waypointIdx
	if idx < 0 {
		idx = 0
	}
	if idx >= len(f.Nodes) {
		idx = len(f.Nodes) - 1
	}

	f.Nodes = append(f.Nodes[:idx], f.Nodes[idx+1:]...)
	s.flows[flowID] = f
	s.revision++

	newActive := idx - 1
	if newActive < 0 {
		newActive = 0
	}

	return f, newActive, true
}

// UpdateWaypoint modifies coordinates of a specific waypoint within a flow.
func (s *Scene) UpdateWaypoint(flowID StringID, waypointIdx int, x, y float64) (Flow, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	f, exists := s.flows[flowID]
	if !exists || waypointIdx < 0 || waypointIdx >= len(f.Nodes) {
		return Flow{}, false
	}

	f.Nodes[waypointIdx].X = x
	f.Nodes[waypointIdx].Y = y
	s.flows[flowID] = f
	s.revision++

	return f, true
}

// AttachFlowToNode connects a flow endpoint (start or end) to a diagram node.
func (s *Scene) AttachFlowToNode(flowID StringID, isEnd bool, nodeID StringID) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	f, exists := s.flows[flowID]
	if !exists {
		return false
	}
	targetNode, nodeExists := s.nodes[nodeID]
	if !nodeExists {
		return false
	}

	if isEnd {
		f.ToNodeID = nodeID
		if len(f.Nodes) > 0 {
			f.Nodes[len(f.Nodes)-1] = geometry.Point{X: targetNode.X, Y: targetNode.Y}
		}
	} else {
		f.FromNodeID = nodeID
		if len(f.Nodes) > 0 {
			f.Nodes[0] = geometry.Point{X: targetNode.X, Y: targetNode.Y}
		}
	}

	s.flows[flowID] = f
	s.revision++
	return true
}

// DetachFlowFromNode disconnects a flow endpoint from any attached node while keeping coordinates.
func (s *Scene) DetachFlowFromNode(flowID StringID, isEnd bool) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	f, exists := s.flows[flowID]
	if !exists {
		return false
	}

	if isEnd {
		f.ToNodeID = ""
	} else {
		f.FromNodeID = ""
	}

	s.flows[flowID] = f
	s.revision++
	return true
}

// RecalculateNodeConnections updates all flow endpoints attached to a given node.
func (s *Scene) RecalculateNodeConnections(nodeID StringID) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.recalculateNodeConnectionsLocked(nodeID)
}

func (s *Scene) recalculateNodeConnectionsLocked(nodeID StringID) {
	targetNode, exists := s.nodes[nodeID]
	if !exists {
		return
	}

	changedAny := false
	for _, fid := range s.flowIDs {
		f := s.flows[fid]
		changed := false

		if f.FromNodeID == nodeID && len(f.Nodes) > 0 {
			f.Nodes[0] = geometry.Point{X: targetNode.X, Y: targetNode.Y}
			changed = true
		}
		if f.ToNodeID == nodeID && len(f.Nodes) > 0 {
			f.Nodes[len(f.Nodes)-1] = geometry.Point{X: targetNode.X, Y: targetNode.Y}
			changed = true
		}

		if changed {
			s.flows[fid] = f
			changedAny = true
		}
	}

	if changedAny {
		s.revision++
	}
}
