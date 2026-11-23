package scene

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
)

// ClipboardPayload encapsulates a self-contained copy of scene objects and groups.
type ClipboardPayload struct {
	Format      string            `json:"format"`  // "svg-animator-clipboard"
	Version     string            `json:"version"` // "1.0.0"
	Nodes       []Node            `json:"nodes,omitempty"`
	Flows       []Flow            `json:"flows,omitempty"`
	Glows       []Glow            `json:"glows,omitempty"`
	Ripples     []Ripple          `json:"ripples,omitempty"`
	Images      []Image           `json:"images,omitempty"`
	LiteEffects []LiteEffect      `json:"liteEffects,omitempty"`
	Groups      []Group           `json:"groups,omitempty"`
	Parameters  []WidgetParameter `json:"parameters,omitempty"`
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

	copiedTargets := make(map[string]bool)
	recordTarget := func(selType SelectionType, id StringID) {
		raw := string(id)
		copiedTargets[raw] = true
		pref := PrefixForType(selType)
		if !strings.HasPrefix(raw, pref) {
			copiedTargets[pref+raw] = true
		}
	}

	// 1. If groupID is provided, copy the entire group and all its members
	if groupID != "" {
		if grp, exists := s.groups[groupID]; exists {
			payload.Groups = append(payload.Groups, DeepCopyGroup(grp))
			recordTarget(SelectionGroup, grp.ID)
			for _, m := range grp.Members {
				switch m.Type {
				case SelectionNode:
					if n, ok := s.nodes[m.ID]; ok {
						payload.Nodes = append(payload.Nodes, DeepCopyNode(n))
						recordTarget(SelectionNode, m.ID)
					}
				case SelectionFlow:
					if f, ok := s.flows[m.ID]; ok {
						payload.Flows = append(payload.Flows, DeepCopyFlow(f))
						recordTarget(SelectionFlow, m.ID)
					}
				case SelectionGlow:
					if g, ok := s.glows[m.ID]; ok {
						payload.Glows = append(payload.Glows, DeepCopyGlow(g))
						recordTarget(SelectionGlow, m.ID)
					}
				case SelectionRipple:
					if r, ok := s.ripples[m.ID]; ok {
						payload.Ripples = append(payload.Ripples, DeepCopyRipple(r))
						recordTarget(SelectionRipple, m.ID)
					}
				case SelectionImage:
					if img, ok := s.images[m.ID]; ok {
						payload.Images = append(payload.Images, DeepCopyImage(img))
						recordTarget(SelectionImage, m.ID)
					}
				case SelectionLite:
					if le, ok := s.liteEffects[m.ID]; ok {
						payload.LiteEffects = append(payload.LiteEffects, DeepCopyLiteEffect(le))
						recordTarget(SelectionLite, m.ID)
					}
				}
			}
			for _, p := range s.parameters {
				if copiedTargets[p.Target] {
					payload.Parameters = append(payload.Parameters, p)
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
	liteIDs := make(map[StringID]bool)

	for _, it := range items {
		switch it.Type {
		case SelectionNode:
			if !nodeIDs[it.ID] {
				nodeIDs[it.ID] = true
				if n, ok := s.nodes[it.ID]; ok {
					payload.Nodes = append(payload.Nodes, DeepCopyNode(n))
					recordTarget(SelectionNode, it.ID)
				}
			}
		case SelectionFlow:
			if !flowIDs[it.ID] {
				flowIDs[it.ID] = true
				if f, ok := s.flows[it.ID]; ok {
					payload.Flows = append(payload.Flows, DeepCopyFlow(f))
					recordTarget(SelectionFlow, it.ID)
				}
			}
		case SelectionGlow:
			if !glowIDs[it.ID] {
				glowIDs[it.ID] = true
				if g, ok := s.glows[it.ID]; ok {
					payload.Glows = append(payload.Glows, DeepCopyGlow(g))
					recordTarget(SelectionGlow, it.ID)
				}
			}
		case SelectionRipple:
			if !rippleIDs[it.ID] {
				rippleIDs[it.ID] = true
				if r, ok := s.ripples[it.ID]; ok {
					payload.Ripples = append(payload.Ripples, DeepCopyRipple(r))
					recordTarget(SelectionRipple, it.ID)
				}
			}
		case SelectionImage:
			if !imageIDs[it.ID] {
				imageIDs[it.ID] = true
				if img, ok := s.images[it.ID]; ok {
					payload.Images = append(payload.Images, DeepCopyImage(img))
					recordTarget(SelectionImage, it.ID)
				}
			}
		case SelectionLite:
			if !liteIDs[it.ID] {
				liteIDs[it.ID] = true
				if le, ok := s.liteEffects[it.ID]; ok {
					payload.LiteEffects = append(payload.LiteEffects, DeepCopyLiteEffect(le))
					recordTarget(SelectionLite, it.ID)
				}
			}
		case SelectionGroup:
			if grp, exists := s.groups[it.ID]; exists {
				payload.Groups = append(payload.Groups, DeepCopyGroup(grp))
				recordTarget(SelectionGroup, grp.ID)
				for _, m := range grp.Members {
					switch m.Type {
					case SelectionNode:
						if !nodeIDs[m.ID] {
							nodeIDs[m.ID] = true
							if n, ok := s.nodes[m.ID]; ok {
								payload.Nodes = append(payload.Nodes, DeepCopyNode(n))
								recordTarget(SelectionNode, m.ID)
							}
						}
					case SelectionFlow:
						if !flowIDs[m.ID] {
							flowIDs[m.ID] = true
							if f, ok := s.flows[m.ID]; ok {
								payload.Flows = append(payload.Flows, DeepCopyFlow(f))
								recordTarget(SelectionFlow, m.ID)
							}
						}
					case SelectionGlow:
						if !glowIDs[m.ID] {
							glowIDs[m.ID] = true
							if g, ok := s.glows[m.ID]; ok {
								payload.Glows = append(payload.Glows, DeepCopyGlow(g))
								recordTarget(SelectionGlow, m.ID)
							}
						}
					case SelectionRipple:
						if !rippleIDs[m.ID] {
							rippleIDs[m.ID] = true
							if r, ok := s.ripples[m.ID]; ok {
								payload.Ripples = append(payload.Ripples, DeepCopyRipple(r))
								recordTarget(SelectionRipple, m.ID)
							}
						}
					case SelectionImage:
						if !imageIDs[m.ID] {
							imageIDs[m.ID] = true
							if img, ok := s.images[m.ID]; ok {
								payload.Images = append(payload.Images, DeepCopyImage(img))
								recordTarget(SelectionImage, m.ID)
							}
						}
					case SelectionLite:
						if !liteIDs[m.ID] {
							liteIDs[m.ID] = true
							if le, ok := s.liteEffects[m.ID]; ok {
								payload.LiteEffects = append(payload.LiteEffects, DeepCopyLiteEffect(le))
								recordTarget(SelectionLite, m.ID)
							}
						}
					}
				}
			}
		}
	}

	for _, p := range s.parameters {
		if copiedTargets[p.Target] {
			payload.Parameters = append(payload.Parameters, p)
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
	liteIDMap := make(map[StringID]StringID)
	groupIDMap := make(map[StringID]StringID)

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
			c.OrigX += offsetX
			c.OrigY += offsetY
			cloned.Crop = &c
		}
		if img.Clip != nil {
			cl := *img.Clip
			cloned.Clip = &cl
		}
		if len(img.CropVersions) > 0 {
			cloned.CropVersions = make([]CropVersion, len(img.CropVersions))
			for i, cv := range img.CropVersions {
				cvCopy := cv
				cvCopy.X += offsetX
				cvCopy.Y += offsetY
				cvCopy.OrigX += offsetX
				cvCopy.OrigY += offsetY
				cloned.CropVersions[i] = cvCopy
			}
		}
		if img.Metadata != nil {
			mCopy := make(map[string]any, len(img.Metadata))
			for k, v := range img.Metadata {
				mCopy[k] = v
			}
			cloned.Metadata = mCopy
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
			fromExternal := cloned.FromNodeID != "" && nodeIDMap[f.FromNodeID] == ""
			toExternal := cloned.ToNodeID != "" && nodeIDMap[f.ToNodeID] == ""

			newNodes := make([]geometry.Point, len(cloned.Nodes))
			for i, p := range cloned.Nodes {
				isFirst := i == 0
				isLast := i == len(cloned.Nodes)-1

				if isFirst && fromExternal {
					newNodes[i] = p
				} else if isLast && toExternal {
					newNodes[i] = p
				} else {
					newNodes[i] = geometry.Point{
						X: math.Round((p.X+offsetX)*1000.0) / 1000.0,
						Y: math.Round((p.Y+offsetY)*1000.0) / 1000.0,
					}
				}
			}
			cloned.Nodes = newNodes
		}

		s.flows[newID] = cloned
		s.flowIDs = append(s.flowIDs, newID)
		newItems = append(newItems, SelectionItem{Type: SelectionFlow, ID: newID})
	}

	// Recompute flow connections for all newly pasted nodes and attached external nodes
	for _, newNID := range nodeIDMap {
		s.recalculateNodeConnectionsLocked(newNID)
	}
	for _, f := range payload.Flows {
		if remappedFrom, ok := nodeIDMap[f.FromNodeID]; ok {
			s.recalculateNodeConnectionsLocked(remappedFrom)
		} else if f.FromNodeID != "" {
			s.recalculateNodeConnectionsLocked(f.FromNodeID)
		}
		if remappedTo, ok := nodeIDMap[f.ToNodeID]; ok {
			s.recalculateNodeConnectionsLocked(remappedTo)
		} else if f.ToNodeID != "" {
			s.recalculateNodeConnectionsLocked(f.ToNodeID)
		}
	}

	// 5b. Paste LiteEffects
	cw := s.canvas.Width
	if cw <= 0 {
		cw = 1280.0
	}
	ch := s.canvas.Height
	if ch <= 0 {
		ch = 720.0
	}
	offsetXPx := (offsetX / 100.0) * cw
	offsetYPx := (offsetY / 100.0) * ch
	if s.liteEffects == nil {
		s.liteEffects = make(map[StringID]LiteEffect)
	}
	for _, le := range payload.LiteEffects {
		var newID StringID
		for {
			s.liteEffectsCounter++
			newID = StringID(strconv.FormatInt(s.liteEffectsCounter, 10))
			if _, exists := s.liteEffects[newID]; !exists {
				break
			}
		}
		liteIDMap[le.ID] = newID

		cloned := DeepCopyLiteEffect(le)
		cloned.ID = newID
		if cloned.Kind == "flow-lite" && len(cloned.Points) > 0 {
			for i := range cloned.Points {
				cloned.Points[i].X = math.Round((cloned.Points[i].X+offsetX)*1000.0) / 1000.0
				cloned.Points[i].Y = math.Round((cloned.Points[i].Y+offsetY)*1000.0) / 1000.0
			}
		} else {
			cloned.X = math.Round((cloned.X+offsetXPx)*100.0) / 100.0
			cloned.Y = math.Round((cloned.Y+offsetYPx)*100.0) / 100.0
		}
		if cloned.Name != "" {
			cloned.Name = s.EnsureUniqueObjectName(SelectionLite, cloned.Name+" Copy", newID)
		}

		s.liteEffects[newID] = cloned
		s.liteEffectOrder = append(s.liteEffectOrder, newID)
		if len(s.layers) > 0 {
			s.layers = append(s.layers, LayerEntry{Type: SelectionLite, ID: newID})
		}
		newItems = append(newItems, SelectionItem{Type: SelectionLite, ID: newID})
	}

	// 6. Paste Groups (with member remapping)
	for _, g := range payload.Groups {
		var newGID StringID
		for {
			s.groupsCounter++
			newGID = StringID("group-" + strconv.FormatInt(s.groupsCounter, 10))
			if _, exists := s.groups[newGID]; !exists {
				break
			}
		}
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
				if newGlID, ok := glowIDMap[m.ID]; ok {
					remappedMembers = append(remappedMembers, GroupMember{Type: SelectionGlow, ID: newGlID})
				}
			case SelectionRipple:
				if newRID, ok := rippleIDMap[m.ID]; ok {
					remappedMembers = append(remappedMembers, GroupMember{Type: SelectionRipple, ID: newRID})
				}
			case SelectionImage:
				if newImgID, ok := imageIDMap[m.ID]; ok {
					remappedMembers = append(remappedMembers, GroupMember{Type: SelectionImage, ID: newImgID})
				}
			case SelectionLite:
				if newLID, ok := liteIDMap[m.ID]; ok {
					remappedMembers = append(remappedMembers, GroupMember{Type: SelectionLite, ID: newLID})
				}
			}
		}

		if len(remappedMembers) >= 2 {
			groupIDMap[g.ID] = newGID
			var remappedMappings []GroupPropertyMapping
			for _, m := range g.Mappings {
				var newTargets []GroupTargetBinding
				for _, t := range m.Targets {
					var newMemberID StringID
					var ok bool
					switch t.MemberType {
					case SelectionNode:
						newMemberID, ok = nodeIDMap[t.MemberID]
					case SelectionFlow:
						newMemberID, ok = flowIDMap[t.MemberID]
					case SelectionGlow:
						newMemberID, ok = glowIDMap[t.MemberID]
					case SelectionRipple:
						newMemberID, ok = rippleIDMap[t.MemberID]
					case SelectionImage:
						newMemberID, ok = imageIDMap[t.MemberID]
					case SelectionLite:
						newMemberID, ok = liteIDMap[t.MemberID]
					}
					if ok && newMemberID != "" {
						newTargets = append(newTargets, GroupTargetBinding{
							MemberType: t.MemberType,
							MemberID:   newMemberID,
							Target:     canonicalMemberTargetID(t.MemberType, newMemberID),
							Property:   t.Property,
						})
					}
				}
				if len(newTargets) > 0 {
					mCopy := DeepCopyGroupPropertyMapping(m)
					mCopy.Targets = newTargets
					remappedMappings = append(remappedMappings, mCopy)
				}
			}
			var newGroupName string
			isCompositeOrSequential := g.CompositeID != "" || len(g.Mappings) > 0 || reTrailingInstanceNumber.MatchString(strings.TrimSpace(g.Name))
			if isCompositeOrSequential {
				newGroupName = s.nextSequentialGroupNameLocked(g.Name)
			} else {
				newGroupName = g.Name + " Copy"
			}
			clonedGroup := Group{
				ID:          newGID,
				Name:        newGroupName,
				CompositeID: g.CompositeID,
				Members:     remappedMembers,
				Mappings:    remappedMappings,
				Metadata:    deepCopyMetadata(g.Metadata),
			}
			s.groups[newGID] = clonedGroup
			s.groupIDs = append(s.groupIDs, newGID)
			s.ensureLayersInitializedLocked()
			s.coalesceGroupMembersInLayersLocked(clonedGroup)
			s.syncGroupMappingsToWidgetParamsLocked(newGID)
			newGroupID = newGID
		}
	}

	// 7. Remap and clone WidgetParameters bound to copied objects/groups
	remapTargetID := func(oldTarget string) (string, bool) {
		tType := InferTargetType(oldTarget)
		switch tType {
		case "node":
			clean := StringID(strings.TrimPrefix(oldTarget, "node-"))
			if newID, ok := nodeIDMap[clean]; ok {
				return "node-" + string(newID), true
			}
			if newID, ok := nodeIDMap[StringID(oldTarget)]; ok {
				return "node-" + string(newID), true
			}
		case "flow":
			clean := StringID(strings.TrimPrefix(oldTarget, "flow-"))
			if newID, ok := flowIDMap[clean]; ok {
				return "flow-" + string(newID), true
			}
			if newID, ok := flowIDMap[StringID(oldTarget)]; ok {
				return "flow-" + string(newID), true
			}
		case "glow":
			clean := StringID(strings.TrimPrefix(oldTarget, "glow-"))
			if newID, ok := glowIDMap[clean]; ok {
				return "glow-" + string(newID), true
			}
			if newID, ok := glowIDMap[StringID(oldTarget)]; ok {
				return "glow-" + string(newID), true
			}
		case "ripple":
			clean := StringID(strings.TrimPrefix(oldTarget, "ripple-"))
			if newID, ok := rippleIDMap[clean]; ok {
				return "ripple-" + string(newID), true
			}
			if newID, ok := rippleIDMap[StringID(oldTarget)]; ok {
				return "ripple-" + string(newID), true
			}
		case "image":
			clean := StringID(strings.TrimPrefix(oldTarget, "image-"))
			if newID, ok := imageIDMap[StringID("image-"+string(clean))]; ok {
				return string(newID), true
			}
			if newID, ok := imageIDMap[StringID(oldTarget)]; ok {
				return string(newID), true
			}
		case "lite":
			clean := StringID(strings.TrimPrefix(oldTarget, "lite-"))
			if newID, ok := liteIDMap[clean]; ok {
				return "lite-" + string(newID), true
			}
			if newID, ok := liteIDMap[StringID(oldTarget)]; ok {
				return "lite-" + string(newID), true
			}
		case "group":
			if newGID, ok := groupIDMap[StringID(oldTarget)]; ok {
				return string(newGID), true
			}
			clean := StringID("group-" + strings.TrimPrefix(oldTarget, "group-"))
			if newGID, ok := groupIDMap[clean]; ok {
				return string(newGID), true
			}
		}
		return "", false
	}

	for _, p := range payload.Parameters {
		if len(p.Targets) > 0 && InferTargetType(p.Target) == "group" {
			// Group semantic parameters are already synchronized via syncGroupMappingsToWidgetParamsLocked
			continue
		}
		if newTarget, ok := remapTargetID(p.Target); ok {
			clonedParam := p
			clonedParam.Target = newTarget
			objName, tType := s.getObjectNameForTargetLocked(newTarget)
			baseParamName := GenerateParameterName(objName, clonedParam.Property, tType)
			paramName := baseParamName
			suffix := 2
			for {
				collision := false
				for _, ep := range s.parameters {
					if ep.Name == paramName {
						collision = true
						break
					}
				}
				if !collision {
					break
				}
				paramName = fmt.Sprintf("%s-%d", baseParamName, suffix)
				suffix++
			}
			clonedParam.Name = paramName
			s.parameters = append(s.parameters, clonedParam)
		}
	}

	s.ensureLayersInitializedLocked()
	s.fixupAllGroupContiguitiesLocked()
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
