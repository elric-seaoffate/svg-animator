package scene

import (
	"errors"
	"math"
	"sort"
	"strings"
)

// MoveNodes translates multiple specified nodes by deltaX and deltaY (in percentage of canvas).
// Updates connected flows in a single transaction and bumps scene revision once.
func (s *Scene) MoveNodes(nodeIDs []StringID, deltaX float64, deltaY float64) ([]Node, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(nodeIDs) == 0 {
		return nil, errors.New("no nodes specified to move")
	}

	updated := make([]Node, 0, len(nodeIDs))
	seen := make(map[StringID]bool, len(nodeIDs))

	for _, id := range nodeIDs {
		if seen[id] {
			continue
		}
		seen[id] = true
		n, exists := s.nodes[id]
		if !exists {
			continue
		}

		n.X += deltaX
		n.Y += deltaY
		// Keep coordinates bounded to a reasonable range
		n.X = math.Max(-50.0, math.Min(150.0, n.X))
		n.Y = math.Max(-50.0, math.Min(150.0, n.Y))
		n.X = math.Round(n.X*1000.0) / 1000.0
		n.Y = math.Round(n.Y*1000.0) / 1000.0

		s.nodes[id] = n
		s.recalculateNodeConnectionsLocked(id)
		updated = append(updated, n)
	}

	if len(updated) == 0 {
		return nil, errors.New("none of the specified nodes exist")
	}

	s.revision++
	return updated, nil
}

// AlignNodes aligns multiple nodes to their collective bounding box.
// Supported modes:
//   - "align-left" / "left"
//   - "align-hcenter" / "hcenter"
//   - "align-right" / "right"
//   - "align-top" / "top"
//   - "align-vcenter" / "vcenter"
//   - "align-bottom" / "bottom"
func (s *Scene) AlignNodes(nodeIDs []StringID, mode string, canvasW float64, canvasH float64) ([]Node, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if canvasW <= 0 {
		canvasW = 1280.0
	}
	if canvasH <= 0 {
		canvasH = 720.0
	}

	// Validate eligible nodes
	seen := make(map[StringID]bool, len(nodeIDs))
	validNodes := make([]Node, 0, len(nodeIDs))
	for _, id := range nodeIDs {
		if seen[id] {
			continue
		}
		seen[id] = true
		if n, exists := s.nodes[id]; exists {
			validNodes = append(validNodes, n)
		}
	}

	if len(validNodes) < 2 {
		return nil, errors.New("at least 2 nodes required for alignment")
	}

	// Compute collective bounds in pixels
	var minLeft, maxRight, minTop, maxBottom float64
	for i, n := range validNodes {
		eff := s.GetNodeEffectiveProps(n)
		cx := (n.X / 100.0) * canvasW
		cy := (n.Y / 100.0) * canvasH
		w := eff.Width
		h := eff.Height
		l := cx - w/2.0
		r := cx + w/2.0
		t := cy - h/2.0
		b := cy + h/2.0

		if i == 0 {
			minLeft, maxRight = l, r
			minTop, maxBottom = t, b
		} else {
			if l < minLeft {
				minLeft = l
			}
			if r > maxRight {
				maxRight = r
			}
			if t < minTop {
				minTop = t
			}
			if b > maxBottom {
				maxBottom = b
			}
		}
	}

	midX := (minLeft + maxRight) / 2.0
	midY := (minTop + maxBottom) / 2.0

	normMode := strings.ToLower(strings.TrimSpace(mode))
	updated := make([]Node, 0, len(validNodes))

	for _, n := range validNodes {
		eff := s.GetNodeEffectiveProps(n)
		cx := (n.X / 100.0) * canvasW
		cy := (n.Y / 100.0) * canvasH
		w := eff.Width
		h := eff.Height

		switch normMode {
		case "align-left", "left":
			cx = minLeft + w/2.0
		case "align-hcenter", "hcenter", "center-h":
			cx = midX
		case "align-right", "right":
			cx = maxRight - w/2.0
		case "align-top", "top":
			cy = minTop + h/2.0
		case "align-vcenter", "vcenter", "center-v":
			cy = midY
		case "align-bottom", "bottom":
			cy = maxBottom - h/2.0
		default:
			return nil, errors.New("unsupported alignment mode: " + mode)
		}

		n.X = math.Round(((cx/canvasW)*100.0)*1000.0) / 1000.0
		n.Y = math.Round(((cy/canvasH)*100.0)*1000.0) / 1000.0

		s.nodes[n.ID] = n
		s.recalculateNodeConnectionsLocked(n.ID)
		updated = append(updated, n)
	}

	s.revision++
	return updated, nil
}

