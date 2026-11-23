package scene

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"io"
	"os"
	"strings"
	"testing"
)

func TestWidgetDocsGeneration(t *testing.T) {
	sc := NewScene()
	sc.canvas.Width = 800
	sc.canvas.Height = 600

	node1 := sc.CreateNode(Node{
		Name:      "tankHull",
		Shape:     "rounded",
		Width:     200,
		Height:    300,
		FillColor: "#1f2937",
	}, nil, false)

	node2 := sc.CreateNode(Node{
		Name:      "fluidColumn",
		Shape:     "rect",
		Width:     180,
		Height:    150,
		FillColor: "#38bdf8",
	}, nil, false)

	glow1 := sc.CreateGlow(Glow{
		Name:  "warningBeacon",
		Color: "#22c55e",
		Size:  25,
	})

	minVal := 10.0
	maxVal := 250.0
	stepVal := 5.0
	err := sc.AddParameter(WidgetParameter{
		Name:        "hullColor",
		Target:      node1.Name,
		Property:    "fill",
		Type:        "color",
		Default:     "#1f2937",
		Description: "External tank body color",
	})
	if err != nil {
		t.Fatalf("AddParameter hullColor failed: %v", err)
	}

	err = sc.AddParameter(WidgetParameter{
		Name:        "fluidLevel",
		Target:      node2.Name,
		Property:    "height",
		Type:        "number",
		Default:     150.0,
		Min:         &minVal,
		Max:         &maxVal,
		Step:        &stepVal,
		Unit:        "mm",
		Description: "Internal fluid level height",
	})
	if err != nil {
		t.Fatalf("AddParameter fluidLevel failed: %v", err)
	}

	err = sc.AddParameter(WidgetParameter{
		Name:        "beaconColor",
		Target:      "glow-" + string(glow1.ID),
		Property:    "color",
		Type:        "color",
		Default:     "#22c55e",
		Description: "Warning beacon color",
	})
	if err != nil {
		t.Fatalf("AddParameter beaconColor failed: %v", err)
	}

	manifest := &WidgetManifest{
		SchemaVersion: 1,
		Parameters:    sc.GetParameters(),
	}

	// 1. Verify Properties Guide
	guide := GenerateWidgetPropertiesGuide(sc, "Industrial Storage Tank", "industrial-storage-tank.svg", manifest)
	if !strings.Contains(guide, "# Industrial Storage Tank — Widget Properties & Integration Guide") {
		t.Errorf("Properties guide missing title")
	}
	if !strings.Contains(guide, "800 × 600 px") {
		t.Errorf("Properties guide missing dimensions")
	}
	if !strings.Contains(guide, "`hullColor`") || !strings.Contains(guide, "`fluidLevel`") || !strings.Contains(guide, "`beaconColor`") {
		t.Errorf("Properties guide missing parameter names")
	}
	if !strings.Contains(guide, "10.0 to 250.0") {
		t.Errorf("Properties guide missing min-max range for fluidLevel")
	}
	if !strings.Contains(guide, "mm") {
		t.Errorf("Properties guide missing unit 'mm'")
	}
	if !strings.Contains(guide, "myWidget.setParameter('hullColor', '#22c55e')") {
		t.Errorf("Properties guide missing real code example using hullColor")
	}
	if !strings.Contains(guide, "instA.setParameter('hullColor'") {
		t.Errorf("Properties guide missing multi-instance code example")
	}

	// 2. Verify README
	readme := GenerateWidgetReadme("Industrial Storage Tank", "industrial-storage-tank.svg", manifest)
	if !strings.Contains(readme, "# Industrial Storage Tank — Portable SVG Widget Package") {
		t.Errorf("Readme missing title")
	}
	if !strings.Contains(readme, "**Total Exposed Parameters:** 3") {
		t.Errorf("Readme missing parameter count, got:\n%s", readme)
	}
	if !strings.Contains(readme, "demo.html") || !strings.Contains(readme, "js/svg-widget.js") {
		t.Errorf("Readme missing file listing")
	}

	// 3. Verify Demo HTML
	demoHTML := GenerateWidgetDemoHTML("Industrial Storage Tank", "industrial-storage-tank.svg", manifest)
	if !strings.Contains(demoHTML, "<!DOCTYPE html>") {
		t.Errorf("Demo HTML missing doctype")
	}
	if !strings.Contains(demoHTML, "unit-a") || !strings.Contains(demoHTML, "unit-b") || !strings.Contains(demoHTML, "unit-c") {
		t.Errorf("Demo HTML missing 3 instance IDs")
	}
	if !strings.Contains(demoHTML, "SVGWidget.mount") {
		t.Errorf("Demo HTML missing SVGWidget.mount call")
	}
	if !strings.Contains(demoHTML, "industrial-storage-tank.svg") {
		t.Errorf("Demo HTML missing SVG asset filename")
	}

	// 4. Verify ZIP Package
	rawSVG := `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">` +
		`<rect id="tankHull" width="200" height="300"/>` +
		`<rect id="fluidColumn" width="180" height="150"/>` +
		`<g id="glow-1" data-glow-id="1" data-semantic-target="glow-1"><circle r="25"/></g>` +
		`</svg>`
	mockJS := `// Mock svg-widget.js runtime v1.2.0`

	zipBytes, err := BuildWidgetPackageZip(sc, "Industrial Storage Tank", rawSVG, mockJS)
	if err != nil {
		t.Fatalf("BuildWidgetPackageZip failed: %v", err)
	}
	if len(zipBytes) == 0 {
		t.Fatalf("BuildWidgetPackageZip produced empty bytes")
	}

	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		t.Fatalf("Failed to open generated ZIP with archive/zip: %v", err)
	}

	expectedFiles := map[string]bool{
		"industrial-storage-tank/industrial-storage-tank.svg":           false,
		"industrial-storage-tank/industrial-storage-tank-properties.md": false,
		"industrial-storage-tank/widget-manifest.json":                  false,
		"industrial-storage-tank/README.md":                             false,
		"industrial-storage-tank/demo.html":                             false,
		"industrial-storage-tank/js/svg-widget.js":                      false,
	}

	var demoHTMLContent string
	for _, f := range zr.File {
		if _, ok := expectedFiles[f.Name]; ok {
			expectedFiles[f.Name] = true
			rc, err := f.Open()
			if err != nil {
				t.Errorf("Failed opening zip entry %s: %v", f.Name, err)
				continue
			}
			content, _ := io.ReadAll(rc)
			rc.Close()
			if len(content) == 0 {
				t.Errorf("Zip entry %s is empty", f.Name)
			}
			if f.Name == "industrial-storage-tank/demo.html" {
				demoHTMLContent = string(content)
			}
		}
	}

	for fname, found := range expectedFiles {
		if !found {
			t.Errorf("ZIP archive missing expected file: %s", fname)
		}
	}

	// Verify embedded Base64 payload in demo.html for direct offline file:// operation
	if !strings.Contains(demoHTMLContent, `<script id="embedded-widget-svg" type="application/base64">`) {
		t.Errorf("demo.html in ZIP is missing embedded Base64 payload for offline file:// loading")
	}
	if !strings.Contains(demoHTMLContent, `function getRawSvg()`) {
		t.Errorf("demo.html in ZIP is missing getRawSvg() function")
	}
}

