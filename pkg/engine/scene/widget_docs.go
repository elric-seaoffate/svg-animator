package scene

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"path"
	"regexp"
	"strings"
	"time"
)

// GenerateWidgetPropertiesGuide produces an authoritative Markdown guide documenting
// the specific exported SVG widget, its object inventory, and its exposed parameters.
func GenerateWidgetPropertiesGuide(sc *Scene, widgetName, svgFilename string, manifest *WidgetManifest) string {
	if widgetName == "" {
		widgetName = "SVG Widget"
	}
	if svgFilename == "" {
		svgFilename = "widget.svg"
	}

	cleanBase := cleanWidgetSlug(widgetName)
	nowStr := time.Now().UTC().Format("2006-01-02 15:04:02 UTC")

	var sb strings.Builder

	// Title & Metadata
	sb.WriteString(fmt.Sprintf("# %s — Widget Properties & Integration Guide\n\n", widgetName))
	sb.WriteString(fmt.Sprintf("**Widget File:** `%s`  \n", svgFilename))
	sb.WriteString("**Format:** SVG Widget (Stage 16B Isolated Multi-Instance)  \n")
	sb.WriteString("**Scene Schema Version:** `1.2.0`  \n")
	sb.WriteString("**Protocol Version:** `1.0.0`  \n")
	sb.WriteString(fmt.Sprintf("**Generated At:** %s  \n\n", nowStr))
	sb.WriteString("---\n\n")

	// 1. Executive Summary & Overview
	sb.WriteString("## 1. Overview & Architecture\n\n")
	sb.WriteString(fmt.Sprintf("`%s` is a self-contained, collision-free SVG widget exported from **SVG Animator Studio**.\n", widgetName))
	sb.WriteString("It encapsulates vector graphics, embedded animations, filter definitions, and an external parameter manifest.\n\n")

	if sc != nil {
		sc.mu.RLock()
		cw := sc.canvas.Width
		ch := sc.canvas.Height
		sc.mu.RUnlock()
		if cw > 0 && ch > 0 {
			sb.WriteString(fmt.Sprintf("- **Native Canvas Dimensions:** %.0f × %.0f px (viewBox `0 0 %.0f %.0f`)\n", cw, ch, cw, ch))
		}
	}
	sb.WriteString("- **Isolation Model:** Element IDs, gradients, filters, and animation keyframes are automatically scoped per mounted instance.\n")
	sb.WriteString("- **Multi-Instance Capability:** Multiple copies of this widget can coexist inside the same HTML document or DOM tree with zero ID collisions or styling crosstalk.\n\n")

	// 2. Object Inventory Table
	sb.WriteString("## 2. Controllable Objects & Scene Inventory\n\n")
	sb.WriteString("The following inventory lists the visual objects authored within this widget and their corresponding external parameter bindings:\n\n")
	sb.WriteString("| Target Identifier | Object Name | Object Type | Geometry / Position | Layer | Bound Parameters |\n")
	sb.WriteString("|---|---|---|---|---|---|\n")

	// Map of target to list of parameter names
	targetParamMap := make(map[string][]string)
	if manifest != nil {
		for _, p := range manifest.Parameters {
			targetParamMap[p.Target] = append(targetParamMap[p.Target], "`"+p.Name+"`")
			// Also map numeric IDs to "node-X"
			if !strings.HasPrefix(p.Target, "node-") && !strings.HasPrefix(p.Target, "flow-") &&
				!strings.HasPrefix(p.Target, "glow-") && !strings.HasPrefix(p.Target, "ripple-") &&
				!strings.HasPrefix(p.Target, "image-") && !strings.HasPrefix(p.Target, "lite-") &&
				!strings.HasPrefix(p.Target, "group-") {
				targetParamMap["node-"+p.Target] = append(targetParamMap["node-"+p.Target], "`"+p.Name+"`")
			}
			for _, tb := range p.Targets {
				targetParamMap[tb.Target] = append(targetParamMap[tb.Target], fmt.Sprintf("`%s` (%s)", p.Name, tb.Property))
			}
		}
	}

	if sc != nil {
		sc.mu.RLock()
		// Groups
		for _, gid := range sc.groupIDs {
			grp := sc.groups[gid]
			targetId := string(grp.ID)
			name := grp.Name
			if name == "" {
				name = targetId
			}
			params := targetParamMap[targetId]
			pStr := "-"
			if len(params) > 0 {
				pStr = strings.Join(params, ", ")
			}
			sb.WriteString(fmt.Sprintf("| `%s` | %s | Object Group (%d members) | Composite Group | Group | %s |\n",
				targetId, escapeMD(name), len(grp.Members), pStr))
		}
		// Nodes
		for _, nid := range sc.nodeIDs {
			n := sc.nodes[nid]
			targetId := fmt.Sprintf("node-%s", n.ID)
			name := n.Name
			if name == "" {
				name = targetId
			}
			params := targetParamMap[targetId]
			if len(params) == 0 {
				params = targetParamMap[string(n.ID)]
			}
			if len(params) == 0 && n.Name != "" {
				params = targetParamMap[n.Name]
			}
			pStr := "-"
			if len(params) > 0 {
				pStr = strings.Join(params, ", ")
			}
			sb.WriteString(fmt.Sprintf("| `%s` | %s | Node (%s) | (%.1f, %.1f) %.0f×%.0f | Base | %s |\n",
				targetId, escapeMD(name), n.Shape, n.X, n.Y, n.Width, n.Height, pStr))
		}
		// LiteEffects
		for _, lid := range sc.liteEffectOrder {
			le := sc.liteEffects[lid]
			targetId := fmt.Sprintf("lite-%s", le.ID)
			name := le.Name
			if name == "" {
				name = targetId
			}
			params := targetParamMap[targetId]
			if len(params) == 0 {
				params = targetParamMap[string(le.ID)]
			}
			pStr := "-"
			if len(params) > 0 {
				pStr = strings.Join(params, ", ")
			}
			sb.WriteString(fmt.Sprintf("| `%s` | %s | Lite Effect (%s) | (%.1f, %.1f) %.0f×%.0f | Lite | %s |\n",
				targetId, escapeMD(name), le.Kind, le.X, le.Y, le.Width, le.Height, pStr))
		}
		// Glows
		for _, gid := range sc.glowIDs {
			g := sc.glows[gid]
			targetId := fmt.Sprintf("glow-%s", g.ID)
			name := g.Name
			if name == "" {
				name = targetId
			}
			params := targetParamMap[targetId]
			if len(params) == 0 {
				params = targetParamMap[string(g.ID)]
			}
			pStr := "-"
			if len(params) > 0 {
				pStr = strings.Join(params, ", ")
			}
			sb.WriteString(fmt.Sprintf("| `%s` | %s | Glow Hotspot | (%.1f, %.1f) size=%.0f | Optical | %s |\n",
				targetId, escapeMD(name), g.X, g.Y, g.Size, pStr))
		}
		// Flows
		for _, fid := range sc.flowIDs {
			f := sc.flows[fid]
			targetId := fmt.Sprintf("flow-%s", f.ID)
			name := f.Name
			if name == "" {
				name = targetId
			}
			params := targetParamMap[targetId]
			if len(params) == 0 {
				params = targetParamMap[string(f.ID)]
			}
			pStr := "-"
			if len(params) > 0 {
				pStr = strings.Join(params, ", ")
			}
			sb.WriteString(fmt.Sprintf("| `%s` | %s | Connector Flow | Nodes: %d | Base | %s |\n",
				targetId, escapeMD(name), len(f.Nodes), pStr))
		}
		// Ripples
		for _, rid := range sc.rippleIDs {
			r := sc.ripples[rid]
			targetId := fmt.Sprintf("ripple-%s", r.ID)
			name := r.Name
			if name == "" {
				name = targetId
			}
			params := targetParamMap[targetId]
			if len(params) == 0 {
				params = targetParamMap[string(r.ID)]
			}
			pStr := "-"
			if len(params) > 0 {
				pStr = strings.Join(params, ", ")
			}
			sb.WriteString(fmt.Sprintf("| `%s` | %s | Ripple Wave | (%.1f, %.1f) maxR=%.0f | Optical | %s |\n",
				targetId, escapeMD(name), r.X, r.Y, r.OuterR, pStr))
		}
		// Images
		for _, iid := range sc.imageIDs {
			img := sc.images[iid]
			targetId := fmt.Sprintf("image-%s", img.ID)
			name := img.Name
			if name == "" {
				name = targetId
			}
			params := targetParamMap[targetId]
			if len(params) == 0 {
				params = targetParamMap[string(img.ID)]
			}
			pStr := "-"
			if len(params) > 0 {
				pStr = strings.Join(params, ", ")
			}
			sb.WriteString(fmt.Sprintf("| `%s` | %s | Image Object | (%.1f, %.1f) %.0f×%.0f | Base | %s |\n",
				targetId, escapeMD(name), img.X, img.Y, img.Width, img.Height, pStr))
		}
		sc.mu.RUnlock()
	}

	// Root / Global
	if rootParams, ok := targetParamMap["root"]; ok && len(rootParams) > 0 {
		sb.WriteString(fmt.Sprintf("| `root` | Root SVG / Transport | Global Widget | Entire Viewport | System | %s |\n", strings.Join(rootParams, ", ")))
	}
	sb.WriteString("\n---\n\n")

	// 3. Parameter Specification Table
	sb.WriteString("## 3. Parameter Specification & API Reference\n\n")
	if manifest == nil || len(manifest.Parameters) == 0 {
		sb.WriteString("*(No external parameters are exposed for this widget.)*\n\n")
	} else {
		sb.WriteString("| Parameter Name | Type | Target | Property | Default | Permitted Limits / Values | Unit | Description |\n")
		sb.WriteString("|---|---|---|---|---|---|---|---|\n")

		for _, p := range manifest.Parameters {
			defVal := fmt.Sprintf("%v", p.Default)
			if p.Type == "color" {
				defVal = fmt.Sprintf("`%v`", p.Default)
			}
			limitsStr := "-"
			if p.Type == "number" || p.Type == "speed" {
				if p.Min != nil && p.Max != nil {
					limitsStr = fmt.Sprintf("%.1f to %.1f", *p.Min, *p.Max)
				} else if p.Min != nil {
					limitsStr = fmt.Sprintf(">= %.1f", *p.Min)
				} else if p.Max != nil {
					limitsStr = fmt.Sprintf("<= %.1f", *p.Max)
				}
			} else if p.Type == "enum" && len(p.Options) > 0 {
				limitsStr = strings.Join(p.Options, ", ")
			} else if p.Type == "boolean" {
				limitsStr = "`true`, `false`"
			}

			unitStr := p.Unit
			if unitStr == "" {
				unitStr = "-"
			}

			descStr := p.Description
			if descStr == "" {
				descStr = fmt.Sprintf("Controls %s property on %s", p.Property, p.Target)
			}
			if len(p.Targets) > 0 {
				var tList []string
				for _, tb := range p.Targets {
					tList = append(tList, fmt.Sprintf("`%s.%s`", tb.Target, tb.Property))
				}
				descStr = fmt.Sprintf("%s → Fan-out: %s", descStr, strings.Join(tList, ", "))
			}

			sb.WriteString(fmt.Sprintf("| **`%s`** | `%s` | `%s` | `%s` | %s | %s | %s | %s |\n",
				p.Name, p.Type, p.Target, p.Property, defVal, limitsStr, unitStr, escapeMD(descStr)))
		}
		sb.WriteString("\n")
	}
	sb.WriteString("---\n\n")

	// 4. Animation & Transport Capabilities
	sb.WriteString("## 4. Animation & Transport Capabilities\n\n")
	sb.WriteString("SVG Animator Studio distinguishes between authored animation loops and external host controls:\n\n")
	sb.WriteString("- **Connector Flows, Optical Glows & Ripples:** Run continuously via browser-native SVG animation engines.\n")
	sb.WriteString("- **Instance Animation Playback Control:**\n")
	sb.WriteString("  - `widget.play()`: Resumes/plays all animations within the instance.\n")
	sb.WriteString("  - `widget.pause()`: Freezes SMIL and CSS animations for the instance only.\n")
	sb.WriteString("  - `widget.setSpeed(multiplier)`: Scales playback speed (`0.1` to `5.0`) on supported animations.\n")
	sb.WriteString("  - `widget.resetParameters()`: Restores all bound properties to authored scene defaults.\n")
	sb.WriteString("  - Individual instance playback does **not** interfere with other instances on the same page.\n\n")
	sb.WriteString("---\n\n")

	// 5. No-Code Usage Guide
	sb.WriteString("## 5. No-Code Usage Guide (For Non-Programmers)\n\n")
	sb.WriteString("This widget package includes a pre-built interactive control studio:\n\n")
	sb.WriteString("1. Locate `demo.html` in this package directory.\n")
	sb.WriteString("2. Double-click `demo.html` to open it in any modern browser (Chrome, Edge, Firefox, Safari).\n")
	sb.WriteString("3. The page automatically mounts **three independent instances** (Unit A, Unit B, Unit C).\n")
	sb.WriteString("4. Adjust the sliders, color pickers, and toggles in each panel. Each instance responds instantly.\n")
	sb.WriteString("5. Use the **Reset** button to restore defaults, or **Pause/Play** to freeze/resume animations.\n")
	sb.WriteString("6. No web server, command line, or code editing is required.\n\n")
	sb.WriteString("---\n\n")

	// 6. Developer Integration Guide
	sb.WriteString("## 6. Developer Integration & JavaScript API Reference\n\n")
	sb.WriteString("### Mounting in a Web Application\n\n")
	sb.WriteString("```html\n")
	sb.WriteString("<!-- 1. Include the lightweight Stage 16B widget runtime -->\n")
	sb.WriteString("<script src=\"js/svg-widget.js\"></script>\n\n")
	sb.WriteString("<!-- 2. Target container element -->\n")
	sb.WriteString(fmt.Sprintf("<div id=\"%s-container\" style=\"width: 400px; height: 320px;\"></div>\n\n", cleanBase))
	sb.WriteString("<script>\n")
	sb.WriteString(fmt.Sprintf("  // 3. Mount instance (offline file:// supported via inline template/markup or HTTP URL)\n"))
	sb.WriteString(fmt.Sprintf("  const svgSource = document.getElementById('%s-template') ? document.getElementById('%s-template').innerHTML : '%s';\n", cleanBase, cleanBase, svgFilename))
	sb.WriteString(fmt.Sprintf("  const myWidget = SVGWidget.mount('#%s-container', svgSource, {\n", cleanBase))
	sb.WriteString(fmt.Sprintf("    instanceId: '%s-1'\n", cleanBase))
	sb.WriteString("  });\n")
	sb.WriteString("</script>\n")
	sb.WriteString("```\n\n")

	sb.WriteString("### Controlling Instance Parameters\n\n")
	sb.WriteString("```javascript\n")
	if manifest != nil && len(manifest.Parameters) > 0 {
		firstP := manifest.Parameters[0]
		sb.WriteString(fmt.Sprintf("// Single parameter update (using real exported parameter '%s'):\n", firstP.Name))
		if firstP.Type == "color" {
			sb.WriteString(fmt.Sprintf("myWidget.setParameter('%s', '#22c55e');\n\n", firstP.Name))
		} else if firstP.Type == "number" || firstP.Type == "speed" {
			sb.WriteString(fmt.Sprintf("myWidget.setParameter('%s', %v);\n\n", firstP.Name, firstP.Default))
		} else if firstP.Type == "boolean" {
			sb.WriteString(fmt.Sprintf("myWidget.setParameter('%s', false);\n\n", firstP.Name))
		} else {
			sb.WriteString(fmt.Sprintf("myWidget.setParameter('%s', '%v');\n\n", firstP.Name, firstP.Default))
		}

		sb.WriteString("// Atomic batch update:\n")
		sb.WriteString("myWidget.setParameters({\n")
		for i, p := range manifest.Parameters {
			if i >= 4 {
				break
			}
			if p.Type == "color" {
				sb.WriteString(fmt.Sprintf("  %s: '%v',\n", p.Name, p.Default))
			} else if p.Type == "number" || p.Type == "speed" {
				sb.WriteString(fmt.Sprintf("  %s: %v,\n", p.Name, p.Default))
			} else if p.Type == "boolean" {
				sb.WriteString(fmt.Sprintf("  %s: %v,\n", p.Name, p.Default))
			} else {
				sb.WriteString(fmt.Sprintf("  %s: '%v',\n", p.Name, p.Default))
			}
		}
		sb.WriteString("});\n\n")
	} else {
		sb.WriteString("// (No external parameters have been configured for this widget in SVG Animator Studio.)\n")
		sb.WriteString("// Select an object in the editor and enable 'Expose as Widget Parameter' to define external controls.\n\n")
	}

	sb.WriteString("// Read current value:\n")
	if manifest != nil && len(manifest.Parameters) > 0 {
		sb.WriteString(fmt.Sprintf("const val = myWidget.getParameter('%s');\n\n", manifest.Parameters[0].Name))
	} else {
		sb.WriteString("// const val = myWidget.getParameter('paramName'); // Active when parameters are defined\n\n")
	}

	sb.WriteString("// Reset to authored defaults:\n")
	sb.WriteString("myWidget.resetParameters();\n\n")

	sb.WriteString("// Listen for property changes:\n")
	sb.WriteString("myWidget.on('change', (evt) => {\n")
	sb.WriteString("  console.log(`[${evt.instanceId}] ${evt.name} changed to:`, evt.value);\n")
	sb.WriteString("});\n")
	sb.WriteString("```\n\n")

	sb.WriteString("### Multi-Instance Independence Example\n\n")
	sb.WriteString("```javascript\n")
	sb.WriteString(fmt.Sprintf("const svgSource = document.getElementById('%s-template') ? document.getElementById('%s-template').innerHTML : '%s';\n\n", cleanBase, cleanBase, svgFilename))
	sb.WriteString("const instA = SVGWidget.mount('#unitA', svgSource, { instanceId: 'unit-a' });\n")
	sb.WriteString("const instB = SVGWidget.mount('#unitB', svgSource, { instanceId: 'unit-b' });\n")
	sb.WriteString("const instC = SVGWidget.mount('#unitC', svgSource, { instanceId: 'unit-c' });\n\n")

	if manifest != nil && len(manifest.Parameters) > 0 {
		firstP := manifest.Parameters[0]
		pName := firstP.Name
		pType := firstP.Type
		switch pType {
		case "color":
			sb.WriteString(fmt.Sprintf("instA.setParameter('%s', '#22c55e'); // Green (Active / Healthy)\n", pName))
			sb.WriteString(fmt.Sprintf("instB.setParameter('%s', '#f59e0b'); // Amber (Warning / Standby)\n", pName))
			sb.WriteString(fmt.Sprintf("instC.setParameter('%s', '#ef4444'); // Red (Alarm / Critical)\n", pName))
		case "boolean":
			sb.WriteString(fmt.Sprintf("instA.setParameter('%s', true);  // Visible / Active\n", pName))
			sb.WriteString(fmt.Sprintf("instB.setParameter('%s', false); // Hidden / Inactive\n", pName))
			sb.WriteString(fmt.Sprintf("instC.setParameter('%s', true);  // Visible / Active\n", pName))
		case "speed":
			sb.WriteString(fmt.Sprintf("instA.setParameter('%s', 1.0); // Normal motion rate (1.0x)\n", pName))
			sb.WriteString(fmt.Sprintf("instB.setParameter('%s', 2.5); // Fast motion rate (2.5x)\n", pName))
			sb.WriteString(fmt.Sprintf("instC.setParameter('%s', 0.5); // Slow motion rate (0.5x)\n", pName))
		case "number":
			minVal := 10.0
			maxVal := 100.0
			if firstP.Min != nil {
				minVal = *firstP.Min
			}
			if firstP.Max != nil {
				maxVal = *firstP.Max
			}
			midVal := (minVal + maxVal) / 2.0
			sb.WriteString(fmt.Sprintf("instA.setParameter('%s', %.1f); // High value\n", pName, maxVal))
			sb.WriteString(fmt.Sprintf("instB.setParameter('%s', %.1f);  // Mid value\n", pName, midVal))
			sb.WriteString(fmt.Sprintf("instC.setParameter('%s', %.1f);  // Low value\n", pName, minVal))
		case "enum":
			optA := "optionA"
			optB := "optionB"
			optC := "optionC"
			if len(firstP.Options) >= 3 {
				optA, optB, optC = firstP.Options[0], firstP.Options[1], firstP.Options[2]
			} else if len(firstP.Options) == 2 {
				optA, optB, optC = firstP.Options[0], firstP.Options[1], firstP.Options[0]
			} else if len(firstP.Options) == 1 {
				optA, optB, optC = firstP.Options[0], firstP.Options[0], firstP.Options[0]
			}
			sb.WriteString(fmt.Sprintf("instA.setParameter('%s', '%s');\n", pName, optA))
			sb.WriteString(fmt.Sprintf("instB.setParameter('%s', '%s');\n", pName, optB))
			sb.WriteString(fmt.Sprintf("instC.setParameter('%s', '%s');\n", pName, optC))
		case "text":
			sb.WriteString(fmt.Sprintf("instA.setParameter('%s', 'Unit 1 Active');\n", pName))
			sb.WriteString(fmt.Sprintf("instB.setParameter('%s', 'Unit 2 Standby');\n", pName))
			sb.WriteString(fmt.Sprintf("instC.setParameter('%s', 'Unit 3 Offline');\n", pName))
		default:
			sb.WriteString(fmt.Sprintf("instA.setParameter('%s', '%v');\n", pName, firstP.Default))
			sb.WriteString(fmt.Sprintf("instB.setParameter('%s', '%v');\n", pName, firstP.Default))
			sb.WriteString(fmt.Sprintf("instC.setParameter('%s', '%v');\n", pName, firstP.Default))
		}
	} else {
		sb.WriteString("// All three instances animate and control playback completely independently:\n")
		sb.WriteString("instA.play();\n")
		sb.WriteString("instB.pause();\n")
		sb.WriteString("instC.play();\n")
	}
	sb.WriteString("```\n\n")

	sb.WriteString("---\n\n")
	sb.WriteString("*(End of Guide — Generated automatically by SVG Animator Studio)*\n")

	return sb.String()
}

