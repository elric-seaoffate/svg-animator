package effects

import "fmt"

func init() {
	Register("exposure-pull", generateExposure)
	Register("color-grade", generateExposure)
}

// calcSlopes computes the red, green, and blue linear gains based on exposure and temperature.
func calcSlopes(exposure, temp float64) (float64, float64, float64) {
	t := temp / 100.0
	r := exposure * (1.0 + t)
	g := exposure * (1.0 + t*0.15)
	b := exposure * (1.0 - t)
	if r < 0.0 {
		r = 0.0
	}
	if g < 0.0 {
		g = 0.0
	}
	if b < 0.0 {
		b = 0.0
	}
	return r, g, b
}

func generateExposure(p Params) Markup {
	r1, g1, b1 := calcSlopes(p.StartExposure, p.StartTemp)
	r2, g2, b2 := calcSlopes(p.EndExposure, p.EndTemp)

	var rAnim, gAnim, bAnim string
	switch p.LoopMode {
	case "pingpong":
		rAnim = fmt.Sprintf(`<animate attributeName="slope" values="%.3f; %.3f; %.3f" dur="%s" repeatCount="indefinite" />`, r1, r2, r1, p.Duration)
		gAnim = fmt.Sprintf(`<animate attributeName="slope" values="%.3f; %.3f; %.3f" dur="%s" repeatCount="indefinite" />`, g1, g2, g1, p.Duration)
		bAnim = fmt.Sprintf(`<animate attributeName="slope" values="%.3f; %.3f; %.3f" dur="%s" repeatCount="indefinite" />`, b1, b2, b1, p.Duration)
	case "loop":
		rAnim = fmt.Sprintf(`<animate attributeName="slope" values="%.3f; %.3f" dur="%s" repeatCount="indefinite" />`, r1, r2, p.Duration)
		gAnim = fmt.Sprintf(`<animate attributeName="slope" values="%.3f; %.3f" dur="%s" repeatCount="indefinite" />`, g1, g2, p.Duration)
		bAnim = fmt.Sprintf(`<animate attributeName="slope" values="%.3f; %.3f" dur="%s" repeatCount="indefinite" />`, b1, b2, p.Duration)
	default: // "once"
		rAnim = fmt.Sprintf(`<animate attributeName="slope" from="%.3f" to="%.3f" dur="%s" fill="freeze" />`, r1, r2, p.Duration)
		gAnim = fmt.Sprintf(`<animate attributeName="slope" from="%.3f" to="%.3f" dur="%s" fill="freeze" />`, g1, g2, p.Duration)
		bAnim = fmt.Sprintf(`<animate attributeName="slope" from="%.3f" to="%.3f" dur="%s" fill="freeze" />`, b1, b2, p.Duration)
	}

	filterDef := fmt.Sprintf(`
    <filter id="exposureFilter">
      <feComponentTransfer>
        <feFuncR type="linear" slope="%.3f">%s</feFuncR>
        <feFuncG type="linear" slope="%.3f">%s</feFuncG>
        <feFuncB type="linear" slope="%.3f">%s</feFuncB>
      </feComponentTransfer>
    </filter>`,
		r1, rAnim,
		g1, gAnim,
		b1, bAnim,
	)

	var keyframes string
	switch p.CameraMotion {
	case "ken-burns":
		tx1, ty1 := CalcTranslation(p.StartScale, p.StartX, p.StartY)
		tx2, ty2 := CalcTranslation(p.EndScale, p.EndX, p.EndY)
		keyframes = fmt.Sprintf(`
      @keyframes animEffect {
        0%%   { transform: translate(%.2f%%, %.2f%%) scale(%.2f); }
        100%% { transform: translate(%.2f%%, %.2f%%) scale(%.2f); }
      }`, tx1, ty1, p.StartScale, tx2, ty2, p.EndScale)

	case "perspective-tilt":
		tx1, ty1 := CalcTranslation(p.StartScale, p.StartX, p.StartY)
		tx2, ty2 := CalcTranslation(p.EndScale, p.EndX, p.EndY)
		keyframes = fmt.Sprintf(`
      @keyframes animEffect {
        0%%   { transform: perspective(1200px) translate(50%%, 50%%) rotateX(%.1fdeg) rotateY(%.1fdeg) translate(-50%%, -50%%) translate(%.2f%%, %.2f%%) scale(%.2f); }
        100%% { transform: perspective(1200px) translate(50%%, 50%%) rotateX(%.1fdeg) rotateY(%.1fdeg) translate(-50%%, -50%%) translate(%.2f%%, %.2f%%) scale(%.2f); }
      }`, p.StartPitch, p.StartYaw, tx1, ty1, p.StartScale, p.EndPitch, p.EndYaw, tx2, ty2, p.EndScale)

	default: // "static"
		keyframes = `
      @keyframes animEffect {
        0%   { transform: none; }
        100% { transform: none; }
      }`
	}

	return Markup{
		Defs:       filterDef,
		Keyframes:  keyframes,
		FilterAttr: `filter="url(#exposureFilter)"`,
	}
}