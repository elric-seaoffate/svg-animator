package scene

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"image/png"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestStage16FFleetWidgetCompatibilityAndOptimisation(t *testing.T) {
	fleetPath := filepath.Join("..", "..", "..", "demos", "Stage-16F-Widget-Export", "fleet1.svg")
	rawBytes, err := os.ReadFile(fleetPath)
	if err != nil {
		t.Fatalf("failed to read fleet1.svg fixture at %s: %v", fleetPath, err)
	}
	rawFleet := string(rawBytes)
	origLen := len(rawFleet)
	if origLen < 1100000 {
		t.Fatalf("expected fleet1.svg to be ~1.21 MB, got %d bytes", origLen)
	}

	// 1. Extract embedded manifest from fleet1.svg and verify Stage 16F parameters (Selected, OnClick, MouseOver)
	manifest := ExtractWidgetManifest(rawFleet)
	if manifest == nil || len(manifest.Parameters) != 3 {
		t.Fatalf("expected 3 parameters in fleet1.svg manifest, got: %+v", manifest)
	}
	for _, p := range manifest.Parameters {
		if err := ValidateWidgetParameter(p); err != nil {
			t.Fatalf("ValidateWidgetParameter(%q) failed on fleet1.svg: %v", p.Name, err)
		}
	}

	// 2. Test Re-Isolation of already-isolated fleet1.svg for multiple instances (fleet-alpha, fleet-beta)
	isoA, idMapA, err := IsolateSVGWidget(rawFleet, WidgetIsolationOptions{
		InstanceID:   "fleet-alpha",
		ScopeCSS:     true,
		RasterPolicy: "2x",
	})
	if err != nil {
		t.Fatalf("IsolateSVGWidget(fleet-alpha) failed: %v", err)
	}
	isoB, _, err := IsolateSVGWidget(rawFleet, WidgetIsolationOptions{
		InstanceID:   "fleet-beta",
		ScopeCSS:     true,
		RasterPolicy: "2x",
	})
	if err != nil {
		t.Fatalf("IsolateSVGWidget(fleet-beta) failed: %v", err)
	}

	// Verify no duplicated root selectors (e.g. #sva-widget-fleet-alpha #fleet-alpha__sva-widget-... or #sva-widget-fleet-alpha #sva-widget-...)
	reDupRoot := regexp.MustCompile(`#sva-widget-[a-zA-Z0-9_-]+\s+#[a-zA-Z0-9_-]*sva-widget-`)
	if loc := reDupRoot.FindString(isoA); loc != "" {
		t.Fatalf("found duplicated root selector in re-isolated fleet1.svg (fleet-alpha): %q", loc)
	}
	if loc := reDupRoot.FindString(isoB); loc != "" {
		t.Fatalf("found duplicated root selector in re-isolated fleet1.svg (fleet-beta): %q", loc)
	}
	if !strings.Contains(isoA, `#sva-widget-fleet-alpha .sva-lite-radar-anim`) {
		t.Errorf("expected #sva-widget-fleet-alpha .sva-lite-radar-anim in fleet-alpha CSS")
	}
	if !strings.Contains(isoB, `#sva-widget-fleet-beta .sva-lite-radar-anim`) {
		t.Errorf("expected #sva-widget-fleet-beta .sva-lite-radar-anim in fleet-beta CSS")
	}
	if strings.Contains(isoA, "widget-626997") {
		t.Errorf("expected old instance prefix widget-626997 to be completely replaced in fleet-alpha")
	}
	if !strings.Contains(isoA, `data-lite-id="1"`) || !strings.Contains(isoA, `data-image-id="image-1"`) {
		t.Errorf("expected data-lite-id and data-image-id to be normalized without instance prefix")
	}
	if idMapA["lite-1"] != "fleet-alpha__lite-1" {
		t.Errorf("expected idMapA[lite-1] = fleet-alpha__lite-1, got %q", idMapA["lite-1"])
	}

	// 3. Test Raster Optimisation Policies (1x, 2x, 3x, original) and verify dimensions, alpha transparency, and file size savings
	optOrig := OptimizeSVGWidgetRasterImages(rawFleet, "original")
	opt3x := OptimizeSVGWidgetRasterImages(rawFleet, "3x")
	opt2x := OptimizeSVGWidgetRasterImages(rawFleet, "2x")
	opt1x := OptimizeSVGWidgetRasterImages(rawFleet, "1x")

	t.Logf("fleet1.svg size comparison: raw=%d B | original(dedup)=%d B | 3x(147x147)=%d B | 2x(98x98)=%d B | 1x(49x49)=%d B",
		origLen, len(optOrig), len(opt3x), len(opt2x), len(opt1x))

	if strings.Contains(optOrig, `xlink:href="data:image/`) {
		t.Errorf("expected duplicate xlink:href data:image/ attribute to be removed in original policy")
	}
	if len(optOrig) >= origLen*60/100 {
		t.Errorf("expected deduplicated original policy to save ~50%% size, got %d vs %d", len(optOrig), origLen)
	}
	if len(opt2x) > 40000 {
		t.Errorf("expected 2x policy on fleet1.svg to be under 40 KB (got %d bytes)", len(opt2x))
	}
	if !(len(opt1x) < len(opt2x) && len(opt2x) < len(opt3x) && len(opt3x) < len(optOrig)) {
		t.Errorf("expected strict monotonic size ordering 1x (%d) < 2x (%d) < 3x (%d) < original (%d)",
			len(opt1x), len(opt2x), len(opt3x), len(optOrig))
	}

	// Decode the downsampled 2x PNG and verify dimensions (98x98) and non-opaque alpha transparency preservation
	hrefMatch := reImageHrefDataURI.FindStringSubmatch(opt2x)
	if len(hrefMatch) < 3 {
		t.Fatalf("failed to extract href data URI from opt2x")
	}
	b64Part := hrefMatch[2][strings.IndexByte(hrefMatch[2], ',')+1:]
	pngBytes, err := base64.StdEncoding.DecodeString(b64Part)
	if err != nil {
		t.Fatalf("failed to decode base64 PNG from opt2x: %v", err)
	}
	img2x, err := png.Decode(bytes.NewReader(pngBytes))
	if err != nil {
		t.Fatalf("failed to decode PNG from opt2x: %v", err)
	}
	if img2x.Bounds().Dx() != 98 || img2x.Bounds().Dy() != 98 {
		t.Errorf("expected 2x downsampled icon to be 98x98 (2x of 49x49), got %dx%d", img2x.Bounds().Dx(), img2x.Bounds().Dy())
	}
	hasTransparentPixels := false
	hasOpaquePixels := false
	for y := 0; y < 98; y++ {
		for x := 0; x < 98; x++ {
			_, _, _, a := img2x.At(x, y).RGBA()
			if a == 0 {
				hasTransparentPixels = true
			} else if a > 60000 {
				hasOpaquePixels = true
			}
		}
	}
	if !hasTransparentPixels || !hasOpaquePixels {
		t.Errorf("expected 2x downsampled PNG to preserve both transparent background and opaque icon pixels (transparent=%v, opaque=%v)",
			hasTransparentPixels, hasOpaquePixels)
	}

	// 4. Test adding reusable Label (text-lite.text) and Icon (image.src) component properties + MouseOver hover trigger
	extManifest := ExtractWidgetManifest(rawFleet)
	for i := range extManifest.Parameters {
		if extManifest.Parameters[i].Name == "MouseOver" {
			extManifest.Parameters[i].EventTrigger = "hover"
		}
	}
	extManifest.Parameters = append(extManifest.Parameters,
		WidgetParameter{
			Name:        "Label",
			Label:       "Button Label Text",
			Type:        "text",
			Target:      "root",
			Property:    "text",
			Default:     "Fleet Sanctum",
			Description: "Displayed text label on the button instance",
			Targets: []WidgetTargetBinding{
				{Target: "lite-1", Property: "text", When: "always", Action: "set"},
			},
		},
		WidgetParameter{
			Name:        "Icon",
			Label:       "Button Icon Source",
			Type:        "text",
			Target:      "root",
			Property:    "src",
			Default:     "",
			Description: "Icon image source URL or data:image/... URI",
			Targets: []WidgetTargetBinding{
				{Target: "image-image-1", Property: "src", When: "always", Action: "set"},
			},
		},
	)

	sc := NewScene()
	for _, p := range extManifest.Parameters {
		if err := sc.AddParameter(p); err != nil {
			t.Fatalf("AddParameter(%q) failed: %v", p.Name, err)
		}
	}

	// Write static/fleet1-optimised.svg (2x HiDPI downsampled with Label & Icon + Selected/OnClick/MouseOver) for live demo showcase
	isoStatic, _, err := IsolateSVGWidget(rawFleet, WidgetIsolationOptions{
		InstanceID:   "fleet1",
		ScopeCSS:     true,
		RasterPolicy: "2x",
		Manifest:     extManifest,
	})
	if err != nil {
		t.Fatalf("IsolateSVGWidget(fleet1-optimised) failed: %v", err)
	}
	staticPath := filepath.Join("..", "..", "..", "internal", "web", "static", "fleet1-optimised.svg")
	if err := os.WriteFile(staticPath, []byte(isoStatic), 0644); err != nil {
		t.Fatalf("failed writing %s: %v", staticPath, err)
	}

	zipBytes, err := BuildWidgetPackageZipWithOptions(sc, "fleet", rawFleet, "// svg-widget.js runtime", "2x")
	if err != nil {
		t.Fatalf("BuildWidgetPackageZipWithOptions(fleet) failed: %v", err)
	}
	rep := ValidateWidgetPackageDTCompatibility(zipBytes)
	if !rep.Compatible {
		t.Fatalf("expected fleet widget package to pass DT compatibility, got errors: %v", rep.Errors)
	}

	// Verify all fleet.<ext> files and internal references match "fleet" inside the ZIP
	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		t.Fatalf("failed reading fleet zip: %v", err)
	}
	expectedZipEntries := map[string]bool{
		"fleet/fleet.svg":            false,
		"fleet/fleet.json":           false,
		"fleet/widget-manifest.json": false,
		"fleet/fleet.html":           false,
		"fleet/demo.html":            false,
		"fleet/fleet.md":             false,
		"fleet/fleet-properties.md":  false,
		"fleet/README.md":            false,
		"fleet/js/fleet.js":          false,
		"fleet/js/svg-widget.js":     false,
		"fleet/preview.svg":          false,
	}
	for _, f := range zr.File {
		if _, ok := expectedZipEntries[f.Name]; ok {
			expectedZipEntries[f.Name] = true
		}
		rc, _ := f.Open()
		var buf bytes.Buffer
		_, _ = buf.ReadFrom(rc)
		rc.Close()
		body := buf.String()
		switch f.Name {
		case "fleet/fleet.svg":
			if !strings.Contains(body, `id="sva-widget-fleet"`) || !strings.Contains(body, `data-sva-widget-instance="fleet"`) {
				t.Errorf("fleet/fleet.svg root ID or instance attribute does not match 'fleet'")
			}
			if !strings.Contains(body, `"widgetName":"fleet"`) || !strings.Contains(body, `"packageId":"fleet"`) {
				t.Errorf("fleet/fleet.svg embedded manifest does not match 'fleet'")
			}
		case "fleet/fleet.json", "fleet/widget-manifest.json":
			if !strings.Contains(body, `"widgetName": "fleet"`) || !strings.Contains(body, `"packageId": "fleet"`) {
				t.Errorf("%s manifest does not match 'fleet': %s", f.Name, body)
			}
		case "fleet/fleet.html", "fleet/demo.html":
			if !strings.Contains(body, `const SVG_FILE = 'fleet.svg';`) || !strings.Contains(body, `href="fleet-properties.md"`) {
				t.Errorf("%s does not reference fleet.svg / fleet-properties.md", f.Name)
			}
		case "fleet/fleet.md", "fleet/fleet-properties.md", "fleet/README.md":
			if !strings.Contains(body, `fleet.svg`) {
				t.Errorf("%s does not reference fleet.svg", f.Name)
			}
		}
	}
	for entry, found := range expectedZipEntries {
		if !found {
			t.Errorf("expected zip entry %q in fleet.zip, but it was missing", entry)
		}
	}

	// 5. Verify ValidateSafeImageSource rejects XSS / script schemes
	badSources := []string{
		"",
		"javascript:alert(1)",
		"  JaVaScRiPt:alert(1)",
		"vbscript:msgbox(1)",
		"data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
		`https://example.com/icon.png" onload="alert(1)`,
	}
	for _, bad := range badSources {
		if err := ValidateSafeImageSource(bad); err == nil {
			t.Errorf("expected ValidateSafeImageSource(%q) to fail, got nil", bad)
		}
	}
}
