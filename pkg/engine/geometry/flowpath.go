package geometry

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// formatNum rounds to at most 2 decimal places and formats without trailing zeros, matching Number(val.toFixed(2)).
func formatNum(v float64) string {
	rounded := math.Round(v*100.0) / 100.0
	return strconv.FormatFloat(rounded, 'f', -1, 64)
}

// formatFixed2 formats a float with exactly 2 decimal places, matching val.toFixed(2).
func formatFixed2(v float64) string {
	return fmt.Sprintf("%.2f", v)
}

// px converts percentage to pixel coordinate and rounds to 2 decimal places.
func px(pct, width float64) float64 {
	return math.Round(((pct/100.0)*width)*100.0) / 100.0
}

// py converts percentage to pixel coordinate and rounds to 2 decimal places.
func py(pct, height float64) float64 {
	return math.Round(((pct/100.0)*height)*100.0) / 100.0
}

// GenerateFlowPath produces the SVG 'd' path string for a sequence of waypoints matching DataFlows.generatePathString.
func GenerateFlowPath(nodes []Point, curvature float64, width, height float64, routeMode string) string {
	if len(nodes) < 2 {
		return ""
	}

	if routeMode == "ortho-hv" || routeMode == "ortho-vh" || routeMode == "ortho-mid" {
		var sb strings.Builder
		sb.WriteString("M ")
		sb.WriteString(formatNum(px(nodes[0].X, width)))
		sb.WriteString(",")
		sb.WriteString(formatNum(py(nodes[0].Y, height)))

		for i := 0; i < len(nodes)-1; i++ {
			x1 := px(nodes[i].X, width)
			y1 := py(nodes[i].Y, height)
			x2 := px(nodes[i+1].X, width)
			y2 := py(nodes[i+1].Y, height)

			if routeMode == "ortho-hv" {
				sb.WriteString(" L ")
				sb.WriteString(formatNum(x2))
				sb.WriteString(",")
				sb.WriteString(formatNum(y1))
				sb.WriteString(" L ")
				sb.WriteString(formatNum(x2))
				sb.WriteString(",")
				sb.WriteString(formatNum(y2))
			} else if routeMode == "ortho-vh" {
				sb.WriteString(" L ")
				sb.WriteString(formatNum(x1))
				sb.WriteString(",")
				sb.WriteString(formatNum(y2))
				sb.WriteString(" L ")
				sb.WriteString(formatNum(x2))
				sb.WriteString(",")
				sb.WriteString(formatNum(y2))
			} else {
				midX := math.Round(((x1+x2)/2.0)*100.0) / 100.0
				sb.WriteString(" L ")
				sb.WriteString(formatNum(midX))
				sb.WriteString(",")
				sb.WriteString(formatNum(y1))
				sb.WriteString(" L ")
				sb.WriteString(formatNum(midX))
				sb.WriteString(",")
				sb.WriteString(formatNum(y2))
				sb.WriteString(" L ")
				sb.WriteString(formatNum(x2))
				sb.WriteString(",")
				sb.WriteString(formatNum(y2))
			}
		}
		return sb.String()
	}

	if curvature == 0 {
		var sb strings.Builder
		sb.WriteString("M ")
		sb.WriteString(formatNum(px(nodes[0].X, width)))
		sb.WriteString(",")
		sb.WriteString(formatNum(py(nodes[0].Y, height)))
		for _, n := range nodes[1:] {
			sb.WriteString(" L ")
			sb.WriteString(formatNum(px(n.X, width)))
			sb.WriteString(",")
			sb.WriteString(formatNum(py(n.Y, height)))
		}
		return sb.String()
	}

	if len(nodes) == 2 {
		p1 := nodes[0]
		p2 := nodes[1]
		p1x := px(p1.X, width)
		p1y := py(p1.Y, height)
		p2x := px(p2.X, width)
		p2y := py(p2.Y, height)

		dx := p2x - p1x
		dy := p2y - p1y
		dist := math.Sqrt(dx*dx + dy*dy)
		if dist == 0 {
			dist = 1
		}
		nx := -dy / dist
		ny := dx / dist
		bend := (curvature / 100.0) * (dist * 0.4)
		cx := (p1x+p2x)/2.0 + nx*bend
		cy := (p1y+p2y)/2.0 + ny*bend

		return fmt.Sprintf("M %s,%s Q %s,%s %s,%s",
			formatNum(p1x), formatNum(p1y),
			formatFixed2(cx), formatFixed2(cy),
			formatNum(p2x), formatNum(p2y),
		)
	}

	var sb strings.Builder
	sb.WriteString("M ")
	sb.WriteString(formatNum(px(nodes[0].X, width)))
	sb.WriteString(",")
	sb.WriteString(formatNum(py(nodes[0].Y, height)))

	t := (curvature / 100.0) * 0.3
	for i := 0; i < len(nodes)-1; i++ {
		var p0 Point
		if i == 0 {
			p0 = nodes[0]
		} else {
			p0 = nodes[i-1]
		}
		p1 := nodes[i]
		p2 := nodes[i+1]
		var p3 Point
		if i+2 < len(nodes) {
			p3 = nodes[i+2]
		} else {
			p3 = p2
		}

		p0x := px(p0.X, width)
		p0y := py(p0.Y, height)
		p1x := px(p1.X, width)
		p1y := py(p1.Y, height)
		p2x := px(p2.X, width)
		p2y := py(p2.Y, height)
		p3x := px(p3.X, width)
		p3y := py(p3.Y, height)

		cp1x := p1x + (p2x-p0x)*t
		cp1y := p1y + (p2y-p0y)*t
		cp2x := p2x - (p3x-p1x)*t
		cp2y := p2y - (p3y-p1y)*t

		sb.WriteString(" C ")
		sb.WriteString(formatFixed2(cp1x))
		sb.WriteString(",")
		sb.WriteString(formatFixed2(cp1y))
		sb.WriteString(" ")
		sb.WriteString(formatFixed2(cp2x))
		sb.WriteString(",")
		sb.WriteString(formatFixed2(cp2y))
		sb.WriteString(" ")
		sb.WriteString(formatNum(p2x))
		sb.WriteString(",")
		sb.WriteString(formatNum(p2y))
	}
	return sb.String()
}

