package sva

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"path"
	"strings"
	"testing"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/scene"
)

func TestEncodeDecodeRoundtrip(t *testing.T) {
	// 1. Build test project with realistic mixed scene
	fakePhotoBytes := []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4")
	fakePhotoB64 := "data:image/png;base64," + base64.StdEncoding.EncodeToString(fakePhotoBytes)

	legacyStudioState := map[string]any{
		"version": "1.2.0",
		"controls": map[string]any{
			"canvasWidthInput":    1920.0,
			"canvasHeightInput":   1080.0,
			"exportDurationInput": 14.0,
			"cameraMotionSelect":  "ken-burns",
			"effectSelect":        "focus-pull",
			"focusDurSlider":      5.5,
			"startBlurSlider":     0.0,
			"endBlurSlider":       16.0,
			"chkModuleFrame":      true,
			"frameStyleSelect":    "walnut",
		},
		"loadedPhoto": map[string]any{
			"filename":      "orchard_cooling.png",
			"mime":          "image/png",
			"b64":           fakePhotoB64,
			"naturalWidth":  1920.0,
			"naturalHeight": 1080.0,
		},
		"presets": map[string]any{
			"stroke": "#00ffcc",
			"fill":   "#0a192f",
		},
		"autoApplyPreset": true,
		"nodes": []scene.Node{
			{
				ID:          "node-1",
				Name:        "🚀 Primary Pump #1 / 冷却ポンプ",
				Shape:       "rounded",
				Text:        "Cooling Pump P-101",
				X:           25.0,
				Y:           30.0,
				Width:       200.0,
				Height:      100.0,
				Fill:        "#0a192f",
				Stroke:      "#00ffcc",
				StrokeWidth: 2.5,
				Metadata: map[string]any{
					"vendor":   "Grundfos",
					"sensorId": "SENS-TEMP-99",
				},
			},
			{
				ID:     "node-2",
				Name:   "Heat Exchanger Alpha",
				Shape:  "cylinder",
				Text:   "HEX-202",
				X:      75.0,
				Y:      70.0,
				Width:  160.0,
				Height: 120.0,
			},
		},
		"nodesCounter": 2,
		"flows": []scene.Flow{
			{
				ID:         "flow-1",
				Name:       "Primary Coolant Loop",
				FromNodeID: "node-1",
				ToNodeID:   "node-2",
				Label:      "Water 42°C",
				Nodes: []geometry.Point{
					{X: 25.0, Y: 30.0},
					{X: 50.0, Y: 45.0},
					{X: 75.0, Y: 70.0},
				},
				Curvature: 35.0,
				RouteMode: "curve",
				Speed:     3.0,
				Color:     "#00ffff",
			},
		},
		"flowsCounter": 1,
		"glows": []scene.Glow{
			{
				ID:       "glow-1",
				Name:     "Warning Beacon",
				Shape:    "radar",
				X:        25.0,
				Y:        30.0,
				Size:     20.0,
				Duration: 1.5,
				Color:    "#ff0055",
			},
		},
		"glowsCounter": 1,
		"ripples": []scene.Ripple{
			{
				ID:       "ripple-1",
				Name:     "Vibration Wave",
				X:        75.0,
				Y:        70.0,
				InnerR:   10.0,
				OuterR:   80.0,
				Duration: 2.0,
				Color:    "#00ffaa",
			},
		},
		"ripplesCounter": 1,
		"metadata": map[string]any{
			"facility": "Plant-9",
			"tier":     1,
		},
	}

	schemaBytes, err := json.Marshal(legacyStudioState)
	if err != nil {
		t.Fatalf("Marshal legacy state error: %v", err)
	}

	// 2. Build SVA Project
	proj, err := BuildProjectFromStudioState("Orchard Plant Topology", "Mission critical cooling network", schemaBytes)
	if err != nil {
		t.Fatalf("BuildProjectFromStudioState failed: %v", err)
	}

	if len(proj.Assets) != 1 {
		t.Fatalf("Expected 1 bundled asset for background photo, got %d", len(proj.Assets))
	}

	// 3. Encode to SVA ZIP bytes
	svaBytes, err := Encode(proj)
	if err != nil {
		t.Fatalf("Encode failed: %v", err)
	}
	if len(svaBytes) == 0 {
		t.Fatal("Encode returned empty byte slice")
	}

	// 4. Validate package
	manifest, err := Validate(svaBytes)
	if err != nil {
		t.Fatalf("Validate failed: %v", err)
	}
	if manifest.Format != "sva" {
		t.Errorf("Manifest format mismatch: got %s, want sva", manifest.Format)
	}
	if manifest.Name != "Orchard Plant Topology" {
		t.Errorf("Manifest name mismatch: got %s", manifest.Name)
	}

	// 5. Decode back to Project
	decodedProj, err := Decode(svaBytes)
	if err != nil {
		t.Fatalf("Decode failed: %v", err)
	}

	if decodedProj.Manifest.Name != proj.Manifest.Name {
		t.Errorf("Decoded project name mismatch: got %s, want %s", decodedProj.Manifest.Name, proj.Manifest.Name)
	}
	if len(decodedProj.Scene.Nodes) != 2 {
		t.Fatalf("Decoded nodes count mismatch: got %d, want 2", len(decodedProj.Scene.Nodes))
	}

	// Verify custom Unicode object name and diagram text distinction
	node1 := decodedProj.Scene.Nodes[0]
	if node1.Name != "🚀 Primary Pump #1 / 冷却ポンプ" {
		t.Errorf("Node name mismatch: got %s", node1.Name)
	}
	if node1.Text != "Cooling Pump P-101" {
		t.Errorf("Node diagram text mismatch: got %s", node1.Text)
	}

	// 6. Extract back to Studio State for Web Editor / SQLite compatibility
	restoredStateJSON, err := ExtractStudioState(decodedProj)
	if err != nil {
		t.Fatalf("ExtractStudioState failed: %v", err)
	}

	var restoredState map[string]any
	if err := json.Unmarshal(restoredStateJSON, &restoredState); err != nil {
		t.Fatalf("Unmarshal restored state failed: %v", err)
	}

	photoObj, ok := restoredState["loadedPhoto"].(map[string]any)
	if !ok || photoObj == nil {
		t.Fatal("Restored state missing loadedPhoto")
	}
	restoredB64, _ := photoObj["b64"].(string)
	if strings.HasPrefix(restoredB64, "data:") {
		t.Errorf("Restored photo b64 should be raw base64 without data URI scheme, got: %s", restoredB64[:min(30, len(restoredB64))])
	}
	decodedBytes, err := base64.StdEncoding.DecodeString(restoredB64)
	if err != nil {
		t.Fatalf("Restored photo b64 failed to decode: %v", err)
	}
	if !bytes.Equal(decodedBytes, fakePhotoBytes) {
		t.Errorf("Restored photo bytes do not match original")
	}

	controls, _ := restoredState["controls"].(map[string]any)
	if controls == nil || controls["canvasPatternSelect"] != "photo" {
		t.Errorf("Restored state controls should have canvasPatternSelect='photo', got %v", controls["canvasPatternSelect"])
	}
}

