package scene

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

var widgetInstanceSeq uint64

// NextWidgetInstanceID returns a unique, collision-free instance identifier string.
func NextWidgetInstanceID() string {
	seq := atomic.AddUint64(&widgetInstanceSeq, 1)
	return fmt.Sprintf("sva-w-%d-%d", time.Now().UnixNano()%1000000, seq)
}

// WidgetIsolationOptions configures SVG widget isolation.
type WidgetIsolationOptions struct {
	InstanceID string          `json:"instanceId,omitempty"`
	Prefix     string          `json:"prefix,omitempty"`
	ScopeCSS   bool            `json:"scopeCss"`
	Manifest   *WidgetManifest `json:"manifest,omitempty"`
}

// IsolateSVGWidget rewrites an SVG document so that all element IDs, internal
// fragment references, CSS selectors, and animation keyframes are scoped to
// a unique instance namespace.
//
// This guarantees that multiple SVG instances can coexist inside the same HTML
// document or DOM tree without ID collisions, filter/gradient crosstalk, or
// CSS animation interference.
//
// Data URLs (data:image/...), external URLs (http://, https://), and arbitrary
// text containing '#' (e.g. '#1 Priority' or hex colors '#0d1117') are preserved untouched.
func IsolateSVGWidget(rawSVG string, opts WidgetIsolationOptions) (string, map[string]string, error) {
	if strings.TrimSpace(rawSVG) == "" {
		return "", nil, fmt.Errorf("rawSVG cannot be empty")
	}

	instanceID := strings.TrimSpace(opts.InstanceID)
	if instanceID == "" {
		instanceID = NextWidgetInstanceID()
	}

	// Sanitize instanceID to ensure valid XML/CSS identifier
	regInvalid := regexp.MustCompile(`[^a-zA-Z0-9_-]`)
	instanceID = regInvalid.ReplaceAllString(instanceID, "-")

	prefix := strings.TrimSpace(opts.Prefix)
	if prefix == "" {
		prefix = instanceID + "__"
	}

	rootWidgetID := "sva-widget-" + instanceID

	// 0. Strip editor-only helper groups (e.g. Flash Lite inactive editor marker) from exported widgets
	reEditorOnly := regexp.MustCompile(`(?s)<g\b[^>]*\bdata-editor-only\s*=\s*["']true["'][^>]*>.*?</g>`)
	rawSVG = reEditorOnly.ReplaceAllString(rawSVG, "")

	// 1. Scan and collect all declared IDs: id="VALUE" or id='VALUE'
	idMap := make(map[string]string)
	reDeclaredID := regexp.MustCompile(`\bid\s*=\s*["']([^"']+)["']`)
	matches := reDeclaredID.FindAllStringSubmatch(rawSVG, -1)
	for _, m := range matches {
		if len(m) >= 2 {
			oldID := m[1]
			if oldID != "" && idMap[oldID] == "" {
				idMap[oldID] = prefix + oldID
			}
		}
	}

	// 2. Scan and collect all @keyframes names in <style>
	keyframeMap := make(map[string]string)
	reKeyframeName := regexp.MustCompile(`@keyframes\s+([a-zA-Z0-9_-]+)`)
	kfMatches := reKeyframeName.FindAllStringSubmatch(rawSVG, -1)
	for _, km := range kfMatches {
		if len(km) >= 2 {
			oldKF := km[1]
			if oldKF != "" && keyframeMap[oldKF] == "" {
				keyframeMap[oldKF] = prefix + oldKF
			}
		}
	}

	// 3. Transform CSS in <style>...</style> blocks
	reStyleBlock := regexp.MustCompile(`(?s)<style\b([^>]*)>(.*?)</style>`)
	transformed := reStyleBlock.ReplaceAllStringFunc(rawSVG, func(block string) string {
		sub := reStyleBlock.FindStringSubmatch(block)
		if len(sub) < 3 {
			return block
		}
		styleAttrs := sub[1]
		cssContent := sub[2]

		// Replace @keyframes names
		for oldKF, newKF := range keyframeMap {
			reKFDef := regexp.MustCompile(`@keyframes\s+` + regexp.QuoteMeta(oldKF) + `\b`)
			cssContent = reKFDef.ReplaceAllString(cssContent, "@keyframes "+newKF)

			reAnimProp := regexp.MustCompile(`\b(animation(?:-name)?\s*:\s*[^;}]*?)\b` + regexp.QuoteMeta(oldKF) + `\b`)
			cssContent = reAnimProp.ReplaceAllString(cssContent, "${1}"+newKF)
		}

		// Rewrite url(#oldID) inside CSS declarations
		for oldID, newID := range idMap {
			reCSSUrl := regexp.MustCompile(`url\(\s*["']?#` + regexp.QuoteMeta(oldID) + `["']?\s*\)`)
			cssContent = reCSSUrl.ReplaceAllString(cssContent, "url(#"+newID+")")
		}

		// Scope CSS rules to the widget root element
		if opts.ScopeCSS || true {
			cssContent = scopeCSSRules(cssContent, rootWidgetID, idMap)
		}

		return "<style" + styleAttrs + ">" + cssContent + "</style>"
	})

	// 4. Transform tag attributes
	// Regex matches opening or self-closing tags: <tagname attrs...>
	reTag := regexp.MustCompile(`(?s)<([a-zA-Z0-9:_-]+)((?:\s+[^>]+)?)>`)
	isFirstSVG := true

	transformed = reTag.ReplaceAllStringFunc(transformed, func(tagMatch string) string {
		sub := reTag.FindStringSubmatch(tagMatch)
		if len(sub) < 3 {
			return tagMatch
		}
		tagName := sub[1]
		tagAttrs := sub[2]

		// If closing tag (e.g. </g>), do not touch
		if strings.HasPrefix(tagName, "/") {
			return tagMatch
		}

		// Check if this is the root <svg> element
		if tagName == "svg" && isFirstSVG {
			isFirstSVG = false
			// Inject or replace id on root SVG
			reRootID := regexp.MustCompile(`\bid\s*=\s*["'][^"']*["']`)
			if reRootID.MatchString(tagAttrs) {
				tagAttrs = reRootID.ReplaceAllString(tagAttrs, `id="`+rootWidgetID+`"`)
			} else {
				tagAttrs = ` id="` + rootWidgetID + `"` + tagAttrs
			}

			// Add data-sva-widget-instance attribute
			reInstAttr := regexp.MustCompile(`\bdata-sva-widget-instance\s*=\s*["'][^"']*["']`)
			if !reInstAttr.MatchString(tagAttrs) {
				tagAttrs += ` data-sva-widget-instance="` + instanceID + `"`
			}
		} else {
			// For all other elements, transform id attribute if present
			reIDAttr := regexp.MustCompile(`\bid\s*=\s*(["'])([^"']+)(["'])`)
			tagAttrs = reIDAttr.ReplaceAllStringFunc(tagAttrs, func(m string) string {
				parts := reIDAttr.FindStringSubmatch(m)
				if len(parts) >= 4 {
					oldID := parts[2]
					if newID, ok := idMap[oldID]; ok {
						return `id=` + parts[1] + newID + parts[3]
					}
				}
				return m
			})
		}

		// Rewrite href and xlink:href if value starts with # (internal fragment reference)
		reHref := regexp.MustCompile(`\b(xlink:href|href)\s*=\s*(["'])(#)([^"']+)(["'])`)
		tagAttrs = reHref.ReplaceAllStringFunc(tagAttrs, func(m string) string {
			parts := reHref.FindStringSubmatch(m)
			if len(parts) >= 6 {
				attrName := parts[1]
				q1 := parts[2]
				targetID := parts[4]
				q2 := parts[5]
				if newID, ok := idMap[targetID]; ok {
					return attrName + `=` + q1 + `#` + newID + q2
				}
			}
			return m
		})

		// Rewrite url(#oldID) inside attributes (fill, stroke, filter, clip-path, mask, marker-*, style, etc.)
		reAttrURL := regexp.MustCompile(`url\(\s*["']?#([a-zA-Z0-9:_-]+)["']?\s*\)`)
		tagAttrs = reAttrURL.ReplaceAllStringFunc(tagAttrs, func(m string) string {
			parts := reAttrURL.FindStringSubmatch(m)
			if len(parts) >= 2 {
				targetID := parts[1]
				if newID, ok := idMap[targetID]; ok {
					return "url(#" + newID + ")"
				}
			}
			return m
		})

		// Rewrite aria-labelledby and aria-describedby space-separated ID tokens
		reAria := regexp.MustCompile(`\b(aria-labelledby|aria-describedby)\s*=\s*(["'])([^"']+)(["'])`)
		tagAttrs = reAria.ReplaceAllStringFunc(tagAttrs, func(m string) string {
			parts := reAria.FindStringSubmatch(m)
			if len(parts) >= 5 {
				attrName := parts[1]
				q1 := parts[2]
				tokens := strings.Fields(parts[3])
				q2 := parts[4]
				newTokens := make([]string, len(tokens))
				for i, tok := range tokens {
					if mapped, ok := idMap[tok]; ok {
						newTokens[i] = mapped
					} else {
						newTokens[i] = tok
					}
				}
				return attrName + `=` + q1 + strings.Join(newTokens, " ") + q2
			}
			return m
		})

		// Rewrite SMIL event timing references: begin="anim1.begin" / end="anim1.end+2s"
		reTiming := regexp.MustCompile(`\b(begin|end)\s*=\s*(["'])([^"']+)(["'])`)
		tagAttrs = reTiming.ReplaceAllStringFunc(tagAttrs, func(m string) string {
			parts := reTiming.FindStringSubmatch(m)
			if len(parts) >= 5 {
				attrName := parts[1]
				q1 := parts[2]
				timingVal := parts[3]
				q2 := parts[4]
				for oldID, newID := range idMap {
					reEvt := regexp.MustCompile(`\b` + regexp.QuoteMeta(oldID) + `\.`)
					timingVal = reEvt.ReplaceAllString(timingVal, newID+".")
				}
				return attrName + `=` + q1 + timingVal + q2
			}
			return m
		})

		// Rewrite @keyframes animation-name references inside inline style="..." attributes
		if len(keyframeMap) > 0 && strings.Contains(tagAttrs, "style") {
			reStyleAttr := regexp.MustCompile(`\bstyle\s*=\s*(["'])([^"']*)(["'])`)
			tagAttrs = reStyleAttr.ReplaceAllStringFunc(tagAttrs, func(sm string) string {
				sp := reStyleAttr.FindStringSubmatch(sm)
				if len(sp) < 4 {
					return sm
				}
				sVal := sp[2]
				for oldKF, newKF := range keyframeMap {
					reInlineAnim := regexp.MustCompile(`\b(animation(?:-name)?\s*:\s*[^;]*?)\b` + regexp.QuoteMeta(oldKF) + `\b`)
					sVal = reInlineAnim.ReplaceAllString(sVal, "${1}"+newKF)
				}
				return `style=` + sp[1] + sVal + sp[3]
			})
		}

		return "<" + tagName + tagAttrs + ">"
	})

	// Inject manifest if provided and not already present
	if opts.Manifest != nil && len(opts.Manifest.Parameters) > 0 {
		reExistingManifest := regexp.MustCompile(`(?i)<script\b[^>]*\bid=["'](?:[^"']*__)?sva-widget-manifest["']`)
		if !reExistingManifest.MatchString(transformed) {
			manifestBytes, err := json.Marshal(opts.Manifest)
			if err == nil {
				manifestTag := fmt.Sprintf("\n  <script type=\"application/json\" id=\"%ssva-widget-manifest\">%s</script>\n", prefix, string(manifestBytes))
				if idx := strings.LastIndex(transformed, "</svg>"); idx != -1 {
					transformed = transformed[:idx] + manifestTag + transformed[idx:]
				} else {
					transformed += manifestTag
				}
			}
		}
	}

	return transformed, idMap, nil
}