// GetFlowMidpoint calculates the center point along a flow path for payload/label anchoring.
func GetFlowMidpoint(nodes []Point, curvature float64, width, height float64) Point {
	if len(nodes) < 2 {
		return Point{X: width / 2.0, Y: height / 2.0}
	}
	midIdx := (len(nodes) - 1) / 2
	p1 := nodes[midIdx]
	p2 := nodes[midIdx+1]

	p1x := (p1.X / 100.0) * width
	p1y := (p1.Y / 100.0) * height
	p2x := (p2.X / 100.0) * width
	p2y := (p2.Y / 100.0) * height

	mx := (p1x + p2x) / 2.0
	my := (p1y + p2y) / 2.0

	if len(nodes) == 2 && curvature != 0 {
		dx := p2x - p1x
		dy := p2y - p1y
		dist := math.Sqrt(dx*dx + dy*dy)
		if dist == 0 {
			dist = 1
		}
		nx := -dy / dist
		ny := dx / dist
		bend := (curvature / 100.0) * (dist * 0.2)
		mx += nx * bend
		my += ny * bend
	}

	return Point{
		X: math.Round(mx*100) / 100,
		Y: math.Round(my*100) / 100,
	}
}

// SampleFlowPathAtProgress calculates the point (in pixels) and tangent angle (in degrees)
// along the flow path at a normalized progress value in [0, 1].
func SampleFlowPathAtProgress(nodes []Point, curvature float64, width, height float64, routeMode string, progress float64) (Point, float64) {
	if len(nodes) == 0 {
		return Point{X: 0, Y: 0}, 0
	}
	if len(nodes) == 1 {
		return Point{X: px(nodes[0].X, width), Y: py(nodes[0].Y, height)}, 0
	}

	if progress < 0 {
		progress = 0
	} else if progress > 1 {
		progress = 1
	}

	// 1. Orthogonal routes: piecewise horizontal and vertical segments
	if routeMode == "ortho-hv" || routeMode == "ortho-vh" || routeMode == "ortho-mid" {
		var pts []Point
		pts = append(pts, Point{X: px(nodes[0].X, width), Y: py(nodes[0].Y, height)})

		for i := 0; i < len(nodes)-1; i++ {
			x1 := px(nodes[i].X, width)
			y1 := py(nodes[i].Y, height)
			x2 := px(nodes[i+1].X, width)
			y2 := py(nodes[i+1].Y, height)

			if routeMode == "ortho-hv" {
				pts = append(pts, Point{X: x2, Y: y1}, Point{X: x2, Y: y2})
			} else if routeMode == "ortho-vh" {
				pts = append(pts, Point{X: x1, Y: y2}, Point{X: x2, Y: y2})
			} else {
				midX := math.Round(((x1+x2)/2.0)*100.0) / 100.0
				pts = append(pts, Point{X: midX, Y: y1}, Point{X: midX, Y: y2}, Point{X: x2, Y: y2})
			}
		}

		return samplePiecewiseLinear(pts, progress)
	}

	// 2. Direct / zero curvature: straight segments
	if curvature == 0 || routeMode == "direct" {
		pts := make([]Point, len(nodes))
		for i, n := range nodes {
			pts[i] = Point{X: px(n.X, width), Y: py(n.Y, height)}
		}
		return samplePiecewiseLinear(pts, progress)
	}

	// 3. Two nodes with curvature: quadratic Bezier curve
	if len(nodes) == 2 {
		p1x := px(nodes[0].X, width)
		p1y := py(nodes[0].Y, height)
		p2x := px(nodes[1].X, width)
		p2y := py(nodes[1].Y, height)

		dx := p2x - p1x
		dy := p2y - p1y
		dist := math.Sqrt(dx*dx + dy*dy)
		if dist == 0 {
			return Point{X: p1x, Y: p1y}, 0
		}
		nx := -dy / dist
		ny := dx / dist
		bend := (curvature / 100.0) * (dist * 0.4)
		cx := (p1x+p2x)/2.0 + nx*bend
		cy := (p1y+p2y)/2.0 + ny*bend

		u := progress
		om := 1.0 - u
		x := om*om*p1x + 2*om*u*cx + u*u*p2x
		y := om*om*p1y + 2*om*u*cy + u*u*p2y

		dxDu := 2*om*(cx-p1x) + 2*u*(p2x-cx)
		dyDu := 2*om*(cy-p1y) + 2*u*(p2y-cy)
		angle := math.Atan2(dyDu, dxDu) * (180.0 / math.Pi)

		return Point{
			X: math.Round(x*100) / 100,
			Y: math.Round(y*100) / 100,
		}, math.Round(angle*100) / 100
	}

	// 4. Multiple nodes with curvature: Catmull-Rom cubic spline
	numSegments := len(nodes) - 1
	t := (curvature / 100.0) * 0.3

	scaled := progress * float64(numSegments)
	segIdx := int(scaled)
	var u float64
	if segIdx >= numSegments {
		segIdx = numSegments - 1
		u = 1.0
	} else {
		u = scaled - float64(segIdx)
	}

	var p0 Point
	if segIdx == 0 {
		p0 = nodes[0]
	} else {
		p0 = nodes[segIdx-1]
	}
	p1 := nodes[segIdx]
	p2 := nodes[segIdx+1]
	var p3 Point
	if segIdx+2 < len(nodes) {
		p3 = nodes[segIdx+2]
	} else {
		p3 = p2
	}

	p0x := px(p0.X, width)
	p0y := py(p0.Y, height)
	p1x := px(p1.X, width)
	p1y := py(p1.Y, height)
	p2x := px(p2.X, width)
	p2y := py(p2.Y, height)
	p3x := px(p3.X, width)
	p3y := py(p3.Y, height)

	cp1x := p1x + (p2x-p0x)*t
	cp1y := p1y + (p2y-p0y)*t
	cp2x := p2x - (p3x-p1x)*t
	cp2y := p2y - (p3y-p1y)*t

	om := 1.0 - u
	x := om*om*om*p1x + 3*om*om*u*cp1x + 3*om*u*u*cp2x + u*u*u*p2x
	y := om*om*om*p1y + 3*om*om*u*cp1y + 3*om*u*u*cp2y + u*u*u*p2y

	dxDu := 3*om*om*(cp1x-p1x) + 6*om*u*(cp2x-cp1x) + 3*u*u*(p2x-cp2x)
	dyDu := 3*om*om*(cp1y-p1y) + 6*om*u*(cp2y-cp1y) + 3*u*u*(p2y-cp2y)
	angle := math.Atan2(dyDu, dxDu) * (180.0 / math.Pi)

	return Point{
		X: math.Round(x*100) / 100,
		Y: math.Round(y*100) / 100,
	}, math.Round(angle*100) / 100
}

