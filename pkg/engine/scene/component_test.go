package scene

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestReusableComponentsLifecycleAndDTCompatibility(t *testing.T) {
	sc := NewScene()

	// 1. Create a reusable child component ("Meter Cell") from a gauge-lite + text-lite group
	playFalse := false
	g1 := sc.CreateLiteEffect(LiteEffect{
		Kind:     "gauge-lite",
		Name:     "meter-gauge",
		Variant:  "hbar",
		X:        160,
		Y:        100,
		Width:    180,
		Height:   20,
		Color:    "#38bdf8",
		Opacity:  1.0,
		MinValue: floatPtr(0),
		MaxValue: floatPtr(100),
		Value:    floatPtr(40),
	})
	t1 := sc.CreateLiteEffect(LiteEffect{
		Kind:      "text-lite",
		Name:      "meter-readout",
		Variant:   "rounded",
		LabelText: "40%",
		X:         300,
		Y:         100,
		Width:     80,
		Height:    28,
		Color:     "#f8fafc",
		Opacity:   1.0,
		Play:      &playFalse,
	})

	grp, err := sc.CreateGroup("meter-cell", []GroupMember{
		{Type: SelectionLite, ID: g1.ID},
		{Type: SelectionLite, ID: t1.ID},
	})
	if err != nil {
		t.Fatalf("CreateGroup failed: %v", err)
	}

	_, err = sc.SetGroupPropertyMapping(grp.ID, GroupPropertyMapping{
		Alias:   "level",
		Label:   "Primary Level",
		Type:    "number",
		Default: 40.0,
		Min:     floatPtr(0),
		Max:     floatPtr(100),
		Step:    floatPtr(0.5),
		Targets: []GroupTargetBinding{
			{MemberType: SelectionLite, MemberID: g1.ID, Property: "value"},
			{MemberType: SelectionLite, MemberID: t1.ID, Property: "text"},
		},
	})
	if err != nil {
		t.Fatalf("SetGroupPropertyMapping failed: %v", err)
	}

	childDef, err := sc.CreateComponentFromSelection(nil, grp.ID, ComponentCreateOptions{
		Name:        "Meter Cell",
		Description: "Reusable bar meter + readout",
		Category:    "meters",
		Tags:        []string{"gauge", "meter"},
		Version:     "1.0.0",
	})
	if err != nil {
		t.Fatalf("CreateComponentFromSelection failed: %v", err)
	}
	if childDef.ComponentID == "" || !strings.HasPrefix(childDef.ComponentID, "cmp-meter-cell-") {
		t.Fatalf("expected stable ComponentID, got %q", childDef.ComponentID)
	}
	if childDef.Version != "1.0.0" || childDef.ContentHash == "" {
		t.Fatalf("expected version 1.0.0 and non-empty ContentHash, got ver=%q hash=%q", childDef.Version, childDef.ContentHash)
	}

	// 2. Place two independent instances in a fresh scene
	sc2 := NewScene()
	if _, err := sc2.ImportLibraryComponent(childDef); err != nil {
		t.Fatalf("ImportLibraryComponent failed: %v", err)
	}

	instA, _, err := sc2.InstantiateComponent(childDef.ComponentID, "meter-a", 0, -10, 1.0, 1.0)
	if err != nil {
		t.Fatalf("InstantiateComponent A failed: %v", err)
	}
	instB, _, err := sc2.InstantiateComponent(childDef.ComponentID, "meter-b", 0, 15, 1.2, 1.2)
	if err != nil {
		t.Fatalf("InstantiateComponent B failed: %v", err)
	}
	if instA.ID == instB.ID || instA.InstanceID == instB.InstanceID {
		t.Fatalf("expected distinct instance IDs, got A=(%s,%s) B=(%s,%s)", instA.ID, instA.InstanceID, instB.ID, instB.InstanceID)
	}
	if instA.ComponentID != childDef.ComponentID || instB.ComponentID != childDef.ComponentID {
		t.Fatalf("expected instances to reference %s", childDef.ComponentID)
	}

	// 3. Compose a nested parent component from the two child instances
	parentDef, err := sc2.CreateComponentFromSelection([]SelectionItem{
		{Type: SelectionGroup, ID: instA.ID},
		{Type: SelectionGroup, ID: instB.ID},
	}, "", ComponentCreateOptions{
		Name:        "Dual Meter Card",
		Description: "Nested composite of two Meter Cells",
		Category:    "cards",
		Tags:        []string{"composite", "meters"},
		Version:     "1.0.0",
	})
	if err != nil {
		t.Fatalf("nested CreateComponentFromSelection failed: %v", err)
	}
	if len(parentDef.Dependencies) != 1 || parentDef.Dependencies[0].ComponentID != childDef.ComponentID {
		t.Fatalf("expected parent dependency on %s, got %+v", childDef.ComponentID, parentDef.Dependencies)
	}

	// 4. Verify cycle detection blocks self and indirect cycles
	if err := sc2.DetectComponentCycle(childDef.ComponentID, []ComponentDepRef{{ComponentID: childDef.ComponentID}}); err == nil {
		t.Fatalf("expected direct cycle error")
	}
	if err := sc2.DetectComponentCycle(childDef.ComponentID, []ComponentDepRef{{ComponentID: parentDef.ComponentID}}); err == nil {
		t.Fatalf("expected indirect cycle error (child -> parent -> child)")
	}

	// 5. Verify upgrade compatibility classification (patch/minor vs major)
	minorDef := DeepCopyCompositeDef(childDef)
	minorDef.Version = "1.1.0"
	minorDef.Parameters = append(minorDef.Parameters, WidgetParameter{
		Name:     "meter-cell-group-opacity",
		Type:     "number",
		Default:  1.0,
		Target:   string(grp.ID),
		Property: "opacity",
	})
	minorRep := CheckComponentUpgradeCompatibility(childDef, minorDef)
	if !minorRep.Compatible || minorRep.SuggestedBump != "minor" {
		t.Fatalf("expected compatible minor upgrade, got %+v", minorRep)
	}

	majorDef := DeepCopyCompositeDef(childDef)
	majorDef.Version = "2.0.0"
	majorDef.Parameters = nil
	majorRep := CheckComponentUpgradeCompatibility(childDef, majorDef)
	if majorRep.Compatible || majorRep.SuggestedBump != "major" || len(majorRep.BreakingChanges) == 0 {
		t.Fatalf("expected breaking major upgrade, got %+v", majorRep)
	}

	// Apply compatible update to instA and confirm breaking update is rejected without force
	if _, _, err := sc2.ApplyComponentUpdateToInstance(instA.ID, majorDef, false); err == nil {
		t.Fatalf("expected breaking update to be rejected when force=false")
	}
	upgradedA, upRep, err := sc2.ApplyComponentUpdateToInstance(instA.ID, minorDef, false)
	if err != nil || !upRep.Compatible || upgradedA.ComponentVersion != "1.1.0" {
		t.Fatalf("expected compatible update to 1.1.0, got grp=%+v rep=%+v err=%v", upgradedA, upRep, err)
	}
	if upgradedA.InstanceID != instA.InstanceID {
		t.Fatalf("expected InstanceID %q preserved across upgrade, got %q", instA.InstanceID, upgradedA.InstanceID)
	}

	// 6. Export a portable ZIP containing an executable <script> in rawSVG and verify it is stripped + deterministic + DT-compatible
	rawSVGWithScript := `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">` +
		`<g id="group-1" class="scene-group" data-group-id="group-1" data-semantic-target="group-1">` +
		`<g id="lite-1" data-lite-id="1" data-semantic-target="lite-1"><rect width="100" height="20"/></g>` +
		`<g id="lite-2" data-lite-id="2" data-semantic-target="lite-2"><text>40%</text></g>` +
		`</g><script type="application/ecmascript">alert(1)</script></svg>`

	zip1, err := BuildWidgetPackageZip(sc, "Meter Cell", rawSVGWithScript, "// svg-widget.js")
	if err != nil {
		t.Fatalf("BuildWidgetPackageZip 1 failed: %v", err)
	}
	zip2, err := BuildWidgetPackageZip(sc, "Meter Cell", rawSVGWithScript, "// svg-widget.js")
	if err != nil {
		t.Fatalf("BuildWidgetPackageZip 2 failed: %v", err)
	}
	if !bytes.Equal(zip1, zip2) {
		t.Fatalf("expected deterministic byte-identical ZIPs on repeated export")
	}

	dtRep := ValidateWidgetPackageDTCompatibility(zip1)
	if !dtRep.Compatible {
		t.Fatalf("expected DT-compatible package, got errors: %v", dtRep.Errors)
	}

	// Verify 0-parameter decorative component exports valid schemaVersion:1 manifest with empty parameters[]
	scDeco := NewScene()
	decoSVG := `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle id="ring-1" cx="60" cy="60" r="40" fill="#38bdf8"/></svg>`
	decoZip, err := BuildWidgetPackageZip(scDeco, "Decorative Emblem", decoSVG, "// svg-widget.js")
	if err != nil {
		t.Fatalf("decorative BuildWidgetPackageZip failed: %v", err)
	}
	decoDT := ValidateWidgetPackageDTCompatibility(decoZip)
	if !decoDT.Compatible || decoDT.ParamCount != 0 {
		t.Fatalf("expected DT-compatible 0-param decorative package, got %+v", decoDT)
	}

	// Verify manifest JSON inside decoZip has schemaVersion:1 and parameters:[]
	zr, _ := zip.NewReader(bytes.NewReader(decoZip), int64(len(decoZip)))
	foundManifest := false
	for _, f := range zr.File {
		if strings.HasSuffix(f.Name, "widget-manifest.json") {
			rc, _ := f.Open()
			var mf WidgetManifest
			_ = json.NewDecoder(rc).Decode(&mf)
			rc.Close()
			if mf.SchemaVersion != 1 || mf.Parameters == nil || len(mf.Parameters) != 0 {
				t.Fatalf("unexpected decorative manifest: %+v", mf)
			}
			foundManifest = true
		}
	}
	if !foundManifest {
		t.Fatalf("widget-manifest.json missing from decorative ZIP")
	}
}
