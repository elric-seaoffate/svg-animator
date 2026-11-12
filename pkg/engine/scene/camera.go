package scene

import (
	"errors"
	"fmt"
	"math"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
)

// ValidateCamera checks that camera configuration properties conform to operational bounds.
func ValidateCamera(c *CameraConfig) error {
	if c == nil {
		return errors.New("nil camera config")
	}
	switch c.Motion {
	case "", "static", "ken-burns", "handheld-drift", "perspective-tilt":
		// valid
	default:
		return fmt.Errorf("unsupported camera motion: %q", c.Motion)
	}
	if c.Duration < 0 {
		return errors.New("camera duration cannot be negative")
	}
	return nil
}

// ComputeCameraTransform evaluates the exact 2D camera viewport translation and scale,
// matching the browser SVG engine coordinate clamping logic.
func ComputeCameraTransform(w, h, zx, zy, zz, rollDeg float64) (tx, ty, safeZoom float64, transformStr string) {
	if w <= 0 {
		w = 1280
	}
	if h <= 0 {
		h = 720
	}
	safeZoom = math.Max(1.0, zz)
	vw := w / safeZoom
	vh := h / safeZoom

	vx := (zx / 100.0) * w - (vw / 2.0)
	vy := (zy / 100.0) * h - (vh / 2.0)

	if vx < 0 {
		vx = 0
	}
	if vy < 0 {
		vy = 0
	}
	if vx+vw > w {
		vx = w - vw
	}
	if vy+vh > h {
		vy = h - vh
	}

	tx = -vx * safeZoom
	ty = -vy * safeZoom

	rotStr := ""
	if math.Abs(rollDeg) > 0.001 {
		rotStr = fmt.Sprintf(" rotateZ(%.3fdeg)", rollDeg)
	}
	transformStr = fmt.Sprintf("translate3d(%.3fpx, %.3fpx, 0px)%s scale(%.4f)", tx, ty, rotStr, safeZoom)
	return tx, ty, safeZoom, transformStr
}

