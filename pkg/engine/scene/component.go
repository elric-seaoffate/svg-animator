package scene

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

var componentSeq uint64
var componentInstanceSeq uint64

var reSemVer = regexp.MustCompile(`^(\d+)\.(\d+)\.(\d+)$`)
var reSlugClean = regexp.MustCompile(`[^a-z0-9-]+`)
var reMultiDash = regexp.MustCompile(`-+`)

// ComponentCreateOptions configures saving a selection or group as a reusable Component Definition.
type ComponentCreateOptions struct {
	ComponentID            string   `json:"componentId,omitempty"` // Reuse existing ID when saving a new revision
	Version                string   `json:"version,omitempty"`     // Explicit SemVer or auto-bumped
	Name                   string   `json:"name"`
	Description            string   `json:"description,omitempty"`
	Category               string   `json:"category,omitempty"`
	Tags                   []string `json:"tags,omitempty"`
	ThumbnailSVG           string   `json:"thumbnailSvg,omitempty"`
	FilterParameters       bool     `json:"filterParameters,omitempty"`       // When true, keep only SelectedParameterNames (empty = decorative 0-param)
	SelectedParameterNames []string `json:"selectedParameterNames,omitempty"` // Parameter names to expose
}

// ComponentUpgradeReport summarizes compatibility between two revisions of a reusable component.
type ComponentUpgradeReport struct {
	Compatible      bool     `json:"compatible"`
	OldVersion      string   `json:"oldVersion"`
	NewVersion      string   `json:"newVersion"`
	SuggestedBump   string   `json:"suggestedBump"` // "patch", "minor", "major"
	AddedParams     []string `json:"addedParams,omitempty"`
	BreakingChanges []string `json:"breakingChanges,omitempty"`
}

func componentSlug(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = reSlugClean.ReplaceAllString(s, "-")
	s = reMultiDash.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		return "component"
	}
	if len(s) > 36 {
		s = strings.Trim(s[:36], "-")
	}
	return s
}

// GenerateComponentID returns a stable, readable logical component ID (e.g. "cmp-gauge-a1b2c3d4").
func GenerateComponentID(name string) string {
	seq := atomic.AddUint64(&componentSeq, 1)
	slug := componentSlug(name)
	raw := fmt.Sprintf("%s|%d|%d", slug, time.Now().UnixNano(), seq)
	sum := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("cmp-%s-%s", slug, hex.EncodeToString(sum[:4]))
}

// NextComponentInstanceID generates a stable per-instance identifier distinct from Group.ID.
func NextComponentInstanceID(componentID string) string {
	seq := atomic.AddUint64(&componentInstanceSeq, 1)
	slug := componentSlug(strings.TrimPrefix(componentID, "cmp-"))
	if len(slug) > 20 {
		slug = strings.Trim(slug[:20], "-")
	}
	return fmt.Sprintf("inst-%s-%d-%d", slug, time.Now().UnixNano()%100000, seq)
}

// NormalizeSemVer ensures a valid MAJOR.MINOR.PATCH version string, defaulting to "1.0.0".
func NormalizeSemVer(v string) string {
	clean := strings.TrimPrefix(strings.TrimSpace(v), "v")
	if reSemVer.MatchString(clean) {
		return clean
	}
	return "1.0.0"
}

// BumpSemVer increments a semantic version by "patch", "minor", or "major".
func BumpSemVer(current, kind string) string {
	norm := NormalizeSemVer(current)
	m := reSemVer.FindStringSubmatch(norm)
	if len(m) != 4 {
		return "1.0.0"
	}
	maj, _ := strconv.Atoi(m[1])
	min, _ := strconv.Atoi(m[2])
	pat, _ := strconv.Atoi(m[3])
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "major":
		return fmt.Sprintf("%d.0.0", maj+1)
	case "minor":
		return fmt.Sprintf("%d.%d.0", maj, min+1)
	default:
		return fmt.Sprintf("%d.%d.%d", maj, min, pat+1)
	}
}

