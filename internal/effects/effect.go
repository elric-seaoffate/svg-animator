package effects

// Params holds all animation, coordinate, filter, and frame parameters.
type Params struct {
	Width          int
	Height         int
	Duration       string
	LoopMode       string
	CameraMotion   string // "static", "ken-burns", "perspective-tilt"
	StartX         float64
	StartY         float64
	EndX           float64
	EndY           float64
	StartScale     float64
	EndScale       float64
	StartPitch     float64
	StartYaw       float64
	EndPitch       float64
	EndYaw         float64
	StartWaveScale float64 // Wave displacement at 0%
	EndWaveScale   float64 // Wave displacement at 100%
	WaveFreq       float64 // Spatial frequency / ripple density (0.005 to 0.08)
	StartBlur      float64 // Focus blur radius at 0% (stdDeviation)
	EndBlur        float64 // Focus blur radius at 100% (stdDeviation)
	StartExposure  float64 // Exposure multiplier at 0% (0.1 to 2.5)
	EndExposure    float64 // Exposure multiplier at 100% (0.1 to 2.5)
	StartTemp      float64 // Color temperature at 0% (-50 cool to +50 warm)
	EndTemp        float64 // Color temperature at 100% (-50 cool to +50 warm)
	DriftSway      float64 // Handheld translation sway in percent (0.0 to 5.0)
	DriftBreathe   float64 // Handheld breathing scale in percent (0.0 to 6.0)
	DriftRoll      float64 // Handheld micro-tilt roll in degrees (0.0 to 3.0)

	// Film Grain & Gate Weave
	GrainIntensity float64 // Silver-halide grain opacity (0.05 to 0.60)
	GrainSize      float64 // Grain turbulence frequency (0.40 to 1.50)
	GateWeave      float64 // Mechanical film gate jitter in pixels (0.0 to 4.0)

	// Tilt-Shift Miniature Focus
	TiltBlur      float64 // Miniature field blur radius in pixels (1.0 to 30.0)
	TiltPosition  float64 // Sharp focal band Y position in percent (10 to 90)
	TiltBandWidth float64 // Clear focal band width in percent (5 to 50)

	// Chromatic Aberration
	ChromaOffset float64 // Color fringe separation in pixels (0.0 to 25.0)
	ChromaAngle  float64 // Fringe refraction angle in degrees (-90 to 90)

	// Directional Shutter Motion Blur
	StartMotionBlur float64 // Entry shutter streak in pixels (0.0 to 40.0)
	EndMotionBlur   float64 // Exit shutter streak in pixels (0.0 to 40.0)
	MotionAngle     float64 // Motion blur streak angle in degrees (-90 to 90)

	// Mitered Frame & Border Engine
	FrameStyle         string  // "none", "walnut", "gold", "matte", "obsidian", "tiled"
	FrameDepth         float64 // Moulding width/depth in pixels (10.0 to 120.0)
	FrameShadow        float64 // Inner aperture shadow opacity (0.0 to 1.0)
	FrameMouldingData  string  // Base64 data URL for tiled moulding slice
	FrameMouldingWidth float64 // Tiled slice width in pixels
}

// Markup contains the generated SVG/CSS snippets for an animation.
type Markup struct {
	Defs       string // Content placed inside <defs> (filters, patterns, etc.)
	Keyframes  string // CSS @keyframes block
	FilterAttr string // Attributes applied to the <g> container
	Overlays   string // Sibling elements rendered above the image
}

// Generator defines a function that outputs SVG/CSS markup from parameters.
type Generator func(p Params) Markup

var registry = make(map[string]Generator)

// Register adds a new effect generator to the central registry.
func Register(name string, gen Generator) {
	registry[name] = gen
}

// Get retrieves an effect generator by name, falling back to ken-burns if not found.
func Get(name string) Generator {
	if gen, ok := registry[name]; ok {
		return gen
	}
	return registry["ken-burns"]
}

// CalcTranslation calculates percentage translations to center target coordinates.
func CalcTranslation(scale, x, y float64) (float64, float64) {
	tx := 50.0 - (scale * x)
	ty := 50.0 - (scale * y)
	return tx, ty
}