func samplePiecewiseLinear(pts []Point, progress float64) (Point, float64) {
	if len(pts) < 2 {
		if len(pts) == 1 {
			return pts[0], 0
		}
		return Point{X: 0, Y: 0}, 0
	}

	type segInfo struct {
		p1, p2 Point
		len    float64
		angle  float64
	}
	segs := make([]segInfo, 0, len(pts)-1)
	totalLen := 0.0

	for i := 0; i < len(pts)-1; i++ {
		p1 := pts[i]
		p2 := pts[i+1]
		dx := p2.X - p1.X
		dy := p2.Y - p1.Y
		l := math.Sqrt(dx*dx + dy*dy)
		ang := math.Atan2(dy, dx) * (180.0 / math.Pi)
		segs = append(segs, segInfo{p1: p1, p2: p2, len: l, angle: ang})
		totalLen += l
	}

	if totalLen == 0 {
		return pts[0], 0
	}

	targetDist := progress * totalLen
	accum := 0.0

	for i, seg := range segs {
		if seg.len == 0 && i < len(segs)-1 {
			continue
		}
		if targetDist <= accum+seg.len || i == len(segs)-1 {
			u := 0.0
			if seg.len > 0 {
				u = (targetDist - accum) / seg.len
				if u < 0 {
					u = 0
				} else if u > 1 {
					u = 1
				}
			}
			x := seg.p1.X + (seg.p2.X-seg.p1.X)*u
			y := seg.p1.Y + (seg.p2.Y-seg.p1.Y)*u
			return Point{
				X: math.Round(x*100) / 100,
				Y: math.Round(y*100) / 100,
			}, math.Round(seg.angle*100) / 100
		}
		accum += seg.len
	}

	last := pts[len(pts)-1]
	lastAngle := segs[len(segs)-1].angle
	return Point{
		X: math.Round(last.X*100) / 100,
		Y: math.Round(last.Y*100) / 100,
	}, math.Round(lastAngle*100) / 100
}
