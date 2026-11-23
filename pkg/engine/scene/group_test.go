package scene

import (
	"testing"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
)

func TestGroupLifecycleAndValidation(t *testing.T) {
	sc := NewScene()

	n1 := sc.CreateNode(Node{Shape: "rect", X: 10, Y: 10, Width: 100, Height: 50}, nil, false)
	n2 := sc.CreateNode(Node{Shape: "circle", X: 30, Y: 30, Width: 80, Height: 80}, nil, false)

	// 1. Minimum 2 members validation
	_, err := sc.CreateGroup("Invalid", []GroupMember{
		{Type: SelectionNode, ID: n1.ID},
	})
	if err == nil {
		t.Fatalf("expected error for group with only 1 member")
	}

	// 2. Non-existent object validation
	_, err = sc.CreateGroup("InvalidNonExistent", []GroupMember{
		{Type: SelectionNode, ID: n1.ID},
		{Type: SelectionNode, ID: "99999"},
	})
	if err == nil {
		t.Fatalf("expected error for non-existent member")
	}

	// 3. Successful group creation
	members := []GroupMember{
		{Type: SelectionNode, ID: n1.ID},
		{Type: SelectionNode, ID: n2.ID},
	}
	grp, err := sc.CreateGroup("Cooling Pump", members)
	if err != nil {
		t.Fatalf("CreateGroup failed: %v", err)
	}
	if grp.Name != "Cooling Pump" {
		t.Errorf("expected group name 'Cooling Pump', got %q", grp.Name)
	}
	if len(grp.Members) != 2 {
		t.Errorf("expected 2 members, got %d", len(grp.Members))
	}

	// 4. Object cannot be in two groups
	n3 := sc.CreateNode(Node{Shape: "rect", X: 50, Y: 50, Width: 60, Height: 60}, nil, false)
	_, err = sc.CreateGroup("DuplicateMembership", []GroupMember{
		{Type: SelectionNode, ID: n1.ID}, // already in Cooling Pump
		{Type: SelectionNode, ID: n3.ID},
	})
	if err == nil {
		t.Fatalf("expected error when adding object that already belongs to another group")
	}

	// 5. FindGroupByMember
	foundGrp, found := sc.FindGroupByMember(SelectionNode, n1.ID)
	if !found || foundGrp.ID != grp.ID {
		t.Fatalf("FindGroupByMember failed for n1: found=%v, id=%v", found, foundGrp.ID)
	}

	// 6. Rename group
	renamed, err := sc.RenameGroup(grp.ID, "Cooling Assembly A")
	if err != nil {
		t.Fatalf("RenameGroup failed: %v", err)
	}
	if renamed.Name != "Cooling Assembly A" {
		t.Errorf("expected renamed name, got %q", renamed.Name)
	}

	// 7. Ungroup preserves member objects
	unMembers, err := sc.Ungroup(grp.ID)
	if err != nil {
		t.Fatalf("Ungroup failed: %v", err)
	}
	if len(unMembers) != 2 {
		t.Errorf("expected 2 unbundled members, got %d", len(unMembers))
	}
	if _, exists := sc.GetGroup(grp.ID); exists {
		t.Errorf("group should not exist after ungroup")
	}
	if _, exists := sc.nodes[n1.ID]; !exists {
		t.Errorf("n1 should remain in scene after ungroup")
	}
	if _, exists := sc.nodes[n2.ID]; !exists {
		t.Errorf("n2 should remain in scene after ungroup")
	}
}

func TestGroupMemberPruningOnDelete(t *testing.T) {
	sc := NewScene()

	n1 := sc.CreateNode(Node{Shape: "rect", X: 10, Y: 10, Width: 80, Height: 40}, nil, false)
	n2 := sc.CreateNode(Node{Shape: "circle", X: 30, Y: 10, Width: 60, Height: 60}, nil, false)
	n3 := sc.CreateNode(Node{Shape: "diamond", X: 50, Y: 10, Width: 60, Height: 60}, nil, false)

	grp, err := sc.CreateGroup("Three Nodes", []GroupMember{
		{Type: SelectionNode, ID: n1.ID},
		{Type: SelectionNode, ID: n2.ID},
		{Type: SelectionNode, ID: n3.ID},
	})
	if err != nil {
		t.Fatalf("CreateGroup failed: %v", err)
	}

	// Deleting 1 member leaves 2 -> group continues to exist
	sc.RemoveNode(n3.ID)
	g, exists := sc.GetGroup(grp.ID)
	if !exists {
		t.Fatalf("group should continue to exist with 2 members")
	}
	if len(g.Members) != 2 {
		t.Errorf("expected 2 members remaining, got %d", len(g.Members))
	}

	// Deleting 2nd member leaves 1 -> group is auto-disbanded
	sc.RemoveNode(n2.ID)
	if _, exists := sc.GetGroup(grp.ID); exists {
		t.Fatalf("group should be disbanded when fewer than 2 members remain")
	}
	// n1 remains in scene
	if _, exists := sc.nodes[n1.ID]; !exists {
		t.Errorf("n1 should remain in scene")
	}
}

func TestGroupMovement(t *testing.T) {
	sc := NewScene()

	n1 := sc.CreateNode(Node{Shape: "rect", X: 20, Y: 20, Width: 80, Height: 40}, nil, false)
	n2 := sc.CreateNode(Node{Shape: "rect", X: 40, Y: 20, Width: 80, Height: 40}, nil, false)

	// Connected flow between n1 and n2
	fl := Flow{
		ID:         "1",
		FromNodeID: n1.ID,
		ToNodeID:   n2.ID,
		Nodes: []geometry.Point{
			{X: 20, Y: 20},
			{X: 30, Y: 15}, // manual waypoint
			{X: 40, Y: 20},
		},
	}
	sc.UpdateFlow(fl)

	// Standalone glow
	gl := Glow{
		ID:   "1",
		X:    25,
		Y:    25,
		Size: 40,
	}
	sc.UpdateGlow(gl)

	grp, err := sc.CreateGroup("Assembly", []GroupMember{
		{Type: SelectionNode, ID: n1.ID},
		{Type: SelectionNode, ID: n2.ID},
		{Type: SelectionFlow, ID: fl.ID},
		{Type: SelectionGlow, ID: gl.ID},
	})
	if err != nil {
		t.Fatalf("CreateGroup failed: %v", err)
	}

	// Move group by (+10, -5)
	err = sc.MoveGroup(grp.ID, 10.0, -5.0)
	if err != nil {
		t.Fatalf("MoveGroup failed: %v", err)
	}

	// Check nodes moved
	un1 := sc.nodes[n1.ID]
	if un1.X != 30 || un1.Y != 15 {
		t.Errorf("expected n1 at (30, 15), got (%f, %f)", un1.X, un1.Y)
	}
	un2 := sc.nodes[n2.ID]
	if un2.X != 50 || un2.Y != 15 {
		t.Errorf("expected n2 at (50, 15), got (%f, %f)", un2.X, un2.Y)
	}

	// Check glow moved
	ugl := sc.glows[gl.ID]
	if ugl.X != 35 || ugl.Y != 20 {
		t.Errorf("expected glow at (35, 20), got (%f, %f)", ugl.X, ugl.Y)
	}

	// Check flow waypoints moved
	ufl := sc.flows[fl.ID]
	if len(ufl.Nodes) >= 2 && ufl.Nodes[1].X != 40 {
		t.Errorf("expected middle waypoint at X=40, got %f", ufl.Nodes[1].X)
	}
}

