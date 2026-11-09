package scene

import (
	"errors"
	"fmt"
	"math"
)

// ValidateFrame checks that frame configuration properties conform to operational bounds.
func ValidateFrame(f *FrameConfig) error {
	if f == nil {
		return errors.New("nil frame config")
	}
	switch f.Style {
	case "", "walnut", "mahogany", "gold", "silver", "matte", "obsidian", "blueprint-border", "cyber-hud", "mac-window", "crt-vintage":
		// valid
	default:
		return fmt.Errorf("unsupported frame style: %q", f.Style)
	}
	if f.Depth < 0 {
		return errors.New("frame depth cannot be negative")
	}
	return nil
}

type stopDef struct {
	offset float64
	color  string
}

// buildMiteredFrameGo generates SVG defs and overlay markup for a 4-sided mitered picture frame.
func buildMiteredFrameGo(
	prefix string,
	stopsBright1, stopsBright2, stopsDark1, stopsDark2 []stopDef,
	filletBrightCols, filletDarkCols []string,
	w, h, d float64,
	opts FrameConfig,
) (defs, overlay string) {
	lightingOn := opts.Lighting
	lightDir := opts.LightDir
	if lightDir == "" {
		lightDir = "tl"
	}
	lightInt := opts.LightInt / 100.0
	if opts.LightInt == 0 {
		lightInt = 0.70
	}
	shadowOpacity := opts.Shadow
	if shadowOpacity <= 0 && opts.Shadow == 0 {
		shadowOpacity = 0.55
	}
	showFillet := opts.Fillet

	isFrontLight := !lightingOn || lightDir == "front"

	fD := 4.5
	if d < 24.0 {
		fD = 2.5
	}
	baseSh := 16.0
	if d < 24.0 {
		baseSh = 8.0
	}
	shD := math.Max(4.0, math.Round(baseSh*(0.4+shadowOpacity*0.9)))

	topStops := stopsBright1
	leftStops := stopsBright2
	rightStops := stopsDark1
	bottomStops := stopsDark2

	fTopURL := fmt.Sprintf("url(#%sFilletBright)", prefix)
	fLeftURL := fmt.Sprintf("url(#%sFilletBright)", prefix)
	fRightURL := fmt.Sprintf("url(#%sFilletDark)", prefix)
	fBotURL := fmt.Sprintf("url(#%sFilletDark)", prefix)

	if isFrontLight {
		topStops = stopsBright1
		leftStops = stopsBright1
		rightStops = stopsBright1
		bottomStops = stopsBright1
		fLeftURL = fTopURL
		fRightURL = fTopURL
		fBotURL = fTopURL
	} else if lightDir == "tr" {
		topStops = stopsBright1
		rightStops = stopsBright2
		leftStops = stopsDark1
		bottomStops = stopsDark2
		fTopURL = fmt.Sprintf("url(#%sFilletBright)", prefix)
		fRightURL = fmt.Sprintf("url(#%sFilletBright)", prefix)
		fLeftURL = fmt.Sprintf("url(#%sFilletDark)", prefix)
		fBotURL = fmt.Sprintf("url(#%sFilletDark)", prefix)
	} else if lightDir == "bl" {
		bottomStops = stopsBright1
		leftStops = stopsBright2
		rightStops = stopsDark1
		topStops = stopsDark2
		fBotURL = fmt.Sprintf("url(#%sFilletBright)", prefix)
		fLeftURL = fmt.Sprintf("url(#%sFilletBright)", prefix)
		fRightURL = fmt.Sprintf("url(#%sFilletDark)", prefix)
		fTopURL = fmt.Sprintf("url(#%sFilletDark)", prefix)
	} else if lightDir == "br" {
		bottomStops = stopsBright1
		rightStops = stopsBright2
		leftStops = stopsDark1
		topStops = stopsDark2
		fBotURL = fmt.Sprintf("url(#%sFilletBright)", prefix)
		fRightURL = fmt.Sprintf("url(#%sFilletBright)", prefix)
		fLeftURL = fmt.Sprintf("url(#%sFilletDark)", prefix)
		fTopURL = fmt.Sprintf("url(#%sFilletDark)", prefix)
	}

	renderStops := func(arr []stopDef) string {
		out := ""
		for _, s := range arr {
			out += fmt.Sprintf(`<stop offset="%.1f%%" stop-color="%s" />`, s.offset, s.color)
		}
		return out
	}

	defs = fmt.Sprintf(`
      <linearGradient id="%sTop" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="%.2f">%s</linearGradient>
      <linearGradient id="%sBottom" gradientUnits="userSpaceOnUse" x1="0" y1="%.2f" x2="0" y2="%.2f">%s</linearGradient>
      <linearGradient id="%sLeft" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="%.2f" y2="0">%s</linearGradient>
      <linearGradient id="%sRight" gradientUnits="userSpaceOnUse" x1="%.2f" y1="0" x2="%.2f" y2="0">%s</linearGradient>
      <linearGradient id="%sRebateTop" x1="0%%" y1="0%%" x2="0%%" y2="100%%">
        <stop offset="0%%" stop-color="#000000" stop-opacity="%.2f" />
        <stop offset="100%%" stop-color="#000000" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="%sRebateBottom" x1="0%%" y1="100%%" x2="0%%" y2="0%%">
        <stop offset="0%%" stop-color="#000000" stop-opacity="%.2f" />
        <stop offset="100%%" stop-color="#000000" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="%sRebateLeft" x1="0%%" y1="0%%" x2="100%%" y2="0%%">
        <stop offset="0%%" stop-color="#000000" stop-opacity="%.2f" />
        <stop offset="100%%" stop-color="#000000" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="%sRebateRight" x1="100%%" y1="0%%" x2="0%%" y2="0%%">
        <stop offset="0%%" stop-color="#000000" stop-opacity="%.2f" />
        <stop offset="100%%" stop-color="#000000" stop-opacity="0" />
      </linearGradient>`,
		prefix, d, renderStops(topStops),
		prefix, h, h-d, renderStops(bottomStops),
		prefix, d, renderStops(leftStops),
		prefix, w, w-d, renderStops(rightStops),
		prefix, shadowOpacity,
		prefix, shadowOpacity,
		prefix, shadowOpacity,
		prefix, shadowOpacity,
	)

	filletPolys := ""
	if showFillet && len(filletBrightCols) >= 2 && len(filletDarkCols) >= 2 {
		defs += fmt.Sprintf(`
        <linearGradient id="%sFilletBright" x1="0%%" y1="0%%" x2="100%%" y2="100%%">
          <stop offset="0%%" stop-color="%s" />
          <stop offset="100%%" stop-color="%s" />
        </linearGradient>
        <linearGradient id="%sFilletDark" x1="0%%" y1="0%%" x2="100%%" y2="100%%">
          <stop offset="0%%" stop-color="%s" />
          <stop offset="100%%" stop-color="%s" />
        </linearGradient>`,
			prefix, filletBrightCols[0], filletBrightCols[1],
			prefix, filletDarkCols[0], filletDarkCols[1],
		)
		fi := d - fD
		filletPolys = fmt.Sprintf(`
        <polygon points="%.2f,%.2f %.2f,%.2f %.2f,%.2f %.2f,%.2f" fill="%s" />
        <polygon points="%.2f,%.2f %.2f,%.2f %.2f,%.2f %.2f,%.2f" fill="%s" />
        <polygon points="%.2f,%.2f %.2f,%.2f %.2f,%.2f %.2f,%.2f" fill="%s" />
        <polygon points="%.2f,%.2f %.2f,%.2f %.2f,%.2f %.2f,%.2f" fill="%s" />`,
			fi, fi, w-fi, fi, w-d, d, d, d, fTopURL,
			fi, h-fi, w-fi, h-fi, w-d, h-d, d, h-d, fBotURL,
			fi, fi, d, d, d, h-d, fi, h-fi, fLeftURL,
			w-fi, fi, w-d, d, w-d, h-d, w-fi, h-fi, fRightURL,
		)
	}

	lightingBevelOverlay := ""
	if lightingOn {
		if lightDir == "front" {
			diff := (lightInt - 0.5) * 0.36
			uniformCol := fmt.Sprintf("rgba(255,255,255,%.3f)", diff)
			if lightInt < 0.5 {
				uniformCol = fmt.Sprintf("rgba(0,0,0,%.3f)", math.Abs(diff))
			}
			lightingBevelOverlay = fmt.Sprintf(`
          <polygon points="0,0 %.2f,0 %.2f,%.2f %.2f,%.2f" fill="%s" />
          <polygon points="0,%.2f %.2f,%.2f %.2f,%.2f %.2f,%.2f" fill="%s" />
          <polygon points="0,0 %.2f,%.2f %.2f,%.2f 0,%.2f" fill="%s" />
          <polygon points="%.2f,0 %.2f,%.2f %.2f,%.2f %.2f,%.2f" fill="%s" />`,
				w, w-d, d, d, d, uniformCol,
				h, w, h, w-d, h-d, d, h-d, uniformCol,
				d, d, d, h-d, h, uniformCol,
				w, w-d, d, w-d, h-d, w, h, uniformCol,
			)
		} else if lightInt > 0 {
			specOp := lightInt * 0.24
			shadeOp := lightInt * 0.44
			topCol := fmt.Sprintf("rgba(0,0,0,%.3f)", shadeOp)
			if lightDir == "tl" || lightDir == "tr" {
				topCol = fmt.Sprintf("rgba(255,255,255,%.3f)", specOp)
			}
			botCol := fmt.Sprintf("rgba(0,0,0,%.3f)", shadeOp)
			if lightDir == "bl" || lightDir == "br" {
				botCol = fmt.Sprintf("rgba(255,255,255,%.3f)", specOp)
			}
			leftCol := fmt.Sprintf("rgba(0,0,0,%.3f)", shadeOp)
			if lightDir == "tl" || lightDir == "bl" {
				leftCol = fmt.Sprintf("rgba(255,255,255,%.3f)", specOp)
			}
			rightCol := fmt.Sprintf("rgba(0,0,0,%.3f)", shadeOp)
			if lightDir == "tr" || lightDir == "br" {
				rightCol = fmt.Sprintf("rgba(255,255,255,%.3f)", specOp)
			}

			lightingBevelOverlay = fmt.Sprintf(`
          <polygon points="0,0 %.2f,0 %.2f,%.2f %.2f,%.2f" fill="%s" />
          <polygon points="0,%.2f %.2f,%.2f %.2f,%.2f %.2f,%.2f" fill="%s" />
          <polygon points="0,0 %.2f,%.2f %.2f,%.2f 0,%.2f" fill="%s" />
          <polygon points="%.2f,0 %.2f,%.2f %.2f,%.2f %.2f,%.2f" fill="%s" />`,
				w, w-d, d, d, d, topCol,
				h, w, h, w-d, h-d, d, h-d, botCol,
				d, d, d, h-d, h, leftCol,
				w, w-d, d, w-d, h-d, w, h, rightCol,
			)
		}
	}

	shadowRects := ""
	if shadowOpacity > 0.01 {
		if isFrontLight {
			shadowRects = fmt.Sprintf(`
          <rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="url(#%sRebateTop)" />
          <rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="url(#%sRebateBottom)" />
          <rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="url(#%sRebateLeft)" />
          <rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="url(#%sRebateRight)" />`,
				d, d, w-2*d, shD, prefix,
				d, h-d-shD, w-2*d, shD, prefix,
				d, d, shD, h-2*d, prefix,
				w-d-shD, d, shD, h-2*d, prefix,
			)
		} else {
			castFromTop := lightDir == "tl" || lightDir == "tr"
			castFromLeft := lightDir == "tl" || lightDir == "bl"
			if castFromTop {
				shadowRects += fmt.Sprintf(`<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="url(#%sRebateTop)" />`, d, d, w-2*d, shD, prefix)
			} else {
				shadowRects += fmt.Sprintf(`<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="url(#%sRebateBottom)" />`, d, h-d-shD, w-2*d, shD, prefix)
			}
			if castFromLeft {
				shadowRects += fmt.Sprintf(`<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="url(#%sRebateLeft)" />`, d, d, shD, h-2*d, prefix)
			} else {
				shadowRects += fmt.Sprintf(`<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="url(#%sRebateRight)" />`, w-d-shD, d, shD, h-2*d, prefix)
			}
		}
	}

	overlay = fmt.Sprintf(`
      <g id="frameAssembly" pointer-events="none">
        <polygon points="0,0 %.2f,0 %.2f,%.2f %.2f,%.2f" fill="url(#%sTop)" />
        <polygon points="0,%.2f %.2f,%.2f %.2f,%.2f %.2f,%.2f" fill="url(#%sBottom)" />
        <polygon points="0,0 %.2f,%.2f %.2f,%.2f 0,%.2f" fill="url(#%sLeft)" />
        <polygon points="%.2f,0 %.2f,%.2f %.2f,%.2f %.2f,%.2f" fill="url(#%sRight)" />
        %s
        <line x1="0" y1="0" x2="%.2f" y2="%.2f" stroke="#000" stroke-opacity="0.55" stroke-width="1.2" />
        <line x1="%.2f" y1="0" x2="%.2f" y2="%.2f" stroke="#000" stroke-opacity="0.55" stroke-width="1.2" />
        <line x1="0" y1="%.2f" x2="%.2f" y2="%.2f" stroke="#000" stroke-opacity="0.6" stroke-width="1.2" />
        <line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f" stroke="#000" stroke-opacity="0.6" stroke-width="1.2" />
        %s
        %s
        <rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="none" stroke="rgba(0,0,0,0.65)" stroke-width="1.2" />
      </g>`,
		w, w-d, d, d, d, prefix,
		h, w, h, w-d, h-d, d, h-d, prefix,
		d, d, d, h-d, h, prefix,
		w, w-d, d, w-d, h-d, w, h, prefix,
		lightingBevelOverlay,
		d, d,
		w, w-d, d,
		h, d, h-d,
		w, h, w-d, h-d,
		filletPolys,
		shadowRects,
		d, d, w-2*d, h-2*d,
	)

	return defs, overlay
}

