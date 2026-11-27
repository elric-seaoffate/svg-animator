package scene

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
)

func toFloat(v any) (float64, bool) {
	switch val := v.(type) {
	case float64:
		return val, !math.IsNaN(val) && !math.IsInf(val, 0)
	case float32:
		f := float64(val)
		return f, !math.IsNaN(f) && !math.IsInf(f, 0)
	case int:
		return float64(val), true
	case int64:
		return float64(val), true
	case string:
		if f, err := strconv.ParseFloat(strings.TrimSpace(val), 64); err == nil && !math.IsNaN(f) {
			return f, true
		}
	}
	return 0, false
}

// ParseLineGapRatio parses a repeating pattern ratio such as "1:3" or "2:5".
// Defaults to (1, 3) if empty or malformed.
func ParseLineGapRatio(ratio string) (float64, float64) {
	trimmed := strings.TrimSpace(ratio)
	if trimmed == "" {
		return 1, 3
	}
	parts := strings.Split(trimmed, ":")
	if len(parts) != 2 {
		return 1, 3
	}
	l, err1 := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
	g, err2 := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
	if err1 != nil || err2 != nil || l <= 0 || g <= 0 || math.IsNaN(l) || math.IsNaN(g) {
		return 1, 3
	}
	return l, g
}

// ParseOscilloscopeSamples parses a comma- or whitespace-separated numeric string or JSON array string
// into a slice of 2 to 64 finite float64 samples.
func ParseOscilloscopeSamples(raw string) ([]float64, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, errors.New("oscilloscope-lite samples cannot be empty")
	}
	trimmed = strings.TrimPrefix(trimmed, "[")
	trimmed = strings.TrimSuffix(trimmed, "]")
	fields := strings.FieldsFunc(trimmed, func(r rune) bool {
		return r == ',' || r == ';' || r == ' ' || r == '\t' || r == '\n' || r == '\r'
	})
	if len(fields) < 2 || len(fields) > 64 {
		return nil, fmt.Errorf("oscilloscope-lite samples must contain between 2 and 64 numeric values (got %d)", len(fields))
	}
	out := make([]float64, 0, len(fields))
	for _, f := range fields {
		v, err := strconv.ParseFloat(strings.TrimSpace(f), 64)
		if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
			return nil, fmt.Errorf("invalid oscilloscope sample %q: must be a finite number", f)
		}
		out = append(out, v)
	}
	return out, nil
}

// ComputePerimeterDash calculates stroke-dasharray (dashLen, gapLen) in pathLength=1000 units
// so N segments are evenly distributed around the perimeter with the given line:gap ratio
// within each repeating segment pattern.
func ComputePerimeterDash(segments int, ratio string) (float64, float64) {
	if segments < 1 {
		segments = 1
	}
	if segments > 16 {
		segments = 16
	}
	l, g := ParseLineGapRatio(ratio)
	unit := 1000.0 / float64(segments)
	totalParts := l + g
	dashLen := math.Round((unit*(l/totalParts))*1000) / 1000
	gapLen := math.Round((unit-dashLen)*1000) / 1000
	return dashLen, gapLen
}

