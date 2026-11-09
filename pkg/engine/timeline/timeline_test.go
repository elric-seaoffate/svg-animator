package timeline

import (
	"math"
	"testing"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/scene"
)

func TestSolveCubicBezier(t *testing.T) {
	// 1. Linear identity
	for x := 0.0; x <= 1.0; x += 0.2 {
		y := SolveCubicBezier(0, 0, 1, 1, x)
		if math.Abs(y-x) > 1e-4 {
			t.Errorf("expected linear y ~= %v, got %v", x, y)
		}
	}

	// 2. Symmetric ease-in-out (0.42, 0, 0.58, 1) -> at x=0.5, y must be exactly 0.5
	yMid := SolveCubicBezier(0.42, 0, 0.58, 1, 0.5)
	if math.Abs(yMid-0.5) > 1e-4 {
		t.Errorf("expected symmetric ease-in-out at 0.5 to be 0.5, got %v", yMid)
	}

	// 3. Boundaries
	if SolveCubicBezier(0.25, 0.1, 0.25, 1, 0) != 0 {
		t.Errorf("expected y(0) == 0")
	}
	if SolveCubicBezier(0.25, 0.1, 0.25, 1, 1) != 1 {
		t.Errorf("expected y(1) == 1")
	}
	if SolveCubicBezier(0.25, 0.1, 0.25, 1, -0.5) != 0 {
		t.Errorf("expected clamp for negative x")
	}
	if SolveCubicBezier(0.25, 0.1, 0.25, 1, 1.5) != 1 {
		t.Errorf("expected clamp for x > 1")
	}
}

func TestEvaluateTimelineProgress(t *testing.T) {
	// Mode "once": clamps at duration
	p, _, _ := EvaluateTimelineProgress(0, 10, "once")
	if p != 0 {
		t.Errorf("expected p=0 at t=0, got %v", p)
	}
	p, _, _ = EvaluateTimelineProgress(5, 10, "once")
	if p != 0.5 {
		t.Errorf("expected p=0.5 at t=5, got %v", p)
	}
	p, _, _ = EvaluateTimelineProgress(15, 10, "once")
	if p != 1.0 {
		t.Errorf("expected p=1.0 at t=15, got %v", p)
	}

	// Mode "loop": modulo
	p, c, _ := EvaluateTimelineProgress(15, 10, "loop")
	if math.Abs(p-0.5) > 1e-4 || c != 1 {
		t.Errorf("expected p=0.5, cycle=1 at t=15, got p=%v, c=%v", p, c)
	}

	// Mode "pingpong": alternates
	p, c, isRev := EvaluateTimelineProgress(5, 10, "pingpong")
	if p != 0.5 || isRev {
		t.Errorf("expected forward 0.5, got %v (rev=%v)", p, isRev)
	}
	p, c, isRev = EvaluateTimelineProgress(12, 10, "pingpong")
	// Cycle 1: rem = 0.2, isReverse -> 1.0 - 0.2 = 0.8
	if math.Abs(p-0.8) > 1e-4 || !isRev || c != 1 {
		t.Errorf("expected pingpong reverse 0.8, got %v (rev=%v, c=%v)", p, isRev, c)
	}
}

func TestEvaluateCycle(t *testing.T) {
	// Start delay 2.0s, active dur 4.0s, endDelay 1.0s
	// Before delay: active=false, prog=0
	prog, active := EvaluateCycle(1.0, 2.0, 4.0, 1.0, "loop")
	if active || prog != 0 {
		t.Errorf("expected inactive before delay, got active=%v, prog=%v", active, prog)
	}

	// Mid transit: local = 4.0 - 2.0 = 2.0. prog = 2.0 / 4.0 = 0.5
	prog, active = EvaluateCycle(4.0, 2.0, 4.0, 1.0, "loop")
	if !active || math.Abs(prog-0.5) > 1e-4 {
		t.Errorf("expected active=true, prog=0.5, got active=%v, prog=%v", active, prog)
	}

	// During endDelay: local = 6.5 - 2.0 = 4.5. Within cycle [0..5.0]. tInCycle = 4.5 > 4.0 -> endDelay
	prog, active = EvaluateCycle(6.5, 2.0, 4.0, 1.0, "loop")
	if active || prog != 1.0 {
		t.Errorf("expected inactive during endDelay, prog=1.0, got active=%v, prog=%v", active, prog)
	}
}

func TestEvaluateSceneAtTimeFlow(t *testing.T) {
	s := scene.NewScene()
	s.SetCanvas(scene.CanvasConfig{
		Width:        1000,
		Height:       1000,
		Duration:     10.0,
		PlaybackMode: "loop",
	})

	flow := scene.Flow{
		ID:        "flow-test",
		Nodes:     []geometry.Point{{X: 0, Y: 0}, {X: 100, Y: 100}},
		Curvature: 0,
		RouteMode: "direct",
		Speed:     4.0,
		Delay:     0.0,
		Opacity:   1.0,
		Scale:     1.0,
		ShowLine:  true,
		LineStyle: "marching",
	}
	s.UpdateFlow(flow)

	// Evaluate at t=0
	f0 := EvaluateSceneAtTime(s, 0.0)
	if len(f0.Flows) != 1 {
		t.Fatalf("expected 1 flow update, got %d", len(f0.Flows))
	}
	fl0 := f0.Flows[0]
	if fl0.X != 0 || fl0.Y != 0 {
		t.Errorf("expected start at (0, 0), got (%v, %v)", fl0.X, fl0.Y)
	}

	// Evaluate at t=2.0 (midpoint of 4.0s transit)
	fMid := EvaluateSceneAtTime(s, 2.0)
	flMid := fMid.Flows[0]
	if math.Abs(flMid.X-500) > 1.0 || math.Abs(flMid.Y-500) > 1.0 {
		t.Errorf("expected midpoint near (500, 500), got (%v, %v)", flMid.X, flMid.Y)
	}
	if flMid.Opacity < 0.95 {
		t.Errorf("expected full opacity at mid-transit, got %v", flMid.Opacity)
	}

	// Determinism check: repeated evaluation at t=2.0 produces identical output
	fMidRepeat := EvaluateSceneAtTime(s, 2.0)
	if fMid.Flows[0].X != fMidRepeat.Flows[0].X || fMid.Flows[0].Y != fMidRepeat.Flows[0].Y {
		t.Errorf("non-deterministic evaluation detected!")
	}
}

func TestEvaluateSceneAtTimeEmpty(t *testing.T) {
	s := scene.NewScene()
	res := EvaluateSceneAtTime(s, 3.5)
	if res.Time != 3.5 {
		t.Errorf("expected time 3.5, got %v", res.Time)
	}
	if len(res.Flows) != 0 || len(res.Glows) != 0 || len(res.Ripples) != 0 {
		t.Errorf("expected empty lists for empty scene")
	}
}
