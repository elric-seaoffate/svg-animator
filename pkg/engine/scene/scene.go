package scene

import (
	"errors"
	"strconv"
	"strings"
	"sync"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
)

// Scene manages authoritative object collections, settings, and revision counters.
type Scene struct {
	mu       sync.RWMutex
	revision int64

	canvas CanvasConfig
	camera CameraConfig

	nodesCounter int64
	nodes        map[StringID]Node
	nodeIDs      []StringID

	optical OpticalConfig
	frame   FrameConfig

	flowsCounter int64
	flows        map[StringID]Flow
	flowIDs      []StringID

	glowsCounter int64
	glows        map[StringID]Glow
	glowIDs      []StringID

	ripplesCounter int64
	ripples        map[StringID]Ripple
	rippleIDs      []StringID

	groupsCounter int64
	groups        map[StringID]Group
	groupIDs      []StringID

	selection SelectionState
	history   *HistoryManager
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
		optical: OpticalConfig{
			Type:     "none",
			FocusDur: 4.0,
			TSBlur:   12.0,
			TSWidth:  20.0,
			TSPos:    50.0,
			TSPosX:   50.0,
			MBInt:    15.0,
		},
		frame: FrameConfig{
			Enabled:  false,
			Style:    "walnut",
			Depth:    44.0,
			Lighting: true,
			LightDir: "tl",
			LightInt: 70.0,
			Shadow:   0.55,
			Fillet:   true,
		},
		nodes:     make(map[StringID]Node),
		flows:     make(map[StringID]Flow),
		glows:     make(map[StringID]Glow),
		ripples:   make(map[StringID]Ripple),
		groups:    make(map[StringID]Group),
		nodeIDs:   make([]StringID, 0),
		flowIDs:   make([]StringID, 0),
		glowIDs:   make([]StringID, 0),
		rippleIDs: make([]StringID, 0),
		groupIDs:  make([]StringID, 0),
		selection: SelectionState{Type: SelectionNone, ID: ""},
		history:   NewHistoryManager(50),
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

// GetNodeEffectiveProps returns a copy of the node with defaults applied for missing properties.
func (s *Scene) GetNodeEffectiveProps(n Node) Node {
	eff := n
	if eff.Width <= 0 {
		eff.Width = 170
	}
	if eff.Height <= 0 {
		eff.Height = 80
	}
	if eff.FillColor == "" {
		if eff.Fill != "" {
			eff.FillColor = eff.Fill
		} else {
			eff.FillColor = "#161b22"
		}
	}
	if eff.Fill == "" {
		eff.Fill = eff.FillColor
	}
	if eff.StrokeColor == "" {
		if eff.Stroke != "" {
			eff.StrokeColor = eff.Stroke
		} else {
			eff.StrokeColor = "#58a6ff"
		}
	}
	if eff.Stroke == "" {
		eff.Stroke = eff.StrokeColor
	}
	if eff.TextColor == "" {
		eff.TextColor = "#e6edf3"
	}
	if eff.FontSize <= 0 {
		eff.FontSize = 15
	}
	if eff.FillOpacity <= 0 && eff.Opacity > 0 {
		eff.FillOpacity = eff.Opacity
	}
	if eff.FillOpacity <= 0 {
		eff.FillOpacity = 0.92
	}
	if eff.StrokeWidth <= 0 {
		eff.StrokeWidth = 2
	}
	if eff.StrokeStyle == "" {
		eff.StrokeStyle = "solid"
	}
	return eff
}

// CreateNode adds a new node to the scene, applying defaults, optional presets, and grid snapping.
func (s *Scene) CreateNode(initial Node, preset *PresetConfig, snapToGrid bool) Node {
	s.mu.Lock()
	defer s.mu.Unlock()

	explicit := initial

	s.nodesCounter++
	if initial.ID == "" {
		initial.ID = StringID(strconv.FormatInt(s.nodesCounter, 10))
	} else if idNum, err := strconv.ParseInt(string(initial.ID), 10, 64); err == nil && idNum > s.nodesCounter {
		s.nodesCounter = idNum
	}

	offset := float64(((s.nodesCounter - 1) % 6) * 6)
	if initial.Shape == "" {
		initial.Shape = "rounded"
	} else {
		initial.Shape = geometry.NormalizeShapeID(initial.Shape)
	}

	if initial.Label == "" && initial.Text == "" {
		initial.Label = "Node " + strconv.FormatInt(s.nodesCounter, 10)
		initial.Text = initial.Label
	} else if initial.Label == "" {
		initial.Label = initial.Text
	} else if initial.Text == "" {
		initial.Text = initial.Label
	}

	if initial.X == 0 {
		initial.X = 32.0 + offset
	}
	if initial.Y == 0 {
		initial.Y = 32.0 + offset
	}

	def := geometry.GetShapeDefinition(initial.Shape)
	if initial.Width <= 0 {
		if def.DefaultWidth > 0 {
			initial.Width = def.DefaultWidth
		} else {
			initial.Width = 170
		}
	}
	if initial.Height <= 0 {
		if def.DefaultHeight > 0 {
			initial.Height = def.DefaultHeight
		} else {
			initial.Height = 80
		}
	}

	if initial.FillColor == "" {
		initial.FillColor = "#161b22"
	}
	initial.Fill = initial.FillColor

	if initial.StrokeColor == "" {
		initial.StrokeColor = "#58a6ff"
	}
	initial.Stroke = initial.StrokeColor

	if initial.TextColor == "" {
		initial.TextColor = "#e6edf3"
	}
	if initial.FontSize <= 0 {
		initial.FontSize = 15
	}
	if initial.FillOpacity <= 0 {
		initial.FillOpacity = 0.92
	}
	if initial.StrokeWidth <= 0 {
		initial.StrokeWidth = 2
	}
	if initial.StrokeStyle == "" {
		initial.StrokeStyle = "solid"
	}
	if initial.Anim == "" && initial.Animation == "" {
		initial.Anim = "none"
		initial.Animation = "none"
	}

	if preset != nil {
		preset.ApplyPresetToNode(&initial)
		if explicit.Width > 0 {
			initial.Width = explicit.Width
		}
		if explicit.Height > 0 {
			initial.Height = explicit.Height
		}
		if explicit.Shape != "" {
			initial.Shape = geometry.NormalizeShapeID(explicit.Shape)
		}
		if explicit.Text != "" {
			initial.Text = explicit.Text
			initial.Label = explicit.Text
		} else if explicit.Label != "" {
			initial.Text = explicit.Label
			initial.Label = explicit.Label
		}
		if explicit.Subtext != "" {
			initial.Subtext = explicit.Subtext
		}
		if explicit.FillColor != "" {
			initial.FillColor = explicit.FillColor
			initial.Fill = explicit.FillColor
		} else if explicit.Fill != "" {
			initial.FillColor = explicit.Fill
			initial.Fill = explicit.Fill
		}
		if explicit.StrokeColor != "" {
			initial.StrokeColor = explicit.StrokeColor
			initial.Stroke = explicit.StrokeColor
		} else if explicit.Stroke != "" {
			initial.StrokeColor = explicit.Stroke
			initial.Stroke = explicit.Stroke
		}
		if explicit.TextColor != "" {
			initial.TextColor = explicit.TextColor
		}
		if explicit.FontSize > 0 {
			initial.FontSize = explicit.FontSize
		}
		if explicit.FillOpacity > 0 {
			initial.FillOpacity = explicit.FillOpacity
		}
		if explicit.StrokeWidth > 0 {
			initial.StrokeWidth = explicit.StrokeWidth
		}
		if explicit.StrokeStyle != "" {
			initial.StrokeStyle = explicit.StrokeStyle
		}
		if explicit.Anim != "" {
			initial.Anim = explicit.Anim
			initial.Animation = explicit.Anim
		} else if explicit.Animation != "" {
			initial.Anim = explicit.Animation
			initial.Animation = explicit.Animation
		}
	}

	if snapToGrid {
		snapped := geometry.ComputeSnappedPosition(initial.X, initial.Y, geometry.SnapConfig{
			Enabled:      true,
			GridSizePx:   s.canvas.GridSize,
			CanvasWidth:  s.canvas.Width,
			CanvasHeight: s.canvas.Height,
		})
		initial.X = snapped.X
		initial.Y = snapped.Y
	}

	if _, exists := s.nodes[initial.ID]; !exists {
		s.nodeIDs = append(s.nodeIDs, initial.ID)
	}
	s.nodes[initial.ID] = initial
	s.revision++

	return initial
}

// GetNode returns a pointer to a copy of the requested node, or nil if not found.
func (s *Scene) GetNode(id StringID) *Node {
	s.mu.RLock()
	defer s.mu.RUnlock()
	n, exists := s.nodes[id]
	if !exists {
		return nil
	}
	res := n
	return &res
}

// GetAllNodes returns a slice of all nodes in scene order.
func (s *Scene) GetAllNodes() []Node {
	s.mu.RLock()
	defer s.mu.RUnlock()
	res := make([]Node, len(s.nodeIDs))
	for i, id := range s.nodeIDs {
		res[i] = s.nodes[id]
	}
	return res
}

// FindNodeAt hit-tests the given percentage coordinates against nodes in the scene.
func (s *Scene) FindNodeAt(xPct, yPct, canvasW, canvasH float64) *Node {
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

	px := (xPct / 100.0) * canvasW
	py := (yPct / 100.0) * canvasH

	for i := len(s.nodeIDs) - 1; i >= 0; i-- {
		id := s.nodeIDs[i]
		n := s.nodes[id]
		eff := s.GetNodeEffectiveProps(n)
		cx := (n.X / 100.0) * canvasW
		cy := (n.Y / 100.0) * canvasH
		hw := (eff.Width / 2.0) + 8.0
		hh := (eff.Height / 2.0) + 8.0
		if px >= cx-hw && px <= cx+hw && py >= cy-hh && py <= cy+hh {
			res := n
			return &res
		}
	}
	return nil
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
	if old, exists := s.nodes[n.ID]; exists {
		if n.Name == "" && old.Name != "" {
			n.Name = old.Name
		}
	} else {
		s.nodeIDs = append(s.nodeIDs, n.ID)
	}
	s.nodes[n.ID] = n
	s.recalculateNodeConnectionsLocked(n.ID)
	s.revision++
}

// removeNodeLocked removes a node by ID without acquiring the mutex or bumping revision.
func (s *Scene) removeNodeLocked(id StringID) bool {
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

	// Detach flow references to this deleted node
	for _, fid := range s.flowIDs {
		flow := s.flows[fid]
		changed := false
		if flow.FromNodeID == id {
			flow.FromNodeID = ""
			changed = true
		}
		if flow.ToNodeID == id {
			flow.ToNodeID = ""
			changed = true
		}
		if changed {
			s.flows[fid] = flow
		}
	}

	s.pruneSelectionLocked(SelectionNode, id)
	s.pruneGroupMembersLocked(SelectionNode, id)
	return true
}

// RemoveNode removes a node by ID and bumps revision.
func (s *Scene) RemoveNode(id StringID) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if ok := s.removeNodeLocked(id); ok {
		s.revision++
		return true
	}
	return false
}

