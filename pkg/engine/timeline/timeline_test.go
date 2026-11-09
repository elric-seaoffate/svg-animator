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

func TestReproductionCameraAndOptics17s(t *testing.T) {
	s := scene.NewScene()
	s.SetCanvas(scene.CanvasConfig{
		Width:        1280,
		Height:       720,
		Duration:     17.0,
		PlaybackMode: "once",
	})
	s.UpdateCamera(scene.CameraConfig{
		Motion:    "ken-burns",
		Duration:  8.0,
		Loop:      "once",
		StartX:    50,
		StartY:    50,
		StartZoom: 1.0,
		EndX:      60,
		EndY:      40,
		EndZoom:   2.0,
	})
	s.UpdateOptical(scene.OpticalConfig{
		Type:      "focus-pull",
		StartBlur: 18.0,
		EndBlur:   0.0,
		FocusDur:  6.0,
	})

	// 1. At t=0: Camera at start, Focus pull at 18
	res0 := EvaluateSceneAtTime(s, 0.0)
	if math.Abs(res0.Camera.Scale-1.0) > 0.01 {
		t.Errorf("expected camera scale 1.0 at t=0, got %v", res0.Camera.Scale)
	}
	if math.Abs(res0.Optical.Blur-18.0) > 0.01 {
		t.Errorf("expected focus pull blur 18.0 at t=0, got %v", res0.Optical.Blur)
	}
	if !res0.Optical.IsActive {
		t.Errorf("expected optical to be active")
	}

	// 2. At t=3: Focus pull at midpoint (~9.0), Ken Burns transitioning
	res3 := EvaluateSceneAtTime(s, 3.0)
	if math.Abs(res3.Optical.Blur-9.0) > 0.5 {
		t.Errorf("expected focus pull blur ~9.0 at t=3s, got %v", res3.Optical.Blur)
	}
	if res3.Camera.Scale <= 1.0 || res3.Camera.Scale >= 2.0 {
		t.Errorf("expected camera scale transitioning between 1.0 and 2.0, got %v", res3.Camera.Scale)
	}

	// 3. At t=6: Focus pull completed (0.0), Ken Burns still moving
	res6 := EvaluateSceneAtTime(s, 6.0)
	if math.Abs(res6.Optical.Blur-0.0) > 0.01 {
		t.Errorf("expected focus pull blur 0.0 at t=6s, got %v", res6.Optical.Blur)
	}
	if res6.Camera.Scale >= 2.0 {
		t.Errorf("expected camera still moving towards 2.0 at t=6s (dur=8s), got %v", res6.Camera.Scale)
	}

	// 4. At t=8: Ken Burns completed (scale 2.0), Focus pull holds at 0.0
	res8 := EvaluateSceneAtTime(s, 8.0)
	if math.Abs(res8.Camera.Scale-2.0) > 0.01 {
		t.Errorf("expected camera scale 2.0 at t=8s, got %v", res8.Camera.Scale)
	}
	if math.Abs(res8.Optical.Blur-0.0) > 0.01 {
		t.Errorf("expected focus pull blur holds at 0.0 at t=8s, got %v", res8.Optical.Blur)
	}

	// 5. At t=12: Both completed individual durations, holding until 17s scene end
	res12 := EvaluateSceneAtTime(s, 12.0)
	if math.Abs(res12.Camera.Scale-2.0) > 0.01 {
		t.Errorf("expected camera scale holds at 2.0 at t=12s, got %v", res12.Camera.Scale)
	}
	if math.Abs(res12.Optical.Blur-0.0) > 0.01 {
		t.Errorf("expected focus pull blur holds at 0.0 at t=12s, got %v", res12.Optical.Blur)
	}

	// 6. At t=17: Scene duration end, holding
	res17 := EvaluateSceneAtTime(s, 17.0)
	if math.Abs(res17.Camera.Scale-2.0) > 0.01 {
		t.Errorf("expected camera scale holds at 2.0 at t=17s, got %v", res17.Camera.Scale)
	}
	if math.Abs(res17.Optical.Blur-0.0) > 0.01 {
		t.Errorf("expected focus pull blur holds at 0.0 at t=17s, got %v", res17.Optical.Blur)
	}

	// 7. Test with "loop" mode for Ken Burns (8s) and Focus Pull (6s)
	s.UpdateCamera(scene.CameraConfig{
		Motion:    "ken-burns",
		Duration:  8.0,
		Loop:      "loop",
		StartX:    50,
		StartY:    50,
		StartZoom: 1.0,
		EndX:      60,
		EndY:      40,
		EndZoom:   2.0,
	})
	res9 := EvaluateSceneAtTime(s, 9.0) // 9s = 1s into second 8s cycle for camera; 3s into second 6s cycle for optics
	if res9.Camera.Scale >= 2.0 || res9.Camera.Scale <= 1.0 {
		t.Errorf("expected camera looped back and started second cycle, got %v", res9.Camera.Scale)
	}
	if math.Abs(res9.Optical.Blur-9.0) > 0.5 {
		t.Errorf("expected focus pull at midpoint of second 6s cycle (~9.0) at t=9s, got %v", res9.Optical.Blur)
	}
}
