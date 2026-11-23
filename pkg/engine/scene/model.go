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

// MinCanvasDimension is the authoritative minimum supported canvas width and height in pixels.
const MinCanvasDimension = 20.0

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
	Locked      bool     `json:"locked"`
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
	Locked      bool             `json:"locked"`
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
	Locked       bool     `json:"locked"`
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
	Locked     bool     `json:"locked"`
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

// ImageCrop defines non-destructive source rectangular cropping parameters.
type ImageCrop struct {
	Enabled      bool    `json:"enabled"`
	SourceX      float64 `json:"sourceX"`
	SourceY      float64 `json:"sourceY"`
	SourceWidth  float64 `json:"sourceWidth"`
	SourceHeight float64 `json:"sourceHeight"`
	OrigX        float64 `json:"origX,omitempty"`
	OrigY        float64 `json:"origY,omitempty"`
	OrigWidth    float64 `json:"origWidth,omitempty"`
	OrigHeight   float64 `json:"origHeight,omitempty"`
}

// CropVersion represents a named, persistent crop state for an Image.
type CropVersion struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	SourceX      float64 `json:"sourceX"`
	SourceY      float64 `json:"sourceY"`
	SourceWidth  float64 `json:"sourceWidth"`
	SourceHeight float64 `json:"sourceHeight"`
	Width        float64 `json:"width,omitempty"`
	Height       float64 `json:"height,omitempty"`
	X            float64 `json:"x,omitempty"`
	Y            float64 `json:"y,omitempty"`
	OrigX        float64 `json:"origX,omitempty"`
	OrigY        float64 `json:"origY,omitempty"`
	OrigWidth    float64 `json:"origWidth,omitempty"`
	OrigHeight   float64 `json:"origHeight,omitempty"`
}

// ImageClip defines non-destructive object-local rectangular clipping boundary parameters.
type ImageClip struct {
	Enabled bool    `json:"enabled"`
	X       float64 `json:"x"`      // Object-local X (pixels from top-left of image)
	Y       float64 `json:"y"`      // Object-local Y (pixels from top-left of image)
	Width   float64 `json:"width"`  // Clipping rect width in pixels
	Height  float64 `json:"height"` // Clipping rect height in pixels
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
	Crop                *ImageCrop     `json:"crop,omitempty"` // Non-destructive crop parameters
	CropVersions        []CropVersion  `json:"cropVersions,omitempty"` // Selectable collection of crop versions
	ActiveCropVersionID string         `json:"activeCropVersionId,omitempty"` // ID of currently active crop version
	Clip                *ImageClip     `json:"clip,omitempty"` // Non-destructive object-local clipping boundary
	Opacity             float64        `json:"opacity"`
	Visible             *bool          `json:"visible,omitempty"`
	Locked              bool           `json:"locked"`
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

// BackgroundCrop defines non-destructive source rectangular cropping parameters for the background.
type BackgroundCrop struct {
	Enabled      bool    `json:"enabled"`
	SourceX      float64 `json:"sourceX"`
	SourceY      float64 `json:"sourceY"`
	SourceWidth  float64 `json:"sourceWidth"`
	SourceHeight float64 `json:"sourceHeight"`
}

// BackgroundCropVersion represents a named, persistent crop state for the background.
type BackgroundCropVersion struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	SourceX      float64 `json:"sourceX"`
	SourceY      float64 `json:"sourceY"`
	SourceWidth  float64 `json:"sourceWidth"`
	SourceHeight float64 `json:"sourceHeight"`
}

// BackgroundConfig defines authoritative metadata and non-destructive crop state for the scene background.
type BackgroundConfig struct {
	AssetRef            string                  `json:"assetRef,omitempty"`
	Filename            string                  `json:"filename,omitempty"`
	Mime                string                  `json:"mime,omitempty"`
	Src                 string                  `json:"src,omitempty"`
	Data                string                  `json:"data,omitempty"`
	B64                 string                  `json:"b64,omitempty"`
	SourceWidth         float64                 `json:"sourceWidth,omitempty"`
	SourceHeight        float64                 `json:"sourceHeight,omitempty"`
	NaturalWidth        float64                 `json:"naturalWidth,omitempty"`
	NaturalHeight       float64                 `json:"naturalHeight,omitempty"`
	Crop                *BackgroundCrop         `json:"crop,omitempty"`
	CropVersions        []BackgroundCropVersion `json:"cropVersions,omitempty"`
	ActiveCropVersionID string                  `json:"activeCropVersionId,omitempty"`
}