func TestGroupBounds(t *testing.T) {
	sc := NewScene()

	n1 := sc.CreateNode(Node{Shape: "rect", X: 20, Y: 20, Width: 128, Height: 72}, nil, false)
	n2 := sc.CreateNode(Node{Shape: "rect", X: 50, Y: 40, Width: 128, Height: 72}, nil, false)

	grp, _ := sc.CreateGroup("BoundsGroup", []GroupMember{
		{Type: SelectionNode, ID: n1.ID},
		{Type: SelectionNode, ID: n2.ID},
	})

	minX, minY, maxX, maxY, err := sc.ComputeGroupBounds(grp.ID, 1280, 720)
	if err != nil {
		t.Fatalf("ComputeGroupBounds failed: %v", err)
	}

	// n1: center (20%, 20%), width 128px is 10% of 1280 => hw is 5%, hh is 5%
	// bounds: minX = 15%, maxX = 55%, minY = 15%, maxY = 45%
	if minX > 16.0 || minX < 14.0 {
		t.Errorf("expected minX ~15, got %f", minX)
	}
	if maxX > 56.0 || maxX < 54.0 {
		t.Errorf("expected maxX ~55, got %f", maxX)
	}
	if minY > 16.0 || minY < 14.0 {
		t.Errorf("expected minY ~15, got %f", minY)
	}
	if maxY > 46.0 || maxY < 44.0 {
		t.Errorf("expected maxY ~45, got %f", maxY)
	}
}

func TestRemoveGroupMembers(t *testing.T) {
	sc := NewScene()

	n1 := sc.CreateNode(Node{Shape: "rect", X: 10, Y: 10, Width: 80, Height: 40}, nil, false)
	n2 := sc.CreateNode(Node{Shape: "circle", X: 30, Y: 10, Width: 60, Height: 60}, nil, false)
	n3 := sc.CreateNode(Node{Shape: "diamond", X: 50, Y: 10, Width: 60, Height: 60}, nil, false)

	grp, err := sc.CreateGroup("Three Nodes", []GroupMember{
		{Type: SelectionNode, ID: n1.ID},
		{Type: SelectionNode, ID: n2.ID},
		{Type: SelectionNode, ID: n3.ID},
	})
	if err != nil {
		t.Fatalf("CreateGroup failed: %v", err)
	}

	// 1. Remove invalid member (not in group)
	_, _, err = sc.RemoveGroupMembers(grp.ID, []GroupMember{
		{Type: SelectionNode, ID: "99999"},
	})
	if err == nil {
		t.Fatalf("expected error when removing non-member")
	}

	// 2. Remove n3 from group of 3 -> 2 remain, group not dissolved
	remGrp, dissolved, err := sc.RemoveGroupMembers(grp.ID, []GroupMember{
		{Type: SelectionNode, ID: n3.ID},
	})
	if err != nil {
		t.Fatalf("RemoveGroupMembers failed: %v", err)
	}
	if dissolved {
		t.Errorf("expected group NOT to be dissolved with 2 members remaining")
	}
	if len(remGrp.Members) != 2 {
		t.Errorf("expected 2 members remaining, got %d", len(remGrp.Members))
	}
	// n3 remains in scene
	if _, exists := sc.nodes[n3.ID]; !exists {
		t.Errorf("n3 must remain in scene after removal from group")
	}

	// 3. Remove n2 from group of 2 -> 1 remains, group automatically dissolved!
	_, dissolved, err = sc.RemoveGroupMembers(grp.ID, []GroupMember{
		{Type: SelectionNode, ID: n2.ID},
	})
	if err != nil {
		t.Fatalf("RemoveGroupMembers failed: %v", err)
	}
	if !dissolved {
		t.Errorf("expected group to be dissolved when fewer than 2 members remain")
	}
	if _, exists := sc.GetGroup(grp.ID); exists {
		t.Errorf("group should be deleted after dissolution")
	}
	// All objects remain in scene
	if _, exists := sc.nodes[n1.ID]; !exists {
		t.Errorf("n1 must remain in scene")
	}
	if _, exists := sc.nodes[n2.ID]; !exists {
		t.Errorf("n2 must remain in scene")
	}
}

func TestBatch4GroupIntegrityAndLocking(t *testing.T) {
	sc := NewScene()

	n1 := sc.CreateNode(Node{Shape: "rect", X: 10, Y: 10, Width: 80, Height: 40}, nil, false)
	n2 := sc.CreateNode(Node{Shape: "circle", X: 30, Y: 10, Width: 60, Height: 60}, nil, false)
	img1, err := sc.CreateImage(Image{
		Src:    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
		Width:  100,
		Height: 80,
		X:      50,
		Y:      50,
	})
	if err != nil {
		t.Fatalf("CreateImage failed: %v", err)
	}

	// 1. Nested group rejection
	grp1, err := sc.CreateGroup("SubGroup", []GroupMember{
		{Type: SelectionNode, ID: n1.ID},
		{Type: SelectionNode, ID: n2.ID},
	})
	if err != nil {
		t.Fatalf("CreateGroup failed: %v", err)
	}

	_, err = sc.CreateGroup("ParentGroup", []GroupMember{
		{Type: SelectionGroup, ID: grp1.ID},
		{Type: SelectionImage, ID: img1.ID},
	})
	if err == nil || err.Error() != "nested groups are not supported" {
		t.Fatalf("expected nested group rejection, got %v", err)
	}

	// 2. RenameObject for groups
	ok, err := sc.RenameObject(SelectionGroup, grp1.ID, "Renamed Group")
	if !ok || err != nil {
		t.Fatalf("RenameObject for group failed: %v", err)
	}
	renamedGrp, _ := sc.GetGroup(grp1.ID)
	if renamedGrp.Name != "Renamed Group" {
		t.Fatalf("expected group name 'Renamed Group', got %q", renamedGrp.Name)
	}

	// 3. SelectionGroup pruned on Ungroup
	sc.SetSelection(SelectionGroup, grp1.ID)
	if sc.GetSelection().Type != SelectionGroup {
		t.Fatalf("expected SelectionGroup active")
	}
	_, err = sc.Ungroup(grp1.ID)
	if err != nil {
		t.Fatalf("Ungroup failed: %v", err)
	}
	if sc.GetSelection().Type == SelectionGroup {
		t.Fatalf("SelectionGroup should be pruned on ungroup, got %+v", sc.GetSelection())
	}

	// 4. Group with Image member and DeleteGroup with deleteMembers=true
	grpWithImg, err := sc.CreateGroup("Group With Image", []GroupMember{
		{Type: SelectionNode, ID: n1.ID},
		{Type: SelectionImage, ID: img1.ID},
	})
	if err != nil {
		t.Fatalf("CreateGroup with Image failed: %v", err)
	}
	sc.SetSelection(SelectionGroup, grpWithImg.ID)

	err = sc.DeleteGroup(grpWithImg.ID, true)
	if err != nil {
		t.Fatalf("DeleteGroup failed: %v", err)
	}
	if _, exists := sc.images[img1.ID]; exists {
		t.Fatalf("img1 must be deleted when DeleteGroup(deleteMembers=true) is called")
	}
	if _, exists := sc.nodes[n1.ID]; exists {
		t.Fatalf("n1 must be deleted when DeleteGroup(deleteMembers=true) is called")
	}
	if sc.GetSelection().Type == SelectionGroup {
		t.Fatalf("SelectionGroup must be pruned on DeleteGroup, got %+v", sc.GetSelection())
	}

	// 5. Lock enforcement in MoveGroup, Ungroup, DeleteGroup, RenameObject
	n3 := sc.CreateNode(Node{Shape: "rect", X: 20, Y: 20, Width: 80, Height: 40}, nil, false)
	n4 := sc.CreateNode(Node{Shape: "circle", X: 40, Y: 20, Width: 60, Height: 60}, nil, false)
	lockedGrp, err := sc.CreateGroup("Locked Group", []GroupMember{
		{Type: SelectionNode, ID: n3.ID},
		{Type: SelectionNode, ID: n4.ID},
	})
	if err != nil {
		t.Fatalf("CreateGroup failed: %v", err)
	}

	// Lock the group
	if err := sc.SetObjectLocked(SelectionGroup, lockedGrp.ID, true); err != nil {
		t.Fatalf("SetObjectLocked on group failed: %v", err)
	}

	if err := sc.MoveGroup(lockedGrp.ID, 5, 5); err == nil {
		t.Fatalf("expected error moving locked group")
	}
	if _, err := sc.Ungroup(lockedGrp.ID); err == nil {
		t.Fatalf("expected error ungrouping locked group")
	}
	if err := sc.DeleteGroup(lockedGrp.ID, false); err == nil {
		t.Fatalf("expected error deleting locked group")
	}
	if _, err := sc.RenameObject(SelectionGroup, lockedGrp.ID, "New Name"); err == nil {
		t.Fatalf("expected error renaming locked group")
	}

	// Unlock group but lock one member
	_ = sc.SetObjectLocked(SelectionGroup, lockedGrp.ID, false)
	_ = sc.SetObjectLocked(SelectionNode, n3.ID, true)

	if err := sc.MoveGroup(lockedGrp.ID, 5, 5); err == nil {
		t.Fatalf("expected error moving group with locked member")
	}
	if err := sc.DeleteGroup(lockedGrp.ID, true); err == nil {
		t.Fatalf("expected error deleting group with locked member when deleteMembers=true")
	}
	if _, err := sc.RenameObject(SelectionNode, n3.ID, "Locked Node"); err == nil {
		t.Fatalf("expected error renaming locked node")
	}
}