// ValidateLiteEffect validates operational bounds for Stage 16D Lite effects.
func ValidateLiteEffect(l *LiteEffect) error {
	if l == nil {
		return errors.New("nil lite effect")
	}
	switch l.Kind {
	case "perimeter-tracer", "pulse", "flash", "flow-lite", "radar-lite", "gauge-lite", "oscilloscope-lite", "text-lite":
	default:
		return fmt.Errorf("unsupported lite effect kind %q", l.Kind)
	}
	if l.Opacity < 0 || l.Opacity > 1.0 {
		return errors.New("opacity must be between 0.0 and 1.0")
	}
	if l.Rotation < -360 || l.Rotation > 360 {
		return errors.New("rotation must be between -360 and 360 degrees")
	}
	if l.Delay < 0 || l.Delay > 60 {
		return errors.New("delay must be between 0 and 60 seconds")
	}
	if l.Kind == "perimeter-tracer" {
		if l.Segments < 1 || l.Segments > 16 {
			return errors.New("perimeter-tracer segments must be between 1 and 16")
		}
		if l.Speed <= 0 {
			return errors.New("speed must be greater than 0")
		}
		if l.PlaybackMode != "" && l.PlaybackMode != "loop" && l.PlaybackMode != "pingpong" && l.PlaybackMode != "once" {
			return fmt.Errorf("unsupported perimeter-tracer playbackMode %q", l.PlaybackMode)
		}
		if l.BurstCycles < 0 || l.BurstCycles > 100 {
			return errors.New("burstCycles must be between 0 and 100")
		}
		if l.PauseSeconds < 0 || l.PauseSeconds > 300 {
			return errors.New("pauseSeconds must be between 0 and 300")
		}
		if l.PauseVisibility != "" && l.PauseVisibility != "hide" && l.PauseVisibility != "hold" {
			return fmt.Errorf("unsupported pauseVisibility %q", l.PauseVisibility)
		}
	}
	if l.Kind == "pulse" {
		if l.Period <= 0 {
			return errors.New("pulse period must be greater than 0")
		}
		if l.Intensity < 0 || l.Intensity > 1.0 {
			return errors.New("intensity must be between 0.0 and 1.0")
		}
		if l.MinScale < 0 || l.MaxScale < 0 || (l.MinScale > 0 && l.MaxScale > 0 && l.MinScale > l.MaxScale) {
			return errors.New("pulse minScale cannot exceed maxScale")
		}
	}
	if l.Kind == "flash" {
		if l.Duration <= 0 || l.Duration > 1.5 {
			return errors.New("flash duration must be between 0.01 and 1.5 seconds")
		}
		if l.Intensity < 0 || l.Intensity > 1.0 {
			return errors.New("intensity must be between 0.0 and 1.0")
		}
	}
	if l.Kind == "flow-lite" {
		if len(l.Points) < 2 {
			return errors.New("flow-lite requires at least 2 waypoints")
		}
		for _, b := range l.Bends {
			if b < -100 || b > 100 {
				return errors.New("flow-lite section bend must be between -100 and 100")
			}
		}
		if l.Curvature < -100 || l.Curvature > 100 {
			return errors.New("flow-lite curvature must be between -100 and 100")
		}
		if l.Variant != "" && l.Variant != "dashed" && l.Variant != "dotted" && l.Variant != "single" {
			return fmt.Errorf("unsupported flow-lite variant %q", l.Variant)
		}
		if l.DashLength < 2 || l.DashLength > 400 {
			return errors.New("flow-lite dashLength must be between 2 and 400")
		}
		if l.GapLength < 2 || l.GapLength > 300 {
			return errors.New("flow-lite gapLength must be between 2 and 300")
		}
		if l.DotSize < 1 || l.DotSize > 32 {
			return errors.New("flow-lite dotSize must be between 1 and 32")
		}
		if l.StrokeWidth < 0.5 || l.StrokeWidth > 24 {
			return errors.New("flow-lite strokeWidth must be between 0.5 and 24")
		}
		if l.StartMode != "" && l.StartMode != "tunnel" && l.StartMode != "abrupt" {
			return fmt.Errorf("unsupported flow-lite startMode %q", l.StartMode)
		}
		if l.EndMode != "" && l.EndMode != "tunnel" && l.EndMode != "abrupt" {
			return fmt.Errorf("unsupported flow-lite endMode %q", l.EndMode)
		}
		if l.Direction != "" && l.Direction != "forward" && l.Direction != "reverse" && l.Direction != "cw" && l.Direction != "ccw" {
			return fmt.Errorf("unsupported flow-lite direction %q", l.Direction)
		}
		if l.PlaybackMode != "" && l.PlaybackMode != "loop" && l.PlaybackMode != "pingpong" && l.PlaybackMode != "once" {
			return fmt.Errorf("unsupported flow-lite playbackMode %q", l.PlaybackMode)
		}
		if l.Speed < 0.2 || l.Speed > 30.0 {
			return errors.New("flow-lite cycle duration (speed) must be between 0.2 and 30.0 seconds")
		}
		if l.Delay < 0 || l.Delay > 60 {
			return errors.New("flow-lite delay must be between 0 and 60")
		}
		if l.EndDelay < 0 || l.EndDelay > 60 {
			return errors.New("flow-lite endDelay must be between 0 and 60")
		}
	}
	if l.Kind == "radar-lite" {
		if l.Variant != "" && l.Variant != "single" && l.Variant != "multi" && l.Variant != "fading-ping" {
			return fmt.Errorf("unsupported radar-lite variant %q", l.Variant)
		}
		if l.Rings < 1 || l.Rings > 6 {
			return errors.New("radar-lite rings must be between 1 and 6")
		}
		if l.MinScale < 0.05 || l.MinScale > 2.0 {
			return errors.New("radar-lite minScale must be between 0.05 and 2.0")
		}
		if l.MaxScale < 0.1 || l.MaxScale > 3.0 {
			return errors.New("radar-lite maxScale must be between 0.1 and 3.0")
		}
		if l.MinScale >= l.MaxScale {
			return errors.New("radar-lite minScale must be strictly less than maxScale")
		}
		if l.Period < 0.2 || l.Period > 30.0 {
			return errors.New("radar-lite cycle duration (period) must be between 0.2 and 30.0 seconds")
		}
		if l.StrokeWidth < 0.5 || l.StrokeWidth > 20.0 {
			return errors.New("radar-lite strokeWidth must be between 0.5 and 20.0")
		}
	}
	if l.Kind == "gauge-lite" {
		if l.Variant != "" && l.Variant != "ring" && l.Variant != "hbar" && l.Variant != "vbar" && l.Variant != "segmented" && l.Variant != "level" {
			return fmt.Errorf("unsupported gauge-lite variant %q", l.Variant)
		}
		if l.MinValue == nil || l.MaxValue == nil || math.IsNaN(*l.MinValue) || math.IsNaN(*l.MaxValue) {
			return errors.New("gauge-lite requires valid finite minValue and maxValue")
		}
		if *l.MaxValue <= *l.MinValue {
			return errors.New("gauge-lite maxValue must be strictly greater than minValue")
		}
		if l.Value == nil || math.IsNaN(*l.Value) || math.IsInf(*l.Value, 0) {
			return errors.New("gauge-lite requires a valid finite value")
		}
		if l.Variant == "segmented" && (l.Segments < 2 || l.Segments > 32) {
			return errors.New("gauge-lite segmented variant requires segments between 2 and 32")
		}
		if len(l.Thresholds) > 0 {
			if len(l.Thresholds) != 4 {
				return errors.New("gauge-lite thresholds must contain exactly 4 threshold bands")
			}
			for i, b := range l.Thresholds {
				if math.IsNaN(b.Value) || math.IsInf(b.Value, 0) {
					return fmt.Errorf("gauge-lite threshold band %d requires a finite numeric value", i+1)
				}
				if strings.TrimSpace(b.Color) == "" {
					return fmt.Errorf("gauge-lite threshold band %d requires a non-empty colour", i+1)
				}
			}
		} else if l.UseThresholds && l.WarnThreshold != nil && l.CritThreshold != nil {
			if *l.CritThreshold < *l.WarnThreshold {
				return errors.New("gauge-lite critThreshold cannot be less than warnThreshold")
			}
		}
		if l.StrokeWidth < 0.5 || l.StrokeWidth > 32.0 {
			return errors.New("gauge-lite strokeWidth must be between 0.5 and 32.0")
		}
		if l.Direction != "" && l.Direction != "cw" && l.Direction != "ccw" && l.Direction != "forward" && l.Direction != "reverse" {
			return fmt.Errorf("unsupported gauge-lite direction %q", l.Direction)
		}
	}
	if l.Kind == "oscilloscope-lite" {
		switch l.Variant {
		case "", "ecg", "sine", "square", "triangle", "sawtooth", "polyline", "bezier":
		default:
			return fmt.Errorf("unsupported oscilloscope-lite variant %q", l.Variant)
		}
		switch l.PlaybackMode {
		case "", "static", "animated", "sampled":
		default:
			return fmt.Errorf("unsupported oscilloscope-lite playbackMode %q (must be static, animated, or sampled)", l.PlaybackMode)
		}
		if l.Intensity < 0.05 || l.Intensity > 1.0 {
			return errors.New("oscilloscope-lite amplitude (intensity) must be between 0.05 and 1.0")
		}
		if l.Segments < 1 || l.Segments > 12 {
			return errors.New("oscilloscope-lite cycles (segments) must be between 1 and 12")
		}
		if l.StartOffset < 10 || l.StartOffset > 90 {
			return errors.New("oscilloscope-lite vertical baseline (startOffset) must be between 10 and 90 percent")
		}
		if l.Speed < 0.2 || l.Speed > 30.0 {
			return errors.New("oscilloscope-lite sweep cycle duration (speed) must be between 0.2 and 30.0 seconds")
		}
		if l.StrokeWidth < 0.5 || l.StrokeWidth > 16.0 {
			return errors.New("oscilloscope-lite strokeWidth must be between 0.5 and 16.0")
		}
		if l.Direction != "" && l.Direction != "forward" && l.Direction != "reverse" && l.Direction != "cw" && l.Direction != "ccw" {
			return fmt.Errorf("unsupported oscilloscope-lite direction %q", l.Direction)
		}
		if l.PlaybackMode == "sampled" || strings.TrimSpace(l.Samples) != "" {
			if _, err := ParseOscilloscopeSamples(l.Samples); err != nil {
				return err
			}
		}
	}
	if l.Kind == "text-lite" {
		switch l.Variant {
		case "", "none", "rect", "rounded", "pill", "curved":
		default:
			return fmt.Errorf("unsupported text-lite variant %q", l.Variant)
		}
		switch l.FontFamily {
		case "", "modern-sans", "humanist-sans", "geometric-sans", "formal-serif", "traditional-serif", "tech-mono", "condensed-display", "casual-lettering", "informal-hand", "classic-script":
		default:
			return fmt.Errorf("unsupported text-lite fontFamily %q", l.FontFamily)
		}
		if l.FontSize < 8.0 || l.FontSize > 120.0 {
			return errors.New("text-lite fontSize must be between 8.0 and 120.0")
		}
		switch l.FontWeight {
		case "", "400", "500", "600", "700":
		default:
			return fmt.Errorf("unsupported text-lite fontWeight %q", l.FontWeight)
		}
		if l.LetterSpacing < -2.0 || l.LetterSpacing > 20.0 {
			return errors.New("text-lite letterSpacing must be between -2.0 and 20.0")
		}
		switch l.TextAlign {
		case "", "left", "center", "right":
		default:
			return fmt.Errorf("unsupported text-lite textAlign %q", l.TextAlign)
		}
		switch l.VerticalAlign {
		case "", "top", "middle", "bottom":
		default:
			return fmt.Errorf("unsupported text-lite verticalAlign %q", l.VerticalAlign)
		}
		if l.Padding < 0 || l.Padding > 60.0 {
			return errors.New("text-lite padding must be between 0.0 and 60.0")
		}
		if l.StrokeWidth < 0 || l.StrokeWidth > 24.0 {
			return errors.New("text-lite strokeWidth must be between 0.0 and 24.0")
		}
		if l.BgOpacity != nil && (*l.BgOpacity < 0 || *l.BgOpacity > 1.0) {
			return errors.New("text-lite bgOpacity must be between 0.0 and 1.0")
		}
		if l.Curvature < -100 || l.Curvature > 100 {
			return errors.New("text-lite curvature must be between -100 and 100")
		}
		switch l.TextAnim {
		case "", "none", "ticker-h", "ticker-v", "stacked-v", "typewriter", "fade", "flash", "slide", "blur-in", "blur-out", "scramble", "overtype":
		default:
			return fmt.Errorf("unsupported text-lite textAnim %q", l.TextAnim)
		}
		if l.Variant == "curved" {
			switch l.TextAnim {
			case "ticker-h", "ticker-v", "stacked-v", "slide", "scramble", "overtype":
				return fmt.Errorf("text-lite curved variant does not support textAnim %q (allowed: none, fade, flash, typewriter, blur-in, blur-out)", l.TextAnim)
			}
		}
		if l.ScrollSpeed != 0 && (l.ScrollSpeed < 10.0 || l.ScrollSpeed > 600.0) {
			return errors.New("text-lite scrollSpeed must be between 10.0 and 600.0 px/s")
		}
		if l.LinesPerSec != 0 && (l.LinesPerSec < 0.1 || l.LinesPerSec > 20.0) {
			return errors.New("text-lite linesPerSec must be between 0.1 and 20.0 lines/s")
		}
		if l.LineSpacing != 0 && (l.LineSpacing < 0.8 || l.LineSpacing > 3.0) {
			return errors.New("text-lite lineSpacing must be between 0.8 and 3.0")
		}
		if l.TypeSpeed != 0 && (l.TypeSpeed < 1.0 || l.TypeSpeed > 120.0) {
			return errors.New("text-lite typeSpeed must be between 1.0 and 120.0 chars/s")
		}
		if l.HoldDelay < 0 || l.HoldDelay > 30.0 {
			return errors.New("text-lite holdDelay must be between 0.0 and 30.0 seconds")
		}
		if l.ClearDuration < 0 || l.ClearDuration > 30.0 {
			return errors.New("text-lite clearDuration must be between 0.0 and 30.0 seconds")
		}
		switch l.TypeMode {
		case "", "once", "hold", "delete", "delete-forward", "loop":
		default:
			return fmt.Errorf("unsupported text-lite typeMode %q", l.TypeMode)
		}
		switch l.PlaybackMode {
		case "", "loop", "once", "pingpong":
		default:
			return fmt.Errorf("unsupported text-lite playbackMode %q", l.PlaybackMode)
		}
	}
	return nil
}