// WidgetTargetBinding represents a resolved member target and property driven by a semantic group parameter.
// WidgetTargetBinding maps an exposed parameter (or conditional state branch) to a specific object property or animation action.
type WidgetTargetBinding struct {
	Target   string `json:"target"`           // Canonical target ID (e.g. "lite-1", "node-2", "flow-1", "group-1")
	Property string `json:"property"`         // Member/target property (e.g. "value", "text", "color", "bgColor", "fill", "visibility", "play")
	When     string `json:"when,omitempty"`   // Optional state condition: "" / "always" (pass-through), "true", "false", or enum option string
	Action   string `json:"action,omitempty"` // Optional operation: "" / "set" (default), "play", "pause", "resume", "stop_reset", "enable", "disable"
	Value    any    `json:"value,omitempty"`  // Optional explicit target value when condition matches (nil = pass incoming parameter value)
}

// WidgetParameter defines an externally controllable runtime parameter for a widget or component.
type WidgetParameter struct {
	Name         string                `json:"name"`
	Label        string                `json:"label,omitempty"`
	Type         string                `json:"type"` // "color", "number", "boolean", "text", "enum", "speed"
	Default      any                   `json:"default"`
	Target       string                `json:"target"`                 // Semantic target ID (e.g. "node-1", "flow-1", "group-1", or "root" for Component Builder)
	Property     string                `json:"property"`               // "fill", "stroke", "visibility", "opacity", "text", "playbackRate", "state", "play", "value", etc.
	Targets      []WidgetTargetBinding `json:"targets,omitempty"`      // Optional 1..N mapped targets / conditional actions (Stage 16E & Stage 16F)
	EventTrigger string                `json:"eventTrigger,omitempty"` // Optional domestic trigger: "" or "hover" (mouseenter/mouseleave)
	Min          *float64              `json:"min,omitempty"`
	Max          *float64              `json:"max,omitempty"`
	Step         *float64              `json:"step,omitempty"`
	Unit         string                `json:"unit,omitempty"`
	Options      []string              `json:"options,omitempty"` // Permitted enum values
	Description  string                `json:"description,omitempty"`
}

// WidgetManifest describes the external parameter schema of an exported widget or reusable component.
type WidgetManifest struct {
	SchemaVersion     int               `json:"schemaVersion"`
	ComponentID       string            `json:"componentId,omitempty"`
	PackageVersion    string            `json:"packageVersion,omitempty"`
	PackageId         string            `json:"packageId,omitempty"`
	WidgetName        string            `json:"widgetName,omitempty"`
	Description       string            `json:"description,omitempty"`
	Category          string            `json:"category,omitempty"`
	Tags              []string          `json:"tags,omitempty"`
	MinRuntimeVersion string            `json:"minRuntimeVersion,omitempty"`
	ContentHash       string            `json:"contentHash,omitempty"`
	Parameters        []WidgetParameter `json:"parameters"`
}

// GaugeThresholdBand represents one of the 4 independently configurable threshold bands on Gauge / Level Lite.
type GaugeThresholdBand struct {
	Enabled bool    `json:"enabled"`
	Value   float64 `json:"value"`
	Color   string  `json:"color"`
}

