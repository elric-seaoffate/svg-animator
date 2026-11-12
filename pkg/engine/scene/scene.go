package scene

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
)

// Scene manages authoritative object collections, settings, and revision counters.
type Scene struct {
	mu       sync.RWMutex
	revision int64

	canvas     CanvasConfig
	background *BackgroundConfig
	camera     CameraConfig

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

	imagesCounter int64
	images        map[StringID]Image
	imageIDs      []StringID

	layers []LayerEntry

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
		images:    make(map[StringID]Image),
		nodeIDs:   make([]StringID, 0),
		flowIDs:   make([]StringID, 0),
		glowIDs:   make([]StringID, 0),
		rippleIDs: make([]StringID, 0),
		groupIDs:  make([]StringID, 0),
		imageIDs:  make([]StringID, 0),
		layers:    make([]LayerEntry, 0),
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
		if len(s.layers) > 0 {
			s.layers = append(s.layers, LayerEntry{Type: SelectionNode, ID: initial.ID})
		}
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
		if !s.getEffectiveVisibilityLocked(SelectionNode, id) {
			continue
		}
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

// ValidateNode checks that node configuration conforms to operational bounds.
func ValidateNode(n *Node) error {
	if n == nil {
		return errors.New("nil node")
	}
	if n.Width < 0 || n.Height < 0 {
		return errors.New("node dimensions cannot be negative")
	}
	if n.Opacity < 0 || n.Opacity > 1.0 {
		return errors.New("opacity must be between 0.0 and 1.0")
	}
	if n.FillOpacity < 0 || n.FillOpacity > 1.0 {
		return errors.New("fillOpacity must be between 0.0 and 1.0")
	}
	if n.StrokeWidth < 0 {
		return errors.New("strokeWidth cannot be negative")
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
	s.removeLayerEntryLocked(SelectionNode, id)
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
	s.removeLayerEntryLocked(SelectionFlow, id)
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
	s.removeLayerEntryLocked(SelectionGlow, id)
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
	s.removeLayerEntryLocked(SelectionRipple, id)
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

// RenameObject updates the human-readable display name of a Node, Flow, Glow, Ripple, Image, or Group.
func (s *Scene) RenameObject(selType SelectionType, id StringID, name string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.getEffectiveLockedLocked(selType, id) {
		return false, fmt.Errorf("cannot rename locked %s: %s", selType, id)
	}

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

	case SelectionImage:
		img, ok := s.images[id]
		if !ok {
			return false, errors.New("image not found: " + string(id))
		}
		img.Name = name
		s.images[id] = img
		s.revision++
		return true, nil

	case SelectionGroup:
		grp, ok := s.groups[id]
		if !ok {
			return false, errors.New("group not found: " + string(id))
		}
		displayName := name
		if displayName == "" {
			displayName = "Group " + string(id)
		}
		grp.Name = displayName
		s.groups[id] = grp
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
	s.mu.Lock()
	defer s.mu.Unlock()

	currentSnap := s.getSnapshotLocked()
	currentSel := s.selection
	entry, err := s.history.Undo(currentSnap, currentSel)
	if err != nil {
		return HistoryEntry{}, err
	}
	s.setFromSnapshotLocked(entry.Snapshot)
	s.restoreSelectionLocked(entry.Selection)
	return HistoryEntry{
		Snapshot:  DeepCopySnapshot(entry.Snapshot),
		Selection: DeepCopySelection(s.selection),
		Timestamp: entry.Timestamp,
	}, nil
}

// RedoHistory restores the next undone scene snapshot and selection.
func (s *Scene) RedoHistory() (HistoryEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry, err := s.history.Redo()
	if err != nil {
		return HistoryEntry{}, err
	}
	s.setFromSnapshotLocked(entry.Snapshot)
	s.restoreSelectionLocked(entry.Selection)
	return HistoryEntry{
		Snapshot:  DeepCopySnapshot(entry.Snapshot),
		Selection: DeepCopySelection(s.selection),
		Timestamp: entry.Timestamp,
	}, nil
}

// SetFromSnapshot replaces the scene contents with a full snapshot.
func (s *Scene) SetFromSnapshot(snap Snapshot) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.setFromSnapshotLocked(snap)
}

func (s *Scene) setFromSnapshotLocked(snap Snapshot) {
	s.canvas = snap.Canvas
	s.background = DeepCopyBackground(snap.Background)
	s.camera = snap.Camera
	s.optical = snap.Optical

	if snap.Frame.Style != "" || snap.Frame.Enabled {
		s.frame = snap.Frame
	} else if snap.Overlays.Style != "" || snap.Overlays.Enabled {
		s.frame = snap.Overlays
	} else {
		s.frame = FrameConfig{}
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
		s.nodes[n.ID] = DeepCopyNode(n)
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
		s.flows[f.ID] = DeepCopyFlow(f)
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
		s.glows[g.ID] = DeepCopyGlow(g)
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
		s.ripples[r.ID] = DeepCopyRipple(r)
		s.rippleIDs = append(s.rippleIDs, r.ID)
	}

	s.groups = make(map[StringID]Group, len(snap.Groups))
	s.groupIDs = make([]StringID, 0, len(snap.Groups))
	s.groupsCounter = snap.GroupsCounter
	for _, g := range snap.Groups {
		rawID := string(g.ID)
		if strings.HasPrefix(rawID, "group-") {
			if idNum, err := strconv.ParseInt(strings.TrimPrefix(rawID, "group-"), 10, 64); err == nil && idNum > s.groupsCounter {
				s.groupsCounter = idNum
			}
		} else if idNum, err := strconv.ParseInt(rawID, 10, 64); err == nil && idNum > s.groupsCounter {
			s.groupsCounter = idNum
		}
		s.groups[g.ID] = DeepCopyGroup(g)
		s.groupIDs = append(s.groupIDs, g.ID)
	}

	s.images = make(map[StringID]Image, len(snap.Images))
	s.imageIDs = make([]StringID, 0, len(snap.Images))
	s.imagesCounter = snap.ImagesCounter
	for _, img := range snap.Images {
		rawID := string(img.ID)
		if strings.HasPrefix(rawID, "image-") {
			if idNum, err := strconv.ParseInt(strings.TrimPrefix(rawID, "image-"), 10, 64); err == nil && idNum > s.imagesCounter {
				s.imagesCounter = idNum
			}
		} else if idNum, err := strconv.ParseInt(rawID, 10, 64); err == nil && idNum > s.imagesCounter {
			s.imagesCounter = idNum
		}
		s.images[img.ID] = DeepCopyImage(img)
		s.imageIDs = append(s.imageIDs, img.ID)
	}

	if len(snap.Layers) > 0 {
		s.layers = make([]LayerEntry, len(snap.Layers))
		for i, l := range snap.Layers {
			s.layers[i] = DeepCopyLayerEntry(l)
		}
		s.ensureLayersInitializedLocked()
	} else {
		s.layers = nil
		s.ensureLayersInitializedLocked()
	}

	if snap.Revision > 0 {
		s.revision = snap.Revision
	} else {
		s.revision++
	}
}

// Reset clears all scene objects, layers, groups, images, resets configuration to defaults,
// resets all counters to 0, clears history, and records the initial clean baseline state.
func (s *Scene) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.revision = 1
	s.canvas = CanvasConfig{
		Width:        1280,
		Height:       720,
		Duration:     7.0,
		PlaybackMode: "once",
	}
	s.camera = CameraConfig{
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
	}
	s.optical = OpticalConfig{
		Type:     "none",
		FocusDur: 4.0,
		TSBlur:   12.0,
		TSWidth:  20.0,
		TSPos:    50.0,
		TSPosX:   50.0,
		MBInt:    15.0,
	}
	s.frame = FrameConfig{
		Enabled:  false,
		Style:    "walnut",
		Depth:    44.0,
		Lighting: true,
		LightDir: "tl",
		LightInt: 70.0,
		Shadow:   0.55,
		Fillet:   true,
	}
	s.background = nil

	s.nodes = make(map[StringID]Node)
	s.flows = make(map[StringID]Flow)
	s.glows = make(map[StringID]Glow)
	s.ripples = make(map[StringID]Ripple)
	s.groups = make(map[StringID]Group)
	s.images = make(map[StringID]Image)

	s.nodeIDs = make([]StringID, 0)
	s.flowIDs = make([]StringID, 0)
	s.glowIDs = make([]StringID, 0)
	s.rippleIDs = make([]StringID, 0)
	s.groupIDs = make([]StringID, 0)
	s.imageIDs = make([]StringID, 0)

	s.nodesCounter = 0
	s.flowsCounter = 0
	s.glowsCounter = 0
	s.ripplesCounter = 0
	s.groupsCounter = 0
	s.imagesCounter = 0

	s.layers = make([]LayerEntry, 0)
	s.selection = SelectionState{Type: SelectionNone, ID: ""}

	s.history.Clear()
	s.history.Record(s.getSnapshotLocked(), s.selection)
}

func (s *Scene) getSnapshotLocked() Snapshot {
	nodes := make([]Node, len(s.nodeIDs))
	for i, id := range s.nodeIDs {
		nodes[i] = DeepCopyNode(s.nodes[id])
	}

	flows := make([]Flow, len(s.flowIDs))
	for i, id := range s.flowIDs {
		flows[i] = DeepCopyFlow(s.flows[id])
	}

	glows := make([]Glow, len(s.glowIDs))
	for i, id := range s.glowIDs {
		glows[i] = DeepCopyGlow(s.glows[id])
	}

	ripples := make([]Ripple, len(s.rippleIDs))
	for i, id := range s.rippleIDs {
		ripples[i] = DeepCopyRipple(s.ripples[id])
	}

	groups := make([]Group, len(s.groupIDs))
	for i, id := range s.groupIDs {
		groups[i] = DeepCopyGroup(s.groups[id])
	}

	images := make([]Image, len(s.imageIDs))
	for i, id := range s.imageIDs {
		images[i] = DeepCopyImage(s.images[id])
	}

	layers := s.getLayersSnapshotLocked()

	return Snapshot{
		Revision:      s.revision,
		Canvas:        s.canvas,
		Background:    DeepCopyBackground(s.background),
		Camera:        s.camera,
		Optical:       s.optical,
		Frame:         s.frame,
		Overlays:      s.frame,
		Nodes:         nodes,
		Flows:         flows,
		Glows:         glows,
		Ripples:       ripples,
		Groups:        groups,
		GroupsCounter: s.groupsCounter,
		Images:        images,
		ImagesCounter: s.imagesCounter,
		Layers:        layers,
	}
}

// GetSnapshot exports an immutable, deep-copied snapshot of current scene state.
func (s *Scene) GetSnapshot() Snapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.getSnapshotLocked()
}