// MigrateLegacyLiteEffect upgrades pre-amendment LiteEffect snapshots so center-based
// coordinates, pulse dimensions, and flash durations do not reposition or corrupt saved objects.
func MigrateLegacyLiteEffect(l *LiteEffect) {
	if l == nil {
		return
	}
	if l.OriginMode == "" {
		if l.Kind == "perimeter-tracer" {
			w := l.Width
			if w <= 0 {
				w = 140
			}
			h := l.Height
			if h <= 0 {
				h = 80
			}
			l.X = l.X + w/2.0
			l.Y = l.Y + h/2.0
		} else if l.Kind == "pulse" {
			r := l.Radius
			if r <= 0 {
				r = 28
			}
			if l.Width <= 0 || (l.Width == 140 && l.Height == 80) {
				l.Width = r * 2
				l.Height = r * 2
			}
		}
		l.OriginMode = "center"
	}
	applyLiteEffectDefaults(l)
}

func applyLiteEffectDefaults(l *LiteEffect) {
	if l.Kind == "" {
		l.Kind = "perimeter-tracer"
	}
	if l.OriginMode == "" {
		l.OriginMode = "center"
	}
	if l.Color == "" {
		switch l.Kind {
		case "flash":
			l.Color = "#f59e0b"
		case "pulse", "radar-lite":
			l.Color = "#22c55e"
		case "text-lite":
			l.Color = "#f8fafc"
		default:
			l.Color = "#38bdf8"
		}
	}
	if l.Opacity <= 0 {
		if l.Kind == "text-lite" || l.Kind == "gauge-lite" || l.Kind == "oscilloscope-lite" {
			l.Opacity = 1.0
		} else {
			l.Opacity = 0.9
		}
	}
	if l.StrokeWidth <= 0 && l.Kind != "text-lite" {
		if l.Kind == "radar-lite" {
			l.StrokeWidth = 2.0
		} else {
			l.StrokeWidth = 2.5
		}
	}
	if l.Radius <= 0 {
		l.Radius = 28
	}
	if l.Width <= 0 {
		if l.Kind == "pulse" || l.Kind == "flash" {
			l.Width = l.Radius * 2
		} else if l.Kind == "radar-lite" {
			l.Width = 80
		} else {
			l.Width = 140
		}
	}
	if l.Height <= 0 {
		if l.Kind == "pulse" || l.Kind == "flash" {
			l.Height = l.Radius * 2
		} else if l.Kind == "radar-lite" {
			l.Height = 80
		} else {
			l.Height = 80
		}
	}
	if l.X == 0 {
		l.X = 240
	}
	if l.Y == 0 {
		l.Y = 180
	}

	switch l.Kind {
	case "perimeter-tracer":
		if l.Variant == "" {
			l.Variant = "rounded"
		}
		if l.CornerRadius <= 0 {
			l.CornerRadius = 10
		}
		if l.Segments <= 0 {
			l.Segments = 2
		}
		if l.LineGapRatio == "" {
			l.LineGapRatio = "1:3"
		}
		if l.SegmentStyle == "" {
			l.SegmentStyle = "rounded"
		}
		if l.Direction == "" {
			l.Direction = "cw"
		}
		if l.PlaybackMode == "" {
			l.PlaybackMode = "loop"
		}
		if l.EntryExit == "" {
			l.EntryExit = "none"
		}
		if l.Speed <= 0 {
			l.Speed = 3.0 // 3.0s circuit duration
		}
		if l.ShowGuide == nil {
			sg := true
			l.ShowGuide = &sg
		}
		if l.PauseVisibility == "" {
			l.PauseVisibility = "hide"
		}
	case "pulse":
		if l.Variant == "" {
			l.Variant = "circle"
		}
		if l.Period <= 0 {
			l.Period = 1.8
		}
		if l.Intensity <= 0 {
			l.Intensity = 0.85
		}
		if l.MinScale <= 0 {
			l.MinScale = 0.85
		}
		if l.MaxScale <= 0 {
			l.MaxScale = 1.15
		}
		if l.ArmThickness <= 0 {
			l.ArmThickness = 3.0
		}
		if l.MaintainAspectRatio == nil {
			mar := true
			l.MaintainAspectRatio = &mar
		}
	case "flash":
		if l.Variant == "" {
			l.Variant = "diamond"
		}
		if l.Duration <= 0 {
			l.Duration = 0.10 // 100 ms default brief flash
		}
		if l.RepeatInterval <= 0 {
			l.RepeatInterval = 2.0 // 2.0s interval between flashes when Repeat=true
		}
		if l.Period <= 0 {
			l.Period = l.RepeatInterval
		}
		if l.ArmThickness <= 0 {
			l.ArmThickness = 3.0
		}
		if l.Intensity <= 0 {
			l.Intensity = 0.75 // avoid high-contrast jarring default
		}
	case "flow-lite":
		if l.Variant == "" {
			l.Variant = "dashed"
		}
		if len(l.Points) < 2 {
			l.Points = []geometry.Point{
				{X: 25, Y: 50},
				{X: 75, Y: 50},
			}
		}
		if len(l.Bends) != len(l.Points)-1 {
			newBends := make([]float64, len(l.Points)-1)
			for i := 0; i < len(newBends) && i < len(l.Bends); i++ {
				newBends[i] = l.Bends[i]
			}
			l.Bends = newBends
		}
		if l.DashLength <= 0 {
			if l.Variant == "single" {
				l.DashLength = 36
			} else {
				l.DashLength = 18
			}
		}
		if l.GapLength <= 0 {
			l.GapLength = 14
		}
		if l.DotSize <= 0 {
			l.DotSize = 5
		}
		if l.StrokeWidth <= 0 || l.StrokeWidth == 2.5 {
			l.StrokeWidth = 3.0
		}
		if l.SegmentStyle == "" {
			l.SegmentStyle = "rounded"
		}
		if l.StartMode == "" {
			l.StartMode = "tunnel"
		}
		if l.EndMode == "" {
			l.EndMode = "tunnel"
		}
		if l.Direction == "" || l.Direction == "cw" {
			l.Direction = "forward"
		} else if l.Direction == "ccw" {
			l.Direction = "reverse"
		}
		if l.PlaybackMode == "" {
			l.PlaybackMode = "loop"
		}
		if l.Speed <= 0 {
			l.Speed = 2.0
		} else if l.Speed > 30.0 {
			l.Speed = 30.0
		}
		if l.ShowGuide == nil {
			sg := true
			l.ShowGuide = &sg
		}
	case "radar-lite":
		if l.Variant == "" {
			l.Variant = "multi"
		}
		if l.Variant == "single" {
			l.Rings = 1
		} else if l.Rings <= 0 {
			l.Rings = 3
		} else if l.Rings > 6 {
			l.Rings = 6
		}
		if l.MinScale <= 0 {
			l.MinScale = 0.15
		}
		if l.MaxScale <= 0 {
			l.MaxScale = 1.0
		}
		if l.MinScale >= l.MaxScale {
			l.MinScale = math.Max(0.05, l.MaxScale*0.5)
		}
		if l.Period <= 0 {
			if l.Speed > 0 {
				l.Period = l.Speed
			} else {
				l.Period = 2.4
			}
		}
		if l.Speed <= 0 {
			l.Speed = l.Period
		}
		if l.StrokeWidth <= 0 || l.StrokeWidth == 2.5 {
			l.StrokeWidth = 2.0
		}
		if l.ShowGuide == nil {
			sg := true
			l.ShowGuide = &sg
		}
		if l.MaintainAspectRatio == nil {
			mar := true
			l.MaintainAspectRatio = &mar
		}
	case "gauge-lite":
		if l.Variant == "" {
			l.Variant = "ring"
		}
		if l.MinValue == nil {
			minV := 0.0
			l.MinValue = &minV
		}
		if l.MaxValue == nil {
			maxV := 100.0
			l.MaxValue = &maxV
		}
		if *l.MaxValue <= *l.MinValue {
			maxV := *l.MinValue + 100.0
			l.MaxValue = &maxV
		}
		if l.Value == nil {
			defV := *l.MinValue + (*l.MaxValue-*l.MinValue)*0.65
			l.Value = &defV
		}
		if l.BgColor == "" {
			l.BgColor = "#1e293b"
		}
		if l.WarnColor == "" {
			l.WarnColor = "#f59e0b"
		}
		if l.CritColor == "" {
			l.CritColor = "#ef4444"
		}
		if l.WarnThreshold == nil {
			wt := *l.MinValue + (*l.MaxValue-*l.MinValue)*0.70
			l.WarnThreshold = &wt
		}
		if l.CritThreshold == nil {
			ct := *l.MinValue + (*l.MaxValue-*l.MinValue)*0.90
			l.CritThreshold = &ct
		}
		if *l.CritThreshold < *l.WarnThreshold {
			ct := *l.WarnThreshold
			l.CritThreshold = &ct
		}
		if len(l.Thresholds) != 4 {
			span := *l.MaxValue - *l.MinValue
			t1Val := math.Round((*l.MinValue+span*0.40)*100) / 100
			t2Val := math.Round((*l.MinValue+span*0.60)*100) / 100
			t3Val := *l.WarnThreshold
			t4Val := *l.CritThreshold
			l.Thresholds = []GaugeThresholdBand{
				{Enabled: false, Value: t1Val, Color: "#22c55e"},
				{Enabled: false, Value: t2Val, Color: "#eab308"},
				{Enabled: l.UseThresholds, Value: t3Val, Color: l.WarnColor},
				{Enabled: l.UseThresholds, Value: t4Val, Color: l.CritColor},
			}
		} else {
			defCols := []string{"#22c55e", "#eab308", l.WarnColor, l.CritColor}
			anyEnabled := false
			for i := 0; i < 4; i++ {
				if strings.TrimSpace(l.Thresholds[i].Color) == "" {
					l.Thresholds[i].Color = defCols[i]
				}
				if l.Thresholds[i].Enabled {
					anyEnabled = true
				}
			}
			l.UseThresholds = anyEnabled
			wt := l.Thresholds[2].Value
			ct := l.Thresholds[3].Value
			l.WarnThreshold = &wt
			l.WarnColor = l.Thresholds[2].Color
			l.CritThreshold = &ct
			l.CritColor = l.Thresholds[3].Color
		}
		if l.Segments <= 0 {
			l.Segments = 10
		} else if l.Segments < 2 {
			l.Segments = 2
		} else if l.Segments > 32 {
			l.Segments = 32
		}
		if l.Direction == "" {
			l.Direction = "forward"
		}
		if l.ShowGuide == nil {
			sg := true
			l.ShowGuide = &sg
		}
		if l.StrokeWidth <= 0 || l.StrokeWidth == 2.5 {
			if l.Variant == "ring" {
				l.StrokeWidth = 8.0
			} else {
				l.StrokeWidth = 2.0
			}
		}
		if l.Width == 140 && l.Height == 80 {
			switch l.Variant {
			case "ring":
				l.Width = 96
				l.Height = 96
			case "hbar", "segmented":
				l.Width = 160
				l.Height = 32
			case "vbar":
				l.Width = 36
				l.Height = 140
			case "level":
				l.Width = 84
				l.Height = 120
			}
		}
	case "oscilloscope-lite":
		if l.Variant == "" {
			l.Variant = "ecg"
		}
		if l.PlaybackMode == "" || l.PlaybackMode == "loop" || l.PlaybackMode == "pingpong" || l.PlaybackMode == "once" {
			l.PlaybackMode = "animated"
		}
		if l.BgColor == "" {
			l.BgColor = "#0b1322"
		}
		if l.Intensity <= 0 {
			l.Intensity = 0.75
		} else if l.Intensity < 0.05 {
			l.Intensity = 0.05
		} else if l.Intensity > 1.0 {
			l.Intensity = 1.0
		}
		if l.Segments <= 0 {
			l.Segments = 2
		} else if l.Segments > 12 {
			l.Segments = 12
		}
		if l.StartOffset <= 0 {
			l.StartOffset = 50
		} else if l.StartOffset < 10 {
			l.StartOffset = 10
		} else if l.StartOffset > 90 {
			l.StartOffset = 90
		}
		if l.Speed <= 0 {
			l.Speed = 2.4
		} else if l.Speed < 0.2 {
			l.Speed = 0.2
		} else if l.Speed > 30.0 {
			l.Speed = 30.0
		}
		if l.Period <= 0 {
			l.Period = l.Speed
		}
		if l.Direction == "" || l.Direction == "cw" {
			l.Direction = "forward"
		} else if l.Direction == "ccw" {
			l.Direction = "reverse"
		}
		if l.StrokeWidth <= 0 || l.StrokeWidth == 2.5 {
			l.StrokeWidth = 2.2
		}
		if l.ShowGuide == nil {
			sg := true
			l.ShowGuide = &sg
		}
		if l.MaintainAspectRatio == nil {
			mar := false
			l.MaintainAspectRatio = &mar
		}
		if strings.TrimSpace(l.Samples) == "" {
			l.Samples = "0, 0.4, 0.9, 0.3, -0.5, -0.9, -0.2, 0.6, 1.0, 0.2, -0.4, 0"
		}
		if l.Width == 140 && l.Height == 80 {
			l.Width = 180
			l.Height = 76
		}
	case "text-lite":
		if l.Variant == "" {
			l.Variant = "rounded"
		}
		if l.Width <= 0 || (l.Width == 140 && l.Height == 80) {
			l.Width = 220
			l.Height = 56
		}
		if l.BgColor == "" {
			l.BgColor = "#0f172a"
		}
		if l.BorderColor == "" {
			l.BorderColor = "#38bdf8"
		}
		if l.BgOpacity == nil {
			bgo := 0.85
			if l.Variant == "none" || l.Variant == "curved" {
				bgo = 0.0
			}
			l.BgOpacity = &bgo
		} else if *l.BgOpacity < 0 {
			bgo := 0.0
			l.BgOpacity = &bgo
		} else if *l.BgOpacity > 1.0 {
			bgo := 1.0
			l.BgOpacity = &bgo
		}
		if l.StrokeWidth < 0 {
			l.StrokeWidth = 0
		} else if l.StrokeWidth == 0 && l.Variant != "none" && l.Variant != "curved" {
			// Leave explicit 0 border valid when patched; set 1.5 default on fresh creation in JS/CreateLiteEffect
		} else if l.StrokeWidth > 24.0 {
			l.StrokeWidth = 24.0
		}
		if l.CornerRadius < 0 {
			l.CornerRadius = 0
		} else if l.CornerRadius == 0 && l.Variant == "rounded" {
			l.CornerRadius = 8
		}
		if l.FontFamily == "" {
			l.FontFamily = "modern-sans"
		}
		if l.FontSize <= 0 {
			l.FontSize = 18.0
		} else if l.FontSize < 8.0 {
			l.FontSize = 8.0
		} else if l.FontSize > 120.0 {
			l.FontSize = 120.0
		}
		if l.FontWeight == "" {
			l.FontWeight = "600"
		}
		if l.LetterSpacing < -2.0 {
			l.LetterSpacing = -2.0
		} else if l.LetterSpacing > 20.0 {
			l.LetterSpacing = 20.0
		}
		if l.TextAlign == "" {
			l.TextAlign = "center"
		}
		if l.VerticalAlign == "" {
			l.VerticalAlign = "middle"
		}
		if l.Padding < 0 {
			l.Padding = 0
		} else if l.Padding > 60.0 {
			l.Padding = 60.0
		}
		if l.TextAnim == "" {
			l.TextAnim = "none"
		} else if l.TextAnim == "overtype" {
			// Legacy migration: Overtype was removed from new selection in Stage 16D-C corrections; map to typewriter
			l.TextAnim = "typewriter"
		}
		if l.Variant == "curved" {
			switch l.TextAnim {
			case "ticker-h", "ticker-v", "stacked-v", "slide", "scramble", "overtype":
				l.TextAnim = "none"
			}
			if l.StartOffset <= 0 {
				l.StartOffset = 50
			}
		}
		if l.ScrollSpeed <= 0 {
			l.ScrollSpeed = 90.0
		} else if l.ScrollSpeed < 10.0 {
			l.ScrollSpeed = 10.0
		} else if l.ScrollSpeed > 600.0 {
			l.ScrollSpeed = 600.0
		}
		if l.LinesPerSec <= 0 {
			l.LinesPerSec = 1.2
		} else if l.LinesPerSec < 0.1 {
			l.LinesPerSec = 0.1
		} else if l.LinesPerSec > 20.0 {
			l.LinesPerSec = 20.0
		}
		if l.LineSpacing <= 0 {
			l.LineSpacing = 1.25
		} else if l.LineSpacing < 0.8 {
			l.LineSpacing = 0.8
		} else if l.LineSpacing > 3.0 {
			l.LineSpacing = 3.0
		}
		if l.WordWrap == nil {
			ww := true
			l.WordWrap = &ww
		}
		if l.TypeSpeed <= 0 {
			l.TypeSpeed = 14.0
		} else if l.TypeSpeed < 1.0 {
			l.TypeSpeed = 1.0
		} else if l.TypeSpeed > 120.0 {
			l.TypeSpeed = 120.0
		}
		if l.HoldDelay < 0 {
			l.HoldDelay = 0
		} else if l.HoldDelay > 30.0 {
			l.HoldDelay = 30.0
		}
		if l.ClearDuration < 0 {
			l.ClearDuration = 0
		} else if l.ClearDuration > 30.0 {
			l.ClearDuration = 30.0
		}
		if l.LockOnOff == nil {
			lok := false
			l.LockOnOff = &lok
		} else if *l.LockOnOff && l.TextAnim == "flash" {
			l.ClearDuration = l.HoldDelay
		}
		if l.TypeMode == "" {
			l.TypeMode = "hold"
		} else if l.TypeMode == "loop" {
			// Legacy migration: old "loop" preset maps to "delete" with TypeRepeat=true
			l.TypeMode = "delete"
			tr := true
			l.TypeRepeat = &tr
		}
		if l.TypeRepeat == nil {
			tr := l.TypeMode == "delete" || l.TypeMode == "delete-forward"
			l.TypeRepeat = &tr
		}
		if l.PlaybackMode == "" || (l.PlaybackMode != "loop" && l.PlaybackMode != "once" && l.PlaybackMode != "pingpong") {
			l.PlaybackMode = "loop"
		}
		if l.Speed < 0 {
			l.Speed = 0
		} else if l.Speed == 0 && l.TextAnim != "flash" {
			l.Speed = 0.8
		} else if l.Speed > 30.0 {
			l.Speed = 30.0
		}
		if l.Period <= 0 {
			l.Period = l.Speed
		}
		if l.Direction == "" || l.Direction == "cw" {
			l.Direction = "forward"
		} else if l.Direction == "ccw" {
			l.Direction = "reverse"
		}
		if l.ShowGuide == nil {
			sg := false
			l.ShowGuide = &sg
		}
		if l.MaintainAspectRatio == nil {
			mar := false
			l.MaintainAspectRatio = &mar
		}
	}
}

