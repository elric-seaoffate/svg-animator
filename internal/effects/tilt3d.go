package effects

import "fmt"

func init() {
	Register("perspective-tilt", generateTilt3D)
	Register("3d-tilt", generateTilt3D)
}

func generateTilt3D(p Params) Markup {
	tx1, ty1 := CalcTranslation(p.StartScale, p.StartX, p.StartY)
	tx2, ty2 := CalcTranslation(p.EndScale, p.EndX, p.EndY)

	keyframes := fmt.Sprintf(`
      @keyframes animEffect {
        0%%   { transform: perspective(1200px) translate(50%%, 50%%) rotateX(%.1fdeg) rotateY(%.1fdeg) translate(-50%%, -50%%) translate(%.2f%%, %.2f%%) scale(%.2f); }
        100%% { transform: perspective(1200px) translate(50%%, 50%%) rotateX(%.1fdeg) rotateY(%.1fdeg) translate(-50%%, -50%%) translate(%.2f%%, %.2f%%) scale(%.2f); }
      }`, p.StartPitch, p.StartYaw, tx1, ty1, p.StartScale, p.EndPitch, p.EndYaw, tx2, ty2, p.EndScale)

	return Markup{
		Keyframes: keyframes,
	}
}