// DistributeNodes arranges multiple nodes with equal spacing between outer boundary objects.
// Supported modes:
//   - "distribute-horizontal" / "horizontal" / "distribute-h"
//   - "distribute-vertical" / "vertical" / "distribute-v"
func (s *Scene) DistributeNodes(nodeIDs []StringID, mode string, canvasW float64, canvasH float64) ([]Node, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if canvasW <= 0 {
		canvasW = 1280.0
	}
	if canvasH <= 0 {
		canvasH = 720.0
	}

	seen := make(map[StringID]bool, len(nodeIDs))
	validNodes := make([]Node, 0, len(nodeIDs))
	for _, id := range nodeIDs {
		if seen[id] {
			continue
		}
		seen[id] = true
		if n, exists := s.nodes[id]; exists {
			validNodes = append(validNodes, n)
		}
	}

	if len(validNodes) < 3 {
		return nil, errors.New("at least 3 nodes required for distribution")
	}

	normMode := strings.ToLower(strings.TrimSpace(mode))

	switch normMode {
	case "distribute-horizontal", "horizontal", "distribute-h":
		// Sort nodes by X center ascending (stable tie-breaker by ID)
		sort.SliceStable(validNodes, func(i, j int) bool {
			if math.Abs(validNodes[i].X-validNodes[j].X) > 0.001 {
				return validNodes[i].X < validNodes[j].X
			}
			return validNodes[i].ID < validNodes[j].ID
		})

		nFirst := validNodes[0]
		nLast := validNodes[len(validNodes)-1]
		effFirst := s.GetNodeEffectiveProps(nFirst)
		effLast := s.GetNodeEffectiveProps(nLast)

		leftBoundary := (nFirst.X/100.0)*canvasW - effFirst.Width/2.0
		rightBoundary := (nLast.X/100.0)*canvasW + effLast.Width/2.0
		totalSpan := rightBoundary - leftBoundary

		var totalWidth float64
		for _, n := range validNodes {
			eff := s.GetNodeEffectiveProps(n)
			totalWidth += eff.Width
		}

		totalGap := totalSpan - totalWidth
		gap := totalGap / float64(len(validNodes)-1)

		updated := make([]Node, 0, len(validNodes))
		currLeft := leftBoundary

		for i, n := range validNodes {
			eff := s.GetNodeEffectiveProps(n)
			w := eff.Width
			cx := currLeft + w/2.0
			currLeft += w + gap

			if i == 0 || i == len(validNodes)-1 {
				// Anchor nodes retain their exact bounds
				updated = append(updated, n)
				continue
			}

			n.X = math.Round(((cx/canvasW)*100.0)*1000.0) / 1000.0
			s.nodes[n.ID] = n
			s.recalculateNodeConnectionsLocked(n.ID)
			updated = append(updated, n)
		}

		s.revision++
		return updated, nil

	case "distribute-vertical", "vertical", "distribute-v":
		// Sort nodes by Y center ascending (stable tie-breaker by ID)
		sort.SliceStable(validNodes, func(i, j int) bool {
			if math.Abs(validNodes[i].Y-validNodes[j].Y) > 0.001 {
				return validNodes[i].Y < validNodes[j].Y
			}
			return validNodes[i].ID < validNodes[j].ID
		})

		nFirst := validNodes[0]
		nLast := validNodes[len(validNodes)-1]
		effFirst := s.GetNodeEffectiveProps(nFirst)
		effLast := s.GetNodeEffectiveProps(nLast)

		topBoundary := (nFirst.Y/100.0)*canvasH - effFirst.Height/2.0
		bottomBoundary := (nLast.Y/100.0)*canvasH + effLast.Height/2.0
		totalSpan := bottomBoundary - topBoundary

		var totalHeight float64
		for _, n := range validNodes {
			eff := s.GetNodeEffectiveProps(n)
			totalHeight += eff.Height
		}

		totalGap := totalSpan - totalHeight
		gap := totalGap / float64(len(validNodes)-1)

		updated := make([]Node, 0, len(validNodes))
		currTop := topBoundary

		for i, n := range validNodes {
			eff := s.GetNodeEffectiveProps(n)
			h := eff.Height
			cy := currTop + h/2.0
			currTop += h + gap

			if i == 0 || i == len(validNodes)-1 {
				// Anchor nodes retain their exact bounds
				updated = append(updated, n)
				continue
			}

			n.Y = math.Round(((cy/canvasH)*100.0)*1000.0) / 1000.0
			s.nodes[n.ID] = n
			s.recalculateNodeConnectionsLocked(n.ID)
			updated = append(updated, n)
		}

		s.revision++
		return updated, nil

	default:
		return nil, errors.New("unsupported distribution mode: " + mode)
	}
}