// SetBackground sets or replaces the authoritative background configuration.
func (s *Scene) SetBackground(bg *BackgroundConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if bg == nil {
		s.background = nil
		s.revision++
		return
	}

	b := *bg
	nw := b.NaturalWidth
	if nw <= 0 {
		nw = b.SourceWidth
	}
	if nw <= 0 {
		nw = 1280
	}
	nh := b.NaturalHeight
	if nh <= 0 {
		nh = b.SourceHeight
	}
	if nh <= 0 {
		nh = 720
	}
	b.NaturalWidth = nw
	b.NaturalHeight = nh
	if b.SourceWidth <= 0 {
		b.SourceWidth = nw
	}
	if b.SourceHeight <= 0 {
		b.SourceHeight = nh
	}

	if len(b.CropVersions) == 0 {
		b.CropVersions = []BackgroundCropVersion{
			{
				ID:           "original",
				Name:         "Original",
				SourceX:      0,
				SourceY:      0,
				SourceWidth:  nw,
				SourceHeight: nh,
			},
		}
		b.ActiveCropVersionID = "original"
	}
	if b.ActiveCropVersionID == "" {
		b.ActiveCropVersionID = "original"
	}

	s.background = &b
	s.revision++
}

// GetBackground returns a copy of the authoritative background configuration.
func (s *Scene) GetBackground() *BackgroundConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.getBackgroundLocked()
}

