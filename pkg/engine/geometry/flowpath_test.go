package geometry

import (
	"strings"
	"testing"
)

func TestGenerateFlowPathLinear(t *testing.T) {
	nodes := []Point{{X: 10, Y: 20}, {X: 50, Y: 60}}
	path := GenerateFlowPath(nodes, 0, 1000, 1000, "curve")
	expected := "M 100,200 L 500,600"
	if path != expected {
		t.Errorf("expected %q, got %q", expected, path)
	}
}

func TestGenerateFlowPathQuadCurve(t *testing.T) {
	nodes := []Point{{X: 0, Y: 0}, {X: 100, Y: 0}}
	path := GenerateFlowPath(nodes, 50, 1000, 1000, "curve")
	if !strings.HasPrefix(path, "M 0,0 Q ") {
		t.Errorf("expected quadratic curve prefix, got %q", path)
	}
	if !strings.HasSuffix(path, " 1000,0") {
		t.Errorf("expected end coordinate 1000,0, got %q", path)
	}
}

func TestGenerateFlowPathOrtho(t *testing.T) {
	nodes := []Point{{X: 10, Y: 10}, {X: 40, Y: 40}}
	hv := GenerateFlowPath(nodes, 0, 1000, 1000, "ortho-hv")
	expectedHV := "M 100,100 L 400,100 L 400,400"
	if hv != expectedHV {
		t.Errorf("expected ortho-hv %q, got %q", expectedHV, hv)
	}

	vh := GenerateFlowPath(nodes, 0, 1000, 1000, "ortho-vh")
	expectedVH := "M 100,100 L 100,400 L 400,400"
	if vh != expectedVH {
		t.Errorf("expected ortho-vh %q, got %q", expectedVH, vh)
	}

	mid := GenerateFlowPath(nodes, 0, 1000, 1000, "ortho-mid")
	expectedMid := "M 100,100 L 250,100 L 250,400 L 400,400"
	if mid != expectedMid {
		t.Errorf("expected ortho-mid %q, got %q", expectedMid, mid)
	}
}

func TestGenerateFlowPathSpline(t *testing.T) {
	nodes := []Point{{X: 10, Y: 10}, {X: 30, Y: 40}, {X: 70, Y: 80}}
	path := GenerateFlowPath(nodes, 25, 1000, 1000, "curve")
	if !strings.Contains(path, " C ") {
		t.Errorf("expected cubic spline curve with 'C', got %q", path)
	}
}

func TestGetFlowMidpoint(t *testing.T) {
	nodes := []Point{{X: 0, Y: 0}, {X: 100, Y: 100}}
	mid := GetFlowMidpoint(nodes, 0, 1000, 1000)
	if mid.X != 500 || mid.Y != 500 {
		t.Errorf("expected (500, 500), got (%v, %v)", mid.X, mid.Y)
	}
}

func TestSampleFlowPathLinear(t *testing.T) {
	nodes := []Point{{X: 0, Y: 0}, {X: 100, Y: 0}}
	p0, ang0 := SampleFlowPathAtProgress(nodes, 0, 1000, 1000, "direct", 0.0)
	if p0.X != 0 || p0.Y != 0 || ang0 != 0 {
		t.Errorf("expected (0, 0) angle 0, got (%v, %v) angle %v", p0.X, p0.Y, ang0)
	}

	pMid, angMid := SampleFlowPathAtProgress(nodes, 0, 1000, 1000, "direct", 0.5)
	if pMid.X != 500 || pMid.Y != 0 || angMid != 0 {
		t.Errorf("expected (500, 0) angle 0, got (%v, %v) angle %v", pMid.X, pMid.Y, angMid)
	}

	pEnd, angEnd := SampleFlowPathAtProgress(nodes, 0, 1000, 1000, "direct", 1.0)
	if pEnd.X != 1000 || pEnd.Y != 0 || angEnd != 0 {
		t.Errorf("expected (1000, 0) angle 0, got (%v, %v) angle %v", pEnd.X, pEnd.Y, angEnd)
	}
}

func TestSampleFlowPathQuad(t *testing.T) {
	nodes := []Point{{X: 0, Y: 0}, {X: 100, Y: 0}}
	p0, _ := SampleFlowPathAtProgress(nodes, 50, 1000, 1000, "curve", 0.0)
	if p0.X != 0 || p0.Y != 0 {
		t.Errorf("expected start at (0, 0), got (%v, %v)", p0.X, p0.Y)
	}

	p1, _ := SampleFlowPathAtProgress(nodes, 50, 1000, 1000, "curve", 1.0)
	if p1.X != 1000 || p1.Y != 0 {
		t.Errorf("expected end at (1000, 0), got (%v, %v)", p1.X, p1.Y)
	}

	pMid, _ := SampleFlowPathAtProgress(nodes, 50, 1000, 1000, "curve", 0.5)
	if pMid.X != 500 || pMid.Y == 0 {
		t.Errorf("expected mid X=500 and non-zero Y due to curvature, got (%v, %v)", pMid.X, pMid.Y)
	}
}

func TestSampleFlowPathOrtho(t *testing.T) {
	nodes := []Point{{X: 0, Y: 0}, {X: 100, Y: 100}}
	// ortho-hv: (0,0) -> (1000, 0) -> (1000, 1000). Total len = 2000.
	p0, _ := SampleFlowPathAtProgress(nodes, 0, 1000, 1000, "ortho-hv", 0.0)
	if p0.X != 0 || p0.Y != 0 {
		t.Errorf("expected (0, 0), got (%v, %v)", p0.X, p0.Y)
	}
	pMid, angMid := SampleFlowPathAtProgress(nodes, 0, 1000, 1000, "ortho-hv", 0.5)
	if pMid.X != 1000 || pMid.Y != 0 {
		t.Errorf("expected corner (1000, 0), got (%v, %v)", pMid.X, pMid.Y)
	}
	pEnd, angEnd := SampleFlowPathAtProgress(nodes, 0, 1000, 1000, "ortho-hv", 1.0)
	if pEnd.X != 1000 || pEnd.Y != 1000 || angEnd != 90 {
		t.Errorf("expected end (1000, 1000) angle 90, got (%v, %v) angle %v", pEnd.X, pEnd.Y, angEnd)
	}
	_ = angMid
}
