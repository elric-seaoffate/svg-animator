package scene

import (
	"testing"
)

func TestRippleLifecycleAndValidation(t *testing.T) {
	s := NewScene()

	// Validation
	if err := ValidateRipple(nil); err == nil {
		t.Error("expected error for nil ripple")
	}

	invalidRipple := &Ripple{InnerR: 100, OuterR: 50}
	if err := ValidateRipple(invalidRipple); err == nil {
		t.Error("expected error for InnerR > OuterR")
	}

	// Create
	r1 := s.CreateRipple(Ripple{
		Color:      "#ffffff",
		Opacity:    0.5,
		InnerR:     10,
		OuterR:     120,
		Rings:      3,
		Thick:      6,
		Refraction: 40,
		Duration:   2.5,
		X:          40,
		Y:          60,
	})

	if r1.ID != "1" {
		t.Errorf("expected ID '1', got %q", r1.ID)
	}
	if r1.Rings != 3 || r1.WaveCount != 3 {
		t.Errorf("expected 3 rings, got %d", r1.Rings)
	}

	// Get & GetAll
	fetched := s.GetRipple("1")
	if fetched == nil || fetched.ID != "1" {
		t.Fatalf("expected ripple '1' to be found")
	}

	all := s.GetAllRipples()
	if len(all) != 1 {
		t.Fatalf("expected 1 ripple, got %d", len(all))
	}

	// Update
	fetched.Color = "#aaccff"
	fetched.OuterR = 180
	s.UpdateRipple(*fetched)

	updated := s.GetRipple("1")
	if updated.Color != "#aaccff" || updated.OuterR != 180 {
		t.Errorf("update failed: %+v", updated)
	}

	// Create second ripple
	r2 := s.CreateRipple(Ripple{
		X:      80,
		Y:      20,
		OuterR: 200,
	})
	if r2.ID != "2" {
		t.Errorf("expected ID '2', got %q", r2.ID)
	}
	if len(s.GetAllRipples()) != 2 {
		t.Errorf("expected 2 ripples, got %d", len(s.GetAllRipples()))
	}

	// Remove
	if !s.RemoveRipple("1") {
		t.Error("failed to remove ripple '1'")
	}
	if s.GetRipple("1") != nil {
		t.Error("ripple '1' should not exist after removal")
	}
	if len(s.GetAllRipples()) != 1 {
		t.Errorf("expected 1 ripple remaining, got %d", len(s.GetAllRipples()))
	}
}

func TestRippleHitTestingAndBounds(t *testing.T) {
	s := NewScene()

	// Ripple at (50%, 50%) -> (500, 500), outerR = 100. Hit target r = max(30, 100) = 100px (10% of 1000).
	r1 := s.CreateRipple(Ripple{
		X:      50,
		Y:      50,
		InnerR: 0,
		OuterR: 100,
	})

	// Exact center hit
	hit := s.FindRippleAt(50, 50, 1000, 1000)
	if hit == nil || hit.ID != r1.ID {
		t.Fatalf("expected hit at center, got %+v", hit)
	}

	// Near hit: (55%, 50%) -> dx = 50px <= 100px
	hitNear := s.FindRippleAt(55, 50, 1000, 1000)
	if hitNear == nil || hitNear.ID != r1.ID {
		t.Fatalf("expected hit near center, got %+v", hitNear)
	}

	// Miss: (65%, 50%) -> dx = 150px > 100px
	hitMiss := s.FindRippleAt(65, 50, 1000, 1000)
	if hitMiss != nil {
		t.Fatalf("expected miss, got %+v", hitMiss)
	}

	// Bounds
	bounds, center := s.GetRippleBounds(r1, 1000, 1000)
	if bounds.Width <= 0 || bounds.Height <= 0 || center.X != 500 || center.Y != 500 {
		t.Errorf("invalid ripple bounds or center: %+v, %+v", bounds, center)
	}

	// Describe
	desc := s.DescribeRipple(r1, 1000, 1000)
	if desc.ID != r1.ID || desc.HitRadius <= 0 {
		t.Errorf("unexpected DescribeRipple output: %+v", desc)
	}
}
