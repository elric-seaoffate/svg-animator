package geometry

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// formatCoord formats coordinates matching JavaScript SVG formatting (e.g. -85, 170, 350.5).
func formatCoord(v float64) string {
	rounded := math.Round(v*100) / 100
	if math.Abs(rounded-math.Trunc(rounded)) < 1e-6 {
		return strconv.FormatInt(int64(rounded), 10)
	}
	return strconv.FormatFloat(rounded, 'f', -1, 64)
}

// ShapeDefinition describes metadata for a registered SVG node shape.
type ShapeDefinition struct {
	ID            string  `json:"id"`
	DisplayName   string  `json:"displayName"`
	Category      string  `json:"category"`
	DefaultWidth  float64 `json:"defaultWidth"`
	DefaultHeight float64 `json:"defaultHeight"`
}

// ShapeBounds represents axis-aligned bounding box coordinates centered at (0, 0).
type ShapeBounds struct {
	MinX   float64 `json:"minX"`
	MinY   float64 `json:"minY"`
	MaxX   float64 `json:"maxX"`
	MaxY   float64 `json:"maxY"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

// ShapeAnchors defines connection anchor points for attaching connectors and badges.
type ShapeAnchors struct {
	Top    Point `json:"top"`
	Bottom Point `json:"bottom"`
	Left   Point `json:"left"`
	Right  Point `json:"right"`
	Center Point `json:"center"`
}

// ShapeElement describes a single SVG geometry primitive.
type ShapeElement struct {
	Type       string            `json:"type"`       // "rect", "circle", "ellipse", "polygon", "polyline", "path", "line"
	Attributes map[string]string `json:"attributes"` // SVG attributes e.g. x, y, width, height, d, points, rx, ry
}

// TextPlacement provides calculated line and subtext coordinates for text rendering.
type TextPlacement struct {
	StartY      float64  `json:"startY"`
	LineHeight  float64  `json:"lineHeight"`
	TotalHeight float64  `json:"totalHeight"`
	Lines       []string `json:"lines"`
	LineYs      []float64`json:"lineYs"`
	HasSubtext  bool     `json:"hasSubtext"`
	Subtext     string   `json:"subtext"`
	SubY        float64  `json:"subY"`
	SubSize     float64  `json:"subSize"`
	FontSize    float64  `json:"fontSize"`
	Anchor      string   `json:"anchor"` // "middle" or "start"
}

// ShapeGeometryDescription is the complete deterministic geometric calculation for a node.
type ShapeGeometryDescription struct {
	Shape       string         `json:"shape"`
	Width       float64        `json:"width"`
	Height      float64        `json:"height"`
	HalfWidth   float64        `json:"halfWidth"`
	HalfHeight  float64        `json:"halfHeight"`
	Bounds      ShapeBounds    `json:"bounds"`
	Anchors     ShapeAnchors   `json:"anchors"`
	Elements    []ShapeElement `json:"elements"`
	Text        TextPlacement  `json:"text"`
}

// Built-in shape definitions catalog.
var BuiltinShapes = []ShapeDefinition{
	{
		ID:            "rounded",
		DisplayName:   "Rounded Card / Service Box",
		Category:      "basic",
		DefaultWidth:  170,
		DefaultHeight: 80,
	},
	{
		ID:            "rect",
		DisplayName:   "Rectangle / Process Box",
		Category:      "basic",
		DefaultWidth:  170,
		DefaultHeight: 80,
	},
	{
		ID:            "pill",
		DisplayName:   "Pill / Stadium Terminal",
		Category:      "flowchart",
		DefaultWidth:  170,
		DefaultHeight: 80,
	},
	{
		ID:            "textbox",
		DisplayName:   "Floating Text Label Only",
		Category:      "annotation",
		DefaultWidth:  170,
		DefaultHeight: 80,
	},
	{
		ID:            "callout",
		DisplayName:   "Callout Note / Annotation",
		Category:      "annotation",
		DefaultWidth:  170,
		DefaultHeight: 80,
	},
	{
		ID:            "diamond",
		DisplayName:   "Decision Diamond",
		Category:      "flowchart",
		DefaultWidth:  170,
		DefaultHeight: 80,
	},
	{
		ID:            "hexagon",
		DisplayName:   "Hexagon / Microservice",
		Category:      "flowchart",
		DefaultWidth:  170,
		DefaultHeight: 80,
	},
	{
		ID:            "parallelogram",
		DisplayName:   "Parallelogram (Data I/O)",
		Category:      "flowchart",
		DefaultWidth:  170,
		DefaultHeight: 80,
	},
	{
		ID:            "cylinder",
		DisplayName:   "Database / Storage Cylinder",
		Category:      "storage",
		DefaultWidth:  170,
		DefaultHeight: 80,
	},
	{
		ID:            "cloud",
		DisplayName:   "Cloud Infrastructure Node",
		Category:      "infrastructure",
		DefaultWidth:  170,
		DefaultHeight: 80,
	},
	{
		ID:            "circle",
		DisplayName:   "Circle / Hub Node",
		Category:      "basic",
		DefaultWidth:  100,
		DefaultHeight: 100,
	},
	{
		ID:            "axes",
		DisplayName:   "Graph X/Y Coordinate Axes",
		Category:      "dataviz",
		DefaultWidth:  170,
		DefaultHeight: 80,
	},
	{
		ID:            "actor",
		DisplayName:   "Actor / Stick Figure",
		Category:      "basic",
		DefaultWidth:  100,
		DefaultHeight: 120,
	},
}

// GetShapeCatalog returns the list of all registered shape definitions.
func GetShapeCatalog() []ShapeDefinition {
	catalog := make([]ShapeDefinition, len(BuiltinShapes))
	copy(catalog, BuiltinShapes)
	return catalog
}

// NormalizeShapeID normalizes aliases to their canonical shape identifier.
func NormalizeShapeID(id string) string {
	lower := strings.ToLower(strings.TrimSpace(id))
	switch lower {
	case "note":
		return "callout"
	case "actor":
		return "actor"
	case "":
		return "rounded"
	default:
		return lower
	}
}

// GetShapeDefinition returns the shape definition for the given ID, or defaults to "rounded".
func GetShapeDefinition(id string) ShapeDefinition {
	canonical := NormalizeShapeID(id)
	for _, s := range BuiltinShapes {
		if s.ID == canonical {
			return s
		}
	}
	return BuiltinShapes[0] // rounded default
}

// ComputeTextPlacement calculates exact multiline text baseline and subtext coordinates.
func ComputeTextPlacement(rawText, rawSubtext, shape string, width, height, fontSize float64) TextPlacement {
	if fontSize <= 0 {
		fontSize = 15
	}
	subSize := math.Max(10, math.Round(fontSize*0.78))
	lineHeight := fontSize * 1.25

	var lines []string
	if rawText != "" {
		parts := strings.Split(rawText, "|")
		for _, p := range parts {
			trimmed := strings.TrimSpace(p)
			if trimmed != "" {
				lines = append(lines, trimmed)
			}
		}
	}

	trimmedSub := strings.TrimSpace(rawSubtext)
	hasSub := trimmedSub != ""

	hw := width / 2.0
	_ = hw // Reserved for anchor alignment
	hh := height / 2.0

	if shape == "axes" {
		startY := -hh - 10
		lineYs := make([]float64, len(lines))
		for i := range lines {
			lineYs[i] = math.Round((startY+float64(i)*lineHeight)*10) / 10
		}
		return TextPlacement{
			StartY:      startY,
			LineHeight:  lineHeight,
			TotalHeight: float64(len(lines)) * lineHeight,
			Lines:       lines,
			LineYs:      lineYs,
			HasSubtext:  hasSub,
			Subtext:     trimmedSub,
			SubY:        hh + subSize + 8,
			SubSize:     subSize,
			FontSize:    fontSize,
			Anchor:      "start",
		}
	}

	subExtra := 0.0
	if hasSub {
		subExtra = subSize * 1.4
	}
	totalHeight := float64(len(lines))*lineHeight + subExtra
	startY := -(totalHeight / 2.0) + (fontSize * 0.82)

	lineYs := make([]float64, len(lines))
	for i := range lines {
		lineYs[i] = math.Round((startY+float64(i)*lineHeight)*10) / 10
	}

	subY := 0.0
	if hasSub {
		subY = math.Round((startY+float64(len(lines))*lineHeight+(subSize*0.2))*10) / 10
	}

	return TextPlacement{
		StartY:      startY,
		LineHeight:  lineHeight,
		TotalHeight: totalHeight,
		Lines:       lines,
		LineYs:      lineYs,
		HasSubtext:  hasSub,
		Subtext:     trimmedSub,
		SubY:        subY,
		SubSize:     subSize,
		FontSize:    fontSize,
		Anchor:      "middle",
	}
}

// DescribeShape calculates deterministic geometry, elements, bounding box, anchors, and text metrics.
func DescribeShape(shape string, width, height float64, rawText, rawSubtext string, fontSize float64) ShapeGeometryDescription {
	normShape := NormalizeShapeID(shape)

	// Enforce minimum dimension constraint
	if width < 10 {
		def := GetShapeDefinition(normShape)
		if def.DefaultWidth > 0 {
			width = def.DefaultWidth
		} else {
			width = 170
		}
	}
	if height < 10 {
		def := GetShapeDefinition(normShape)
		if def.DefaultHeight > 0 {
			height = def.DefaultHeight
		} else {
			height = 80
		}
	}

	hw := width / 2.0
	_ = hw // Reserved for anchor alignment
	hh := height / 2.0

	bounds := ShapeBounds{
		MinX:   -hw,
		MinY:   -hh,
		MaxX:   hw,
		MaxY:   hh,
		Width:  width,
		Height: height,
	}

	anchors := ShapeAnchors{
		Top:    Point{X: 0, Y: -hh},
		Bottom: Point{X: 0, Y: hh},
		Left:   Point{X: -hw, Y: 0},
		Right:  Point{X: hw, Y: 0},
		Center: Point{X: 0, Y: 0},
	}

	var elements []ShapeElement

	switch normShape {
	case "rounded":
		elements = append(elements, ShapeElement{
			Type: "rect",
			Attributes: map[string]string{
				"x":      formatCoord(-hw),
				"y":      formatCoord(-hh),
				"width":  formatCoord(width),
				"height": formatCoord(height),
				"rx":     "12",
			},
		})

	case "rect":
		elements = append(elements, ShapeElement{
			Type: "rect",
			Attributes: map[string]string{
				"x":      formatCoord(-hw),
				"y":      formatCoord(-hh),
				"width":  formatCoord(width),
				"height": formatCoord(height),
				"rx":     "2",
			},
		})

	case "pill":
		r := math.Min(hw, hh)
		elements = append(elements, ShapeElement{
			Type: "rect",
			Attributes: map[string]string{
				"x":      formatCoord(-hw),
				"y":      formatCoord(-hh),
				"width":  formatCoord(width),
				"height": formatCoord(height),
				"rx":     formatCoord(r),
			},
		})

	case "textbox":
		elements = append(elements, ShapeElement{
			Type: "rect",
			Attributes: map[string]string{
				"x":      formatCoord(-hw),
				"y":      formatCoord(-hh),
				"width":  formatCoord(width),
				"height": formatCoord(height),
				"fill":   "transparent",
				"stroke": "none",
			},
		})

	case "callout":
		fold := 16.0
		pts := fmt.Sprintf("%s,%s %s,%s %s,%s %s,%s %s,%s",
			formatCoord(-hw), formatCoord(-hh),
			formatCoord(hw-fold), formatCoord(-hh),
			formatCoord(hw), formatCoord(-hh+fold),
			formatCoord(hw), formatCoord(hh),
			formatCoord(-hw), formatCoord(hh),
		)
		foldPts := fmt.Sprintf("%s,%s %s,%s %s,%s",
			formatCoord(hw-fold), formatCoord(-hh),
			formatCoord(hw-fold), formatCoord(-hh+fold),
			formatCoord(hw), formatCoord(-hh+fold),
		)
		elements = append(elements,
			ShapeElement{
				Type: "polygon",
				Attributes: map[string]string{
					"points":          pts,
					"stroke-linejoin": "round",
				},
			},
			ShapeElement{
				Type: "polyline",
				Attributes: map[string]string{
					"points": foldPts,
					"fill":   "none",
					"role":   "callout-fold",
				},
			},
		)

	case "diamond":
		pts := fmt.Sprintf("0,%s %s,0 0,%s %s,0", formatCoord(-hh), formatCoord(hw), formatCoord(hh), formatCoord(-hw))
		elements = append(elements, ShapeElement{
			Type: "polygon",
			Attributes: map[string]string{
				"points":          pts,
				"stroke-linejoin": "round",
			},
		})

	case "hexagon":
		inset := width * 0.22
		pts := fmt.Sprintf("%s,%s %s,%s %s,0 %s,%s %s,%s %s,0",
			formatCoord(-hw+inset), formatCoord(-hh),
			formatCoord(hw-inset), formatCoord(-hh),
			formatCoord(hw),
			formatCoord(hw-inset), formatCoord(hh),
			formatCoord(-hw+inset), formatCoord(hh),
			formatCoord(-hw),
		)
		elements = append(elements, ShapeElement{
			Type: "polygon",
			Attributes: map[string]string{
				"points":          pts,
				"stroke-linejoin": "round",
			},
		})

	case "parallelogram":
		skew := width * 0.16
		pts := fmt.Sprintf("%s,%s %s,%s %s,%s %s,%s",
			formatCoord(-hw+skew), formatCoord(-hh),
			formatCoord(hw), formatCoord(-hh),
			formatCoord(hw-skew), formatCoord(hh),
			formatCoord(-hw), formatCoord(hh),
		)
		elements = append(elements, ShapeElement{
			Type: "polygon",
			Attributes: map[string]string{
				"points":          pts,
				"stroke-linejoin": "round",
			},
		})

	case "cylinder":
		ry := math.Max(8.0, math.Min(22.0, height*0.18))
		bodyTop := -hh + ry
		bodyBot := hh - ry
		bodyPath := fmt.Sprintf("M %s,%s L %s,%s A %s,%s 0 0,0 %s,%s L %s,%s Z",
			formatCoord(-hw), formatCoord(bodyTop),
			formatCoord(-hw), formatCoord(bodyBot),
			formatCoord(hw), formatCoord(ry),
			formatCoord(hw), formatCoord(bodyBot),
			formatCoord(hw), formatCoord(bodyTop),
		)
		elements = append(elements,
			ShapeElement{
				Type: "path",
				Attributes: map[string]string{
					"d": bodyPath,
				},
			},
			ShapeElement{
				Type: "ellipse",
				Attributes: map[string]string{
					"cx": "0",
					"cy": formatCoord(bodyTop),
					"rx": formatCoord(hw),
					"ry": formatCoord(ry),
				},
			},
		)

	case "cloud":
		cloudPath := fmt.Sprintf("M %s,%s C %s,%s %s,%s %s,%s C %s,%s %s,%s %s,%s C %s,%s %s,%s %s,%s C %s,%s %s,%s %s,%s Z",
			formatCoord(-hw*0.55), formatCoord(hh*0.65),
			formatCoord(-hw*0.95), formatCoord(hh*0.65), formatCoord(-hw), formatCoord(hh*0.05), formatCoord(-hw*0.72), formatCoord(-hh*0.2),
			formatCoord(-hw*0.75), formatCoord(-hh*0.75), formatCoord(-hw*0.15), formatCoord(-hh*0.95), formatCoord(hw*0.08), formatCoord(-hh*0.6),
			formatCoord(hw*0.45), formatCoord(-hh*0.9), formatCoord(hw*0.92), formatCoord(-hh*0.5), formatCoord(hw*0.8), formatCoord(-hh*0.05),
			formatCoord(hw*1.05), formatCoord(hh*0.25), formatCoord(hw*0.85), formatCoord(hh*0.65), formatCoord(hw*0.5), formatCoord(hh*0.65),
		)
		elements = append(elements, ShapeElement{
			Type: "path",
			Attributes: map[string]string{
				"d":               cloudPath,
				"stroke-linejoin": "round",
			},
		})

	case "circle":
		r := math.Min(hw, hh)
		elements = append(elements, ShapeElement{
			Type: "circle",
			Attributes: map[string]string{
				"cx": "0",
				"cy": "0",
				"r":  formatCoord(r),
			},
		})

	case "axes":
		elements = append(elements, ShapeElement{
			Type: "rect",
			Attributes: map[string]string{
				"x":      formatCoord(-hw),
				"y":      formatCoord(-hh),
				"width":  formatCoord(width),
				"height": formatCoord(height),
				"role":   "axes-bg",
			},
		})
		steps := 4
		for i := 1; i <= steps; i++ {
			gx := -hw + (width/float64(steps))*float64(i)
			gy := hh - (height/float64(steps))*float64(i)
			elements = append(elements,
				ShapeElement{
					Type: "line",
					Attributes: map[string]string{
						"x1":   formatCoord(gx),
						"y1":   formatCoord(-hh),
						"x2":   formatCoord(gx),
						"y2":   formatCoord(hh),
						"role": "grid-vertical",
					},
				},
				ShapeElement{
					Type: "line",
					Attributes: map[string]string{
						"x1":   formatCoord(-hw),
						"y1":   formatCoord(gy),
						"x2":   formatCoord(hw),
						"y2":   formatCoord(gy),
						"role": "grid-horizontal",
					},
				},
			)
		}
		axesPts := fmt.Sprintf("%s,%s %s,%s %s,%s", formatCoord(-hw), formatCoord(-hh), formatCoord(-hw), formatCoord(hh), formatCoord(hw), formatCoord(hh))
		elements = append(elements, ShapeElement{
			Type: "polyline",
			Attributes: map[string]string{
				"points":          axesPts,
				"fill":            "none",
				"stroke-linecap":  "round",
				"stroke-linejoin": "round",
				"role":            "axes-line",
			},
		})

	case "actor":
		headR := math.Min(hw*0.35, hh*0.28)
		headCy := -hh + headR + 2.0
		neckY := headCy + headR
		torsoBot := hh * 0.25
		armY := neckY + (torsoBot-neckY)*0.35

		elements = append(elements,
			ShapeElement{
				Type: "circle",
				Attributes: map[string]string{
					"cx": "0",
					"cy": formatCoord(headCy),
					"r":  formatCoord(headR),
				},
			},
			ShapeElement{
				Type: "line",
				Attributes: map[string]string{
					"x1": "0", "y1": formatCoord(neckY),
					"x2": "0", "y2": formatCoord(torsoBot),
				},
			},
			ShapeElement{
				Type: "line",
				Attributes: map[string]string{
					"x1": formatCoord(-hw * 0.75), "y1": formatCoord(armY),
					"x2": formatCoord(hw * 0.75), "y2": formatCoord(armY),
				},
			},
			ShapeElement{
				Type: "line",
				Attributes: map[string]string{
					"x1": "0", "y1": formatCoord(torsoBot),
					"x2": formatCoord(-hw * 0.6), "y2": formatCoord(hh),
				},
			},
			ShapeElement{
				Type: "line",
				Attributes: map[string]string{
					"x1": "0", "y1": formatCoord(torsoBot),
					"x2": formatCoord(hw * 0.6), "y2": formatCoord(hh),
				},
			},
		)

	default:
		elements = append(elements, ShapeElement{
			Type: "rect",
			Attributes: map[string]string{
				"x":      formatCoord(-hw),
				"y":      formatCoord(-hh),
				"width":  formatCoord(width),
				"height": formatCoord(height),
				"rx":     "12",
			},
		})
	}

	text := ComputeTextPlacement(rawText, rawSubtext, normShape, width, height, fontSize)

	return ShapeGeometryDescription{
		Shape:      normShape,
		Width:      width,
		Height:     height,
		HalfWidth:  hw,
		HalfHeight: hh,
		Bounds:     bounds,
		Anchors:    anchors,
		Elements:   elements,
		Text:       text,
	}
}