// scopeCSSRules scopes CSS rules to the widget root ID so they don't affect sibling elements.
func scopeCSSRules(css string, rootID string, idMap map[string]string) string {
	// Temporarily extract @keyframes blocks so their inner rules are not scoped
	var kfBlocks []string
	reKFBlock := regexp.MustCompile(`(?s)@keyframes\s+[^{]+\{(?:[^{}]*\{[^{}]*\}[^{}]*)*\}`)
	cssWithoutKF := reKFBlock.ReplaceAllStringFunc(css, func(m string) string {
		kfBlocks = append(kfBlocks, m)
		return fmt.Sprintf("/*__SVA_KF_BLOCK_%d__*/", len(kfBlocks)-1)
	})

	// Rule matcher: selector { declarations }
	reRule := regexp.MustCompile(`(?s)([^{}/]+)\{([^{}]+)\}`)
	scoped := reRule.ReplaceAllStringFunc(cssWithoutKF, func(m string) string {
		sub := reRule.FindStringSubmatch(m)
		if len(sub) < 3 {
			return m
		}
		rawSel := strings.TrimSpace(sub[1])
		body := sub[2]

		if strings.HasPrefix(rawSel, "@") || strings.HasPrefix(rawSel, "/*") {
			return m
		}

		selList := strings.Split(rawSel, ",")
		var scopedList []string
		for _, s := range selList {
			cleanSel := strings.TrimSpace(s)
			if cleanSel == "" {
				continue
			}
			// Remap any #oldID in selector
			for oldID, newID := range idMap {
				reOldSelID := regexp.MustCompile(`#` + regexp.QuoteMeta(oldID) + `\b`)
				cleanSel = reOldSelID.ReplaceAllString(cleanSel, "#"+newID)
			}
			scopedList = append(scopedList, "#"+rootID+" "+cleanSel)
		}

		if len(scopedList) == 0 {
			return m
		}

		return "\n    " + strings.Join(scopedList, ", ") + " {" + body + "}"
	})

	// Restore @keyframes blocks
	for i, kf := range kfBlocks {
		placeholder := fmt.Sprintf("/*__SVA_KF_BLOCK_%d__*/", i)
		scoped = strings.Replace(scoped, placeholder, kf, 1)
	}

	return scoped
}

// EligibleProperty describes a supported controllable property for an object type.
type EligibleProperty struct {
	Property             string   `json:"property"`
	Type                 string   `json:"type"`
	Label                string   `json:"label"`
	Description          string   `json:"description"`
	Min                  *float64 `json:"min,omitempty"`
	Max                  *float64 `json:"max,omitempty"`
	Step                 *float64 `json:"step,omitempty"`
	Options              []string `json:"options,omitempty"`
	Default              any      `json:"default"`
	ParamSuffix          string   `json:"paramSuffix"`
	ExportRepresentation string   `json:"exportRepresentation,omitempty"`
	RuntimeSemantics     string   `json:"runtimeSemantics,omitempty"`
	DefaultSource        string   `json:"defaultSource,omitempty"`
}

func floatPtr(v float64) *float64 {
	return &v
}

// GenerateParameterName derives an automatic parameter name from an object name and property.
// Standard object-name-first convention: <object-name>-<object-type>-<property>
// Example: mytext + node + text  -> mytext-node-text
// Example: border + flow + speed -> border-flow-speed
// Example: alarm + glow + color  -> alarm-glow-color
// Example: warning + ripple + opacity -> warning-ripple-opacity
// Example: flow-1 + flow + speed -> flow-1-speed (default naming avoids duplicate type token)
// Example: root + playbackRate   -> root-speed
func GenerateParameterName(objectName, property string, targetType ...string) string {
	rawName := strings.TrimSpace(strings.ToLower(objectName))
	tType := ""
	if len(targetType) > 0 {
		tType = strings.TrimSpace(strings.ToLower(targetType[0]))
	}

	suffix := strings.ToLower(strings.TrimSpace(property))
	switch suffix {
	case "playbackrate":
		suffix = "speed"
	case "operatingstate":
		suffix = "state"
	case "textcontent":
		suffix = "text"
	case "stroke":
		if tType == "flow" || strings.HasPrefix(rawName, "flow-") || strings.Contains(rawName, "flow") {
			suffix = "color"
		} else {
			suffix = "stroke"
		}
	}

	if rawName == "" || rawName == "root" || rawName == "global" || rawName == "stage" || rawName == "widget" {
		return "root-" + suffix
	}

	regInvalid := regexp.MustCompile(`[^a-z0-9_-]`)
	cleanName := regInvalid.ReplaceAllString(rawName, "-")
	cleanName = regexp.MustCompile(`-+`).ReplaceAllString(cleanName, "-")
	cleanName = strings.Trim(cleanName, "-")

	if tType == "" {
		tType = InferTargetType(cleanName)
	}

	if tType == "" || tType == "root" {
		return cleanName + "-" + suffix
	}

	// Check if cleanName is a default pattern like "flow-1", "node-2", or just a number "1"
	isDefaultPattern := false
	if cleanName == tType || strings.HasPrefix(cleanName, tType+"-") {
		rem := strings.TrimPrefix(cleanName, tType+"-")
		if _, err := strconv.Atoi(rem); err == nil {
			isDefaultPattern = true
			cleanName = tType + "-" + rem
		}
	} else if _, err := strconv.Atoi(cleanName); err == nil {
		isDefaultPattern = true
		cleanName = tType + "-" + cleanName
	}

	if isDefaultPattern {
		return cleanName + "-" + suffix
	}

	// Strip type prefix or suffix if user named it e.g. "flow-border" or "border-flow"
	pureName := cleanName
	if strings.HasPrefix(pureName, tType+"-") {
		pureName = strings.TrimPrefix(pureName, tType+"-")
	} else if strings.HasSuffix(pureName, "-"+tType) {
		pureName = strings.TrimSuffix(pureName, "-"+tType)
	}
	pureName = strings.Trim(pureName, "-")
	if pureName == "" {
		pureName = cleanName
	}

	return pureName + "-" + tType + "-" + suffix
}