func TestExtensionMetadataSurvival(t *testing.T) {
	proj := &Project{
		Manifest: Manifest{
			Name: "Extensible Project",
			Metadata: map[string]any{
				"futureDigitalTwinId": "DT-10992",
				"telemetryTopic":      "telemetry/plant/pump1",
			},
		},
		Scene: SceneData{
			Canvas: scene.CanvasConfig{Width: 1280, Height: 720},
			Nodes: []scene.Node{
				{
					ID:   "n1",
					Name: "Pump Unit",
					Metadata: map[string]any{
						"sensorA": 42.5,
						"tags":    []any{"critical", "vibration"},
					},
				},
			},
			Metadata: map[string]any{
				"customLayout": "grid-v3",
			},
		},
	}

	// Pass 1: Encode and Decode
	bytes1, err := Encode(proj)
	if err != nil {
		t.Fatalf("Encode pass 1 error: %v", err)
	}

	proj1, err := Decode(bytes1)
	if err != nil {
		t.Fatalf("Decode pass 1 error: %v", err)
	}

	// Edit ordinary scene node without touching metadata
	proj1.Scene.Nodes[0].Width = 350.0

	// Pass 2: Re-encode and Decode
	bytes2, err := Encode(proj1)
	if err != nil {
		t.Fatalf("Encode pass 2 error: %v", err)
	}

	proj2, err := Decode(bytes2)
	if err != nil {
		t.Fatalf("Decode pass 2 error: %v", err)
	}

	// Verify metadata survived intact
	if proj2.Manifest.Metadata["futureDigitalTwinId"] != "DT-10992" {
		t.Errorf("Manifest metadata lost: %v", proj2.Manifest.Metadata)
	}
	if proj2.Scene.Metadata["customLayout"] != "grid-v3" {
		t.Errorf("Scene metadata lost: %v", proj2.Scene.Metadata)
	}
	nodeMeta := proj2.Scene.Nodes[0].Metadata
	if nodeMeta["sensorA"] != 42.5 {
		t.Errorf("Node metadata sensorA lost: %v", nodeMeta)
	}
	if proj2.Scene.Nodes[0].Width != 350.0 {
		t.Errorf("Node edited width not preserved: %f", proj2.Scene.Nodes[0].Width)
	}
}