// removeFlowLocked removes a flow by ID without acquiring the mutex or bumping revision.
func (s *Scene) removeFlowLocked(id StringID) bool {
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
	s.pruneSelectionLocked(SelectionFlow, id)
	s.pruneGroupMembersLocked(SelectionFlow, id)
	return true
}

// removeGlowLocked removes a glow by ID without acquiring the mutex or bumping revision.
func (s *Scene) removeGlowLocked(id StringID) bool {
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
	s.pruneSelectionLocked(SelectionGlow, id)
	s.pruneGroupMembersLocked(SelectionGlow, id)
	return true
}

// removeRippleLocked removes a ripple by ID without acquiring the mutex or bumping revision.
func (s *Scene) removeRippleLocked(id StringID) bool {
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
	s.pruneSelectionLocked(SelectionRipple, id)
	s.pruneGroupMembersLocked(SelectionRipple, id)
	return true
}

// UpdateFlow adds or modifies a flow and bumps revision.
func (s *Scene) UpdateFlow(f Flow) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if f.RouteMode == "" && f.Route != "" {
		f.RouteMode = f.Route
	}
	if old, exists := s.flows[f.ID]; exists {
		if f.Name == "" && old.Name != "" {
			f.Name = old.Name
		}
	} else {
		s.flowIDs = append(s.flowIDs, f.ID)
		if idNum, err := strconv.ParseInt(string(f.ID), 10, 64); err == nil && idNum > s.flowsCounter {
			s.flowsCounter = idNum
		}
	}
	s.flows[f.ID] = f
	s.revision++
}

