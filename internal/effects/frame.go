package effects

import (
	"fmt"
)

// BuildFrameMarkup generates the mitered frame defs and overlay elements.
func BuildFrameMarkup(p Params) Markup {
	if p.FrameStyle == "" || p.FrameStyle == "none" {
		return Markup{}
	}

	w := float64(p.Width)
	h := float64(p.Height)
	d := p.FrameDepth
	if d <= 0 {
		d = 48.0
	}
	maxD := w / 2.0
	if h/2.0 < maxD {
		maxD = h / 2.0
	}
	if d > maxD-10.0 {
		d = maxD - 10.0
	}

	shadow := p.FrameShadow
	if shadow < 0 {
		shadow = 0.55
	}
	if shadow > 1.0 {
		shadow = 1.0
	}

	switch p.FrameStyle {
	case "walnut":
		return generateWalnutFrame(w, h, d, shadow)
	case "gold":
		return generateGoldFrame(w, h, d, shadow)
	case "matte":
		return generateMatteFrame(w, h, d, shadow)
	case "obsidian":
		return generateObsidianFrame(w, h, d, shadow)
	case "tiled":
		return generateTiledFrame(w, h, d, shadow, p)
	default:
		return Markup{}
	}
}

func generateWalnutFrame(w, h, d, shadow float64) Markup {
	defs := fmt.Sprintf(`
    <linearGradient id="walnutTop" x1="0%%" y1="0%%" x2="0%%" y2="100%%">
      <stop offset="0%%" stop-color="#5a3821" />
      <stop offset="40%%" stop-color="#462a17" />
      <stop offset="85%%" stop-color="#351e0e" />
      <stop offset="100%%" stop-color="#281408" />
    </linearGradient>
    <linearGradient id="walnutLeft" x1="0%%" y1="0%%" x2="100%%" y2="0%%">
      <stop offset="0%%" stop-color="#52321c" />
      <stop offset="40%%" stop-color="#402513" />
      <stop offset="85%%" stop-color="#30190b" />
      <stop offset="100%%" stop-color="#221106" />
    </linearGradient>
    <linearGradient id="walnutRight" x1="100%%" y1="0%%" x2="0%%" y2="0%%">
      <stop offset="0%%" stop-color="#2b1509" />
      <stop offset="40%%" stop-color="#210f05" />
      <stop offset="85%%" stop-color="#180a03" />
      <stop offset="100%%" stop-color="#100501" />
    </linearGradient>
    <linearGradient id="walnutBottom" x1="0%%" y1="100%%" x2="0%%" y2="0%%">
      <stop offset="0%%" stop-color="#251106" />
      <stop offset="40%%" stop-color="#1c0b03" />
      <stop offset="85%%" stop-color="#140702" />
      <stop offset="100%%" stop-color="#0b0301" />
    </linearGradient>
    <linearGradient id="filletTop" x1="0%%" y1="0%%" x2="0%%" y2="100%%">
      <stop offset="0%%" stop-color="#dfbe76" />
      <stop offset="100%%" stop-color="#f5e1ad" />
    </linearGradient>
    <linearGradient id="filletBottom" x1="0%%" y1="0%%" x2="0%%" y2="100%%">
      <stop offset="0%%" stop-color="#805d1e" />
      <stop offset="100%%" stop-color="#5c4010" />
    </linearGradient>
    <linearGradient id="rebateShadowTop" x1="0%%" y1="0%%" x2="0%%" y2="100%%">
      <stop offset="0%%" stop-color="#000000" stop-opacity="%.2f" />
      <stop offset="100%%" stop-color="#000000" stop-opacity="0" />
    </linearGradient>
    <linearGradient id="rebateShadowLeft" x1="0%%" y1="0%%" x2="100%%" y2="0%%">
      <stop offset="0%%" stop-color="#000000" stop-opacity="%.2f" />
      <stop offset="100%%" stop-color="#000000" stop-opacity="0" />
    </linearGradient>`, shadow, shadow)

	fD := 4.0
	shD := 12.0
	if d < 24.0 {
		fD = 2.0
		shD = 6.0
	}

	overlays := fmt.Sprintf(`  <g id="frameAssembly" pointer-events="none">
    <polygon points="0,0 %.1f,0 %.1f,%.1f %.1f,%.1f" fill="url(#walnutTop)" />
    <polygon points="0,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="url(#walnutBottom)" />
    <polygon points="0,0 %.1f,%.1f %.1f,%.1f 0,%.1f" fill="url(#walnutLeft)" />
    <polygon points="%.1f,0 %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="url(#walnutRight)" />
    <line x1="0" y1="0" x2="%.1f" y2="%.1f" stroke="#000000" stroke-opacity="0.5" stroke-width="1.2" />
    <line x1="0" y1="0" x2="%.1f" y2="%.1f" stroke="#ffffff" stroke-opacity="0.12" stroke-width="0.7" />
    <line x1="%.1f" y1="0" x2="%.1f" y2="%.1f" stroke="#000000" stroke-opacity="0.55" stroke-width="1.2" />
    <line x1="%.1f" y1="0" x2="%.1f" y2="%.1f" stroke="#ffffff" stroke-opacity="0.1" stroke-width="0.7" />
    <line x1="0" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#000000" stroke-opacity="0.6" stroke-width="1.2" />
    <line x1="0" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#ffffff" stroke-opacity="0.08" stroke-width="0.7" />
    <line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#000000" stroke-opacity="0.65" stroke-width="1.2" />
    <polygon points="%.1f,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="url(#filletTop)" />
    <polygon points="%.1f,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="url(#filletBottom)" />
    <polygon points="%.1f,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="url(#filletTop)" />
    <polygon points="%.1f,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="url(#filletBottom)" />
    <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="url(#rebateShadowTop)" />
    <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="url(#rebateShadowLeft)" />
    <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="none" stroke="#000000" stroke-opacity="0.7" stroke-width="1" />
  </g>`,
		w, w-d, d, d, d,
		h, w, h, w-d, h-d, d, h-d,
		d, d, d, h-d, h,
		w, w-d, d, w-d, h-d, w, h,
		d, d, d, d,
		w, w-d, d, w, w-d, d,
		h, d, h-d, h, d, h-d,
		w, h, w-d, h-d,
		d-fD, d-fD, w-(d-fD), d-fD, w-d, d, d, d,
		d-fD, h-(d-fD), w-(d-fD), h-(d-fD), w-d, h-d, d, h-d,
		d-fD, d-fD, d, d, d, h-d, d-fD, h-(d-fD),
		w-(d-fD), d-fD, w-d, d, w-d, h-d, w-(d-fD), h-(d-fD),
		d, d, w-2*d, shD,
		d, d, shD, h-2*d,
		d, d, w-2*d, h-2*d,
	)

	return Markup{Defs: defs, Overlays: overlays}
}

