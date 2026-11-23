package scene

import (
	"errors"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

// ComponentDepRef records a direct dependency on a nested child reusable component.
type ComponentDepRef struct {
	ComponentID string `json:"componentId"`
	Version     string `json:"version,omitempty"`
}

// CompositeDef represents a reusable composite/component definition authored from a group or selection.
type CompositeDef struct {
	ID           StringID               `json:"id"`                    // Project-local ID (e.g. "comp-1")
	ComponentID  string                 `json:"componentId,omitempty"` // Stable logical library identity (e.g. "cmp-gauge-a1b2c3d4")
	Version      string                 `json:"version,omitempty"`     // Semantic version (e.g. "1.0.0")
	Name         string                 `json:"name"`                  // e.g. "cpuwindow"
	Description  string                 `json:"description,omitempty"`
	Category     string                 `json:"category,omitempty"`
	Tags         []string               `json:"tags,omitempty"`
	ThumbnailSVG string                 `json:"thumbnailSvg,omitempty"`
	ContentHash  string                 `json:"contentHash,omitempty"`
	CreatedAt    string                 `json:"createdAt,omitempty"`
	UpdatedAt    string                 `json:"updatedAt,omitempty"`
	WidthPct     float64                `json:"widthPct"`
	HeightPct    float64                `json:"heightPct"`
	CenterXPct   float64                `json:"centerXPct"`
	CenterYPct   float64                `json:"centerYPct"`
	Payload      ClipboardPayload       `json:"payload"`                // Canonical member objects & group snapshot
	Mappings     []GroupPropertyMapping `json:"mappings,omitempty"`     // Canonical semantic property mappings
	Parameters   []WidgetParameter      `json:"parameters,omitempty"`   // Explicitly exposed visual parameters
	Dependencies []ComponentDepRef      `json:"dependencies,omitempty"` // Direct nested child component dependencies
}

var reTrailingInstanceNumber = regexp.MustCompile(`^(.*?)[-_ ]*(\d+)$`)

func normalizeCompositeBaseName(name string) string {
	clean := strings.TrimSpace(name)
	if clean == "" {
		return "composite"
	}
	clean = strings.TrimSuffix(clean, " Copy")
	clean = strings.TrimSpace(clean)
	if matches := reTrailingInstanceNumber.FindStringSubmatch(clean); len(matches) == 3 {
		base := strings.TrimSpace(matches[1])
		if base != "" && !strings.EqualFold(base, "group") && !strings.EqualFold(base, "comp") {
			return base
		}
	}
	return clean
}

// nextSequentialGroupNameLocked generates the next available sequential instance name
// such as "cpuwindow-1", "cpuwindow-2", "cpuwindow-3" based on existing group names in the scene.
func (s *Scene) nextSequentialGroupNameLocked(baseName string) string {
	base := normalizeCompositeBaseName(baseName)
	slug := strings.ToLower(strings.TrimSpace(base))
	slug = regexp.MustCompile(`[^a-z0-9_-]+`).ReplaceAllString(slug, "-")
	slug = regexp.MustCompile(`-+`).ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		slug = "composite"
	}

	usedNames := make(map[string]bool, len(s.groups))
	for _, g := range s.groups {
		gSlug := strings.ToLower(strings.TrimSpace(g.Name))
		usedNames[gSlug] = true
	}

	n := 1
	for {
		candidate := fmt.Sprintf("%s-%d", slug, n)
		if !usedNames[strings.ToLower(candidate)] {
			return candidate
		}
		n++
	}
}

func (s *Scene) nextCompositeIDLocked() StringID {
	for {
		s.compositesCounter++
		candidate := StringID("comp-" + strconv.FormatInt(s.compositesCounter, 10))
		if _, exists := s.composites[candidate]; !exists {
			return candidate
		}
	}
}

// GetComposite retrieves a composite definition by ID.
func (s *Scene) GetComposite(compID StringID) (CompositeDef, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.composites == nil {
		return CompositeDef{}, false
	}
	c, ok := s.composites[compID]
	if !ok {
		return CompositeDef{}, false
	}
	return DeepCopyCompositeDef(c), true
}

// GetAllComposites returns all composite definitions in deterministic order.
func (s *Scene) GetAllComposites() []CompositeDef {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]CompositeDef, 0, len(s.compositeIDs))
	for _, id := range s.compositeIDs {
		if c, ok := s.composites[id]; ok {
			out = append(out, DeepCopyCompositeDef(c))
		}
	}
	return out
}

// CompositesCounter returns the current composite ID counter.
func (s *Scene) CompositesCounter() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.compositesCounter
}

