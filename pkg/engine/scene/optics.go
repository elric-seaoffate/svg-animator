package scene

import (
	"errors"
	"fmt"
	"math"
)

// ValidateOptical checks that optical effect parameters conform to operational bounds.
func ValidateOptical(opt *OpticalConfig) error {
	if opt == nil {
		return errors.New("nil optical config")
	}
	switch opt.Type {
	case "", "none", "focus-pull", "tilt-shift", "motion-blur":
		// valid
	default:
		return fmt.Errorf("unsupported optical effect type: %q", opt.Type)
	}
	if opt.StartBlur < 0 || opt.EndBlur < 0 || opt.TSBlur < 0 {
		return errors.New("blur radius cannot be negative")
	}
	return nil
}

// EvaluateOpticalAtTime computes the active optical filter parameters and SVG filter defs at timeSec.
func EvaluateOpticalAtTime(opt OpticalConfig, timeSec, camDur float64, camLoop string, easeFn func(p float64) float64) (blur float64, filterAttr, defs string, isActive bool) {
	switch opt.Type {
	case "focus-pull":
		fDur := opt.FocusDur
		if fDur <= 0 {
			fDur = camDur
		}
		if fDur <= 0 {
			fDur = 4.0
		}

		var prog float64
		if camLoop == "pingpong" {
			totalCycle := fDur * 2.0
			cycles := int(math.Floor(timeSec / totalCycle))
			rem := (timeSec - float64(cycles)*totalCycle) / fDur
			if rem <= 1.0 {
				prog = rem
			} else {
				prog = 2.0 - rem
			}
		} else if camLoop == "loop" {
			cycles := int(math.Floor(timeSec / fDur))
			prog = (timeSec - float64(cycles)*fDur) / fDur
		} else { // "once"
			if timeSec >= fDur {
				prog = 1.0
			} else if timeSec <= 0 {
				prog = 0.0
			} else {
				prog = timeSec / fDur
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

		curBlur := opt.StartBlur + (opt.EndBlur-opt.StartBlur)*eased
		filterDef := fmt.Sprintf(`<filter id="opt-focus" x="-20%%" y="-20%%" width="140%%" height="140%%"><feGaussianBlur stdDeviation="%.2f" /></filter>`, curBlur)
		return curBlur, `filter="url(#opt-focus)"`, filterDef, true

	case "tilt-shift":
		tsBlur := opt.TSBlur
		if tsBlur <= 0 {
			tsBlur = 12.0
		}
		filterDef := fmt.Sprintf(`<filter id="opt-ts-blur" x="-20%%" y="-20%%" width="140%%" height="140%%"><feGaussianBlur stdDeviation="%.2f" /></filter>`, tsBlur)
		return tsBlur, `filter="url(#opt-ts-blur)"`, filterDef, true

	case "motion-blur":
		rad := opt.MBAng * (math.Pi / 180.0)
		bx := math.Abs(math.Cos(rad) * opt.MBInt)
		by := math.Abs(math.Sin(rad) * opt.MBInt)
		filterDef := fmt.Sprintf(`<filter id="opt-mb-blur" x="-20%%" y="-20%%" width="140%%" height="140%%"><feGaussianBlur stdDeviation="%.2f %.2f" /></filter>`, bx, by)
		return math.Max(bx, by), `filter="url(#opt-mb-blur)"`, filterDef, true

	default: // "none" or unconfigured
		return 0.0, "", "", false
	}
}

// UpdateOptical replaces the optical configuration in the active scene and bumps revision.
func (s *Scene) UpdateOptical(opt OpticalConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.optical = opt
	s.revision++
}

// GetOptical returns a copy of the scene's current optical configuration.
func (s *Scene) GetOptical() OpticalConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.optical
}
