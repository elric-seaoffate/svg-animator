package effects

import "fmt"

func init() {
	Register("tilt-shift", generateTiltShift)
	Register("miniature-focus", generateTiltShift)
}

func generateTiltShift(p Params) Markup {
	tx1, ty1 := CalcTranslation(p.StartScale, p.StartX, p.StartY)
	tx2, ty2 := CalcTranslation(p.EndScale, p.EndX, p.EndY)

	var keyframes string
	switch p.CameraMotion {
	case "ken-burns":
		keyframes = fmt.Sprintf(`
      @keyframes animEffect {
        0%%   { transform: translate(%.2f%%, %.2f%%) scale(%.2f); }
        100%% { transform: translate(%.2f%%, %.2f%%) scale(%.2f); }
      }`, tx1, ty1, p.StartScale, tx2, ty2, p.EndScale)
	case "perspective-tilt":
		keyframes = fmt.Sprintf(`
      @keyframes animEffect {
        0%%   { transform: perspective(1200px) translate(50%%, 50%%) rotateX(%.1fdeg) rotateY(%.1fdeg) translate(-50%%, -50%%) translate(%.2f%%, %.2f%%) scale(%.2f); }
        100%% { transform: perspective(1200px) translate(50%%, 50%%) rotateX(%.1fdeg) rotateY(%.1fdeg) translate(-50%%, -50%%) translate(%.2f%%, %.2f%%) scale(%.2f); }
      }`, p.StartPitch, p.StartYaw, tx1, ty1, p.StartScale, p.EndPitch, p.EndYaw, tx2, ty2, p.EndScale)
	default:
		keyframes = `
      @keyframes animEffect {
        0%   { transform: none; }
        100% { transform: none; }
      }`
	}

	pos := p.TiltPosition
	halfBand := p.TiltBandWidth / 2.0
	feather := halfBand * 0.75

	stop1 := pos - halfBand - feather
	stop2 := pos - halfBand
	stop3 := pos + halfBand
	stop4 := pos + halfBand + feather

	if stop1 < 0 {
		stop1 = 0
	}
	if stop2 < 0 {
		stop2 = 0
	}
	if stop3 > 100 {
		stop3 = 100
	}
	if stop4 > 100 {
		stop4 = 100
	}

	defs := fmt.Sprintf(`
    <filter id="tiltBlurFilter">
      <feGaussianBlur stdDeviation="%.1f" />
    </filter>
    <linearGradient id="tiltMaskGrad" x1="0%%" y1="0%%" x2="0%%" y2="100%%">
      <stop offset="0%%" stop-color="#ffffff" />
      <stop offset="%.1f%%" stop-color="#ffffff" />
      <stop offset="%.1f%%" stop-color="#000000" />
      <stop offset="%.1f%%" stop-color="#000000" />
      <stop offset="%.1f%%" stop-color="#ffffff" />
      <stop offset="100%%" stop-color="#ffffff" />
    </linearGradient>
    <mask id="tiltMask">
      <rect width="100%%" height="100%%" fill="url(#tiltMaskGrad)" />
    </mask>`,
		p.TiltBlur,
		stop1, stop2, stop3, stop4,
	)

	overlays := `  <use href="#animTarget" xlink:href="#animTarget" filter="url(#tiltBlurFilter)" mask="url(#tiltMask)" pointer-events="none" />`

	return Markup{
		Defs:      defs,
		Keyframes: keyframes,
		Overlays:  overlays,
	}
}