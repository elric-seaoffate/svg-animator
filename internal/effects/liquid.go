package effects

import "fmt"

func init() {
	Register("liquid-ripple", generateLiquid)
	Register("heat-shimmer", generateLiquid)
}

func generateLiquid(p Params) Markup {
	f1 := p.WaveFreq
	f2 := f1 * 1.6
	f3 := f1 * 0.7
	f4 := f1 * 1.3

	// Animate displacement scale from StartWaveScale to EndWaveScale
	var scaleAnim string
	switch p.LoopMode {
	case "pingpong":
		scaleAnim = fmt.Sprintf(`<animate attributeName="scale" values="%.1f; %.1f; %.1f" dur="%s" repeatCount="indefinite" />`,
			p.StartWaveScale, p.EndWaveScale, p.StartWaveScale, p.Duration)
	case "loop":
		scaleAnim = fmt.Sprintf(`<animate attributeName="scale" values="%.1f; %.1f" dur="%s" repeatCount="indefinite" />`,
			p.StartWaveScale, p.EndWaveScale, p.Duration)
	default: // "once"
		scaleAnim = fmt.Sprintf(`<animate attributeName="scale" from="%.1f" to="%.1f" dur="%s" fill="freeze" />`,
			p.StartWaveScale, p.EndWaveScale, p.Duration)
	}

	filterDef := fmt.Sprintf(`
    <filter id="liquidFilter" x="-5%%" y="-5%%" width="110%%" height="110%%">
      <feTurbulence type="fractalNoise" baseFrequency="%.4f %.4f" numOctaves="2" result="rippleNoise">
        <animate attributeName="baseFrequency" 
                 values="%.4f %.4f; %.4f %.4f; %.4f %.4f; %.4f %.4f; %.4f %.4f" 
                 dur="%s" repeatCount="indefinite" />
      </feTurbulence>
      <feDisplacementMap in="SourceGraphic" in2="rippleNoise" scale="%.1f" xChannelSelector="R" yChannelSelector="G">
        %s
      </feDisplacementMap>
    </filter>`,
		f1, f2,
		f1, f2,
		f2, f3,
		f3, f4,
		f4, f1,
		f1, f2,
		p.Duration,
		p.StartWaveScale,
		scaleAnim,
	)

	// Decoupled Camera Motion: Handle Static vs Ken Burns vs 3D Tilt
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

	default: // "static" - absolutely no zoom and no pan
		keyframes = `
      @keyframes animEffect {
        0%   { transform: none; }
        100% { transform: none; }
      }`
	}

	return Markup{
		Defs:       filterDef,
		Keyframes:  keyframes,
		FilterAttr: `filter="url(#liquidFilter)"`,
	}
}