// ObjectPropertyCatalog maps each object category to its genuinely supported properties.
var ObjectPropertyCatalog = map[string][]EligibleProperty{
	"node": {
		{Property: "fill", Type: "color", Label: "Fill Colour", ParamSuffix: "fill", Description: "Primary interior fill color of node shape", Default: "#3b82f6", DefaultSource: "node.fillColor", RuntimeSemantics: "recolours node shape fill"},
		{Property: "stroke", Type: "color", Label: "Border Stroke", ParamSuffix: "stroke", Description: "Outline and border stroke color", Default: "#1d4ed8", DefaultSource: "node.strokeColor", RuntimeSemantics: "recolours node border stroke"},
		{Property: "opacity", Type: "number", Label: "Opacity", ParamSuffix: "opacity", Description: "Transparency of the node (0.0 to 1.0)", Min: floatPtr(0), Max: floatPtr(1), Step: floatPtr(0.05), Default: 1.0, DefaultSource: "node.fillOpacity", RuntimeSemantics: "sets node overall opacity"},
		{Property: "visibility", Type: "boolean", Label: "Visibility", ParamSuffix: "visibility", Description: "Toggle visibility of the node", Default: true, DefaultSource: "true", RuntimeSemantics: "toggles node visibility"},
		{Property: "play", Type: "boolean", Label: "Play Animation", ParamSuffix: "play", Description: "Start or stop the node shape animation (pulse-border, float, fade-in)", Default: true, DefaultSource: "true", RuntimeSemantics: "starts or stops node SMIL animation"},
		{Property: "text", Type: "text", Label: "Label Text", ParamSuffix: "text", Description: "Primary text label displayed inside the node", Default: "Node", DefaultSource: "node.text", RuntimeSemantics: "updates node text label"},
	},
	"flow": {
		{Property: "color", Type: "color", Label: "Flow Colour", ParamSuffix: "color", Description: "Colour of moving flow payload; motion guide remains stroke=none", Default: "#38bdf8", DefaultSource: "flow.color", RuntimeSemantics: "recolours moving payload only; guide path remains stroke=none"},
		{Property: "stroke", Type: "color", Label: "Line Colour", ParamSuffix: "color", Description: "Connector line and moving particle colour", Default: "#38bdf8", DefaultSource: "flow.color", RuntimeSemantics: "recolours moving payload; preserves guide path"},
		{Property: "speed", Type: "speed", Label: "Flow Speed", ParamSuffix: "speed", Description: "Animation speed multiplier for this flow connector (0.1 to 10.0)", Min: floatPtr(0.1), Max: floatPtr(10.0), Step: floatPtr(0.1), Default: 1.0, DefaultSource: "flow.animSpeed", RuntimeSemantics: "multiplies with master playback rate"},
		{Property: "opacity", Type: "number", Label: "Opacity", ParamSuffix: "opacity", Description: "Transparency of the connector (0.0 to 1.0)", Min: floatPtr(0), Max: floatPtr(1), Step: floatPtr(0.05), Default: 1.0, DefaultSource: "1.0", RuntimeSemantics: "sets flow overall opacity"},
		{Property: "visibility", Type: "boolean", Label: "Visibility", ParamSuffix: "visibility", Description: "Toggle visibility of this flow connector", Default: true, DefaultSource: "true", RuntimeSemantics: "toggles flow visibility"},
		{Property: "play", Type: "boolean", Label: "Play Animation", ParamSuffix: "play", Description: "Start or stop flow connector line and traveling payload animation", Default: true, DefaultSource: "true", RuntimeSemantics: "starts or stops flow SMIL animations"},
	},
	"glow": {
		{Property: "color", Type: "color", Label: "Glow Colour", ParamSuffix: "color", Description: "Accent color of the illuminated glow effect", Default: "#f59e0b", DefaultSource: "glow.color", RuntimeSemantics: "recolours radial gradient / core; hit-target remains transparent"},
		{Property: "opacity", Type: "number", Label: "Glow Intensity", ParamSuffix: "opacity", Description: "Transparency / intensity of the glow element (0.0 to 1.0)", Min: floatPtr(0), Max: floatPtr(1), Step: floatPtr(0.05), Default: 1.0, DefaultSource: "1.0", RuntimeSemantics: "modifies illuminated glow opacity"},
		{Property: "visibility", Type: "boolean", Label: "Visibility", ParamSuffix: "visibility", Description: "Toggle visibility of this glow hotspot", Default: true, DefaultSource: "true", RuntimeSemantics: "toggles glow visibility"},
		{Property: "play", Type: "boolean", Label: "Play Animation", ParamSuffix: "play", Description: "Start or stop hotspot glow pulse or radar ping animation", Default: true, DefaultSource: "true", RuntimeSemantics: "starts or stops glow SMIL animations"},
	},
	"ripple": {
		{Property: "color", Type: "color", Label: "Wave Colour", ParamSuffix: "color", Description: "Stroke color of the propagating ripple rings", Default: "#06b6d4", DefaultSource: "ripple.color", RuntimeSemantics: "recolours visible ripple waves only; hit-target and shadows unchanged"},
		{Property: "opacity", Type: "number", Label: "Wave Opacity", ParamSuffix: "opacity", Description: "Transparency of the ripple effect (0.0 to 1.0)", Min: floatPtr(0), Max: floatPtr(1), Step: floatPtr(0.05), Default: 1.0, DefaultSource: "1.0", RuntimeSemantics: "sets wave crest opacity"},
		{Property: "visibility", Type: "boolean", Label: "Visibility", ParamSuffix: "visibility", Description: "Toggle visibility of this ripple effect", Default: true, DefaultSource: "true", RuntimeSemantics: "toggles ripple visibility"},
		{Property: "play", Type: "boolean", Label: "Play Animation", ParamSuffix: "play", Description: "Start or stop expanding liquid ripple wave animation", Default: true, DefaultSource: "true", RuntimeSemantics: "starts or stops ripple SMIL animations"},
	},
	"image": {
		{Property: "opacity", Type: "number", Label: "Image Opacity", ParamSuffix: "opacity", Description: "Transparency of the image layer (0.0 to 1.0)", Min: floatPtr(0), Max: floatPtr(1), Step: floatPtr(0.05), Default: 1.0, DefaultSource: "image.opacity", RuntimeSemantics: "sets image opacity"},
		{Property: "visibility", Type: "boolean", Label: "Visibility", ParamSuffix: "visibility", Description: "Toggle visibility of the image layer", Default: true, DefaultSource: "image.visible", RuntimeSemantics: "toggles image visibility"},
	},
	"group": {
		{Property: "opacity", Type: "number", Label: "Group Opacity", ParamSuffix: "opacity", Description: "Transparency of the group (0.0 to 1.0)", Min: floatPtr(0), Max: floatPtr(1), Step: floatPtr(0.05), Default: 1.0, DefaultSource: "1.0", RuntimeSemantics: "sets group opacity"},
		{Property: "visibility", Type: "boolean", Label: "Visibility", ParamSuffix: "visibility", Description: "Toggle visibility of the group", Default: true, DefaultSource: "true", RuntimeSemantics: "toggles group visibility"},
		{Property: "play", Type: "boolean", Label: "Play Animation", ParamSuffix: "play", Description: "Start or stop all animations inside the group", Default: true, DefaultSource: "true", RuntimeSemantics: "starts or stops all descendant member animations within the group"},
		{Property: "speed", Type: "speed", Label: "Group Animation Speed", ParamSuffix: "speed", Description: "Animation playback speed multiplier for all animations inside the group (0.1 to 10.0)", Min: floatPtr(0.1), Max: floatPtr(10.0), Step: floatPtr(0.1), Default: 1.0, DefaultSource: "1.0", RuntimeSemantics: "scales descendant animation speed within the group"},
	},
	"lite": {
		{Property: "play", Type: "boolean", Label: "Play Animation", ParamSuffix: "play", Description: "Start or stop the low-load effect animation (independent of playbackMode: once plays once when true, loop plays continuously while true)", Default: true, DefaultSource: "lite.play", RuntimeSemantics: "starts or stops low-load effect animation honouring playbackMode"},
		{Property: "color", Type: "color", Label: "Effect Colour", ParamSuffix: "color", Description: "Primary stroke or fill colour of the low-load effect", Default: "#38bdf8", DefaultSource: "lite.color", RuntimeSemantics: "recolours lite effect payload and guide; hit-targets untouched"},
		{Property: "bgColor", Type: "color", Label: "Track / Background Colour", ParamSuffix: "bgColor", Description: "Background track or unlit segment colour for Gauge Lite", Default: "#1e293b", DefaultSource: "lite.bgColor", RuntimeSemantics: "recolours gauge background track and unlit segments"},
		{Property: "value", Type: "number", Label: "Gauge Value", ParamSuffix: "value", Description: "Current numeric value for Gauge / Level Lite indicators", Step: floatPtr(0.5), Default: 65.0, DefaultSource: "lite.value", RuntimeSemantics: "updates static gauge fill geometry and threshold colour"},
		{Property: "minValue", Type: "number", Label: "Gauge Min Value", ParamSuffix: "minValue", Description: "Minimum numeric domain bound for Gauge / Level Lite", Step: floatPtr(1), Default: 0.0, DefaultSource: "lite.minValue", RuntimeSemantics: "updates gauge minimum domain bound and recalculates fill"},
		{Property: "maxValue", Type: "number", Label: "Gauge Max Value", ParamSuffix: "maxValue", Description: "Maximum numeric domain bound for Gauge / Level Lite", Step: floatPtr(1), Default: 100.0, DefaultSource: "lite.maxValue", RuntimeSemantics: "updates gauge maximum domain bound and recalculates fill"},
		{Property: "opacity", Type: "number", Label: "Opacity", ParamSuffix: "opacity", Description: "Transparency of the low-load effect (0.0 to 1.0)", Min: floatPtr(0), Max: floatPtr(1), Step: floatPtr(0.05), Default: 0.9, DefaultSource: "lite.opacity", RuntimeSemantics: "sets lite effect overall opacity"},
		{Property: "visibility", Type: "boolean", Label: "Visibility", ParamSuffix: "visibility", Description: "Toggle visibility of the low-load effect", Default: true, DefaultSource: "true", RuntimeSemantics: "toggles lite effect visibility"},
		{Property: "speed", Type: "speed", Label: "Cycle Duration / Speed", ParamSuffix: "speed", Description: "Cycle duration in seconds (0.2 to 30.0 s) or playback speed multiplier (0.1 to 10.0)", Min: floatPtr(0.1), Max: floatPtr(30.0), Step: floatPtr(0.1), Default: 1.0, DefaultSource: "lite.speed", RuntimeSemantics: "updates cycle duration or scales CSS animation duration"},
		{Property: "strokeWidth", Type: "number", Label: "Stroke Width", ParamSuffix: "strokeWidth", Description: "Stroke thickness in px (0 to 32)", Min: floatPtr(0), Max: floatPtr(32), Step: floatPtr(0.5), Default: 2.5, DefaultSource: "lite.strokeWidth", RuntimeSemantics: "updates .lite-payload stroke-width"},
		{Property: "dashLength", Type: "number", Label: "Dash / Segment Length", ParamSuffix: "dashLength", Description: "Flow Lite dash or single segment length in px (2 to 400)", Min: floatPtr(2), Max: floatPtr(400), Step: floatPtr(1), Default: 18.0, DefaultSource: "lite.dashLength", RuntimeSemantics: "rebuilds Flow Lite segment dasharray and keyframes"},
		{Property: "gapLength", Type: "number", Label: "Gap Spacing", ParamSuffix: "gapLength", Description: "Flow Lite clear gap between segments in px (2 to 300)", Min: floatPtr(2), Max: floatPtr(300), Step: floatPtr(1), Default: 14.0, DefaultSource: "lite.gapLength", RuntimeSemantics: "rebuilds Flow Lite segment period and staggering"},
		{Property: "dotSize", Type: "number", Label: "Dot Diameter", ParamSuffix: "dotSize", Description: "Flow Lite dot diameter in px for dotted pattern (1 to 32)", Min: floatPtr(1), Max: floatPtr(32), Step: floatPtr(0.5), Default: 5.0, DefaultSource: "lite.dotSize", RuntimeSemantics: "updates Flow Lite dotted stroke-width and keyframes"},
		{Property: "segments", Type: "number", Label: "Segments", ParamSuffix: "segments", Description: "Number of segments or waveform cycles (1 to 32)", Min: floatPtr(1), Max: floatPtr(32), Step: floatPtr(1), Default: 2, DefaultSource: "lite.segments", RuntimeSemantics: "recomputes pathLength=1000 stroke-dasharray or waveform cycles"},
		{Property: "lineGapRatio", Type: "text", Label: "Line:Gap Ratio", ParamSuffix: "lineGapRatio", Description: "Repeating segment pattern ratio (e.g. 1:3)", Default: "1:3", DefaultSource: "lite.lineGapRatio", RuntimeSemantics: "recomputes pathLength=1000 stroke-dasharray"},
		{Property: "direction", Type: "enum", Label: "Direction", ParamSuffix: "direction", Description: "Travel direction (cw, ccw, forward, reverse)", Options: []string{"cw", "ccw", "forward", "reverse"}, Default: "cw", DefaultSource: "lite.direction", RuntimeSemantics: "switches travel direction"},
		{Property: "startOffset", Type: "number", Label: "Start Offset (%)", ParamSuffix: "startOffset", Description: "Perimeter phase offset, curved text arc offset, or oscilloscope baseline percentage (0 to 100%)", Min: floatPtr(0), Max: floatPtr(100), Step: floatPtr(1), Default: 0.0, DefaultSource: "lite.startOffset", RuntimeSemantics: "updates starting phase offset, textPath startOffset, or oscilloscope baseline"},
		{Property: "playbackMode", Type: "enum", Label: "Motion Mode", ParamSuffix: "playbackMode", Description: "Playback mode (loop, pingpong, once)", Options: []string{"loop", "pingpong", "once"}, Default: "loop", DefaultSource: "lite.playbackMode", RuntimeSemantics: "switches playback iteration & direction"},
		{Property: "burstCycles", Type: "number", Label: "Cycles Per Burst", ParamSuffix: "burstCycles", Description: "Circuits per burst before pausing (0 = continuous)", Min: floatPtr(0), Max: floatPtr(100), Step: floatPtr(1), Default: 0, DefaultSource: "lite.burstCycles", RuntimeSemantics: "runs N circuits then pauses"},
		{Property: "pauseSeconds", Type: "number", Label: "Pause Duration (s)", ParamSuffix: "pauseSeconds", Description: "Pause duration in seconds between bursts (0 to 300)", Min: floatPtr(0), Max: floatPtr(300), Step: floatPtr(0.5), Default: 0, DefaultSource: "lite.pauseSeconds", RuntimeSemantics: "sets pause interval between bursts"},
		{Property: "pauseVisibility", Type: "enum", Label: "Pause Behaviour", ParamSuffix: "pauseVisibility", Description: "Visibility during burst pause (hide or hold)", Options: []string{"hide", "hold"}, Default: "hide", DefaultSource: "lite.pauseVisibility", RuntimeSemantics: "hides or holds tracer segments during pause"},
		{Property: "showGuide", Type: "boolean", Label: "Guide / Centre Marker", ParamSuffix: "showGuide", Description: "Show or hide static boundary guide or radar centre marker", Default: true, DefaultSource: "lite.showGuide", RuntimeSemantics: "toggles .lite-guide-track visibility"},
		{Property: "scale", Type: "number", Label: "Max Scale", ParamSuffix: "scale", Description: "Maximum pulse or radar expansion scale multiplier (0.2 to 3.0)", Min: floatPtr(0.2), Max: floatPtr(3.0), Step: floatPtr(0.05), Default: 1.15, DefaultSource: "lite.maxScale", RuntimeSemantics: "updates CSS --sva-pulse-max / --sva-radar-max scale factor"},
		{Property: "period", Type: "number", Label: "Cycle Duration / Period (s)", ParamSuffix: "period", Description: "Cycle duration in seconds (0.2 to 30.0)", Min: floatPtr(0.2), Max: floatPtr(30.0), Step: floatPtr(0.1), Default: 1.8, DefaultSource: "lite.period", RuntimeSemantics: "updates cycle or pulse animation duration in seconds"},
		{Property: "intensity", Type: "number", Label: "Intensity", ParamSuffix: "intensity", Description: "Peak pulse/flash/oscilloscope amplitude (0.0 to 1.0)", Min: floatPtr(0), Max: floatPtr(1), Step: floatPtr(0.05), Default: 0.85, DefaultSource: "lite.intensity", RuntimeSemantics: "updates --sva-pulse-amp / --sva-flash-int / oscilloscope amplitude"},
		{Property: "armThickness", Type: "number", Label: "Arm Thickness", ParamSuffix: "armThickness", Description: "Independent cross/star arm thickness in SVG units (1 to 20)", Min: floatPtr(1), Max: floatPtr(20), Step: floatPtr(0.5), Default: 3.0, DefaultSource: "lite.armThickness", RuntimeSemantics: "rebuilds cross/star path arm width"},
		{Property: "trigger", Type: "number", Label: "Flash Trigger", ParamSuffix: "trigger", Description: "Incrementing or changing this value triggers a single-shot Flash Lite pulse", Min: floatPtr(0), Max: floatPtr(1000000), Step: floatPtr(1), Default: 0, DefaultSource: "0", RuntimeSemantics: "triggers one-shot flash animation"},
		{Property: "duration", Type: "number", Label: "Flash Duration (ms)", ParamSuffix: "duration", Description: "Flash duration in milliseconds (20 to 1000 ms)", Min: floatPtr(20), Max: floatPtr(1000), Step: floatPtr(10), Default: 100.0, DefaultSource: "lite.durationMs", RuntimeSemantics: "sets flash animation duration in milliseconds"},
		{Property: "repeat", Type: "boolean", Label: "Flash Repeat", ParamSuffix: "repeat", Description: "Repeat flash periodically instead of single-shot", Default: false, DefaultSource: "lite.repeat", RuntimeSemantics: "toggles periodic flash scheduling"},
		{Property: "repeatInterval", Type: "number", Label: "Repeat Interval (s)", ParamSuffix: "repeatInterval", Description: "Interval in seconds between repeated flashes (0.2 to 60)", Min: floatPtr(0.2), Max: floatPtr(60), Step: floatPtr(0.1), Default: 2.0, DefaultSource: "lite.repeatInterval", RuntimeSemantics: "sets interval between repeated flashes"},
		{Property: "samples", Type: "text", Label: "Waveform Samples", ParamSuffix: "samples", Description: "Bounded numeric sample sequence (2 to 64 comma-separated values) for Oscilloscope Lite sampled mode", Default: "0, 0.4, 0.9, 0.3, -0.5, -0.9, -0.2, 0.6, 1.0, 0.2, -0.4, 0", DefaultSource: "lite.samples", RuntimeSemantics: "rebuilds Oscilloscope Lite sampled waveform path"},
		{Property: "text", Type: "text", Label: "Text Content", ParamSuffix: "text", Description: "Displayed text content for Text Box Lite (immediate update on static text, cycle-boundary handover on animated text)", Default: "System Ready", DefaultSource: "lite.labelText", RuntimeSemantics: "updates Text Box Lite displayed or pending text"},
		{Property: "borderColor", Type: "color", Label: "Border Colour", ParamSuffix: "borderColor", Description: "Container border or guide path colour for Text Box Lite", Default: "#38bdf8", DefaultSource: "lite.borderColor", RuntimeSemantics: "recolours Text Box Lite container border and arc guide"},
		{Property: "scrollSpeed", Type: "number", Label: "Ticker Scroll Speed (px/s)", ParamSuffix: "scrollSpeed", Description: "Linear scroll speed in SVG units/px per second for Text Box Lite tickers (10 to 600 px/s)", Min: floatPtr(10), Max: floatPtr(600), Step: floatPtr(5), Default: 90.0, DefaultSource: "lite.scrollSpeed", RuntimeSemantics: "updates Text Box Lite ticker scroll speed and recalculates duration"},
		{Property: "typeSpeed", Type: "number", Label: "Typing Rate (chars/s)", ParamSuffix: "typeSpeed", Description: "Character reveal rate in grapheme clusters per second for Text Box Lite typewriter, scramble, and overtype effects (1 to 120 chars/s)", Min: floatPtr(1), Max: floatPtr(120), Step: floatPtr(1), Default: 14.0, DefaultSource: "lite.typeSpeed", RuntimeSemantics: "updates Text Box Lite character progression rate"},
	},
	"root": {
		{Property: "playbackRate", Type: "speed", Label: "Master Speed", ParamSuffix: "speed", Description: "Overall playback speed rate multiplier for the widget (0.1 to 5.0)", Min: floatPtr(0.1), Max: floatPtr(5.0), Step: floatPtr(0.1), Default: 1.0, DefaultSource: "1.0", RuntimeSemantics: "widget-wide master playback rate"},
		{Property: "visibility", Type: "boolean", Label: "Visibility", ParamSuffix: "visibility", Description: "Master visibility toggle for the entire widget", Default: true, DefaultSource: "true", RuntimeSemantics: "toggles root widget visibility"},
		{Property: "operatingState", Type: "enum", Label: "Operating State", ParamSuffix: "state", Description: "Lifecycle operating state of the widget (running, paused, stopped)", Options: []string{"running", "paused", "stopped"}, Default: "running", DefaultSource: "running", RuntimeSemantics: "sets unit lifecycle state"},
	},
}

