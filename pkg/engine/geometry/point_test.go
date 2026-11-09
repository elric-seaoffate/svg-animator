package geometry

import (
	"testing"
)

func TestComputeSnappedPosition(t *testing.T) {
	// Disabled snapping (clamps to 0..100 and rounds to 1 decimal place)
	off := ComputeSnappedPosition(35.67, 72.12, SnapConfig{Enabled: false})
	if off.X != 35.7 || off.Y != 72.1 {
		t.Errorf("expected (35.7, 72.1), got (%v, %v)", off.X, off.Y)
	}

	// Snapping enabled: 25px grid on 1000x1000
	on := ComputeSnappedPosition(3.7, 5.0, SnapConfig{
		Enabled:      true,
		GridSizePx:   25,
		CanvasWidth:  1000,
		CanvasHeight: 1000,
	})
	if on.X != 2.5 || on.Y != 5.0 {
		t.Errorf("expected (2.5, 5.0), got (%v, %v)", on.X, on.Y)
	}

	// Boundary clamping
	clamped := ComputeSnappedPosition(-10, 150, SnapConfig{Enabled: false})
	if clamped.X != 0 || clamped.Y != 100 {
		t.Errorf("expected (0, 100), got (%v, %v)", clamped.X, clamped.Y)
	}
}

func TestRectClientToPct(t *testing.T) {
	pt := RectClientToPct(300, 200, 100, 100, 800, 400)
	// (300 - 100) / 800 * 100 = 25%
	// (200 - 100) / 400 * 100 = 25%
	if pt.X != 25 || pt.Y != 25 {
		t.Errorf("expected (25, 25), got (%v, %v)", pt.X, pt.Y)
	}

	zeroRect := RectClientToPct(100, 100, 0, 0, 0, 0)
	if zeroRect.X != 50 || zeroRect.Y != 50 {
		t.Errorf("expected default (50, 50), got (%v, %v)", zeroRect.X, zeroRect.Y)
	}
}

func TestComputeFitScale(t *testing.T) {
	scale := ComputeFitScale(1600, 900, 1200, 800, 20)
	if scale <= 0 || scale > 3.0 {
		t.Errorf("unexpected fit scale %v", scale)
	}
}
