package main

import (
	"flag"
	"fmt"
	"os"

	"gitea.seaoffate.net/blackgrape/svg-animator/internal/generator"
	"gitea.seaoffate.net/blackgrape/svg-animator/internal/web"
)

func main() {
	input := flag.String("in", "", "Path to source image for headless CLI processing (optional)")
	serveAddr := flag.String("serve", ":8088", "HTTP listen address for the interactive web studio")
	outDir := flag.String("outdir", "./dist", "Directory to write output files in CLI mode")
	name := flag.String("name", "", "Custom base name for output files")
	format := flag.String("format", "both", "CLI target output format: svg, html, or both")
	preset := flag.String("preset", "handheld-drift", "Preset: handheld-drift, film-grain, tilt-shift, chromatic-aberration, motion-blur, exposure-pull, focus-pull, liquid-ripple, perspective-tilt, ken-burns, pan, pulse, orbit, scanlines, glitch")
	duration := flag.String("duration", "7s", "Animation duration (1s to 60s, e.g. 7s, 14s)")
	loopMode := flag.String("loop", "loop", "Playback mode: loop, pingpong, once")
	cameraMotion := flag.String("motion", "static", "Camera motion: static, ken-burns, perspective-tilt")
	startX := flag.Float64("start-x", 50.0, "Focal center X percent (0 to 100)")
	startY := flag.Float64("start-y", 50.0, "Focal center Y percent (0 to 100)")
	endX := flag.Float64("end-x", 50.0, "End focal center X percent")
	endY := flag.Float64("end-y", 50.0, "End focal center Y percent")
	startScale := flag.Float64("start-zoom", 1.05, "Base camera scale (-20.0 to 20.0)")
	endScale := flag.Float64("end-zoom", 1.05, "Target camera scale (-20.0 to 20.0)")
	startPitch := flag.Float64("start-pitch", 0.0, "Start pitch angle in degrees")
	startYaw := flag.Float64("start-yaw", 0.0, "Start yaw angle in degrees")
	endPitch := flag.Float64("end-pitch", 0.0, "End pitch angle in degrees")
	endYaw := flag.Float64("end-yaw", 0.0, "End yaw angle in degrees")
	startWave := flag.Float64("start-wave", 45.0, "Start wave displacement strength")
	endWave := flag.Float64("end-wave", 0.0, "End wave displacement strength")
	waveFreq := flag.Float64("wave-freq", 0.02, "Wave frequency / density")
	startBlur := flag.Float64("start-blur", 18.0, "Start blur radius in pixels")
	endBlur := flag.Float64("end-blur", 0.0, "End blur radius in pixels")
	startExposure := flag.Float64("start-exp", 0.35, "Start exposure multiplier")
	endExposure := flag.Float64("end-exp", 1.05, "End exposure multiplier")
	startTemp := flag.Float64("start-temp", -25.0, "Start color temperature")
	endTemp := flag.Float64("end-temp", 15.0, "End color temperature")
	driftSway := flag.Float64("drift-sway", 1.4, "Handheld translation sway percent")
	driftBreathe := flag.Float64("drift-breathe", 1.8, "Handheld breathing scale percent")
	driftRoll := flag.Float64("drift-roll", 0.55, "Handheld micro-tilt roll degrees")

	// Optical Effects
	grainIntensity := flag.Float64("grain-int", 0.22, "Film grain intensity (0.05 to 0.60)")
	grainSize := flag.Float64("grain-size", 0.75, "Film grain size (0.40 to 1.50)")
	gateWeave := flag.Float64("gate-weave", 1.2, "Film gate registration jitter in pixels")
	tiltBlur := flag.Float64("tilt-blur", 16.0, "Tilt-shift blur radius in pixels")
	tiltPos := flag.Float64("tilt-pos", 50.0, "Tilt-shift sharp focal band Y percent")
	tiltBand := flag.Float64("tilt-band", 20.0, "Tilt-shift clear focal band width percent")
	chromaOffset := flag.Float64("chroma-offset", 4.5, "Chromatic aberration fringe offset in pixels")
	chromaAngle := flag.Float64("chroma-angle", 0.0, "Chromatic aberration refraction angle in degrees")
	startMotionBlur := flag.Float64("start-motion-blur", 24.0, "Start motion blur distance in pixels")
	endMotionBlur := flag.Float64("end-motion-blur", 0.0, "End motion blur distance in pixels")
	motionAngle := flag.Float64("motion-angle", 0.0, "Directional motion blur streak angle in degrees")

	// Mitered Frame Flags
	frameStyle := flag.String("frame", "none", "Mitered frame style: none, walnut, gold, matte, obsidian, tiled")
	frameDepth := flag.Float64("frame-depth", 48.0, "Frame moulding depth in pixels (10 to 120)")
	frameShadow := flag.Float64("frame-shadow", 0.55, "Inner aperture drop shadow intensity (0.0 to 1.0)")
	frameSlice := flag.String("frame-slice", "", "Path to custom moulding cross-section slice image (JPEG/PNG)")
	frameSliceWidth := flag.Float64("frame-slice-width", 120.0, "Tiled pattern repeat width in pixels")

	flag.Parse()

	if *input == "" {
		if err := web.StartServer(*serveAddr); err != nil {
			fmt.Fprintf(os.Stderr, "Server failed: %v\n", err)
			os.Exit(1)
		}
		return
	}

	opts := generator.Options{
		InputPath:          *input,
		OutputDir:          *outDir,
		BaseName:           *name,
		Format:             *format,
		Preset:             *preset,
		Duration:           *duration,
		LoopMode:           *loopMode,
		CameraMotion:       *cameraMotion,
		StartX:             *startX,
		StartY:             *startY,
		EndX:               *endX,
		EndY:               *endY,
		StartScale:         *startScale,
		EndScale:           *endScale,
		StartPitch:         *startPitch,
		StartYaw:           *startYaw,
		EndPitch:           *endPitch,
		EndYaw:             *endYaw,
		StartWaveScale:     *startWave,
		EndWaveScale:       *endWave,
		WaveFreq:           *waveFreq,
		StartBlur:          *startBlur,
		EndBlur:            *endBlur,
		StartExposure:      *startExposure,
		EndExposure:        *endExposure,
		StartTemp:          *startTemp,
		EndTemp:            *endTemp,
		DriftSway:          *driftSway,
		DriftBreathe:       *driftBreathe,
		DriftRoll:          *driftRoll,
		GrainIntensity:     *grainIntensity,
		GrainSize:          *grainSize,
		GateWeave:          *gateWeave,
		TiltBlur:           *tiltBlur,
		TiltPosition:       *tiltPos,
		TiltBandWidth:      *tiltBand,
		ChromaOffset:       *chromaOffset,
		ChromaAngle:        *chromaAngle,
		StartMotionBlur:    *startMotionBlur,
		EndMotionBlur:      *endMotionBlur,
		MotionAngle:        *motionAngle,
		FrameStyle:         *frameStyle,
		FrameDepth:         *frameDepth,
		FrameShadow:        *frameShadow,
		FrameSlicePath:     *frameSlice,
		FrameMouldingWidth: *frameSliceWidth,
	}

	if err := generator.Run(opts); err != nil {
		fmt.Fprintf(os.Stderr, "CLI processing error: %v\n", err)
		os.Exit(1)
	}
}