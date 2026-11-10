package scene

import (
	"errors"
	"math"
	"strconv"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
)

// GlowDescription contains calculated visual geometry and hit bounds for a hotspot/radar glow.
type GlowDescription struct {
	ID        StringID            `json:"id"`
	Center    geometry.Point      `json:"center"`
	Bounds    geometry.FlowBounds `json:"bounds"`
	HitRadius float64             `json:"hitRadius"`
	Shape     string              `json:"shape"`
	Color     string              `json:"color"`
}

// ValidateGlow checks that glow parameters conform to valid operational limits.
func ValidateGlow(g *Glow) error {
	if g == nil {
		return errors.New("nil glow")
	}
	if g.Size < 0 {
		return errors.New("size cannot be negative")
	}
	if g.Duration <= 0 {
		return errors.New("duration must be greater than 0")
	}
	if g.Opacity < 0 || g.Opacity > 1.0 {
		return errors.New("opacity must be between 0.0 and 1.0")
	}
	return nil
}

// CreateGlow adds a new hotspot or radar ping to the scene with authoritative defaults and identity.
func (s *Scene) CreateGlow(initial Glow) Glow {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.glowsCounter++
	if initial.ID == "" {
		initial.ID = StringID(strconv.FormatInt(s.glowsCounter, 10))
	} else if idNum, err := strconv.ParseInt(string(initial.ID), 10, 64); err == nil && idNum > s.glowsCounter {
		s.glowsCounter = idNum
	}

	if initial.Shape == "" {
		initial.Shape = "circle"
	}
	if initial.Color == "" {
		initial.Color = "#ff0044"
	}
	if initial.Playback == "" {
		initial.Playback = "pingpong"
	}
	if initial.Size <= 0 {
		initial.Size = 25
	}
	if initial.Scale <= 0 {
		initial.Scale = 1.0
	}
	if initial.Blur <= 0 {
		initial.Blur = 50
	}
	if initial.Duration <= 0 {
		initial.Duration = 2.0
	}
	if initial.Opacity <= 0 {
		initial.Opacity = 1.0
	}
	if initial.Thick <= 0 {
		initial.Thick = 2
	}
	if initial.CoreR <= 0 {
		initial.CoreR = 5
	}
	if initial.Rings <= 0 && initial.RadarRings <= 0 {
		initial.Rings = 1
		initial.RadarRings = 1
	} else if initial.RadarRings <= 0 {
		initial.RadarRings = initial.Rings
	} else if initial.Rings <= 0 {
		initial.Rings = initial.RadarRings
	}
	if initial.Shape == "radar" {
		initial.IsRadar = true
	}
	if initial.X == 0 && initial.Y == 0 {
		initial.X = 50
		initial.Y = 50
	}

	if _, exists := s.glows[initial.ID]; !exists {
		s.glowIDs = append(s.glowIDs, initial.ID)
	}
	s.glows[initial.ID] = initial
	s.revision++

	return initial
}

// GetGlow returns a pointer to a copy of the glow by ID, or nil if not found.
func (s *Scene) GetGlow(id StringID) *Glow {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, exists := s.glows[id]
	if !exists {
		return nil
	}
	res := g
	return &res
}

// GetAllGlows returns all glows in scene order.
func (s *Scene) GetAllGlows() []Glow {
	s.mu.RLock()
	defer s.mu.RUnlock()
	res := make([]Glow, len(s.glowIDs))
	for i, id := range s.glowIDs {
		res[i] = s.glows[id]
	}
	return res
}

// UpdateGlow modifies an existing glow or inserts it if not present.
func (s *Scene) UpdateGlow(g Glow) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if g.Shape == "radar" {
		g.IsRadar = true
	}
	if g.RadarRings <= 0 && g.Rings > 0 {
		g.RadarRings = g.Rings
	} else if g.Rings <= 0 && g.RadarRings > 0 {
		g.Rings = g.RadarRings
	}

	if old, exists := s.glows[g.ID]; exists {
		if g.Name == "" && old.Name != "" {
			g.Name = old.Name
		}
	} else {
		s.glowIDs = append(s.glowIDs, g.ID)
		if idNum, err := strconv.ParseInt(string(g.ID), 10, 64); err == nil && idNum > s.glowsCounter {
			s.glowsCounter = idNum
		}
	}
	s.glows[g.ID] = g
	s.revision++
}

