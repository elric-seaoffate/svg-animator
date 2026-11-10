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
	Motion        string  `json:"motion"` // "static", "ken-burns", "handheld-drift", "perspective-tilt"
	Duration      float64 `json:"camDuration"`
	Loop          string  `json:"camLoop"` // "loop", "pingpong", "once"
	StartX        float64 `json:"startX"`
	StartY        float64 `json:"startY"`
	StartZoom     float64 `json:"startZoom"`
	EndX          float64 `json:"endX"`
	EndY          float64 `json:"endY"`
	EndZoom       float64 `json:"endZoom"`
	Sway          float64 `json:"sway"`
	Breathe       float64 `json:"breathe"`
	TiltX         float64 `json:"tiltX"`
	TiltY         float64 `json:"tiltY"`
	BgColor       string  `json:"bgColor,omitempty"`
	BgTransparent bool    `json:"bgTransparent,omitempty"`
}

// UnmarshalJSON supports both camDuration/duration and camLoop/loop aliases.
func (c *CameraConfig) UnmarshalJSON(b []byte) error {
	type alias CameraConfig
	var aux struct {
		alias
		AltDuration float64 `json:"duration"`
		AltLoop     string  `json:"loop"`
	}
	if err := json.Unmarshal(b, &aux); err != nil {
		return err
	}
	*c = CameraConfig(aux.alias)
	if c.Duration <= 0 && aux.AltDuration > 0 {
		c.Duration = aux.AltDuration
	}
	if c.Loop == "" && aux.AltLoop != "" {
		c.Loop = aux.AltLoop
	}
	return nil
}

// OpticalConfig defines lens focus pull, tilt-shift, and motion blur parameters.
type OpticalConfig struct {
	Type      string  `json:"type"` // "none", "focus-pull", "tilt-shift", "motion-blur"
	StartBlur float64 `json:"startBlur"`
	EndBlur   float64 `json:"endBlur"`
	FocusDur  float64 `json:"focusDur"`
	TSShape   string  `json:"tsShape,omitempty"` // "horizontal", "vertical", "radial"
	TSPosX    float64 `json:"tsPosX,omitempty"`
	TSPos     float64 `json:"tsPos,omitempty"`
	TSWidth   float64 `json:"tsWidth,omitempty"`
	TSBlur    float64 `json:"tsBlur,omitempty"`
	MBInt     float64 `json:"mbInt,omitempty"`
	MBAng     float64 `json:"mbAng,omitempty"`
}

// UnmarshalJSON supports both focusDur and duration aliases.
func (o *OpticalConfig) UnmarshalJSON(b []byte) error {
	type alias OpticalConfig
	var aux struct {
		alias
		AltDuration float64 `json:"duration"`
	}
	if err := json.Unmarshal(b, &aux); err != nil {
		return err
	}
	*o = OpticalConfig(aux.alias)
	if o.FocusDur <= 0 && aux.AltDuration > 0 {
		o.FocusDur = aux.AltDuration
	}
	return nil
}

// FrameConfig defines border styles, mitering, lighting, and overlays.
type FrameConfig struct {
	Enabled       bool    `json:"frame"` // Matches JS state.overlays.frame
	Style         string  `json:"frameStyle"`
	Depth         float64 `json:"frameDepth"`
	Lighting      bool    `json:"frameLighting"`
	LightDir      string  `json:"frameLightDir"` // "tl", "tr", "bl", "br", "front"
	LightInt      float64 `json:"frameLightInt"`
	Shadow        float64 `json:"frameShadow"`
	Fillet        bool    `json:"frameFillet"`
}

// LayerEntry defines an entry in the scene's unified layer ordering stack.
type LayerEntry struct {
	Type    SelectionType `json:"type"` // "node", "flow", "glow", "ripple", "image"
	ID      StringID      `json:"id"`
	Visible *bool         `json:"visible,omitempty"`
	Locked  *bool         `json:"locked,omitempty"`
}

// Node represents an editable diagram shape.
type Node struct {
	ID          StringID       `json:"id"`
	Name        string         `json:"name,omitempty"` // User-editable display name (distinct from ID and text/label)
	Metadata    map[string]any `json:"metadata,omitempty"` // Forward-compatible extension metadata (e.g. future Digital Twin bindings)
	Shape       string         `json:"shape"`
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
	Visible     *bool    `json:"visible,omitempty"`
	Locked      bool     `json:"locked,omitempty"`
}

func (n Node) IsVisible() bool {
	if n.Visible == nil {
		return true
	}
	return *n.Visible
}

func (n Node) IsLocked() bool {
	return n.Locked
}

// Flow represents an animated or static connector between nodes/points.
type Flow struct {
	ID          StringID         `json:"id"`
	Name        string           `json:"name,omitempty"` // User-editable display name (distinct from ID and label)
	Metadata    map[string]any   `json:"metadata,omitempty"` // Forward-compatible extension metadata (e.g. future Digital Twin bindings)
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
	Visible     *bool            `json:"visible,omitempty"`
	Locked      bool             `json:"locked,omitempty"`
}

func (f Flow) IsVisible() bool {
	if f.Visible == nil {
		return true
	}
	return *f.Visible
}

func (f Flow) IsLocked() bool {
	return f.Locked
}

