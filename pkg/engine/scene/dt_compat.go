package scene

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strings"
)

// Digital Twin 840ae5d importer ceilings (Section 3.1–3.4 of DT Consumer Requirements).
const (
	DTMaxParameters          = 64
	DTMaxTargetsPerParam     = 32
	DTMaxZipBytes            = 4 * 1024 * 1024 // 4 MiB
	DTMaxArchiveEntries      = 32
	DTMaxEntryUncompressed   = 2 * 1024 * 1024 // 2 MiB
	DTMaxTotalUncompressed   = 8 * 1024 * 1024 // 8 MiB
	DTMaxCompressionRatio    = 50.0
	DTMaxSVGBytes            = 1 * 1024 * 1024 // 1 MiB
	DTBaselineRuntimeVersion = "1.2.1"
)

// WidgetRuntimePropertySpec declares one supported visual property in widget-runtime-manifest.json.
type WidgetRuntimePropertySpec struct {
	Types []string `json:"types"`
	Min   *float64 `json:"min,omitempty"`
	Max   *float64 `json:"max,omitempty"`
}

// WidgetRuntimeManifest matches Digital Twin's strict DisallowUnknownFields capability descriptor (contractVersion: 1).
type WidgetRuntimeManifest struct {
	ContractVersion          int                                  `json:"contractVersion"`
	RuntimeName              string                               `json:"runtimeName,omitempty"`
	RuntimeVersion           string                               `json:"runtimeVersion"`
	SourceCommit             string                               `json:"sourceCommit"`
	RuntimeSha256            string                               `json:"runtimeSha256"`
	SupportedManifestSchemas []int                                `json:"supportedManifestSchemas"`
	Properties               map[string]WidgetRuntimePropertySpec `json:"properties"`
}

// VerifiedRuntimeProperties returns the 41 verified visual properties supported by svg-widget.js,
// aligned accurately with ObjectPropertyCatalog and actual svg-widget.js runtime behaviour.
func VerifiedRuntimeProperties() map[string]WidgetRuntimePropertySpec {
	return map[string]WidgetRuntimePropertySpec{
		"armThickness":    {Types: []string{"number"}, Min: floatPtr(1), Max: floatPtr(20)},
		"bgColor":         {Types: []string{"color"}},
		"borderColor":     {Types: []string{"color"}},
		"burstCycles":     {Types: []string{"number"}, Min: floatPtr(0), Max: floatPtr(100)},
		"color":           {Types: []string{"color"}},
		"dashLength":      {Types: []string{"number"}, Min: floatPtr(2), Max: floatPtr(400)},
		"direction":       {Types: []string{"enum", "text"}},
		"dotSize":         {Types: []string{"number"}, Min: floatPtr(1), Max: floatPtr(40)},
		"duration":        {Types: []string{"number"}, Min: floatPtr(20), Max: floatPtr(1500)},
		"fill":            {Types: []string{"color"}},
		"gapLength":       {Types: []string{"number"}, Min: floatPtr(2), Max: floatPtr(300)},
		"intensity":       {Types: []string{"number"}, Min: floatPtr(0), Max: floatPtr(1)},
		"lineGapRatio":    {Types: []string{"text", "enum"}},
		"maxValue":        {Types: []string{"number"}},
		"minValue":        {Types: []string{"number"}},
		"opacity":         {Types: []string{"number"}, Min: floatPtr(0), Max: floatPtr(1)},
		"operatingState":  {Types: []string{"enum", "text"}},
		"pauseSeconds":    {Types: []string{"number"}, Min: floatPtr(0), Max: floatPtr(300)},
		"pauseVisibility": {Types: []string{"enum", "text"}},
		"period":          {Types: []string{"number", "speed"}, Min: floatPtr(0.2), Max: floatPtr(30)},
		"play":            {Types: []string{"boolean"}},
		"playbackMode":    {Types: []string{"enum", "text"}},
		"playbackRate":    {Types: []string{"speed", "number"}, Min: floatPtr(0.1), Max: floatPtr(10)},
		"repeat":          {Types: []string{"boolean"}},
		"repeatInterval":  {Types: []string{"number"}, Min: floatPtr(0.2), Max: floatPtr(60)},
		"samples":         {Types: []string{"text"}},
		"scale":           {Types: []string{"number"}, Min: floatPtr(0.2), Max: floatPtr(3)},
		"scrollSpeed":     {Types: []string{"number", "speed"}, Min: floatPtr(10), Max: floatPtr(600)},
		"segments":        {Types: []string{"number"}, Min: floatPtr(1), Max: floatPtr(32)},
		"showGuide":       {Types: []string{"boolean"}},
		"speed":           {Types: []string{"speed", "number"}, Min: floatPtr(0), Max: floatPtr(30)},
		"startOffset":     {Types: []string{"number"}, Min: floatPtr(0), Max: floatPtr(100)},
		"state":           {Types: []string{"enum", "text"}},
		"stroke":          {Types: []string{"color"}},
		"strokeWidth":     {Types: []string{"number"}, Min: floatPtr(0), Max: floatPtr(32)},
		"text":            {Types: []string{"text", "number", "speed"}},
		"textContent":     {Types: []string{"text", "number", "speed"}},
		"trigger":         {Types: []string{"number", "boolean"}, Min: floatPtr(0), Max: floatPtr(1000000)},
		"typeSpeed":       {Types: []string{"number", "speed"}, Min: floatPtr(1), Max: floatPtr(120)},
		"value":           {Types: []string{"number"}},
		"visibility":      {Types: []string{"boolean"}},
	}
}

