package scene

import (
	"math"
	"strings"
	"testing"
)

func TestValidateOptical(t *testing.T) {
	valid := OpticalConfig{
		Type:      "focus-pull",
		StartBlur: 5,
		EndBlur:   0,
		FocusDur:  4,
	}
	if err := ValidateOptical(&valid); err != nil {
		t.Fatalf("expected valid optical config, got %v", err)
	}

	invalidType := OpticalConfig{
		Type: "unknown-optical-type",
	}
	if err := ValidateOptical(&invalidType); err == nil {
		t.Errorf("expected error for unknown optical type")
	}

	negativeBlur := OpticalConfig{
		StartBlur: -5,
	}
	if err := ValidateOptical(&negativeBlur); err == nil {
		t.Errorf("expected error for negative blur")
	}
}

func TestEvaluateOpticalAtTime(t *testing.T) {
	// Focus pull from blur 10 to blur 0 over 4 seconds, "once"
	cfg := OpticalConfig{
		Type:      "focus-pull",
		StartBlur: 10.0,
		EndBlur:   0.0,
		FocusDur:  4.0,
	}

	blur0, filterAttr0, _, active0 := EvaluateOpticalAtTime(cfg, 0.0, 4.0, "once", nil)
	if !active0 || math.Abs(blur0-10.0) > 0.01 {
		t.Errorf("expected active blur 10 at t=0, got active=%v blur=%v", active0, blur0)
	}
	if !strings.Contains(filterAttr0, "url(#opt-focus)") {
		t.Errorf("expected filterAttr to reference #opt-focus")
	}

	blur2, _, _, _ := EvaluateOpticalAtTime(cfg, 2.0, 4.0, "once", nil)
	if math.Abs(blur2-5.0) > 0.01 {
		t.Errorf("expected blur 5.0 at t=2 (half of 4s), got %v", blur2)
	}

	blur4, _, _, _ := EvaluateOpticalAtTime(cfg, 4.0, 4.0, "once", nil)
	if math.Abs(blur4-0.0) > 0.01 {
		t.Errorf("expected blur 0.0 at t=4s, got %v", blur4)
	}

	// Tilt-shift
	tsCfg := OpticalConfig{
		Type:    "tilt-shift",
		TSWidth: 40,
		TSBlur:  8,
		TSPos:   50,
	}
	_, _, tsDefs, tsActive := EvaluateOpticalAtTime(tsCfg, 1.0, 5.0, "loop", nil)
	if !tsActive || !strings.Contains(tsDefs, "opt-ts-blur") {
		t.Errorf("expected active tilt-shift with opt-ts-blur in defs, got active=%v", tsActive)
	}

	// Motion-blur
	mbCfg := OpticalConfig{
		Type:  "motion-blur",
		MBInt: 15,
		MBAng: 45,
	}
	_, _, mbDefs, mbActive := EvaluateOpticalAtTime(mbCfg, 1.0, 5.0, "loop", nil)
	if !mbActive || !strings.Contains(mbDefs, "opt-mb-blur") {
		t.Errorf("expected active motion blur with opt-mb-blur in defs, got active=%v", mbActive)
	}
}

func TestSceneOpticalCRUD(t *testing.T) {
	sc := NewScene()
	initialRev := sc.Revision()

	opt := sc.GetOptical()
	if opt.Type != "none" && opt.Type != "" {
		t.Errorf("expected default optics 'none' or empty, got %s", opt.Type)
	}

	updated := OpticalConfig{
		Type:      "focus-pull",
		StartBlur: 8,
		EndBlur:   0,
		FocusDur:  5,
	}
	sc.UpdateOptical(updated)

	if sc.Revision() <= initialRev {
		t.Errorf("expected revision increment after UpdateOptical")
	}

	retrieved := sc.GetOptical()
	if retrieved.Type != "focus-pull" || retrieved.StartBlur != 8 || retrieved.FocusDur != 5 {
		t.Errorf("optical properties mismatch: %+v", retrieved)
	}
}