func TestStage16EM1GroupWidgetTargetsAndLiteClipboard(t *testing.T) {
	sc := NewScene()

	n1 := sc.CreateNode(Node{Shape: "rect", X: 20, Y: 20, Width: 120, Height: 60, Name: "PanelBox"}, nil, false)
	val45 := 45.0
	val0 := 0.0
	val100 := 100.0
	leGauge := sc.CreateLiteEffect(LiteEffect{
		Kind:     "gauge-lite",
		Variant:  "ring",
		Name:     "CpuGauge",
		X:        300,
		Y:        200,
		Width:    140,
		Height:   140,
		Value:    &val45,
		MinValue: &val0,
		MaxValue: &val100,
	})
	leText := sc.CreateLiteEffect(LiteEffect{
		Kind:      "text-lite",
		Variant:   "ticker-h",
		Name:      "StatusTicker",
		X:         300,
		Y:         360,
		Width:     220,
		Height:    50,
		LabelText: "CPU OK",
	})

	grp, err := sc.CreateGroup("cpuwindow", []GroupMember{
		{Type: SelectionNode, ID: n1.ID},
		{Type: SelectionLite, ID: leGauge.ID},
		{Type: SelectionLite, ID: leText.ID},
	})
	if err != nil {
		t.Fatalf("CreateGroup with LiteEffects failed: %v", err)
	}

	// 1. Expose group opacity, visibility, speed parameters
	minSpeed := 0.1
	maxSpeed := 10.0
	if err := sc.AddParameter(WidgetParameter{
		Name:     "cpuwindow-group-speed",
		Type:     "speed",
		Target:   string(grp.ID),
		Property: "speed",
		Default:  1.0,
		Min:      &minSpeed,
		Max:      &maxSpeed,
	}); err != nil {
		t.Fatalf("AddParameter for group speed failed: %v", err)
	}
	if err := sc.AddParameter(WidgetParameter{
		Name:     "cpuwindow-group-opacity",
		Type:     "number",
		Target:   string(grp.ID),
		Property: "opacity",
		Default:  1.0,
	}); err != nil {
		t.Fatalf("AddParameter for group opacity failed: %v", err)
	}
	if err := sc.AddParameter(WidgetParameter{
		Name:     "cpugauge-lite-value",
		Type:     "number",
		Target:   "lite-" + string(leGauge.ID),
		Property: "value",
		Default:  45.0,
	}); err != nil {
		t.Fatalf("AddParameter for lite gauge value failed: %v", err)
	}

	// 2. RenameGroup regenerates bound group parameter names
	if _, err := sc.RenameGroup(grp.ID, "serverpod"); err != nil {
		t.Fatalf("RenameGroup failed: %v", err)
	}
	params := sc.GetParameters()
	foundSpeed := false
	foundOpacity := false
	for _, p := range params {
		if p.Name == "serverpod-group-speed" {
			foundSpeed = true
		}
		if p.Name == "serverpod-group-opacity" {
			foundOpacity = true
		}
	}
	if !foundSpeed || !foundOpacity {
		t.Fatalf("expected group parameter names to update after RenameGroup, got: %+v", params)
	}

	// 3. Copy & Paste group with LiteEffects and WidgetParameters
	payload, err := sc.CopySelection(nil, grp.ID)
	if err != nil {
		t.Fatalf("CopySelection for group failed: %v", err)
	}
	if len(payload.LiteEffects) != 2 {
		t.Fatalf("expected 2 LiteEffects in clipboard payload, got %d", len(payload.LiteEffects))
	}
	if len(payload.Parameters) != 3 {
		t.Fatalf("expected 3 WidgetParameters in clipboard payload, got %d", len(payload.Parameters))
	}

	newItems, newGroupID, err := sc.PastePayload(payload, 10.0, 10.0)
	if err != nil {
		t.Fatalf("PastePayload failed: %v", err)
	}
	if newGroupID == "" || newGroupID == grp.ID {
		t.Fatalf("expected new pasted group ID, got %q", newGroupID)
	}
	if len(newItems) != 3 {
		t.Fatalf("expected 3 new items pasted, got %d", len(newItems))
	}

	// 4. ValidateWidgetExport resolves group target in isolated SVG
	rawSVG := `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
		<g id="group-1" class="scene-group" data-group-id="group-1" data-semantic-target="group-1" data-semantic-name="serverpod">
			<g id="node-1" data-node-id="1" data-semantic-target="node-1"><rect width="120" height="60"/></g>
			<g id="lite-effect-1" data-lite-id="1" data-semantic-target="lite-1"><circle r="50"/></g>
			<g id="lite-effect-2" data-lite-id="2" data-semantic-target="lite-2"><text>CPU OK</text></g>
		</g>
		<g id="group-2" class="scene-group" data-group-id="group-2" data-semantic-target="group-2">
			<g id="node-2" data-node-id="2" data-semantic-target="node-2"><rect width="120" height="60"/></g>
			<g id="lite-effect-3" data-lite-id="3" data-semantic-target="lite-3"><circle r="50"/></g>
			<g id="lite-effect-4" data-lite-id="4" data-semantic-target="lite-4"><text>CPU OK</text></g>
		</g>
	</svg>`
	isoSVG, _, err := IsolateSVGWidget(rawSVG, WidgetIsolationOptions{
		InstanceID: "test-m1",
		Prefix:     "test_m1__",
		ScopeCSS:   true,
	})
	if err != nil {
		t.Fatalf("IsolateSVGWidget failed: %v", err)
	}
	manifest := &WidgetManifest{
		SchemaVersion: 1,
		Parameters:    sc.GetParameters(),
	}
	if err := ValidateWidgetExport(manifest, isoSVG, sc); err != nil {
		t.Fatalf("ValidateWidgetExport failed for group target: %v", err)
	}

	// 5. Ungroup prunes group parameters
	if _, err := sc.Ungroup(grp.ID); err != nil {
		t.Fatalf("Ungroup failed: %v", err)
	}
	for _, p := range sc.GetParameters() {
		if p.Target == string(grp.ID) {
			t.Fatalf("expected group parameter %q for %s to be pruned on Ungroup", p.Name, grp.ID)
		}
	}
}