// BuildWidgetRuntimeManifest constructs the deterministic capability descriptor for a given svg-widget.js payload.
func BuildWidgetRuntimeManifest(svgWidgetJS []byte, runtimeVersion, sourceCommit string) WidgetRuntimeManifest {
	if strings.TrimSpace(runtimeVersion) == "" {
		runtimeVersion = DTBaselineRuntimeVersion
	}
	if strings.TrimSpace(sourceCommit) == "" {
		sourceCommit = "dev"
	}
	sum := sha256.Sum256(svgWidgetJS)
	return WidgetRuntimeManifest{
		ContractVersion:          1,
		RuntimeName:              "svg-widget.js",
		RuntimeVersion:           strings.TrimSpace(runtimeVersion),
		SourceCommit:             strings.TrimSpace(sourceCommit),
		RuntimeSha256:            hex.EncodeToString(sum[:]),
		SupportedManifestSchemas: []int{1},
		Properties:               VerifiedRuntimeProperties(),
	}
}

// DTCompatibilityReport summarizes whether an exported widget package ZIP satisfies Digital Twin's 840ae5d contract.
type DTCompatibilityReport struct {
	Compatible    bool     `json:"compatible"`
	Errors        []string `json:"errors,omitempty"`
	Warnings      []string `json:"warnings,omitempty"`
	ZipBytes      int      `json:"zipBytes"`
	EntryCount    int      `json:"entryCount"`
	SVGBytes      int      `json:"svgBytes"`
	ParamCount    int      `json:"paramCount"`
	DuplicateIDs  []string `json:"duplicateIds,omitempty"`
	PackageSHA256 string   `json:"packageSha256"`
}

var (
	reDTBlockedTags    = regexp.MustCompile(`(?i)<\s*(foreignObject|iframe|object|embed|canvas|video|audio|form|input|button|set|animateColor|handler|listener)\b`)
	reDTEventAttr      = regexp.MustCompile(`(?i)\s+on[a-z]+\s*=`)
	reDTExternalURL    = regexp.MustCompile(`(?i)(?:href|xlink:href|src)\s*=\s*["']\s*(?:https?:|javascript:|vbscript:|data:image/svg\+xml)`)
	reDTScriptTag      = regexp.MustCompile(`(?is)<script\b([^>]*)>.*?</script>`)
	reDTViewBox        = regexp.MustCompile(`(?i)<svg\b[^>]*\bviewBox\s*=\s*["'][^"']+["']`)
	reDTDeclaredIDAttr = regexp.MustCompile(`[\s]id\s*=\s*["']([^"']+)["']`)
)

