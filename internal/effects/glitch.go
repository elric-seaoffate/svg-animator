package effects

import "fmt"

func init() {
	Register("glitch", generateGlitch)
}

func generateGlitch(p Params) Markup {
	tx1, ty1 := CalcTranslation(p.StartScale, p.StartX, p.StartY)
	tx2, ty2 := CalcTranslation(p.EndScale, p.EndX, p.EndY)

	filterDef := `
    <filter id="glitchFilter">
      <feTurbulence type="fractalNoise" baseFrequency="0.04 0.95" numOctaves="1" result="noise">
        <animate attributeName="baseFrequency" values="0.04 0.95;0.08 0.1;0.04 0.95" dur="1.8s" repeatCount="indefinite" />
      </feTurbulence>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="22" xChannelSelector="R" yChannelSelector="G" />
    </filter>`

	keyframes := fmt.Sprintf(`
      @keyframes animEffect {
        0%%   { transform: translate(%.2f%%, %.2f%%) scale(%.2f); }
        100%% { transform: translate(%.2f%%, %.2f%%) scale(%.2f); }
      }`, tx1, ty1, p.StartScale, tx2, ty2, p.EndScale)

	return Markup{
		Defs:       filterDef,
		Keyframes:  keyframes,
		FilterAttr: `filter="url(#glitchFilter)"`,
	}
}