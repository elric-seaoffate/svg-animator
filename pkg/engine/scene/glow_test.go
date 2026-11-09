package scene

import (
	"testing"
)

func TestGlowLifecycleAndValidation(t *testing.T) {
	s := NewScene()

	// Validation
	if err := ValidateGlow(nil); err == nil {
		t.Error("expected error for nil glow")
	}

	invalidGlow := &Glow{Size: -5, Opacity: 0.5}
	if err := ValidateGlow(invalidGlow); err == nil {
		t.Error("expected error for negative size")
	}

	invalidOp := &Glow{Size: 20, Opacity: 1.5}
	if err := ValidateGlow(invalidOp); err == nil {
		t.Error("expected error for opacity > 1")
	}

	// Create
	g1 := s.CreateGlow(Glow{
		Shape:   "circle",
		Color:   "#ff0044",
		X:       30,
		Y:       40,
		Size:    25,
		Opacity: 0.9,
	})

	if g1.ID != "1" {
		t.Errorf("expected ID '1', got %q", g1.ID)
	}
	if g1.Shape != "circle" {
		t.Errorf("expected shape 'circle', got %q", g1.Shape)
	}

	// Get & GetAll
	fetched := s.GetGlow("1")
	if fetched == nil || fetched.ID != "1" {
		t.Fatalf("expected glow '1' to be found")
	}

	all := s.GetAllGlows()
	if len(all) != 1 {
		t.Fatalf("expected 1 glow, got %d", len(all))
	}

	// Update
	fetched.Color = "#00ffcc"
	fetched.X = 35
	s.UpdateGlow(*fetched)

	updated := s.GetGlow("1")
	if updated.Color != "#00ffcc" || updated.X != 35 {
		t.Errorf("update failed: %+v", updated)
	}

	// Create second glow
	g2 := s.CreateGlow(Glow{
		Shape: "radar",
		Color: "#00aaff",
		X:     60,
		Y:     70,
		Size:  30,
		Rings: 4,
	})
	if g2.ID != "2" {
		t.Errorf("expected ID '2', got %q", g2.ID)
	}
	if !g2.IsRadar || g2.RadarRings != 4 {
		t.Errorf("expected radar glow with 4 rings, got %+v", g2)
	}

	if len(s.GetAllGlows()) != 2 {
		t.Errorf("expected 2 glows in scene")
	}

	// Remove
	if !s.RemoveGlow("1") {
		t.Error("failed to remove glow '1'")
	}
	if s.GetGlow("1") != nil {
		t.Error("glow '1' should not exist after removal")
	}
	if len(s.GetAllGlows()) != 1 {
		t.Errorf("expected 1 glow after removal, got %d", len(s.GetAllGlows()))
	}
}

func TestGlowHitTestingAndBounds(t *testing.T) {
	s := NewScene()

	// Circle glow at (50%, 50%) -> (500, 500), size 40. Hit target r = max(20, 40) = 40px (4% of 1000).
	g1 := s.CreateGlow(Glow{
		Shape: "circle",
		X:     50,
		Y:     50,
		Size:  40,
	})

	// Exact center hit
	hit := s.FindGlowAt(50, 50, 1000, 1000)
	if hit == nil || hit.ID != g1.ID {
		t.Fatalf("expected hit on glow at center, got %+v", hit)
	}

	// Near hit: (52%, 50%) -> dx = 20px <= 40px
	hitNear := s.FindGlowAt(52, 50, 1000, 1000)
	if hitNear == nil || hitNear.ID != g1.ID {
		t.Fatalf("expected hit on glow near center, got %+v", hitNear)
	}

	// Miss: (60%, 50%) -> dx = 100px > 40px
	hitMiss := s.FindGlowAt(60, 50, 1000, 1000)
	if hitMiss != nil {
		t.Fatalf("expected miss, got %+v", hitMiss)
	}

	// Bounds
	bounds, center := s.GetGlowBounds(g1, 1000, 1000)
	if bounds.Width <= 0 || bounds.Height <= 0 || center.X != 500 || center.Y != 500 {
		t.Errorf("invalid glow bounds or center: %+v, %+v", bounds, center)
	}

	// Describe
	desc := s.DescribeGlow(g1, 1000, 1000)
	if desc.ID != g1.ID || desc.HitRadius <= 0 {
		t.Errorf("unexpected DescribeGlow output: %+v", desc)
	}
}