func TestStage16EM2GroupSemanticPropertyMappings(t *testing.T) {
	sc := NewScene()

	n1 := sc.CreateNode(Node{Shape: "rect", X: 20, Y: 20, Width: 160, Height: 80, Name: "Frame"}, nil, false)
	v50 := 50.0
	v0 := 0.0
	v100 := 100.0
	leGauge := sc.CreateLiteEffect(LiteEffect{
		Kind:     "gauge-lite",
		Variant:  "ring",
		Name:     "CpuGauge",
		X:        300,
		Y:        200,
		Width:    140,
		Height:   140,
		Value:    &v50,
		MinValue: &v0,
		MaxValue: &v100,
	})
	leText := sc.CreateLiteEffect(LiteEffect{
		Kind:      "text-lite",
		Variant:   "rounded",
		Name:      "CpuLabel",
		X:         300,
		Y:         340,
		Width:     160,
		Height:    40,
		LabelText: "50",
	})
	leTracer := sc.CreateLiteEffect(LiteEffect{
		Kind:    "perimeter-tracer",
		Variant: "rounded",
		Name:    "BorderTracer",
		X:       300,
		Y:       240,
		Width:   200,
		Height:  240,
		Color:   "#38bdf8",
	})

	grp, err := sc.CreateGroup("cpuwindow", []GroupMember{
		{Type: SelectionNode, ID: n1.ID},
		{Type: SelectionLite, ID: leGauge.ID},
		{Type: SelectionLite, ID: leText.ID},
		{Type: SelectionLite, ID: leTracer.ID},
	})
	if err != nil {
		t.Fatalf("CreateGroup failed: %v", err)
	}

	// 1. Multi-target semantic mapping: numeric "cpu" -> Gauge value AND TextLite text
	updatedGrp, err := sc.SetGroupPropertyMapping(grp.ID, GroupPropertyMapping{
		Alias:   "cpu",
		Label:   "CPU Load (%)",
		Type:    "number",
		Default: 65.0,
		Min:     &v0,
		Max:     &v100,
		Targets: []GroupTargetBinding{
			{MemberType: SelectionLite, MemberID: leGauge.ID, Property: "value"},
			{MemberType: SelectionLite, MemberID: leText.ID, Property: "text"},
		},
	})
	if err != nil {
		t.Fatalf("SetGroupPropertyMapping for 'cpu' failed: %v", err)
	}
	if len(updatedGrp.Mappings) != 1 || len(updatedGrp.Mappings[0].Targets) != 2 {
		t.Fatalf("expected 1 mapping with 2 targets, got: %+v", updatedGrp.Mappings)
	}

	// 2. Multi-target semantic mapping: color "status-color" -> Node stroke, Tracer color, Text borderColor
	updatedGrp, err = sc.SetGroupPropertyMapping(grp.ID, GroupPropertyMapping{
		Alias:   "status-color",
		Label:   "Status Colour",
		Type:    "color",
		Default: "#22c55e",
		Targets: []GroupTargetBinding{
			{MemberType: SelectionNode, MemberID: n1.ID, Property: "stroke"},
			{MemberType: SelectionLite, MemberID: leTracer.ID, Property: "color"},
			{MemberType: SelectionLite, MemberID: leText.ID, Property: "borderColor"},
		},
	})
	if err != nil {
		t.Fatalf("SetGroupPropertyMapping for 'status-color' failed: %v", err)
	}
	if len(updatedGrp.Mappings) != 2 {
		t.Fatalf("expected 2 mappings on group, got %d", len(updatedGrp.Mappings))
	}

	// Verify synchronized WidgetParameters
	params := sc.GetParameters()
	if len(params) != 2 {
		t.Fatalf("expected 2 synchronized WidgetParameters, got %d: %+v", len(params), params)
	}
	if params[0].Name != "cpuwindow-group-cpu" || len(params[0].Targets) != 2 {
		t.Fatalf("expected cpuwindow-group-cpu with 2 targets, got: %+v", params[0])
	}
	if params[1].Name != "cpuwindow-group-status-color" || len(params[1].Targets) != 3 {
		t.Fatalf("expected cpuwindow-group-status-color with 3 targets, got: %+v", params[1])
	}

	// 3. Reject invalid mappings: reserved alias, non-member target, incompatible type
	if _, err := sc.SetGroupPropertyMapping(grp.ID, GroupPropertyMapping{
		Alias:   "opacity", // reserved
		Type:    "number",
		Default: 1.0,
		Targets: []GroupTargetBinding{{MemberType: SelectionNode, MemberID: n1.ID, Property: "opacity"}},
	}); err == nil {
		t.Fatalf("expected error for reserved alias 'opacity'")
	}

	nOutside := sc.CreateNode(Node{Shape: "circle", X: 80, Y: 80, Width: 50, Height: 50}, nil, false)
	if _, err := sc.SetGroupPropertyMapping(grp.ID, GroupPropertyMapping{
		Alias:   "external-fill",
		Type:    "color",
		Default: "#ff0000",
		Targets: []GroupTargetBinding{{MemberType: SelectionNode, MemberID: nOutside.ID, Property: "fill"}},
	}); err == nil {
		t.Fatalf("expected error for non-member target binding")
	}

	if _, err := sc.SetGroupPropertyMapping(grp.ID, GroupPropertyMapping{
		Alias:   "bad-type",
		Type:    "color",
		Default: "#ff0000",
		Targets: []GroupTargetBinding{{MemberType: SelectionLite, MemberID: leGauge.ID, Property: "value"}},
	}); err == nil {
		t.Fatalf("expected error for incompatible color mapping to numeric gauge value")
	}

	// 4. RenameGroup updates semantic parameter names
	if _, err := sc.RenameGroup(grp.ID, "rackunit"); err != nil {
		t.Fatalf("RenameGroup failed: %v", err)
	}
	params = sc.GetParameters()
	if params[0].Name != "rackunit-group-cpu" || params[1].Name != "rackunit-group-status-color" {
		t.Fatalf("expected renamed semantic parameters, got: %+v", params)
	}

	// 5. Removing a member prunes its target bindings from mappings while keeping remaining valid bindings
	remGrp, dissolved, err := sc.RemoveGroupMembers(grp.ID, []GroupMember{
		{Type: SelectionLite, ID: leTracer.ID},
	})
	if err != nil || dissolved {
		t.Fatalf("RemoveGroupMembers failed: err=%v, dissolved=%v", err, dissolved)
	}
	for _, m := range remGrp.Mappings {
		if m.Alias == "status-color" && len(m.Targets) != 2 {
			t.Fatalf("expected status-color targets pruned from 3 to 2 after removing leTracer, got %d", len(m.Targets))
		}
	}

	// 6. RemoveGroupPropertyMapping removes mapping and prunes parameter
	remGrp, err = sc.RemoveGroupPropertyMapping(grp.ID, "status-color")
	if err != nil {
		t.Fatalf("RemoveGroupPropertyMapping failed: %v", err)
	}
	if len(remGrp.Mappings) != 1 {
		t.Fatalf("expected 1 mapping remaining, got %d", len(remGrp.Mappings))
	}
	if len(sc.GetParameters()) != 1 {
		t.Fatalf("expected 1 parameter remaining, got %d", len(sc.GetParameters()))
	}
}

