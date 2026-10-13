package effects

import (
	"fmt"
	"math"
)

func init() {
	Register("motion-blur", generateMotionBlur)
	Register("shutter-blur", generateMotionBlur)
}

func generateMotionBlur(p Params) Markup {
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

	rad := p.MotionAngle * (math.Pi / 180.0)
	cosA := math.Abs(math.Cos(rad))
	sinA := math.Abs(math.Sin(rad))

	sX := p.StartMotionBlur * cosA
	sY := p.StartMotionBlur * sinA
	eX := p.EndMotionBlur * cosA
	eY := p.EndMotionBlur * sinA

	var blurAnim string
	switch p.LoopMode {
	case "pingpong":
		blurAnim = fmt.Sprintf(`<animate attributeName="stdDeviation" values="%.1f %.1f; %.1f %.1f; %.1f %.1f" dur="%s" repeatCount="indefinite" />`,
			sX, sY, eX, eY, sX, sY, p.Duration)
	case "loop":
		blurAnim = fmt.Sprintf(`<animate attributeName="stdDeviation" values="%.1f %.1f; %.1f %.1f" dur="%s" repeatCount="indefinite" />`,
			sX, sY, eX, eY, p.Duration)
	default: // "once"
		blurAnim = fmt.Sprintf(`<animate attributeName="stdDeviation" from="%.1f %.1f" to="%.1f %.1f" dur="%s" fill="freeze" />`,
			sX, sY, eX, eY, p.Duration)
	}

	filterDef := fmt.Sprintf(`
    <filter id="motionBlurFilter" x="-20%%" y="-20%%" width="140%%" height="140%%">
      <feGaussianBlur stdDeviation="%.1f %.1f">
        %s
      </feGaussianBlur>
    </filter>`,
		sX, sY,
		blurAnim,
	)

	return Markup{
		Defs:       filterDef,
		Keyframes:  keyframes,
		FilterAttr: `filter="url(#motionBlurFilter)"`,
	}
}