// RemoveFlow removes a flow by ID and bumps revision.
func (s *Scene) RemoveFlow(id StringID) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if ok := s.removeFlowLocked(id); ok {
		s.revision++
		return true
	}
	return false
}

// RenameObject updates the human-readable display name of a Node, Flow, Glow, or Ripple.
func (s *Scene) RenameObject(selType SelectionType, id StringID, name string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	switch selType {
	case SelectionNode:
		node, ok := s.nodes[id]
		if !ok {
			return false, errors.New("node not found: " + string(id))
		}
		node.Name = name
		s.nodes[id] = node
		s.revision++
		return true, nil

	case SelectionFlow:
		flow, ok := s.flows[id]
		if !ok {
			return false, errors.New("flow not found: " + string(id))
		}
		flow.Name = name
		s.flows[id] = flow
		s.revision++
		return true, nil

	case SelectionGlow:
		glow, ok := s.glows[id]
		if !ok {
			return false, errors.New("glow not found: " + string(id))
		}
		glow.Name = name
		s.glows[id] = glow
		s.revision++
		return true, nil

	case SelectionRipple:
		ripple, ok := s.ripples[id]
		if !ok {
			return false, errors.New("ripple not found: " + string(id))
		}
		ripple.Name = name
		s.ripples[id] = ripple
		s.revision++
		return true, nil

	default:
		return false, errors.New("unsupported object type for rename: " + string(selType))
	}
}