// Glow represents a pulsating hotspot or radar ping.
type Glow struct {
	ID           StringID       `json:"id"`
	Name         string         `json:"name,omitempty"` // User-editable display name (distinct from ID)
	Metadata     map[string]any `json:"metadata,omitempty"` // Forward-compatible extension metadata (e.g. future Digital Twin bindings)
	Shape        string         `json:"shape,omitempty"`
	X            float64  `json:"x"`
	Y            float64  `json:"y"`
	Size         float64  `json:"size"`
	Color        string   `json:"color"`
	Opacity      float64  `json:"opacity"`
	Duration     float64  `json:"dur"`
	Delay        float64  `json:"delay"`
	EndDelay     float64  `json:"endDelay,omitempty"`
	Playback     string   `json:"playback"` // "pingpong", "linear", "once", "static"
	IsRadar      bool     `json:"isRadar,omitempty"`
	RadarRings   int      `json:"radarRings,omitempty"`
	Rings        int      `json:"rings,omitempty"` // Legacy JS alias
	RadarStagger float64  `json:"radarStagger,omitempty"`
	Scale        float64  `json:"scale,omitempty"`
	Blur         float64  `json:"blur,omitempty"`
	Thick        float64  `json:"thick,omitempty"`
	CoreR        float64  `json:"coreR,omitempty"`
	HideOnDelay  bool     `json:"hideOnDelay,omitempty"`
	CustomB64    string   `json:"customB64,omitempty"`
	CustomMime   string   `json:"customMime,omitempty"`
	CustomW      float64  `json:"customW,omitempty"`
	CustomH      float64  `json:"customH,omitempty"`
	Visible      *bool    `json:"visible,omitempty"`
	Locked       bool     `json:"locked,omitempty"`
}

func (g Glow) IsVisible() bool {
	if g.Visible == nil {
		return true
	}
	return *g.Visible
}

func (g Glow) IsLocked() bool {
	return g.Locked
}

// Ripple represents a refractive water ripple effect.
type Ripple struct {
	ID         StringID       `json:"id"`
	Name       string         `json:"name,omitempty"` // User-editable display name (distinct from ID)
	Metadata   map[string]any `json:"metadata,omitempty"` // Forward-compatible extension metadata (e.g. future Digital Twin bindings)
	X          float64        `json:"x"`
	Y          float64  `json:"y"`
	InnerR     float64  `json:"innerR"`
	OuterR     float64  `json:"outerR"`
	Duration   float64  `json:"dur"`
	Delay      float64  `json:"delay"`
	EndDelay   float64  `json:"endDelay,omitempty"`
	Color      string   `json:"color"`
	Opacity    float64  `json:"opacity"`
	WaveCount  int      `json:"waveCount,omitempty"`
	Rings      int      `json:"rings,omitempty"` // Legacy JS alias
	Thick      float64  `json:"thick,omitempty"`
	Refraction float64  `json:"refraction,omitempty"`
	Visible    *bool    `json:"visible,omitempty"`
	Locked     bool     `json:"locked,omitempty"`
}

func (r Ripple) IsVisible() bool {
	if r.Visible == nil {
		return true
	}
	return *r.Visible
}

func (r Ripple) IsLocked() bool {
	return r.Locked
}

// Image represents an independently positioned image object on the canvas.
type Image struct {
	ID                  StringID       `json:"id"`
	Name                string         `json:"name,omitempty"` // User-editable display name
	AssetRef            string         `json:"assetRef,omitempty"` // SVA package asset path (e.g. "assets/image-1.png")
	Src                 string         `json:"src,omitempty"` // Data URL / base64 for live display/fallback
	Data                string         `json:"data,omitempty"` // Alias for Src / base64 data URL
	Filename            string         `json:"filename,omitempty"`
	Mime                string         `json:"mime,omitempty"`
	X                   float64        `json:"x"` // Center X in canvas percentage [0..100]
	Y                   float64        `json:"y"` // Center Y in canvas percentage [0..100]
	Width               float64        `json:"width"` // Display width in pixels
	Height              float64        `json:"height"` // Display height in pixels
	NaturalWidth        float64        `json:"naturalWidth,omitempty"` // Source image width (for non-destructive crop in Stage 15)
	NaturalHeight       float64        `json:"naturalHeight,omitempty"` // Source image height (for non-destructive crop in Stage 15)
	MaintainAspectRatio bool           `json:"maintainAspectRatio"`
	Opacity             float64        `json:"opacity"`
	Visible             *bool          `json:"visible,omitempty"`
	Locked              bool           `json:"locked,omitempty"`
	Metadata            map[string]any `json:"metadata,omitempty"` // Extension metadata
}

func (img Image) IsVisible() bool {
	if img.Visible == nil {
		return true
	}
	return *img.Visible
}

func (img Image) IsLocked() bool {
	return img.Locked
}

// Snapshot is a serialized snapshot of the scene for import/export across boundaries.
type Snapshot struct {
	Revision      int64         `json:"revision"`
	Canvas        CanvasConfig  `json:"canvas"`
	Camera        CameraConfig  `json:"camera"`
	Optical       OpticalConfig `json:"optical,omitempty"`
	Frame         FrameConfig   `json:"frame,omitempty"`
	Overlays      FrameConfig   `json:"overlays,omitempty"` // Alias for JS state.overlays compatibility
	Nodes         []Node        `json:"nodes"`
	Flows         []Flow        `json:"flows"`
	Glows         []Glow        `json:"glows"`
	Ripples       []Ripple      `json:"ripples"`
	Groups        []Group       `json:"groups,omitempty"`
	GroupsCounter int64         `json:"groupsCounter,omitempty"`
	Images        []Image       `json:"images,omitempty"`
	ImagesCounter int64         `json:"imagesCounter,omitempty"`
	Layers        []LayerEntry  `json:"layers,omitempty"`
}
