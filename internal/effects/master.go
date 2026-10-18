package effects

import (
	"fmt"
	"math"
)

// BuildMasterMarkup generates chained optical filters, overlays, and camera keyframes.
func BuildMasterMarkup(p Params) Markup {
	var defs string
	var currentIn = "SourceGraphic"
	var filters string

	// 1. Focus Pull
	if p.StartBlur > 0 || p.EndBlur > 0 {
		var anim string
		switch p.LoopMode {
		case "pingpong":
			anim = fmt.Sprintf(`<animate attributeName="stdDeviation" values="%.1f; %.1f; %.1f" dur="%s" repeatCount="indefinite" />`, p.StartBlur, p.EndBlur, p.StartBlur, p.Duration)
		case "loop":
			anim = fmt.Sprintf(`<animate attributeName="stdDeviation" values="%.1f; %.1f" dur="%s" repeatCount="indefinite" />`, p.StartBlur, p.EndBlur, p.Duration)
		default:
			anim = fmt.Sprintf(`<animate attributeName="stdDeviation" from="%.1f" to="%.1f" dur="%s" fill="freeze" />`, p.StartBlur, p.EndBlur, p.Duration)
		}
		filters += fmt.Sprintf(`<feGaussianBlur in="%s" stdDeviation="%.1f" result="focusOut">%s</feGaussianBlur>`, currentIn, p.StartBlur, anim)
		currentIn = "focusOut"
	}

	// 2. Liquid Ripple
	if p.StartWaveScale > 0 || p.EndWaveScale > 0 {
		f1 := p.WaveFreq
		if f1 <= 0 {
			f1 = 0.02
		}
		f2, f3, f4 := f1*1.6, f1*0.7, f1*1.3

		var anim string
		switch p.LoopMode {
		case "pingpong":
			anim = fmt.Sprintf(`<animate attributeName="scale" values="%.1f; %.1f; %.1f" dur="%s" repeatCount="indefinite" />`, p.StartWaveScale, p.EndWaveScale, p.StartWaveScale, p.Duration)
		case "loop":
			anim = fmt.Sprintf(`<animate attributeName="scale" values="%.1f; %.1f" dur="%s" repeatCount="indefinite" />`, p.StartWaveScale, p.EndWaveScale, p.Duration)
		default:
			anim = fmt.Sprintf(`<animate attributeName="scale" from="%.1f" to="%.1f" dur="%s" fill="freeze" />`, p.StartWaveScale, p.EndWaveScale, p.Duration)
		}

		filters += fmt.Sprintf(`
      <feTurbulence type="fractalNoise" baseFrequency="%.4f %.4f" numOctaves="2" result="rippleNoise">
        <animate attributeName="baseFrequency" values="%.4f %.4f; %.4f %.4f; %.4f %.4f; %.4f %.4f; %.4f %.4f" dur="%s" repeatCount="indefinite" />
      </feTurbulence>
      <feDisplacementMap in="%s" in2="rippleNoise" scale="%.1f" xChannelSelector="R" yChannelSelector="G" result="liquidOut">%s</feDisplacementMap>`,
			f1, f2, f1, f2, f2, f3, f3, f4, f4, f1, f1, f2, p.Duration, currentIn, p.StartWaveScale, anim)
		currentIn = "liquidOut"
	}

	// 3. Motion Blur
	if p.StartMotionBlur > 0 || p.EndMotionBlur > 0 {
		rad := p.MotionAngle * (math.Pi / 180.0)
		cosA, sinA := math.Abs(math.Cos(rad)), math.Abs(math.Sin(rad))
		sX, sY := p.StartMotionBlur*cosA, p.StartMotionBlur*sinA
		eX, eY := p.EndMotionBlur*cosA, p.EndMotionBlur*sinA

		var anim string
		switch p.LoopMode {
		case "pingpong":
			anim = fmt.Sprintf(`<animate attributeName="stdDeviation" values="%.1f %.1f; %.1f %.1f; %.1f %.1f" dur="%s" repeatCount="indefinite" />`, sX, sY, eX, eY, sX, sY, p.Duration)
		case "loop":
			anim = fmt.Sprintf(`<animate attributeName="stdDeviation" values="%.1f %.1f; %.1f %.1f" dur="%s" repeatCount="indefinite" />`, sX, sY, eX, eY, p.Duration)
		default:
			anim = fmt.Sprintf(`<animate attributeName="stdDeviation" from="%.1f %.1f" to="%.1f %.1f" dur="%s" fill="freeze" />`, sX, sY, eX, eY, p.Duration)
		}
		filters += fmt.Sprintf(`<feGaussianBlur in="%s" stdDeviation="%.1f %.1f" result="motionOut">%s</feGaussianBlur>`, currentIn, sX, sY, anim)
		currentIn = "motionOut"
	}

	// 4. Chromatic Aberration
	if p.ChromaOffset > 0 {
		rad := p.ChromaAngle * (math.Pi / 180.0)
		dx, dy := p.ChromaOffset*math.Cos(rad), p.ChromaOffset*math.Sin(rad)
		filters += fmt.Sprintf(`
      <feColorMatrix in="%s" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="redC" />
      <feOffset in="redC" dx="%.2f" dy="%.2f" result="redO" />
      <feColorMatrix in="%s" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="greenC" />
      <feColorMatrix in="%s" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blueC" />
      <feOffset in="blueC" dx="%.2f" dy="%.2f" result="blueO" />
      <feBlend mode="screen" in="redO" in2="greenC" result="rgB" />
      <feBlend mode="screen" in="rgB" in2="blueO" result="chromaOut" />`, currentIn, dx, dy, currentIn, currentIn, -dx, -dy)
		currentIn = "chromaOut"
	}

	// 5. Exposure / Color Grade
	if p.StartExposure != 1.0 || p.EndExposure != 1.0 || p.StartTemp != 0 || p.EndTemp != 0 {
		sR, sG, sB := calcSlopes(p.StartExposure, p.StartTemp)
		eR, eG, eB := calcSlopes(p.EndExposure, p.EndTemp)

		var rA, gA, bA string
		switch p.LoopMode {
		case "pingpong":
			rA = fmt.Sprintf(`<animate attributeName="slope" values="%.3f; %.3f; %.3f" dur="%s" repeatCount="indefinite" />`, sR, eR, sR, p.Duration)
			gA = fmt.Sprintf(`<animate attributeName="slope" values="%.3f; %.3f; %.3f" dur="%s" repeatCount="indefinite" />`, sG, eG, sG, p.Duration)
			bA = fmt.Sprintf(`<animate attributeName="slope" values="%.3f; %.3f; %.3f" dur="%s" repeatCount="indefinite" />`, sB, eB, sB, p.Duration)
		case "loop":
			rA = fmt.Sprintf(`<animate attributeName="slope" values="%.3f; %.3f" dur="%s" repeatCount="indefinite" />`, sR, eR, p.Duration)
			gA = fmt.Sprintf(`<animate attributeName="slope" values="%.3f; %.3f" dur="%s" repeatCount="indefinite" />`, sG, eG, p.Duration)
			bA = fmt.Sprintf(`<animate attributeName="slope" values="%.3f; %.3f" dur="%s" repeatCount="indefinite" />`, sB, eB, p.Duration)
		default:
			rA = fmt.Sprintf(`<animate attributeName="slope" from="%.3f" to="%.3f" dur="%s" fill="freeze" />`, sR, eR, p.Duration)
			gA = fmt.Sprintf(`<animate attributeName="slope" from="%.3f" to="%.3f" dur="%s" fill="freeze" />`, sG, eG, p.Duration)
			bA = fmt.Sprintf(`<animate attributeName="slope" from="%.3f" to="%.3f" dur="%s" fill="freeze" />`, sB, eB, p.Duration)
		}

		filters += fmt.Sprintf(`
      <feComponentTransfer in="%s" result="expOut">
        <feFuncR type="linear" slope="%.3f">%s</feFuncR>
        <feFuncG type="linear" slope="%.3f">%s</feFuncG>
        <feFuncB type="linear" slope="%.3f">%s</feFuncB>
      </feComponentTransfer>`, currentIn, sR, rA, sG, gA, sB, bA)
		currentIn = "expOut"
	}

	// 6. Film Grain
	if p.GrainIntensity > 0 {
		filters += fmt.Sprintf(`
      <feTurbulence type="fractalNoise" baseFrequency="%.3f" numOctaves="3" result="noise">
        <animate attributeName="seed" values="1;17;43;68;91;1" dur="0.32s" repeatCount="indefinite" />
      </feTurbulence>
      <feColorMatrix type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 %.3f 0" result="grain" />
      <feBlend mode="overlay" in="%s" in2="grain" result="grainOut" />`, p.GrainSize, p.GrainIntensity, currentIn)
		currentIn = "grainOut"
	}

	var filterAttr string
	if filters != "" {
		defs += fmt.Sprintf(`<filter id="masterFilter" x="-20%%" y="-20%%" width="140%%" height="140%%">%s</filter>`, filters)
		filterAttr = `filter="url(#masterFilter)"`
	}

	// Tilt-Shift Overlay
	var overlays string
	if p.TiltBlur > 0 {
		pos := p.TiltPosition
		halfBand := p.TiltBandWidth / 2.0
		feather := halfBand * 0.75
		s1 := math.Max(0, pos-halfBand-feather)
		s2 := math.Max(0, pos-halfBand)
		s3 := math.Min(100, pos+halfBand)
		s4 := math.Min(100, pos+halfBand+feather)

		defs += fmt.Sprintf(`
      <filter id="tiltBlurFilter"><feGaussianBlur stdDeviation="%.1f" /></filter>
      <linearGradient id="tiltMaskGrad" x1="0%%" y1="0%%" x2="0%%" y2="100%%">
        <stop offset="0%%" stop-color="#ffffff" />
        <stop offset="%.1f%%" stop-color="#ffffff" />
        <stop offset="%.1f%%" stop-color="#000000" />
        <stop offset="%.1f%%" stop-color="#000000" />
        <stop offset="%.1f%%" stop-color="#ffffff" />
        <stop offset="100%%" stop-color="#ffffff" />
      </linearGradient>
      <mask id="tiltMask"><rect width="100%%" height="100%%" fill="url(#tiltMaskGrad)" /></mask>`, p.TiltBlur, s1, s2, s3, s4)

		overlays += `  <use href="#animTarget" xlink:href="#animTarget" filter="url(#tiltBlurFilter)" mask="url(#tiltMask)" pointer-events="none" />`
	}

	// Keyframes
	var keyframes string
	baseScale := p.StartScale

	switch p.CameraMotion {
	case "handheld-drift":
		if baseScale < 1.05 {
			baseScale = 1.05
		}
		baseTx, baseTy := CalcTranslation(baseScale, p.StartX, p.StartY)
		s, b, r := p.DriftSway, p.DriftBreathe/100.0, p.DriftRoll
		keyframes = fmt.Sprintf(`
      @keyframes animEffect {
        0%% { transform: translate(%.2f%%, %.2f%%) rotate(0deg) scale(%.3f); }
        14%% { transform: translate(%.2f%%, %.2f%%) rotate(%.2fdeg) scale(%.3f); }
        28%% { transform: translate(%.2f%%, %.2f%%) rotate(%.2fdeg) scale(%.3f); }
        44%% { transform: translate(%.2f%%, %.2f%%) rotate(%.2fdeg) scale(%.3f); }
        59%% { transform: translate(%.2f%%, %.2f%%) rotate(%.2fdeg) scale(%.3f); }
        73%% { transform: translate(%.2f%%, %.2f%%) rotate(%.2fdeg) scale(%.3f); }
        88%% { transform: translate(%.2f%%, %.2f%%) rotate(%.2fdeg) scale(%.3f); }
        100%% { transform: translate(%.2f%%, %.2f%%) rotate(0deg) scale(%.3f); }
      }`,
			baseTx, baseTy, baseScale,
			baseTx+(0.55*s), baseTy-(0.42*s), 0.35*r, baseScale*(1.0+0.45*b),
			baseTx-(0.38*s), baseTy+(0.65*s), -0.55*r, baseScale*(1.0+0.85*b),
			baseTx-(0.75*s), baseTy-(0.25*s), 0.40*r, baseScale*(1.0+0.30*b),
			baseTx+(0.45*s), baseTy+(0.55*s), -0.30*r, baseScale*(1.0+1.00*b),
			baseTx-(0.50*s), baseTy-(0.58*s), 0.50*r, baseScale*(1.0+0.50*b),
			baseTx+(0.32*s), baseTy+(0.22*s), -0.25*r, baseScale*(1.0+0.15*b),
			baseTx, baseTy, baseScale)
	case "ken-burns":
		tx1, ty1 := CalcTranslation(p.StartScale, p.StartX, p.StartY)
		tx2, ty2 := CalcTranslation(p.EndScale, p.EndX, p.EndY)
		w := p.GateWeave
		if w > 0 {
			keyframes = fmt.Sprintf(`
        @keyframes animEffect {
          0%%   { transform: translate(%.2f%%, %.2f%%) translate(0px, 0px) scale(%.3f); }
          15%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
          32%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
          50%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
          68%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
          84%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
          100%% { transform: translate(%.2f%%, %.2f%%) translate(0px, 0px) scale(%.3f); }
        }`, tx1, ty1, p.StartScale, tx1+(tx2-tx1)*0.15, ty1+(ty2-ty1)*0.15, 0.65*w, -0.45*w, p.StartScale+(p.EndScale-p.StartScale)*0.15, tx1+(tx2-tx1)*0.32, ty1+(ty2-ty1)*0.32, -0.55*w, 0.70*w, p.StartScale+(p.EndScale-p.StartScale)*0.32, tx1+(tx2-tx1)*0.50, ty1+(ty2-ty1)*0.50, 0.80*w, 0.35*w, p.StartScale+(p.EndScale-p.StartScale)*0.50, tx1+(tx2-tx1)*0.68, ty1+(ty2-ty1)*0.68, -0.70*w, -0.60*w, p.StartScale+(p.EndScale-p.StartScale)*0.68, tx1+(tx2-tx1)*0.84, ty1+(ty2-ty1)*0.84, 0.45*w, 0.50*w, p.StartScale+(p.EndScale-p.StartScale)*0.84, tx2, ty2, p.EndScale)
		} else {
			keyframes = fmt.Sprintf(`
        @keyframes animEffect {
          0%%   { transform: translate(%.2f%%, %.2f%%) scale(%.3f); }
          100%% { transform: translate(%.2f%%, %.2f%%) scale(%.3f); }
        }`, tx1, ty1, p.StartScale, tx2, ty2, p.EndScale)
		}
	case "perspective-tilt":
		tx1, ty1 := CalcTranslation(p.StartScale, p.StartX, p.StartY)
		tx2, ty2 := CalcTranslation(p.EndScale, p.EndX, p.EndY)
		keyframes = fmt.Sprintf(`
      @keyframes animEffect {
        0%%   { transform: perspective(1200px) translate(50%%, 50%%) rotateX(%.1fdeg) rotateY(%.1fdeg) translate(-50%%, -50%%) translate(%.2f%%, %.2f%%) scale(%.2f); }
        100%% { transform: perspective(1200px) translate(50%%, 50%%) rotateX(%.1fdeg) rotateY(%.1fdeg) translate(-50%%, -50%%) translate(%.2f%%, %.2f%%) scale(%.2f); }
      }`, p.StartPitch, p.StartYaw, tx1, ty1, p.StartScale, p.EndPitch, p.EndYaw, tx2, ty2, p.EndScale)
	default:
		tx1, ty1 := CalcTranslation(baseScale, p.StartX, p.StartY)
		w := p.GateWeave
		if w > 0 {
			keyframes = fmt.Sprintf(`
        @keyframes animEffect {
          0%%   { transform: translate(%.2f%%, %.2f%%) translate(0px, 0px) scale(%.3f); }
          15%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
          32%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
          50%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
          68%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
          84%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
          100%% { transform: translate(%.2f%%, %.2f%%) translate(0px, 0px) scale(%.3f); }
        }`, tx1, ty1, baseScale, tx1, ty1, 0.65*w, -0.45*w, baseScale, tx1, ty1, -0.55*w, 0.70*w, baseScale, tx1, ty1, 0.80*w, 0.35*w, baseScale, tx1, ty1, -0.70*w, -0.60*w, baseScale, tx1, ty1, 0.45*w, 0.50*w, baseScale, tx1, ty1, baseScale)
		} else {
			keyframes = fmt.Sprintf(`
        @keyframes animEffect {
          0%%   { transform: translate(%.2f%%, %.2f%%) scale(%.3f); }
          100%% { transform: translate(%.2f%%, %.2f%%) scale(%.3f); }
        }`, tx1, ty1, baseScale, tx1, ty1, baseScale)
		}
	}

	return Markup{
		Defs:       defs,
		Keyframes:  keyframes,
		FilterAttr: filterAttr,
		Overlays:   overlays,
	}
}