package timeline

import "math"

// SolveCubicBezier evaluates a unit cubic Bezier easing curve y(x) for x in [0, 1].
// Control points are (0,0), (x1, y1), (x2, y2), (1,1).
// Uses Newton-Raphson iteration matching SVG calcMode="spline" and CSS cubic-bezier.
func SolveCubicBezier(x1, y1, x2, y2, x float64) float64 {
	if x <= 0 {
		return 0
	}
	if x >= 1 {
		return 1
	}
	if x1 == y1 && x2 == y2 {
		return x
	}

	t := x
	for i := 0; i < 8; i++ {
		cx := 3.0 * x1
		bx := 3.0*(x2-x1) - cx
		ax := 1.0 - cx - bx
		currentX := ((ax*t+bx)*t+cx)*t - x
		if math.Abs(currentX) < 1e-6 {
			break
		}
		deriv := (3.0*ax*t+2.0*bx)*t + cx
		if math.Abs(deriv) < 1e-6 {
			break
		}
		t -= currentX / deriv
	}

	if t < 0 {
		t = 0
	} else if t > 1 {
		t = 1
	}

	cy := 3.0 * y1
	by := 3.0*(y2-y1) - cy
	ay := 1.0 - cy - by
	return ((ay*t+by)*t + cy) * t
}