// GenerateWidgetReadme creates a README.md file for the portable widget package.
func GenerateWidgetReadme(widgetName, svgFilename string, manifest *WidgetManifest) string {
	cleanBase := cleanWidgetSlug(widgetName)
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("# %s — Portable SVG Widget Package\n\n", widgetName))
	sb.WriteString("This directory contains a complete, portable, and ready-to-run SVG widget package exported from **SVG Animator Studio**.\n\n")

	sb.WriteString("## Quick Start\n\n")
	sb.WriteString("1. **Interactive Demo (No-Code):** Double-click `demo.html` in your browser. You can operate three independent live instances immediately with real-time controls.\n")
	sb.WriteString(fmt.Sprintf("2. **Standalone Asset:** `%s` is the collision-free SVG file ready to embed in any web application.\n", svgFilename))
	sb.WriteString(fmt.Sprintf("3. **Properties Guide:** Read `%s-properties.md` for complete parameter specifications, object inventory, and integration code snippets.\n\n", cleanBase))

	sb.WriteString("## Package File Index\n\n")
	sb.WriteString("| File | Purpose |\n")
	sb.WriteString("|---|---|\n")
	sb.WriteString(fmt.Sprintf("| `%s` | Isolated, collision-free SVG widget with embedded JSON parameter manifest |\n", svgFilename))
	sb.WriteString(fmt.Sprintf("| `%s-properties.md` | Authoritative properties guide, object inventory, and developer reference |\n", cleanBase))
	sb.WriteString("| `widget-manifest.json` | Inspection copy of the validated parameter manifest schema |\n")
	sb.WriteString("| `demo.html` | Ready-to-run interactive multi-instance no-code control page |\n")
	sb.WriteString("| `js/svg-widget.js` | Lightweight, dependency-free JavaScript runtime adapter |\n")
	sb.WriteString("| `README.md` | This quick start and package index |\n\n")

	paramCount := 0
	if manifest != nil {
		paramCount = len(manifest.Parameters)
	}
	sb.WriteString(fmt.Sprintf("**Total Exposed Parameters:** %d  \n", paramCount))
	sb.WriteString("**Format Specification:** Stage 16B Isolated Multi-Instance Widget  \n")
	sb.WriteString("**Runtime Compatibility:** Universal (Browser Global, ES Modules, CommonJS)  \n")

	return sb.String()
}

