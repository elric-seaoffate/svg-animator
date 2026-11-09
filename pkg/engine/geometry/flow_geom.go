package geometry

import (
	"math"
)

// FlowBounds represents axis-aligned bounding box coordinates in pixels.
type FlowBounds struct {
	MinX   float64 `json:"minX"`
	MinY   float64 `json:"minY"`
	MaxX   float64 `json:"maxX"`
	MaxY   float64 `json:"maxY"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

// FlowGeometryDescription contains the complete calculated geometry for a flow connector.
type FlowGeometryDescription struct {
	PathD    string     `json:"pathD"`
	Midpoint Point      `json:"midpoint"`
	Bounds   FlowBounds `json:"bounds"`
	Length   float64    `json:"length"`
	StartPt  Point      `json:"startPt"`
	EndPt    Point      `json:"endPt"`
}

// ComputeFlowBounds samples the flow path to calculate its true axis-aligned bounding box.
func ComputeFlowBounds(nodes []Point, curvature float64, width, height float64, routeMode string) (FlowBounds, Point) {
	if len(nodes) == 0 {
		return FlowBounds{}, Point{}
	}
	mid := GetFlowMidpoint(nodes, curvature, width, height)
	if len(nodes) == 1 {
		p := Point{X: px(nodes[0].X, width), Y: py(nodes[0].Y, height)}
		return FlowBounds{
			MinX:   p.X,
			MinY:   p.Y,
			MaxX:   p.X,
			MaxY:   p.Y,
			Width:  0,
			Height: 0,
		}, mid
	}

	samples := 40
	minX := math.MaxFloat64
	minY := math.MaxFloat64
	maxX := -math.MaxFloat64
	maxY := -math.MaxFloat64

	for i := 0; i <= samples; i++ {
		t := float64(i) / float64(samples)
		pt, _ := SampleFlowPathAtProgress(nodes, curvature, width, height, routeMode, t)
		if pt.X < minX {
			minX = pt.X
		}
		if pt.X > maxX {
			maxX = pt.X
		}
		if pt.Y < minY {
			minY = pt.Y
		}
		if pt.Y > maxY {
			maxY = pt.Y
		}
	}

	return FlowBounds{
		MinX:   math.Round(minX*100) / 100,
		MinY:   math.Round(minY*100) / 100,
		MaxX:   math.Round(maxX*100) / 100,
		MaxY:   math.Round(maxY*100) / 100,
		Width:  math.Round((maxX-minX)*100) / 100,
		Height: math.Round((maxY-minY)*100) / 100,
	}, mid
}

// ComputeFlowLength approximates the total pixel length of the flow path.
func ComputeFlowLength(nodes []Point, curvature float64, width, height float64, routeMode string) float64 {
	if len(nodes) < 2 {
		return 0
	}
	samples := 50
	totalLen := 0.0
	prev, _ := SampleFlowPathAtProgress(nodes, curvature, width, height, routeMode, 0.0)

	for i := 1; i <= samples; i++ {
		t := float64(i) / float64(samples)
		curr, _ := SampleFlowPathAtProgress(nodes, curvature, width, height, routeMode, t)
		dx := curr.X - prev.X
		dy := curr.Y - prev.Y
		totalLen += math.Sqrt(dx*dx + dy*dy)
		prev = curr
	}

	return math.Round(totalLen*100) / 100
}

// DistanceToFlowPath calculates the minimum Euclidean distance in pixels from (px, py) to the flow path.
func DistanceToFlowPath(nodes []Point, curvature float64, width, height float64, routeMode string, testPx, testPy float64) float64 {
	if len(nodes) < 2 {
		if len(nodes) == 1 {
			p := Point{X: px(nodes[0].X, width), Y: py(nodes[0].Y, height)}
			dx := testPx - p.X
			dy := testPy - p.Y
			return math.Sqrt(dx*dx + dy*dy)
		}
		return math.MaxFloat64
	}

	samples := 40
	minDist := math.MaxFloat64
	prev, _ := SampleFlowPathAtProgress(nodes, curvature, width, height, routeMode, 0.0)

	for i := 1; i <= samples; i++ {
		t := float64(i) / float64(samples)
		curr, _ := SampleFlowPathAtProgress(nodes, curvature, width, height, routeMode, t)

		// Point-to-segment distance from testPt to segment (prev, curr)
		segDx := curr.X - prev.X
		segDy := curr.Y - prev.Y
		lenSq := segDx*segDx + segDy*segDy

		var dist float64
		if lenSq <= 0.0001 {
			dx := testPx - prev.X
			dy := testPy - prev.Y
			dist = math.Sqrt(dx*dx + dy*dy)
		} else {
			u := ((testPx-prev.X)*segDx + (testPy-prev.Y)*segDy) / lenSq
			if u < 0 {
				u = 0
			} else if u > 1 {
				u = 1
			}
			closestX := prev.X + u*segDx
			closestY := prev.Y + u*segDy
			dx := testPx - closestX
			dy := testPy - closestY
			dist = math.Sqrt(dx*dx + dy*dy)
		}

		if dist < minDist {
			minDist = dist
		}
		prev = curr
	}

	return math.Round(minDist*100) / 100
}

// DescribeFlowGeometry returns the full geometric description for a sequence of flow nodes.
func DescribeFlowGeometry(nodes []Point, curvature float64, width, height float64, routeMode string) FlowGeometryDescription {
	path := GenerateFlowPath(nodes, curvature, width, height, routeMode)
	bounds, mid := ComputeFlowBounds(nodes, curvature, width, height, routeMode)
	length := ComputeFlowLength(nodes, curvature, width, height, routeMode)

	var startPt, endPt Point
	if len(nodes) > 0 {
		startPt = Point{X: px(nodes[0].X, width), Y: py(nodes[0].Y, height)}
		endPt = Point{X: px(nodes[len(nodes)-1].X, width), Y: py(nodes[len(nodes)-1].Y, height)}
	}

	return FlowGeometryDescription{
		PathD:    path,
		Midpoint: mid,
		Bounds:   bounds,
		Length:   length,
		StartPt:  startPt,
		EndPt:    endPt,
	}
}

// CalculateNodeAnchor determines the anchor point (in percent coordinates) on a node facing the target point.
func CalculateNodeAnchor(nodeX, nodeY, nodeW, nodeH, canvasW, canvasH float64, targetX, targetY float64, preferEdge bool) Point {
	if canvasW <= 0 {
		canvasW = 1280
	}
	if canvasH <= 0 {
		canvasH = 720
	}

	center := Point{
		X: math.Round(nodeX*100) / 100,
		Y: math.Round(nodeY*100) / 100,
	}

	if !preferEdge {
		return center
	}

	// Calculate 4 cardinal edge anchors in percent coordinates
	hwPct := ((nodeW / 2.0) / canvasW) * 100.0
	hhPct := ((nodeH / 2.0) / canvasH) * 100.0

	top := Point{X: nodeX, Y: nodeY - hhPct}
	bottom := Point{X: nodeX, Y: nodeY + hhPct}
	left := Point{X: nodeX - hwPct, Y: nodeY}
	right := Point{X: nodeX + hwPct, Y: nodeY}

	candidates := []Point{top, bottom, left, right}
	bestPt := center
	bestDistSq := math.MaxFloat64

	for _, cand := range candidates {
		dx := (cand.X - targetX) * canvasW / 100.0
		dy := (cand.Y - targetY) * canvasH / 100.0
		distSq := dx*dx + dy*dy
		if distSq < bestDistSq {
			bestDistSq = distSq
			bestPt = cand
		}
	}

	return Point{
		X: math.Round(bestPt.X*100) / 100,
		Y: math.Round(bestPt.Y*100) / 100,
	}
}