// SyncParameterNamesWithObjectNames ensures every parameter name matches the object-name/property convention:
// <objectName>-<paramSuffix>.
func (s *Scene) SyncParameterNamesWithObjectNames() {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.parameters {
		p := &s.parameters[i]
		target := p.Target
		objName, tType := s.getObjectNameForTargetLocked(target)
		if objName != "" {
			p.Name = GenerateParameterName(objName, p.Property, tType)
		}
	}
}

func (s *Scene) getObjectNameForTargetLocked(target string) (string, string) {
	t := strings.TrimSpace(target)
	if t == "" || t == "root" || t == "global" || t == "stage" || t == "widget" {
		return "root", "root"
	}
	cleanID := strings.TrimPrefix(t, "node-")
	if n, ok := s.nodes[StringID(cleanID)]; ok {
		name := n.Name
		if name == "" {
			name = n.Text
		}
		if name == "" {
			name = "node-" + string(n.ID)
		}
		return name, "node"
	}
	if n, ok := s.nodes[StringID(t)]; ok {
		name := n.Name
		if name == "" {
			name = n.Text
		}
		if name == "" {
			name = "node-" + string(n.ID)
		}
		return name, "node"
	}

	cleanID = strings.TrimPrefix(t, "flow-")
	if f, ok := s.flows[StringID(cleanID)]; ok {
		name := f.Name
		if name == "" {
			name = "flow-" + string(f.ID)
		}
		return name, "flow"
	}
	if f, ok := s.flows[StringID(t)]; ok {
		name := f.Name
		if name == "" {
			name = "flow-" + string(f.ID)
		}
		return name, "flow"
	}

	cleanID = strings.TrimPrefix(t, "glow-")
	if g, ok := s.glows[StringID(cleanID)]; ok {
		name := g.Name
		if name == "" {
			name = "glow-" + string(g.ID)
		}
		return name, "glow"
	}
	if g, ok := s.glows[StringID(t)]; ok {
		name := g.Name
		if name == "" {
			name = "glow-" + string(g.ID)
		}
		return name, "glow"
	}

	cleanID = strings.TrimPrefix(t, "ripple-")
	if r, ok := s.ripples[StringID(cleanID)]; ok {
		name := r.Name
		if name == "" {
			name = "ripple-" + string(r.ID)
		}
		return name, "ripple"
	}
	if r, ok := s.ripples[StringID(t)]; ok {
		name := r.Name
		if name == "" {
			name = "ripple-" + string(r.ID)
		}
		return name, "ripple"
	}

	cleanID = strings.TrimPrefix(t, "image-")
	if img, ok := s.images[StringID(cleanID)]; ok {
		name := img.Name
		if name == "" {
			name = "image-" + string(img.ID)
		}
		return name, "image"
	}
	if img, ok := s.images[StringID(t)]; ok {
		name := img.Name
		if name == "" {
			name = "image-" + string(img.ID)
		}
		return name, "image"
	}

	cleanID = strings.TrimPrefix(t, "lite-")
	if le, ok := s.liteEffects[StringID(cleanID)]; ok {
		name := le.Name
		if name == "" {
			name = "lite-" + string(le.ID)
		}
		return name, "lite"
	}
	if le, ok := s.liteEffects[StringID(t)]; ok {
		name := le.Name
		if name == "" {
			name = "lite-" + string(le.ID)
		}
		return name, "lite"
	}

	if grp, ok := s.groups[StringID(t)]; ok {
		name := grp.Name
		if name == "" {
			name = string(grp.ID)
		}
		return name, "group"
	}
	cleanID = strings.TrimPrefix(t, "group-")
	if grp, ok := s.groups[StringID("group-"+cleanID)]; ok {
		name := grp.Name
		if name == "" {
			name = string(grp.ID)
		}
		return name, "group"
	}

	return t, InferTargetType(t)
}

