package effects

import "fmt"

func init() {
	Register("film-grain", generateFilmGrain)
	Register("celluloid-weave", generateFilmGrain)
}

func generateFilmGrain(p Params) Markup {
	baseScale := p.StartScale
	if baseScale < 1.04 {
		baseScale = 1.04
	}
	tx1, ty1 := CalcTranslation(baseScale, p.StartX, p.StartY)
	tx2, ty2 := CalcTranslation(baseScale, p.EndX, p.EndY)

	w := p.GateWeave

	var keyframes string
	if p.CameraMotion == "ken-burns" {
		keyframes = fmt.Sprintf(`
      @keyframes animEffect {
        0%%   { transform: translate(%.2f%%, %.2f%%) translate(0px, 0px) scale(%.3f); }
        15%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
        32%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
        50%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
        68%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
        84%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
        100%% { transform: translate(%.2f%%, %.2f%%) translate(0px, 0px) scale(%.3f); }
      }`,
			tx1, ty1, baseScale,
			tx1+(tx2-tx1)*0.15, ty1+(ty2-ty1)*0.15, 0.65*w, -0.45*w, baseScale,
			tx1+(tx2-tx1)*0.32, ty1+(ty2-ty1)*0.32, -0.55*w, 0.70*w, baseScale,
			tx1+(tx2-tx1)*0.50, ty1+(ty2-ty1)*0.50, 0.80*w, 0.35*w, baseScale,
			tx1+(tx2-tx1)*0.68, ty1+(ty2-ty1)*0.68, -0.70*w, -0.60*w, baseScale,
			tx1+(tx2-tx1)*0.84, ty1+(ty2-ty1)*0.84, 0.45*w, 0.50*w, baseScale,
			tx2, ty2, baseScale,
		)
	} else {
		// Static Camera with organic gate registration drift
		keyframes = fmt.Sprintf(`
      @keyframes animEffect {
        0%%   { transform: translate(%.2f%%, %.2f%%) translate(0px, 0px) scale(%.3f); }
        15%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
        32%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
        50%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
        68%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
        84%%  { transform: translate(%.2f%%, %.2f%%) translate(%.2fpx, %.2fpx) scale(%.3f); }
        100%% { transform: translate(%.2f%%, %.2f%%) translate(0px, 0px) scale(%.3f); }
      }`,
			tx1, ty1, baseScale,
			tx1, ty1, 0.65*w, -0.45*w, baseScale,
			tx1, ty1, -0.55*w, 0.70*w, baseScale,
			tx1, ty1, 0.80*w, 0.35*w, baseScale,
			tx1, ty1, -0.70*w, -0.60*w, baseScale,
			tx1, ty1, 0.45*w, 0.50*w, baseScale,
			tx1, ty1, baseScale,
		)
	}

	filterDef := fmt.Sprintf(`
    <filter id="grainFilter">
      <feTurbulence type="fractalNoise" baseFrequency="%.3f" numOctaves="3" result="noise">
        <animate attributeName="seed" values="1;17;43;68;91;1" dur="0.32s" repeatCount="indefinite" />
      </feTurbulence>
      <feColorMatrix type="matrix" values="0 0 0 0 0.5   0 0 0 0 0.5   0 0 0 0 0.5   0 0 0 %.3f 0" result="grain" />
      <feBlend mode="overlay" in="SourceGraphic" in2="grain" />
    </filter>`,
		p.GrainSize,
		p.GrainIntensity,
	)

	return Markup{
		Defs:       filterDef,
		Keyframes:  keyframes,
		FilterAttr: `filter="url(#grainFilter)"`,
	}
}