func TestStage16EM3CompositeLifecycleAndSequentialInstantiation(t *testing.T) {
	sc := NewScene()

	// Build canonical cpuwindow-1 group with Node, Flow, GaugeLite, TextLite, TracerLite
	nLeft := sc.CreateNode(Node{Shape: "rounded", X: 15, Y: 25, Width: 90, Height: 50, Name: "CoreIn"}, nil, false)
	nRight := sc.CreateNode(Node{Shape: "rounded", X: 25, Y: 25, Width: 90, Height: 50, Name: "CoreOut"}, nil, false)
	fl := Flow{
		ID:         "1",
		FromNodeID: nLeft.ID,
		ToNodeID:   nRight.ID,
		Color:      "#38bdf8",
		Speed:      1.0,
		Nodes: []geometry.Point{
			{X: 15, Y: 25},
			{X: 25, Y: 25},
		},
	}
	sc.UpdateFlow(fl)

	v42 := 42.0
	v0 := 0.0
	v100 := 100.0
	leGauge := sc.CreateLiteEffect(LiteEffect{
		Kind:     "gauge-lite",
		Variant:  "ring",
		Name:     "CpuGauge",
		X:        250,
		Y:        200,
		Width:    130,
		Height:   130,
		Value:    &v42,
		MinValue: &v0,
		MaxValue: &v100,
	})
	leText := sc.CreateLiteEffect(LiteEffect{
		Kind:      "text-lite",
		Variant:   "rounded",
		Name:      "CpuReadout",
		X:         250,
		Y:         310,
		Width:     150,
		Height:    38,
		LabelText: "42",
	})
	leTracer := sc.CreateLiteEffect(LiteEffect{
		Kind:    "perimeter-tracer",
		Variant: "rounded",
		Name:    "CpuFrame",
		X:       250,
		Y:       230,
		Width:   220,
		Height:  240,
		Color:   "#22c55e",
	})

	grp1, err := sc.CreateGroup("cpuwindow-1", []GroupMember{
		{Type: SelectionNode, ID: nLeft.ID},
		{Type: SelectionNode, ID: nRight.ID},
		{Type: SelectionFlow, ID: fl.ID},
		{Type: SelectionLite, ID: leGauge.ID},
		{Type: SelectionLite, ID: leText.ID},
		{Type: SelectionLite, ID: leTracer.ID},
	})
	if err != nil {
		t.Fatalf("CreateGroup failed: %v", err)
	}

	// Add semantic mappings "cpu" (number -> gauge.value + text.text) and "status-color" (color -> tracer.color + flow.color)
	if _, err := sc.SetGroupPropertyMapping(grp1.ID, GroupPropertyMapping{
		Alias:   "cpu",
		Label:   "CPU Load (%)",
		Type:    "number",
		Default: 42.0,
		Min:     &v0,
		Max:     &v100,
		Targets: []GroupTargetBinding{
			{MemberType: SelectionLite, MemberID: leGauge.ID, Property: "value"},
			{MemberType: SelectionLite, MemberID: leText.ID, Property: "text"},
		},
	}); err != nil {
		t.Fatalf("SetGroupPropertyMapping 'cpu' failed: %v", err)
	}

	if _, err := sc.SetGroupPropertyMapping(grp1.ID, GroupPropertyMapping{
		Alias:   "status-color",
		Label:   "Status Colour",
		Type:    "color",
		Default: "#22c55e",
		Targets: []GroupTargetBinding{
			{MemberType: SelectionLite, MemberID: leTracer.ID, Property: "color"},
			{MemberType: SelectionFlow, MemberID: fl.ID, Property: "color"},
		},
	}); err != nil {
		t.Fatalf("SetGroupPropertyMapping 'status-color' failed: %v", err)
	}

	// Also expose built-in group speed on grp1
	minSpd := 0.1
	maxSpd := 10.0
	if err := sc.AddParameter(WidgetParameter{
		Name:     "cpuwindow-1-group-speed",
		Type:     "speed",
		Target:   string(grp1.ID),
		Property: "speed",
		Default:  1.0,
		Min:      &minSpd,
		Max:      &maxSpd,
	}); err != nil {
		t.Fatalf("AddParameter group speed failed: %v", err)
	}

	// 1. Save as Composite Template ("cpuwindow")
	comp, err := sc.CreateCompositeFromGroup(grp1.ID, "cpuwindow", "Reusable CPU Monitor Window")
	if err != nil {
		t.Fatalf("CreateCompositeFromGroup failed: %v", err)
	}
	if comp.ID != "comp-1" || comp.Name != "cpuwindow" {
		t.Fatalf("unexpected composite ID/Name: %+v", comp)
	}
	if len(comp.Mappings) != 2 {
		t.Fatalf("expected 2 mappings in CompositeDef, got %d", len(comp.Mappings))
	}

	// 2. Instantiate 2nd and 3rd instances -> sequential naming cpuwindow-2, cpuwindow-3
	grp2, items2, err := sc.InstantiateComposite(comp.ID, "", 30.0, 0.0)
	if err != nil {
		t.Fatalf("InstantiateComposite #2 failed: %v", err)
	}
	if grp2.Name != "cpuwindow-2" {
		t.Fatalf("expected sequential instance name 'cpuwindow-2', got %q", grp2.Name)
	}
	if grp2.CompositeID != comp.ID {
		t.Fatalf("expected CompositeID %q on grp2, got %q", comp.ID, grp2.CompositeID)
	}
	if len(items2) != 6 {
		t.Fatalf("expected 6 member items instantiated for grp2, got %d", len(items2))
	}

	grp3, items3, err := sc.InstantiateComposite(comp.ID, "", 60.0, 0.0)
	if err != nil {
		t.Fatalf("InstantiateComposite #3 failed: %v", err)
	}
	if grp3.Name != "cpuwindow-3" {
		t.Fatalf("expected sequential instance name 'cpuwindow-3', got %q", grp3.Name)
	}
	if len(items3) != 6 {
		t.Fatalf("expected 6 member items instantiated for grp3, got %d", len(items3))
	}

	// 3. Verify internal flow remapping inside grp2 and grp3
	for _, grp := range []Group{grp2, grp3} {
		nodeSet := make(map[StringID]bool)
		var flowID StringID
		for _, m := range grp.Members {
			if m.Type == SelectionNode {
				nodeSet[m.ID] = true
			} else if m.Type == SelectionFlow {
				flowID = m.ID
			}
		}
		f := sc.GetFlow(flowID)
		if f == nil {
			t.Fatalf("flow %s not found in group %s", flowID, grp.Name)
		}
		if !nodeSet[f.FromNodeID] || !nodeSet[f.ToNodeID] {
			t.Fatalf("expected flow %s in %s to connect internal group nodes (%v), got from=%s to=%s",
				flowID, grp.Name, nodeSet, f.FromNodeID, f.ToNodeID)
		}
	}

	// 4. Verify deterministic widget parameters across all 3 instances
	paramMap := make(map[string]WidgetParameter)
	for _, p := range sc.GetParameters() {
		paramMap[p.Name] = p
	}
	expectedParams := []string{
		"cpuwindow-1-group-cpu",
		"cpuwindow-1-group-status-color",
		"cpuwindow-1-group-speed",
		"cpuwindow-2-group-cpu",
		"cpuwindow-2-group-status-color",
		"cpuwindow-2-group-speed",
		"cpuwindow-3-group-cpu",
		"cpuwindow-3-group-status-color",
		"cpuwindow-3-group-speed",
	}
	for _, ep := range expectedParams {
		p, ok := paramMap[ep]
		if !ok {
			t.Fatalf("expected deterministic widget parameter %q to exist, got parameters: %+v", ep, sc.GetParameters())
		}
		if err := ValidateWidgetParameter(p); err != nil {
			t.Fatalf("ValidateWidgetParameter failed for %q: %v", ep, err)
		}
	}

	// Verify grp1, grp2, grp3 semantic target bindings are completely disjoint (no cross-instance leakage!)
	seenMemberBinding := make(map[string]string)
	for _, ep := range []string{"cpuwindow-1-group-cpu", "cpuwindow-2-group-cpu", "cpuwindow-3-group-cpu"} {
		p := paramMap[ep]
		if len(p.Targets) != 2 {
			t.Fatalf("expected 2 targets on %s, got %d", ep, len(p.Targets))
		}
		for _, tb := range p.Targets {
			key := tb.Target + "." + tb.Property
			if prev, exists := seenMemberBinding[key]; exists {
				t.Fatalf("cross-instance target collision: %s bound to both %s and %s", key, prev, ep)
			}
			seenMemberBinding[key] = ep
		}
	}

	// 5. Snapshot round-trip preserves Composites, Groups, Mappings, and Parameters
	snap := sc.GetSnapshot()
	if len(snap.Composites) != 1 || snap.Composites[0].Name != "cpuwindow" {
		t.Fatalf("expected 1 composite in snapshot, got: %+v", snap.Composites)
	}
	scRestored := NewScene()
	scRestored.SetFromSnapshot(snap)
	if len(scRestored.GetAllComposites()) != 1 {
		t.Fatalf("expected 1 composite after SetFromSnapshot, got %d", len(scRestored.GetAllComposites()))
	}
	if len(scRestored.GetAllGroups()) != 3 {
		t.Fatalf("expected 3 groups after SetFromSnapshot, got %d", len(scRestored.GetAllGroups()))
	}

	// 6. DeleteComposite leaves placed instances intact
	if err := sc.DeleteComposite(comp.ID); err != nil {
		t.Fatalf("DeleteComposite failed: %v", err)
	}
	if len(sc.GetAllComposites()) != 0 {
		t.Fatalf("expected 0 composites after DeleteComposite")
	}
	if len(sc.GetAllGroups()) != 3 {
		t.Fatalf("expected all 3 placed group instances to remain intact after DeleteComposite")
	}
}