// BuildFrameMarkup generates complete SVG <defs> and overlay markup for the requested frame configuration.
func BuildFrameMarkup(cfg FrameConfig, w, h float64) (defs, overlay string) {
	if !cfg.Enabled && cfg.Style == "" {
		return "", ""
	}
	if w <= 0 {
		w = 1280
	}
	if h <= 0 {
		h = 720
	}
	style := cfg.Style
	if style == "" {
		style = "walnut"
	}

	rawDepth := cfg.Depth
	if rawDepth <= 0 {
		rawDepth = 44.0
	}
	maxD := math.Min(w, h)/2.0 - 12.0
	d := math.Max(10.0, math.Min(rawDepth, maxD))

	switch style {
	case "walnut":
		return buildMiteredFrameGo(
			"walnut",
			[]stopDef{{0, "#5a3821"}, {40, "#462a17"}, {85, "#351e0e"}, {100, "#281408"}},
			[]stopDef{{0, "#52321c"}, {40, "#402513"}, {85, "#30190b"}, {100, "#221106"}},
			[]stopDef{{0, "#2b1509"}, {40, "#210f05"}, {85, "#180a03"}, {100, "#100501"}},
			[]stopDef{{0, "#251106"}, {40, "#1c0b03"}, {85, "#140702"}, {100, "#0b0301"}},
			[]string{"#dfbe76", "#f5e1ad"},
			[]string{"#805d1e", "#5c4010"},
			w, h, d, cfg,
		)

	case "mahogany":
		return buildMiteredFrameGo(
			"mahog",
			[]stopDef{{0, "#6e1e14"}, {35, "#54140c"}, {80, "#3d0c06"}, {100, "#290602"}},
			[]stopDef{{0, "#631a10"}, {35, "#4a110a"}, {80, "#340904"}, {100, "#210401"}},
			[]stopDef{{0, "#380b06"}, {40, "#290603"}, {85, "#1c0301"}, {100, "#120100"}},
			[]stopDef{{0, "#300804"}, {40, "#220402"}, {85, "#160201"}, {100, "#0d0100"}},
			[]string{"#e8c872", "#fff0b8"},
			[]string{"#8c6718", "#5e430b"},
			w, h, d, cfg,
		)

	case "gold":
		return buildMiteredFrameGo(
			"gold",
			[]stopDef{{0, "#fff1c2"}, {25, "#e2b448"}, {55, "#ffd56b"}, {85, "#c5922e"}, {100, "#a6761c"}},
			[]stopDef{{0, "#f8e4a8"}, {25, "#d4a539"}, {55, "#f0c458"}, {85, "#b68322"}, {100, "#946513"}},
			[]stopDef{{0, "#996815"}, {35, "#734b07"}, {70, "#8c5f11"}, {100, "#553402"}},
			[]stopDef{{0, "#8c5d10"}, {35, "#664004"}, {70, "#7d520c"}, {100, "#4a2c01"}},
			[]string{"#fff8dc", "#ffe484"},
			[]string{"#7a5409", "#4d3302"},
			w, h, d, cfg,
		)

	case "silver":
		return buildMiteredFrameGo(
			"silver",
			[]stopDef{{0, "#f8fafc"}, {25, "#cbd5e1"}, {55, "#e2e8f0"}, {85, "#94a3b8"}, {100, "#64748b"}},
			[]stopDef{{0, "#f1f5f9"}, {25, "#cbd5e1"}, {55, "#dce4ee"}, {85, "#8696a8"}, {100, "#475569"}},
			[]stopDef{{0, "#64748b"}, {40, "#475569"}, {80, "#334155"}, {100, "#1e293b"}},
			[]stopDef{{0, "#475569"}, {40, "#334155"}, {80, "#1e293b"}, {100, "#0f172a"}},
			[]string{"#ffffff", "#e2e8f0"},
			[]string{"#475569", "#1e293b"},
			w, h, d, cfg,
		)

	case "matte":
		return buildMiteredFrameGo(
			"matte",
			[]stopDef{{0, "#f8f6f0"}, {90, "#f2efe6"}, {100, "#e6e2d6"}},
			[]stopDef{{0, "#f5f2eb"}, {90, "#ede9df"}, {100, "#ded9cc"}},
			[]stopDef{{0, "#ebe7dd"}, {90, "#e0dbd0"}, {100, "#cfcac0"}},
			[]stopDef{{0, "#e6e1d6"}, {90, "#dad5c9"}, {100, "#c7c1b4"}},
			[]string{"#ffffff", "#f5f3ed"},
			[]string{"#c7c2b6", "#a8a295"},
			w, h, d, cfg,
		)

	case "obsidian":
		return buildMiteredFrameGo(
			"obsidian",
			[]stopDef{{0, "#2c323c"}, {35, "#1e232a"}, {85, "#13171c"}, {100, "#0a0d10"}},
			[]stopDef{{0, "#262b34"}, {35, "#1a1e24"}, {85, "#101318"}, {100, "#080a0d"}},
			[]stopDef{{0, "#16191f"}, {40, "#0f1216"}, {85, "#090b0e"}, {100, "#040507"}},
			[]stopDef{{0, "#12151a"}, {40, "#0b0d11"}, {85, "#06080a"}, {100, "#020304"}},
			[]string{"#58a6ff", "#1f6feb"},
			[]string{"#161b22", "#0d1117"},
			w, h, d, cfg,
		)

	case "blueprint-border":
		outerPad := math.Max(8.0, math.Round(d*0.35))
		innerPad := d
		bw := w - innerPad*2.0
		bh := h - innerPad*2.0
		tbW := math.Min(280.0, math.Round(bw*0.35))
		tbH := math.Max(34.0, math.Min(54.0, math.Round(bh*0.1)))
		tbX := w - innerPad - tbW
		tbY := h - innerPad - tbH

		ticks := ""
		cols := []string{"1", "2", "3", "4"}
		for idx, lbl := range cols {
			cx := innerPad + (bw/4.0)*(float64(idx)+0.5)
			tickX := innerPad + (bw/4.0)*float64(idx+1)
			if idx < 3 {
				ticks += fmt.Sprintf(`<line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f" stroke="#58a6ff" stroke-width="1" stroke-opacity="0.6" />`, tickX, outerPad, tickX, innerPad)
				ticks += fmt.Sprintf(`<line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f" stroke="#58a6ff" stroke-width="1" stroke-opacity="0.6" />`, tickX, h-innerPad, tickX, h-outerPad)
			}
			fSize := math.Max(9.0, math.Round((innerPad-outerPad)*0.55))
			ticks += fmt.Sprintf(`<text x="%.2f" y="%.2f" fill="#58a6ff" font-family="monospace" font-size="%.1f" text-anchor="middle">%s</text>`, cx, outerPad+(innerPad-outerPad)*0.68, fSize, lbl)
		}

		rows := []string{"A", "B", "C", "D"}
		for idx, lbl := range rows {
			cy := innerPad + (bh/4.0)*(float64(idx)+0.5)
			tickY := innerPad + (bh/4.0)*float64(idx+1)
			if idx < 3 {
				ticks += fmt.Sprintf(`<line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f" stroke="#58a6ff" stroke-width="1" stroke-opacity="0.6" />`, outerPad, tickY, innerPad, tickY)
				ticks += fmt.Sprintf(`<line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f" stroke="#58a6ff" stroke-width="1" stroke-opacity="0.6" />`, w-innerPad, tickY, w-outerPad, tickY)
			}
			fSize := math.Max(9.0, math.Round((innerPad-outerPad)*0.55))
			ticks += fmt.Sprintf(`<text x="%.2f" y="%.2f" fill="#58a6ff" font-family="monospace" font-size="%.1f" text-anchor="middle">%s</text>`, outerPad+(innerPad-outerPad)*0.5, cy+3.0, fSize, lbl)
		}

		titleBlock := ""
		if cfg.Fillet {
			titleBlock = fmt.Sprintf(`
          <rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="#0b1320" fill-opacity="0.92" stroke="#58a6ff" stroke-width="1.5" />
          <line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f" stroke="#58a6ff" stroke-width="1" stroke-opacity="0.6" />
          <line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f" stroke="#58a6ff" stroke-width="1" stroke-opacity="0.6" />
          <text x="%.2f" y="%.2f" fill="#e6edf3" font-family="monospace" font-size="%.1f" font-weight="bold">SVG ANIMATOR STUDIO // SPEC</text>
          <text x="%.2f" y="%.2f" fill="#58a6ff" font-family="monospace" font-size="%.1f">RES: %.0fx%.0f</text>
          <text x="%.2f" y="%.2f" fill="#58a6ff" font-family="monospace" font-size="%.1f">REV 1.2</text>`,
				tbX, tbY, tbW, tbH,
				tbX, tbY+tbH*0.5, tbX+tbW, tbY+tbH*0.5,
				tbX+tbW*0.62, tbY+tbH*0.5, tbX+tbW*0.62, tbY+tbH,
				tbX+8.0, tbY+tbH*0.35, math.Max(9.0, math.Round(tbH*0.24)),
				tbX+8.0, tbY+tbH*0.82, math.Max(8.0, math.Round(tbH*0.21)), w, h,
				tbX+tbW*0.66, tbY+tbH*0.82, math.Max(8.0, math.Round(tbH*0.21)),
			)
		}

		overlay = fmt.Sprintf(`
        <g id="frameAssembly" pointer-events="none">
          <path d="M 0,0 L %.2f,0 L %.2f,%.2f L 0,%.2f Z M %.2f,%.2f L %.2f,%.2f L %.2f,%.2f L %.2f,%.2f Z" fill="#0b1320" fill-opacity="0.94" fill-rule="evenodd" />
          <rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="none" stroke="#58a6ff" stroke-width="1.5" stroke-opacity="0.85" />
          <rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="none" stroke="#58a6ff" stroke-width="2" />
          %s
          %s
        </g>`,
			w, w, h, h, innerPad, innerPad, innerPad, h-innerPad, w-innerPad, h-innerPad, w-innerPad, innerPad,
			outerPad, outerPad, w-outerPad*2.0, h-outerPad*2.0,
			innerPad, innerPad, bw, bh,
			ticks,
			titleBlock,
		)
		return "", overlay

	case "cyber-hud":
		pad := d
		cornerLen := math.Min(85.0, math.Max(36.0, d*1.8))
		lightingOn := cfg.Lighting
		lightInt := cfg.LightInt / 100.0
		if cfg.LightInt == 0 {
			lightInt = 0.70
		}
		blurStd := "0"
		if lightingOn {
			blurStd = fmt.Sprintf("%.1f", 1.0+lightInt*4.0)
		}
		defs = fmt.Sprintf(`
        <filter id="hudGlow" x="-20%%" y="-20%%" width="140%%" height="140%%">
          <feGaussianBlur stdDeviation="%s" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>`, blurStd)

		filterAttr := ""
		if lightingOn {
			filterAttr = `filter="url(#hudGlow)"`
		}
		fontSize := math.Max(9.0, math.Min(13.0, math.Round(pad*0.36)))

		overlay = fmt.Sprintf(`
        <g id="frameAssembly" pointer-events="none">
          <path d="M 0,0 L %.2f,0 L %.2f,%.2f L 0,%.2f Z M %.2f,%.2f L %.2f,%.2f L %.2f,%.2f L %.2f,%.2f Z" fill="#060a10" fill-opacity="0.9" fill-rule="evenodd" />
          <rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="none" stroke="#00ffcc" stroke-opacity="0.35" stroke-width="1.2" />
          <g stroke="#00ffcc" stroke-width="3" fill="none" %s>
            <polyline points="%.2f,%.2f %.2f,%.2f %.2f,%.2f" />
            <polyline points="%.2f,%.2f %.2f,%.2f %.2f,%.2f" />
            <polyline points="%.2f,%.2f %.2f,%.2f %.2f,%.2f" />
            <polyline points="%.2f,%.2f %.2f,%.2f %.2f,%.2f" />
          </g>
          <line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f" stroke="#00ffcc" stroke-width="3" />
          <line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f" stroke="#00ffcc" stroke-width="3" />
          <text x="%.2f" y="%.2f" fill="#00ffcc" font-family="monospace" font-size="%.1f" letter-spacing="1.5">SYS.OPTICS // ONLINE</text>
          <text x="%.2f" y="%.2f" fill="#00ffcc" font-family="monospace" font-size="%.1f" text-anchor="end" letter-spacing="1.5">[%.0fx%.0f]</text>
        </g>`,
			w, w, h, h, pad, pad, pad, h-pad, w-pad, h-pad, w-pad, pad,
			pad, pad, w-pad*2.0, h-pad*2.0,
			filterAttr,
			pad, pad+cornerLen, pad, pad, pad+cornerLen, pad,
			w-pad-cornerLen, pad, w-pad, pad, w-pad, pad+cornerLen,
			pad, h-pad-cornerLen, pad, h-pad, pad+cornerLen, h-pad,
			w-pad-cornerLen, h-pad, w-pad, h-pad, w-pad, h-pad-cornerLen,
			w/2.0-45.0, pad, w/2.0+45.0, pad,
			w/2.0-45.0, h-pad, w/2.0+45.0, h-pad,
			pad+8.0, math.Max(12.0, pad-7.0), fontSize,
			w-pad-8.0, math.Max(12.0, pad-7.0), fontSize, w, h,
		)
		return defs, overlay

	case "mac-window":
		sideB := math.Max(8.0, math.Round(d*0.3))
		topBar := math.Max(30.0, math.Round(d*0.95))
		dotR := math.Max(4.5, math.Min(7.5, topBar*0.18))
		dotY := topBar / 2.0
		dotStart := sideB + dotR*2.2
		dotGap := dotR * 3.1
		fontSize := math.Max(10.0, math.Min(14.0, math.Round(topBar*0.36)))

		overlay = fmt.Sprintf(`
        <g id="frameAssembly" pointer-events="none">
          <path d="M 0,0 L %.2f,0 L %.2f,%.2f L 0,%.2f Z M %.2f,%.2f L %.2f,%.2f L %.2f,%.2f L %.2f,%.2f Z" fill="#161b22" fill-rule="evenodd" />
          <rect x="1" y="1" width="%.2f" height="%.2f" rx="10" fill="none" stroke="#30363d" stroke-width="2" />
          <line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f" stroke="#30363d" stroke-width="1.5" />
          <circle cx="%.2f" cy="%.2f" r="%.2f" fill="#ff5f56" />
          <circle cx="%.2f" cy="%.2f" r="%.2f" fill="#ffbd2e" />
          <circle cx="%.2f" cy="%.2f" r="%.2f" fill="#27c93f" />
          <text x="%.2f" y="%.2f" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace" font-size="%.1f" font-weight="600" text-anchor="middle">svg-animator-studio — %.0f×%.0f</text>
        </g>`,
			w, w, h, h, sideB, topBar, sideB, h-sideB, w-sideB, h-sideB, w-sideB, topBar,
			w-2.0, h-2.0,
			sideB, topBar, w-sideB, topBar,
			dotStart, dotY, dotR,
			dotStart+dotGap, dotY, dotR,
			dotStart+dotGap*2.0, dotY, dotR,
			w/2.0, dotY+4.0, fontSize, w, h,
		)
		return "", overlay

	case "crt-vintage":
		rx := math.Max(18.0, math.Round(d*0.65))
		vigOp := cfg.Shadow
		if vigOp <= 0 && cfg.Shadow == 0 {
			vigOp = 0.55
		}
		showScanlines := cfg.Fillet

		defs = fmt.Sprintf(`
        <pattern id="crtScanlines" width="4" height="4" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="4" y2="0" stroke="#000000" stroke-opacity="0.22" stroke-width="1.4" />
        </pattern>
        <radialGradient id="crtVignette" cx="50%%" cy="50%%" r="70%%">
          <stop offset="60%%" stop-color="#000000" stop-opacity="0" />
          <stop offset="100%%" stop-color="#000000" stop-opacity="%.2f" />
        </radialGradient>`, vigOp)

		scanlinesRect := ""
		if showScanlines {
			scanlinesRect = fmt.Sprintf(`<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="url(#crtScanlines)" />`, d, d, w-d*2.0, h-d*2.0)
		}

		overlay = fmt.Sprintf(`
        <g id="frameAssembly" pointer-events="none">
          %s
          <rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="url(#crtVignette)" />
          <path d="M 0,0 L %.2f,0 L %.2f,%.2f L 0,%.2f Z M %.2f,%.2f L %.2f,%.2f Q %.2f,%.2f %.2f,%.2f L %.2f,%.2f Q %.2f,%.2f %.2f,%.2f L %.2f,%.2f Q %.2f,%.2f %.2f,%.2f L %.2f,%.2f Q %.2f,%.2f %.2f,%.2f Z" fill="#18191c" fill-rule="evenodd" />
          <rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" rx="%.2f" fill="none" stroke="#0a0b0d" stroke-width="5" />
          <rect x="2" y="2" width="%.2f" height="%.2f" fill="none" stroke="#2d3139" stroke-width="4" />
          <circle cx="%.2f" cy="%.2f" r="4" fill="#2ea043" />
        </g>`,
			scanlinesRect,
			d, d, w-d*2.0, h-d*2.0,
			w, w, h, h,
			d+rx, d, w-d-rx, d, w-d, d, w-d, d+rx,
			w-d, h-d-rx, w-d, h-d, w-d-rx, h-d,
			d+rx, h-d, d, h-d, d, h-d-rx,
			d, d+rx, d, d, d+rx, d,
			d, d, w-d*2.0, h-d*2.0, rx,
			w-4.0, h-4.0,
			w-d*0.6, h-d*0.5,
		)
		return defs, overlay

	default:
		return "", ""
	}
}

// UpdateFrame replaces the frame configuration in the active scene and bumps revision.
func (s *Scene) UpdateFrame(f FrameConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.frame = f
	s.revision++
}

// GetFrame returns a copy of the scene's current frame configuration.
func (s *Scene) GetFrame() FrameConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.frame
}
