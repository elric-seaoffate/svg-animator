package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"gitea.seaoffate.net/blackgrape/svg-animator/internal/generator"
	"gitea.seaoffate.net/blackgrape/svg-animator/internal/web"
)

// AppConfig defines the JSON configuration file schema.
type AppConfig struct {
	Host    string `json:"host"`
	Port    int    `json:"port"`
	DataDir string `json:"data_dir"`
}

func defaultAppConfig() AppConfig {
	return AppConfig{
		Host:    "0.0.0.0",
		Port:    8088,
		DataDir: ".",
	}
}

// loadOrCreateConfig loads the JSON config file. If the default config.json does not
// exist yet, it writes a clean default config.json so the user can edit it later.
func loadOrCreateConfig(configPath string, explicitConfigFlag bool) (AppConfig, error) {
	cfg := defaultAppConfig()

	if envCfg := strings.TrimSpace(os.Getenv("SVG_ANIMATOR_CONFIG")); envCfg != "" && !explicitConfigFlag {
		configPath = envCfg
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			if explicitConfigFlag {
				return cfg, fmt.Errorf("specified config file not found at %s", configPath)
			}
			// Auto-create default config.json in working directory if possible
			if outBytes, mErr := json.MarshalIndent(cfg, "", "  "); mErr == nil {
				_ = os.WriteFile(configPath, append(outBytes, '\n'), 0644)
			}
			return cfg, nil
		}
		return cfg, fmt.Errorf("reading config file %s: %w", configPath, err)
	}

	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("parsing config file %s: %w", configPath, err)
	}

	if strings.TrimSpace(cfg.Host) == "" {
		cfg.Host = "0.0.0.0"
	}
	if cfg.Port <= 0 || cfg.Port > 65535 {
		cfg.Port = 8088
	}
	if strings.TrimSpace(cfg.DataDir) == "" {
		cfg.DataDir = "."
	}

	return cfg, nil
}

func resolveListenAddr(cfg AppConfig, explicitFlags map[string]bool, hostFlag string, portFlag int, serveFlag string) string {
	host := cfg.Host
	port := cfg.Port

	// Layer 2: Environment variable overrides
	if envHost := strings.TrimSpace(os.Getenv("SVG_ANIMATOR_HOST")); envHost != "" {
		host = envHost
	}
	if envPortStr := strings.TrimSpace(os.Getenv("SVG_ANIMATOR_PORT")); envPortStr != "" {
		if p, err := strconv.Atoi(envPortStr); err == nil && p > 0 && p <= 65535 {
			port = p
		}
	} else if envPortStr := strings.TrimSpace(os.Getenv("PORT")); envPortStr != "" {
		if p, err := strconv.Atoi(envPortStr); err == nil && p > 0 && p <= 65535 {
			port = p
		}
	}

	// Layer 3: Explicit CLI flags at service start (highest priority)
	if explicitFlags["serve"] && strings.TrimSpace(serveFlag) != "" {
		raw := strings.TrimSpace(serveFlag)
		if !strings.Contains(raw, ":") {
			// Handle bare port passed to -serve (e.g. -serve 8090)
			if p, err := strconv.Atoi(raw); err == nil && p > 0 && p <= 65535 {
				port = p
			}
		} else {
			h, pStr, err := net.SplitHostPort(raw)
			if err == nil {
				if h != "" {
					host = h
				}
				if p, convErr := strconv.Atoi(pStr); convErr == nil && p > 0 && p <= 65535 {
					port = p
				}
			} else {
				return raw
			}
		}
	}

	if explicitFlags["host"] && strings.TrimSpace(hostFlag) != "" {
		host = strings.TrimSpace(hostFlag)
	}
	if explicitFlags["port"] && portFlag > 0 && portFlag <= 65535 {
		port = portFlag
	}

	return fmt.Sprintf("%s:%d", host, port)
}