func TestStage16EVisualAcceptanceCorrections(t *testing.T) {
	sc := NewScene()

	// 1. Reproduce & verify fix for whole-widget operatingState parameter ("state" vs "operatingState")
	if err := sc.AddParameter(WidgetParameter{
		Name:        "operatingState",
		Target:      "root",
		Property:    "state",
		Type:        "enum",
		Default:     "running",
		Options:     []string{"running", "paused", "stopped"},
		Description: "Operating lifecycle state control",
	}); err != nil {
		t.Fatalf("expected root parameter with property 'state' to be accepted, got error: %v", err)
	}
	if err := sc.AddParameter(WidgetParameter{
		Name:        "operatingState",
		Target:      "root",
		Property:    "operatingState",
		Type:        "enum",
		Default:     "running",
		Options:     []string{"running", "paused", "stopped"},
		Description: "Operating lifecycle state control",
	}); err != nil {
		t.Fatalf("expected root parameter with property 'operatingState' to be accepted, got error: %v", err)
	}

	// 2. Pure Low-Load Effects group creation and mapping compatibility validation
	v0, v40, v100 := 0.0, 40.0, 100.0
	leGauge := sc.CreateLiteEffect(LiteEffect{
		Kind:     "gauge-lite",
		Variant:  "ring",
		Name:     "CoreGauge",
		X:        200,
		Y:        200,
		Width:    120,
		Height:   120,
		Value:    &v40,
		MinValue: &v0,
		MaxValue: &v100,
	})
	leRadar := sc.CreateLiteEffect(LiteEffect{
		Kind:    "radar-lite",
		Variant: "multi",
		Name:    "CoreRadar",
		X:       380,
		Y:       200,
		Width:   120,
		Height:  120,
	})

	liteGrp, err := sc.CreateGroup("lite-telemetry", []GroupMember{
		{Type: SelectionLite, ID: leGauge.ID},
		{Type: SelectionLite, ID: leRadar.ID},
	})
	if err != nil {
		t.Fatalf("CreateGroup for two Low-Load Effects failed: %v", err)
	}

	// Reject Lite-kind-incompatible property (e.g. "value" on radar-lite)
	if _, err := sc.SetGroupPropertyMapping(liteGrp.ID, GroupPropertyMapping{
		Alias:   "bad-radar-val",
		Type:    "number",
		Default: 50.0,
		Targets: []GroupTargetBinding{
			{MemberType: SelectionLite, MemberID: leRadar.ID, Property: "value"},
		},
	}); err == nil {
		t.Fatalf("expected SetGroupPropertyMapping to reject 'value' on radar-lite member")
	}

	// Reject constraint-incompatible range (e.g. max=100 on opacity [0..1])
	v200 := 200.0
	if _, err := sc.SetGroupPropertyMapping(liteGrp.ID, GroupPropertyMapping{
		Alias:   "bad-opacity-range",
		Type:    "number",
		Default: 0.5,
		Min:     &v0,
		Max:     &v200,
		Targets: []GroupTargetBinding{
			{MemberType: SelectionLite, MemberID: leGauge.ID, Property: "opacity"},
		},
	}); err == nil {
		t.Fatalf("expected SetGroupPropertyMapping to reject max=200 on opacity [0..1]")
	}

	// Reject duplicate target binding in the same mapping
	if _, err := sc.SetGroupPropertyMapping(liteGrp.ID, GroupPropertyMapping{
		Alias:   "dup-target",
		Type:    "color",
		Default: "#22c55e",
		Targets: []GroupTargetBinding{
			{MemberType: SelectionLite, MemberID: leGauge.ID, Property: "color"},
			{MemberType: SelectionLite, MemberID: leGauge.ID, Property: "color"},
		},
	}); err == nil {
		t.Fatalf("expected SetGroupPropertyMapping to reject duplicate target binding")
	}

	// Reject invalid color default
	if _, err := sc.SetGroupPropertyMapping(liteGrp.ID, GroupPropertyMapping{
		Alias:   "bad-default-col",
		Type:    "color",
		Default: "not a valid color!",
		Targets: []GroupTargetBinding{
			{MemberType: SelectionLite, MemberID: leGauge.ID, Property: "color"},
		},
	}); err == nil {
		t.Fatalf("expected SetGroupPropertyMapping to reject invalid colour default")
	}
}