// CreateCompositeFromGroup packages an existing group, all of its member objects, internal flows,
// semantic mappings, and bound widget parameters into a reusable CompositeDef template.
func (s *Scene) CreateCompositeFromGroup(groupID StringID, name, description string) (CompositeDef, error) {
	// Extract self-contained group payload first
	payload, err := s.CopySelection(nil, groupID)
	if err != nil {
		return CompositeDef{}, err
	}

	cw := s.Canvas().Width
	if cw <= 0 {
		cw = 1280
	}
	ch := s.Canvas().Height
	if ch <= 0 {
		ch = 720
	}
	minX, minY, maxX, maxY, boundsErr := s.ComputeGroupBounds(groupID, cw, ch)
	if boundsErr != nil {
		minX, minY, maxX, maxY = 30, 30, 70, 70
	}
	widthPct := math.Max(1.0, math.Round((maxX-minX)*100.0)/100.0)
	heightPct := math.Max(1.0, math.Round((maxY-minY)*100.0)/100.0)
	centerXPct := math.Round(((minX+maxX)/2.0)*100.0) / 100.0
	centerYPct := math.Round(((minY+maxY)/2.0)*100.0) / 100.0

	s.mu.Lock()
	defer s.mu.Unlock()

	grp, exists := s.groups[groupID]
	if !exists {
		return CompositeDef{}, fmt.Errorf("group not found: %s", groupID)
	}
	if len(grp.Members) < 2 {
		return CompositeDef{}, errors.New("composite template requires a group with at least 2 members")
	}

	baseName := strings.TrimSpace(name)
	if baseName == "" {
		baseName = normalizeCompositeBaseName(grp.Name)
	}
	if baseName == "" {
		baseName = "composite"
	}

	if s.composites == nil {
		s.composites = make(map[StringID]CompositeDef)
	}

	newID := s.nextCompositeIDLocked()
	var mappingsCopy []GroupPropertyMapping
	if len(grp.Mappings) > 0 {
		mappingsCopy = make([]GroupPropertyMapping, len(grp.Mappings))
		for i, m := range grp.Mappings {
			mappingsCopy[i] = DeepCopyGroupPropertyMapping(m)
		}
	}

	// Ensure the canonical group in payload carries baseName and CompositeID
	if len(payload.Groups) > 0 {
		payload.Groups[0].Name = baseName
		payload.Groups[0].CompositeID = newID
		payload.Groups[0].Mappings = mappingsCopy
	}

	comp := CompositeDef{
		ID:          newID,
		Name:        baseName,
		Description: strings.TrimSpace(description),
		WidthPct:    widthPct,
		HeightPct:   heightPct,
		CenterXPct:  centerXPct,
		CenterYPct:  centerYPct,
		Payload:     payload,
		Mappings:    mappingsCopy,
	}

	s.composites[newID] = comp
	s.compositeIDs = append(s.compositeIDs, newID)

	// Record provenance on the source group as well
	grp.CompositeID = newID
	s.groups[groupID] = grp

	s.revision++
	if s.history != nil {
		s.history.Record(s.getSnapshotLocked(), s.selection)
	}

	return DeepCopyCompositeDef(comp), nil
}

// InstantiateComposite places a new independent concrete Group instance from a CompositeDef
// at the requested percentage offset (offsetX, offsetY) relative to the template's original position.
// All member IDs, flow connections, semantic target bindings, and widget parameter names are freshly
// generated and remapped using sequential instance naming (e.g. "cpuwindow-1", "cpuwindow-2", "cpuwindow-3").
func (s *Scene) InstantiateComposite(compID StringID, instanceName string, offsetX, offsetY float64) (Group, []SelectionItem, error) {
	s.mu.RLock()
	comp, exists := s.composites[compID]
	if !exists {
		s.mu.RUnlock()
		return Group{}, nil, fmt.Errorf("composite definition not found: %s", compID)
	}
	payloadCopy := DeepCopyClipboardPayload(comp.Payload)
	compName := comp.Name
	s.mu.RUnlock()

	if len(payloadCopy.Groups) > 0 {
		payloadCopy.Groups[0].CompositeID = compID
		if strings.TrimSpace(instanceName) != "" {
			payloadCopy.Groups[0].Name = strings.TrimSpace(instanceName)
		} else {
			payloadCopy.Groups[0].Name = compName
		}
	}

	newItems, newGroupID, err := s.PastePayload(payloadCopy, offsetX, offsetY)
	if err != nil {
		return Group{}, nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	grp, ok := s.groups[newGroupID]
	if !ok {
		return Group{}, newItems, fmt.Errorf("instantiated group %s not found", newGroupID)
	}

	// Ensure explicit instanceName if provided and unique, otherwise PastePayload already assigned sequential name
	if cleanCustom := strings.TrimSpace(instanceName); cleanCustom != "" {
		used := false
		for id, other := range s.groups {
			if id != newGroupID && strings.EqualFold(other.Name, cleanCustom) {
				used = true
				break
			}
		}
		if !used && grp.Name != cleanCustom {
			grp.Name = cleanCustom
			s.groups[newGroupID] = grp
			s.syncGroupMappingsToWidgetParamsLocked(newGroupID)
			for i := range s.parameters {
				p := &s.parameters[i]
				if (p.Target == string(newGroupID) || p.Target == "group-"+string(newGroupID)) && len(p.Targets) == 0 {
					p.Name = GenerateParameterName(cleanCustom, p.Property, "group")
				}
			}
		}
	}

	if s.history != nil {
		s.history.Record(s.getSnapshotLocked(), s.selection)
	}

	return DeepCopyGroup(grp), newItems, nil
}

// DeleteComposite removes a composite template definition from the scene library.
// Existing placed group instances remain completely intact as independent concrete groups.
func (s *Scene) DeleteComposite(compID StringID) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.composites[compID]; !exists {
		return fmt.Errorf("composite definition not found: %s", compID)
	}

	delete(s.composites, compID)
	newIDs := make([]StringID, 0, len(s.compositeIDs))
	for _, id := range s.compositeIDs {
		if id != compID {
			newIDs = append(newIDs, id)
		}
	}
	s.compositeIDs = newIDs
	s.revision++
	if s.history != nil {
		s.history.Record(s.getSnapshotLocked(), s.selection)
	}
	return nil
}