// InferTargetType deduces the object category from a target identifier.
func InferTargetType(target string) string {
	t := strings.TrimSpace(strings.ToLower(target))
	switch {
	case t == "" || t == "root" || t == "global" || t == "stage" || t == "widget":
		return "root"
	case strings.HasPrefix(t, "node-") || strings.HasPrefix(t, "node_"):
		return "node"
	case strings.HasPrefix(t, "flow-") || strings.HasPrefix(t, "flow_"):
		return "flow"
	case strings.HasPrefix(t, "glow-") || strings.HasPrefix(t, "glow_"):
		return "glow"
	case strings.HasPrefix(t, "ripple-") || strings.HasPrefix(t, "ripple_"):
		return "ripple"
	case strings.HasPrefix(t, "image-") || strings.HasPrefix(t, "image_"):
		return "image"
	case strings.HasPrefix(t, "lite-") || strings.HasPrefix(t, "lite_"):
		return "lite"
	case strings.HasPrefix(t, "group-") || strings.HasPrefix(t, "group_"):
		return "group"
	default:
		return ""
	}
}

// GetEligibleProperties returns the slice of supported properties for a given target type.
func GetEligibleProperties(targetType string) []EligibleProperty {
	norm := strings.TrimSpace(strings.ToLower(targetType))
	if norm == "global" || norm == "stage" || norm == "widget" {
		norm = "root"
	}
	if list, ok := ObjectPropertyCatalog[norm]; ok {
		out := make([]EligibleProperty, len(list))
		copy(out, list)
		return out
	}
	return []EligibleProperty{}
}

