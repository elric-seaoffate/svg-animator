package scene

import (
	"testing"
)

func TestDefaultPreset(t *testing.T) {
	preset := DefaultPreset()
	if !preset.AutoApplyToNewNodes {
		t.Errorf("Expected AutoApplyToNewNodes to be true by default")
	}
	if len(preset.Preset) != 11 {
		t.Fatalf("Expected 11 preset properties, got %d", len(preset.Preset))
	}

	// Verify width is enabled by default with value 170
	if w, ok := preset.Preset["width"]; !ok || !w.Enabled || w.Value != float64(170) {
		t.Errorf("Width preset mismatch: %+v", w)
	}
	// Verify height is disabled by default
	if h, ok := preset.Preset["height"]; !ok || h.Enabled {
		t.Errorf("Height preset should be disabled by default: %+v", h)
	}
}

func TestApplyPresetToNode(t *testing.T) {
	preset := DefaultPreset()
	// Enable height with 95
	preset.Preset["height"] = PresetParam{Enabled: true, Value: float64(95)}
	// Enable shape with 'pill'
	preset.Preset["shape"] = PresetParam{Enabled: true, Value: "pill"}

	node := Node{
		ID:     "node-1",
		Width:  120,
		Height: 50,
		Shape:  "rect",
	}

	changed := preset.ApplyPresetToNode(&node)
	if !changed {
		t.Fatalf("Expected ApplyPresetToNode to return true for changes")
	}
	if node.Width != 170 {
		t.Errorf("Expected width 170, got %v", node.Width)
	}
	if node.Height != 95 {
		t.Errorf("Expected height 95, got %v", node.Height)
	}
	if node.Shape != "pill" {
		t.Errorf("Expected shape 'pill', got %v", node.Shape)
	}
	if node.FillColor != "#161b22" || node.Fill != "#161b22" {
		t.Errorf("Expected fillColor '#161b22', got %v", node.FillColor)
	}
}

func TestExtractPresetFromNode(t *testing.T) {
	preset := DefaultPreset()
	node := Node{
		ID:          "node-custom",
		Width:       250,
		Height:      110,
		Shape:       "diamond",
		FillColor:   "#ff0055",
		StrokeColor: "#00ffcc",
		TextColor:   "#ffffff",
		FontSize:    18,
		FillOpacity: 0.85,
		StrokeWidth: 3,
		StrokeStyle: "dashed",
		Anim:        "float",
	}

	preset.ExtractPresetFromNode(node)
	if preset.Preset["width"].Value != float64(250) {
		t.Errorf("Extracted width mismatch: %v", preset.Preset["width"].Value)
	}
	if preset.Preset["height"].Value != float64(110) {
		t.Errorf("Extracted height mismatch: %v", preset.Preset["height"].Value)
	}
	if preset.Preset["shape"].Value != "diamond" {
		t.Errorf("Extracted shape mismatch: %v", preset.Preset["shape"].Value)
	}
	if preset.Preset["fillColor"].Value != "#ff0055" {
		t.Errorf("Extracted fillColor mismatch: %v", preset.Preset["fillColor"].Value)
	}
}
