package generator

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"html"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"gitea.seaoffate.net/blackgrape/svg-animator/internal/effects"
	"gitea.seaoffate.net/blackgrape/svg-animator/internal/rasterizer"
)

// decodeWebPConfig parses RIFF/WEBP headers (VP8, VP8L, VP8X) without requiring external Go module dependencies.
func decodeWebPConfig(data []byte) (int, int, error) {
	if len(data) < 30 || string(data[0:4]) != "RIFF" || string(data[8:12]) != "WEBP" {
		return 0, 0, fmt.Errorf("not a valid RIFF WEBP header")
	}
	chunk := string(data[12:16])
	switch chunk {
	case "VP8 ":
		if data[23] != 0x9d || data[24] != 0x01 || data[25] != 0x2a {
			return 0, 0, fmt.Errorf("invalid VP8 frame tag")
		}
		w := int(binary.LittleEndian.Uint16(data[26:28])) & 0x3fff
		h := int(binary.LittleEndian.Uint16(data[28:30])) & 0x3fff
		return w, h, nil
	case "VP8L":
		if data[20] != 0x2f {
			return 0, 0, fmt.Errorf("invalid VP8L signature")
		}
		bits := binary.LittleEndian.Uint32(data[21:25])
		w := int(bits&0x3fff) + 1
		h := int((bits>>14)&0x3fff) + 1
		return w, h, nil
	case "VP8X":
		w := int(data[24]) | int(data[25])<<8 | int(data[26])<<16 + 1
		h := int(data[27]) | int(data[28])<<8 | int(data[29])<<16 + 1
		return w, h, nil
	default:
		return 0, 0, fmt.Errorf("unsupported WEBP chunk %q", chunk)
	}
}