// LiteEffect represents a low-load declarative SVG visual effect (Stage 16D).
// Kind values in 16D-A / 16D-B / 16D-C: "perimeter-tracer", "pulse", "flash", "flow-lite", "radar-lite", "gauge-lite", "oscilloscope-lite", "text-lite".
type LiteEffect struct {
	ID                  StringID             `json:"id"`
	Name                string               `json:"name,omitempty"`
	Metadata            map[string]any       `json:"metadata,omitempty"`
	Kind                string               `json:"kind"`              // "perimeter-tracer" | "pulse" | "flash" | "flow-lite" | "radar-lite" | "gauge-lite" | "oscilloscope-lite" | "text-lite"
	Variant             string               `json:"variant,omitempty"` // e.g. "rect", "rounded", "circle", "ellipse", "square", "diamond", "cross", "ring", "star", "dashed", "dotted", "single", "multi", "fading-ping", "hbar", "vbar", "segmented", "level", "ecg", "sine", "square-wave", "triangle", "sawtooth", "polyline", "bezier", "none", "pill", "curved"
	TargetID            string           `json:"targetId,omitempty"`
	X                   float64          `json:"x"`
	Y                   float64          `json:"y"`
	Width               float64          `json:"width,omitempty"`
	Height              float64          `json:"height,omitempty"`
	Radius              float64          `json:"radius,omitempty"`
	CornerRadius        float64          `json:"cornerRadius,omitempty"`
	Rotation            float64          `json:"rotation,omitempty"`
	Color               string           `json:"color"`
	Opacity             float64          `json:"opacity"`
	StrokeWidth         float64          `json:"strokeWidth,omitempty"`
	Segments            int              `json:"segments,omitempty"`     // Perimeter Tracer: 1..16
	Rings               int              `json:"rings,omitempty"`        // Radar Ping Lite: 1..6
	LineGapRatio        string           `json:"lineGapRatio,omitempty"` // Perimeter Tracer: e.g. "1:3"
	SegmentStyle        string           `json:"segmentStyle,omitempty"` // "solid" | "rounded" | "dashed"
	StartOffset         float64          `json:"startOffset,omitempty"`  // 0..100 percent
	Direction           string           `json:"direction,omitempty"`    // "cw" | "ccw" | "forward" | "reverse"
	PlaybackMode        string           `json:"playbackMode,omitempty"` // "loop" | "pingpong" | "once"
	EntryExit           string           `json:"entryExit,omitempty"`    // legacy backward-compat ("none")
	BurstCycles         int              `json:"burstCycles,omitempty"`  // 0 = continuous, 1..100 = circuits per burst
	PauseSeconds        float64          `json:"pauseSeconds,omitempty"` // pause duration in seconds between bursts
	PauseVisibility     string           `json:"pauseVisibility,omitempty"`
	Speed               float64          `json:"speed,omitempty"`               // circuit/transit duration in seconds
	Period              float64          `json:"period,omitempty"`              // pulse period in seconds
	Duration            float64          `json:"dur,omitempty"`                 // flash brief duration in seconds
	RepeatInterval      float64          `json:"repeatInterval,omitempty"`      // flash repeat interval in seconds
	Intensity           float64          `json:"intensity,omitempty"`           // pulse/flash peak amplitude (0..1)
	ArmThickness        float64          `json:"armThickness,omitempty"`        // cross/star arm thickness in SVG units (1..20)
	Repeat              bool             `json:"repeat,omitempty"`              // flash repeating interval toggle
	TriggerNonce        int64            `json:"triggerNonce,omitempty"`        // flash single-shot trigger counter
	OriginMode          string           `json:"originMode,omitempty"`          // "center"
	MaintainAspectRatio *bool            `json:"maintainAspectRatio,omitempty"` // pulse/tracer aspect ratio lock
	MinScale            float64          `json:"minScale,omitempty"`            // pulse minimum scale multiplier (e.g. 0.85)
	MaxScale            float64          `json:"maxScale,omitempty"`            // pulse maximum scale multiplier (e.g. 1.15)
	ShowGuide           *bool            `json:"showGuide,omitempty"`           // perimeter-tracer / flow-lite static guide track visibility
	Points              []geometry.Point `json:"points,omitempty"`              // flow-lite ordered waypoints in percentage coordinates
	Bends               []float64        `json:"bends,omitempty"`               // flow-lite per-section bend curvature (-100..+100)
	Curvature           float64          `json:"curvature,omitempty"`           // flow-lite / text-lite curvature modifier (-100..+100)
	DashLength          float64          `json:"dashLength,omitempty"`          // flow-lite dash/segment length in px (2..400)
	GapLength           float64          `json:"gapLength,omitempty"`           // flow-lite gap spacing in px (2..300)
	DotSize             float64          `json:"dotSize,omitempty"`             // flow-lite dot diameter in px (1..32)
	StartMode           string           `json:"startMode,omitempty"`           // flow-lite start endpoint behaviour ("tunnel" | "abrupt")
	EndMode             string           `json:"endMode,omitempty"`             // flow-lite end endpoint behaviour ("tunnel" | "abrupt")
	Delay               float64          `json:"delay,omitempty"`               // flow-lite start delay in seconds (0..60)
	EndDelay            float64          `json:"endDelay,omitempty"`            // flow-lite end delay in seconds (0..60)
	Value               *float64         `json:"value,omitempty"`               // gauge-lite current numeric value
	MinValue            *float64         `json:"minValue,omitempty"`            // gauge-lite minimum domain bound
	MaxValue            *float64         `json:"maxValue,omitempty"`            // gauge-lite maximum domain bound (must be > minValue)
	BgColor             string           `json:"bgColor,omitempty"`             // gauge-lite / oscilloscope-lite / text-lite background colour
	BgOpacity           *float64         `json:"bgOpacity,omitempty"`           // text-lite background opacity (0.0 .. 1.0)
	BorderColor         string           `json:"borderColor,omitempty"`         // text-lite border colour
	UseThresholds       bool             `json:"useThresholds,omitempty"`       // gauge-lite enable warning/critical threshold banding
	WarnThreshold       *float64         `json:"warnThreshold,omitempty"`       // gauge-lite warning threshold in actual numeric domain
	WarnColor           string           `json:"warnColor,omitempty"`           // gauge-lite warning band colour
	CritThreshold       *float64             `json:"critThreshold,omitempty"`       // gauge-lite critical threshold in actual numeric domain
	CritColor           string               `json:"critColor,omitempty"`           // gauge-lite critical band colour
	Thresholds          []GaugeThresholdBand `json:"thresholds,omitempty"`          // gauge-lite 4 independently enabled threshold bands
	Unit                string               `json:"unit,omitempty"`                // gauge-lite optional unit suffix (e.g. "%", "RPM", "°C")
	LabelText           string               `json:"labelText,omitempty"`           // gauge-lite / text-lite displayed text content
	Samples             string               `json:"samples,omitempty"`             // oscilloscope-lite bounded numeric sample sequence (2..64 samples)
	FontFamily          string               `json:"fontFamily,omitempty"`          // text-lite curated font key
	FontSize            float64              `json:"fontSize,omitempty"`            // text-lite font size in px (8..120)
	FontWeight          string               `json:"fontWeight,omitempty"`          // text-lite font weight ("400", "500", "600", "700")
	LetterSpacing       float64              `json:"letterSpacing,omitempty"`       // text-lite tracking in px (-2..20)
	TextAlign           string               `json:"textAlign,omitempty"`           // text-lite horizontal alignment ("left", "center", "right")
	VerticalAlign       string               `json:"verticalAlign,omitempty"`       // text-lite vertical alignment ("top", "middle", "bottom")
	Padding             float64              `json:"padding,omitempty"`             // text-lite interior padding in px (0..60)
	TextAnim            string               `json:"textAnim,omitempty"`            // text-lite animation mode ("none", "ticker-h", "ticker-v", "stacked-v", "typewriter", "fade", "flash", "slide", "blur-in", "blur-out", "scramble")
	ScrollSpeed         float64              `json:"scrollSpeed,omitempty"`         // text-lite horizontal ticker linear speed in px/s (10..600)
	LinesPerSec         float64              `json:"linesPerSec,omitempty"`         // text-lite vertical scroll speed in lines/s (0.1..20)
	LineSpacing         float64              `json:"lineSpacing,omitempty"`         // text-lite line height multiplier (0.8..3.0, default 1.25)
	WordWrap            *bool                `json:"wordWrap,omitempty"`            // text-lite word wrap toggle for multiline vertical scroll
	TypeSpeed           float64              `json:"typeSpeed,omitempty"`           // text-lite typewriter/scramble/stacked-v rate in chars/s (1..120)
	HoldDelay           float64              `json:"holdDelay,omitempty"`           // text-lite hold pause / visible hold duration in seconds (0..30)
	ClearDuration       float64              `json:"clearDuration,omitempty"`       // text-lite fade clear duration or blink off duration in seconds (0..30)
	LockOnOff           *bool                `json:"lockOnOff,omitempty"`           // text-lite flash/blink lock On Hold Duration == Off Duration
	TypeMode            string               `json:"typeMode,omitempty"`            // text-lite typewriter sequence ("once", "hold", "delete", "delete-forward")
	TypeRepeat          *bool                `json:"typeRepeat,omitempty"`          // text-lite repeat complete typewriter sequence
	Play                *bool                `json:"play,omitempty"`                // start or stop animation playback independent of playbackMode (default true)
	Visible             *bool                `json:"visible,omitempty"`
	Locked              bool                 `json:"locked"`
}