func (s *Scene) getBackgroundLocked() *BackgroundConfig {
	if s.background == nil {
		return nil
	}
	b := *s.background
	if b.Crop != nil {
		c := *b.Crop
		b.Crop = &c
	}
	if len(b.CropVersions) > 0 {
		b.CropVersions = make([]BackgroundCropVersion, len(s.background.CropVersions))
		copy(b.CropVersions, s.background.CropVersions)
	}
	return &b
}

// CropBackground applies a non-destructive crop to the background image and saves it as a version.
func (s *Scene) CropBackground(crop BackgroundCrop, name string) (*BackgroundConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.background == nil {
		return nil, errors.New("no background image loaded in scene")
	}

	natW := s.background.NaturalWidth
	if natW <= 0 {
		natW = s.background.SourceWidth
	}
	if natW <= 0 {
		natW = 1280
	}
	natH := s.background.NaturalHeight
	if natH <= 0 {
		natH = s.background.SourceHeight
	}
	if natH <= 0 {
		natH = 720
	}

	// Clamp cleanly to image boundaries without arbitrary shrinking
	sx := math.Max(0, math.Min(crop.SourceX, natW-1))
	sy := math.Max(0, math.Min(crop.SourceY, natH-1))
	sw := math.Max(1, math.Min(crop.SourceWidth, natW-sx))
	sh := math.Max(1, math.Min(crop.SourceHeight, natH-sy))

	// Ensure Original version is present at index 0
	if len(s.background.CropVersions) == 0 {
		s.background.CropVersions = []BackgroundCropVersion{
			{
				ID:           "original",
				Name:         "Original",
				SourceX:      0,
				SourceY:      0,
				SourceWidth:  natW,
				SourceHeight: natH,
			},
		}
	} else if s.background.CropVersions[0].ID != "original" {
		orig := BackgroundCropVersion{
			ID:           "original",
			Name:         "Original",
			SourceX:      0,
			SourceY:      0,
			SourceWidth:  natW,
			SourceHeight: natH,
		}
		s.background.CropVersions = append([]BackgroundCropVersion{orig}, s.background.CropVersions...)
	}

	existingCropIDs := make(map[string]bool)
	maxNum := 0
	for _, v := range s.background.CropVersions {
		existingCropIDs[v.ID] = true
		if strings.HasPrefix(v.ID, "crop-") {
			if n, err := strconv.Atoi(strings.TrimPrefix(v.ID, "crop-")); err == nil && n > maxNum {
				maxNum = n
			}
		}
	}
	candidateNum := maxNum + 1
	var verID string
	for {
		verID = fmt.Sprintf("crop-%d", candidateNum)
		if !existingCropIDs[verID] {
			break
		}
		candidateNum++
	}
	verName := strings.TrimSpace(name)
	if verName == "" {
		verName = fmt.Sprintf("Crop %d", candidateNum)
	}

	newVersion := BackgroundCropVersion{
		ID:           verID,
		Name:         verName,
		SourceX:      sx,
		SourceY:      sy,
		SourceWidth:  sw,
		SourceHeight: sh,
	}
	s.background.CropVersions = append(s.background.CropVersions, newVersion)
	s.background.ActiveCropVersionID = verID
	s.background.Crop = &BackgroundCrop{
		Enabled:      true,
		SourceX:      sx,
		SourceY:      sy,
		SourceWidth:  sw,
		SourceHeight: sh,
	}

	s.revision++

	return s.getBackgroundLocked(), nil
}

