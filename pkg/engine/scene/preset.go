package scene

import (
	"encoding/json"
	"fmt"
	"strconv"
)

// PresetParam defines an individual preset property toggle and value.
type PresetParam struct {
	Enabled bool `json:"enabled"`
	Value   any  `json:"value"`
}

// PresetConfig represents the complete shape preset state.
type PresetConfig struct {
	Preset              map[string]PresetParam `json:"preset"`
	AutoApplyToNewNodes bool                   `json:"autoApplyToNewNodes"`
}

// DefaultPreset returns the standard default shape preset configuration.
func DefaultPreset() PresetConfig {
	return PresetConfig{
		AutoApplyToNewNodes: true,
		Preset: map[string]PresetParam{
			"width":       {Enabled: true, Value: float64(170)},
			"height":      {Enabled: false, Value: float64(80)},
			"fillColor":   {Enabled: true, Value: "#161b22"},
			"strokeColor": {Enabled: true, Value: "#58a6ff"},
			"textColor":   {Enabled: true, Value: "#e6edf3"},
			"fontSize":    {Enabled: true, Value: float64(15)},
			"fillOpacity": {Enabled: false, Value: 0.92},
			"strokeWidth": {Enabled: false, Value: float64(2)},
			"strokeStyle": {Enabled: false, Value: "solid"},
			"shape":       {Enabled: false, Value: "rounded"},
			"anim":        {Enabled: false, Value: "none"},
		},
	}
}

// toFloat64 converts generic interface{} to float64 safely.
func toFloat64(val any, defaultVal float64) float64 {
	if val == nil {
		return defaultVal
	}
	switch v := val.(type) {
	case float64:
		return v
	case float32:
		return float64(v)
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case string:
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	case json.Number:
		if f, err := v.Float64(); err == nil {
			return f
		}
	}
	return defaultVal
}

// toString converts generic interface{} to string safely.
func toString(val any, defaultVal string) string {
	if val == nil {
		return defaultVal
	}
	switch v := val.(type) {
	case string:
		return v
	case fmt.Stringer:
		return v.String()
	default:
		return fmt.Sprintf("%v", v)
	}
}

// ApplyPresetToNode applies active preset fields to a Node.
// Returns true if any property was changed.
func (p PresetConfig) ApplyPresetToNode(n *Node) bool {
	if n == nil || len(p.Preset) == 0 {
		return false
	}
	changed := false

	if param, ok := p.Preset["width"]; ok && param.Enabled {
		w := toFloat64(param.Value, n.Width)
		if w > 0 && n.Width != w {
			n.Width = w
			changed = true
		}
	}
	if param, ok := p.Preset["height"]; ok && param.Enabled {
		h := toFloat64(param.Value, n.Height)
		if h > 0 && n.Height != h {
			n.Height = h
			changed = true
		}
	}
	if param, ok := p.Preset["fillColor"]; ok && param.Enabled {
		col := toString(param.Value, n.FillColor)
		if col != "" && (n.FillColor != col || n.Fill != col) {
			n.FillColor = col
			n.Fill = col
			changed = true
		}
	}
	if param, ok := p.Preset["strokeColor"]; ok && param.Enabled {
		col := toString(param.Value, n.StrokeColor)
		if col != "" && (n.StrokeColor != col || n.Stroke != col) {
			n.StrokeColor = col
			n.Stroke = col
			changed = true
		}
	}
	if param, ok := p.Preset["textColor"]; ok && param.Enabled {
		col := toString(param.Value, n.TextColor)
		if col != "" && n.TextColor != col {
			n.TextColor = col
			changed = true
		}
	}
	if param, ok := p.Preset["fontSize"]; ok && param.Enabled {
		fs := toFloat64(param.Value, n.FontSize)
		if fs > 0 && n.FontSize != fs {
			n.FontSize = fs
			changed = true
		}
	}
	if param, ok := p.Preset["fillOpacity"]; ok && param.Enabled {
		fo := toFloat64(param.Value, n.FillOpacity)
		if fo >= 0 && fo <= 1 && n.FillOpacity != fo {
			n.FillOpacity = fo
			changed = true
		}
	}
	if param, ok := p.Preset["strokeWidth"]; ok && param.Enabled {
		sw := toFloat64(param.Value, n.StrokeWidth)
		if sw >= 0 && n.StrokeWidth != sw {
			n.StrokeWidth = sw
			changed = true
		}
	}
	if param, ok := p.Preset["strokeStyle"]; ok && param.Enabled {
		st := toString(param.Value, n.StrokeStyle)
		if st != "" && n.StrokeStyle != st {
			n.StrokeStyle = st
			changed = true
		}
	}
	if param, ok := p.Preset["shape"]; ok && param.Enabled {
		sh := toString(param.Value, n.Shape)
		if sh != "" && n.Shape != sh {
			n.Shape = sh
			changed = true
		}
	}
	if param, ok := p.Preset["anim"]; ok && param.Enabled {
		an := toString(param.Value, n.Anim)
		if an != "" && (n.Anim != an || n.Animation != an) {
			n.Anim = an
			n.Animation = an
			changed = true
		}
	}

	return changed
}

// ExtractPresetFromNode copies node styling attributes into the preset values.
func (p *PresetConfig) ExtractPresetFromNode(n Node) {
	if p.Preset == nil {
		*p = DefaultPreset()
	}
	updateParam := func(key string, val any) {
		param := p.Preset[key]
		param.Value = val
		p.Preset[key] = param
	}

	if n.Width > 0 {
		updateParam("width", n.Width)
	}
	if n.Height > 0 {
		updateParam("height", n.Height)
	}
	fill := n.FillColor
	if fill == "" {
		fill = n.Fill
	}
	if fill != "" {
		updateParam("fillColor", fill)
	}
	stroke := n.StrokeColor
	if stroke == "" {
		stroke = n.Stroke
	}
	if stroke != "" {
		updateParam("strokeColor", stroke)
	}
	if n.TextColor != "" {
		updateParam("textColor", n.TextColor)
	}
	if n.FontSize > 0 {
		updateParam("fontSize", n.FontSize)
	}
	if n.FillOpacity > 0 {
		updateParam("fillOpacity", n.FillOpacity)
	}
	if n.StrokeWidth > 0 {
		updateParam("strokeWidth", n.StrokeWidth)
	}
	if n.StrokeStyle != "" {
		updateParam("strokeStyle", n.StrokeStyle)
	}
	if n.Shape != "" {
		updateParam("shape", n.Shape)
	}
	anim := n.Anim
	if anim == "" {
		anim = n.Animation
	}
	if anim != "" {
		updateParam("anim", anim)
	}
}
