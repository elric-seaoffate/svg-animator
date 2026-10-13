package effects

import "fmt"

func init() {
	Register("ken-burns", generateKenBurns)
	Register("pan", generateKenBurns)
}

func generateKenBurns(p Params) Markup {
	tx1, ty1 := CalcTranslation(p.StartScale, p.StartX, p.StartY)
	tx2, ty2 := CalcTranslation(p.EndScale, p.EndX, p.EndY)

	keyframes := fmt.Sprintf(`
      @keyframes animEffect {
        0%%   { transform: translate(%.2f%%, %.2f%%) scale(%.2f); }
        100%% { transform: translate(%.2f%%, %.2f%%) scale(%.2f); }
      }`, tx1, ty1, p.StartScale, tx2, ty2, p.EndScale)

	return Markup{
		Keyframes: keyframes,
	}
}