package sva

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
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
	if !strings.HasPrefix(restoredB64, "data:image/png;base64,") {
		t.Errorf("Restored photo data URI invalid: %s", restoredB64[:min(30, len(restoredB64))])
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
