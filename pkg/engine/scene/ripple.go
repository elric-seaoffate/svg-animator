package scene

import (
	"errors"
	"math"
	"strconv"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
)

// RippleDescription contains calculated visual geometry and hit bounds for a liquid ripple instance.
type RippleDescription struct {
	ID        StringID            `json:"id"`
	Center    geometry.Point      `json:"center"`
	Bounds    geometry.FlowBounds `json:"bounds"`
	HitRadius float64             `json:"hitRadius"`
	OuterR    float64             `json:"outerR"`
	Color     string              `json:"color"`
}

// ValidateRipple checks that ripple parameters conform to valid operational limits.
func ValidateRipple(r *Ripple) error {
	if r == nil {
		return errors.New("nil ripple")
	}
	if r.OuterR < r.InnerR {
		return errors.New("outer radius cannot be smaller than inner radius")
	}
	if r.Duration <= 0 {
		return errors.New("duration must be greater than 0")
	}
	if r.Opacity < 0 || r.Opacity > 1.0 {
		return errors.New("opacity must be between 0.0 and 1.0")
	}
	return nil
}

// CreateRipple adds a new refractive water ripple to the scene with authoritative defaults and identity.
func (s *Scene) CreateRipple(initial Ripple) Ripple {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.ripplesCounter++
	if initial.ID == "" {
		initial.ID = StringID(strconv.FormatInt(s.ripplesCounter, 10))
	} else if idNum, err := strconv.ParseInt(string(initial.ID), 10, 64); err == nil && idNum > s.ripplesCounter {
		s.ripplesCounter = idNum
	}

	if initial.Color == "" {
		initial.Color = "#ffffff"
	}
	if initial.Opacity <= 0 {
		initial.Opacity = 0.4
	}
	if initial.OuterR <= 0 {
		initial.OuterR = 150.0
	}
	if initial.Rings <= 0 && initial.WaveCount <= 0 {
		initial.Rings = 3
		initial.WaveCount = 3
	} else if initial.WaveCount <= 0 {
		initial.WaveCount = initial.Rings
	} else if initial.Rings <= 0 {
		initial.Rings = initial.WaveCount
	}
	if initial.Thick <= 0 {
		initial.Thick = 8.0
	}
	if initial.Refraction <= 0 {
		initial.Refraction = 35.0
	}
	if initial.Duration <= 0 {
		initial.Duration = 3.0
	}
	if initial.EndDelay == 0 && initial.Delay == 0 {
		initial.EndDelay = 1.0
	}
	if initial.X == 0 && initial.Y == 0 {
		initial.X = 50
		initial.Y = 50
	}

	if _, exists := s.ripples[initial.ID]; !exists {
		s.rippleIDs = append(s.rippleIDs, initial.ID)
	}
	s.ripples[initial.ID] = initial
	s.revision++

	return initial
}

// GetRipple returns a pointer to a copy of the ripple by ID, or nil if not found.
func (s *Scene) GetRipple(id StringID) *Ripple {
	s.mu.RLock()
	defer s.mu.RUnlock()
	r, exists := s.ripples[id]
	if !exists {
		return nil
	}
	res := r
	return &res
}

// GetAllRipples returns all ripples in scene order.
func (s *Scene) GetAllRipples() []Ripple {
	s.mu.RLock()
	defer s.mu.RUnlock()
	res := make([]Ripple, len(s.rippleIDs))
	for i, id := range s.rippleIDs {
		res[i] = s.ripples[id]
	}
	return res
}

// UpdateRipple modifies an existing ripple or inserts it if not present.
func (s *Scene) UpdateRipple(r Ripple) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if r.WaveCount <= 0 && r.Rings > 0 {
		r.WaveCount = r.Rings
	} else if r.Rings <= 0 && r.WaveCount > 0 {
		r.Rings = r.WaveCount
	}

	if old, exists := s.ripples[r.ID]; exists {
		if r.Name == "" && old.Name != "" {
			r.Name = old.Name
		}
	} else {
		s.rippleIDs = append(s.rippleIDs, r.ID)
	}
	s.ripples[r.ID] = r
	s.revision++
}

// RemoveRipple deletes a ripple from the scene by ID.
func (s *Scene) RemoveRipple(id StringID) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.ripples[id]; !exists {
		return false
	}
	delete(s.ripples, id)
	newIDs := make([]StringID, 0, len(s.rippleIDs)-1)
	for _, rid := range s.rippleIDs {
		if rid != id {
			newIDs = append(newIDs, rid)
		}
	}
	s.rippleIDs = newIDs
	s.revision++
	return true
}

// FindRippleAt hit-tests canvas percent coordinates against all ripples, returning the topmost match.
func (s *Scene) FindRippleAt(xPct, yPct, canvasW, canvasH float64) *Ripple {
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
	for i := len(s.rippleIDs) - 1; i >= 0; i-- {
		id := s.rippleIDs[i]
		r := s.ripples[id]

		rx := (r.X / 100.0) * canvasW
		ry := (r.Y / 100.0) * canvasH
		hitR := math.Max(30.0, r.OuterR)

		dx := testPx - rx
		dy := testPy - ry
		if dx*dx+dy*dy <= hitR*hitR {
			res := r
			return &res
		}
	}
	return nil
}

// GetRippleBounds calculates the pixel bounding box and center coordinate for a ripple.
func (s *Scene) GetRippleBounds(r Ripple, canvasW, canvasH float64) (geometry.FlowBounds, geometry.Point) {
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

	rx := (r.X / 100.0) * canvasW
	ry := (r.Y / 100.0) * canvasH
	hitR := math.Max(30.0, r.OuterR)

	bounds := geometry.FlowBounds{
		MinX:   math.Round((rx-hitR)*100) / 100,
		MinY:   math.Round((ry-hitR)*100) / 100,
		MaxX:   math.Round((rx+hitR)*100) / 100,
		MaxY:   math.Round((ry+hitR)*100) / 100,
		Width:  math.Round((hitR*2.0)*100) / 100,
		Height: math.Round((hitR*2.0)*100) / 100,
	}

	center := geometry.Point{
		X: math.Round(rx*100) / 100,
		Y: math.Round(ry*100) / 100,
	}

	return bounds, center
}

// DescribeRipple returns full geometric and hit-target metadata for a ripple instance.
func (s *Scene) DescribeRipple(r Ripple, canvasW, canvasH float64) RippleDescription {
	bounds, center := s.GetRippleBounds(r, canvasW, canvasH)
	hitR := math.Max(30.0, r.OuterR)
	return RippleDescription{
		ID:        r.ID,
		Center:    center,
		Bounds:    bounds,
		HitRadius: hitR,
		OuterR:    r.OuterR,
		Color:     r.Color,
	}
}