// ResolveLiteEligibleProperty returns the kind-specific and instance-specific EligibleProperty
// for a LiteEffect, matching the native inspector and ValidateLiteEffect constraints.
func ResolveLiteEligibleProperty(kind string, le *LiteEffect, ep EligibleProperty) (EligibleProperty, bool) {
	if !isLiteEffectPropertySupportedByKind(kind, ep.Property) {
		return EligibleProperty{}, false
	}
	out := ep
	if len(ep.Options) > 0 {
		out.Options = append([]string(nil), ep.Options...)
	}

	switch ep.Property {
	case "speed":
		switch kind {
		case "flow-lite":
			out.Label = "Cycle Duration (s)"
			out.Description = "Duration in seconds for one complete pass along the path (0.2 to 30.0 s)"
			out.Min = floatPtr(0.2)
			out.Max = floatPtr(30.0)
			out.Step = floatPtr(0.1)
			out.Default = 2.0
			if le != nil && le.Speed >= 0.2 && le.Speed <= 30.0 {
				out.Default = le.Speed
			}
		case "oscilloscope-lite":
			out.Label = "Cycle Duration (s)"
			out.Description = "Duration in seconds for one full tile sweep cycle (0.2 to 30.0 s)"
			out.Min = floatPtr(0.2)
			out.Max = floatPtr(30.0)
			out.Step = floatPtr(0.1)
			out.Default = 2.4
			if le != nil && le.Speed >= 0.2 && le.Speed <= 30.0 {
				out.Default = le.Speed
			}
		case "perimeter-tracer":
			out.Label = "Cycle Duration / Speed (s)"
			out.Description = "Circuit duration in seconds around the perimeter (0.2 to 30.0 s)"
			out.Min = floatPtr(0.2)
			out.Max = floatPtr(30.0)
			out.Step = floatPtr(0.1)
			out.Default = 3.0
			if le != nil && le.Speed >= 0.2 && le.Speed <= 30.0 {
				out.Default = le.Speed
			}
		case "text-lite":
			out.Label = "Transition / Fade Duration (s)"
			out.Description = "Transition or fade duration in seconds for Text Box Lite (0.0 to 30.0 s)"
			out.Min = floatPtr(0.0)
			out.Max = floatPtr(30.0)
			out.Step = floatPtr(0.05)
			out.Default = 0.8
			if le != nil && le.Speed >= 0 && le.Speed <= 30.0 {
				out.Default = le.Speed
			}
		default:
			out.Label = "Speed / Rate"
			out.Description = "Playback speed multiplier for the effect (0.1 to 10.0)"
			out.Min = floatPtr(0.1)
			out.Max = floatPtr(10.0)
			out.Step = floatPtr(0.1)
			out.Default = 1.0
		}
	case "period":
		out.Label = "Cycle Duration / Period (s)"
		out.Description = "Cycle duration in seconds (0.2 to 30.0 s)"
		out.Min = floatPtr(0.2)
		out.Max = floatPtr(30.0)
		out.Step = floatPtr(0.1)
		switch kind {
		case "radar-lite":
			out.Default = 2.4
			if le != nil && le.Period >= 0.2 && le.Period <= 30.0 {
				out.Default = le.Period
			}
		case "flow-lite":
			out.Default = 2.0
			if le != nil && le.Speed >= 0.2 && le.Speed <= 30.0 {
				out.Default = le.Speed
			}
		case "oscilloscope-lite":
			out.Default = 2.4
			if le != nil && le.Speed >= 0.2 && le.Speed <= 30.0 {
				out.Default = le.Speed
			}
		case "perimeter-tracer":
			out.Default = 3.0
			if le != nil && le.Speed >= 0.2 && le.Speed <= 30.0 {
				out.Default = le.Speed
			}
		default:
			out.Default = 1.8
			if le != nil && le.Period >= 0.2 && le.Period <= 30.0 {
				out.Default = le.Period
			}
		}
	case "strokeWidth":
		out.Step = floatPtr(0.5)
		switch kind {
		case "perimeter-tracer":
			out.Min = floatPtr(0.5)
			out.Max = floatPtr(20.0)
			out.Default = 2.5
		case "radar-lite":
			out.Min = floatPtr(0.5)
			out.Max = floatPtr(20.0)
			out.Default = 2.0
		case "flow-lite":
			out.Min = floatPtr(0.5)
			out.Max = floatPtr(24.0)
			out.Default = 3.0
		case "gauge-lite":
			out.Min = floatPtr(0.5)
			out.Max = floatPtr(32.0)
			out.Default = 8.0
		case "oscilloscope-lite":
			out.Min = floatPtr(0.5)
			out.Max = floatPtr(16.0)
			out.Default = 2.2
		case "text-lite":
			out.Label = "Border Thickness (px)"
			out.Min = floatPtr(0.0)
			out.Max = floatPtr(24.0)
			out.Default = 1.5
		default:
			out.Min = floatPtr(0.5)
			out.Max = floatPtr(24.0)
			out.Default = 2.5
		}
		if le != nil && le.StrokeWidth >= *out.Min && le.StrokeWidth <= *out.Max {
			out.Default = le.StrokeWidth
		}
	case "segments":
		out.Step = floatPtr(1)
		switch kind {
		case "perimeter-tracer":
			out.Label = "Segments"
			out.Min = floatPtr(1)
			out.Max = floatPtr(16)
			out.Default = 2
		case "gauge-lite":
			out.Label = "Segments"
			out.Min = floatPtr(2)
			out.Max = floatPtr(32)
			out.Default = 10
		case "oscilloscope-lite":
			out.Label = "Cycles (Freq)"
			out.Min = floatPtr(1)
			out.Max = floatPtr(12)
			out.Default = 2
		default:
			out.Min = floatPtr(1)
			out.Max = floatPtr(16)
			out.Default = 2
		}
		if le != nil && float64(le.Segments) >= *out.Min && float64(le.Segments) <= *out.Max {
			out.Default = le.Segments
		}
	case "startOffset":
		out.Step = floatPtr(1)
		switch kind {
		case "oscilloscope-lite":
			out.Label = "Baseline (%)"
			out.Min = floatPtr(10)
			out.Max = floatPtr(90)
			out.Default = 50.0
		case "text-lite":
			out.Label = "Arc Offset (%)"
			out.Min = floatPtr(0)
			out.Max = floatPtr(100)
			out.Default = 50.0
		default:
			out.Label = "Start Offset (%)"
			out.Min = floatPtr(0)
			out.Max = floatPtr(100)
			out.Default = 0.0
		}
		if le != nil && le.StartOffset >= *out.Min && le.StartOffset <= *out.Max {
			out.Default = le.StartOffset
		}
	case "intensity":
		out.Step = floatPtr(0.05)
		switch kind {
		case "oscilloscope-lite":
			out.Label = "Amplitude"
			out.Min = floatPtr(0.05)
			out.Max = floatPtr(1.0)
			out.Default = 0.75
		case "flash":
			out.Min = floatPtr(0.0)
			out.Max = floatPtr(1.0)
			out.Default = 0.75
		default:
			out.Min = floatPtr(0.0)
			out.Max = floatPtr(1.0)
			out.Default = 0.85
		}
		if le != nil && le.Intensity >= *out.Min && le.Intensity <= *out.Max {
			out.Default = le.Intensity
		}
	case "direction":
		if kind == "flow-lite" || kind == "gauge-lite" || kind == "oscilloscope-lite" || kind == "text-lite" {
			out.Options = []string{"forward", "reverse"}
			out.Default = "forward"
		} else {
			out.Options = []string{"cw", "ccw"}
			out.Default = "cw"
		}
	case "playbackMode":
		out.Options = []string{"loop", "pingpong", "once"}
		out.Default = "loop"
	case "play":
		out.Default = true
		if le != nil && le.Play != nil {
			out.Default = *le.Play
		}
	case "visibility":
		out.Default = true
		if le != nil && le.Visible != nil {
			out.Default = *le.Visible
		}
	case "value":
		out.Step = floatPtr(0.5)
		minV := 0.0
		maxV := 100.0
		if le != nil {
			if le.MinValue != nil && !math.IsNaN(*le.MinValue) {
				minV = *le.MinValue
			}
			if le.MaxValue != nil && !math.IsNaN(*le.MaxValue) && *le.MaxValue > minV {
				maxV = *le.MaxValue
			}
		}
		out.Min = floatPtr(minV)
		out.Max = floatPtr(maxV)
		if le != nil && le.Value != nil && !math.IsNaN(*le.Value) {
			out.Default = *le.Value
		}
	}
	return out, true
}