// GenerateWidgetDemoHTML creates a ready-to-run, no-code interactive control page.
// If rawSVG is supplied, it embeds the SVG as a Base64-encoded payload, enabling
// completely offline double-click operation via file:// across all major browsers.
func GenerateWidgetDemoHTML(widgetName, svgFilename string, manifest *WidgetManifest, rawSVG ...string) string {
	cleanBase := cleanWidgetSlug(widgetName)

	manifestJson := "{}"
	if manifest != nil {
		b, _ := json.Marshal(manifest)
		manifestJson = string(b)
	}

	var sb strings.Builder
	sb.WriteString("<!DOCTYPE html>\n")
	sb.WriteString("<html lang=\"en\">\n<head>\n")
	sb.WriteString("  <meta charset=\"UTF-8\">\n")
	sb.WriteString("  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n")
	sb.WriteString(fmt.Sprintf("  <title>%s — Interactive Widget Control Studio</title>\n", escapeHTML(widgetName)))
	sb.WriteString("  <style>\n")
	sb.WriteString("    * { box-sizing: border-box; margin: 0; padding: 0; }\n")
	sb.WriteString("    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; line-height: 1.5; padding: 20px; }\n")
	sb.WriteString("    header { max-width: 1380px; margin: 0 auto 20px auto; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #30363d; padding-bottom: 16px; }\n")
	sb.WriteString("    .header-title h1 { font-size: 1.35rem; color: #f0f6fc; font-weight: 600; display: flex; align-items: center; gap: 8px; }\n")
	sb.WriteString("    .header-title p { font-size: 0.85rem; color: #8b949e; margin-top: 4px; }\n")
	sb.WriteString("    .badge { font-size: 0.72rem; padding: 2px 8px; border-radius: 12px; background: rgba(56, 139, 253, 0.15); color: #58a6ff; border: 1px solid rgba(56, 139, 253, 0.4); }\n")
	sb.WriteString("    .grid-container { max-width: 1380px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 20px; }\n")
	sb.WriteString("    .instance-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; }\n")
	sb.WriteString("    .card-header { padding: 12px 16px; background: #21262d; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; }\n")
	sb.WriteString("    .card-header h2 { font-size: 0.95rem; font-weight: 600; color: #f0f6fc; }\n")
	sb.WriteString("    .stage-wrapper { padding: 16px; background: #0b0f19; min-height: 280px; display: flex; align-items: center; justify-content: center; position: relative; border-bottom: 1px solid #30363d; }\n")
	sb.WriteString("    .stage-wrapper svg { max-width: 100%; max-height: 280px; height: auto; display: block; }\n")
	sb.WriteString("    .transport-bar { padding: 8px 16px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; gap: 8px; align-items: center; }\n")
	sb.WriteString("    .btn { font-size: 0.75rem; padding: 4px 10px; border-radius: 4px; border: 1px solid #30363d; background: #21262d; color: #c9d1d9; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }\n")
	sb.WriteString("    .btn:hover { background: #30363d; color: #f0f6fc; }\n")
	sb.WriteString("    .btn-reset { margin-left: auto; color: #8b949e; }\n")
	sb.WriteString("    .controls-deck { padding: 16px; display: flex; flex-direction: column; gap: 12px; flex: 1; }\n")
	sb.WriteString("    .control-item { display: flex; flex-direction: column; gap: 4px; }\n")
	sb.WriteString("    .control-label-row { display: flex; justify-content: space-between; font-size: 0.78rem; }\n")
	sb.WriteString("    .param-name { font-weight: 600; color: #e6edf3; }\n")
	sb.WriteString("    .param-val { color: #58a6ff; font-family: monospace; font-size: 0.75rem; }\n")
	sb.WriteString("    .control-input-row { display: flex; align-items: center; gap: 8px; }\n")
	sb.WriteString("    .control-input-row input[type=\"range\"] { flex: 1; height: 6px; cursor: pointer; accent-color: #58a6ff; }\n")
	sb.WriteString("    .control-input-row input[type=\"color\"] { width: 36px; height: 26px; border: 1px solid #30363d; border-radius: 4px; cursor: pointer; background: transparent; padding: 0; }\n")
	sb.WriteString("    .control-input-row input[type=\"text\"], .control-input-row select { flex: 1; padding: 5px 8px; background: #0d1117; color: #c9d1d9; border: 1px solid #30363d; border-radius: 4px; font-size: 0.8rem; }\n")
	sb.WriteString("    .control-input-row input[type=\"checkbox\"] { width: 16px; height: 16px; accent-color: #58a6ff; cursor: pointer; }\n")
	sb.WriteString("    .param-desc { font-size: 0.72rem; color: #7d8590; }\n")
	sb.WriteString("    .events-harness { padding: 10px 16px; background: #0f1623; border-bottom: 1px solid #30363d; display: flex; flex-direction: column; gap: 6px; }\n")
	sb.WriteString("    .events-harness-header { display: flex; justify-content: space-between; align-items: center; font-size: 0.73rem; color: #79c0ff; font-weight: 600; }\n")
	sb.WriteString("    .events-harness-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }\n")
	sb.WriteString("    .events-harness-row select { padding: 3px 6px; background: #0d1117; color: #e6edf3; border: 1px solid #388bfd; border-radius: 4px; font-size: 0.73rem; }\n")
	sb.WriteString("    .event-log-badge { font-family: ui-monospace, monospace; font-size: 0.7rem; color: #7ee787; background: rgba(63, 185, 80, 0.12); border: 1px solid rgba(63, 185, 80, 0.35); padding: 2px 7px; border-radius: 4px; }\n")
	sb.WriteString("    .footer-section { max-width: 1380px; margin: 30px auto 0 auto; padding-top: 20px; border-top: 1px solid #30363d; font-size: 0.8rem; color: #8b949e; display: flex; justify-content: space-between; align-items: center; }\n")
	sb.WriteString("  </style>\n")
	sb.WriteString("  <script src=\"js/svg-widget.js\"></script>\n")
	sb.WriteString("</head>\n<body>\n\n")

	sb.WriteString("  <header>\n")
	sb.WriteString("    <div class=\"header-title\">\n")
	sb.WriteString(fmt.Sprintf("      <h1>📦 %s <span class=\"badge\">Stage 16B No-Code Studio</span></h1>\n", escapeHTML(widgetName)))
	sb.WriteString("      <p>Operate independent instances with real-time controls — zero code required.</p>\n")
	sb.WriteString("    </div>\n")
	sb.WriteString("    <div>\n")
	sb.WriteString(fmt.Sprintf("      <a href=\"%s-properties.md\" class=\"btn\" target=\"_blank\">📋 View Properties Guide</a>\n", cleanBase))
	sb.WriteString("    </div>\n")
	sb.WriteString("  </header>\n\n")

	sb.WriteString("  <main class=\"grid-container\">\n")

	// Pre-create 3 instance cards
	instances := []struct {
		ID    string
		Label string
		Desc  string
	}{
		{ID: "unit-a", Label: "Instance 1 (Unit A / Primary)", Desc: "Operating in standard operational mode"},
		{ID: "unit-b", Label: "Instance 2 (Unit B / Warning)", Desc: "Simulating caution / transitional state"},
		{ID: "unit-c", Label: "Instance 3 (Unit C / Standby)", Desc: "Simulating maintenance / auxiliary state"},
	}

	for _, inst := range instances {
		sb.WriteString("    <div class=\"instance-card\">\n")
		sb.WriteString("      <div class=\"card-header\">\n")
		sb.WriteString(fmt.Sprintf("        <h2>%s</h2>\n", inst.Label))
		sb.WriteString(fmt.Sprintf("        <span class=\"badge\" id=\"badge-%s\">ID: %s</span>\n", inst.ID, inst.ID))
		sb.WriteString("      </div>\n")
		sb.WriteString(fmt.Sprintf("      <div class=\"stage-wrapper\" id=\"container-%s\" tabindex=\"0\" title=\"Interact with this widget using mouse hover, click, press, wheel, or keyboard focus\"></div>\n", inst.ID))
		sb.WriteString("      <div class=\"transport-bar\">\n")
		sb.WriteString(fmt.Sprintf("        <button class=\"btn\" id=\"btn-play-%s\" title=\"Play animation\">▶ Play</button>\n", inst.ID))
		sb.WriteString(fmt.Sprintf("        <button class=\"btn\" id=\"btn-pause-%s\" title=\"Pause animation\">⏸ Pause</button>\n", inst.ID))
		sb.WriteString(fmt.Sprintf("        <button class=\"btn btn-reset\" id=\"btn-reset-%s\" title=\"Reset to defaults\">↺ Reset Defaults</button>\n", inst.ID))
		sb.WriteString("      </div>\n")
		sb.WriteString("      <div class=\"events-harness\">\n")
		sb.WriteString("        <div class=\"events-harness-header\">\n")
		sb.WriteString("          <span>🖱️ Common Browser Events Harness</span>\n")
		sb.WriteString(fmt.Sprintf("          <span class=\"event-log-badge\" id=\"evt-log-%s\">Last Event: idle</span>\n", inst.ID))
		sb.WriteString("        </div>\n")
		sb.WriteString("        <div class=\"events-harness-row\">\n")
		sb.WriteString("          <span style=\"font-size:0.72rem;color:#8b949e;\">Bind Stage Events to:</span>\n")
		sb.WriteString(fmt.Sprintf("          <select id=\"evt-param-%s\" title=\"Choose which exposed parameter responds to browser events on the stage above\"></select>\n", inst.ID))
		sb.WriteString(fmt.Sprintf("          <select id=\"evt-mode-%s\" title=\"Choose which browser event pattern drives the selected parameter\">\n", inst.ID))
		sb.WriteString("            <option value=\"hover\">Hover (mouseenter / mouseleave)</option>\n")
		sb.WriteString("            <option value=\"click\">Click Toggle (click)</option>\n")
		sb.WriteString("            <option value=\"press\">Press &amp; Hold (pointerdown / pointerup)</option>\n")
		sb.WriteString("            <option value=\"focus\">Focus &amp; Keypress (focus / blur / Space / Enter)</option>\n")
		sb.WriteString("            <option value=\"dblclick\">Double-Click Toggle (dblclick)</option>\n")
		sb.WriteString("            <option value=\"wheel\">Mouse Wheel Scrub (wheel)</option>\n")
		sb.WriteString("            <option value=\"pointermove\">Pointer X Scrub (pointermove)</option>\n")
		sb.WriteString("          </select>\n")
		sb.WriteString("        </div>\n")
		sb.WriteString("      </div>\n")
		sb.WriteString(fmt.Sprintf("      <div class=\"controls-deck\" id=\"controls-%s\"></div>\n", inst.ID))
		sb.WriteString("    </div>\n")
	}

	sb.WriteString("  </main>\n\n")

	sb.WriteString("  <div class=\"footer-section\">\n")
	sb.WriteString(fmt.Sprintf("    <span>Asset: <code>%s</code> (Universal Stage 16B Runtime)</span>\n", svgFilename))
	sb.WriteString("    <span>SVG Animator Studio v1.2.0 • Standalone No-Code Package</span>\n")
	sb.WriteString("  </div>\n\n")

	// Embed self-contained Base64 SVG payload if supplied, enabling instant file:// offline operation
	var b64Payload string
	if len(rawSVG) > 0 && strings.TrimSpace(rawSVG[0]) != "" {
		b64Payload = base64.StdEncoding.EncodeToString([]byte(rawSVG[0]))
	}
	if b64Payload != "" {
		sb.WriteString("  <!-- Embedded self-contained offline SVG payload enables direct file:// double-click operation without an HTTP server -->\n")
		sb.WriteString(fmt.Sprintf("  <script id=\"embedded-widget-svg\" type=\"application/base64\">%s</script>\n\n", b64Payload))
	}

	// Embedded runtime wiring script
	sb.WriteString("  <script>\n")
	sb.WriteString(fmt.Sprintf("    const SVG_FILE = '%s';\n", svgFilename))
	sb.WriteString(fmt.Sprintf("    const MANIFEST = %s;\n\n", manifestJson))
	sb.WriteString("    const instances = {};\n")
	sb.WriteString("    window.instances = instances;\n\n")

	sb.WriteString("    function getRawSvg() {\n")
	sb.WriteString("      const embeddedScript = document.getElementById('embedded-widget-svg');\n")
	sb.WriteString("      if (embeddedScript && embeddedScript.textContent.trim()) {\n")
	sb.WriteString("        try {\n")
	sb.WriteString("          const binaryStr = atob(embeddedScript.textContent.trim());\n")
	sb.WriteString("          const bytes = new Uint8Array(binaryStr.length);\n")
	sb.WriteString("          for (let i = 0; i < binaryStr.length; i++) {\n")
	sb.WriteString("            bytes[i] = binaryStr.charCodeAt(i);\n")
	sb.WriteString("          }\n")
	sb.WriteString("          return new TextDecoder('utf-8').decode(bytes);\n")
	sb.WriteString("        } catch (e) {\n")
	sb.WriteString("          console.warn('[demo] Base64 decode failed, falling back to fetch:', e);\n")
	sb.WriteString("        }\n")
	sb.WriteString("      }\n")
	sb.WriteString("      return null;\n")
	sb.WriteString("    }\n\n")

	sb.WriteString("    function init() {\n")
	sb.WriteString("      const rawSvg = getRawSvg();\n")
	sb.WriteString("      if (rawSvg) {\n")
	sb.WriteString("        mountAll(rawSvg);\n")
	sb.WriteString("        return;\n")
	sb.WriteString("      }\n")
	sb.WriteString("      fetch(SVG_FILE)\n")
	sb.WriteString("        .then(resp => {\n")
	sb.WriteString("          if (!resp.ok) throw new Error('HTTP ' + resp.status);\n")
	sb.WriteString("          return resp.text();\n")
	sb.WriteString("        })\n")
	sb.WriteString("        .then(mountAll)\n")
	sb.WriteString("        .catch(err => {\n")
	sb.WriteString("          document.body.innerHTML = '<div style=\"color:#f85149;padding:40px;text-align:center;\"><h2>Failed to load SVG asset</h2><p>' + SVG_FILE + ' (' + err.message + ')</p><p style=\"color:#8b949e;font-size:0.85rem;margin-top:8px;\">Keep demo.html in the same directory as ' + SVG_FILE + '.</p></div>';\n")
	sb.WriteString("        });\n")
	sb.WriteString("    }\n\n")

	sb.WriteString("    function mountAll(rawSvg) {\n")
	sb.WriteString("      ['unit-a', 'unit-b', 'unit-c'].forEach((instId, idx) => {\n")
	sb.WriteString("        const container = document.getElementById('container-' + instId);\n")
	sb.WriteString("        const controlsDeck = document.getElementById('controls-' + instId);\n\n")
	sb.WriteString("        const widget = SVGWidget.mount(container, rawSvg, {\n")
	sb.WriteString("          instanceId: instId,\n")
	sb.WriteString("          scopeCss: true\n")
	sb.WriteString("        });\n")
	sb.WriteString("        instances[instId] = widget;\n\n")

	sb.WriteString("        // Transport Controls\n")
	sb.WriteString("        document.getElementById('btn-play-' + instId)?.addEventListener('click', () => widget.play());\n")
	sb.WriteString("        document.getElementById('btn-pause-' + instId)?.addEventListener('click', () => widget.pause());\n")
	sb.WriteString("        document.getElementById('btn-reset-' + instId)?.addEventListener('click', () => {\n")
	sb.WriteString("          widget.resetParameters();\n")
	sb.WriteString("          syncControls(instId);\n")
	sb.WriteString("        });\n\n")

	sb.WriteString("        // Build Controls from Manifest\n")
	sb.WriteString("        const params = (widget.manifest && widget.manifest.parameters) || (MANIFEST.parameters) || [];\n")
	sb.WriteString("        const evtParamSel = document.getElementById('evt-param-' + instId);\n")
	sb.WriteString("        const evtModeSel = document.getElementById('evt-mode-' + instId);\n")
	sb.WriteString("        const evtLogEl = document.getElementById('evt-log-' + instId);\n")
	sb.WriteString("        if (evtParamSel) {\n")
	sb.WriteString("          const defaultOpt = document.createElement('option');\n")
	sb.WriteString("          defaultOpt.value = '__transport__';\n")
	sb.WriteString("          defaultOpt.textContent = 'Widget Play / Pause (Transport)';\n")
	sb.WriteString("          params.forEach((p) => {\n")
	sb.WriteString("            const o = document.createElement('option');\n")
	sb.WriteString("            o.value = p.name;\n")
	sb.WriteString("            o.textContent = p.name + ' (' + p.type + ')';\n")
	sb.WriteString("            if (p.eventTrigger && evtModeSel) evtModeSel.value = p.eventTrigger;\n")
	sb.WriteString("            evtParamSel.appendChild(o);\n")
	sb.WriteString("          });\n")
	sb.WriteString("          evtParamSel.appendChild(defaultOpt);\n")
	sb.WriteString("          if (idx === 1 && evtModeSel) evtModeSel.value = 'click';\n")
	sb.WriteString("          if (idx === 2 && evtModeSel) evtModeSel.value = 'press';\n")
	sb.WriteString("        }\n\n")
	sb.WriteString("        const fireBrowserEventAction = (evName, phase, evObj) => {\n")
	sb.WriteString("          const pName = evtParamSel ? evtParamSel.value : '__transport__';\n")
	sb.WriteString("          if (!pName || pName === '__transport__') {\n")
	sb.WriteString("            if (phase === 'active') widget.play();\n")
	sb.WriteString("            else if (phase === 'inactive') widget.pause();\n")
	sb.WriteString("            else if (phase === 'toggle') { if (widget.isPaused()) widget.play(); else widget.pause(); }\n")
	sb.WriteString("            if (evtLogEl) evtLogEl.textContent = evName + ' -> ' + (widget.isPaused() ? 'paused' : 'playing');\n")
	sb.WriteString("            return;\n")
	sb.WriteString("          }\n")
	sb.WriteString("          const pDef = params.find((item) => item.name === pName);\n")
	sb.WriteString("          if (!pDef) return;\n")
	sb.WriteString("          let nextVal = widget.getParameter(pName);\n")
	sb.WriteString("          if (pDef.type === 'boolean') {\n")
	sb.WriteString("            nextVal = (phase === 'toggle') ? !Boolean(nextVal) : (phase === 'active');\n")
	sb.WriteString("          } else if (pDef.type === 'enum' && Array.isArray(pDef.options) && pDef.options.length > 0) {\n")
	sb.WriteString("            if (phase === 'active') nextVal = pDef.options[Math.min(1, pDef.options.length - 1)];\n")
	sb.WriteString("            else if (phase === 'inactive') nextVal = pDef.options[0];\n")
	sb.WriteString("            else {\n")
	sb.WriteString("              const curIdx = pDef.options.indexOf(String(nextVal));\n")
	sb.WriteString("              nextVal = pDef.options[(curIdx + 1) % pDef.options.length];\n")
	sb.WriteString("            }\n")
	sb.WriteString("          } else if (pDef.type === 'number' || pDef.type === 'speed') {\n")
	sb.WriteString("            const minV = (pDef.min !== undefined) ? Number(pDef.min) : 0;\n")
	sb.WriteString("            const maxV = (pDef.max !== undefined) ? Number(pDef.max) : 100;\n")
	sb.WriteString("            if (phase === 'wheel' && evObj) {\n")
	sb.WriteString("              const step = (pDef.step !== undefined) ? Number(pDef.step) : ((maxV - minV) / 20);\n")
	sb.WriteString("              const dir = evObj.deltaY < 0 ? 1 : -1;\n")
	sb.WriteString("              nextVal = Math.max(minV, Math.min(maxV, Number((Number(nextVal || minV) + dir * step).toFixed(2))));\n")
	sb.WriteString("            } else if (phase === 'scrub' && evObj && container) {\n")
	sb.WriteString("              const rect = container.getBoundingClientRect();\n")
	sb.WriteString("              const ratio = Math.max(0, Math.min(1, (evObj.clientX - rect.left) / Math.max(1, rect.width)));\n")
	sb.WriteString("              nextVal = Number((minV + ratio * (maxV - minV)).toFixed(1));\n")
	sb.WriteString("            } else {\n")
	sb.WriteString("              nextVal = (phase === 'active') ? maxV : (phase === 'inactive' ? minV : (Number(nextVal) > (minV + maxV) / 2 ? minV : maxV));\n")
	sb.WriteString("            }\n")
	sb.WriteString("          } else if (pDef.type === 'color') {\n")
	sb.WriteString("            nextVal = (phase === 'active') ? '#38bdf8' : (phase === 'inactive' ? (pDef.default || '#22c55e') : (nextVal === '#38bdf8' ? '#22c55e' : '#38bdf8'));\n")
	sb.WriteString("          } else {\n")
	sb.WriteString("            nextVal = (phase === 'active') ? (evName.toUpperCase() + ' ACTIVE') : (pDef.default || 'READY');\n")
	sb.WriteString("          }\n")
	sb.WriteString("          try {\n")
	sb.WriteString("            widget.setParameter(pName, nextVal);\n")
	sb.WriteString("            syncControls(instId);\n")
	sb.WriteString("            if (evtLogEl) evtLogEl.textContent = evName + ' -> ' + pName + '=' + nextVal;\n")
	sb.WriteString("          } catch (e) {}\n")
	sb.WriteString("        };\n\n")
	sb.WriteString("        if (container) {\n")
	sb.WriteString("          container.addEventListener('mouseenter', (ev) => { if (evtModeSel?.value === 'hover') fireBrowserEventAction('mouseenter', 'active', ev); });\n")
	sb.WriteString("          container.addEventListener('mouseleave', (ev) => { if (evtModeSel?.value === 'hover') fireBrowserEventAction('mouseleave', 'inactive', ev); });\n")
	sb.WriteString("          container.addEventListener('click', (ev) => { if (evtModeSel?.value === 'click') fireBrowserEventAction('click', 'toggle', ev); });\n")
	sb.WriteString("          container.addEventListener('dblclick', (ev) => { if (evtModeSel?.value === 'dblclick') fireBrowserEventAction('dblclick', 'toggle', ev); });\n")
	sb.WriteString("          container.addEventListener('pointerdown', (ev) => { if (evtModeSel?.value === 'press') fireBrowserEventAction('pointerdown', 'active', ev); });\n")
	sb.WriteString("          container.addEventListener('pointerup', (ev) => { if (evtModeSel?.value === 'press') fireBrowserEventAction('pointerup', 'inactive', ev); });\n")
	sb.WriteString("          container.addEventListener('pointerleave', (ev) => { if (evtModeSel?.value === 'press') fireBrowserEventAction('pointerleave', 'inactive', ev); });\n")
	sb.WriteString("          container.addEventListener('focus', (ev) => { if (evtModeSel?.value === 'focus') fireBrowserEventAction('focus', 'active', ev); });\n")
	sb.WriteString("          container.addEventListener('blur', (ev) => { if (evtModeSel?.value === 'focus') fireBrowserEventAction('blur', 'inactive', ev); });\n")
	sb.WriteString("          container.addEventListener('keydown', (ev) => {\n")
	sb.WriteString("            if (evtModeSel?.value === 'focus' && (ev.key === ' ' || ev.key === 'Enter')) {\n")
	sb.WriteString("              ev.preventDefault();\n")
	sb.WriteString("              fireBrowserEventAction('keydown(' + (ev.key === ' ' ? 'Space' : 'Enter') + ')', 'toggle', ev);\n")
	sb.WriteString("            }\n")
	sb.WriteString("          });\n")
	sb.WriteString("          container.addEventListener('wheel', (ev) => {\n")
	sb.WriteString("            if (evtModeSel?.value === 'wheel') {\n")
	sb.WriteString("              ev.preventDefault();\n")
	sb.WriteString("              fireBrowserEventAction('wheel', 'wheel', ev);\n")
	sb.WriteString("            }\n")
	sb.WriteString("          }, { passive: false });\n")
	sb.WriteString("          container.addEventListener('pointermove', (ev) => {\n")
	sb.WriteString("            if (evtModeSel?.value === 'pointermove') fireBrowserEventAction('pointermove', 'scrub', ev);\n")
	sb.WriteString("          });\n")
	sb.WriteString("        }\n")
	sb.WriteString("        widget.on('change', () => syncControls(instId));\n")
	sb.WriteString("        if (params.length === 0) {\n")
	sb.WriteString("          const emptyMsg = document.createElement('div');\n")
	sb.WriteString("          emptyMsg.style.cssText = 'color:#8b949e;font-size:0.75rem;text-align:center;padding:12px;background:#0d1117;border-radius:6px;border:1px dashed #30363d;margin-top:8px;';\n")
	sb.WriteString("          emptyMsg.innerHTML = '<span style=\"color:#58a6ff;font-weight:600;\">Standard Playback Mode</span><br><span style=\"color:#7d8590;font-size:0.7rem;\">Widget running with authored scene defaults. Use transport controls above to test multi-instance animation.</span>';\n")
	sb.WriteString("          controlsDeck.appendChild(emptyMsg);\n")
	sb.WriteString("        } else {\n")
	sb.WriteString("          params.forEach((p) => {\n")
	sb.WriteString("          const item = document.createElement('div');\n")
	sb.WriteString("          item.className = 'control-item';\n\n")
	sb.WriteString("          const labelRow = document.createElement('div');\n")
	sb.WriteString("          labelRow.className = 'control-label-row';\n")
	sb.WriteString("          labelRow.innerHTML = '<span class=\"param-name\">' + p.name + '</span><span class=\"param-val\" id=\"val-' + instId + '-' + p.name + '\">' + (widget.getParameter(p.name) ?? p.default) + '</span>';\n")
	sb.WriteString("          item.appendChild(labelRow);\n\n")

	sb.WriteString("          const inputRow = document.createElement('div');\n")
	sb.WriteString("          inputRow.className = 'control-input-row';\n\n")
	sb.WriteString("          const curVal = widget.getParameter(p.name) ?? p.default;\n")
	sb.WriteString("          if (p.type === 'color') {\n")
	sb.WriteString("            const inp = document.createElement('input');\n")
	sb.WriteString("            inp.id = 'inp-' + instId + '-' + p.name;\n")
	sb.WriteString("            inp.type = 'color';\n")
	sb.WriteString("            inp.value = curVal;\n")
	sb.WriteString("            inp.addEventListener('input', (e) => {\n")
	sb.WriteString("              widget.setParameter(p.name, e.target.value);\n")
	sb.WriteString("              document.getElementById('val-' + instId + '-' + p.name).textContent = e.target.value;\n")
	sb.WriteString("            });\n")
	sb.WriteString("            inputRow.appendChild(inp);\n")
	sb.WriteString("          } else if (p.type === 'number' || p.type === 'speed') {\n")
	sb.WriteString("            const inp = document.createElement('input');\n")
	sb.WriteString("            inp.id = 'inp-' + instId + '-' + p.name;\n")
	sb.WriteString("            inp.type = 'range';\n")
	sb.WriteString("            inp.min = (p.min !== undefined) ? p.min : 0;\n")
	sb.WriteString("            inp.max = (p.max !== undefined) ? p.max : 100;\n")
	sb.WriteString("            const rangeSpan = Number(inp.max) - Number(inp.min);\n")
	sb.WriteString("            inp.step = (p.step !== undefined) ? p.step : (p.type === 'speed' ? 0.1 : (rangeSpan <= 2 ? 0.01 : (rangeSpan <= 10 ? 0.05 : 1)));\n")
	sb.WriteString("            inp.value = curVal;\n")
	sb.WriteString("            inp.addEventListener('input', (e) => {\n")
	sb.WriteString("              const num = parseFloat(e.target.value);\n")
	sb.WriteString("              widget.setParameter(p.name, num);\n")
	sb.WriteString("              document.getElementById('val-' + instId + '-' + p.name).textContent = num + (p.unit ? ' ' + p.unit : '');\n")
	sb.WriteString("            });\n")
	sb.WriteString("            inputRow.appendChild(inp);\n")
	sb.WriteString("          } else if (p.type === 'boolean') {\n")
	sb.WriteString("            const inp = document.createElement('input');\n")
	sb.WriteString("            inp.id = 'inp-' + instId + '-' + p.name;\n")
	sb.WriteString("            inp.type = 'checkbox';\n")
	sb.WriteString("            inp.checked = Boolean(curVal);\n")
	sb.WriteString("            inp.addEventListener('change', (e) => {\n")
	sb.WriteString("              widget.setParameter(p.name, e.target.checked);\n")
	sb.WriteString("              document.getElementById('val-' + instId + '-' + p.name).textContent = e.target.checked;\n")
	sb.WriteString("            });\n")
	sb.WriteString("            inputRow.appendChild(inp);\n")
	sb.WriteString("          } else if (p.type === 'enum' && Array.isArray(p.options)) {\n")
	sb.WriteString("            const sel = document.createElement('select');\n")
	sb.WriteString("            sel.id = 'inp-' + instId + '-' + p.name;\n")
	sb.WriteString("            p.options.forEach((opt) => {\n")
	sb.WriteString("              const o = document.createElement('option');\n")
	sb.WriteString("              o.value = opt; o.textContent = opt;\n")
	sb.WriteString("              if (opt === curVal) o.selected = true;\n")
	sb.WriteString("              sel.appendChild(o);\n")
	sb.WriteString("            });\n")
	sb.WriteString("            sel.addEventListener('change', (e) => {\n")
	sb.WriteString("              widget.setParameter(p.name, e.target.value);\n")
	sb.WriteString("              document.getElementById('val-' + instId + '-' + p.name).textContent = e.target.value;\n")
	sb.WriteString("            });\n")
	sb.WriteString("            inputRow.appendChild(sel);\n")
	sb.WriteString("          } else {\n")
	sb.WriteString("            const inp = document.createElement('input');\n")
	sb.WriteString("            inp.id = 'inp-' + instId + '-' + p.name;\n")
	sb.WriteString("            inp.type = 'text';\n")
	sb.WriteString("            inp.value = curVal;\n")
	sb.WriteString("            inp.addEventListener('input', (e) => {\n")
	sb.WriteString("              widget.setParameter(p.name, e.target.value);\n")
	sb.WriteString("              document.getElementById('val-' + instId + '-' + p.name).textContent = e.target.value;\n")
	sb.WriteString("            });\n")
	sb.WriteString("            inputRow.appendChild(inp);\n")
	sb.WriteString("          }\n\n")

	sb.WriteString("          item.appendChild(inputRow);\n")
	sb.WriteString("          if (p.description) {\n")
	sb.WriteString("            const desc = document.createElement('div');\n")
	sb.WriteString("            desc.className = 'param-desc';\n")
	sb.WriteString("            desc.textContent = p.description;\n")
	sb.WriteString("            item.appendChild(desc);\n")
	sb.WriteString("          }\n")
	sb.WriteString("          controlsDeck.appendChild(item);\n")
	sb.WriteString("        });\n")
	sb.WriteString("      }\n")
	sb.WriteString("      });\n")
	sb.WriteString("    }\n\n")

	sb.WriteString("    function syncControls(instId) {\n")
	sb.WriteString("      const widget = instances[instId];\n")
	sb.WriteString("      if (!widget) return;\n")
	sb.WriteString("      const params = (widget.manifest && widget.manifest.parameters) || (MANIFEST.parameters) || [];\n")
	sb.WriteString("      params.forEach((p) => {\n")
	sb.WriteString("        const val = widget.getParameter(p.name);\n")
	sb.WriteString("        const el = document.getElementById('val-' + instId + '-' + p.name);\n")
	sb.WriteString("        if (el) el.textContent = val + (p.unit ? ' ' + p.unit : '');\n")
	sb.WriteString("        const inp = document.getElementById('inp-' + instId + '-' + p.name);\n")
	sb.WriteString("        if (inp) {\n")
	sb.WriteString("          if (p.type === 'boolean') inp.checked = Boolean(val);\n")
	sb.WriteString("          else inp.value = String(val);\n")
	sb.WriteString("        }\n")
	sb.WriteString("      });\n")
	sb.WriteString("    }\n\n")

	sb.WriteString("    if (document.readyState === 'loading') {\n")
	sb.WriteString("      window.addEventListener('DOMContentLoaded', init);\n")
	sb.WriteString("    } else {\n")
	sb.WriteString("      init();\n")
	sb.WriteString("    }\n")
	sb.WriteString("  </script>\n")
	sb.WriteString("</body>\n</html>\n")

	return sb.String()
}

