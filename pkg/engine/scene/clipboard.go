package scene

import (
	"errors"
	"fmt"
	"math"
	"strconv"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
)

// ClipboardPayload encapsulates a self-contained copy of scene objects and groups.
type ClipboardPayload struct {
	Format  string   `json:"format"`  // "svg-animator-clipboard"
	Version string   `json:"version"` // "1.0.0"
	Nodes   []Node   `json:"nodes,omitempty"`
	Flows   []Flow   `json:"flows,omitempty"`
	Glows   []Glow   `json:"glows,omitempty"`
	Ripples []Ripple `json:"ripples,omitempty"`
	Images  []Image  `json:"images,omitempty"`
	Groups  []Group  `json:"groups,omitempty"`
}

// CopySelection extracts selected items (and their parent group, if specified or full member set selected)
// into an independent ClipboardPayload.
func (s *Scene) CopySelection(items []SelectionItem, groupID StringID) (ClipboardPayload, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	payload := ClipboardPayload{
		Format:  "svg-animator-clipboard",
		Version: "1.0.0",
	}

	// 1. If groupID is provided, copy the entire group and all its members
	if groupID != "" {
		if grp, exists := s.groups[groupID]; exists {
			payload.Groups = append(payload.Groups, grp)
			for _, m := range grp.Members {
				switch m.Type {
				case SelectionNode:
					if n, ok := s.nodes[m.ID]; ok {
						payload.Nodes = append(payload.Nodes, n)
					}
				case SelectionFlow:
					if f, ok := s.flows[m.ID]; ok {
						payload.Flows = append(payload.Flows, f)
					}
				case SelectionGlow:
					if g, ok := s.glows[m.ID]; ok {
						payload.Glows = append(payload.Glows, g)
					}
				case SelectionRipple:
					if r, ok := s.ripples[m.ID]; ok {
						payload.Ripples = append(payload.Ripples, r)
					}
				case SelectionImage:
					if img, ok := s.images[m.ID]; ok {
						payload.Images = append(payload.Images, img)
					}
				}
			}
			return payload, nil
		}
	}

	if len(items) == 0 {
		return payload, errors.New("no items selected to copy")
	}

	// 2. Multi-selection items
	nodeIDs := make(map[StringID]bool)
	flowIDs := make(map[StringID]bool)
	glowIDs := make(map[StringID]bool)
	rippleIDs := make(map[StringID]bool)
	imageIDs := make(map[StringID]bool)

	for _, it := range items {
		switch it.Type {
		case SelectionNode:
			nodeIDs[it.ID] = true
			if n, ok := s.nodes[it.ID]; ok {
				payload.Nodes = append(payload.Nodes, n)
			}
		case SelectionFlow:
			flowIDs[it.ID] = true
			if f, ok := s.flows[it.ID]; ok {
				payload.Flows = append(payload.Flows, f)
			}
		case SelectionGlow:
			glowIDs[it.ID] = true
			if g, ok := s.glows[it.ID]; ok {
				payload.Glows = append(payload.Glows, g)
			}
		case SelectionRipple:
			rippleIDs[it.ID] = true
			if r, ok := s.ripples[it.ID]; ok {
				payload.Ripples = append(payload.Ripples, r)
			}
		case SelectionImage:
			imageIDs[it.ID] = true
			if img, ok := s.images[it.ID]; ok {
				payload.Images = append(payload.Images, img)
			}
		case SelectionGroup:
			if grp, exists := s.groups[it.ID]; exists {
				payload.Groups = append(payload.Groups, grp)
				for _, m := range grp.Members {
					switch m.Type {
					case SelectionNode:
						if !nodeIDs[m.ID] {
							nodeIDs[m.ID] = true
							if n, ok := s.nodes[m.ID]; ok {
								payload.Nodes = append(payload.Nodes, n)
							}
						}
					case SelectionFlow:
						if !flowIDs[m.ID] {
							flowIDs[m.ID] = true
							if f, ok := s.flows[m.ID]; ok {
								payload.Flows = append(payload.Flows, f)
							}
						}
					case SelectionGlow:
						if !glowIDs[m.ID] {
							glowIDs[m.ID] = true
							if g, ok := s.glows[m.ID]; ok {
								payload.Glows = append(payload.Glows, g)
							}
						}
					case SelectionRipple:
						if !rippleIDs[m.ID] {
							rippleIDs[m.ID] = true
							if r, ok := s.ripples[m.ID]; ok {
								payload.Ripples = append(payload.Ripples, r)
							}
						}
					case SelectionImage:
						if !imageIDs[m.ID] {
							imageIDs[m.ID] = true
							if img, ok := s.images[m.ID]; ok {
								payload.Images = append(payload.Images, img)
							}
						}
					}
				}
			}
		}
	}

	return payload, nil
}

