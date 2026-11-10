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