func generateGoldFrame(w, h, d, shadow float64) Markup {
	defs := fmt.Sprintf(`
    <linearGradient id="goldTop" x1="0%%" y1="0%%" x2="0%%" y2="100%%">
      <stop offset="0%%" stop-color="#fff1c2" />
      <stop offset="25%%" stop-color="#e2b448" />
      <stop offset="55%%" stop-color="#ffd56b" />
      <stop offset="85%%" stop-color="#c5922e" />
      <stop offset="100%%" stop-color="#a6761c" />
    </linearGradient>
    <linearGradient id="goldLeft" x1="0%%" y1="0%%" x2="100%%" y2="0%%">
      <stop offset="0%%" stop-color="#f8e4a8" />
      <stop offset="25%%" stop-color="#d4a539" />
      <stop offset="55%%" stop-color="#f0c458" />
      <stop offset="85%%" stop-color="#b68322" />
      <stop offset="100%%" stop-color="#946513" />
    </linearGradient>
    <linearGradient id="goldRight" x1="100%%" y1="0%%" x2="0%%" y2="0%%">
      <stop offset="0%%" stop-color="#996815" />
      <stop offset="35%%" stop-color="#734b07" />
      <stop offset="70%%" stop-color="#8c5f11" />
      <stop offset="100%%" stop-color="#553402" />
    </linearGradient>
    <linearGradient id="goldBottom" x1="0%%" y1="100%%" x2="0%%" y2="0%%">
      <stop offset="0%%" stop-color="#8c5d10" />
      <stop offset="35%%" stop-color="#664004" />
      <stop offset="70%%" stop-color="#7d520c" />
      <stop offset="100%%" stop-color="#4a2c01" />
    </linearGradient>
    <linearGradient id="rebateShadowTop" x1="0%%" y1="0%%" x2="0%%" y2="100%%">
      <stop offset="0%%" stop-color="#000000" stop-opacity="%.2f" />
      <stop offset="100%%" stop-color="#000000" stop-opacity="0" />
    </linearGradient>
    <linearGradient id="rebateShadowLeft" x1="0%%" y1="0%%" x2="100%%" y2="0%%">
      <stop offset="0%%" stop-color="#000000" stop-opacity="%.2f" />
      <stop offset="100%%" stop-color="#000000" stop-opacity="0" />
    </linearGradient>`, shadow, shadow)

	shD := 10.0

	overlays := fmt.Sprintf(`  <g id="frameAssembly" pointer-events="none">
    <polygon points="0,0 %.1f,0 %.1f,%.1f %.1f,%.1f" fill="url(#goldTop)" />
    <polygon points="0,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="url(#goldBottom)" />
    <polygon points="0,0 %.1f,%.1f %.1f,%.1f 0,%.1f" fill="url(#goldLeft)" />
    <polygon points="%.1f,0 %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="url(#goldRight)" />
    <line x1="0" y1="0" x2="%.1f" y2="%.1f" stroke="#000000" stroke-opacity="0.5" stroke-width="1.2" />
    <line x1="0" y1="0" x2="%.1f" y2="%.1f" stroke="#ffffff" stroke-opacity="0.3" stroke-width="0.8" />
    <line x1="%.1f" y1="0" x2="%.1f" y2="%.1f" stroke="#000000" stroke-opacity="0.55" stroke-width="1.2" />
    <line x1="0" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#000000" stroke-opacity="0.55" stroke-width="1.2" />
    <line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#000000" stroke-opacity="0.6" stroke-width="1.2" />
    <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="url(#rebateShadowTop)" />
    <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="url(#rebateShadowLeft)" />
    <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="none" stroke="#000000" stroke-opacity="0.6" stroke-width="1" />
  </g>`,
		w, w-d, d, d, d,
		h, w, h, w-d, h-d, d, h-d,
		d, d, d, h-d, h,
		w, w-d, d, w-d, h-d, w, h,
		d, d, d, d,
		w, w-d, d,
		h, d, h-d,
		w, h, w-d, h-d,
		d, d, w-2*d, shD,
		d, d, shD, h-2*d,
		d, d, w-2*d, h-2*d,
	)

	return Markup{Defs: defs, Overlays: overlays}
}