func (l LiteEffect) IsPlaying() bool {
	if l.Play == nil {
		return true
	}
	return *l.Play
}

func (l LiteEffect) IsVisible() bool {
	if l.Visible == nil {
		return true
	}
	return *l.Visible
}

func (l LiteEffect) IsLocked() bool {
	return l.Locked
}

// Snapshot is a serialized snapshot of the scene for import/export across boundaries.
type Snapshot struct {
	Revision           int64             `json:"revision"`
	Canvas             CanvasConfig      `json:"canvas"`
	Background         *BackgroundConfig `json:"background,omitempty"`
	Camera             CameraConfig      `json:"camera"`
	Optical            OpticalConfig     `json:"optical,omitempty"`
	Frame              FrameConfig       `json:"frame,omitempty"`
	Overlays           FrameConfig       `json:"overlays,omitempty"` // Alias for JS state.overlays compatibility
	Nodes              []Node            `json:"nodes"`
	Flows              []Flow            `json:"flows"`
	Glows              []Glow            `json:"glows"`
	Ripples            []Ripple          `json:"ripples"`
	LiteEffects        []LiteEffect      `json:"liteEffects,omitempty"`
	LiteEffectsCounter int64             `json:"liteEffectsCounter,omitempty"`
	Groups             []Group           `json:"groups"`
	GroupsCounter      int64             `json:"groupsCounter,omitempty"`
	Composites         []CompositeDef    `json:"composites,omitempty"`
	CompositesCounter  int64             `json:"compositesCounter,omitempty"`
	Images             []Image           `json:"images"`
	ImagesCounter      int64             `json:"imagesCounter,omitempty"`
	Layers             []LayerEntry      `json:"layers,omitempty"`
	Parameters         []WidgetParameter `json:"parameters,omitempty"`
}
