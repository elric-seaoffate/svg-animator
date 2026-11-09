package timeline

import (
	"math"
)

// EvaluateTimelineProgress computes the normalized progress [0, 1] of an overall timeline.
func EvaluateTimelineProgress(timeSec, duration float64, loopMode string) (progress float64, cycle int, isReverse bool) {
	if duration <= 0 || timeSec <= 0 {
		return 0, 0, false
	}

	switch loopMode {
	case "once":
		if timeSec >= duration {
			return 1.0, 0, false
		}
		return timeSec / duration, 0, false

	case "pingpong":
		cycles := int(math.Floor(timeSec / duration))
		rem := (timeSec - float64(cycles)*duration) / duration
		if cycles%2 == 1 {
			return 1.0 - rem, cycles, true
		}
		return rem, cycles, false

	case "loop":
		fallthrough
	default:
		cycles := int(math.Floor(timeSec / duration))
		rem := (timeSec - float64(cycles)*duration) / duration
		if rem < 0 {
			rem = 0
		} else if rem > 1 {
			rem = 1
		}
		return rem, cycles, false
	}
}

// EvaluateCycle computes cycle progress [0, 1] for an effect with start delay, active duration, and end pause.
func EvaluateCycle(timeSec, startDelay, dur, endDelay float64, playbackMode string) (progress float64, active bool) {
	if dur <= 0 {
		return 0, false
	}
	if timeSec < startDelay {
		return 0, false
	}

	localTime := timeSec - startDelay
	totalCycle := dur + endDelay
	if totalCycle <= 0 {
		return 0, false
	}

	if playbackMode == "once" {
		if localTime >= dur {
			return 1.0, false
		}
		return localTime / dur, true
	}

	cycleNum := int(math.Floor(localTime / totalCycle))
	tInCycle := localTime - float64(cycleNum)*totalCycle

	isPingPongRev := (playbackMode == "pingpong") && (cycleNum%2 == 1)

	if tInCycle <= dur {
		rawP := tInCycle / dur
		if rawP < 0 {
			rawP = 0
		} else if rawP > 1 {
			rawP = 1
		}
		if isPingPongRev {
			return 1.0 - rawP, true
		}
		return rawP, true
	}

	// In endDelay pause
	if isPingPongRev {
		return 0.0, false
	}
	return 1.0, false
}
