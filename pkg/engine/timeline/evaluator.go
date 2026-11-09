package timeline

import (
	"fmt"
	"math"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/scene"
)

// FlowFrameUpdate holds the animated state of a flow's payload and line track at time T.
type FlowFrameUpdate struct {
	ID         string  `json:"id"`
	Visible    bool    `json:"visible"`
	Progress   float64 `json:"progress"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	Rotation   float64 `json:"rotation"`
	Opacity    float64 `json:"opacity"`
	DashOffset float64 `json:"dashOffset"`
}

// RadarRingUpdate holds the animated radius and opacity of a single radar ring.
type RadarRingUpdate struct {
	Radius  float64 `json:"radius"`
	Opacity float64 `json:"opacity"`
}

// GlowFrameUpdate holds the animated state of a hotspot or radar ping at time T.
type GlowFrameUpdate struct {
	ID          string            `json:"id"`
	Visible     bool              `json:"visible"`
	CoreOpacity float64           `json:"coreOpacity"`
	RadarRings  []RadarRingUpdate `json:"radarRings,omitempty"`
}

// RippleWaveUpdate holds the animated radius and opacity of a single ripple ring.
type RippleWaveUpdate struct {
	Radius  float64 `json:"radius"`
	Opacity float64 `json:"opacity"`
}

// RippleFrameUpdate holds the animated state of a ripple wave at time T.
type RippleFrameUpdate struct {
	ID      string             `json:"id"`
	Visible bool               `json:"visible"`
	Radius  float64            `json:"radius"`
	Opacity float64            `json:"opacity"`
	Waves   []RippleWaveUpdate `json:"waves,omitempty"`
}

// CameraFrameUpdate holds the animated viewport transform at time T.
type CameraFrameUpdate struct {
	Motion     string  `json:"motion"`
	Scale      float64 `json:"scale"`
	TranslateX float64 `json:"translateX"`
	TranslateY float64 `json:"translateY"`
	RotateX    float64 `json:"rotateX"`
	RotateY    float64 `json:"rotateY"`
	Transform  string  `json:"transform"`
}

// NodeFrameUpdate holds animated transform/opacity for diagram nodes.
type NodeFrameUpdate struct {
	ID         string  `json:"id"`
	Opacity    float64 `json:"opacity"`
	TranslateY float64 `json:"translateY"`
}

// FrameResult is the batched presentation update returned to JavaScript for time T.
type FrameResult struct {
	Time           float64             `json:"time"`
	NormalizedTime float64             `json:"normalizedTime"`
	Revision       int64               `json:"revision"`
	Flows          []FlowFrameUpdate   `json:"flows"`
	Glows          []GlowFrameUpdate   `json:"glows"`
	Ripples        []RippleFrameUpdate `json:"ripples"`
	Camera         CameraFrameUpdate   `json:"camera"`
	Nodes          []NodeFrameUpdate   `json:"nodes"`
}

// EvaluateSceneAtTime calculates deterministic visual state for all animated scene objects at timeSec.
func EvaluateSceneAtTime(s *scene.Scene, timeSec float64) FrameResult {
	if s == nil {
		return FrameResult{Time: timeSec}
	}

	snap := s.GetSnapshot()
	width := snap.Canvas.Width
	if width <= 0 {
		width = 1280
	}
	height := snap.Canvas.Height
	if height <= 0 {
		height = 720
	}

	dur := snap.Canvas.Duration
	if dur <= 0 {
		dur = 7.0
	}
	normTime, _, _ := EvaluateTimelineProgress(timeSec, dur, snap.Canvas.PlaybackMode)

	res := FrameResult{
		Time:           timeSec,
		NormalizedTime: normTime,
		Revision:       snap.Revision,
		Flows:          make([]FlowFrameUpdate, 0, len(snap.Flows)),
		Glows:          make([]GlowFrameUpdate, 0, len(snap.Glows)),
		Ripples:        make([]RippleFrameUpdate, 0, len(snap.Ripples)),
		Nodes:          make([]NodeFrameUpdate, 0, len(snap.Nodes)),
	}

	// 1. Evaluate Flow Connectors & Payloads
	for _, f := range snap.Flows {
		speed := f.Speed
		if speed <= 0 {
			speed = 2.0
		}

		prog, active := EvaluateCycle(timeSec, f.Delay, speed, f.EndDelay, "loop")
		visible := (timeSec >= f.Delay)

		baseOp := f.Opacity
		if baseOp <= 0 {
			baseOp = 0.85
		}

		var op float64
		if !visible || (!active && f.HideOnDelay) {
			op = 0
		} else if !active {
			op = baseOp
		} else {
			// Fade in during first 8%, fade out during last 8%
			if prog < 0.08 {
				op = baseOp * (prog / 0.08)
			} else if prog > 0.92 {
				op = baseOp * ((1.0 - prog) / 0.08)
			} else {
				op = baseOp
			}
		}

		// Calculate exact point and tangent rotation
		pt, angle := geometry.SampleFlowPathAtProgress(f.Nodes, f.Curvature, width, height, f.RouteMode, prog)

		// Marching dashoffset: moving forward along line
		dashOffset := 32.0 - math.Mod(timeSec*32.0, 32.0)

		res.Flows = append(res.Flows, FlowFrameUpdate{
			ID:         string(f.ID),
			Visible:    visible,
			Progress:   math.Round(prog*10000) / 10000,
			X:          pt.X,
			Y:          pt.Y,
			Rotation:   angle,
			Opacity:    math.Round(op*1000) / 1000,
			DashOffset: math.Round(dashOffset*100) / 100,
		})
	}

	// 2. Evaluate Pulsating Glows & Radar Pings
	for _, g := range snap.Glows {
		gDur := g.Duration
		if gDur <= 0 {
			gDur = 1.5
		}
		gProg, active := EvaluateCycle(timeSec, g.Delay, gDur, g.EndDelay, g.Playback)
		baseOp := g.Opacity
		if baseOp <= 0 {
			baseOp = 0.8
		}

		var coreOp float64
		if timeSec < g.Delay {
			coreOp = 0
		} else if g.Playback == "static" {
			coreOp = baseOp
		} else if g.Playback == "pingpong" {
			if active {
				coreOp = baseOp * math.Sin(gProg*math.Pi)
			} else {
				coreOp = 0
			}
		} else if g.Playback == "once" {
			if active {
				coreOp = baseOp * gProg
			} else {
				coreOp = baseOp
			}
		} else { // "linear" or default loop
			if active {
				coreOp = baseOp * gProg
			} else if g.HideOnDelay {
				coreOp = 0
			} else {
				coreOp = baseOp
			}
		}

		var rings []RadarRingUpdate
		if g.IsRadar {
			numRings := g.RadarRings
			if numRings <= 0 {
				numRings = 3
			}
			stagger := g.RadarStagger
			if stagger <= 0 {
				stagger = 0.25
			}
			rings = make([]RadarRingUpdate, 0, numRings)
			for k := 0; k < numRings; k++ {
				rProg, rActive := EvaluateCycle(timeSec, g.Delay+float64(k)*stagger, gDur, g.EndDelay, "loop")
				if rActive {
					r := 4.0 + (g.Size-4.0)*rProg
					rOp := baseOp * (1.0 - rProg)
					rings = append(rings, RadarRingUpdate{
						Radius:  math.Round(r*100) / 100,
						Opacity: math.Round(rOp*1000) / 1000,
					})
				} else {
					rings = append(rings, RadarRingUpdate{
						Radius:  4.0,
						Opacity: 0.0,
					})
				}
			}
		}

		res.Glows = append(res.Glows, GlowFrameUpdate{
			ID:          string(g.ID),
			Visible:     active || timeSec >= g.Delay,
			CoreOpacity: math.Round(coreOp*1000) / 1000,
			RadarRings:  rings,
		})
	}

	// 3. Evaluate Ripples
	for _, r := range snap.Ripples {
		rDur := r.Duration
		if rDur <= 0 {
			rDur = 2.0
		}
		numRings := r.Rings
		if numRings <= 0 {
			numRings = 1
		}
		baseOp := r.Opacity
		if baseOp <= 0 {
			baseOp = 0.85
		}

		waves := make([]RippleWaveUpdate, 0, numRings)
		var firstRadius, firstOpacity float64
		anyVisible := false

		for k := 0; k < numRings; k++ {
			stagger := (rDur / float64(numRings)) * float64(k)
			rProg, active := EvaluateCycle(timeSec, r.Delay+stagger, rDur, r.EndDelay, "loop")
			if active {
				anyVisible = true
				eased := SolveCubicBezier(0.1, 0.8, 0.3, 1.0, rProg)
				waveR := r.InnerR + (r.OuterR-r.InnerR)*eased
				waveOp := baseOp * (1.0 - eased)
				wu := RippleWaveUpdate{
					Radius:  math.Round(waveR*100) / 100,
					Opacity: math.Round(waveOp*1000) / 1000,
				}
				waves = append(waves, wu)
				if k == 0 {
					firstRadius = wu.Radius
					firstOpacity = wu.Opacity
				}
			} else {
				wu := RippleWaveUpdate{
					Radius:  r.InnerR,
					Opacity: 0.0,
				}
				waves = append(waves, wu)
				if k == 0 {
					firstRadius = r.InnerR
					firstOpacity = 0.0
				}
			}
		}

		res.Ripples = append(res.Ripples, RippleFrameUpdate{
			ID:      string(r.ID),
			Visible: anyVisible,
			Radius:  firstRadius,
			Opacity: firstOpacity,
			Waves:   waves,
		})
	}

	// 4. Evaluate Camera Rig
	cam := snap.Camera
	cDur := cam.Duration
	if cDur <= 0 {
		cDur = dur
	}
	camProg, _, _ := EvaluateTimelineProgress(timeSec, cDur, cam.Loop)

	switch cam.Motion {
	case "ken-burns":
		easedProg := SolveCubicBezier(0.42, 0, 0.58, 1, camProg)
		scale := cam.StartZoom + (cam.EndZoom-cam.StartZoom)*easedProg
		sx := cam.StartX + (cam.EndX-cam.StartX)*easedProg
		sy := cam.StartY + (cam.EndY-cam.StartY)*easedProg
		tx := (50.0 - sx) * (width / 100.0)
		ty := (50.0 - sy) * (height / 100.0)

		res.Camera = CameraFrameUpdate{
			Motion:     cam.Motion,
			Scale:      math.Round(scale*1000) / 1000,
			TranslateX: math.Round(tx*100) / 100,
			TranslateY: math.Round(ty*100) / 100,
			Transform:  fmt.Sprintf("translate(%.2f, %.2f) scale(%.3f)", tx, ty, scale),
		}

	case "handheld-drift":
		sway := cam.Sway
		if sway <= 0 {
			sway = 1.4
		}
		breathe := cam.Breathe
		if breathe <= 0 {
			breathe = 1.8
		}
		scale := cam.StartZoom + 0.015*math.Sin(timeSec*2.0*math.Pi/breathe)
		tx := sway * 4.0 * math.Sin(timeSec*1.5)
		ty := sway * 3.0 * math.Cos(timeSec*1.2)

		res.Camera = CameraFrameUpdate{
			Motion:     cam.Motion,
			Scale:      math.Round(scale*1000) / 1000,
			TranslateX: math.Round(tx*100) / 100,
			TranslateY: math.Round(ty*100) / 100,
			Transform:  fmt.Sprintf("translate(%.2f, %.2f) scale(%.3f)", tx, ty, scale),
		}

	default: // "static" or locked-off
		scale := cam.StartZoom
		if scale <= 0 {
			scale = 1.0
		}
		tx := (50.0 - cam.StartX) * (width / 100.0)
		ty := (50.0 - cam.StartY) * (height / 100.0)

		res.Camera = CameraFrameUpdate{
			Motion:     "static",
			Scale:      math.Round(scale*1000) / 1000,
			TranslateX: math.Round(tx*100) / 100,
			TranslateY: math.Round(ty*100) / 100,
			Transform:  fmt.Sprintf("translate(%.2f, %.2f) scale(%.3f)", tx, ty, scale),
		}
	}

	// 5. Evaluate Nodes
	for _, n := range snap.Nodes {
		op := n.Opacity
		if op <= 0 {
			op = 1.0
		}
		var dy float64
		if n.Animation == "pulse" {
			op = 0.65 + 0.35*(math.Sin(timeSec*2.0*math.Pi/2.6)+1.0)/2.0
		} else if n.Animation == "float" {
			dy = -6.0 * (math.Sin(timeSec*2.0*math.Pi/3.2) + 1.0) / 2.0
		}
		res.Nodes = append(res.Nodes, NodeFrameUpdate{
			ID:         string(n.ID),
			Opacity:    math.Round(op*1000) / 1000,
			TranslateY: math.Round(dy*100) / 100,
		})
	}

	return res
}
