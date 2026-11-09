package scene

import (
	"encoding/json"
	"strings"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
)

// StringID is a string identifier that can unmarshal from either a JSON string or JSON number.
type StringID string

// UnmarshalJSON deserializes a JSON number or string into a StringID, preserving exact string representations.
func (s *StringID) UnmarshalJSON(b []byte) error {
	trimmed := strings.TrimSpace(string(b))
	if len(trimmed) == 0 || trimmed == "null" {
		*s = ""
		return nil
	}
	if trimmed[0] == '"' {
		var str string
		if err := json.Unmarshal(b, &str); err != nil {
			return err
		}
		*s = StringID(str)
		return nil
	}
	*s = StringID(trimmed)
	return nil
}

// String returns the underlying string representation.
func (s StringID) String() string {
	return string(s)
}

// CanvasConfig defines dimensions, background, and timeline settings.
type CanvasConfig struct {
	Width         float64 `json:"width"`
	Height        float64 `json:"height"`
	Duration      float64 `json:"duration"`
	PlaybackMode  string  `json:"loop"` // "loop", "pingpong", "once"
	Pattern       string  `json:"pattern,omitempty"`
	GridColor     string  `json:"gridColor,omitempty"`
	GridSize      float64 `json:"gridSize,omitempty"`
	BgColor       string  `json:"bgColor,omitempty"`
	Transparent   bool    `json:"transparent,omitempty"`
	BgTransparent bool    `json:"bgTransparent,omitempty"`
}

// CameraConfig defines 2D/3D viewport motion parameters.
type CameraConfig struct {
	Motion    string  `json:"motion"` // "static", "ken-burns", "handheld-drift", "perspective-tilt"
	Duration  float64 `json:"camDuration"`
	Loop      string  `json:"camLoop"` // "loop", "pingpong", "once"
	StartX    float64 `json:"startX"`
	StartY    float64 `json:"startY"`
	StartZoom float64 `json:"startZoom"`
	EndX      float64 `json:"endX"`
	EndY      float64 `json:"endY"`
	EndZoom   float64 `json:"endZoom"`
	Sway      float64 `json:"sway"`
	Breathe   float64 `json:"breathe"`
	TiltX     float64 `json:"tiltX"`
	TiltY     float64 `json:"tiltY"`
}

// Node represents an editable diagram shape.
type Node struct {
	ID          StringID `json:"id"`
	Shape       string   `json:"shape"`
	Label       string   `json:"label,omitempty"`
	Text        string   `json:"text,omitempty"` // Legacy JS alias
	Subtext     string   `json:"subtext,omitempty"`
	X           float64  `json:"x"`
	Y           float64  `json:"y"`
	Width       float64  `json:"width"`
	Height      float64  `json:"height"`
	Fill        string   `json:"fill,omitempty"`
	FillColor   string   `json:"fillColor,omitempty"` // Legacy JS alias
	FillOpacity float64  `json:"fillOpacity,omitempty"`
	Stroke      string   `json:"stroke,omitempty"`
	StrokeColor string   `json:"strokeColor,omitempty"` // Legacy JS alias
	StrokeWidth float64  `json:"strokeWidth,omitempty"`
	StrokeStyle string   `json:"strokeStyle,omitempty"`
	TextColor   string   `json:"textColor,omitempty"`
	FontSize    float64  `json:"fontSize,omitempty"`
	Opacity     float64  `json:"opacity"`
	Animation   string   `json:"animation,omitempty"` // "none", "pulse", "float", "fade"
	Anim        string   `json:"anim,omitempty"`      // Legacy JS alias
}

// Flow represents an animated or static connector between nodes/points.
type Flow struct {
	ID          StringID         `json:"id"`
	FromNodeID  StringID         `json:"fromNodeId,omitempty"`
	ToNodeID    StringID         `json:"toNodeId,omitempty"`
	Nodes       []geometry.Point `json:"nodes"`
	Curvature   float64          `json:"curvature"`
	RouteMode   string           `json:"routeMode,omitempty"`
	Route       string           `json:"route,omitempty"` // Legacy JS alias
	LineWidth   float64          `json:"lineWidth"`
	LineStyle   string           `json:"lineStyle,omitempty"`
	Arrow       string           `json:"arrow,omitempty"`
	Color       string           `json:"color"`
	Opacity     float64          `json:"opacity"`
	Speed       float64          `json:"speed"`       // duration in seconds for one transit
	Delay       float64          `json:"delay"`       // start delay in seconds
	EndDelay    float64          `json:"endDelay"`    // pause at end in seconds
	HideOnDelay bool             `json:"hideOnDelay"` // hide packet during delay
	Scale       float64          `json:"scale"`
	Type        string           `json:"type"` // "packet", "orb", "envelope", etc.
	ShowLine    bool             `json:"showLine"`
	Glow        float64          `json:"glow,omitempty"`
	Label       string           `json:"label,omitempty"`
	CustomB64   string           `json:"customB64,omitempty"`
	CustomMime  string           `json:"customMime,omitempty"`
	CustomW     float64          `json:"customW,omitempty"`
	CustomH     float64          `json:"customH,omitempty"`
}

// Glow represents a pulsating hotspot or radar ping.
type Glow struct {
	ID           StringID `json:"id"`
	Shape        string   `json:"shape,omitempty"`
	X            float64  `json:"x"`
	Y            float64  `json:"y"`
	Size         float64  `json:"size"`
	Color        string   `json:"color"`
	Opacity      float64  `json:"opacity"`
	Duration     float64  `json:"dur"`
	Delay        float64  `json:"delay"`
	EndDelay     float64  `json:"endDelay,omitempty"`
	Playback     string   `json:"playback"` // "pingpong", "loop", "once"
	IsRadar      bool     `json:"isRadar"`
	RadarRings   int      `json:"radarRings,omitempty"`
	Rings        int      `json:"rings,omitempty"` // Legacy JS alias
	RadarStagger float64  `json:"radarStagger,omitempty"`
}

// Ripple represents a refractive water ripple effect.
type Ripple struct {
	ID        StringID `json:"id"`
	X         float64  `json:"x"`
	Y         float64  `json:"y"`
	InnerR    float64  `json:"innerR"`
	OuterR    float64  `json:"outerR"`
	Duration  float64  `json:"dur"`
	Delay     float64  `json:"delay"`
	EndDelay  float64  `json:"endDelay,omitempty"`
	Color     string   `json:"color"`
	Opacity   float64  `json:"opacity"`
	WaveCount int      `json:"waveCount,omitempty"`
	Rings     int      `json:"rings,omitempty"` // Legacy JS alias
}

// Snapshot is a serialized snapshot of the scene for import/export across boundaries.
type Snapshot struct {
	Revision int64        `json:"revision"`
	Canvas   CanvasConfig `json:"canvas"`
	Camera   CameraConfig `json:"camera"`
	Nodes    []Node       `json:"nodes"`
	Flows    []Flow       `json:"flows"`
	Glows    []Glow       `json:"glows"`
	Ripples  []Ripple     `json:"ripples"`
}
