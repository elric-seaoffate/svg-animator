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

	nodes   map[string]Node
	nodeIDs []string

	flows   map[string]Flow
	flowIDs []string

	glows   map[string]Glow
	glowIDs []string

	ripples   map[string]Ripple
	rippleIDs []string
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
		nodes:     make(map[string]Node),
		flows:     make(map[string]Flow),
		glows:     make(map[string]Glow),
		ripples:   make(map[string]Ripple),
		nodeIDs:   make([]string, 0),
		flowIDs:   make([]string, 0),
		glowIDs:   make([]string, 0),
		rippleIDs: make([]string, 0),
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

// UpdateFlow adds or modifies a flow and bumps revision.
func (s *Scene) UpdateFlow(f Flow) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.flows[f.ID]; !exists {
		s.flowIDs = append(s.flowIDs, f.ID)
	}
	s.flows[f.ID] = f
	s.revision++
}

// RemoveFlow removes a flow by ID and bumps revision.
func (s *Scene) RemoveFlow(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.flows[id]; !exists {
		return false
	}
	delete(s.flows, id)
	newIDs := make([]string, 0, len(s.flowIDs)-1)
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
	if _, exists := s.glows[g.ID]; !exists {
		s.glowIDs = append(s.glowIDs, g.ID)
	}
	s.glows[g.ID] = g
	s.revision++
}

// RemoveGlow removes a glow by ID.
func (s *Scene) RemoveGlow(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.glows[id]; !exists {
		return false
	}
	delete(s.glows, id)
	newIDs := make([]string, 0, len(s.glowIDs)-1)
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
	if _, exists := s.ripples[r.ID]; !exists {
		s.rippleIDs = append(s.rippleIDs, r.ID)
	}
	s.ripples[r.ID] = r
	s.revision++
}

// RemoveRipple removes a ripple by ID.
func (s *Scene) RemoveRipple(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.ripples[id]; !exists {
		return false
	}
	delete(s.ripples, id)
	newIDs := make([]string, 0, len(s.rippleIDs)-1)
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

	s.nodes = make(map[string]Node, len(snap.Nodes))
	s.nodeIDs = make([]string, 0, len(snap.Nodes))
	for _, n := range snap.Nodes {
		s.nodes[n.ID] = n
		s.nodeIDs = append(s.nodeIDs, n.ID)
	}

	s.flows = make(map[string]Flow, len(snap.Flows))
	s.flowIDs = make([]string, 0, len(snap.Flows))
	for _, f := range snap.Flows {
		s.flows[f.ID] = f
		s.flowIDs = append(s.flowIDs, f.ID)
	}

	s.glows = make(map[string]Glow, len(snap.Glows))
	s.glowIDs = make([]string, 0, len(snap.Glows))
	for _, g := range snap.Glows {
		s.glows[g.ID] = g
		s.glowIDs = append(s.glowIDs, g.ID)
	}

	s.ripples = make(map[string]Ripple, len(snap.Ripples))
	s.rippleIDs = make([]string, 0, len(snap.Ripples))
	for _, r := range snap.Ripples {
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