func TestStage16ESemanticMappingConstraintConsistency(t *testing.T) {
	sc := NewScene()

	// Create one instance of every Low-Load Effect kind plus conventional Node and Flow
	leFlow := sc.CreateLiteEffect(LiteEffect{
		Kind:  "flow-lite",
		Name:  "FlowStream",
		Speed: 2.0,
	})
	leTracer := sc.CreateLiteEffect(LiteEffect{
		Kind:     "perimeter-tracer",
		Name:     "BorderTracer",
		X:        100,
		Y:        100,
		Width:    120,
		Height:   80,
		Speed:    3.0,
		Segments: 4,
	})
	lePulse := sc.CreateLiteEffect(LiteEffect{
		Kind:     "pulse",
		Name:     "HeartbeatPulse",
		X:        200,
		Y:        100,
		Width:    80,
		Height:   80,
		Period:   1.8,
		MaxScale: 1.25,
	})
	leFlash := sc.CreateLiteEffect(LiteEffect{
		Kind:           "flash",
		Name:           "AlertFlash",
		X:              300,
		Y:              100,
		Width:          80,
		Height:         80,
		Duration:       0.15,
		RepeatInterval: 2.0,
	})
	leRadar := sc.CreateLiteEffect(LiteEffect{
		Kind:     "radar-lite",
		Name:     "SweepRadar",
		X:        400,
		Y:        100,
		Width:    100,
		Height:   100,
		Period:   2.4,
		MaxScale: 1.5,
	})
	vMin, vVal, vMax := -40.0, 25.0, 120.0
	leGauge := sc.CreateLiteEffect(LiteEffect{
		Kind:     "gauge-lite",
		Variant:  "segmented",
		Name:     "TempGauge",
		X:        500,
		Y:        100,
		Width:    120,
		Height:   40,
		Value:    &vVal,
		MinValue: &vMin,
		MaxValue: &vMax,
		Segments: 10,
	})
	leOsc := sc.CreateLiteEffect(LiteEffect{
		Kind:         "oscilloscope-lite",
		Variant:      "sine",
		PlaybackMode: "animated",
		Name:         "WaveOsc",
		X:            650,
		Y:            100,
		Width:        180,
		Height:       80,
		Speed:        2.4,
		Segments:     3,
		StartOffset:  50,
	})
	leText := sc.CreateLiteEffect(LiteEffect{
		Kind:        "text-lite",
		Variant:     "curved",
		TextAnim:    "ticker-h",
		Name:        "BannerText",
		X:           800,
		Y:           100,
		Width:       220,
		Height:      56,
		LabelText:   "NOMINAL",
		ScrollSpeed: 120,
		TypeSpeed:   18,
		Speed:       1.5,
	})
	convFlow := sc.CreateFlow(Flow{
		Name:  "BackboneFlow",
		Speed: 1.0,
	})
	convNode := sc.CreateNode(Node{
		Shape: "rect",
		Name:  "ServerNode",
		X:     50,
		Y:     50,
		Width: 100,
		Height: 60,
	}, nil, false)

	grp, err := sc.CreateGroup("all-catalogue-group", []GroupMember{
		{Type: SelectionLite, ID: leFlow.ID},
		{Type: SelectionLite, ID: leTracer.ID},
		{Type: SelectionLite, ID: lePulse.ID},
		{Type: SelectionLite, ID: leFlash.ID},
		{Type: SelectionLite, ID: leRadar.ID},
		{Type: SelectionLite, ID: leGauge.ID},
		{Type: SelectionLite, ID: leOsc.ID},
		{Type: SelectionLite, ID: leText.ID},
		{Type: SelectionFlow, ID: convFlow.ID},
		{Type: SelectionNode, ID: convNode.ID},
	})
	if err != nil {
		t.Fatalf("CreateGroup failed: %v", err)
	}

	// 1 & 2. Flow Lite duration minimum (0.2s) and maximum (30.0s) accepted
	min02, max30 := 0.2, 30.0
	if _, err := sc.SetGroupPropertyMapping(grp.ID, GroupPropertyMapping{
		Alias:   "flow-cycle-min",
		Type:    "number",
		Default: 0.2,
		Min:     &min02,
		Max:     &max30,
		Targets: []GroupTargetBinding{
			{MemberType: SelectionLite, MemberID: leFlow.ID, Property: "speed"},
		},
	}); err != nil {
		t.Fatalf("expected Flow Lite cycle duration 0.2..30.0s (default 0.2s) to be accepted, got: %v", err)
	}
	if _, err := sc.SetGroupPropertyMapping(grp.ID, GroupPropertyMapping{
		Alias:   "flow-cycle-max",
		Type:    "number",
		Default: 30.0,
		Min:     &min02,
		Max:     &max30,
		Targets: []GroupTargetBinding{
			{MemberType: SelectionLite, MemberID: leFlow.ID, Property: "speed"},
		},
	}); err != nil {
		t.Fatalf("expected Flow Lite cycle duration 0.2..30.0s (default 30.0s) to be accepted, got: %v", err)
	}

	// 3. Rejection outside 0.2..30.0s (0.1s and 35.0s)
	badLow := 0.1
	if _, err := sc.SetGroupPropertyMapping(grp.ID, GroupPropertyMapping{
		Alias:   "flow-too-low",
		Type:    "number",
		Default: 0.1,
		Min:     &badLow,
		Max:     &max30,
		Targets: []GroupTargetBinding{
			{MemberType: SelectionLite, MemberID: leFlow.ID, Property: "speed"},
		},
	}); err == nil {
		t.Fatalf("expected Flow Lite cycle duration below 0.2s (0.1s) to be rejected")
	}
	badHigh := 35.0
	if _, err := sc.SetGroupPropertyMapping(grp.ID, GroupPropertyMapping{
		Alias:   "flow-too-high",
		Type:    "number",
		Default: 35.0,
		Min:     &min02,
		Max:     &badHigh,
		Targets: []GroupTargetBinding{
			{MemberType: SelectionLite, MemberID: leFlow.ID, Property: "speed"},
		},
	}); err == nil {
		t.Fatalf("expected Flow Lite cycle duration above 30.0s (35.0s) to be rejected")
	}

	// 4 & 5. Authoritative property constraints for every Low-Load Effect kind match native inspector limits
	checkTargetPropDomain := func(liteID StringID, kind string, prop string, wantMin, wantMax float64) {
		t.Helper()
		props := sc.GetEligiblePropertiesForTarget("lite", string(liteID), kind)
		for _, p := range props {
			if p.Property == prop {
				if p.Min == nil || *p.Min != wantMin {
					t.Fatalf("%s (%s) property %q: expected min %v, got %v", kind, liteID, prop, wantMin, p.Min)
				}
				if p.Max == nil || *p.Max != wantMax {
					t.Fatalf("%s (%s) property %q: expected max %v, got %v", kind, liteID, prop, wantMax, p.Max)
				}
				return
			}
		}
		t.Fatalf("%s (%s) missing eligible property %q", kind, liteID, prop)
	}

	checkTargetPropDomain(leFlow.ID, "flow-lite", "speed", 0.2, 30.0)
	checkTargetPropDomain(leFlow.ID, "flow-lite", "period", 0.2, 30.0)
	checkTargetPropDomain(leFlow.ID, "flow-lite", "strokeWidth", 0.5, 24.0)
	checkTargetPropDomain(leFlow.ID, "flow-lite", "dashLength", 2.0, 400.0)
	checkTargetPropDomain(leFlow.ID, "flow-lite", "gapLength", 2.0, 300.0)
	checkTargetPropDomain(leFlow.ID, "flow-lite", "dotSize", 1.0, 32.0)

	checkTargetPropDomain(leTracer.ID, "perimeter-tracer", "speed", 0.2, 30.0)
	checkTargetPropDomain(leTracer.ID, "perimeter-tracer", "strokeWidth", 0.5, 20.0)
	checkTargetPropDomain(leTracer.ID, "perimeter-tracer", "segments", 1.0, 16.0)
	checkTargetPropDomain(leTracer.ID, "perimeter-tracer", "startOffset", 0.0, 100.0)
	checkTargetPropDomain(leTracer.ID, "perimeter-tracer", "burstCycles", 0.0, 100.0)
	checkTargetPropDomain(leTracer.ID, "perimeter-tracer", "pauseSeconds", 0.0, 300.0)

	checkTargetPropDomain(lePulse.ID, "pulse", "period", 0.2, 30.0)
	checkTargetPropDomain(lePulse.ID, "pulse", "scale", 0.2, 3.0)
	checkTargetPropDomain(lePulse.ID, "pulse", "intensity", 0.0, 1.0)
	checkTargetPropDomain(lePulse.ID, "pulse", "armThickness", 1.0, 20.0)

	checkTargetPropDomain(leFlash.ID, "flash", "duration", 20.0, 1000.0)
	checkTargetPropDomain(leFlash.ID, "flash", "repeatInterval", 0.2, 60.0)
	checkTargetPropDomain(leFlash.ID, "flash", "intensity", 0.0, 1.0)
	checkTargetPropDomain(leFlash.ID, "flash", "armThickness", 1.0, 20.0)

	checkTargetPropDomain(leRadar.ID, "radar-lite", "period", 0.2, 30.0)
	checkTargetPropDomain(leRadar.ID, "radar-lite", "scale", 0.2, 3.0)
	checkTargetPropDomain(leRadar.ID, "radar-lite", "strokeWidth", 0.5, 20.0)

	checkTargetPropDomain(leGauge.ID, "gauge-lite", "value", -40.0, 120.0)
	checkTargetPropDomain(leGauge.ID, "gauge-lite", "strokeWidth", 0.5, 32.0)
	checkTargetPropDomain(leGauge.ID, "gauge-lite", "segments", 2.0, 32.0)

	checkTargetPropDomain(leOsc.ID, "oscilloscope-lite", "speed", 0.2, 30.0)
	checkTargetPropDomain(leOsc.ID, "oscilloscope-lite", "strokeWidth", 0.5, 16.0)
	checkTargetPropDomain(leOsc.ID, "oscilloscope-lite", "segments", 1.0, 12.0)
	checkTargetPropDomain(leOsc.ID, "oscilloscope-lite", "startOffset", 10.0, 90.0)
	checkTargetPropDomain(leOsc.ID, "oscilloscope-lite", "intensity", 0.05, 1.0)

	checkTargetPropDomain(leText.ID, "text-lite", "speed", 0.0, 30.0)
	checkTargetPropDomain(leText.ID, "text-lite", "strokeWidth", 0.0, 24.0)
	checkTargetPropDomain(leText.ID, "text-lite", "scrollSpeed", 10.0, 600.0)
	checkTargetPropDomain(leText.ID, "text-lite", "typeSpeed", 1.0, 120.0)
	checkTargetPropDomain(leText.ID, "text-lite", "startOffset", 0.0, 100.0)

	// 6 & 7. Mixed-object mappings & compatible intersecting ranges (e.g. Flow Lite 0.2..30s ∩ Conventional Flow 0.1..10x => 0.2..10)
	updatedGrp, err := sc.SetGroupPropertyMapping(grp.ID, GroupPropertyMapping{
		Alias:   "shared-pace",
		Type:    "number",
		Default: 2.5,
		Targets: []GroupTargetBinding{
			{MemberType: SelectionLite, MemberID: leFlow.ID, Property: "speed"},
			{MemberType: SelectionFlow, MemberID: convFlow.ID, Property: "speed"},
		},
	})
	if err != nil {
		t.Fatalf("expected mixed-object intersecting range mapping (0.2..30 ∩ 0.1..10 = 0.2..10) to succeed, got: %v", err)
	}
	var foundShared *GroupPropertyMapping
	for i := range updatedGrp.Mappings {
		if updatedGrp.Mappings[i].Alias == "shared-pace" {
			foundShared = &updatedGrp.Mappings[i]
			break
		}
	}
	if foundShared == nil || foundShared.Min == nil || *foundShared.Min != 0.2 || foundShared.Max == nil || *foundShared.Max != 10.0 {
		t.Fatalf("expected auto-populated shared intersection [0.2, 10.0], got min=%v max=%v", foundShared.Min, foundShared.Max)
	}

	// 8. Incompatible non-overlapping numeric ranges (opacity [0..1] ∩ scrollSpeed [10..600]) must be rejected
	if _, err := sc.SetGroupPropertyMapping(grp.ID, GroupPropertyMapping{
		Alias:   "disjoint-numeric",
		Type:    "number",
		Default: 1.0,
		Targets: []GroupTargetBinding{
			{MemberType: SelectionNode, MemberID: convNode.ID, Property: "opacity"},
			{MemberType: SelectionLite, MemberID: leText.ID, Property: "scrollSpeed"},
		},
	}); err == nil {
		t.Fatalf("expected non-overlapping numeric domains (opacity [0..1] vs scrollSpeed [10..600]) to be rejected")
	}

	// 9. Enumeration compatibility:
	// 9a. Compatible shared enum options (flow-lite direction ["forward","reverse"] ∩ gauge-lite direction ["forward","reverse"])
	if _, err := sc.SetGroupPropertyMapping(grp.ID, GroupPropertyMapping{
		Alias:   "shared-direction",
		Type:    "enum",
		Default: "forward",
		Options: []string{"forward", "reverse"},
		Targets: []GroupTargetBinding{
			{MemberType: SelectionLite, MemberID: leFlow.ID, Property: "direction"},
			{MemberType: SelectionLite, MemberID: leGauge.ID, Property: "direction"},
		},
	}); err != nil {
		t.Fatalf("expected compatible enum intersection ['forward','reverse'] to succeed, got: %v", err)
	}
	// 9b. Disjoint enum options (perimeter-tracer direction ["cw","ccw"] ∩ flow-lite direction ["forward","reverse"]) must be rejected
	if _, err := sc.SetGroupPropertyMapping(grp.ID, GroupPropertyMapping{
		Alias:   "disjoint-direction",
		Type:    "enum",
		Default: "cw",
		Options: []string{"cw"},
		Targets: []GroupTargetBinding{
			{MemberType: SelectionLite, MemberID: leTracer.ID, Property: "direction"},
			{MemberType: SelectionLite, MemberID: leFlow.ID, Property: "direction"},
		},
	}); err == nil {
		t.Fatalf("expected disjoint enum domains (['cw','ccw'] vs ['forward','reverse']) to be rejected")
	}

	// 12. Snapshot save/reload persistence preserves exact constraints and shared domains
	snap := sc.GetSnapshot()
	restored := NewScene()
	restored.SetFromSnapshot(snap)
	rGrp, ok := restored.GetGroup(grp.ID)
	if !ok {
		t.Fatalf("expected restored group %s", grp.ID)
	}
	var restoredMax *GroupPropertyMapping
	for i := range rGrp.Mappings {
		if rGrp.Mappings[i].Alias == "flow-cycle-max" {
			restoredMax = &rGrp.Mappings[i]
			break
		}
	}
	if restoredMax == nil || restoredMax.Min == nil || *restoredMax.Min != 0.2 || restoredMax.Max == nil || *restoredMax.Max != 30.0 || restoredMax.Default != 30.0 {
		t.Fatalf("expected restored flow-cycle-max mapping [0.2..30.0, default=30.0], got %+v", restoredMax)
	}
}

