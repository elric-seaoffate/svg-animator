package effects

import "fmt"

func init() {
	Register("handheld-drift", generateHandheld)
	Register("camera-breathe", generateHandheld)
}

func generateHandheld(p Params) Markup {
	// Base centering based on Start focal point and scale
	baseScale := p.StartScale
	if baseScale < 1.05 {
		// Minimum overscan buffer to prevent canvas edge clipping during sway
		baseScale = 1.05
	}
	baseTx, baseTy := CalcTranslation(baseScale, p.StartX, p.StartY)

	s := p.DriftSway
	b := p.DriftBreathe / 100.0
	r := p.DriftRoll

	// 8-point asymmetric harmonic path simulating natural human body sway
	keyframes := fmt.Sprintf(`
      @keyframes animEffect {
        0%% {
          transform: translate(%.2f%%, %.2f%%) rotate(0deg) scale(%.3f);
        }
        14%% {
          transform: translate(%.2f%%, %.2f%%) rotate(%.2fdeg) scale(%.3f);
        }
        28%% {
          transform: translate(%.2f%%, %.2f%%) rotate(%.2fdeg) scale(%.3f);
        }
        44%% {
          transform: translate(%.2f%%, %.2f%%) rotate(%.2fdeg) scale(%.3f);
        }
        59%% {
          transform: translate(%.2f%%, %.2f%%) rotate(%.2fdeg) scale(%.3f);
        }
        73%% {
          transform: translate(%.2f%%, %.2f%%) rotate(%.2fdeg) scale(%.3f);
        }
        88%% {
          transform: translate(%.2f%%, %.2f%%) rotate(%.2fdeg) scale(%.3f);
        }
        100%% {
          transform: translate(%.2f%%, %.2f%%) rotate(0deg) scale(%.3f);
        }
      }`,
		baseTx, baseTy, baseScale,
		baseTx+(0.55*s), baseTy-(0.42*s), 0.35*r, baseScale*(1.0+0.45*b),
		baseTx-(0.38*s), baseTy+(0.65*s), -0.55*r, baseScale*(1.0+0.85*b),
		baseTx-(0.75*s), baseTy-(0.25*s), 0.40*r, baseScale*(1.0+0.30*b),
		baseTx+(0.45*s), baseTy+(0.55*s), -0.30*r, baseScale*(1.0+1.00*b),
		baseTx-(0.50*s), baseTy-(0.58*s), 0.50*r, baseScale*(1.0+0.50*b),
		baseTx+(0.32*s), baseTy+(0.22*s), -0.25*r, baseScale*(1.0+0.15*b),
		baseTx, baseTy, baseScale,
	)

	return Markup{
		Keyframes: keyframes,
	}
}