func main() {
	// Server & Config Flags
	configPath := flag.String("config", "config.json", "Path to JSON configuration file")
	hostFlag := flag.String("host", "0.0.0.0", "HTTP listen host/IP (overrides config.json)")
	portFlag := flag.Int("port", 8088, "HTTP listen port (overrides config.json)")
	serveAddr := flag.String("serve", ":8088", "HTTP listen address [host]:port for the interactive web studio")
	dataDirFlag := flag.String("datadir", ".", "Directory for studio_library.db and render_workspace (overrides config.json)")

	// CLI Processing Flags
	input := flag.String("in", "", "Path to source image for headless CLI processing (optional)")
	outDir := flag.String("outdir", "./dist", "Directory to write output files in CLI mode")
	name := flag.String("name", "", "Custom base name for output files")
	format := flag.String("format", "both", "CLI target format: svg, html, webp, apng, both, or all")
	fps := flag.Int("fps", 24, "Frames per second for rasterized output (webp/apng)")
	preset := flag.String("preset", "ken-burns", "Preset: handheld-drift, film-grain, tilt-shift, chromatic-aberration, motion-blur, exposure-pull, focus-pull, liquid-ripple, perspective-tilt, ken-burns, pan")
	duration := flag.String("duration", "7s", "Animation duration (1s to 60s, e.g. 7s, 14s)")
	loopMode := flag.String("loop", "once", "Playback mode: loop, pingpong, once")

	// Camera Parameters
	cameraMotion := flag.String("motion", "ken-burns", "Camera motion: static, ken-burns, perspective-tilt, handheld-drift")
	startX := flag.Float64("start-x", 50.0, "Focal center X percent (0 to 100)")
	startY := flag.Float64("start-y", 50.0, "Focal center Y percent (0 to 100)")
	endX := flag.Float64("end-x", 60.0, "End focal center X percent")
	endY := flag.Float64("end-y", 40.0, "End focal center Y percent")
	startScale := flag.Float64("start-zoom", 1.0, "Base camera scale (1.0 to 10.0)")
	endScale := flag.Float64("end-zoom", 1.25, "Target camera scale (1.0 to 10.0)")
	startPitch := flag.Float64("start-pitch", 0.0, "Start pitch angle in degrees")
	startYaw := flag.Float64("start-yaw", 0.0, "Start yaw angle in degrees")
	endPitch := flag.Float64("end-pitch", 0.0, "End pitch angle in degrees")
	endYaw := flag.Float64("end-yaw", 0.0, "End yaw angle in degrees")

	// Optical Parameters (Default to neutral/off unless activated by -preset or explicit CLI flag)
	startWave := flag.Float64("start-wave", 0.0, "Start wave displacement strength")
	endWave := flag.Float64("end-wave", 0.0, "End wave displacement strength")
	waveFreq := flag.Float64("wave-freq", 0.02, "Wave frequency / density")
	startBlur := flag.Float64("start-blur", 0.0, "Start blur radius in pixels")
	endBlur := flag.Float64("end-blur", 0.0, "End blur radius in pixels")
	startExposure := flag.Float64("start-exp", 1.0, "Start exposure multiplier")
	endExposure := flag.Float64("end-exp", 1.0, "End exposure multiplier")
	startTemp := flag.Float64("start-temp", 0.0, "Start color temperature")
	endTemp := flag.Float64("end-temp", 0.0, "End color temperature")
	driftSway := flag.Float64("drift-sway", 1.4, "Handheld translation sway percent")
	driftBreathe := flag.Float64("drift-breathe", 1.8, "Handheld breathing scale percent")
	driftRoll := flag.Float64("drift-roll", 0.55, "Handheld micro-tilt roll degrees")

	grainIntensity := flag.Float64("grain-int", 0.0, "Film grain intensity (0.05 to 0.60)")
	grainSize := flag.Float64("grain-size", 0.75, "Film grain size (0.40 to 1.50)")
	gateWeave := flag.Float64("gate-weave", 0.0, "Film gate registration jitter in pixels")
	tiltBlur := flag.Float64("tilt-blur", 0.0, "Tilt-shift blur radius in pixels")
	tiltPos := flag.Float64("tilt-pos", 50.0, "Tilt-shift sharp focal band Y percent")
	tiltBand := flag.Float64("tilt-band", 20.0, "Tilt-shift clear focal band width percent")
	chromaOffset := flag.Float64("chroma-offset", 0.0, "Chromatic aberration fringe offset in pixels")
	chromaAngle := flag.Float64("chroma-angle", 0.0, "Chromatic aberration refraction angle in degrees")
	startMotionBlur := flag.Float64("start-motion-blur", 0.0, "Start motion blur distance in pixels")
	endMotionBlur := flag.Float64("end-motion-blur", 0.0, "End motion blur distance in pixels")
	motionAngle := flag.Float64("motion-angle", 0.0, "Directional motion blur streak angle in degrees")

	// Mitered Frame Flags
	frameStyle := flag.String("frame", "none", "Mitered frame style: none, walnut, gold, matte, obsidian, tiled")
	frameDepth := flag.Float64("frame-depth", 48.0, "Frame moulding depth in pixels (10 to 120)")
	frameShadow := flag.Float64("frame-shadow", 0.55, "Inner aperture drop shadow intensity (0.0 to 1.0)")
	frameSlice := flag.String("frame-slice", "", "Path to custom moulding cross-section slice image (JPEG/PNG)")
	frameSliceWidth := flag.Float64("frame-slice-width", 120.0, "Tiled pattern repeat width in pixels")

	flag.Parse()

	// Track which flags were explicitly set by the user on the command line
	explicitFlags := make(map[string]bool)
	flag.Visit(func(f *flag.Flag) {
		explicitFlags[f.Name] = true
	})

	if *input == "" {
		cfg, err := loadOrCreateConfig(*configPath, explicitFlags["config"])
		if err != nil {
			fmt.Fprintf(os.Stderr, "Configuration error: %v\n", err)
			os.Exit(1)
		}

		bindAddr := resolveListenAddr(cfg, explicitFlags, *hostFlag, *portFlag, *serveAddr)

		dataDir := cfg.DataDir
		if envDataDir := strings.TrimSpace(os.Getenv("SVG_ANIMATOR_DATA_DIR")); envDataDir != "" {
			dataDir = envDataDir
		}
		if explicitFlags["datadir"] && strings.TrimSpace(*dataDirFlag) != "" {
			dataDir = strings.TrimSpace(*dataDirFlag)
		}
		if absDir, err := filepath.Abs(dataDir); err == nil {
			dataDir = absDir
		}

		srvCfg := web.ServerConfig{
			BindAddr:   bindAddr,
			DataDir:    dataDir,
			ConfigPath: *configPath,
		}

		if err := web.StartServerWithConfig(srvCfg); err != nil {
			fmt.Fprintf(os.Stderr, "Server failed: %v\n", err)
			os.Exit(1)
		}
		return
	}

	// Apply preset defaults only if the corresponding flag was not explicitly passed
	switch *preset {
	case "handheld-drift":
		if !explicitFlags["motion"] {
			*cameraMotion = "handheld-drift"
		}
	case "perspective-tilt":
		if !explicitFlags["motion"] {
			*cameraMotion = "perspective-tilt"
		}
		if !explicitFlags["start-pitch"] {
			*startPitch = 20.0
		}
	case "focus-pull":
		if !explicitFlags["start-blur"] {
			*startBlur = 18.0
		}
	case "liquid-ripple":
		if !explicitFlags["start-wave"] {
			*startWave = 45.0
		}
	case "film-grain":
		if !explicitFlags["grain-int"] {
			*grainIntensity = 0.22
		}
		if !explicitFlags["gate-weave"] {
			*gateWeave = 1.2
		}
	case "tilt-shift":
		if !explicitFlags["tilt-blur"] {
			*tiltBlur = 16.0
		}
	case "chromatic-aberration":
		if !explicitFlags["chroma-offset"] {
			*chromaOffset = 4.5
		}
	case "motion-blur":
		if !explicitFlags["start-motion-blur"] {
			*startMotionBlur = 24.0
		}
	case "exposure-pull":
		if !explicitFlags["start-exp"] {
			*startExposure = 0.35
		}
		if !explicitFlags["end-exp"] {
			*endExposure = 1.05
		}
		if !explicitFlags["start-temp"] {
			*startTemp = -25.0
		}
		if !explicitFlags["end-temp"] {
			*endTemp = 15.0
		}
	}

	opts := generator.Options{
		InputPath:          *input,
		OutputDir:          *outDir,
		BaseName:           *name,
		Format:             *format,
		FPS:                *fps,
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