// ComputeComponentContentHash computes a deterministic SHA-256 digest of a Component Definition's artwork and parameters.
func ComputeComponentContentHash(def CompositeDef) string {
	canonical := struct {
		ComponentID  string                 `json:"componentId"`
		Name         string                 `json:"name"`
		Category     string                 `json:"category"`
		Tags         []string               `json:"tags,omitempty"`
		WidthPct     float64                `json:"widthPct"`
		HeightPct    float64                `json:"heightPct"`
		Payload      ClipboardPayload       `json:"payload"`
		Mappings     []GroupPropertyMapping `json:"mappings,omitempty"`
		Parameters   []WidgetParameter      `json:"parameters,omitempty"`
		Dependencies []ComponentDepRef      `json:"dependencies,omitempty"`
	}{
		ComponentID:  def.ComponentID,
		Name:         def.Name,
		Category:     def.Category,
		Tags:         def.Tags,
		WidthPct:     def.WidthPct,
		HeightPct:    def.HeightPct,
		Payload:      def.Payload,
		Mappings:     def.Mappings,
		Parameters:   def.Parameters,
		Dependencies: def.Dependencies,
	}
	b, _ := json.Marshal(canonical)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// DetectComponentCycle checks if parentComponentID depending on childDeps would introduce a direct or indirect cycle
// using the scene's known composite definitions.
func (s *Scene) DetectComponentCycle(parentComponentID string, childDeps []ComponentDepRef) error {
	parentID := strings.TrimSpace(parentComponentID)
	if parentID == "" || len(childDeps) == 0 {
		return nil
	}

	s.mu.RLock()
	depGraph := make(map[string][]string, len(s.composites)+1)
	for _, c := range s.composites {
		if c.ComponentID == "" {
			continue
		}
		for _, d := range c.Dependencies {
			if d.ComponentID != "" {
				depGraph[c.ComponentID] = append(depGraph[c.ComponentID], d.ComponentID)
			}
		}
	}
	s.mu.RUnlock()

	direct := make([]string, 0, len(childDeps))
	for _, d := range childDeps {
		if d.ComponentID == "" {
			continue
		}
		if d.ComponentID == parentID {
			return fmt.Errorf("cyclic component reference detected: component %q cannot contain itself", parentID)
		}
		direct = append(direct, d.ComponentID)
	}
	depGraph[parentID] = direct

	visited := make(map[string]bool)
	var dfs func(cur string, trail []string) error
	dfs = func(cur string, trail []string) error {
		if cur == parentID && len(trail) > 0 {
			return fmt.Errorf("cyclic component reference detected: %s -> %s", strings.Join(trail, " -> "), cur)
		}
		if visited[cur] {
			return nil
		}
		visited[cur] = true
		for _, next := range depGraph[cur] {
			if err := dfs(next, append(trail, cur)); err != nil {
				return err
			}
		}
		return nil
	}

	for _, start := range direct {
		if err := dfs(start, []string{parentID}); err != nil {
			return err
		}
	}
	return nil
}

// CreateComponentFromSelection turns an existing group or selection (1 or more objects, including nested component groups)
// into a reusable Component Definition (CompositeDef) with stable ComponentID, SemVer Version, metadata, dependencies,
// and author-selected exposed parameters.
func (s *Scene) CreateComponentFromSelection(items []SelectionItem, groupID StringID, opts ComponentCreateOptions) (CompositeDef, error) {
	name := strings.TrimSpace(opts.Name)
	if name == "" {
		return CompositeDef{}, errors.New("component name cannot be empty")
	}

	targetGroupID := groupID
	var collectedDeps []ComponentDepRef
	seenDep := make(map[string]bool)

	addDep := func(cid, ver string) {
		cid = strings.TrimSpace(cid)
		if cid == "" || seenDep[cid] {
			return
		}
		seenDep[cid] = true
		collectedDeps = append(collectedDeps, ComponentDepRef{
			ComponentID: cid,
			Version:     NormalizeSemVer(ver),
		})
	}

	// If no groupID supplied, resolve from items:
	// - if items belong to a single existing group, use it
	// - if items span multiple objects or nested child component groups, create a parent group cleanly
	if targetGroupID == "" {
		if len(items) == 0 {
			return CompositeDef{}, errors.New("select at least one object or group to save as a component")
		}

		// Expand any SelectionGroup items into their concrete member objects while recording nested child component dependencies
		s.mu.Lock()
		var expanded []GroupMember
		seenMember := make(map[string]bool)
		var childGroupIDs []StringID

		for _, it := range items {
			if it.Type == SelectionGroup {
				if grp, ok := s.groups[it.ID]; ok {
					if grp.ComponentID != "" {
						addDep(grp.ComponentID, grp.ComponentVersion)
					}
					childGroupIDs = append(childGroupIDs, grp.ID)
					for _, gm := range grp.Members {
						k := string(gm.Type) + ":" + string(gm.ID)
						if !seenMember[k] {
							seenMember[k] = true
							expanded = append(expanded, gm)
						}
					}
				}
				continue
			}
			if !s.objectExistsLocked(it.Type, it.ID) {
				continue
			}
			// Check if this member belongs to an existing component group
			for _, grp := range s.groups {
				for _, gm := range grp.Members {
					if gm.Type == it.Type && gm.ID == it.ID && grp.ComponentID != "" {
						addDep(grp.ComponentID, grp.ComponentVersion)
					}
				}
			}
			k := string(it.Type) + ":" + string(it.ID)
			if !seenMember[k] {
				seenMember[k] = true
				expanded = append(expanded, GroupMember{Type: it.Type, ID: it.ID})
			}
		}

		if len(expanded) == 0 {
			s.mu.Unlock()
			return CompositeDef{}, errors.New("no valid scene objects found in selection")
		}

		// Check if expanded matches an exact existing group
		if len(childGroupIDs) == 1 && len(items) == 1 {
			targetGroupID = childGroupIDs[0]
			// Do not record self as dependency if saving that single group directly
			collectedDeps = nil
			seenDep = make(map[string]bool)
			s.mu.Unlock()
		} else {
			// Create a component wrapper group (supports 1+ members, and supports wrapping nested child component groups)
			newGrpID := s.nextGroupID()
			// If members belonged to previous child groups, record parent relationship / detach cleanly so each member has one owning group
			for _, cgID := range childGroupIDs {
				if cg, ok := s.groups[cgID]; ok {
					cg.ParentGroupID = newGrpID
					s.groups[cgID] = cg
				}
			}
			grp := Group{
				ID:      newGrpID,
				Name:    name,
				Members: expanded,
			}
			s.groups[newGrpID] = grp
			s.groupIDs = append(s.groupIDs, newGrpID)
			s.ensureLayersInitializedLocked()
			s.coalesceGroupMembersInLayersLocked(grp)
			targetGroupID = newGrpID
			s.revision++
			s.mu.Unlock()
		}
	} else {
		// Check if any child groups reference targetGroupID as ParentGroupID
		s.mu.RLock()
		for _, g := range s.groups {
			if g.ParentGroupID == targetGroupID && g.ComponentID != "" {
				addDep(g.ComponentID, g.ComponentVersion)
			}
		}
		s.mu.RUnlock()
	}

	compIDStr := strings.TrimSpace(opts.ComponentID)
	if compIDStr == "" {
		compIDStr = GenerateComponentID(name)
	}

	// Cycle detection before persisting
	if err := s.DetectComponentCycle(compIDStr, collectedDeps); err != nil {
		return CompositeDef{}, err
	}

	// Copy group payload
	payload, err := s.CopySelection(nil, targetGroupID)
	if err != nil {
		return CompositeDef{}, err
	}

	// Filter parameters if requested by the Save-as-Component UI
	if opts.FilterParameters {
		allowed := make(map[string]bool, len(opts.SelectedParameterNames))
		for _, pn := range opts.SelectedParameterNames {
			allowed[strings.TrimSpace(pn)] = true
		}
		filteredParams := make([]WidgetParameter, 0, len(payload.Parameters))
		for _, p := range payload.Parameters {
			if allowed[p.Name] {
				filteredParams = append(filteredParams, p)
			}
		}
		payload.Parameters = filteredParams
		if len(payload.Groups) > 0 {
			filteredMappings := make([]GroupPropertyMapping, 0, len(payload.Groups[0].Mappings))
			for _, m := range payload.Groups[0].Mappings {
				// Keep mapping if its generated param name or alias is selected
				genName := GenerateParameterName(payload.Groups[0].Name, m.Alias, "group")
				if allowed[genName] || allowed[m.Alias] {
					filteredMappings = append(filteredMappings, m)
				}
			}
			payload.Groups[0].Mappings = filteredMappings
		}
	}

	cw := s.Canvas().Width
	if cw <= 0 {
		cw = 1280
	}
	ch := s.Canvas().Height
	if ch <= 0 {
		ch = 720
	}
	minX, minY, maxX, maxY, boundsErr := s.ComputeGroupBounds(targetGroupID, cw, ch)
	if boundsErr != nil {
		minX, minY, maxX, maxY = 30, 30, 70, 70
	}
	widthPct := math.Max(1.0, math.Round((maxX-minX)*100.0)/100.0)
	heightPct := math.Max(1.0, math.Round((maxY-minY)*100.0)/100.0)
	centerXPct := math.Round(((minX+maxX)/2.0)*100.0) / 100.0
	centerYPct := math.Round(((minY+maxY)/2.0)*100.0) / 100.0

	s.mu.Lock()
	defer s.mu.Unlock()

	grp, exists := s.groups[targetGroupID]
	if !exists {
		return CompositeDef{}, fmt.Errorf("group not found: %s", targetGroupID)
	}

	if s.composites == nil {
		s.composites = make(map[StringID]CompositeDef)
	}

	// Reuse local CompositeDef ID if updating an existing ComponentID in scene
	var localID StringID
	for id, existing := range s.composites {
		if existing.ComponentID == compIDStr {
			localID = id
			break
		}
	}
	if localID == "" {
		localID = s.nextCompositeIDLocked()
		s.compositeIDs = append(s.compositeIDs, localID)
	}

	ver := NormalizeSemVer(opts.Version)
	cat := strings.TrimSpace(opts.Category)
	if cat == "" {
		cat = "general"
	}

	var cleanTags []string
	seenTag := make(map[string]bool)
	for _, t := range opts.Tags {
		ct := strings.ToLower(strings.TrimSpace(t))
		if ct != "" && !seenTag[ct] {
			seenTag[ct] = true
			cleanTags = append(cleanTags, ct)
		}
	}
	sort.Strings(cleanTags)

	var mappingsCopy []GroupPropertyMapping
	if len(payload.Groups) > 0 && len(payload.Groups[0].Mappings) > 0 {
		mappingsCopy = make([]GroupPropertyMapping, len(payload.Groups[0].Mappings))
		for i, m := range payload.Groups[0].Mappings {
			mappingsCopy[i] = DeepCopyGroupPropertyMapping(m)
		}
	}

	if len(payload.Groups) > 0 {
		payload.Groups[0].Name = name
		payload.Groups[0].CompositeID = localID
		payload.Groups[0].ComponentID = compIDStr
		payload.Groups[0].ComponentVersion = ver
	}

	nowStr := time.Now().UTC().Format(time.RFC3339)
	comp := CompositeDef{
		ID:           localID,
		ComponentID:  compIDStr,
		Version:      ver,
		Name:         name,
		Description:  strings.TrimSpace(opts.Description),
		Category:     cat,
		Tags:         cleanTags,
		ThumbnailSVG: strings.TrimSpace(opts.ThumbnailSVG),
		CreatedAt:    nowStr,
		UpdatedAt:    nowStr,
		WidthPct:     widthPct,
		HeightPct:    heightPct,
		CenterXPct:   centerXPct,
		CenterYPct:   centerYPct,
		Payload:      payload,
		Mappings:     mappingsCopy,
		Parameters:   append([]WidgetParameter(nil), payload.Parameters...),
		Dependencies: collectedDeps,
	}
	comp.ContentHash = ComputeComponentContentHash(comp)

	s.composites[localID] = comp

	// Stamp provenance on source group
	grp.CompositeID = localID
	grp.ComponentID = compIDStr
	grp.ComponentVersion = ver
	if grp.InstanceID == "" {
		grp.InstanceID = NextComponentInstanceID(compIDStr)
	}
	s.groups[targetGroupID] = grp

	s.revision++
	if s.history != nil {
		s.history.Record(s.getSnapshotLocked(), s.selection)
	}

	return DeepCopyCompositeDef(comp), nil
}

// ImportLibraryComponent loads a saved Component Definition from the global library into the current scene
// so it can be instantiated and embedded in project snapshots.
func (s *Scene) ImportLibraryComponent(def CompositeDef) (CompositeDef, error) {
	if strings.TrimSpace(def.Name) == "" {
		return CompositeDef{}, errors.New("imported component name cannot be empty")
	}
	if strings.TrimSpace(def.ComponentID) == "" {
		def.ComponentID = GenerateComponentID(def.Name)
	}
	def.Version = NormalizeSemVer(def.Version)
	if err := s.DetectComponentCycle(def.ComponentID, def.Dependencies); err != nil {
		return CompositeDef{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.composites == nil {
		s.composites = make(map[StringID]CompositeDef)
	}

	// Find existing local entry by ComponentID
	var localID StringID
	for id, existing := range s.composites {
		if existing.ComponentID == def.ComponentID {
			localID = id
			break
		}
	}
	if localID == "" {
		localID = s.nextCompositeIDLocked()
		s.compositeIDs = append(s.compositeIDs, localID)
	}

	cp := DeepCopyCompositeDef(def)
	cp.ID = localID
	if cp.ContentHash == "" {
		cp.ContentHash = ComputeComponentContentHash(cp)
	}
	if len(cp.Payload.Groups) > 0 {
		cp.Payload.Groups[0].CompositeID = localID
		cp.Payload.Groups[0].ComponentID = cp.ComponentID
		cp.Payload.Groups[0].ComponentVersion = cp.Version
	}

	s.composites[localID] = cp
	s.revision++
	return DeepCopyCompositeDef(cp), nil
}

// InstantiateComponent places an independent concrete instance of a reusable component (looked up by local ID or stable ComponentID)
// at the requested percentage offset (offsetX, offsetY) and optional scale (scaleX, scaleY; <= 0 defaults to 1.0).
func (s *Scene) InstantiateComponent(compOrComponentID, instanceName string, offsetX, offsetY, scaleX, scaleY float64) (Group, []SelectionItem, error) {
	s.mu.RLock()
	var targetLocalID StringID
	var compDef CompositeDef
	found := false
	if c, ok := s.composites[StringID(compOrComponentID)]; ok {
		targetLocalID = c.ID
		compDef = DeepCopyCompositeDef(c)
		found = true
	} else {
		for id, c := range s.composites {
			if c.ComponentID == compOrComponentID {
				targetLocalID = id
				compDef = DeepCopyCompositeDef(c)
				found = true
				break
			}
		}
	}
	s.mu.RUnlock()

	if !found {
		return Group{}, nil, fmt.Errorf("component definition not found in scene: %s", compOrComponentID)
	}

	grp, items, err := s.InstantiateComposite(targetLocalID, instanceName, offsetX, offsetY)
	if err != nil {
		return Group{}, nil, err
	}

	// Stamp ComponentID, ComponentVersion, and unique InstanceID
	s.mu.Lock()
	if stored, ok := s.groups[grp.ID]; ok {
		stored.ComponentID = compDef.ComponentID
		stored.ComponentVersion = NormalizeSemVer(compDef.Version)
		stored.InstanceID = NextComponentInstanceID(compDef.ComponentID)
		s.groups[grp.ID] = stored
		grp = DeepCopyGroup(stored)
	}
	s.mu.Unlock()

	// Apply optional independent scaling around instance center
	if (scaleX > 0 && math.Abs(scaleX-1.0) > 0.001) || (scaleY > 0 && math.Abs(scaleY-1.0) > 0.001) {
		sx := scaleX
		if sx <= 0 {
			sx = 1.0
		}
		sy := scaleY
		if sy <= 0 {
			sy = 1.0
		}
		s.scaleGroupMembers(grp.ID, sx, sy)
	}

	return grp, items, nil
}

// scaleGroupMembers scales a group's members proportionally around the group's center.
func (s *Scene) scaleGroupMembers(groupID StringID, sx, sy float64) {
	cw := s.Canvas().Width
	if cw <= 0 {
		cw = 1280
	}
	ch := s.Canvas().Height
	if ch <= 0 {
		ch = 720
	}
	minX, minY, maxX, maxY, err := s.ComputeGroupBounds(groupID, cw, ch)
	if err != nil {
		return
	}
	cxPct := (minX + maxX) / 2.0
	cyPct := (minY + maxY) / 2.0
	cxPx := (cxPct / 100.0) * cw
	cyPx := (cyPct / 100.0) * ch
	avgScale := (sx + sy) / 2.0

	s.mu.Lock()
	defer s.mu.Unlock()

	grp, ok := s.groups[groupID]
	if !ok {
		return
	}
	for _, m := range grp.Members {
		switch m.Type {
		case SelectionNode:
			if n, exists := s.nodes[m.ID]; exists {
				n.X = cxPct + (n.X-cxPct)*sx
				n.Y = cyPct + (n.Y-cyPct)*sy
				if n.Width > 0 {
					n.Width = math.Max(8, n.Width*sx)
				}
				if n.Height > 0 {
					n.Height = math.Max(8, n.Height*sy)
				}
				s.nodes[m.ID] = n
			}
		case SelectionGlow:
			if g, exists := s.glows[m.ID]; exists {
				g.X = cxPct + (g.X-cxPct)*sx
				g.Y = cyPct + (g.Y-cyPct)*sy
				if g.Size > 0 {
					g.Size = math.Max(4, g.Size*avgScale)
				}
				s.glows[m.ID] = g
			}
		case SelectionRipple:
			if r, exists := s.ripples[m.ID]; exists {
				r.X = cxPct + (r.X-cxPct)*sx
				r.Y = cyPct + (r.Y-cyPct)*sy
				if r.OuterR > 0 {
					r.OuterR = math.Max(8, r.OuterR*avgScale)
				}
				s.ripples[m.ID] = r
			}
		case SelectionImage:
			if img, exists := s.images[m.ID]; exists {
				img.X = cxPct + (img.X-cxPct)*sx
				img.Y = cyPct + (img.Y-cyPct)*sy
				img.Width = math.Max(8, img.Width*sx)
				img.Height = math.Max(8, img.Height*sy)
				s.images[m.ID] = img
			}
		case SelectionLite:
			if le, exists := s.liteEffects[m.ID]; exists {
				le.X = cxPx + (le.X-cxPx)*sx
				le.Y = cyPx + (le.Y-cyPx)*sy
				if le.Width > 0 {
					le.Width = math.Max(8, le.Width*sx)
				}
				if le.Height > 0 {
					le.Height = math.Max(8, le.Height*sy)
				}
				if le.Radius > 0 {
					le.Radius = math.Max(4, le.Radius*avgScale)
				}
				if le.FontSize > 0 {
					le.FontSize = math.Max(8, math.Min(120, math.Round(le.FontSize*avgScale)))
				}
				s.liteEffects[m.ID] = le
			}
		}
	}
	s.revision++
}

// CheckComponentUpgradeCompatibility compares an older ComponentDef against a newer ComponentDef
// and classifies whether the upgrade is compatible (patch/minor) or breaking (major).
func CheckComponentUpgradeCompatibility(oldDef, newDef CompositeDef) ComponentUpgradeReport {
	rep := ComponentUpgradeReport{
		Compatible:    true,
		OldVersion:    NormalizeSemVer(oldDef.Version),
		NewVersion:    NormalizeSemVer(newDef.Version),
		SuggestedBump: "patch",
	}

	oldMap := make(map[string]WidgetParameter, len(oldDef.Parameters))
	for _, p := range oldDef.Parameters {
		oldMap[p.Name] = p
	}
	newMap := make(map[string]WidgetParameter, len(newDef.Parameters))
	for _, p := range newDef.Parameters {
		newMap[p.Name] = p
	}

	for name, oldP := range oldMap {
		newP, exists := newMap[name]
		if !exists {
			rep.Compatible = false
			rep.BreakingChanges = append(rep.BreakingChanges, fmt.Sprintf("exposed parameter %q was removed", name))
			continue
		}
		if oldP.Type != newP.Type {
			rep.Compatible = false
			rep.BreakingChanges = append(rep.BreakingChanges, fmt.Sprintf("parameter %q changed type from %q to %q", name, oldP.Type, newP.Type))
			continue
		}
		if oldP.Type == "enum" && len(oldP.Options) > 0 {
			newOpts := make(map[string]bool, len(newP.Options))
			for _, o := range newP.Options {
				newOpts[o] = true
			}
			for _, o := range oldP.Options {
				if !newOpts[o] {
					rep.Compatible = false
					rep.BreakingChanges = append(rep.BreakingChanges, fmt.Sprintf("enum parameter %q removed option %q", name, o))
				}
			}
		}
	}

	for name := range newMap {
		if _, existed := oldMap[name]; !existed {
			rep.AddedParams = append(rep.AddedParams, name)
		}
	}

	sort.Strings(rep.BreakingChanges)
	sort.Strings(rep.AddedParams)

	if !rep.Compatible {
		rep.SuggestedBump = "major"
	} else if len(rep.AddedParams) > 0 {
		rep.SuggestedBump = "minor"
	} else {
		rep.SuggestedBump = "patch"
	}

	return rep
}

// ApplyComponentUpdateToInstance upgrades a placed component instance group to a new ComponentDef revision
// while preserving the instance's center position, display name, instanceId, and compatible parameter defaults.
func (s *Scene) ApplyComponentUpdateToInstance(groupID StringID, newDef CompositeDef, force bool) (Group, ComponentUpgradeReport, error) {
	cw := s.Canvas().Width
	if cw <= 0 {
		cw = 1280
	}
	ch := s.Canvas().Height
	if ch <= 0 {
		ch = 720
	}

	minX, minY, maxX, maxY, boundsErr := s.ComputeGroupBounds(groupID, cw, ch)
	oldCx, oldCy := 50.0, 50.0
	if boundsErr == nil {
		oldCx = (minX + maxX) / 2.0
		oldCy = (minY + maxY) / 2.0
	}

	s.mu.RLock()
	oldGrp, exists := s.groups[groupID]
	if !exists {
		s.mu.RUnlock()
		return Group{}, ComponentUpgradeReport{}, fmt.Errorf("instance group not found: %s", groupID)
	}
	var oldDef CompositeDef
	if c, ok := s.composites[oldGrp.CompositeID]; ok {
		oldDef = DeepCopyCompositeDef(c)
	} else {
		oldDef.Version = oldGrp.ComponentVersion
	}
	// Capture current instance-level parameter overrides
	oldParamDefaults := make(map[string]any)
	oldGrpName := oldGrp.Name
	oldInstanceID := oldGrp.InstanceID
	oldMembers := append([]GroupMember(nil), oldGrp.Members...)
	for _, p := range s.parameters {
		if p.Target == string(groupID) || p.Target == "group-"+string(groupID) {
			oldParamDefaults[p.Property] = p.Default
		}
	}
	s.mu.RUnlock()

	report := CheckComponentUpgradeCompatibility(oldDef, newDef)
	if !report.Compatible && !force {
		return Group{}, report, fmt.Errorf("incompatible component update (%s -> %s): %s", report.OldVersion, report.NewVersion, strings.Join(report.BreakingChanges, "; "))
	}

	// Import the new definition into the scene
	imported, err := s.ImportLibraryComponent(newDef)
	if err != nil {
		return Group{}, report, err
	}

	// Delete the old group & its members cleanly
	if err := s.DeleteGroup(groupID, true); err != nil {
		_, _ = s.Ungroup(groupID)
		for _, m := range oldMembers {
			switch m.Type {
			case SelectionNode:
				_ = s.RemoveNode(m.ID)
			case SelectionFlow:
				_ = s.RemoveFlow(m.ID)
			case SelectionGlow:
				_ = s.RemoveGlow(m.ID)
			case SelectionRipple:
				_ = s.RemoveRipple(m.ID)
			case SelectionImage:
				_ = s.DeleteImage(m.ID)
			case SelectionLite:
				_ = s.DeleteLiteEffect(m.ID)
			}
		}
	}

	// Instantiate the new revision at the preserved center
	offX := oldCx - imported.CenterXPct
	offY := oldCy - imported.CenterYPct
	newGrp, _, err := s.InstantiateComponent(imported.ComponentID, oldGrpName, offX, offY, 1.0, 1.0)
	if err != nil {
		return Group{}, report, err
	}

	// Restore preserved InstanceID and compatible parameter overrides
	s.mu.Lock()
	if stored, ok := s.groups[newGrp.ID]; ok {
		if oldInstanceID != "" {
			stored.InstanceID = oldInstanceID
		}
		for i := range stored.Mappings {
			if prevVal, ok := oldParamDefaults[stored.Mappings[i].Alias]; ok {
				stored.Mappings[i].Default = prevVal
			}
		}
		s.groups[newGrp.ID] = stored
		s.syncGroupMappingsToWidgetParamsLocked(newGrp.ID)
		newGrp = DeepCopyGroup(stored)
	}
	s.mu.Unlock()

	return newGrp, report, nil
}