// CreateLiteEffect adds a new LiteEffect to the scene with authoritative defaults and identity.
func (s *Scene) CreateLiteEffect(initial LiteEffect) LiteEffect {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.liteEffectsCounter++
	if initial.ID == "" {
		initial.ID = StringID(strconv.FormatInt(s.liteEffectsCounter, 10))
	} else if idNum, err := strconv.ParseInt(string(initial.ID), 10, 64); err == nil && idNum > s.liteEffectsCounter {
		s.liteEffectsCounter = idNum
	}

	applyLiteEffectDefaults(&initial)
	if initial.Visible == nil {
		v := true
		initial.Visible = &v
	}

	s.liteEffects[initial.ID] = initial
	s.liteEffectOrder = append(s.liteEffectOrder, initial.ID)
	s.layers = append(s.layers, LayerEntry{Type: SelectionLite, ID: initial.ID})
	s.revision++
	return initial
}

// UpdateLiteEffect modifies an existing LiteEffect.
func (s *Scene) UpdateLiteEffect(id StringID, patch map[string]any) (LiteEffect, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, ok := s.liteEffects[id]
	if !ok {
		return LiteEffect{}, fmt.Errorf("lite effect not found: %s", id)
	}

	oldName := existing.Name
	nameChanged := false
	if v, ok := patch["name"].(string); ok {
		trimmed := strings.TrimSpace(v)
		if trimmed != existing.Name {
			existing.Name = trimmed
			nameChanged = true
		}
	}
	if v, ok := patch["kind"].(string); ok && v != "" {
		existing.Kind = v
	}
	if v, ok := patch["variant"].(string); ok && v != "" {
		existing.Variant = v
	}
	if v, ok := patch["targetId"].(string); ok {
		existing.TargetID = v
	}
	if v, ok := toFloat(patch["x"]); ok {
		existing.X = v
	}
	if v, ok := toFloat(patch["y"]); ok {
		existing.Y = v
	}
	if v, ok := toFloat(patch["width"]); ok && v > 0 {
		existing.Width = v
	}
	if v, ok := toFloat(patch["height"]); ok && v > 0 {
		existing.Height = v
	}
	if v, ok := toFloat(patch["radius"]); ok && v > 0 {
		existing.Radius = v
	}
	if v, ok := toFloat(patch["cornerRadius"]); ok && v >= 0 {
		existing.CornerRadius = v
	}
	if v, ok := toFloat(patch["rotation"]); ok {
		existing.Rotation = math.Max(-360, math.Min(360, v))
	}
	if v, ok := patch["color"].(string); ok && v != "" {
		existing.Color = v
	}
	if v, ok := toFloat(patch["opacity"]); ok {
		existing.Opacity = math.Max(0, math.Min(1, v))
	}
	if v, ok := toFloat(patch["strokeWidth"]); ok {
		if existing.Kind == "text-lite" && v >= 0 {
			existing.StrokeWidth = math.Max(0, math.Min(24.0, v))
		} else if v > 0 {
			existing.StrokeWidth = v
		}
	}
	if v, ok := toFloat(patch["segments"]); ok && v >= 1 {
		existing.Segments = int(math.Round(v))
	}
	if v, ok := toFloat(patch["rings"]); ok && v >= 1 {
		existing.Rings = int(math.Max(1, math.Min(6, math.Round(v))))
	}
	if existing.Kind == "radar-lite" && existing.Variant == "single" {
		existing.Rings = 1
	} else if existing.Kind == "radar-lite" && (existing.Variant == "multi" || existing.Variant == "fading-ping") && existing.Rings < 1 {
		existing.Rings = 3
	}
	if v, ok := patch["lineGapRatio"].(string); ok && v != "" {
		existing.LineGapRatio = v
	}
	if v, ok := patch["segmentStyle"].(string); ok && v != "" {
		existing.SegmentStyle = v
	}
	if v, ok := toFloat(patch["startOffset"]); ok {
		existing.StartOffset = v
	}
	if v, ok := patch["direction"].(string); ok && (v == "cw" || v == "ccw" || v == "forward" || v == "reverse") {
		existing.Direction = v
	}
	if v, ok := patch["playbackMode"].(string); ok && (v == "loop" || v == "pingpong" || v == "once" || v == "static" || v == "animated" || v == "sampled") {
		existing.PlaybackMode = v
	}
	if v, ok := patch["entryExit"].(string); ok && (v == "none" || v == "fade" || v == "grow" || v == "fade-grow") {
		existing.EntryExit = v
	}
	if v, ok := toFloat(patch["burstCycles"]); ok {
		existing.BurstCycles = int(math.Max(0, math.Min(100, math.Round(v))))
	}
	if v, ok := toFloat(patch["pauseSeconds"]); ok {
		existing.PauseSeconds = math.Max(0, math.Min(300, v))
	}
	if v, ok := patch["pauseVisibility"].(string); ok && (v == "hide" || v == "hold") {
		existing.PauseVisibility = v
	}
	if v, ok := toFloat(patch["armThickness"]); ok && v > 0 {
		existing.ArmThickness = math.Max(1, math.Min(20, v))
	}
	if v, ok := toFloat(patch["repeatInterval"]); ok && v > 0 {
		existing.RepeatInterval = math.Max(0.2, math.Min(60, v))
	}
	if v, ok := toFloat(patch["speed"]); ok {
		if existing.Kind == "flow-lite" || existing.Kind == "oscilloscope-lite" {
			if v > 0 {
				existing.Speed = math.Max(0.2, math.Min(30.0, v))
				if existing.Kind == "oscilloscope-lite" {
					existing.Period = existing.Speed
				}
			}
		} else if existing.Kind == "text-lite" {
			if existing.TextAnim == "flash" {
				existing.Speed = math.Max(0.0, math.Min(10.0, v))
			} else {
				existing.Speed = math.Max(0.05, math.Min(30.0, v))
			}
		} else if v > 0 {
			existing.Speed = v
		}
	}
	if v, ok := toFloat(patch["period"]); ok && v > 0 {
		if existing.Kind == "radar-lite" {
			existing.Period = math.Max(0.2, math.Min(30.0, v))
			existing.Speed = existing.Period
		} else {
			existing.Period = v
		}
	}
	if v, ok := toFloat(patch["dur"]); ok && v > 0 {
		existing.Duration = v
	}
	if v, ok := toFloat(patch["duration"]); ok && v > 0 {
		existing.Duration = v
	}
	if v, ok := toFloat(patch["durationMs"]); ok && v > 0 {
		existing.Duration = v / 1000.0
	}
	if v, ok := toFloat(patch["intensity"]); ok {
		existing.Intensity = math.Max(0, math.Min(1, v))
	}
	if v, ok := toFloat(patch["minScale"]); ok && v > 0 {
		minBound := 0.1
		if existing.Kind == "radar-lite" {
			minBound = 0.05
		}
		existing.MinScale = math.Max(minBound, math.Min(3.0, v))
	}
	if v, ok := toFloat(patch["maxScale"]); ok && v > 0 {
		existing.MaxScale = math.Max(0.1, math.Min(4.0, v))
	}
	if existing.Kind == "radar-lite" && existing.MinScale >= existing.MaxScale {
		if _, hasMin := patch["minScale"]; hasMin {
			existing.MaxScale = math.Min(3.0, existing.MinScale+0.1)
		} else {
			existing.MinScale = math.Max(0.05, existing.MaxScale-0.1)
		}
	}
	if v, ok := patch["originMode"].(string); ok && v != "" {
		existing.OriginMode = v
	}
	if v, ok := patch["maintainAspectRatio"].(bool); ok {
		existing.MaintainAspectRatio = &v
	}
	if v, ok := patch["showGuide"].(bool); ok {
		existing.ShowGuide = &v
	}
	if v, ok := patch["repeat"].(bool); ok {
		existing.Repeat = v
	}
	if v, ok := toFloat(patch["triggerNonce"]); ok {
		existing.TriggerNonce = int64(v)
	}
	if v, ok := patch["visible"].(bool); ok {
		existing.Visible = &v
	}
	if v, ok := patch["locked"].(bool); ok {
		existing.Locked = v
	}
	if rawPts, ok := patch["points"]; ok {
		var parsedPts []geometry.Point
		switch pts := rawPts.(type) {
		case []geometry.Point:
			parsedPts = append(parsedPts, pts...)
		case []any:
			for _, item := range pts {
				if m, ok := item.(map[string]any); ok {
					x, okX := toFloat(m["x"])
					y, okY := toFloat(m["y"])
					if okX && okY {
						parsedPts = append(parsedPts, geometry.Point{X: x, Y: y})
					}
				}
			}
		}
		if len(parsedPts) >= 2 {
			existing.Points = parsedPts
			if len(existing.Bends) != len(existing.Points)-1 {
				newBends := make([]float64, len(existing.Points)-1)
				for i := 0; i < len(newBends) && i < len(existing.Bends); i++ {
					newBends[i] = existing.Bends[i]
				}
				existing.Bends = newBends
			}
		}
	}
	if rawBends, ok := patch["bends"]; ok {
		var parsedBends []float64
		switch bs := rawBends.(type) {
		case []float64:
			parsedBends = append(parsedBends, bs...)
		case []any:
			for _, item := range bs {
				if f, ok := toFloat(item); ok {
					parsedBends = append(parsedBends, math.Max(-100, math.Min(100, f)))
				}
			}
		}
		if len(existing.Points) >= 2 {
			newBends := make([]float64, len(existing.Points)-1)
			for i := 0; i < len(newBends) && i < len(parsedBends); i++ {
				newBends[i] = math.Max(-100, math.Min(100, parsedBends[i]))
			}
			existing.Bends = newBends
		} else {
			existing.Bends = parsedBends
		}
	}
	if v, ok := toFloat(patch["curvature"]); ok {
		existing.Curvature = math.Max(-100, math.Min(100, v))
	}
	if v, ok := toFloat(patch["dashLength"]); ok && v > 0 {
		existing.DashLength = math.Max(2, math.Min(400, v))
	}
	if v, ok := toFloat(patch["gapLength"]); ok && v > 0 {
		existing.GapLength = math.Max(2, math.Min(300, v))
	}
	if v, ok := toFloat(patch["dotSize"]); ok && v > 0 {
		existing.DotSize = math.Max(1, math.Min(32, v))
	}
	if v, ok := patch["startMode"].(string); ok && (v == "tunnel" || v == "abrupt") {
		existing.StartMode = v
	}
	if v, ok := patch["endMode"].(string); ok && (v == "tunnel" || v == "abrupt") {
		existing.EndMode = v
	}
	if v, ok := toFloat(patch["delay"]); ok {
		existing.Delay = math.Max(0, math.Min(60, v))
	}
	if v, ok := toFloat(patch["endDelay"]); ok {
		existing.EndDelay = math.Max(0, math.Min(60, v))
	}
	if v, ok := toFloat(patch["value"]); ok {
		val := v
		existing.Value = &val
	}
	if v, ok := toFloat(patch["minValue"]); ok {
		minV := v
		existing.MinValue = &minV
	}
	if v, ok := toFloat(patch["maxValue"]); ok {
		maxV := v
		existing.MaxValue = &maxV
	}
	if existing.Kind == "gauge-lite" && existing.MinValue != nil && existing.MaxValue != nil && *existing.MaxValue <= *existing.MinValue {
		if _, hasMin := patch["minValue"]; hasMin && patch["maxValue"] == nil {
			maxV := *existing.MinValue + 1.0
			existing.MaxValue = &maxV
		} else if _, hasMax := patch["maxValue"]; hasMax && patch["minValue"] == nil {
			minV := *existing.MaxValue - 1.0
			existing.MinValue = &minV
		}
	}
	if v, ok := patch["bgColor"].(string); ok && v != "" {
		existing.BgColor = v
	}
	if existing.Kind == "gauge-lite" && len(existing.Thresholds) != 4 {
		applyLiteEffectDefaults(&existing)
	}
	if v, ok := patch["useThresholds"].(bool); ok {
		existing.UseThresholds = v
		if existing.Kind == "gauge-lite" && len(existing.Thresholds) == 4 && patch["thresholds"] == nil {
			if !v {
				for i := range existing.Thresholds {
					existing.Thresholds[i].Enabled = false
				}
			} else {
				anyEn := false
				for _, b := range existing.Thresholds {
					if b.Enabled {
						anyEn = true
						break
					}
				}
				if !anyEn {
					existing.Thresholds[2].Enabled = true
					existing.Thresholds[3].Enabled = true
				}
			}
		}
	}
	if v, ok := toFloat(patch["warnThreshold"]); ok {
		wt := v
		existing.WarnThreshold = &wt
		if existing.Kind == "gauge-lite" && len(existing.Thresholds) == 4 {
			existing.Thresholds[2].Value = wt
		}
	}
	if v, ok := patch["warnColor"].(string); ok && v != "" {
		existing.WarnColor = v
		if existing.Kind == "gauge-lite" && len(existing.Thresholds) == 4 {
			existing.Thresholds[2].Color = v
		}
	}
	if v, ok := toFloat(patch["critThreshold"]); ok {
		ct := v
		existing.CritThreshold = &ct
		if existing.Kind == "gauge-lite" && len(existing.Thresholds) == 4 {
			existing.Thresholds[3].Value = ct
		}
	}
	if v, ok := patch["critColor"].(string); ok && v != "" {
		existing.CritColor = v
		if existing.Kind == "gauge-lite" && len(existing.Thresholds) == 4 {
			existing.Thresholds[3].Color = v
		}
	}
	if rawThresh, ok := patch["thresholds"]; ok && existing.Kind == "gauge-lite" {
		var parsedBands []GaugeThresholdBand
		switch tb := rawThresh.(type) {
		case []GaugeThresholdBand:
			parsedBands = append(parsedBands, tb...)
		case []any:
			for _, item := range tb {
				if m, ok := item.(map[string]any); ok {
					en, _ := m["enabled"].(bool)
					val, okVal := toFloat(m["value"])
					if !okVal {
						val = 0
					}
					col, _ := m["color"].(string)
					if strings.TrimSpace(col) == "" {
						col = "#f59e0b"
					}
					parsedBands = append(parsedBands, GaugeThresholdBand{
						Enabled: en,
						Value:   val,
						Color:   col,
					})
				}
			}
		}
		if len(parsedBands) == 4 {
			existing.Thresholds = parsedBands
		}
	}
	for idx := 0; idx < 4; idx++ {
		nStr := strconv.Itoa(idx + 1)
		if en, ok := patch["threshold"+nStr+"Enabled"].(bool); ok && len(existing.Thresholds) == 4 {
			existing.Thresholds[idx].Enabled = en
		}
		if val, ok := toFloat(patch["threshold"+nStr+"Value"]); ok && len(existing.Thresholds) == 4 {
			existing.Thresholds[idx].Value = val
		}
		if col, ok := patch["threshold"+nStr+"Color"].(string); ok && strings.TrimSpace(col) != "" && len(existing.Thresholds) == 4 {
			existing.Thresholds[idx].Color = strings.TrimSpace(col)
		}
	}
	if existing.Kind == "gauge-lite" && existing.WarnThreshold != nil && existing.CritThreshold != nil && *existing.CritThreshold < *existing.WarnThreshold {
		if _, hasWarn := patch["warnThreshold"]; hasWarn && patch["critThreshold"] == nil {
			ct := *existing.WarnThreshold
			existing.CritThreshold = &ct
			if len(existing.Thresholds) == 4 {
				existing.Thresholds[3].Value = ct
			}
		} else if _, hasCrit := patch["critThreshold"]; hasCrit && patch["warnThreshold"] == nil {
			wt := *existing.CritThreshold
			existing.WarnThreshold = &wt
			if len(existing.Thresholds) == 4 {
				existing.Thresholds[2].Value = wt
			}
		}
	}
	if v, ok := patch["unit"].(string); ok {
		existing.Unit = strings.TrimSpace(v)
	}
	if v, ok := patch["labelText"].(string); ok {
		if existing.Kind == "text-lite" {
			existing.LabelText = v
		} else {
			existing.LabelText = strings.TrimSpace(v)
		}
	}
	if v, ok := patch["text"].(string); ok && existing.Kind == "text-lite" {
		existing.LabelText = v
	}
	if v, ok := patch["samples"].(string); ok {
		existing.Samples = strings.TrimSpace(v)
	}
	if v, ok := toFloat(patch["bgOpacity"]); ok {
		bgo := math.Max(0, math.Min(1.0, v))
		existing.BgOpacity = &bgo
	}
	if v, ok := patch["borderColor"].(string); ok && v != "" {
		existing.BorderColor = v
	}
	if v, ok := patch["fontFamily"].(string); ok && v != "" {
		existing.FontFamily = v
	}
	if v, ok := toFloat(patch["fontSize"]); ok && v > 0 {
		existing.FontSize = math.Max(8.0, math.Min(120.0, v))
	}
	if v, ok := patch["fontWeight"].(string); ok && v != "" {
		existing.FontWeight = v
	}
	if v, ok := toFloat(patch["letterSpacing"]); ok {
		existing.LetterSpacing = math.Max(-2.0, math.Min(20.0, v))
	}
	if v, ok := patch["textAlign"].(string); ok && v != "" {
		existing.TextAlign = v
	}
	if v, ok := patch["verticalAlign"].(string); ok && v != "" {
		existing.VerticalAlign = v
	}
	if v, ok := toFloat(patch["padding"]); ok {
		existing.Padding = math.Max(0, math.Min(60.0, v))
	}
	if v, ok := patch["textAnim"].(string); ok && v != "" {
		if v == "overtype" {
			existing.TextAnim = "typewriter"
		} else {
			existing.TextAnim = v
		}
	}
	if v, ok := toFloat(patch["scrollSpeed"]); ok && v > 0 {
		existing.ScrollSpeed = math.Max(10.0, math.Min(600.0, v))
	}
	if v, ok := toFloat(patch["linesPerSec"]); ok && v > 0 {
		existing.LinesPerSec = math.Max(0.1, math.Min(20.0, v))
	}
	if v, ok := toFloat(patch["lineSpacing"]); ok && v > 0 {
		existing.LineSpacing = math.Max(0.8, math.Min(3.0, v))
	}
	if v, ok := patch["wordWrap"].(bool); ok {
		existing.WordWrap = &v
	}
	if v, ok := toFloat(patch["typeSpeed"]); ok && v > 0 {
		existing.TypeSpeed = math.Max(1.0, math.Min(120.0, v))
	}
	if v, ok := toFloat(patch["holdDelay"]); ok {
		existing.HoldDelay = math.Max(0.0, math.Min(30.0, v))
		if existing.Kind == "text-lite" && existing.LockOnOff != nil && *existing.LockOnOff {
			existing.ClearDuration = existing.HoldDelay
		}
	}
	if v, ok := toFloat(patch["clearDuration"]); ok {
		existing.ClearDuration = math.Max(0.0, math.Min(30.0, v))
		if existing.Kind == "text-lite" && existing.LockOnOff != nil && *existing.LockOnOff {
			existing.HoldDelay = existing.ClearDuration
		}
	}
	if v, ok := patch["lockOnOff"].(bool); ok {
		existing.LockOnOff = &v
		if v {
			existing.ClearDuration = existing.HoldDelay
		}
	}
	if v, ok := patch["typeMode"].(string); ok && v != "" {
		if v == "loop" {
			existing.TypeMode = "delete"
			tr := true
			existing.TypeRepeat = &tr
		} else {
			existing.TypeMode = v
		}
	}
	if v, ok := patch["typeRepeat"].(bool); ok {
		existing.TypeRepeat = &v
	}
	if v, ok := patch["play"].(bool); ok {
		existing.Play = &v
	}
	if existing.Kind == "gauge-lite" || existing.Kind == "oscilloscope-lite" || existing.Kind == "text-lite" {
		applyLiteEffectDefaults(&existing)
	}

	if err := ValidateLiteEffect(&existing); err != nil {
		return LiteEffect{}, err
	}

	s.liteEffects[id] = existing
	if nameChanged {
		targetID := "lite-" + string(id)
		targetName := existing.Name
		if targetName == "" {
			targetName = targetID
		}
		for i := range s.parameters {
			p := &s.parameters[i]
			if p.Target == string(id) || p.Target == targetID || (oldName != "" && p.Target == oldName) {
				p.Name = GenerateParameterName(targetName, p.Property, "lite")
			}
		}
	}
	s.revision++
	return existing, nil
}

