package geometry

import (
	"math"
)

// Point represents a 2D coordinate in canvas percentage (0..100) or screen pixels.
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// SnapConfig defines parameters for grid snapping and stage dimension clamping.
type SnapConfig struct {
	Enabled      bool    `json:"enabled"`
	GridSizePx   float64 `json:"gridSizePx"`
	CanvasWidth  float64 `json:"canvasWidth"`
	CanvasHeight float64 `json:"canvasHeight"`
}

// ComputeSnappedPosition calculates grid-snapped coordinates matching stage.js computeSnappedPosition.
func ComputeSnappedPosition(xPct, yPct float64, cfg SnapConfig) Point {
	if !cfg.Enabled {
		clampedX := math.Min(100, math.Max(0, xPct))
		clampedY := math.Min(100, math.Max(0, yPct))
		return Point{
			X: math.Round(clampedX*10) / 10,
			Y: math.Round(clampedY*10) / 10,
		}
	}

	gridPx := cfg.GridSizePx
	if gridPx < 2 {
		gridPx = 20
	}
	w := cfg.CanvasWidth
	if w <= 0 {
		w = 1280
	}
	h := cfg.CanvasHeight
	if h <= 0 {
		h = 720
	}

	rawPxX := (xPct / 100.0) * w
	rawPxY := (yPct / 100.0) * h

	snappedPxX := math.Min(w, math.Max(0, math.Round(rawPxX/gridPx)*gridPx))
	snappedPxY := math.Min(h, math.Max(0, math.Round(rawPxY/gridPx)*gridPx))

	pctX := (snappedPxX / w) * 100.0
	pctY := (snappedPxY / h) * 100.0

	return Point{
		X: math.Round(pctX*1000) / 1000,
		Y: math.Round(pctY*1000) / 1000,
	}
}

// RectClientToPct converts client mouse coordinates into canvas percentage relative to bounding rect.
func RectClientToPct(clientX, clientY float64, rectLeft, rectTop, rectWidth, rectHeight float64) Point {
	if rectWidth <= 0 || rectHeight <= 0 {
		return Point{X: 50, Y: 50}
	}
	rawX := ((clientX - rectLeft) / rectWidth) * 100.0
	rawY := ((clientY - rectTop) / rectHeight) * 100.0

	clampedX := math.Min(100, math.Max(0, rawX))
	clampedY := math.Min(100, math.Max(0, rawY))

	return Point{
		X: math.Round(clampedX*10) / 10,
		Y: math.Round(clampedY*10) / 10,
	}
}

// ComputeFitScale computes stage viewport zoom scale factor to fit within container bounds.
func ComputeFitScale(canvasW, canvasH, containerW, containerH, padding float64) float64 {
	if canvasW <= 0 || canvasH <= 0 || containerW <= 0 || containerH <= 0 {
		return 1.0
	}
	pad := padding
	if pad < 0 {
		pad = 20
	}
	availW := math.Max(100, containerW-pad*2)
	availH := math.Max(100, containerH-pad*2)

	scaleX := availW / canvasW
	scaleY := availH / canvasH
	scale := math.Min(scaleX, scaleY)
	return math.Min(3.0, math.Max(0.25, math.Round(scale*1000)/1000))
}