// RemoveGlow deletes a glow from the scene by ID.
func (s *Scene) RemoveGlow(id StringID) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if ok := s.removeGlowLocked(id); ok {
		s.revision++
		return true
	}
	return false
}

// FindGlowAt hit-tests canvas percent coordinates against all glows, returning the topmost match.
func (s *Scene) FindGlowAt(xPct, yPct, canvasW, canvasH float64) *Glow {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if canvasW <= 0 {
		canvasW = s.canvas.Width
	}
	if canvasW <= 0 {
		canvasW = 1280
	}
	if canvasH <= 0 {
		canvasH = s.canvas.Height
	}
	if canvasH <= 0 {
		canvasH = 720
	}

	testPx := (xPct / 100.0) * canvasW
	testPy := (yPct / 100.0) * canvasH

	// Inspect in reverse scene order (topmost first)
	for i := len(s.glowIDs) - 1; i >= 0; i-- {
		id := s.glowIDs[i]
		g := s.glows[id]

		gx := (g.X / 100.0) * canvasW
		gy := (g.Y / 100.0) * canvasH
		scale := g.Scale
		if scale <= 0 {
			scale = 1.0
		}

		if g.Shape == "square" {
			hw := g.Size
			if hw < 20 {
				hw = 20
			}
			if testPx >= gx-hw && testPx <= gx+hw && testPy >= gy-hw && testPy <= gy+hw {
				res := g
				return &res
			}
		} else if g.Shape == "custom" && g.CustomW > 0 && g.CustomH > 0 {
			hw := (g.CustomW * scale) / 2.0
			hh := (g.CustomH * scale) / 2.0
			if hw < 20 {
				hw = 20
			}
			if hh < 20 {
				hh = 20
			}
			if testPx >= gx-hw && testPx <= gx+hw && testPy >= gy-hh && testPy <= gy+hh {
				res := g
				return &res
			}
		} else {
			// circle or radar
			hitR := math.Max(20.0, g.Size)
			dx := testPx - gx
			dy := testPy - gy
			if dx*dx+dy*dy <= hitR*hitR {
				res := g
				return &res
			}
		}
	}
	return nil
}

// GetGlowBounds calculates the pixel bounding box and center coordinate for a glow.
func (s *Scene) GetGlowBounds(g Glow, canvasW, canvasH float64) (geometry.FlowBounds, geometry.Point) {
	if canvasW <= 0 {
		canvasW = s.canvas.Width
	}
	if canvasW <= 0 {
		canvasW = 1280
	}
	if canvasH <= 0 {
		canvasH = s.canvas.Height
	}
	if canvasH <= 0 {
		canvasH = 720
	}

	gx := (g.X / 100.0) * canvasW
	gy := (g.Y / 100.0) * canvasH
	scale := g.Scale
	if scale <= 0 {
		scale = 1.0
	}

	var minX, maxX, minY, maxY float64

	if g.Shape == "square" {
		hw := g.Size
		minX = gx - hw
		maxX = gx + hw
		minY = gy - hw
		maxY = gy + hw
	} else if g.Shape == "custom" && g.CustomW > 0 && g.CustomH > 0 {
		hw := (g.CustomW * scale) / 2.0
		hh := (g.CustomH * scale) / 2.0
		minX = gx - hw
		maxX = gx + hw
		minY = gy - hh
		maxY = gy + hh
	} else {
		r := math.Max(20.0, g.Size)
		minX = gx - r
		maxX = gx + r
		minY = gy - r
		maxY = gy + r
	}

	bounds := geometry.FlowBounds{
		MinX:   math.Round(minX*100) / 100,
		MinY:   math.Round(minY*100) / 100,
		MaxX:   math.Round(maxX*100) / 100,
		MaxY:   math.Round(maxY*100) / 100,
		Width:  math.Round((maxX-minX)*100) / 100,
		Height: math.Round((maxY-minY)*100) / 100,
	}

	center := geometry.Point{
		X: math.Round(gx*100) / 100,
		Y: math.Round(gy*100) / 100,
	}

	return bounds, center
}

// DescribeGlow returns full geometric and hit-target metadata for a glow instance.
func (s *Scene) DescribeGlow(g Glow, canvasW, canvasH float64) GlowDescription {
	bounds, center := s.GetGlowBounds(g, canvasW, canvasH)
	hitR := math.Max(20.0, g.Size)
	return GlowDescription{
		ID:        g.ID,
		Center:    center,
		Bounds:    bounds,
		HitRadius: hitR,
		Shape:     g.Shape,
		Color:     g.Color,
	}
}