func TestWidgetPackageOfflineDirectFileOperation(t *testing.T) {
	// Test SVG with embedded raster photo (data:image/png;base64,...)
	imageSVG := `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
		`<image id="bg-photo" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" width="512" height="512"/>` +
		`<text id="mytext1" x="20" y="50">Hello World</text>` +
		`</svg>`

	sc := NewScene()
	zipBytes, err := BuildWidgetPackageZip(sc, "photo-widget", imageSVG, "// mock js")
	if err != nil {
		t.Fatalf("BuildWidgetPackageZip failed: %v", err)
	}

	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		t.Fatalf("failed reading zip: %v", err)
	}

	var demoHTML, manifestJSON string
	for _, f := range zr.File {
		if f.Name == "photo-widget/demo.html" {
			rc, _ := f.Open()
			b, _ := io.ReadAll(rc)
			rc.Close()
			demoHTML = string(b)
		} else if f.Name == "photo-widget/widget-manifest.json" {
			rc, _ := f.Open()
			b, _ := io.ReadAll(rc)
			rc.Close()
			manifestJSON = string(b)
		}
	}

	if demoHTML == "" {
		t.Fatalf("demo.html not found in package")
	}

	// 1. Verify offline Base64 payload exists
	idxStart := strings.Index(demoHTML, `<script id="embedded-widget-svg" type="application/base64">`)
	if idxStart == -1 {
		t.Fatalf("embedded-widget-svg tag missing from demo.html")
	}
	idxEnd := strings.Index(demoHTML[idxStart:], `</script>`)
	if idxEnd == -1 {
		t.Fatalf("embedded-widget-svg closing tag missing")
	}
	tagLen := len(`<script id="embedded-widget-svg" type="application/base64">`)
	b64Payload := demoHTML[idxStart+tagLen : idxStart+idxEnd]

	// 2. Decode Base64 and verify image data URI is preserved
	decodedBytes, err := base64.StdEncoding.DecodeString(strings.TrimSpace(b64Payload))
	if err != nil {
		t.Fatalf("failed decoding embedded base64 payload: %v", err)
	}
	decodedSVG := string(decodedBytes)
	if !strings.Contains(decodedSVG, `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`) {
		t.Errorf("decoded SVG lost the embedded data URI image")
	}
	if !strings.Contains(decodedSVG, `Hello World`) {
		t.Errorf("decoded SVG lost text content")
	}

	// 3. Verify zero-parameter decorative component manifest (schemaVersion: 1, parameters: [])
	if !strings.Contains(demoHTML, `Standard Playback Mode`) {
		t.Errorf("expected demo.html to indicate standard playback mode when parameters are empty")
	}
	if !strings.Contains(manifestJSON, `"schemaVersion": 1`) || !strings.Contains(manifestJSON, `"parameters": []`) {
		t.Errorf("expected valid schemaVersion:1 decorative manifest with empty parameters[], got: %s", manifestJSON)
	}
}

