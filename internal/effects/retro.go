package effects

import "fmt"

func init() {
	Register("pulse", generatePulse)
	Register("orbit", generateOrbit)
	Register("scanlines", generateScanlines)
}

func generatePulse(p Params) Markup {
	tx1, ty1 := CalcTranslation(p.StartScale, p.StartX, p.StartY)
	txMid, tyMid := CalcTranslation(p.EndScale, p.StartX, p.StartY)

	keyframes := fmt.Sprintf(`
      @keyframes animEffect {
        0%%   { transform: translate(%.2f%%, %.2f%%) scale(%.2f); opacity: 0.90; }
        50%%  { transform: translate(%.2f%%, %.2f%%) scale(%.2f); opacity: 1.0; }
        100%% { transform: translate(%.2f%%, %.2f%%) scale(%.2f); opacity: 0.90; }
      }`, tx1, ty1, p.StartScale, txMid, tyMid, p.EndScale, tx1, ty1, p.StartScale)

	return Markup{Keyframes: keyframes}
}

func generateOrbit(p Params) Markup {
	tx1, ty1 := CalcTranslation(p.StartScale, p.StartX, p.StartY)
	tx2, ty2 := CalcTranslation(p.EndScale, p.EndX, p.EndY)
	midScale := (p.StartScale + p.EndScale) / 2.0
	txMid, tyMid := CalcTranslation(midScale, (p.StartX+p.EndX)/2.0, (p.StartY+p.EndY)/2.0)

	keyframes := fmt.Sprintf(`
      @keyframes animEffect {
        0%%   { transform: translate(%.2f%%, %.2f%%) scale(%.2f) rotate(0deg); }
        50%%  { transform: translate(%.2f%%, %.2f%%) scale(%.2f) rotate(1.2deg); }
        100%% { transform: translate(%.2f%%, %.2f%%) scale(%.2f) rotate(0deg); }
      }`, tx1, ty1, p.StartScale, txMid, tyMid, midScale, tx2, ty2, p.EndScale)

	return Markup{Keyframes: keyframes}
}

func generateScanlines(p Params) Markup {
	tx1, ty1 := CalcTranslation(p.StartScale, p.StartX, p.StartY)
	tx2, ty2 := CalcTranslation(p.EndScale, p.EndX, p.EndY)

	filterDef := `
    <pattern id="scanlinePattern" width="100%" height="4" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="100%" y2="0" stroke="rgba(0,0,0,0.4)" stroke-width="2" />
    </pattern>`

	overlays := fmt.Sprintf(`<rect width="%d" height="%d" fill="url(#scanlinePattern)" pointer-events="none" />`, p.Width, p.Height)

	keyframes := fmt.Sprintf(`
      @keyframes animEffect {
        0%%   { transform: translate(%.2f%%, %.2f%%) scale(%.2f); }
        100%% { transform: translate(%.2f%%, %.2f%%) scale(%.2f); }
      }`, tx1, ty1, p.StartScale, tx2, ty2, p.EndScale)

	return Markup{
		Defs:      filterDef,
		Keyframes: keyframes,
		Overlays:  overlays,
	}
}