// History returns the scene's history manager.
func (s *Scene) History() *HistoryManager {
	return s.history
}

// RecordHistory captures the current scene snapshot and active selection into history.
func (s *Scene) RecordHistory() bool {
	snap := s.GetSnapshot()
	sel := s.GetSelection()
	return s.history.Record(snap, sel)
}

// UndoHistory restores the previous scene snapshot and selection.
func (s *Scene) UndoHistory() (HistoryEntry, error) {
	currentSnap := s.GetSnapshot()
	currentSel := s.GetSelection()
	entry, err := s.history.Undo(currentSnap, currentSel)
	if err != nil {
		return HistoryEntry{}, err
	}
	s.SetFromSnapshot(entry.Snapshot)
	_, _ = s.SetSelection(entry.Selection.Type, entry.Selection.ID)
	return entry, nil
}

// RedoHistory restores the next undone scene snapshot and selection.
func (s *Scene) RedoHistory() (HistoryEntry, error) {
	entry, err := s.history.Redo()
	if err != nil {
		return HistoryEntry{}, err
	}
	s.SetFromSnapshot(entry.Snapshot)
	_, _ = s.SetSelection(entry.Selection.Type, entry.Selection.ID)
	return entry, nil
}

// SetFromSnapshot replaces the scene contents with a full snapshot.
func (s *Scene) SetFromSnapshot(snap Snapshot) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.canvas = snap.Canvas
	s.camera = snap.Camera
	s.optical = snap.Optical
	if snap.Frame.Style != "" || snap.Frame.Enabled {
		s.frame = snap.Frame
	} else if snap.Overlays.Style != "" || snap.Overlays.Enabled {
		s.frame = snap.Overlays
	}

	s.nodes = make(map[StringID]Node, len(snap.Nodes))
	s.nodeIDs = make([]StringID, 0, len(snap.Nodes))
	for _, n := range snap.Nodes {
		if idNum, err := strconv.ParseInt(string(n.ID), 10, 64); err == nil && idNum > s.nodesCounter {
			s.nodesCounter = idNum
		}
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
		if idNum, err := strconv.ParseInt(string(f.ID), 10, 64); err == nil && idNum > s.flowsCounter {
			s.flowsCounter = idNum
		}
		if f.RouteMode == "" && f.Route != "" {
			f.RouteMode = f.Route
		}
		s.flows[f.ID] = f
		s.flowIDs = append(s.flowIDs, f.ID)
	}

	s.glows = make(map[StringID]Glow, len(snap.Glows))
	s.glowIDs = make([]StringID, 0, len(snap.Glows))
	for _, g := range snap.Glows {
		if idNum, err := strconv.ParseInt(string(g.ID), 10, 64); err == nil && idNum > s.glowsCounter {
			s.glowsCounter = idNum
		}
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
		if idNum, err := strconv.ParseInt(string(r.ID), 10, 64); err == nil && idNum > s.ripplesCounter {
			s.ripplesCounter = idNum
		}
		if r.WaveCount <= 0 && r.Rings > 0 {
			r.WaveCount = r.Rings
		}
		s.ripples[r.ID] = r
		s.rippleIDs = append(s.rippleIDs, r.ID)
	}

	s.groups = make(map[StringID]Group, len(snap.Groups))
	s.groupIDs = make([]StringID, 0, len(snap.Groups))
	for _, g := range snap.Groups {
		rawID := string(g.ID)
		if strings.HasPrefix(rawID, "group-") {
			if idNum, err := strconv.ParseInt(strings.TrimPrefix(rawID, "group-"), 10, 64); err == nil && idNum > s.groupsCounter {
				s.groupsCounter = idNum
			}
		} else if idNum, err := strconv.ParseInt(rawID, 10, 64); err == nil && idNum > s.groupsCounter {
			s.groupsCounter = idNum
		}
		s.groups[g.ID] = g
		s.groupIDs = append(s.groupIDs, g.ID)
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

	groups := make([]Group, len(s.groupIDs))
	for i, id := range s.groupIDs {
		groups[i] = s.groups[id]
	}

	return Snapshot{
		Revision: s.revision,
		Canvas:   s.canvas,
		Camera:   s.camera,
		Optical:  s.optical,
		Frame:    s.frame,
		Overlays: s.frame,
		Nodes:    nodes,
		Flows:    flows,
		Glows:    glows,
		Ripples:  ripples,
		Groups:   groups,
	}
}
