package scene

import (
	"math"
	"testing"
)

func TestValidateCamera(t *testing.T) {
	valid := CameraConfig{
		Motion:   "ken-burns",
		Duration: 5.0,
	}
	if err := ValidateCamera(&valid); err != nil {
		t.Fatalf("expected valid camera, got error: %v", err)
	}

	invalidMotion := CameraConfig{
		Motion: "non-existent-motion",
	}
	if err := ValidateCamera(&invalidMotion); err == nil {
		t.Errorf("expected error for invalid motion")
	}

	negativeDuration := CameraConfig{
		Duration: -5.0,
	}
	if err := ValidateCamera(&negativeDuration); err == nil {
		t.Errorf("expected error for negative duration")
	}
}

func TestComputeCameraTransform(t *testing.T) {
	w, h := 1920.0, 1080.0

	// Zoom centered (zx=50, zy=50, zz=1.5, roll=0)
	tx, ty, safeZoom, transformStr := ComputeCameraTransform(w, h, 50, 50, 1.5, 0)

	if math.Abs(safeZoom-1.5) > 0.001 {
		t.Errorf("expected safeZoom ~1.5, got %v", safeZoom)
	}

	// Verify clamping matches JS formula:
	// safeZoom = 1.5
	// vw = 1920 / 1.5 = 1280, vh = 1080 / 1.5 = 720
	// vx = 0.5 * 1920 - 640 = 320, vy = 0.5 * 1080 - 360 = 180
	// tx = -320 * 1.5 = -480, ty = -180 * 1.5 = -270
	expectedTX := -480.0
	expectedTY := -270.0
	if math.Abs(tx-expectedTX) > 0.1 || math.Abs(ty-expectedTY) > 0.1 {
		t.Errorf("expected tx=%v ty=%v, got tx=%v ty=%v", expectedTX, expectedTY, tx, ty)
	}
	if transformStr == "" {
		t.Errorf("expected non-empty transform string")
	}

	// Clamping at boundary
	txClamp, tyClamp, _, _ := ComputeCameraTransform(w, h, 0, 0, 2.0, 0)
	if txClamp != 0 || tyClamp != 0 {
		t.Errorf("expected clamped tx=0 ty=0 for origin, got tx=%v ty=%v", txClamp, tyClamp)
	}
}

func TestEvaluateCameraAtTime(t *testing.T) {
	cfg := CameraConfig{
		Motion:    "ken-burns",
		Duration:  10.0,
		Loop:      "once",
		StartX:    50,
		StartY:    50,
		StartZoom: 1.0,
		EndX:      50,
		EndY:      50,
		EndZoom:   3.0,
	}

	_, _, scale0, _, _, _ := EvaluateCameraAtTime(cfg, 0.0, 1000, 1000, nil)
	if math.Abs(scale0-1.0) > 0.001 {
		t.Errorf("expected scale 1.0 at t=0, got %v", scale0)
	}

	_, _, scale5, _, _, _ := EvaluateCameraAtTime(cfg, 5.0, 1000, 1000, nil)
	if math.Abs(scale5-2.0) > 0.001 {
		t.Errorf("expected scale 2.0 at t=5s (50%% of 10s), got %v", scale5)
	}

	_, _, scale10, _, _, _ := EvaluateCameraAtTime(cfg, 10.0, 1000, 1000, nil)
	if math.Abs(scale10-3.0) > 0.001 {
		t.Errorf("expected scale 3.0 at t=10s, got %v", scale10)
	}
}

func TestSceneCameraCRUD(t *testing.T) {
	sc := NewScene()
	initialRev := sc.Revision()

	cam := sc.GetCamera()
	if cam.Motion != "static" && cam.Motion != "" {
		t.Errorf("expected default camera motion empty or static, got %s", cam.Motion)
	}

	updated := CameraConfig{
		Motion:    "ken-burns",
		Duration:  8.0,
		StartZoom: 1.5,
	}
	sc.UpdateCamera(updated)

	if sc.Revision() <= initialRev {
		t.Errorf("expected revision increment after UpdateCamera")
	}

	retrieved := sc.GetCamera()
	if retrieved.Motion != "ken-burns" || retrieved.Duration != 8.0 || retrieved.StartZoom != 1.5 {
		t.Errorf("camera properties mismatch: %+v", retrieved)
	}
}
