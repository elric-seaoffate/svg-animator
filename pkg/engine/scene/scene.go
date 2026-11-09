package scene

import (
	"sync"
)

// Scene manages authoritative object collections, settings, and revision counters.
type Scene struct {
	mu       sync.RWMutex
	revision int64

	canvas CanvasConfig
	camera CameraConfig

	nodes   map[StringID]Node
	nodeIDs []StringID

	flows   map[StringID]Flow
	flowIDs []StringID

	glows   map[StringID]Glow
	glowIDs []StringID

	ripples   map[StringID]Ripple
	rippleIDs []StringID
}

// NewScene initializes an empty Scene with default configuration.
func NewScene() *Scene {
	return &Scene{
		revision: 1,
		canvas: CanvasConfig{
			Width:        1280,
			Height:       720,
			Duration:     7.0,
			PlaybackMode: "once",
		},
		camera: CameraConfig{
			Motion:    "static",
			Duration:  7.0,
			Loop:      "once",
			StartX:    50,
			StartY:    50,
			StartZoom: 1.0,
			EndX:      60,
			EndY:      40,
			EndZoom:   1.3,
			Sway:      1.4,
			Breathe:   1.8,
		},
		nodes:     make(map[StringID]Node),
		flows:     make(map[StringID]Flow),
		glows:     make(map[StringID]Glow),
		ripples:   make(map[StringID]Ripple),
		nodeIDs:   make([]StringID, 0),
		flowIDs:   make([]StringID, 0),
		glowIDs:   make([]StringID, 0),
		rippleIDs: make([]StringID, 0),
	}
}

// Revision returns the current scene revision.
func (s *Scene) Revision() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.revision
}

// Canvas returns the current canvas configuration.
func (s *Scene) Canvas() CanvasConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.canvas
}

// Camera returns the current camera configuration.
func (s *Scene) Camera() CameraConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.camera
}

// SetCanvas updates canvas settings and bumps revision.
func (s *Scene) SetCanvas(cfg CanvasConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.canvas = cfg
	s.revision++
}

// SetCamera updates camera settings and bumps revision.
func (s *Scene) SetCamera(cfg CameraConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.camera = cfg
	s.revision++
}

// UpdateNode adds or modifies a node and bumps revision.
func (s *Scene) UpdateNode(n Node) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if n.Label == "" && n.Text != "" {
		n.Label = n.Text
	}
	if n.Fill == "" && n.FillColor != "" {
		n.Fill = n.FillColor
	}
	if n.Stroke == "" && n.StrokeColor != "" {
		n.Stroke = n.StrokeColor
	}
	if n.Animation == "" && n.Anim != "" {
		n.Animation = n.Anim
	}
	if _, exists := s.nodes[n.ID]; !exists {
		s.nodeIDs = append(s.nodeIDs, n.ID)
	}
	s.nodes[n.ID] = n
	s.revision++
}

// RemoveNode removes a node by ID and bumps revision.
func (s *Scene) RemoveNode(id StringID) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.nodes[id]; !exists {
		return false
	}
	delete(s.nodes, id)
	newIDs := make([]StringID, 0, len(s.nodeIDs)-1)
	for _, nid := range s.nodeIDs {
		if nid != id {
			newIDs = append(newIDs, nid)
		}
	}
	s.nodeIDs = newIDs
	s.revision++
	return true
}

// UpdateFlow adds or modifies a flow and bumps revision.
func (s *Scene) UpdateFlow(f Flow) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if f.RouteMode == "" && f.Route != "" {
		f.RouteMode = f.Route
	}
	if _, exists := s.flows[f.ID]; !exists {
		s.flowIDs = append(s.flowIDs, f.ID)
	}
	s.flows[f.ID] = f
	s.revision++
}

// RemoveFlow removes a flow by ID and bumps revision.
func (s *Scene) RemoveFlow(id StringID) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.flows[id]; !exists {
		return false
	}
	delete(s.flows, id)
	newIDs := make([]StringID, 0, len(s.flowIDs)-1)
	for _, fid := range s.flowIDs {
		if fid != id {
			newIDs = append(newIDs, fid)
		}
	}
	s.flowIDs = newIDs
	s.revision++
	return true
}

// UpdateGlow adds or modifies a glow.
func (s *Scene) UpdateGlow(g Glow) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if g.Shape == "radar" {
		g.IsRadar = true
	}
	if g.RadarRings <= 0 && g.Rings > 0 {
		g.RadarRings = g.Rings
	}
	if _, exists := s.glows[g.ID]; !exists {
		s.glowIDs = append(s.glowIDs, g.ID)
	}
	s.glows[g.ID] = g
	s.revision++
}