func TestStage16FComponentBuilderMultiActionParameters(t *testing.T) {
	sc := NewScene()
	leText := sc.CreateLiteEffect(LiteEffect{
		Name:      "deploy-label",
		Kind:      "text-lite",
		LabelText: "DEPLOY NODE",
		Color:     "#f8fafc",
		BgColor:   "#0f172a",
	})
	leTracer := sc.CreateLiteEffect(LiteEffect{
		Name:  "border-tracer",
		Kind:  "perimeter-tracer",
		Color: "#38bdf8",
	})
	nodeBadge := sc.CreateNode(Node{
		Name:      "status-badge",
		Shape:     "circle",
		FillColor: "#334155",
	}, nil, false)
	flowConv := sc.CreateFlow(Flow{
		Name:  "main-link",
		Color: "#22c55e",
	})

	// 1. Verify Text Box Lite exposes both "color" (Text Colour) and "bgColor" (Box Background Colour) plus new 16F properties
	textProps := sc.GetEligiblePropertiesForTarget("lite", string(leText.ID), "text-lite")
	foundColor := false
	foundBgColor := false
	foundFontSize := false
	for _, ep := range textProps {
		if ep.Property == "color" && ep.Label == "Text Colour" {
			foundColor = true
		}
		if ep.Property == "bgColor" && ep.Label == "Box Background Colour" {
			foundBgColor = true
		}
		if ep.Property == "fontSize" {
			foundFontSize = true
		}
	}
	if !foundColor || !foundBgColor || !foundFontSize {
		t.Fatalf("expected text-lite to expose Text Colour (color=%v), Box Background Colour (bgColor=%v), and fontSize (%v)", foundColor, foundBgColor, foundFontSize)
	}

	// 2. Add ungrouped MouseOver Boolean component property driving text colour, box fill, node fill, and animation lifecycle
	mouseOverParam := WidgetParameter{
		Name:         "MouseOver",
		Label:        "Mouse Over State",
		Type:         "boolean",
		Target:       "root",
		Property:     "color",
		Default:      false,
		EventTrigger: "hover",
		Targets: []WidgetTargetBinding{
			{Target: "lite-" + string(leText.ID), Property: "color", When: "true", Action: "set", Value: "#38bdf8"},
			{Target: "lite-" + string(leText.ID), Property: "bgColor", When: "true", Action: "set", Value: "#1e3a8a"},
			{Target: "node-" + string(nodeBadge.ID), Property: "fill", When: "true", Action: "set", Value: "#2563eb"},
			{Target: "lite-" + string(leTracer.ID), Property: "play", When: "true", Action: "play"},
			{Target: "lite-" + string(leText.ID), Property: "color", When: "false", Action: "set", Value: "#f8fafc"},
			{Target: "lite-" + string(leText.ID), Property: "bgColor", When: "false", Action: "set", Value: "#0f172a"},
			{Target: "node-" + string(nodeBadge.ID), Property: "fill", When: "false", Action: "set", Value: "#334155"},
			{Target: "lite-" + string(leTracer.ID), Property: "play", When: "false", Action: "stop_reset"},
		},
	}
	if err := sc.AddParameter(mouseOverParam); err != nil {
		t.Fatalf("expected ungrouped MouseOver multi-action parameter to succeed, got: %v", err)
	}

	// 3. Reject mid-cycle pause/resume on conventional SMIL flow target
	invalidSmilPause := WidgetParameter{
		Name:     "InvalidSmilPause",
		Type:     "boolean",
		Target:   "root",
		Property: "play",
		Default:  false,
		Targets: []WidgetTargetBinding{
			{Target: "flow-" + string(flowConv.ID), Property: "play", When: "true", Action: "pause"},
		},
	}
	if err := sc.AddParameter(invalidSmilPause); err == nil {
		t.Fatalf("expected mid-cycle pause on SMIL flow target to be rejected")
	}

	// 4. Reject out-of-range action value in target binding
	invalidRangeAction := WidgetParameter{
		Name:     "InvalidFontSizeAction",
		Type:     "boolean",
		Target:   "root",
		Property: "fontSize",
		Default:  false,
		Targets: []WidgetTargetBinding{
			{Target: "lite-" + string(leText.ID), Property: "fontSize", When: "true", Action: "set", Value: 999.0},
		},
	}
	if err := sc.AddParameter(invalidRangeAction); err == nil {
		t.Fatalf("expected out-of-range fontSize=999 in target binding to be rejected")
	}

	// 5. Verify renaming an object preserves user-authored Component Builder parameter name ("MouseOver")
	if _, err := sc.RenameObject("lite", leText.ID, "renamed-label"); err != nil {
		t.Fatalf("RenameObject failed: %v", err)
	}
	params := sc.GetParameters()
	if len(params) != 1 || params[0].Name != "MouseOver" {
		t.Fatalf("expected MouseOver parameter name to be preserved after object rename, got %+v", params)
	}

	// 6. Verify deleting a targeted object prunes its bindings from MouseOver.Targets while keeping remaining bindings intact
	if !sc.RemoveNode(nodeBadge.ID) {
		t.Fatalf("RemoveNode failed")
	}
	paramsAfterDelete := sc.GetParameters()
	if len(paramsAfterDelete) != 1 {
		t.Fatalf("expected MouseOver parameter to remain with remaining targets after deleting nodeBadge")
	}
	if len(paramsAfterDelete[0].Targets) != 6 {
		t.Fatalf("expected 6 remaining target bindings after pruning deleted nodeBadge (2 bindings removed), got %d", len(paramsAfterDelete[0].Targets))
	}
}