func TestExtractWidgetManifestAndFallback(t *testing.T) {
	svgWithManifest := `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
		`<rect id="box" width="50" height="50" fill="#ff0000"/>` +
		`<script type="application/json" id="test-instance__sva-widget-manifest">` +
		`{"schemaVersion":1,"parameters":[{"name":"boxColor","target":"box","property":"fill","type":"color","default":"#ff0000","description":"Box fill colour"}]}` +
		`</script></svg>`

	// Test ExtractWidgetManifest
	manifest := ExtractWidgetManifest(svgWithManifest)
	if manifest == nil {
		t.Fatalf("ExtractWidgetManifest returned nil")
	}
	if len(manifest.Parameters) != 1 || manifest.Parameters[0].Name != "boxColor" {
		t.Fatalf("unexpected parameters extracted: %+v", manifest.Parameters)
	}

	// Test BuildWidgetPackageZip fallback when scene has no parameters
	sc := NewScene() // empty scene
	zipBytes, err := BuildWidgetPackageZip(sc, "extracted-test", svgWithManifest, "// mock js")
	if err != nil {
		t.Fatalf("BuildWidgetPackageZip with manifest fallback failed: %v", err)
	}

	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		t.Fatalf("reading zip failed: %v", err)
	}

	var manifestContent, guideContent string
	for _, f := range zr.File {
		if f.Name == "extracted-test/widget-manifest.json" {
			rc, _ := f.Open()
			b, _ := io.ReadAll(rc)
			rc.Close()
			manifestContent = string(b)
		} else if f.Name == "extracted-test/extracted-test-properties.md" {
			rc, _ := f.Open()
			b, _ := io.ReadAll(rc)
			rc.Close()
			guideContent = string(b)
		}
	}

	if !strings.Contains(manifestContent, `"boxColor"`) {
		t.Errorf("extracted-test manifest missing boxColor parameter: %s", manifestContent)
	}
	if !strings.Contains(guideContent, "`boxColor`") {
		t.Errorf("extracted-test guide missing boxColor parameter: %s", guideContent)
	}
}

func TestRealMailSVGPackageGeneration(t *testing.T) {
	mailSVGBytes, err := os.ReadFile("/tmp/mail.svg")
	if err != nil {
		t.Skip("skipping real mail svg test if /tmp/mail.svg not present")
	}
	sc := NewScene()
	zipBytes, err := BuildWidgetPackageZip(sc, "mail", string(mailSVGBytes), "// mock js")
	if err != nil {
		t.Fatalf("BuildWidgetPackageZip failed: %v", err)
	}
	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		t.Fatalf("zip reader failed: %v", err)
	}
	var demoHTML, manifestJSON string
	for _, f := range zr.File {
		if f.Name == "mail/demo.html" {
			rc, _ := f.Open()
			b, _ := io.ReadAll(rc)
			rc.Close()
			demoHTML = string(b)
		} else if f.Name == "mail/widget-manifest.json" {
			rc, _ := f.Open()
			b, _ := io.ReadAll(rc)
			rc.Close()
			manifestJSON = string(b)
		}
	}
	if !strings.Contains(demoHTML, `<script id="embedded-widget-svg" type="application/base64">`) {
		t.Errorf("demo.html missing embedded Base64 payload")
	}
	if !strings.Contains(demoHTML, `Standard Playback Mode`) {
		t.Errorf("demo.html missing standard playback mode indication")
	}
	if strings.TrimSpace(manifestJSON) != "{}" {
		t.Errorf("expected manifest to be {} for unexposed mail widget, got: %s", manifestJSON)
	}

	// Write updated demo.html to /tmp/mail_demo.html so we can upload to Kiwiberry for user's convenience
	_ = os.WriteFile("/tmp/mail_demo.html", []byte(demoHTML), 0644)
}

func TestWidgetDocsEmptyManifest(t *testing.T) {
	sc := NewScene()
	manifest := &WidgetManifest{
		SchemaVersion: 1,
		Parameters:    []WidgetParameter{},
	}
	guide := GenerateWidgetPropertiesGuide(sc, "Gateway", "gateway.svg", manifest)
	if strings.Contains(guide, "exampleParam") {
		t.Errorf("guide should not contain placeholder 'exampleParam' when no parameters exist")
	}
	if !strings.Contains(guide, "No external parameters are exposed") && !strings.Contains(guide, "No external parameters have been configured") {
		t.Errorf("guide should indicate no parameters are exposed")
	}
	if !strings.Contains(guide, "gateway-template") {
		t.Errorf("guide should illustrate offline template mounting")
	}
}

func TestWidgetDocsBooleanAndSpeedTypes(t *testing.T) {
	sc := NewScene()
	manifest := &WidgetManifest{
		SchemaVersion: 1,
		Parameters: []WidgetParameter{
			{
				Name:        "flowing",
				Type:        "boolean",
				Target:      "root",
				Property:    "visibility",
				Default:     true,
				Description: "Toggle widget visibility",
			},
			{
				Name:        "flow1",
				Type:        "speed",
				Target:      "flow-1",
				Property:    "speed",
				Default:     1.0,
				Description: "Flow animation speed",
			},
		},
	}
	guide := GenerateWidgetPropertiesGuide(sc, "Birdscroll", "birdscroll.svg", manifest)
	if strings.Contains(guide, "'flowing', 'NORMAL'") {
		t.Errorf("guide should never emit string 'NORMAL' for boolean parameter 'flowing'")
	}
	if !strings.Contains(guide, "instA.setParameter('flowing', true)") {
		t.Errorf("guide should illustrate boolean parameter using boolean literals")
	}
	if !strings.Contains(guide, "instB.setParameter('flowing', false)") {
		t.Errorf("guide should illustrate boolean parameter using false literal for unit-b")
	}
}
