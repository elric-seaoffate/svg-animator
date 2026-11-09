package scene

import (
	"strings"
	"testing"
)

func TestValidateFrame(t *testing.T) {
	valid := FrameConfig{
		Enabled: true,
		Style:   "walnut",
		Depth:   40,
	}
	if err := ValidateFrame(&valid); err != nil {
		t.Fatalf("expected valid frame config, got %v", err)
	}

	invalidStyle := FrameConfig{
		Style: "unknown_style",
	}
	if err := ValidateFrame(&invalidStyle); err == nil {
		t.Errorf("expected error for unknown frame style")
	}

	negativeDepth := FrameConfig{
		Depth: -10,
	}
	if err := ValidateFrame(&negativeDepth); err == nil {
		t.Errorf("expected error for negative depth")
	}
}

func TestBuildFrameMarkup(t *testing.T) {
	w, h := 1920.0, 1080.0

	// Disabled
	defsDisabled, overlayDisabled := BuildFrameMarkup(FrameConfig{Enabled: false, Style: ""}, w, h)
	if defsDisabled != "" || overlayDisabled != "" {
		t.Errorf("expected empty markup when disabled, got defs=%q overlay=%q", defsDisabled, overlayDisabled)
	}

	// Walnut
	defsWalnut, overlayWalnut := BuildFrameMarkup(FrameConfig{
		Enabled:  true,
		Style:    "walnut",
		Depth:    40,
		Lighting: true,
		LightDir: "tl",
		LightInt: 50,
		Shadow:   0.5,
	}, w, h)

	if !strings.Contains(defsWalnut, "walnutTop") {
		t.Errorf("expected walnut defs to contain walnutTop gradient, got: %s", defsWalnut)
	}
	if !strings.Contains(overlayWalnut, `id="frameAssembly"`) {
		t.Errorf("expected walnut frame markup to contain #frameAssembly, got: %s", overlayWalnut)
	}
	if !strings.Contains(overlayWalnut, "<polygon") {
		t.Errorf("expected mitered polygons in walnut frame")
	}

	// Cyber-HUD
	defsHUD, overlayHUD := BuildFrameMarkup(FrameConfig{
		Enabled: true,
		Style:   "cyber-hud",
		Depth:   30,
	}, w, h)
	_ = defsHUD
	if !strings.Contains(overlayHUD, "SYS.OPTICS // ONLINE") {
		t.Errorf("expected cyber-hud to contain SYS.OPTICS // ONLINE")
	}

	// Mac-window
	_, overlayMac := BuildFrameMarkup(FrameConfig{
		Enabled: true,
		Style:   "mac-window",
		Depth:   25,
	}, w, h)
	if !strings.Contains(overlayMac, "#ff5f56") { // Red close button
		t.Errorf("expected mac-window to contain close button #ff5f56")
	}

	// Blueprint
	_, overlayBP := BuildFrameMarkup(FrameConfig{
		Enabled: true,
		Style:   "blueprint-border",
		Fillet:  true,
	}, w, h)
	if !strings.Contains(overlayBP, "REV 1.2") {
		t.Errorf("expected blueprint border to contain REV 1.2")
	}

	// CRT vintage
	defsCRT, _ := BuildFrameMarkup(FrameConfig{
		Enabled: true,
		Style:   "crt-vintage",
	}, w, h)
	if !strings.Contains(defsCRT, "crtScanlines") {
		t.Errorf("expected CRT scanlines pattern in Defs")
	}
}

func TestSceneFrameCRUD(t *testing.T) {
	sc := NewScene()
	initialRev := sc.Revision()

	f := sc.GetFrame()
	if f.Enabled {
		t.Errorf("expected frame disabled by default")
	}

	updated := FrameConfig{
		Enabled:  true,
		Style:    "cyber-hud",
		Depth:    35,
		LightInt: 60,
	}
	sc.UpdateFrame(updated)

	if sc.Revision() <= initialRev {
		t.Errorf("expected revision increment after UpdateFrame")
	}

	retrieved := sc.GetFrame()
	if !retrieved.Enabled || retrieved.Style != "cyber-hud" || retrieved.Depth != 35 {
		t.Errorf("frame properties mismatch: %+v", retrieved)
	}
}
