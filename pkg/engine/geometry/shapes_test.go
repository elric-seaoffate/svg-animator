package geometry

import (
	"testing"
)

func TestBuiltinShapesCatalog(t *testing.T) {
	catalog := GetShapeCatalog()
	if len(catalog) < 12 {
		t.Fatalf("Expected at least 12 registered shapes, got %d", len(catalog))
	}

	expectedIDs := []string{
		"rounded", "rect", "pill", "textbox", "callout",
		"diamond", "hexagon", "parallelogram", "cylinder",
		"cloud", "circle", "axes",
	}

	for _, id := range expectedIDs {
		def := GetShapeDefinition(id)
		if def.ID != id {
			t.Errorf("Expected shape definition for %s, got %s", id, def.ID)
		}
		if def.DefaultWidth <= 0 || def.DefaultHeight <= 0 {
			t.Errorf("Shape %s has invalid default dimensions: %vx%v", id, def.DefaultWidth, def.DefaultHeight)
		}
	}
}

func TestShapeAliases(t *testing.T) {
	if norm := NormalizeShapeID("note"); norm != "callout" {
		t.Errorf("Expected 'note' to normalize to 'callout', got '%s'", norm)
	}
	if norm := NormalizeShapeID("ACTOR"); norm != "actor" {
		t.Errorf("Expected 'ACTOR' to normalize to 'actor', got '%s'", norm)
	}
	if norm := NormalizeShapeID(""); norm != "rounded" {
		t.Errorf("Expected empty string to normalize to 'rounded', got '%s'", norm)
	}
}

func TestDescribeShapeAllTypes(t *testing.T) {
	types := []string{
		"rounded", "rect", "pill", "textbox", "callout",
		"diamond", "hexagon", "parallelogram", "cylinder",
		"cloud", "circle", "axes", "actor", "note",
	}

	for _, st := range types {
		desc := DescribeShape(st, 200, 100, "Node Label", "Subtext", 16)
		if len(desc.Elements) == 0 {
			t.Errorf("Shape %s produced 0 geometric elements", st)
		}
		if desc.Width != 200 || desc.Height != 100 {
			t.Errorf("Shape %s has incorrect dimensions: %vx%v", st, desc.Width, desc.Height)
		}
		if desc.HalfWidth != 100 || desc.HalfHeight != 50 {
			t.Errorf("Shape %s has incorrect half dimensions: %vx%v", st, desc.HalfWidth, desc.HalfHeight)
		}
		if desc.Bounds.MinX != -100 || desc.Bounds.MaxX != 100 || desc.Bounds.MinY != -50 || desc.Bounds.MaxY != 50 {
			t.Errorf("Shape %s has invalid bounds: %+v", st, desc.Bounds)
		}
		if desc.Anchors.Center.X != 0 || desc.Anchors.Center.Y != 0 {
			t.Errorf("Shape %s center anchor must be (0,0)", st)
		}
		if desc.Anchors.Top.Y != -50 || desc.Anchors.Bottom.Y != 50 {
			t.Errorf("Shape %s vertical anchors incorrect: top=%v, bottom=%v", st, desc.Anchors.Top, desc.Anchors.Bottom)
		}
	}
}

func TestLargeAndFractionalDimensions(t *testing.T) {
	// Test large dimension (350px > 203px) and fractional values
	desc := DescribeShape("rounded", 350.5, 220.25, "Large Node", "", 15)
	if desc.Width != 350.5 || desc.Height != 220.25 {
		t.Fatalf("Dimensions not preserved: %vx%v", desc.Width, desc.Height)
	}
	expectedHw := 350.5 / 2.0
	expectedHh := 220.25 / 2.0
	if desc.HalfWidth != expectedHw || desc.HalfHeight != expectedHh {
		t.Fatalf("Half dimensions mismatch: %v vs %v", desc.HalfWidth, expectedHw)
	}
	if desc.Bounds.MinX != -expectedHw || desc.Bounds.MaxX != expectedHw {
		t.Fatalf("Bounds mismatch for large width: %+v", desc.Bounds)
	}

	// Verify element attributes contain exact width/height
	elem := desc.Elements[0]
	if elem.Type != "rect" {
		t.Fatalf("Expected rect element, got %s", elem.Type)
	}
	if elem.Attributes["width"] != "350.5" {
		t.Errorf("Expected width 350.5, got %s", elem.Attributes["width"])
	}
}

func TestMinimumDimensionsClamping(t *testing.T) {
	// Zero or negative dimensions should clamp to default dimensions (> 10)
	descZero := DescribeShape("rect", 0, -5, "ClampTest", "", 15)
	if descZero.Width < 10 || descZero.Height < 10 {
		t.Errorf("Expected minimum dimension clamping, got %vx%v", descZero.Width, descZero.Height)
	}
}

func TestTextPlacementMultilineAndAxes(t *testing.T) {
	// Multiline text
	textPlacement := ComputeTextPlacement("Line 1 | Line 2 | Line 3", "Subtitle", "rounded", 200, 100, 15)
	if len(textPlacement.Lines) != 3 {
		t.Fatalf("Expected 3 lines, got %d", len(textPlacement.Lines))
	}
	if !textPlacement.HasSubtext || textPlacement.Subtext != "Subtitle" {
		t.Fatalf("Subtext not captured: %+v", textPlacement)
	}
	if textPlacement.Anchor != "middle" {
		t.Fatalf("Expected middle anchor, got %s", textPlacement.Anchor)
	}

	// Axes text placement
	axesPlacement := ComputeTextPlacement("Title", "Detail", "axes", 200, 100, 15)
	if axesPlacement.Anchor != "start" {
		t.Fatalf("Expected start anchor for axes, got %s", axesPlacement.Anchor)
	}
	if axesPlacement.StartY >= 0 {
		t.Fatalf("Axes title should be above top edge, got Y=%v", axesPlacement.StartY)
	}
	if axesPlacement.SubY <= 0 {
		t.Fatalf("Axes subtext should be below bottom edge, got Y=%v", axesPlacement.SubY)
	}
}
