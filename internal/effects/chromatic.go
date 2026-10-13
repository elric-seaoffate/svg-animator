package effects

import (
	"fmt"
	"math"
)

func init() {
	Register("chromatic-aberration", generateChromatic)
	Register("lens-fringing", generateChromatic)
}

func generateChromatic(p Params) Markup {
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

	rad := p.ChromaAngle * (math.Pi / 180.0)
	dx := p.ChromaOffset * math.Cos(rad)
	dy := p.ChromaOffset * math.Sin(rad)

	filterDef := fmt.Sprintf(`
    <filter id="chromaFilter">
      <feColorMatrix in="SourceGraphic" type="matrix"
        values="1 0 0 0 0
                0 0 0 0 0
                0 0 0 0 0
                0 0 0 1 0" result="redChannel" />
      <feOffset in="redChannel" dx="%.2f" dy="%.2f" result="redOffset" />

      <feColorMatrix in="SourceGraphic" type="matrix"
        values="0 0 0 0 0
                0 1 0 0 0
                0 0 0 0 0
                0 0 0 1 0" result="greenChannel" />

      <feColorMatrix in="SourceGraphic" type="matrix"
        values="0 0 0 0 0
                0 0 0 0 0
                0 0 1 0 0
                0 0 0 1 0" result="blueChannel" />
      <feOffset in="blueChannel" dx="%.2f" dy="%.2f" result="blueOffset" />

      <feBlend mode="screen" in="redOffset" in2="greenChannel" result="rg" />
      <feBlend mode="screen" in="rg" in2="blueOffset" />
    </filter>`,
		dx, dy,
		-dx, -dy,
	)

	return Markup{
		Defs:       filterDef,
		Keyframes:  keyframes,
		FilterAttr: `filter="url(#chromaFilter)"`,
	}
}