// BuildWidgetPackageZip assembles the complete portable widget package ZIP in memory using the default 2x HiDPI raster policy.
func BuildWidgetPackageZip(sc *Scene, widgetName, rawSVG, svgWidgetJS string) ([]byte, error) {
	return BuildWidgetPackageZipWithOptions(sc, widgetName, rawSVG, svgWidgetJS, "2x")
}

// BuildWidgetPackageZipWithOptions assembles the complete portable widget package ZIP in memory with a configurable raster optimisation policy ("1x", "2x", "3x", "original").
func BuildWidgetPackageZipWithOptions(sc *Scene, widgetName, rawSVG, svgWidgetJS, rasterPolicy string) ([]byte, error) {
	if widgetName == "" {
		widgetName = "widget"
	}
	if strings.TrimSpace(rasterPolicy) == "" {
		rasterPolicy = "2x"
	}
	cleanBase := cleanWidgetSlug(widgetName)
	svgFilename := cleanBase + ".svg"
	guideFilename := cleanBase + "-properties.md"

	// 1. Check for duplicate/conflicting parameter bindings
	if sc != nil {
		conflicts := sc.DetectParameterConflicts()
		if len(conflicts) > 0 {
			var details []string
			for _, c := range conflicts {
				var names []string
				for _, p := range c.Parameters {
					names = append(names, p.Name)
				}
				details = append(details, fmt.Sprintf("%s.%s (%s)", c.Target, c.Property, strings.Join(names, ", ")))
			}
			return nil, fmt.Errorf("cannot export widget package with conflicting parameter bindings: %s. Please resolve duplicate bindings before exporting.", strings.Join(details, "; "))
		}
	}

	// 2. Extract validated manifest from Scene (or fallback to embedded in rawSVG)
	var manifest *WidgetManifest
	if sc != nil {
		sc.SyncParameterNamesWithObjectNames()
		params := sc.GetParameters()
		if len(params) > 0 {
			manifest = &WidgetManifest{
				SchemaVersion:     1,
				MinRuntimeVersion: "1.2.0",
				Parameters:        params,
			}
		}
	}
	if manifest == nil && strings.TrimSpace(rawSVG) != "" {
		manifest = ExtractWidgetManifest(rawSVG)
		if manifest != nil && sc != nil && len(sc.GetParameters()) == 0 {
			for _, p := range manifest.Parameters {
				_ = sc.AddParameter(p)
			}
		}
	}
	if manifest == nil {
		manifest = &WidgetManifest{
			SchemaVersion:     1,
			MinRuntimeVersion: "1.2.0",
			Parameters:        []WidgetParameter{},
		}
	}
	if sc != nil {
		// Attach component metadata if the scene represents or contains a single root component
		comps := sc.GetAllComposites()
		if len(comps) > 0 {
			var matched *CompositeDef
			for i := range comps {
				if strings.EqualFold(cleanWidgetSlug(comps[i].Name), cleanBase) {
					matched = &comps[i]
					break
				}
			}
			if matched == nil && len(comps) == 1 {
				matched = &comps[0]
			}
			if matched != nil {
				if matched.ComponentID != "" {
					manifest.ComponentID = matched.ComponentID
				}
				if matched.Version != "" {
					manifest.PackageVersion = NormalizeSemVer(matched.Version)
				}
				if matched.Description != "" {
					manifest.Description = matched.Description
				}
				if matched.Category != "" {
					manifest.Category = matched.Category
				}
				if len(matched.Tags) > 0 {
					manifest.Tags = append([]string(nil), matched.Tags...)
				}
			}
		}
	}
	if manifest.Parameters == nil {
		manifest.Parameters = []WidgetParameter{}
	}
	if manifest.WidgetName == "" {
		manifest.WidgetName = cleanBase
	}
	if manifest.PackageVersion == "" {
		manifest.PackageVersion = "1.0.0"
	}
	if manifest.MinRuntimeVersion == "" {
		manifest.MinRuntimeVersion = "1.2.0"
	}
	// Keep packageId stable across revisions (slug or componentId) and store per-export digest in contentHash
	if manifest.PackageId == "" {
		manifest.PackageId = cleanBase
	}
	if manifest.ComponentID == "" {
		manifest.ComponentID = "cmp-" + cleanBase
	}
	paramJson, _ := json.Marshal(manifest.Parameters)
	h := sha256.Sum256([]byte(cleanBase + "|" + manifest.PackageVersion + "|" + rawSVG + "|" + string(paramJson)))
	manifest.ContentHash = fmt.Sprintf("%x", h)

	// 2b. Isolate rawSVG so all internal IDs are namespaced, executable scripts stripped, and manifest is embedded in exact sync
	isolatedSVG := rawSVG
	if strings.TrimSpace(rawSVG) != "" {
		iso, _, err := IsolateSVGWidget(rawSVG, WidgetIsolationOptions{
			InstanceID:   cleanBase,
			ScopeCSS:     true,
			RasterPolicy: rasterPolicy,
			Manifest:     manifest,
		})
		if err == nil && iso != "" {
			isolatedSVG = iso
		}
	}

	// 3. Pre-export validation
	if err := ValidateWidgetExport(manifest, isolatedSVG, sc); err != nil {
		return nil, err
	}

	// 4. Generate documentation and inspection copies (embedding isolatedSVG into demo.html for direct offline file:// operation)
	guideMarkdown := GenerateWidgetPropertiesGuide(sc, widgetName, svgFilename, manifest)
	readmeMarkdown := GenerateWidgetReadme(widgetName, svgFilename, manifest)
	demoHTML := GenerateWidgetDemoHTML(widgetName, svgFilename, manifest, isolatedSVG)

	manifestBytes := []byte("{}\n")
	if mb, err := json.MarshalIndent(manifest, "", "  "); err == nil {
		manifestBytes = append(mb, '\n')
	}

	// Build a clean static preview.svg (strip embedded manifest script for lightweight thumbnail)
	reManifestScript := regexp.MustCompile(`(?is)<script\b[^>]*sva-widget-manifest[^>]*>.*?</script>`)
	previewSVG := strings.TrimSpace(reManifestScript.ReplaceAllString(isolatedSVG, ""))

	// 5. Create deterministic in-memory ZIP (fixed timestamp & order for reproducible SHA-256 digests)
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)
	fixedTime := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	files := []struct {
		Path    string
		Content []byte
	}{
		{Path: path.Join(cleanBase, svgFilename), Content: []byte(isolatedSVG)},
		{Path: path.Join(cleanBase, "widget-manifest.json"), Content: manifestBytes},
		{Path: path.Join(cleanBase, "preview.svg"), Content: []byte(previewSVG)},
		{Path: path.Join(cleanBase, guideFilename), Content: []byte(guideMarkdown)},
		{Path: path.Join(cleanBase, "README.md"), Content: []byte(readmeMarkdown)},
		{Path: path.Join(cleanBase, "demo.html"), Content: []byte(demoHTML)},
		{Path: path.Join(cleanBase, "js", "svg-widget.js"), Content: []byte(svgWidgetJS)},
	}

	for _, f := range files {
		hdr := &zip.FileHeader{
			Name:     f.Path,
			Method:   zip.Deflate,
			Modified: fixedTime,
		}
		w, err := zw.CreateHeader(hdr)
		if err != nil {
			return nil, fmt.Errorf("creating zip entry %s: %w", f.Path, err)
		}
		if _, err := w.Write(f.Content); err != nil {
			return nil, fmt.Errorf("writing zip entry %s: %w", f.Path, err)
		}
	}

	if err := zw.Close(); err != nil {
		return nil, fmt.Errorf("closing zip writer: %w", err)
	}

	return buf.Bytes(), nil
}

func cleanWidgetSlug(s string) string {
	reg := regexp.MustCompile(`[^a-zA-Z0-9_-]+`)
	slug := strings.ToLower(reg.ReplaceAllString(s, "-"))
	slug = strings.Trim(slug, "-")
	if slug == "" {
		return "widget"
	}
	return slug
}

func escapeMD(s string) string {
	s = strings.ReplaceAll(s, "|", "\\|")
	return strings.ReplaceAll(s, "\n", " ")
}

func escapeHTML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	return s
}