// SelectBackgroundCropVersion activates a specific crop version or "original".
func (s *Scene) SelectBackgroundCropVersion(versionID string) (*BackgroundConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.background == nil {
		return nil, errors.New("no background image loaded in scene")
	}

	cleanID := strings.TrimSpace(versionID)
	if cleanID == "" {
		cleanID = "original"
	}

	var found *BackgroundCropVersion
	for i := range s.background.CropVersions {
		if s.background.CropVersions[i].ID == cleanID {
			found = &s.background.CropVersions[i]
			break
		}
	}
	if found == nil {
		return nil, fmt.Errorf("crop version %q not found", cleanID)
	}

	s.background.ActiveCropVersionID = cleanID
	if cleanID == "original" {
		s.background.Crop = nil
	} else {
		s.background.Crop = &BackgroundCrop{
			Enabled:      true,
			SourceX:      found.SourceX,
			SourceY:      found.SourceY,
			SourceWidth:  found.SourceWidth,
			SourceHeight: found.SourceHeight,
		}
	}

	s.revision++

	return s.getBackgroundLocked(), nil
}

// RenameBackgroundCropVersion renames a crop version.
func (s *Scene) RenameBackgroundCropVersion(versionID, newName string) (*BackgroundConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.background == nil {
		return nil, errors.New("no background image loaded in scene")
	}

	cleanName := strings.TrimSpace(newName)
	if cleanName == "" {
		return nil, errors.New("crop version name cannot be empty")
	}

	idx := -1
	for i := range s.background.CropVersions {
		if s.background.CropVersions[i].ID == versionID {
			idx = i
			break
		}
	}
	if idx == -1 {
		return nil, fmt.Errorf("crop version %q not found", versionID)
	}

	s.background.CropVersions[idx].Name = cleanName
	s.revision++
	return s.getBackgroundLocked(), nil
}