func TestZipSlipSecurity(t *testing.T) {
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	// Inject illegal zip traversal
	w, err := zw.Create("../../../etc/passwd")
	if err != nil {
		t.Fatalf("Create traversal entry error: %v", err)
	}
	w.Write([]byte("root:x:0:0:root:/root:/bin/bash"))

	// Manifest
	mw, _ := zw.Create("manifest.json")
	mw.Write([]byte(`{"format":"sva","version":"1.0.0"}`))

	zw.Close()

	_, err = Validate(buf.Bytes())
	if err != ErrZipSlipAttempt {
		t.Fatalf("Expected ErrZipSlipAttempt, got: %v", err)
	}
}

func TestUnsupportedFutureVersion(t *testing.T) {
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	mw, _ := zw.Create("manifest.json")
	mw.Write([]byte(`{"format":"sva","version":"2.5.0","minReaderVersion":"2.0.0","scene":"scene.json"}`))

	sw, _ := zw.Create("scene.json")
	sw.Write([]byte(`{}`))

	zw.Close()

	_, err := Decode(buf.Bytes())
	if err == nil || !strings.Contains(err.Error(), ErrUnsupportedVersion.Error()) {
		t.Fatalf("Expected unsupported version error, got: %v", err)
	}
}

func TestInvalidSignature(t *testing.T) {
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	mw, _ := zw.Create("manifest.json")
	mw.Write([]byte(`{"format":"unknown_format","version":"1.0.0"}`))

	zw.Close()

	_, err := Validate(buf.Bytes())
	if err != ErrInvalidSignature {
		t.Fatalf("Expected ErrInvalidSignature, got: %v", err)
	}
}