// PastePayload instantiates objects from a ClipboardPayload into the scene with a spatial offset.
// Fresh unique IDs are generated for all objects and groups. Internal flow connections between
// copied nodes are remapped to the new nodes. External attachments remain intact if the target
// external node exists in the scene.
func (s *Scene) PastePayload(payload ClipboardPayload, offsetX float64, offsetY float64) ([]SelectionItem, StringID, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if payload.Format != "svg-animator-clipboard" {
		return nil, "", fmt.Errorf("unsupported clipboard format: %q", payload.Format)
	}

	newItems := make([]SelectionItem, 0)
	var newGroupID StringID

	nodeIDMap := make(map[StringID]StringID)
	flowIDMap := make(map[StringID]StringID)
	glowIDMap := make(map[StringID]StringID)
	rippleIDMap := make(map[StringID]StringID)
	imageIDMap := make(map[StringID]StringID)

	// 1. Paste Nodes
	for _, n := range payload.Nodes {
		var newID StringID
		for {
			s.nodesCounter++
			newID = StringID(strconv.FormatInt(s.nodesCounter, 10))
			if _, exists := s.nodes[newID]; !exists {
				break
			}
		}
		nodeIDMap[n.ID] = newID

		cloned := n
		cloned.ID = newID
		cloned.X += offsetX
		cloned.Y += offsetY
		cloned.X = math.Max(-50.0, math.Min(150.0, cloned.X))
		cloned.Y = math.Max(-50.0, math.Min(150.0, cloned.Y))
		cloned.X = math.Round(cloned.X*1000.0) / 1000.0
		cloned.Y = math.Round(cloned.Y*1000.0) / 1000.0
		if cloned.Name != "" {
			cloned.Name = cloned.Name + " Copy"
		}

		s.nodes[newID] = cloned
		s.nodeIDs = append(s.nodeIDs, newID)
		newItems = append(newItems, SelectionItem{Type: SelectionNode, ID: newID})
	}

	// 2. Paste Glows
	for _, g := range payload.Glows {
		var newID StringID
		for {
			s.glowsCounter++
			newID = StringID(strconv.FormatInt(s.glowsCounter, 10))
			if _, exists := s.glows[newID]; !exists {
				break
			}
		}
		glowIDMap[g.ID] = newID

		cloned := g
		cloned.ID = newID
		cloned.X += offsetX
		cloned.Y += offsetY
		cloned.X = math.Max(-50.0, math.Min(150.0, cloned.X))
		cloned.Y = math.Max(-50.0, math.Min(150.0, cloned.Y))
		cloned.X = math.Round(cloned.X*1000.0) / 1000.0
		cloned.Y = math.Round(cloned.Y*1000.0) / 1000.0
		if cloned.Name != "" {
			cloned.Name = cloned.Name + " Copy"
		}

		s.glows[newID] = cloned
		s.glowIDs = append(s.glowIDs, newID)
		newItems = append(newItems, SelectionItem{Type: SelectionGlow, ID: newID})
	}

	// 3. Paste Ripples
	for _, r := range payload.Ripples {
		var newID StringID
		for {
			s.ripplesCounter++
			newID = StringID(strconv.FormatInt(s.ripplesCounter, 10))
			if _, exists := s.ripples[newID]; !exists {
				break
			}
		}
		rippleIDMap[r.ID] = newID

		cloned := r
		cloned.ID = newID
		cloned.X += offsetX
		cloned.Y += offsetY
		cloned.X = math.Max(-50.0, math.Min(150.0, cloned.X))
		cloned.Y = math.Max(-50.0, math.Min(150.0, cloned.Y))
		cloned.X = math.Round(cloned.X*1000.0) / 1000.0
		cloned.Y = math.Round(cloned.Y*1000.0) / 1000.0
		if cloned.Name != "" {
			cloned.Name = cloned.Name + " Copy"
		}

		s.ripples[newID] = cloned
		s.rippleIDs = append(s.rippleIDs, newID)
		newItems = append(newItems, SelectionItem{Type: SelectionRipple, ID: newID})
	}

	// 4. Paste Images
	for _, img := range payload.Images {
		var newID StringID
		for {
			s.imagesCounter++
			newID = StringID("image-" + strconv.FormatInt(s.imagesCounter, 10))
			if _, exists := s.images[newID]; !exists {
				break
			}
		}
		imageIDMap[img.ID] = newID

		cloned := img
		cloned.ID = newID
		cloned.X += offsetX
		cloned.Y += offsetY
		cloned.X = math.Max(-50.0, math.Min(150.0, cloned.X))
		cloned.Y = math.Max(-50.0, math.Min(150.0, cloned.Y))
		cloned.X = math.Round(cloned.X*1000.0) / 1000.0
		cloned.Y = math.Round(cloned.Y*1000.0) / 1000.0
		if cloned.Name != "" {
			cloned.Name = cloned.Name + " Copy"
		}
		if img.Crop != nil {
			c := *img.Crop
			cloned.Crop = &c
		}

		if s.images == nil {
			s.images = make(map[StringID]Image)
		}
		s.images[newID] = cloned
		s.imageIDs = append(s.imageIDs, newID)
		newItems = append(newItems, SelectionItem{Type: SelectionImage, ID: newID})
	}

	// 5. Paste Flows (with Node remapping)
	for _, f := range payload.Flows {
		var newID StringID
		for {
			s.flowsCounter++
			newID = StringID(strconv.FormatInt(s.flowsCounter, 10))
			if _, exists := s.flows[newID]; !exists {
				break
			}
		}
		flowIDMap[f.ID] = newID

		cloned := f
		cloned.ID = newID
		if cloned.Name != "" {
			cloned.Name = cloned.Name + " Copy"
		}

		// Remap FromNodeID:
		if remappedFrom, ok := nodeIDMap[f.FromNodeID]; ok {
			cloned.FromNodeID = remappedFrom
		} else if _, exists := s.nodes[f.FromNodeID]; !exists {
			cloned.FromNodeID = "" // clear invalid external reference
		}

		// Remap ToNodeID:
		if remappedTo, ok := nodeIDMap[f.ToNodeID]; ok {
			cloned.ToNodeID = remappedTo
		} else if _, exists := s.nodes[f.ToNodeID]; !exists {
			cloned.ToNodeID = "" // clear invalid external reference
		}

		// Offset waypoints
		if len(cloned.Nodes) > 0 {
			newNodes := make([]geometry.Point, len(cloned.Nodes))
			for i, p := range cloned.Nodes {
				newNodes[i] = geometry.Point{
					X: math.Round((p.X+offsetX)*1000.0) / 1000.0,
					Y: math.Round((p.Y+offsetY)*1000.0) / 1000.0,
				}
			}
			cloned.Nodes = newNodes
		}

		s.flows[newID] = cloned
		s.flowIDs = append(s.flowIDs, newID)
		newItems = append(newItems, SelectionItem{Type: SelectionFlow, ID: newID})
	}

	// Recompute flow connections for all newly pasted nodes
	for _, newNID := range nodeIDMap {
		s.recalculateNodeConnectionsLocked(newNID)
	}

	// 5. Paste Groups (with member remapping)
	for _, g := range payload.Groups {
		var newGID StringID
		for {
			s.groupsCounter++
			newGID = StringID("group-" + strconv.FormatInt(s.groupsCounter, 10))
			if _, exists := s.groups[newGID]; !exists {
				break
			}
		}
		newGroupID = newGID

		remappedMembers := make([]GroupMember, 0, len(g.Members))
		for _, m := range g.Members {
			switch m.Type {
			case SelectionNode:
				if newNID, ok := nodeIDMap[m.ID]; ok {
					remappedMembers = append(remappedMembers, GroupMember{Type: SelectionNode, ID: newNID})
				}
			case SelectionFlow:
				if newFID, ok := flowIDMap[m.ID]; ok {
					remappedMembers = append(remappedMembers, GroupMember{Type: SelectionFlow, ID: newFID})
				}
			case SelectionGlow:
				if newGID, ok := glowIDMap[m.ID]; ok {
					remappedMembers = append(remappedMembers, GroupMember{Type: SelectionGlow, ID: newGID})
				}
			case SelectionRipple:
				if newRID, ok := rippleIDMap[m.ID]; ok {
					remappedMembers = append(remappedMembers, GroupMember{Type: SelectionRipple, ID: newRID})
				}
			case SelectionImage:
				if newImgID, ok := imageIDMap[m.ID]; ok {
					remappedMembers = append(remappedMembers, GroupMember{Type: SelectionImage, ID: newImgID})
				}
			}
		}

		if len(remappedMembers) >= 2 {
			clonedGroup := Group{
				ID:      newGID,
				Name:    g.Name + " Copy",
				Members: remappedMembers,
			}
			s.groups[newGID] = clonedGroup
			s.groupIDs = append(s.groupIDs, newGID)
			s.coalesceGroupMembersInLayersLocked(clonedGroup)
		}
	}

	s.ensureLayersInitializedLocked()
	s.revision++
	return newItems, newGroupID, nil
}

// DuplicateSelection performs a unified copy and paste with a standard offset (+5%, +5%) in a single revision.
func (s *Scene) DuplicateSelection(items []SelectionItem, groupID StringID, offsetX float64, offsetY float64) ([]SelectionItem, StringID, error) {
	if offsetX == 0 && offsetY == 0 {
		offsetX = 5.0
		offsetY = 5.0
	}

	payload, err := s.CopySelection(items, groupID)
	if err != nil {
		return nil, "", err
	}

	return s.PastePayload(payload, offsetX, offsetY)
}