// DeleteBackgroundCropVersion removes a crop version (cannot delete "original").
func (s *Scene) DeleteBackgroundCropVersion(versionID string) (*BackgroundConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.background == nil {
		return nil, errors.New("no background image loaded in scene")
	}
	if versionID == "original" {
		return nil, errors.New("cannot delete original background version")
	}

	idx := -1
	for i := range s.background.CropVersions {
		if s.background.CropVersions[i].ID == versionID {
			idx = i
			break
		}
	}
	if idx == -1 {
		return nil, fmt.Errorf("crop version %q not found", versionID)
	}

	s.background.CropVersions = append(s.background.CropVersions[:idx], s.background.CropVersions[idx+1:]...)

	if s.background.ActiveCropVersionID == versionID {
		fallbackID := "original"
		if len(s.background.CropVersions) > 0 {
			fallbackID = s.background.CropVersions[len(s.background.CropVersions)-1].ID
		}
		s.background.ActiveCropVersionID = fallbackID
		if fallbackID == "original" {
			s.background.Crop = nil
		} else {
			for _, v := range s.background.CropVersions {
				if v.ID == fallbackID {
					s.background.Crop = &BackgroundCrop{
						Enabled:      true,
						SourceX:      v.SourceX,
						SourceY:      v.SourceY,
						SourceWidth:  v.SourceWidth,
						SourceHeight: v.SourceHeight,
					}
					break
				}
			}
		}
	}

	s.revision++

	return s.getBackgroundLocked(), nil
}

// ResetBackgroundCrop restores the full uncropped "original" background view.
func (s *Scene) ResetBackgroundCrop() (*BackgroundConfig, error) {
	return s.SelectBackgroundCropVersion("original")
}

// CommitBackgroundCrop bakes the current background crop into a new base raster asset.
func (s *Scene) CommitBackgroundCrop(newB64 string, discardVersions bool) (*BackgroundConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.background == nil {
		return nil, errors.New("no background image loaded in scene")
	}

	if newB64 != "" {
		s.background.B64 = newB64
		s.background.Src = newB64
		s.background.Data = newB64
	}

	if s.background.Crop != nil && s.background.Crop.Enabled {
		if discardVersions {
			sw := s.background.Crop.SourceWidth
			sh := s.background.Crop.SourceHeight
			s.background.SourceWidth = sw
			s.background.SourceHeight = sh
			s.background.NaturalWidth = sw
			s.background.NaturalHeight = sh

			s.background.Crop = nil
			s.background.ActiveCropVersionID = "original"
			s.background.CropVersions = []BackgroundCropVersion{
				{
					ID:           "original",
					Name:         "Original",
					SourceX:      0,
					SourceY:      0,
					SourceWidth:  sw,
					SourceHeight: sh,
				},
			}
		}
	}

	s.revision++

	return s.getBackgroundLocked(), nil
}