// RemoveGlow removes a glow by ID.
func (s *Scene) RemoveGlow(id StringID) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.glows[id]; !exists {
		return false
	}
	delete(s.glows, id)
	newIDs := make([]StringID, 0, len(s.glowIDs)-1)
	for _, gid := range s.glowIDs {
		if gid != id {
			newIDs = append(newIDs, gid)
		}
	}
	s.glowIDs = newIDs
	s.revision++
	return true
}

// UpdateRipple adds or modifies a ripple.
func (s *Scene) UpdateRipple(r Ripple) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if r.WaveCount <= 0 && r.Rings > 0 {
		r.WaveCount = r.Rings
	}
	if _, exists := s.ripples[r.ID]; !exists {
		s.rippleIDs = append(s.rippleIDs, r.ID)
	}
	s.ripples[r.ID] = r
	s.revision++
}

// RemoveRipple removes a ripple by ID.
func (s *Scene) RemoveRipple(id StringID) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.ripples[id]; !exists {
		return false
	}
	delete(s.ripples, id)
	newIDs := make([]StringID, 0, len(s.rippleIDs)-1)
	for _, rid := range s.rippleIDs {
		if rid != id {
			newIDs = append(newIDs, rid)
		}
	}
	s.rippleIDs = newIDs
	s.revision++
	return true
}

// SetFromSnapshot replaces the scene contents with a full snapshot.
func (s *Scene) SetFromSnapshot(snap Snapshot) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.canvas = snap.Canvas
	s.camera = snap.Camera

	s.nodes = make(map[StringID]Node, len(snap.Nodes))
	s.nodeIDs = make([]StringID, 0, len(snap.Nodes))
	for _, n := range snap.Nodes {
		if n.Label == "" && n.Text != "" {
			n.Label = n.Text
		}
		if n.Fill == "" && n.FillColor != "" {
			n.Fill = n.FillColor
		}
		if n.Stroke == "" && n.StrokeColor != "" {
			n.Stroke = n.StrokeColor
		}
		if n.Animation == "" && n.Anim != "" {
			n.Animation = n.Anim
		}
		s.nodes[n.ID] = n
		s.nodeIDs = append(s.nodeIDs, n.ID)
	}

	s.flows = make(map[StringID]Flow, len(snap.Flows))
	s.flowIDs = make([]StringID, 0, len(snap.Flows))
	for _, f := range snap.Flows {
		if f.RouteMode == "" && f.Route != "" {
			f.RouteMode = f.Route
		}
		s.flows[f.ID] = f
		s.flowIDs = append(s.flowIDs, f.ID)
	}

	s.glows = make(map[StringID]Glow, len(snap.Glows))
	s.glowIDs = make([]StringID, 0, len(snap.Glows))
	for _, g := range snap.Glows {
		if g.Shape == "radar" {
			g.IsRadar = true
		}
		if g.RadarRings <= 0 && g.Rings > 0 {
			g.RadarRings = g.Rings
		}
		s.glows[g.ID] = g
		s.glowIDs = append(s.glowIDs, g.ID)
	}

	s.ripples = make(map[StringID]Ripple, len(snap.Ripples))
	s.rippleIDs = make([]StringID, 0, len(snap.Ripples))
	for _, r := range snap.Ripples {
		if r.WaveCount <= 0 && r.Rings > 0 {
			r.WaveCount = r.Rings
		}
		s.ripples[r.ID] = r
		s.rippleIDs = append(s.rippleIDs, r.ID)
	}

	if snap.Revision > 0 {
		s.revision = snap.Revision
	} else {
		s.revision++
	}
}

// GetSnapshot exports an immutable snapshot of current scene state.
func (s *Scene) GetSnapshot() Snapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()

	nodes := make([]Node, len(s.nodeIDs))
	for i, id := range s.nodeIDs {
		nodes[i] = s.nodes[id]
	}

	flows := make([]Flow, len(s.flowIDs))
	for i, id := range s.flowIDs {
		flows[i] = s.flows[id]
	}

	glows := make([]Glow, len(s.glowIDs))
	for i, id := range s.glowIDs {
		glows[i] = s.glows[id]
	}

	ripples := make([]Ripple, len(s.rippleIDs))
	for i, id := range s.rippleIDs {
		ripples[i] = s.ripples[id]
	}

	return Snapshot{
		Revision: s.revision,
		Canvas:   s.canvas,
		Camera:   s.camera,
		Nodes:    nodes,
		Flows:    flows,
		Glows:    glows,
		Ripples:  ripples,
	}
}