// BuildStandaloneSVG builds the self-contained SVG text with embedded editing instructions.
func BuildStandaloneSVG(width, height int, mimeType, b64Data string, opts Options) string {
	cleanMime := strings.ToLower(strings.TrimSpace(mimeType))
	if cleanMime != "image/jpeg" && cleanMime != "image/png" && cleanMime != "image/webp" {
		cleanMime = "image/jpeg"
	}

	params := effects.Params{
		Width:              width,
		Height:             height,
		Duration:           opts.Duration,
		LoopMode:           opts.LoopMode,
		CameraMotion:       opts.CameraMotion,
		StartX:             opts.StartX,
		StartY:             opts.StartY,
		EndX:               opts.EndX,
		EndY:               opts.EndY,
		StartScale:         opts.StartScale,
		EndScale:           opts.EndScale,
		StartPitch:         opts.StartPitch,
		StartYaw:           opts.StartYaw,
		EndPitch:           opts.EndPitch,
		EndYaw:             opts.EndYaw,
		StartWaveScale:     opts.StartWaveScale,
		EndWaveScale:       opts.EndWaveScale,
		WaveFreq:           opts.WaveFreq,
		StartBlur:          opts.StartBlur,
		EndBlur:            opts.EndBlur,
		StartExposure:      opts.StartExposure,
		EndExposure:        opts.EndExposure,
		StartTemp:          opts.StartTemp,
		EndTemp:            opts.EndTemp,
		DriftSway:          opts.DriftSway,
		DriftBreathe:       opts.DriftBreathe,
		DriftRoll:          opts.DriftRoll,
		GrainIntensity:     opts.GrainIntensity,
		GrainSize:          opts.GrainSize,
		GateWeave:          opts.GateWeave,
		TiltBlur:           opts.TiltBlur,
		TiltPosition:       opts.TiltPosition,
		TiltBandWidth:      opts.TiltBandWidth,
		ChromaOffset:       opts.ChromaOffset,
		ChromaAngle:        opts.ChromaAngle,
		StartMotionBlur:    opts.StartMotionBlur,
		EndMotionBlur:      opts.EndMotionBlur,
		MotionAngle:        opts.MotionAngle,
		FrameStyle:         opts.FrameStyle,
		FrameDepth:         opts.FrameDepth,
		FrameShadow:        opts.FrameShadow,
		FrameMouldingData:  opts.FrameMouldingData,
		FrameMouldingWidth: opts.FrameMouldingWidth,
	}

	markup := effects.BuildMasterMarkup(params)
	frameMarkup := effects.BuildFrameMarkup(params)

	var animRule string
	if opts.CameraMotion == "handheld-drift" {
		animRule = fmt.Sprintf("animation: animEffect %s ease-in-out infinite normal;", opts.Duration)
	} else {
		switch opts.LoopMode {
		case "pingpong":
			animRule = fmt.Sprintf("animation: animEffect %s ease-in-out infinite alternate;", opts.Duration)
		case "loop":
			animRule = fmt.Sprintf("animation: animEffect %s ease-in-out infinite normal;", opts.Duration)
		default:
			animRule = fmt.Sprintf("animation: animEffect %s cubic-bezier(0.25, 1, 0.5, 1) 1 normal forwards;", opts.Duration)
		}
	}

	finalFilterAttr := markup.FilterAttr

	defsCombined := fmt.Sprintf(`<clipPath id="canvasClip"><rect width="%d" height="%d" /></clipPath>`, width, height)
	if markup.Defs != "" {
		defsCombined += "\n    " + markup.Defs
	}
	if frameMarkup.Defs != "" {
		defsCombined += "\n    " + frameMarkup.Defs
	}

	overlaysCombined := markup.Overlays
	if frameMarkup.Overlays != "" {
		overlaysCombined += "\n" + frameMarkup.Overlays
	}

	commentGuide := fmt.Sprintf(`  <!--
    =============================================================================
    SVG ANIMATION EDITING GUIDE (STACKED PIPELINE):
    =============================================================================
    Duration: %s | Playback: %s | Camera: %s
    Frame: %s | Depth: %.1fpx
    Start Framing: Center (%.1f%%, %.1f%%) | Zoom: %.2fx
    End Framing:   Center (%.1f%%, %.1f%%) | Zoom: %.2fx
    =============================================================================
  -->`, opts.Duration, opts.LoopMode, opts.CameraMotion, opts.FrameStyle, opts.FrameDepth, opts.StartX, opts.StartY, opts.StartScale, opts.EndX, opts.EndY, opts.EndScale)

	return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 %d %d" width="100%%" height="100%%">
%s
  <defs>
    %s
    <style>
%s
      .anim-target {
        transform-box: fill-box;
        transform-origin: 0%% 0%%;
        will-change: transform;
        %s
      }
    </style>
  </defs>
  <g clip-path="url(#canvasClip)">
    <g id="animTarget" class="anim-target" %s>
      <image width="%d" height="%d" href="data:%s;base64,%s" xlink:href="data:%s;base64,%s" preserveAspectRatio="xMidYMid slice" />
    </g>
  </g>
  %s
</svg>`, width, height, commentGuide, defsCombined, markup.Keyframes, animRule, finalFilterAttr, width, height, cleanMime, b64Data, cleanMime, b64Data, overlaysCombined)
}

// BuildStandaloneHTML wraps the animated SVG in a responsive HTML container.
func BuildStandaloneHTML(title string, width, height int, svgMarkup string) string {
	safeTitle := html.EscapeString(title)
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>%s - Animated View</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background-color: #0d1117; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 1.5rem; }
    .viewport { width: 100%%; max-width: %dpx; aspect-ratio: %d / %d; border-radius: 8px; overflow: hidden; box-shadow: 0 16px 36px rgba(0,0,0,0.6); background-color: #161b22; }
    svg { display: block; width: 100%%; height: 100%%; }
  </style>
</head>
<body>
  <div class="viewport">%s</div>
</body>
</html>`, safeTitle, width, width, height, svgMarkup)
}