// GetEligiblePropertiesForTarget returns the authoritative properties for a target type,
// applying LiteEffect kind-specific and instance-specific domain constraints when targetID or liteKind is provided.
func (s *Scene) GetEligiblePropertiesForTarget(targetType, targetID, liteKind string) []EligibleProperty {
	base := GetEligibleProperties(targetType)
	norm := strings.TrimSpace(strings.ToLower(targetType))
	if norm != "lite" {
		return base
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	var le *LiteEffect
	cleanID := strings.TrimPrefix(strings.TrimSpace(targetID), "lite-")
	if cleanID != "" {
		if found, ok := s.liteEffects[StringID(cleanID)]; ok {
			copyLe := found
			le = &copyLe
			if liteKind == "" {
				liteKind = le.Kind
			}
		}
	}
	if liteKind == "" {
		return base
	}

	out := make([]EligibleProperty, 0, len(base))
	for _, ep := range base {
		if resolved, ok := ResolveLiteEligibleProperty(liteKind, le, ep); ok {
			out = append(out, resolved)
		}
	}
	return out
}

// ResolveMemberEligiblePropertyLocked returns the authoritative EligibleProperty for a specific group member and property.
func (s *Scene) ResolveMemberEligiblePropertyLocked(mType SelectionType, mID StringID, prop string) (*EligibleProperty, error) {
	catalogProps := GetEligibleProperties(string(mType))
	var eligible *EligibleProperty
	for i := range catalogProps {
		ep := &catalogProps[i]
		if ep.Property == prop ||
			(mType == SelectionFlow && prop == "playbackRate" && ep.Property == "speed") ||
			(mType == SelectionFlow && prop == "stroke" && ep.Property == "color") ||
			(mType == SelectionFlow && prop == "color" && ep.Property == "stroke") {
			copyEp := *ep
			eligible = &copyEp
			break
		}
	}
	if eligible == nil {
		return nil, fmt.Errorf("property %q is not eligible on member %s %s", prop, mType, mID)
	}

	if mType == SelectionLite {
		if le, ok := s.liteEffects[mID]; ok {
			copyLe := le
			resolved, supported := ResolveLiteEligibleProperty(le.Kind, &copyLe, *eligible)
			if !supported {
				return nil, fmt.Errorf("property %q is not supported by %s member %s %s", prop, le.Kind, mType, mID)
			}
			return &resolved, nil
		}
	}

	return eligible, nil
}

// ParameterConflict reports an ambiguous duplicate binding where multiple parameters bind to the same (target, property).
type ParameterConflict struct {
	Target      string            `json:"target"`
	Property    string            `json:"property"`
	Parameters  []WidgetParameter `json:"parameters"`
	Description string            `json:"description"`
}

// ValidateWidgetParameter validates a WidgetParameter definition according to the Stage 16B schema.
func ValidateWidgetParameter(p WidgetParameter) error {
	name := strings.TrimSpace(p.Name)
	if name == "" {
		return fmt.Errorf("parameter name cannot be empty")
	}
	// Check valid identifier: must start with letter, followed by letters, digits, underscores, or hyphens
	reIdent := regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_-]{0,63}$`)
	if !reIdent.MatchString(name) {
		return fmt.Errorf("invalid parameter name %q: must start with a letter and contain only alphanumeric characters, underscores, or hyphens (max 64 chars)", name)
	}

	target := strings.TrimSpace(p.Target)
	if target == "" {
		return fmt.Errorf("parameter target cannot be empty")
	}

	// Supported types
	switch p.Type {
	case "color", "number", "boolean", "text", "enum", "speed":
		// valid
	default:
		return fmt.Errorf("unsupported parameter type %q: must be color, number, boolean, text, enum, or speed", p.Type)
	}

	// Supported safe properties
	prop := strings.TrimSpace(p.Property)
	if prop == "" {
		return fmt.Errorf("parameter property cannot be empty")
	}

	// Reject unsafe properties or script injection vectors
	lowerProp := strings.ToLower(prop)
	if strings.Contains(lowerProp, "script") ||
		(strings.HasPrefix(lowerProp, "on") && len(lowerProp) > 2) ||
		strings.Contains(lowerProp, "handler") ||
		strings.Contains(lowerProp, "href") ||
		strings.Contains(lowerProp, "style") ||
		strings.Contains(lowerProp, "javascript") {
		return fmt.Errorf("unsafe property %q is rejected", prop)
	}

	// Prohibit min/max on non-numeric types
	if p.Type != "number" && p.Type != "speed" {
		if p.Min != nil || p.Max != nil {
			return fmt.Errorf("parameter %q of type %q cannot define numeric min or max limits", name, p.Type)
		}
	}

	// Validate min/max ordering on numeric types
	if p.Min != nil && p.Max != nil && *p.Min > *p.Max {
		return fmt.Errorf("parameter %q min (%v) cannot be greater than max (%v)", name, *p.Min, *p.Max)
	}

	// Check property eligibility against ObjectPropertyCatalog if target type is recognized
	targetType := InferTargetType(target)
	if len(p.Targets) > 0 {
		if targetType != "group" {
			return fmt.Errorf("multi-target bindings (Targets) are only supported on group parameters (got target %q of type %q)", target, targetType)
		}
		if !reGroupAlias.MatchString(prop) {
			return fmt.Errorf("invalid group semantic property alias %q", prop)
		}
		for _, tb := range p.Targets {
			mTarget := strings.TrimSpace(tb.Target)
			mProp := strings.TrimSpace(tb.Property)
			if mTarget == "" || mProp == "" {
				return fmt.Errorf("group parameter %q contains an empty target or property binding", name)
			}
			mType := InferTargetType(mTarget)
			if mType == "" || mType == "root" || mType == "group" {
				return fmt.Errorf("group parameter %q cannot map to non-member target %q", name, mTarget)
			}
			allowed := GetEligibleProperties(mType)
			var found *EligibleProperty
			for i := range allowed {
				ep := &allowed[i]
				if ep.Property == mProp ||
					(mType == "flow" && mProp == "playbackRate" && ep.Property == "speed") ||
					(mType == "flow" && mProp == "stroke" && ep.Property == "color") ||
					(mType == "flow" && mProp == "color" && ep.Property == "stroke") {
					found = ep
					break
				}
			}
			if found == nil {
				return fmt.Errorf("group parameter %q maps to unsupported property %q on %q (%s)", name, mProp, mTarget, mType)
			}
			compatible := (p.Type == found.Type) ||
				((p.Type == "number" || p.Type == "speed") && (found.Type == "number" || found.Type == "speed")) ||
				((p.Type == "number" || p.Type == "speed") && found.Type == "text")
			if !compatible {
				return fmt.Errorf("group parameter %q of type %q is incompatible with mapped property %q (type %q) on %q", name, p.Type, mProp, found.Type, mTarget)
			}
		}
	} else if targetType != "" {
		allowed := GetEligibleProperties(targetType)
		if len(allowed) > 0 {
			var found *EligibleProperty
			for _, ep := range allowed {
				if ep.Property == prop ||
					(targetType == "root" && prop == "state" && ep.Property == "operatingState") ||
					(targetType == "root" && prop == "operatingState" && ep.Property == "state") ||
					(targetType == "root" && prop == "speed" && ep.Property == "playbackRate") ||
					(targetType == "flow" && prop == "playbackRate" && ep.Property == "speed") ||
					(targetType == "flow" && prop == "stroke" && ep.Property == "color") ||
					(targetType == "flow" && prop == "color" && ep.Property == "stroke") {
					found = &ep
					break
				}
			}
			if found == nil {
				return fmt.Errorf("property %q is not eligible for target %q of type %q", prop, target, targetType)
			}
			if p.Type != found.Type {
				return fmt.Errorf("property %q on %s requires type %q (got %q)", prop, targetType, found.Type, p.Type)
			}
		}
	}

	// Validate property compatibility with type (for direct single-target parameters)
	if len(p.Targets) == 0 {
		switch p.Type {
		case "color":
			if prop != "fill" && prop != "stroke" && prop != "color" && prop != "bgColor" && prop != "borderColor" {
				return fmt.Errorf("color parameter does not support property %q (allowed: fill, stroke, color, bgColor, borderColor)", prop)
			}
		case "boolean":
			if prop != "visibility" && prop != "display" && prop != "showGuide" && prop != "repeat" && prop != "play" {
				return fmt.Errorf("boolean parameter does not support property %q (allowed: visibility, display, showGuide, repeat, play)", prop)
			}
		case "text":
			if prop != "text" && prop != "textContent" && prop != "lineGapRatio" && prop != "samples" {
				return fmt.Errorf("text parameter does not support property %q (allowed: text, textContent, lineGapRatio, samples)", prop)
			}
		case "speed":
			if prop != "playbackRate" && prop != "speed" {
				return fmt.Errorf("speed parameter does not support property %q (allowed: playbackRate, speed)", prop)
			}
		}
	}

	switch p.Type {
	case "speed":
		if p.Min != nil && p.Max != nil && *p.Min > *p.Max {
			return fmt.Errorf("speed min (%v) cannot be greater than max (%v)", *p.Min, *p.Max)
		}
		if p.Default != nil {
			defNum := toFloat64(p.Default, math.NaN())
			if !math.IsNaN(defNum) {
				if p.Min != nil && defNum < *p.Min {
					return fmt.Errorf("speed default value (%v) cannot be less than minimum (%v)", defNum, *p.Min)
				}
				if p.Max != nil && defNum > *p.Max {
					return fmt.Errorf("speed default value (%v) cannot be greater than maximum (%v)", defNum, *p.Max)
				}
			}
		}
	case "enum":
		if len(p.Options) == 0 {
			return fmt.Errorf("enum parameter must have at least one allowed option")
		}
		for _, opt := range p.Options {
			if strings.TrimSpace(opt) == "" {
				return fmt.Errorf("enum options cannot contain empty strings")
			}
		}
	case "number":
		if p.Min != nil && p.Max != nil && *p.Min > *p.Max {
			return fmt.Errorf("numeric min (%v) cannot be greater than max (%v)", *p.Min, *p.Max)
		}
		if prop == "opacity" {
			if p.Min != nil && *p.Min < 0 {
				return fmt.Errorf("opacity min (%v) cannot be less than 0", *p.Min)
			}
			if p.Max != nil && *p.Max > 1.0 {
				return fmt.Errorf("opacity max (%v) cannot exceed 1.0", *p.Max)
			}
		}
		if p.Default != nil {
			defNum := toFloat64(p.Default, math.NaN())
			if !math.IsNaN(defNum) {
				if p.Min != nil && defNum < *p.Min {
					return fmt.Errorf("numeric default value (%v) cannot be less than minimum (%v)", defNum, *p.Min)
				}
				if p.Max != nil && defNum > *p.Max {
					return fmt.Errorf("numeric default value (%v) cannot be greater than maximum (%v)", defNum, *p.Max)
				}
			}
		}
	}

	return nil
}

// ExtractWidgetManifest parses an embedded sva-widget-manifest script tag from raw SVG markup.
func ExtractWidgetManifest(rawSVG string) *WidgetManifest {
	re := regexp.MustCompile(`(?i)<script\b[^>]*\bid=["'](?:[^"']*__)?sva-widget-manifest["'][^>]*>([\s\S]*?)</script>`)
	matches := re.FindStringSubmatch(rawSVG)
	if len(matches) < 2 {
		return nil
	}
	rawJSON := strings.TrimSpace(matches[1])
	if rawJSON == "" || rawJSON == "{}" {
		return nil
	}
	var manifest WidgetManifest
	if err := json.Unmarshal([]byte(rawJSON), &manifest); err != nil {
		return nil
	}
	if len(manifest.Parameters) == 0 {
		return nil
	}
	return &manifest
}

// ValidateWidgetExport validates the entire export manifest and verifies that all target elements exist and resolve in the isolated SVG.
func ValidateWidgetExport(manifest *WidgetManifest, isolatedSVG string, sc *Scene) error {
	if manifest == nil || len(manifest.Parameters) == 0 {
		return nil
	}

	seenNames := make(map[string]bool)

	for _, p := range manifest.Parameters {
		// 1. Structure and schema validation
		if err := ValidateWidgetParameter(p); err != nil {
			return fmt.Errorf("widget export validation failed for parameter %q: %w", p.Name, err)
		}

		// 2. Uniqueness of parameter names
		if seenNames[p.Name] {
			return fmt.Errorf("widget export validation failed: duplicate parameter name %q", p.Name)
		}
		seenNames[p.Name] = true

		// 3. Existence in Scene (if scene contains objects)
		tType := InferTargetType(p.Target)
		hasSceneObjects := sc != nil && (len(sc.nodes) > 0 || len(sc.flows) > 0 || len(sc.glows) > 0 || len(sc.ripples) > 0 || len(sc.images) > 0 || len(sc.liteEffects) > 0 || len(sc.groups) > 0)
		if hasSceneObjects && tType != "" && tType != "root" {
			cleanID := p.Target
			for _, prefix := range []string{"node-", "flow-", "glow-", "ripple-", "image-", "lite-", "group-"} {
				cleanID = strings.TrimPrefix(cleanID, prefix)
			}
			existsInScene := false
			switch tType {
			case "node":
				existsInScene = (sc.GetNode(StringID(cleanID)) != nil || sc.GetNode(StringID(p.Target)) != nil)
			case "flow":
				existsInScene = (sc.GetFlow(StringID(cleanID)) != nil || sc.GetFlow(StringID(p.Target)) != nil)
			case "glow":
				existsInScene = (sc.GetGlow(StringID(cleanID)) != nil || sc.GetGlow(StringID(p.Target)) != nil)
			case "ripple":
				existsInScene = (sc.GetRipple(StringID(cleanID)) != nil || sc.GetRipple(StringID(p.Target)) != nil)
			case "image":
				_, ok1 := sc.GetImage(StringID(cleanID))
				_, ok2 := sc.GetImage(StringID(p.Target))
				existsInScene = ok1 || ok2
			case "lite":
				_, ok1 := sc.GetLiteEffect(StringID(cleanID))
				_, ok2 := sc.GetLiteEffect(StringID(p.Target))
				existsInScene = ok1 || ok2
			case "group":
				_, ok1 := sc.GetGroup(StringID("group-" + cleanID))
				_, ok2 := sc.GetGroup(StringID(p.Target))
				_, ok3 := sc.GetGroup(StringID(cleanID))
				existsInScene = ok1 || ok2 || ok3
			default:
				existsInScene = true
			}
			if !existsInScene {
				return fmt.Errorf("widget export validation failed: target object %q for parameter %q does not exist in scene", p.Target, p.Name)
			}
		}

		// 4. Target element resolution in isolatedSVG
		if isolatedSVG != "" && p.Target != "" && p.Target != "root" && p.Target != "global" && p.Target != "stage" && p.Target != "widget" {
			targetResolved := false
			cleanID := p.Target
			for _, prefix := range []string{"node-", "flow-", "glow-", "ripple-", "image-", "lite-", "group-"} {
				cleanID = strings.TrimPrefix(cleanID, prefix)
			}

			patterns := []string{
				fmt.Sprintf(`data-semantic-target="%s"`, p.Target),
				fmt.Sprintf(`data-semantic-target='%s'`, p.Target),
				fmt.Sprintf(`data-semantic-name="%s"`, p.Target),
				fmt.Sprintf(`data-semantic-name='%s'`, p.Target),
				fmt.Sprintf(`data-group-id="%s"`, p.Target),
				fmt.Sprintf(`data-group-id='%s'`, p.Target),
				fmt.Sprintf(`data-group-id="group-%s"`, cleanID),
				fmt.Sprintf(`id="%s"`, p.Target),
				fmt.Sprintf(`id='%s'`, p.Target),
				fmt.Sprintf(`__%s"`, p.Target),
				fmt.Sprintf(`__%s'`, p.Target),
				fmt.Sprintf(`-%s"`, p.Target),
				fmt.Sprintf(`-%s'`, p.Target),
				fmt.Sprintf(`data-node-id="%s"`, cleanID),
				fmt.Sprintf(`data-flow-id="%s"`, cleanID),
				fmt.Sprintf(`data-glow-id="%s"`, cleanID),
				fmt.Sprintf(`data-ripple-id="%s"`, cleanID),
				fmt.Sprintf(`data-image-id="%s"`, cleanID),
				fmt.Sprintf(`data-lite-id="%s"`, cleanID),
				fmt.Sprintf(`data-node-id="%s"`, p.Target),
				fmt.Sprintf(`data-flow-id="%s"`, p.Target),
				fmt.Sprintf(`data-glow-id="%s"`, p.Target),
				fmt.Sprintf(`data-ripple-id="%s"`, p.Target),
				fmt.Sprintf(`data-image-id="%s"`, p.Target),
				fmt.Sprintf(`data-lite-id="%s"`, p.Target),
			}
			for _, pat := range patterns {
				if strings.Contains(isolatedSVG, pat) {
					targetResolved = true
					break
				}
			}
			if !targetResolved {
				return fmt.Errorf("widget export validation failed: target element %q for parameter %q could not be resolved in the exported SVG", p.Target, p.Name)
			}
		}

		// 5. Multi-target bindings resolution for group semantic properties (Stage 16E-M2)
		for _, tb := range p.Targets {
			mTarget := strings.TrimSpace(tb.Target)
			mType := InferTargetType(mTarget)
			cleanID := mTarget
			for _, prefix := range []string{"node-", "flow-", "glow-", "ripple-", "image-", "lite-", "group-"} {
				cleanID = strings.TrimPrefix(cleanID, prefix)
			}
			if hasSceneObjects && mType != "" && mType != "root" {
				existsInScene := false
				switch mType {
				case "node":
					existsInScene = (sc.GetNode(StringID(cleanID)) != nil || sc.GetNode(StringID(mTarget)) != nil)
				case "flow":
					existsInScene = (sc.GetFlow(StringID(cleanID)) != nil || sc.GetFlow(StringID(mTarget)) != nil)
				case "glow":
					existsInScene = (sc.GetGlow(StringID(cleanID)) != nil || sc.GetGlow(StringID(mTarget)) != nil)
				case "ripple":
					existsInScene = (sc.GetRipple(StringID(cleanID)) != nil || sc.GetRipple(StringID(mTarget)) != nil)
				case "image":
					_, ok1 := sc.GetImage(StringID(cleanID))
					_, ok2 := sc.GetImage(StringID(mTarget))
					existsInScene = ok1 || ok2
				case "lite":
					_, ok1 := sc.GetLiteEffect(StringID(cleanID))
					_, ok2 := sc.GetLiteEffect(StringID(mTarget))
					existsInScene = ok1 || ok2
				}
				if !existsInScene {
					return fmt.Errorf("widget export validation failed: mapped member target %q for group parameter %q does not exist in scene", mTarget, p.Name)
				}
			}
			if isolatedSVG != "" && mTarget != "" {
				mResolved := false
				patterns := []string{
					fmt.Sprintf(`data-semantic-target="%s"`, mTarget),
					fmt.Sprintf(`data-semantic-target='%s'`, mTarget),
					fmt.Sprintf(`id="%s"`, mTarget),
					fmt.Sprintf(`__%s"`, mTarget),
					fmt.Sprintf(`data-node-id="%s"`, cleanID),
					fmt.Sprintf(`data-flow-id="%s"`, cleanID),
					fmt.Sprintf(`data-glow-id="%s"`, cleanID),
					fmt.Sprintf(`data-ripple-id="%s"`, cleanID),
					fmt.Sprintf(`data-image-id="%s"`, cleanID),
					fmt.Sprintf(`data-lite-id="%s"`, cleanID),
				}
				for _, pat := range patterns {
					if strings.Contains(isolatedSVG, pat) {
						mResolved = true
						break
					}
				}
				if !mResolved {
					return fmt.Errorf("widget export validation failed: mapped member target %q for group parameter %q could not be resolved in the exported SVG", mTarget, p.Name)
				}
			}
		}
	}
	return nil
}