func TestGeneratedImageBackgroundPackaging(t *testing.T) {
	// Realistic generated-image(15) 1024x1024 PNG test case
	fakePngBytes := append([]byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"), make([]byte, 100)...)
	rawB64 := base64.StdEncoding.EncodeToString(fakePngBytes)

	// Simulate formatted base64 with newlines/whitespace and data URI prefix
	formattedB64 := fmt.Sprintf("data:image/png;base64,\n%s\r\n", rawB64)

	schemaJSON := fmt.Sprintf(`{
		"version": "1.2.0",
		"controls": {
			"canvasWidthInput": 1024,
			"canvasHeightInput": 1024,
			"canvasPatternSelect": "photo",
			"photoFitSelect": "match",
			"cameraMotionSelect": "ken-burns",
			"effectSelect": "focus-pull"
		},
		"loadedPhoto": {
			"filename": "generated-image(15)",
			"mime": "image/png",
			"b64": %q,
			"naturalWidth": 1024,
			"naturalHeight": 1024
		},
		"nodes": [],
		"nodesCounter": 0,
		"flows": [],
		"flowsCounter": 0,
		"glows": [],
		"glowsCounter": 0,
		"ripples": [],
		"ripplesCounter": 0
	}`, formattedB64)

	// 1. Build Project from Studio state (export)
	proj, err := BuildProjectFromStudioState("Generated SVA Test", "Testing background image packaging", []byte(schemaJSON))
	if err != nil {
		t.Fatalf("BuildProjectFromStudioState failed: %v", err)
	}

	if proj.Scene.Photo == nil {
		t.Fatal("Expected proj.Scene.Photo to be populated")
	}
	if proj.Scene.Photo.Filename != "generated-image(15)" {
		t.Errorf("Photo filename mismatch: got %q, want 'generated-image(15)'", proj.Scene.Photo.Filename)
	}
	if proj.Scene.Photo.NaturalWidth != 1024 || proj.Scene.Photo.NaturalHeight != 1024 {
		t.Errorf("Photo dimensions mismatch: got %dx%d, want 1024x1024", proj.Scene.Photo.NaturalWidth, proj.Scene.Photo.NaturalHeight)
	}

	// Verify asset exists in map with nonzero size
	cleanAssetPath := path.Clean(proj.Scene.Photo.AssetPath)
	assetBytes, ok := proj.Assets[cleanAssetPath]
	if !ok || len(assetBytes) == 0 {
		t.Fatalf("Asset not found in proj.Assets: %s (total assets: %d)", cleanAssetPath, len(proj.Assets))
	}
	if !bytes.Equal(assetBytes, fakePngBytes) {
		t.Fatalf("Asset bytes mismatch with original fake PNG bytes")
	}

	// 2. Encode to ZIP
	svaBytes, err := Encode(proj)
	if err != nil {
		t.Fatalf("Encode failed: %v", err)
	}

	// 3. Inspect ZIP contents directly
	zr, err := zip.NewReader(bytes.NewReader(svaBytes), int64(len(svaBytes)))
	if err != nil {
		t.Fatalf("zip.NewReader failed: %v", err)
	}
	var foundAssetZipFile *zip.File
	for _, f := range zr.File {
		if strings.HasPrefix(f.Name, "assets/") && strings.Contains(f.Name, "generated-image") {
			foundAssetZipFile = f
			break
		}
	}
	if foundAssetZipFile == nil {
		t.Fatal("ZIP archive does not contain generated-image asset in assets/ directory")
	}
	if foundAssetZipFile.UncompressedSize64 != uint64(len(fakePngBytes)) {
		t.Errorf("ZIP asset size mismatch: got %d, want %d", foundAssetZipFile.UncompressedSize64, len(fakePngBytes))
	}

	// 4. Decode SVA bytes back
	decodedProj, err := Decode(svaBytes)
	if err != nil {
		t.Fatalf("Decode failed: %v", err)
	}
	if decodedProj.Scene.Photo == nil {
		t.Fatal("Decoded project missing Photo metadata")
	}

	// 5. Extract to Studio state
	restoredStateJSON, err := ExtractStudioState(decodedProj)
	if err != nil {
		t.Fatalf("ExtractStudioState failed: %v", err)
	}

	var restoredState map[string]any
	if err := json.Unmarshal(restoredStateJSON, &restoredState); err != nil {
		t.Fatalf("Unmarshal restored state failed: %v", err)
	}

	photoObj, ok := restoredState["loadedPhoto"].(map[string]any)
	if !ok || photoObj == nil {
		t.Fatal("Restored state missing loadedPhoto")
	}

	// Crucial check: b64 must NOT be double-prefixed with data:
	restoredB64, _ := photoObj["b64"].(string)
	if strings.HasPrefix(restoredB64, "data:") {
		t.Fatalf("Restored photo b64 must be raw base64 string, but got data: prefix: %s", restoredB64[:min(30, len(restoredB64))])
	}
	if restoredB64 != rawB64 {
		t.Fatalf("Restored photo b64 mismatch with original raw base64")
	}

	controls, _ := restoredState["controls"].(map[string]any)
	if controls == nil || controls["canvasPatternSelect"] != "photo" {
		t.Errorf("Expected controls.canvasPatternSelect='photo', got %v", controls["canvasPatternSelect"])
	}
}

func TestMissingPhotoAssetExportFailure(t *testing.T) {
	// If loadedPhoto contains metadata indicating a photo is intended, but b64 is empty, export must fail
	schemaJSON := `{
		"version": "1.2.0",
		"controls": {},
		"loadedPhoto": {
			"filename": "generated-image(15)",
			"mime": "image/png",
			"b64": "",
			"naturalWidth": 1024,
			"naturalHeight": 1024
		}
	}`

	_, err := BuildProjectFromStudioState("Invalid Export", "Should fail", []byte(schemaJSON))
	if err == nil {
		t.Fatal("Expected BuildProjectFromStudioState to fail when photo data is missing, but it succeeded")
	}
	if !strings.Contains(err.Error(), "no image data to bundle") {
		t.Errorf("Error should mention missing image data, got: %v", err)
	}
}

func TestCorruptOrMissingArchivePhotoAsset(t *testing.T) {
	// Construct an SVA zip where scene.json points to a photo, but the asset file is missing from the zip
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	mw, _ := zw.Create("manifest.json")
	mw.Write([]byte(`{
		"format": "sva",
		"version": "1.0.0",
		"minReaderVersion": "1.0.0",
		"name": "Missing Asset Test",
		"scene": "scene.json"
	}`))

	sw, _ := zw.Create("scene.json")
	sw.Write([]byte(`{
		"schemaVersion": "1.0.0",
		"photo": {
			"assetId": "asset-photo-bg",
			"assetPath": "assets/missing_photo.png",
			"filename": "missing_photo.png",
			"mime": "image/png"
		}
	}`))

	zw.Close()

	_, err := Decode(buf.Bytes())
	if err == nil {
		t.Fatal("Expected Decode to fail when referenced photo asset is missing from zip, but it succeeded")
	}
	if !strings.Contains(err.Error(), "missing from archive") {
		t.Errorf("Expected error to mention asset missing from archive, got: %v", err)
	}
}

func TestManifestMissingAssetFailure(t *testing.T) {
	// Construct an SVA zip where manifest.json declares an asset that is missing from the zip
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	mw, _ := zw.Create("manifest.json")
	mw.Write([]byte(`{
		"format": "sva",
		"version": "1.0.0",
		"minReaderVersion": "1.0.0",
		"name": "Missing Manifest Asset Test",
		"scene": "scene.json",
		"assets": [
			{"id": "asset1", "path": "assets/phantom.png", "mime": "image/png", "size": 100}
		]
	}`))

	sw, _ := zw.Create("scene.json")
	sw.Write([]byte(`{"schemaVersion": "1.0.0"}`))

	zw.Close()

	_, err := Decode(buf.Bytes())
	if err == nil {
		t.Fatal("Expected Decode to fail when manifest declares asset missing from archive")
	}
	if !strings.Contains(err.Error(), "missing from archive") {
		t.Errorf("Expected error to mention missing asset, got: %v", err)
	}
}

func TestSVARoundtripReExportParity(t *testing.T) {
	// Verify that exporting, importing, and re-exporting does not corrupt paths (e.g. assets/assets/...)
	imgBytes := []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR1234567890")
	b64 := base64.StdEncoding.EncodeToString(imgBytes)

	schema1 := fmt.Sprintf(`{
		"version": "1.2.0",
		"loadedPhoto": {
			"filename": "test-bg",
			"mime": "image/png",
			"b64": %q,
			"naturalWidth": 800,
			"naturalHeight": 600
		}
	}`, b64)

	// Round 1
	proj1, err := BuildProjectFromStudioState("P1", "", []byte(schema1))
	if err != nil {
		t.Fatalf("Build 1 failed: %v", err)
	}
	svaBytes1, err := Encode(proj1)
	if err != nil {
		t.Fatalf("Encode 1 failed: %v", err)
	}

	// Decode 1
	dec1, err := Decode(svaBytes1)
	if err != nil {
		t.Fatalf("Decode 1 failed: %v", err)
	}
	stateJSON1, err := ExtractStudioState(dec1)
	if err != nil {
		t.Fatalf("Extract 1 failed: %v", err)
	}

	// Round 2 (Re-export from extracted state)
	proj2, err := BuildProjectFromStudioState("P2", "", stateJSON1)
	if err != nil {
		t.Fatalf("Build 2 failed: %v", err)
	}
	svaBytes2, err := Encode(proj2)
	if err != nil {
		t.Fatalf("Encode 2 failed: %v", err)
	}

	dec2, err := Decode(svaBytes2)
	if err != nil {
		t.Fatalf("Decode 2 failed: %v", err)
	}

	// Verify photo asset path is clean and not double-prefixed
	if strings.Contains(dec2.Scene.Photo.AssetPath, "assets/assets") {
		t.Fatalf("Photo asset path has double prefix: %s", dec2.Scene.Photo.AssetPath)
	}

	// Asset bytes in round 2 must match original
	cleanPath := path.Clean(dec2.Scene.Photo.AssetPath)
	if !bytes.Equal(dec2.Assets[cleanPath], imgBytes) {
		t.Fatalf("Asset bytes in round 2 do not match original image bytes")
	}
}

func TestSVAGroupPackagingAndRestoration(t *testing.T) {
	studioJSON := `{
		"version": "1.2.0",
		"nodes": [
			{"id": "1", "shape": "rect", "text": "Pump Body", "x": 20, "y": 20, "width": 80, "height": 40},
			{"id": "2", "shape": "circle", "text": "Motor", "x": 40, "y": 20, "width": 60, "height": 60}
		],
		"nodesCounter": 2,
		"flows": [],
		"flowsCounter": 0,
		"glows": [],
		"glowsCounter": 0,
		"ripples": [],
		"ripplesCounter": 0,
		"groups": [
			{
				"id": "group-1",
				"name": "Cooling Pump 1",
				"members": [
					{"type": "node", "id": "1"},
					{"type": "node", "id": "2"}
				]
			}
		],
		"groupsCounter": 1
	}`

	// 1. Build project from studio state
	proj, err := BuildProjectFromStudioState("Pump Assembly", "Test groups in SVA", []byte(studioJSON))
	if err != nil {
		t.Fatalf("BuildProjectFromStudioState failed: %v", err)
	}

	if len(proj.Scene.Groups) != 1 {
		t.Fatalf("expected 1 group in proj.Scene, got %d", len(proj.Scene.Groups))
	}
	if proj.Scene.Groups[0].Name != "Cooling Pump 1" {
		t.Errorf("group name mismatch: got %q, want 'Cooling Pump 1'", proj.Scene.Groups[0].Name)
	}

	// 2. Encode to .sva
	svaBytes, err := Encode(proj)
	if err != nil {
		t.Fatalf("Encode failed: %v", err)
	}

	// 3. Decode from .sva
	dec, err := Decode(svaBytes)
	if err != nil {
		t.Fatalf("Decode failed: %v", err)
	}

	if len(dec.Scene.Groups) != 1 {
		t.Fatalf("expected 1 group in decoded scene, got %d", len(dec.Scene.Groups))
	}
	decGroup := dec.Scene.Groups[0]
	if decGroup.ID != "group-1" || decGroup.Name != "Cooling Pump 1" || len(decGroup.Members) != 2 {
		t.Fatalf("decoded group mismatch: %+v", decGroup)
	}

	// 4. Extract studio state
	extractedStateBytes, err := ExtractStudioState(dec)
	if err != nil {
		t.Fatalf("ExtractStudioState failed: %v", err)
	}

	var stateMap map[string]any
	if err := json.Unmarshal(extractedStateBytes, &stateMap); err != nil {
		t.Fatalf("unmarshal extracted state failed: %v", err)
	}

	grps, ok := stateMap["groups"].([]any)
	if !ok || len(grps) != 1 {
		t.Fatalf("extracted state groups mismatch: %+v", stateMap["groups"])
	}
}

func TestSVAMixedTypeAndOpticalGroups(t *testing.T) {
	studioJSON := `{
		"version": "1.2.0",
		"nodes": [
			{"id": "node-1", "shape": "rect", "text": "Station", "x": 100, "y": 100, "width": 80, "height": 40}
		],
		"nodesCounter": 1,
		"flows": [
			{"id": "flow-1", "name": "Pipe", "fromNodeId": "node-1", "toNodeId": "node-1", "nodes": [{"x": 100, "y": 100}, {"x": 200, "y": 100}]}
		],
		"flowsCounter": 1,
		"glows": [
			{"id": "glow-1", "name": "Indicator", "x": 120, "y": 120, "size": 15},
			{"id": "glow-2", "name": "Optical Indicator", "x": 300, "y": 300, "size": 25}
		],
		"glowsCounter": 2,
		"ripples": [
			{"id": "ripple-1", "name": "Wave", "x": 140, "y": 140, "innerRadius": 10, "outerRadius": 40},
			{"id": "ripple-2", "name": "Optical Wave", "x": 320, "y": 320, "innerRadius": 5, "outerRadius": 50}
		],
		"ripplesCounter": 2,
		"groups": [
			{
				"id": "group-1",
				"name": "Mixed Station Assembly",
				"members": [
					{"type": "node", "id": "node-1"},
					{"type": "flow", "id": "flow-1"},
					{"type": "glow", "id": "glow-1"},
					{"type": "ripple", "id": "ripple-1"}
				]
			},
			{
				"id": "group-2",
				"name": "Optical Only Assembly",
				"members": [
					{"type": "glow", "id": "glow-2"},
					{"type": "ripple", "id": "ripple-2"}
				]
			}
		],
		"groupsCounter": 2
	}`

	proj, err := BuildProjectFromStudioState("Complex Groups Project", "Mixed and optical groups", []byte(studioJSON))
	if err != nil {
		t.Fatalf("BuildProjectFromStudioState failed: %v", err)
	}

	if len(proj.Scene.Groups) != 2 {
		t.Fatalf("expected 2 groups in proj.Scene, got %d", len(proj.Scene.Groups))
	}
	if proj.Scene.GroupsCounter != 2 {
		t.Errorf("expected GroupsCounter 2, got %d", proj.Scene.GroupsCounter)
	}

	// Verify mixed group members
	mixedGrp := proj.Scene.Groups[0]
	if len(mixedGrp.Members) != 4 {
		t.Fatalf("expected 4 members in mixed group, got %d", len(mixedGrp.Members))
	}

	// Verify optical-only group members
	optGrp := proj.Scene.Groups[1]
	if len(optGrp.Members) != 2 {
		t.Fatalf("expected 2 members in optical group, got %d", len(optGrp.Members))
	}

	// Encode to SVA
	svaBytes, err := Encode(proj)
	if err != nil {
		t.Fatalf("Encode failed: %v", err)
	}

	// Decode from SVA
	dec, err := Decode(svaBytes)
	if err != nil {
		t.Fatalf("Decode failed: %v", err)
	}

	if len(dec.Scene.Groups) != 2 {
		t.Fatalf("expected 2 groups in decoded project, got %d", len(dec.Scene.Groups))
	}
	if dec.Scene.GroupsCounter != 2 {
		t.Errorf("expected decoded GroupsCounter 2, got %d", dec.Scene.GroupsCounter)
	}

	// Extract back to Studio State
	extractedBytes, err := ExtractStudioState(dec)
	if err != nil {
		t.Fatalf("ExtractStudioState failed: %v", err)
	}

	var stateMap map[string]any
	if err := json.Unmarshal(extractedBytes, &stateMap); err != nil {
		t.Fatalf("Unmarshal extracted state failed: %v", err)
	}

	rawGrps, ok := stateMap["groups"].([]any)
	if !ok || len(rawGrps) != 2 {
		t.Fatalf("expected 2 groups in extracted studio state, got %v", stateMap["groups"])
	}
	gc, ok := stateMap["groupsCounter"].(float64)
	if !ok || int64(gc) != 2 {
		t.Errorf("expected groupsCounter 2 in extracted studio state, got %v", stateMap["groupsCounter"])
	}
}

func TestSVABackwardCompatibilityNoGroups(t *testing.T) {
	legacyJSON := `{
		"version": "1.2.0",
		"nodes": [
			{"id": "node-1", "shape": "rect", "text": "Legacy Node", "x": 10, "y": 10, "width": 50, "height": 30}
		],
		"nodesCounter": 1,
		"flows": [],
		"flowsCounter": 0,
		"glows": [],
		"glowsCounter": 0,
		"ripples": [],
		"ripplesCounter": 0
	}`

	proj, err := BuildProjectFromStudioState("Legacy Project", "No groups defined", []byte(legacyJSON))
	if err != nil {
		t.Fatalf("BuildProjectFromStudioState failed on legacy schema: %v", err)
	}

	if proj.Scene.Groups == nil {
		t.Fatalf("proj.Scene.Groups should be non-nil slice")
	}
	if len(proj.Scene.Groups) != 0 {
		t.Errorf("expected 0 groups, got %d", len(proj.Scene.Groups))
	}
	if proj.Scene.GroupsCounter != 0 {
		t.Errorf("expected GroupsCounter 0, got %d", proj.Scene.GroupsCounter)
	}

	svaBytes, err := Encode(proj)
	if err != nil {
		t.Fatalf("Encode legacy project failed: %v", err)
	}

	dec, err := Decode(svaBytes)
	if err != nil {
		t.Fatalf("Decode legacy project failed: %v", err)
	}

	if len(dec.Scene.Groups) != 0 {
		t.Errorf("expected 0 groups in decoded legacy project, got %d", len(dec.Scene.Groups))
	}

	extractedBytes, err := ExtractStudioState(dec)
	if err != nil {
		t.Fatalf("ExtractStudioState legacy project failed: %v", err)
	}

	var stateMap map[string]any
	if err := json.Unmarshal(extractedBytes, &stateMap); err != nil {
		t.Fatalf("Unmarshal legacy extracted state failed: %v", err)
	}
	rawGrps, ok := stateMap["groups"].([]any)
	if !ok || len(rawGrps) != 0 {
		t.Fatalf("expected empty groups slice in legacy extracted state, got %v", stateMap["groups"])
	}
}