// Run executes the generation workflow for headless CLI usage.
func Run(opts Options) error {
	cleanInput := filepath.Clean(opts.InputPath)
	fileBytes, err := os.ReadFile(cleanInput)
	if err != nil {
		return fmt.Errorf("reading input %q: %w", cleanInput, err)
	}

	var imgW, imgH int
	mimeType := "image/jpeg"

	cfg, imgFormat, err := image.DecodeConfig(bytes.NewReader(fileBytes))
	if err == nil {
		imgW = cfg.Width
		imgH = cfg.Height
		if strings.ToLower(imgFormat) == "png" {
			mimeType = "image/png"
		}
	} else if w, h, webpErr := decodeWebPConfig(fileBytes); webpErr == nil {
		imgW = w
		imgH = h
		mimeType = "image/webp"
	} else {
		return fmt.Errorf("decoding image: %w", err)
	}

	if opts.FrameSlicePath != "" && opts.FrameMouldingData == "" {
		sliceBytes, err := os.ReadFile(filepath.Clean(opts.FrameSlicePath))
		if err == nil {
			sliceMime := "image/jpeg"
			lowerSlice := strings.ToLower(opts.FrameSlicePath)
			if strings.HasSuffix(lowerSlice, ".png") {
				sliceMime = "image/png"
			} else if strings.HasSuffix(lowerSlice, ".webp") {
				sliceMime = "image/webp"
			}
			opts.FrameMouldingData = fmt.Sprintf("data:%s;base64,%s", sliceMime, base64.StdEncoding.EncodeToString(sliceBytes))
		}
	}

	baseName := opts.BaseName
	if baseName == "" {
		baseName = strings.TrimSuffix(filepath.Base(cleanInput), filepath.Ext(cleanInput))
	} else {
		baseName = filepath.Base(filepath.Clean(baseName))
		if baseName == "." || baseName == "/" {
			baseName = "export"
		}
	}

	outDir := filepath.Clean(opts.OutputDir)
	if err := os.MkdirAll(outDir, 0755); err != nil {
		return fmt.Errorf("creating directory %q: %w", outDir, err)
	}

	b64String := base64.StdEncoding.EncodeToString(fileBytes)
	svgText := BuildStandaloneSVG(imgW, imgH, mimeType, b64String, opts)
	htmlText := BuildStandaloneHTML(baseName, imgW, imgH, svgText)

	genFormat := strings.ToLower(opts.Format)

	if genFormat == "html" || genFormat == "both" || genFormat == "all" {
		htmlPath := filepath.Join(outDir, baseName+".html")
		if err := os.WriteFile(htmlPath, []byte(htmlText), 0644); err != nil {
			return err
		}
		fmt.Printf("[OK] HTML written: %s\n", htmlPath)
	}

	if genFormat == "svg" || genFormat == "both" || genFormat == "all" {
		svgPath := filepath.Join(outDir, baseName+".svg")
		if err := os.WriteFile(svgPath, []byte(svgText), 0644); err != nil {
			return err
		}
		fmt.Printf("[OK] SVG written:  %s\n", svgPath)
	}

	if genFormat == "webp" || genFormat == "apng" || genFormat == "mp4" || genFormat == "all" {
		localTemp := filepath.Join(".", "render_workspace")
		os.MkdirAll(localTemp, 0755)

		tmpRenderDir, err := os.MkdirTemp(localTemp, "cli-render-*")
		if err != nil {
			return fmt.Errorf("creating temp render dir: %w", err)
		}
		defer os.RemoveAll(tmpRenderDir)

		tempHTMLPath := filepath.Join(tmpRenderDir, "index.html")
		if err := os.WriteFile(tempHTMLPath, []byte(htmlText), 0644); err != nil {
			return err
		}

		durStr := strings.TrimSuffix(opts.Duration, "s")
		durFloat, parseErr := strconv.ParseFloat(durStr, 64)
		if parseErr != nil {
			durFloat = 7.0
		}

		if genFormat == "webp" || genFormat == "all" {
			outPath := filepath.Join(outDir, baseName+".webp")
			fmt.Printf(">> Rendering %s frames to %s...\n", opts.Duration, outPath)
			if err := rasterizer.Export(tempHTMLPath, outPath, "webp", durFloat, opts.FPS, opts.LoopMode, imgW, imgH); err != nil {
				return err
			}
			fmt.Printf("[OK] WebP written: %s\n", outPath)
		}

		if genFormat == "apng" || genFormat == "all" {
			outPath := filepath.Join(outDir, baseName+".png")
			fmt.Printf(">> Rendering %s frames to APNG %s...\n", opts.Duration, outPath)
			if err := rasterizer.Export(tempHTMLPath, outPath, "apng", durFloat, opts.FPS, opts.LoopMode, imgW, imgH); err != nil {
				return err
			}
			fmt.Printf("[OK] APNG written: %s\n", outPath)
		}

		if genFormat == "mp4" || genFormat == "all" {
			outPath := filepath.Join(outDir, baseName+".mp4")
			fmt.Printf(">> Rendering %s frames to MP4 %s...\n", opts.Duration, outPath)
			if err := rasterizer.Export(tempHTMLPath, outPath, "mp4", durFloat, opts.FPS, opts.LoopMode, imgW, imgH); err != nil {
				return err
			}
			fmt.Printf("[OK] MP4 written:  %s\n", outPath)
		}
	}

	return nil
}