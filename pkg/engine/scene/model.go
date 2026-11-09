package scene

import (
	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
)

// CanvasConfig defines dimensions, background, and timeline settings.
type CanvasConfig struct {
	Width        float64 `json:"width"`
	Height       float64 `json:"height"`
	Duration     float64 `json:"duration"`
	PlaybackMode string  `json:"loop"` // "loop", "pingpong", "once"
	Pattern      string  `json:"pattern,omitempty"`
	GridColor    string  `json:"gridColor,omitempty"`
	GridSize     float64 `json:"gridSize,omitempty"`
	BgColor      string  `json:"bgColor,omitempty"`
	Transparent  bool    `json:"transparent,omitempty"`
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
	ID          string  `json:"id"`
	Shape       string  `json:"shape"`
	Label       string  `json:"label,omitempty"`
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	Width       float64 `json:"width"`
	Height      float64 `json:"height"`
	Fill        string  `json:"fill,omitempty"`
	Stroke      string  `json:"stroke,omitempty"`
	StrokeWidth float64 `json:"strokeWidth,omitempty"`
	Opacity     float64 `json:"opacity"`
	Animation   string  `json:"animation,omitempty"` // "none", "pulse", "float", "fade"
}

// Flow represents an animated or static connector between nodes/points.
type Flow struct {
	ID          string           `json:"id"`
	FromNodeID  string           `json:"fromNodeId,omitempty"`
	ToNodeID    string           `json:"toNodeId,omitempty"`
	Nodes       []geometry.Point `json:"nodes"`
	Curvature   float64          `json:"curvature"`
	RouteMode   string           `json:"routeMode"`
	LineWidth   float64          `json:"lineWidth"`
	LineStyle   string           `json:"lineStyle,omitempty"`
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
}

// Glow represents a pulsating hotspot or radar ping.
type Glow struct {
	ID           string  `json:"id"`
	X            float64 `json:"x"`
	Y            float64 `json:"y"`
	Size         float64 `json:"size"`
	Color        string  `json:"color"`
	Opacity      float64 `json:"opacity"`
	Duration     float64 `json:"dur"`
	Delay        float64 `json:"delay"`
	EndDelay     float64 `json:"endDelay,omitempty"`
	Playback     string  `json:"playback"` // "pingpong", "loop", "once"
	IsRadar      bool    `json:"isRadar"`
	RadarRings   int     `json:"radarRings,omitempty"`
	RadarStagger float64 `json:"radarStagger,omitempty"`
}

// Ripple represents a refractive water ripple effect.
type Ripple struct {
	ID        string  `json:"id"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	InnerR    float64 `json:"innerR"`
	OuterR    float64 `json:"outerR"`
	Duration  float64 `json:"dur"`
	Delay     float64 `json:"delay"`
	EndDelay  float64 `json:"endDelay,omitempty"`
	Color     string  `json:"color"`
	Opacity   float64 `json:"opacity"`
	WaveCount int     `json:"waveCount,omitempty"`
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