func (s *Scene) removeLiteEffectLocked(id StringID) bool {
	if _, ok := s.liteEffects[id]; !ok {
		return false
	}
	delete(s.liteEffects, id)
	for i, oid := range s.liteEffectOrder {
		if oid == id {
			s.liteEffectOrder = append(s.liteEffectOrder[:i], s.liteEffectOrder[i+1:]...)
			break
		}
	}
	s.pruneSelectionLocked(SelectionLite, id)
	s.pruneGroupMembersLocked(SelectionLite, id)
	s.removeLayerEntryLocked(SelectionLite, id)
	s.pruneParametersForTargetLocked("lite-" + string(id))
	s.pruneParametersForTargetLocked(string(id))
	return true
}

// DeleteLiteEffect removes a LiteEffect from the scene.
func (s *Scene) DeleteLiteEffect(id StringID) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.removeLiteEffectLocked(id) {
		return false
	}
	s.revision++
	return true
}

// GetLiteEffect returns a single LiteEffect by ID.
func (s *Scene) GetLiteEffect(id StringID) (LiteEffect, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	l, ok := s.liteEffects[id]
	return l, ok
}

// GetLiteEffects returns all LiteEffects in creation/order sequence.
func (s *Scene) GetLiteEffects() []LiteEffect {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]LiteEffect, 0, len(s.liteEffectOrder))
	for _, id := range s.liteEffectOrder {
		if l, ok := s.liteEffects[id]; ok {
			out = append(out, l)
		}
	}
	return out
}