func generateMatteFrame(w, h, d, shadow float64) Markup {
	b := 5.0
	shD := 14.0

	defs := fmt.Sprintf(`
    <linearGradient id="bevelTop" x1="0%%" y1="0%%" x2="0%%" y2="100%%">
      <stop offset="0%%" stop-color="#ffffff" />
      <stop offset="100%%" stop-color="#f2efe9" />
    </linearGradient>
    <linearGradient id="bevelBottom" x1="0%%" y1="0%%" x2="0%%" y2="100%%">
      <stop offset="0%%" stop-color="#d6d1c4" />
      <stop offset="100%%" stop-color="#b8b2a3" />
    </linearGradient>
    <linearGradient id="rebateShadowTop" x1="0%%" y1="0%%" x2="0%%" y2="100%%">
      <stop offset="0%%" stop-color="#000000" stop-opacity="%.2f" />
      <stop offset="100%%" stop-color="#000000" stop-opacity="0" />
    </linearGradient>
    <linearGradient id="rebateShadowLeft" x1="0%%" y1="0%%" x2="100%%" y2="0%%">
      <stop offset="0%%" stop-color="#000000" stop-opacity="%.2f" />
      <stop offset="100%%" stop-color="#000000" stop-opacity="0" />
    </linearGradient>`, shadow, shadow)

	overlays := fmt.Sprintf(`  <g id="frameAssembly" pointer-events="none">
    <polygon points="0,0 %.1f,0 %.1f,%.1f %.1f,%.1f" fill="#f8f6f0" />
    <polygon points="0,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="#f4f1ea" />
    <polygon points="0,0 %.1f,%.1f %.1f,%.1f 0,%.1f" fill="#f6f3ec" />
    <polygon points="%.1f,0 %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="#eeeae0" />
    <polygon points="%.1f,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="url(#bevelTop)" />
    <polygon points="%.1f,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="url(#bevelBottom)" />
    <polygon points="%.1f,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="url(#bevelTop)" />
    <polygon points="%.1f,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="url(#bevelBottom)" />
    <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="url(#rebateShadowTop)" />
    <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="url(#rebateShadowLeft)" />
    <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="none" stroke="#000000" stroke-opacity="0.4" stroke-width="0.8" />
  </g>`,
		w, w-(d-b), d-b, d-b, d-b,
		h, w, h, w-(d-b), h-(d-b), d-b, h-(d-b),
		d-b, d-b, d-b, h-(d-b), h,
		w, w-(d-b), d-b, w-(d-b), h-(d-b), w, h,
		d-b, d-b, w-(d-b), d-b, w-d, d, d, d,
		d-b, h-(d-b), w-(d-b), h-(d-b), w-d, h-d, d, h-d,
		d-b, d-b, d, d, d, h-d, d-b, h-(d-b),
		w-(d-b), d-b, w-d, d, w-d, h-d, w-(d-b), h-(d-b),
		d, d, w-2*d, shD,
		d, d, shD, h-2*d,
		d, d, w-2*d, h-2*d,
	)

	return Markup{Defs: defs, Overlays: overlays}
}