// EvaluateCameraAtTime computes the camera transform at a specific timeline timestamp.
func EvaluateCameraAtTime(c CameraConfig, timeSec, w, h float64, easeFn func(p float64) float64) (tx, ty, scale, roll float64, transformStr, stage3dTransform string) {
	if w <= 0 {
		w = 1280
	}
	if h <= 0 {
		h = 720
	}
	camDur := c.Duration
	if camDur <= 0 {
		camDur = 7.0
	}

	switch c.Motion {
	case "ken-burns":
		var prog float64
		if camDur > 0 {
			if c.Loop == "pingpong" {
				cycles := int(math.Floor(timeSec / camDur))
				rem := (timeSec - float64(cycles)*camDur) / camDur
				if cycles%2 == 1 {
					prog = 1.0 - rem
				} else {
					prog = rem
				}
			} else if c.Loop == "loop" {
				cycles := int(math.Floor(timeSec / camDur))
				prog = (timeSec - float64(cycles)*camDur) / camDur
			} else { // "once"
				if timeSec >= camDur {
					prog = 1.0
				} else if timeSec <= 0 {
					prog = 0.0
				} else {
					prog = timeSec / camDur
				}
			}
		}
		if prog < 0 {
			prog = 0
		} else if prog > 1 {
			prog = 1
		}

		eased := prog
		if easeFn != nil {
			eased = easeFn(prog)
		}

		zx := c.StartX + (c.EndX-c.StartX)*eased
		zy := c.StartY + (c.EndY-c.StartY)*eased
		zz := c.StartZoom + (c.EndZoom-c.StartZoom)*eased
		tx, ty, scale, transformStr = ComputeCameraTransform(w, h, zx, zy, zz, 0.0)
		return tx, ty, scale, 0.0, transformStr, ""

	case "handheld-drift":
		sway := c.Sway
		if sway <= 0 {
			sway = 1.4
		}
		breathe := c.Breathe
		if breathe <= 0 {
			breathe = 1.8
		}
		breatheRatio := breathe / 100.0
		baseZoom := math.Max(1.06, c.StartZoom)
		if baseZoom <= 1.0 {
			baseZoom = 1.1
		}

		// 8-point asymmetric harmonic path
		tNorm := 0.0
		if camDur > 0 {
			if c.Loop == "once" {
				if timeSec >= camDur {
					tNorm = 1.0
				} else if timeSec <= 0 {
					tNorm = 0.0
				} else {
					tNorm = timeSec / camDur
				}
			} else if c.Loop == "pingpong" {
				cycles := int(math.Floor(timeSec / camDur))
				rem := (timeSec - float64(cycles)*camDur) / camDur
				if cycles%2 == 1 {
					tNorm = 1.0 - rem
				} else {
					tNorm = rem
				}
			} else {
				cycles := int(math.Floor(timeSec / camDur))
				tNorm = (timeSec - float64(cycles)*camDur) / camDur
			}
			if tNorm < 0 {
				tNorm = 0
			} else if tNorm > 1 {
				tNorm = 1
			}
		}

		type keyframe struct {
			t     float64
			dx    float64
			dy    float64
			dZoom float64
			dRoll float64
		}
		kfs := [9]keyframe{
			{0.000, 0.0, 0.0, 0.0, 0.0},
			{0.125, 0.50 * sway, -0.35 * sway, 0.35 * breatheRatio, 0.18},
			{0.250, 0.70 * sway, 0.15 * sway, 0.75 * breatheRatio, -0.12},
			{0.375, 0.25 * sway, 0.55 * sway, 0.45 * breatheRatio, -0.28},
			{0.500, -0.45 * sway, 0.30 * sway, 0.90 * breatheRatio, 0.15},
			{0.625, -0.65 * sway, -0.25 * sway, 0.50 * breatheRatio, 0.25},
			{0.750, -0.30 * sway, -0.55 * sway, 0.20 * breatheRatio, -0.18},
			{0.875, 0.20 * sway, -0.25 * sway, 0.10 * breatheRatio, -0.08},
			{1.000, 0.0, 0.0, 0.0, 0.0},
		}

		var prev, next keyframe
		for i := 0; i < len(kfs)-1; i++ {
			if tNorm >= kfs[i].t && tNorm <= kfs[i+1].t {
				prev = kfs[i]
				next = kfs[i+1]
				break
			}
		}

		segSpan := next.t - prev.t
		segP := 0.0
		if segSpan > 0 {
			segP = (tNorm - prev.t) / segSpan
		}
		// Smooth step easing
		smoothP := segP * segP * (3.0 - 2.0*segP)

		curDx := prev.dx + (next.dx-prev.dx)*smoothP
		curDy := prev.dy + (next.dy-prev.dy)*smoothP
		curZoomRatio := prev.dZoom + (next.dZoom-prev.dZoom)*smoothP
		curRoll := prev.dRoll + (next.dRoll-prev.dRoll)*smoothP

		curZx := c.StartX + curDx
		curZy := c.StartY + curDy
		curZz := baseZoom * (1.0 + curZoomRatio)

		tx, ty, scale, transformStr = ComputeCameraTransform(w, h, curZx, curZy, curZz, curRoll)
		return tx, ty, scale, curRoll, transformStr, ""

	case "perspective-tilt":
		pitch := c.TiltX
		yaw := c.TiltY
		stage3dTransform = fmt.Sprintf("perspective(1000px) rotateX(%.2fdeg) rotateY(%.2fdeg)", pitch, yaw)
		tx, ty, scale, transformStr = ComputeCameraTransform(w, h, c.StartX, c.StartY, c.StartZoom, 0.0)
		return tx, ty, scale, 0.0, transformStr, stage3dTransform

	default: // "static" or locked-off
		sz := c.StartZoom
		if sz <= 0 {
			sz = 1.0
		}
		tx, ty, scale, transformStr = ComputeCameraTransform(w, h, c.StartX, c.StartY, sz, 0.0)
		return tx, ty, scale, 0.0, transformStr, ""
	}
}

// UpdateCamera replaces the camera configuration in the active scene and bumps revision.
func (s *Scene) UpdateCamera(c CameraConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if c.Duration <= 0 {
		c.Duration = s.canvas.Duration
	}
	if c.Loop == "" {
		c.Loop = s.canvas.PlaybackMode
	}
	s.camera = c
	s.revision++
}

// GetCamera returns a copy of the scene's current camera configuration.
func (s *Scene) GetCamera() CameraConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.camera
}

// Ensure geometry.Point is referenced if needed
var _ = geometry.Point{}
