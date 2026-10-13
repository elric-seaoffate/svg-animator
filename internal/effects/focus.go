package effects

import "fmt"

func init() {
	Register("focus-pull", generateFocus)
	Register("rack-focus", generateFocus)
}

func generateFocus(p Params) Markup {
	var blurAnim string
	switch p.LoopMode {
	case "pingpong":
		blurAnim = fmt.Sprintf(`<animate attributeName="stdDeviation" values="%.1f; %.1f; %.1f" dur="%s" repeatCount="indefinite" />`,
			p.StartBlur, p.EndBlur, p.StartBlur, p.Duration)
	case "loop":
		blurAnim = fmt.Sprintf(`<animate attributeName="stdDeviation" values="%.1f; %.1f" dur="%s" repeatCount="indefinite" />`,
			p.StartBlur, p.EndBlur, p.Duration)
	default: // "once"
		blurAnim = fmt.Sprintf(`<animate attributeName="stdDeviation" from="%.1f" to="%.1f" dur="%s" fill="freeze" />`,
			p.StartBlur, p.EndBlur, p.Duration)
	}

	filterDef := fmt.Sprintf(`
    <filter id="focusFilter" x="-10%%" y="-10%%" width="120%%" height="120%%">
      <feGaussianBlur stdDeviation="%.1f">
        %s
      </feGaussianBlur>
    </filter>`,
		p.StartBlur,
		blurAnim,
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

	default: // "static" - no pan or zoom
		keyframes = `
      @keyframes animEffect {
        0%   { transform: none; }
        100% { transform: none; }
      }`
	}

	return Markup{
		Defs:       filterDef,
		Keyframes:  keyframes,
		FilterAttr: `filter="url(#focusFilter)"`,
	}
}