// ValidateWidgetPackageDTCompatibility inspects a built widget package ZIP against Digital Twin's 840ae5d contract.
func ValidateWidgetPackageDTCompatibility(zipBytes []byte) DTCompatibilityReport {
	sum := sha256.Sum256(zipBytes)
	rep := DTCompatibilityReport{
		Compatible:    true,
		ZipBytes:      len(zipBytes),
		PackageSHA256: hex.EncodeToString(sum[:]),
	}
	addErr := func(msg string) {
		rep.Compatible = false
		rep.Errors = append(rep.Errors, msg)
	}

	if len(zipBytes) == 0 {
		addErr("ZIP archive is empty")
		return rep
	}
	if len(zipBytes) > DTMaxZipBytes {
		addErr(fmt.Sprintf("ZIP size (%d bytes) exceeds DT 4 MiB limit (%d bytes)", len(zipBytes), DTMaxZipBytes))
	}

	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		addErr("invalid ZIP archive: " + err.Error())
		return rep
	}

	rep.EntryCount = len(zr.File)
	if len(zr.File) > DTMaxArchiveEntries {
		addErr(fmt.Sprintf("ZIP entry count (%d) exceeds DT limit (%d)", len(zr.File), DTMaxArchiveEntries))
	}

	var totalUncomp uint64
	var manifestBytes []byte
	var svgBytes []byte
	manifestCount := 0
	seenNames := make(map[string]bool)

	for _, f := range zr.File {
		if seenNames[f.Name] {
			addErr(fmt.Sprintf("duplicate ZIP entry %q", f.Name))
		}
		seenNames[f.Name] = true
		if strings.HasPrefix(f.Name, "/") || strings.Contains(f.Name, "..") {
			addErr(fmt.Sprintf("unsafe ZIP entry path %q", f.Name))
		}
		if f.UncompressedSize64 > DTMaxEntryUncompressed {
			addErr(fmt.Sprintf("entry %q uncompressed size (%d) exceeds 2 MiB", f.Name, f.UncompressedSize64))
		}
		totalUncomp += f.UncompressedSize64
		if f.CompressedSize64 > 0 && float64(f.UncompressedSize64)/float64(f.CompressedSize64) > DTMaxCompressionRatio {
			addErr(fmt.Sprintf("entry %q compression ratio exceeds 50:1", f.Name))
		}

		rc, err := f.Open()
		if err != nil {
			addErr(fmt.Sprintf("cannot open entry %q: %v", f.Name, err))
			continue
		}
		data, err := io.ReadAll(io.LimitReader(rc, DTMaxEntryUncompressed+1))
		rc.Close()
		if err != nil {
			addErr(fmt.Sprintf("cannot read entry %q: %v", f.Name, err))
			continue
		}

		base := f.Name
		if idx := strings.LastIndex(base, "/"); idx >= 0 {
			base = base[idx+1:]
		}
		if base == "widget-manifest.json" {
			manifestCount++
			manifestBytes = data
		} else if strings.HasSuffix(strings.ToLower(base), ".svg") && base != "preview.svg" {
			svgBytes = data
		}
	}

	if totalUncomp > DTMaxTotalUncompressed {
		addErr(fmt.Sprintf("total uncompressed size (%d) exceeds DT 8 MiB limit", totalUncomp))
	}
	if manifestCount != 1 {
		addErr(fmt.Sprintf("expected exactly 1 widget-manifest.json, found %d", manifestCount))
	}
	if len(svgBytes) == 0 {
		addErr("primary <slug>.svg not found in ZIP")
		return rep
	}

	rep.SVGBytes = len(svgBytes)
	if len(svgBytes) > DTMaxSVGBytes {
		addErr(fmt.Sprintf("primary SVG size (%d bytes) exceeds DT 1 MiB limit", len(svgBytes)))
	}

	svgStr := string(svgBytes)
	if !reDTViewBox.MatchString(svgStr) {
		rep.Warnings = append(rep.Warnings, "root <svg> does not declare a viewBox attribute")
	}
	if m := reDTBlockedTags.FindString(svgStr); m != "" {
		addErr(fmt.Sprintf("SVG contains blocked element %q", m))
	}
	if m := reDTEventAttr.FindString(svgStr); m != "" {
		addErr(fmt.Sprintf("SVG contains blocked inline event handler %q", strings.TrimSpace(m)))
	}
	if m := reDTExternalURL.FindString(svgStr); m != "" {
		addErr(fmt.Sprintf("SVG contains blocked external URL reference %q", m))
	}

	// Check <script> tags: only 0 or 1 <script type="application/json" id="...sva-widget-manifest"> allowed
	jsonManifestScripts := 0
	for _, sm := range reDTScriptTag.FindAllStringSubmatch(svgStr, -1) {
		attrs := strings.ToLower(sm[1])
		if strings.Contains(attrs, "application/json") && strings.Contains(attrs, "sva-widget-manifest") {
			jsonManifestScripts++
		} else {
			addErr("SVG contains executable <script> tag blocked by DT safe-SVG validation")
		}
	}
	if jsonManifestScripts > 1 {
		addErr(fmt.Sprintf("SVG contains %d embedded manifest scripts (max 1)", jsonManifestScripts))
	}

	// Check for duplicate id attributes inside flattened SVG
	idCounts := make(map[string]int)
	for _, im := range reDTDeclaredIDAttr.FindAllStringSubmatch(svgStr, -1) {
		idCounts[im[1]]++
	}
	for id, cnt := range idCounts {
		if cnt > 1 {
			rep.DuplicateIDs = append(rep.DuplicateIDs, id)
		}
	}
	sort.Strings(rep.DuplicateIDs)
	if len(rep.DuplicateIDs) > 0 {
		addErr(fmt.Sprintf("SVG contains duplicate element id(s): %s", strings.Join(rep.DuplicateIDs, ", ")))
	}

	// Validate manifest against DT schemaVersion: 1 & runtime capability set
	if len(manifestBytes) > 0 {
		var mf WidgetManifest
		if err := json.Unmarshal(manifestBytes, &mf); err != nil {
			addErr("invalid widget-manifest.json: " + err.Error())
		} else {
			if mf.SchemaVersion != 1 {
				addErr(fmt.Sprintf("unsupported manifest schemaVersion %d (expected 1)", mf.SchemaVersion))
			}
			rep.ParamCount = len(mf.Parameters)
			if len(mf.Parameters) > DTMaxParameters {
				addErr(fmt.Sprintf("parameter count (%d) exceeds DT limit (%d)", len(mf.Parameters), DTMaxParameters))
			}
			runtimeProps := VerifiedRuntimeProperties()
			for _, p := range mf.Parameters {
				if len(p.Targets) > DTMaxTargetsPerParam {
					addErr(fmt.Sprintf("parameter %q targets count (%d) exceeds DT limit (%d)", p.Name, len(p.Targets), DTMaxTargetsPerParam))
				}
				// Always validate top-level parameter property (DT validates both p.Property and every p.Targets[i].Property!)
				if strings.TrimSpace(p.Property) == "" {
					addErr(fmt.Sprintf("parameter %q has empty property", p.Name))
				} else if _, ok := runtimeProps[p.Property]; !ok {
					addErr(fmt.Sprintf("parameter %q property %q is not in baseline widget-runtime-manifest.json", p.Name, p.Property))
				}
				for _, tb := range p.Targets {
					if _, ok := runtimeProps[tb.Property]; !ok {
						addErr(fmt.Sprintf("parameter %q target property %q is not in baseline widget-runtime-manifest.json", p.Name, tb.Property))
					}
				}
			}
		}
	}

	return rep
}