func generateObsidianFrame(w, h, d, shadow float64) Markup {
	shD := 12.0
	defs := fmt.Sprintf(`
    <linearGradient id="obsidianTop" x1="0%%" y1="0%%" x2="0%%" y2="100%%">
      <stop offset="0%%" stop-color="#2a2c30" />
      <stop offset="50%%" stop-color="#1e2023" />
      <stop offset="100%%" stop-color="#141517" />
    </linearGradient>
    <linearGradient id="obsidianLeft" x1="0%%" y1="0%%" x2="100%%" y2="0%%">
      <stop offset="0%%" stop-color="#26282c" />
      <stop offset="50%%" stop-color="#1b1c1e" />
      <stop offset="100%%" stop-color="#121315" />
    </linearGradient>
    <linearGradient id="obsidianRight" x1="100%%" y1="0%%" x2="0%%" y2="0%%">
      <stop offset="0%%" stop-color="#17181a" />
      <stop offset="50%%" stop-color="#101112" />
      <stop offset="100%%" stop-color="#0a0a0b" />
    </linearGradient>
    <linearGradient id="obsidianBottom" x1="0%%" y1="100%%" x2="0%%" y2="0%%">
      <stop offset="0%%" stop-color="#131415" />
      <stop offset="50%%" stop-color="#0e0e0f" />
      <stop offset="100%%" stop-color="#060607" />
    </linearGradient>
    <linearGradient id="rebateShadowTop" x1="0%%" y1="0%%" x2="0%%" y2="100%%">
      <stop offset="0%%" stop-color="#000000" stop-opacity="%.2f" />
      <stop offset="100%%" stop-color="#000000" stop-opacity="0" />
    </linearGradient>
    <linearGradient id="rebateShadowLeft" x1="0%%" y1="0%%" x2="100%%" y2="0%%">
      <stop offset="0%%" stop-color="#000000" stop-opacity="%.2f" />
      <stop offset="100%%" stop-color="#000000" stop-opacity="0" />
    </linearGradient>`, shadow, shadow)

	overlays := fmt.Sprintf(`  <g id="frameAssembly" pointer-events="none">
    <polygon points="0,0 %.1f,0 %.1f,%.1f %.1f,%.1f" fill="url(#obsidianTop)" />
    <polygon points="0,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="url(#obsidianBottom)" />
    <polygon points="0,0 %.1f,%.1f %.1f,%.1f 0,%.1f" fill="url(#obsidianLeft)" />
    <polygon points="%.1f,0 %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="url(#obsidianRight)" />
    <line x1="0" y1="0" x2="%.1f" y2="%.1f" stroke="#000000" stroke-opacity="0.6" stroke-width="1.2" />
    <line x1="0" y1="0" x2="%.1f" y2="%.1f" stroke="#ffffff" stroke-opacity="0.08" stroke-width="0.8" />
    <line x1="%.1f" y1="0" x2="%.1f" y2="%.1f" stroke="#000000" stroke-opacity="0.6" stroke-width="1.2" />
    <line x1="0" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#000000" stroke-opacity="0.65" stroke-width="1.2" />
    <line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#000000" stroke-opacity="0.7" stroke-width="1.2" />
    <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="url(#rebateShadowTop)" />
    <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="url(#rebateShadowLeft)" />
    <rect x="0" y="0" width="%.1f" height="%.1f" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1" />
    <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="none" stroke="#000000" stroke-opacity="0.8" stroke-width="1" />
  </g>`,
		w, w-d, d, d, d,
		h, w, h, w-d, h-d, d, h-d,
		d, d, d, h-d, h,
		w, w-d, d, w-d, h-d, w, h,
		d, d, d, d,
		w, w-d, d,
		h, d, h-d,
		w, h, w-d, h-d,
		d, d, w-2*d, shD,
		d, d, shD, h-2*d,
		w, h,
		d, d, w-2*d, h-2*d,
	)

	return Markup{Defs: defs, Overlays: overlays}
}

