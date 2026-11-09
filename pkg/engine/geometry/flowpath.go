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