func generateTiledFrame(w, h, d, shadow float64, p Params) Markup {
	sliceW := p.FrameMouldingWidth
	if sliceW <= 0 {
		sliceW = 120.0
	}
	shD := 12.0

	var patC string
	if p.FrameMouldingData != "" {
		patC = fmt.Sprintf(`<image href="%s" width="%.1f" height="%.1f" preserveAspectRatio="none" />`, p.FrameMouldingData, sliceW, d)
	} else {
		patC = fmt.Sprintf(`<rect width="%.1f" height="%.1f" fill="#6a472d" /><line x1="0" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#875d3c" stroke-width="3" /><line x1="0" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#462c19" stroke-width="3" /><line x1="0" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#9e704a" stroke-width="4" /><line x1="0" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#372010" stroke-width="4" /><line x1="0" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#b8855a" stroke-width="2" /><line x1="0" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#221307" stroke-width="3" />`, sliceW, d, d*0.18, sliceW, d*0.18, d*0.32, sliceW, d*0.32, d*0.52, sliceW, d*0.52, d*0.68, sliceW, d*0.68, d*0.84, sliceW, d*0.84, d*0.96, sliceW, d*0.96)
	}

	defs := fmt.Sprintf(`
    <pattern id="mouldingTop" width="%.1f" height="%.1f" patternUnits="userSpaceOnUse">%s</pattern>
    <pattern id="mouldingBottom" width="%.1f" height="%.1f" patternUnits="userSpaceOnUse" patternTransform="matrix(1 0 0 -1 0 %.1f)">%s</pattern>
    <pattern id="mouldingLeft" width="%.1f" height="%.1f" patternUnits="userSpaceOnUse" patternTransform="matrix(0 1 1 0 0 0)">%s</pattern>
    <pattern id="mouldingRight" width="%.1f" height="%.1f" patternUnits="userSpaceOnUse" patternTransform="matrix(0 1 -1 0 %.1f 0)">%s</pattern>
    <linearGradient id="rebateShadowTop" x1="0%%" y1="0%%" x2="0%%" y2="100%%">
      <stop offset="0%%" stop-color="#000000" stop-opacity="%.2f" />
      <stop offset="100%%" stop-color="#000000" stop-opacity="0" />
    </linearGradient>
    <linearGradient id="rebateShadowLeft" x1="0%%" y1="0%%" x2="100%%" y2="0%%">
      <stop offset="0%%" stop-color="#000000" stop-opacity="%.2f" />
      <stop offset="100%%" stop-color="#000000" stop-opacity="0" />
    </linearGradient>`, sliceW, d, patC, sliceW, d, h, patC, sliceW, d, patC, sliceW, d, w, patC, shadow, shadow)

	overlays := fmt.Sprintf(`  <g id="frameAssembly" pointer-events="none">
    <polygon points="0,0 %.1f,0 %.1f,%.1f %.1f,%.1f" fill="url(#mouldingTop)" />
    <polygon points="0,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="url(#mouldingBottom)" />
    <polygon points="0,0 %.1f,%.1f %.1f,%.1f 0,%.1f" fill="url(#mouldingLeft)" />
    <polygon points="%.1f,0 %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="url(#mouldingRight)" />
    <line x1="0" y1="0" x2="%.1f" y2="%.1f" stroke="#000000" stroke-opacity="0.55" stroke-width="1.2" />
    <line x1="0" y1="0" x2="%.1f" y2="%.1f" stroke="#ffffff" stroke-opacity="0.18" stroke-width="0.7" />
    <line x1="%.1f" y1="0" x2="%.1f" y2="%.1f" stroke="#000000" stroke-opacity="0.55" stroke-width="1.2" />
    <line x1="0" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#000000" stroke-opacity="0.55" stroke-width="1.2" />
    <line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#000000" stroke-opacity="0.6" stroke-width="1.2" />
    <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="url(#rebateShadowTop)" />
    <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="url(#rebateShadowLeft)" />
    <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="none" stroke="#000000" stroke-opacity="0.65" stroke-width="1" />
  </g>`,
		w, w-d, d, d, d,
		h, w, h, w-d, h-d, d, h-d,
		d, d, d, h-d, h,
		w, w-d, d, w-d, h-d, w, h,
		d, d, d, d,
		w, w-d, d,
		h, d, h-d,
		w, h, w-d, h-d,
		d, d, w-2*d, shD,
		d, d, shD, h-2*d,
		d, d, w-2*d, h-2*d,
	)

	return Markup{Defs: defs, Overlays: overlays}
}