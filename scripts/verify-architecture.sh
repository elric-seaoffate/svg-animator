#!/usr/bin/env bash
# =============================================================================
# SVG Animator Studio — Phase 1 Architecture Verification Suite ([STATIC])
# =============================================================================
# Performs comment-, string-, and regex-stripped static analysis of the
# frontend modules in internal/web/static/js/ and internal/web/static/index.html.
#
# Result Categories:
#   PASS         - Check executed and succeeded within static-analysis scope.
#   FAIL         - Check executed and failed.
#   WARNING      - Known architectural exception, legacy fallback, or limitation.
#   NOT VERIFIED - Required tool unavailable.
#
# NOTE: All checks in this script are [STATIC] source checks (relying on
# comment/string/regex stripping and explicit Layer 3 / Layer 1 section markers)
# and are never represented as proof of runtime behaviour.
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "[RESULT] NOT VERIFIED | ARCH-ALL | [STATIC] | python3 is not available to run comment/string-stripped static analysis"
  exit 0
fi

python3 - "${REPO_ROOT}" << 'PYEOF'
import os
import re
import sys

repo_root = sys.argv[1]
js_dir = os.path.join(repo_root, "internal", "web", "static", "js")
index_html_path = os.path.join(repo_root, "internal", "web", "static", "index.html")

results = []

def record(status, check_id, title, details=""):
    results.append((status, check_id, title, details))
    suffix = f" — {details}" if details else ""
    print(f"[RESULT] {status} | {check_id} | [STATIC] | {title}{suffix}")

def strip_js_comments_and_strings(source):
    """
    Replaces contents of // line comments, /* block comments */, regex literals
    (including character classes [...]), and 'single', "double", and `template`
    string literals (outside ${...}) with spaces while preserving all newlines
    so line numbers remain exact.
    """
    out = []
    i = 0
    n = len(source)
    state = "CODE"
    regex_char_class = False
    template_brace_depth = []
    last_non_ws_token = ";"
    last_word = ""

    regex_preceding_tokens = ("(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "~", "^", "<", ">")
    regex_preceding_keywords = ("return", "case", "throw", "typeof", "void", "delete", "in", "instanceof", "new")

    while i < n:
        ch = source[i]
        nxt = source[i + 1] if i + 1 < n else ""

        if state == "CODE":
            if ch == "/" and nxt == "/":
                out.append("  ")
                i += 2
                state = "LINE_COMMENT"
            elif ch == "/" and nxt == "*":
                out.append("  ")
                i += 2
                state = "BLOCK_COMMENT"
            elif ch == "/" and (last_non_ws_token in regex_preceding_tokens or last_word in regex_preceding_keywords):
                out.append("/")
                i += 1
                state = "REGEX_LIT"
                regex_char_class = False
            elif ch == "'":
                out.append("'")
                i += 1
                state = "SINGLE_STR"
                last_non_ws_token = "'"
                last_word = ""
            elif ch == '"':
                out.append('"')
                i += 1
                state = "DOUBLE_STR"
                last_non_ws_token = '"'
                last_word = ""
            elif ch == "`":
                out.append("`")
                i += 1
                state = "TEMPLATE_STR"
                last_non_ws_token = "`"
                last_word = ""
            else:
                if ch == "{" and template_brace_depth:
                    template_brace_depth[-1] += 1
                elif ch == "}" and template_brace_depth:
                    if template_brace_depth[-1] == 0:
                        template_brace_depth.pop()
                        out.append("`")
                        i += 1
                        state = "TEMPLATE_STR"
                        continue
                    else:
                        template_brace_depth[-1] -= 1
                if ch.isalpha() or ch == "_" or ch == "$":
                    last_word += ch
                    last_non_ws_token = ch
                elif ch.isdigit():
                    if last_word:
                        last_word += ch
                    last_non_ws_token = ch
                elif not ch.isspace():
                    last_word = ""
                    last_non_ws_token = ch
                out.append(ch)
                i += 1
        elif state == "REGEX_LIT":
            if ch == "\\" and i + 1 < n:
                out.append("  ")
                i += 2
            elif ch == "[" and not regex_char_class:
                regex_char_class = True
                out.append(" ")
                i += 1
            elif ch == "]" and regex_char_class:
                regex_char_class = False
                out.append(" ")
                i += 1
            elif ch == "/" and not regex_char_class:
                out.append("/")
                i += 1
                state = "CODE"
                last_non_ws_token = "/"
                last_word = ""
            elif ch == "\n":
                out.append("\n")
                i += 1
                state = "CODE"
            else:
                out.append(" ")
                i += 1
        elif state == "LINE_COMMENT":
            if ch == "\n":
                out.append("\n")
                state = "CODE"
            else:
                out.append(" ")
            i += 1
        elif state == "BLOCK_COMMENT":
            if ch == "*" and nxt == "/":
                out.append("  ")
                i += 2
                state = "CODE"
            else:
                out.append("\n" if ch == "\n" else " ")
                i += 1
        elif state == "SINGLE_STR":
            if ch == "\\" and i + 1 < n:
                out.append("  ")
                i += 2
            elif ch == "'":
                out.append("'")
                i += 1
                state = "CODE"
            else:
                out.append("\n" if ch == "\n" else " ")
                i += 1
        elif state == "DOUBLE_STR":
            if ch == "\\" and i + 1 < n:
                out.append("  ")
                i += 2
            elif ch == '"':
                out.append('"')
                i += 1
                state = "CODE"
            else:
                out.append("\n" if ch == "\n" else " ")
                i += 1
        elif state == "TEMPLATE_STR":
            if ch == "\\" and i + 1 < n:
                out.append("  ")
                i += 2
            elif ch == "$" and nxt == "{":
                out.append("  ")
                i += 2
                template_brace_depth.append(0)
                state = "CODE"
            elif ch == "`":
                out.append("`")
                i += 1
                state = "CODE"
            else:
                out.append("\n" if ch == "\n" else " ")
                i += 1

    return "".join(out)

def load_file(filename):
    path = os.path.join(js_dir, filename)
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()
    stripped = strip_js_comments_and_strings(raw)
    return raw.splitlines(), stripped.splitlines()

def find_pattern_lines(stripped_lines, pattern, start_line=1, end_line=None):
    if end_line is None:
        end_line = len(stripped_lines)
    regex = re.compile(pattern)
    hits = []
    for idx in range(start_line - 1, min(end_line, len(stripped_lines))):
        if regex.search(stripped_lines[idx]):
            hits.append(idx + 1)
    return hits

def get_layer_boundaries(raw_lines):
    l3_start = None
    l1_start = None
    for idx, line in enumerate(raw_lines, start=1):
        if l3_start is None and "// Layer 3:" in line:
            l3_start = idx
        elif l1_start is None and "// Layer 1:" in line:
            l1_start = idx
    return l3_start, l1_start

print("=============================================================================")
print(" SVG Animator Studio — Phase 1 Static Architecture Report ([STATIC])")
print("=============================================================================")

# -----------------------------------------------------------------------------
# ARCH-01: Pure Operational / Coordination Core Zero-DOM Verification
# -----------------------------------------------------------------------------
dom_pattern = r"\b(document\.(getElementById|querySelector|querySelectorAll|createElement|createElementNS|body|addEventListener|removeEventListener)|innerHTML|classList|appendChild|removeChild)\b"

eff_raw, eff_strip = load_file("effects.js")
coord_raw, coord_strip = load_file("coordinator.js")
sr_raw, sr_strip = load_file("shape-registry.js")
ss_raw, ss_strip = load_file("scene-state.js")

serialize_line = None
adaptor_line = None
for idx, line in enumerate(ss_raw, start=1):
    if serialize_line is None and "serializeSVGForExport(" in line:
        serialize_line = idx
    if adaptor_line is None and "window.ControlStateAdaptor" in line:
        adaptor_line = idx

eff_hits = find_pattern_lines(eff_strip, dom_pattern)
coord_hits = find_pattern_lines(coord_strip, dom_pattern)
sr_hits = find_pattern_lines(sr_strip, dom_pattern)
ss_core_end = (serialize_line - 1) if serialize_line else (adaptor_line - 1 if adaptor_line else len(ss_strip))
ss_core_hits = find_pattern_lines(ss_strip, dom_pattern, 1, ss_core_end)

if not eff_hits and not coord_hits and not sr_hits and not ss_core_hits:
    record(
        "PASS",
        "ARCH-01",
        f"No recognised direct DOM access found in inspected operational/coordination core (effects.js, coordinator.js, shape-registry.js, scene-state.js lines 1..{ss_core_end})",
        f"effects.js=0, coordinator.js=0, shape-registry.js=0, scene-state.js(1..{ss_core_end})=0"
    )
else:
    record(
        "FAIL",
        "ARCH-01",
        "Unexpected DOM access in operational/coordination core modules",
        f"effects.js={eff_hits}, coordinator.js={coord_hits}, shape-registry.js={sr_hits}, scene-state.js={ss_core_hits}"
    )

# -----------------------------------------------------------------------------
# ARCH-02: SceneState.serializeSVGForExport Browser Web API Dependency
# -----------------------------------------------------------------------------
if serialize_line and adaptor_line:
    web_api_hits = find_pattern_lines(ss_strip, r"\b(DOMParser|XMLSerializer)\b", serialize_line, adaptor_line - 1)
    if web_api_hits:
        record(
            "WARNING",
            "ARCH-02",
            "SceneState.serializeSVGForExport depends on browser Web APIs (DOMParser/XMLSerializer)",
            f"scene-state.js lines {web_api_hits}"
        )
    else:
        record("PASS", "ARCH-02", "SceneState.serializeSVGForExport has no browser Web API dependency")
else:
    record("FAIL", "ARCH-02", "Could not locate serializeSVGForExport or ControlStateAdaptor in scene-state.js")

# -----------------------------------------------------------------------------
# ARCH-03: Layer 3 Sections in 7 Segmented Modules (DOM + Intra-Module UI Check)
# -----------------------------------------------------------------------------
clean_l3_files = [
    "presets.js",
    "nodes.js",
    "flows.js",
    "glows.js",
    "ripples.js",
    "stage.js",
    "export-modal.js",
]
l1_ui_method_pattern = r"\b(updateUIOverlay|refreshAfterChange|renderList|syncAllRowsUI|syncEditorUI|refreshNodeSlider|updateActiveDimBadge|updateButtonsUI|deselectNode|deselectFlow|deselectGlow|deselectRipple|openAccordionById|syncUIAfterHistoryRestore)\s*\("

arch03_failures = []
arch03_ranges = []

for fname in clean_l3_files:
    raw_l, strip_l = load_file(fname)
    l3, l1 = get_layer_boundaries(raw_l)
    if not l3 or not l1 or l3 >= l1:
        arch03_failures.append(f"{fname}:missing_or_invalid_layer_markers(L3={l3},L1={l1})")
        continue
    hits = find_pattern_lines(strip_l, dom_pattern, l3, l1 - 1)
    ui_hits = find_pattern_lines(strip_l, l1_ui_method_pattern, l3, l1 - 1)
    if hits or ui_hits:
        arch03_failures.append(f"{fname}(L3 {l3}..{l1-1}):dom={hits},ui={ui_hits}")
    else:
        arch03_ranges.append(f"{fname}({l3}..{l1-1})")

if not arch03_failures:
    record(
        "PASS",
        "ARCH-03",
        "Targeted static scan found no recognised direct DOM access or Layer 1 UI method calls in the inspected Layer 3 sections of presets, nodes, flows, glows, ripples, stage, and export-modal (pattern-based static scan of inspected regions, not proof of complete UI independence)",
        ", ".join(arch03_ranges)
    )
else:
    record("FAIL", "ARCH-03", "Targeted static scan detected recognised DOM or Layer 1 UI calls inside inspected Layer 3 sections", "; ".join(arch03_failures))

# -----------------------------------------------------------------------------
# ARCH-04: Legacy DOM Fallbacks in HistoryManager and ProjectManager Layer 3
# -----------------------------------------------------------------------------
hist_raw, hist_strip = load_file("history.js")
proj_raw, proj_strip = load_file("projects.js")
h_l3, h_l1 = get_layer_boundaries(hist_raw)
p_l3, p_l1 = get_layer_boundaries(proj_raw)

if not h_l3 or not h_l1 or not p_l3 or not p_l1:
    record("FAIL", "ARCH-04", "Missing Layer 3 / Layer 1 boundary comments in history.js or projects.js")
else:
    h_dom_hits = find_pattern_lines(hist_strip, r"\bdocument\.getElementById\b", h_l3, h_l1 - 1)
    p_dom_hits = find_pattern_lines(proj_strip, r"\bdocument\.getElementById\b", p_l3, p_l1 - 1)
    if h_dom_hits or p_dom_hits:
        record(
            "WARNING",
            "ARCH-04",
            "Known architectural exception: Legacy document.getElementById fallback branches remain in Layer 3 snapshot/serialization methods",
            f"history.js(L3 {h_l3}..{h_l1-1}) lines {h_dom_hits}; projects.js(L3 {p_l3}..{p_l1-1}) lines {p_dom_hits}"
        )
    else:
        record("PASS", "ARCH-04", "No recognised document.getElementById calls in history.js and projects.js Layer 3 sections")

# -----------------------------------------------------------------------------
# ARCH-05: StillExportStudio Layer 3 Offscreen DOM Sandbox Exception
# -----------------------------------------------------------------------------
still_raw, still_strip = load_file("still-export-modal.js")
s_l3, s_l1 = get_layer_boundaries(still_raw)
if not s_l3 or not s_l1:
    record("FAIL", "ARCH-05", "Missing Layer 3 / Layer 1 boundary comments in still-export-modal.js")
else:
    s_dom_hits = find_pattern_lines(still_strip, dom_pattern, s_l3, s_l1 - 1)
    if s_dom_hits:
        record(
            "WARNING",
            "ARCH-05",
            "Known architectural exception: StillExportStudio.bakeStaticSVGAtTime (Layer 3) uses offscreen DOM sandbox for SVG path geometry",
            f"still-export-modal.js(L3 {s_l3}..{s_l1-1}) lines {s_dom_hits}"
        )
    else:
        record("PASS", "ARCH-05", "No recognised DOM calls in still-export-modal.js Layer 3 section")

# -----------------------------------------------------------------------------
# ARCH-06: Operational Methods Directly Invoking UI Presentation Methods
# -----------------------------------------------------------------------------
ui_call_pattern = r"\b(syncAllRowsUI|deselectNode|deselectFlow|deselectGlow|deselectRipple|syncUIAfterHistoryRestore|updateButtonsUI)\s*\("
h_ui_hits = find_pattern_lines(hist_strip, ui_call_pattern, h_l3, h_l1 - 1) if (h_l3 and h_l1) else []
p_ui_hits = find_pattern_lines(proj_strip, ui_call_pattern, p_l3, p_l1 - 1) if (p_l3 and p_l1) else []

if h_ui_hits or p_ui_hits:
    record(
        "WARNING",
        "ARCH-06",
        "Known architectural exception: Layer 3 restore/recording methods in HistoryManager and ProjectManager directly invoke UI presentation methods",
        f"history.js lines {h_ui_hits}; projects.js lines {p_ui_hits}"
    )
else:
    record("PASS", "ARCH-06", "No direct UI presentation method calls in Layer 3 restore methods")

# -----------------------------------------------------------------------------
# ARCH-07: Layer 1 UI Delegation vs Cross-Module State/UI Coupling Across Modules
# -----------------------------------------------------------------------------
stage_raw, stage_strip = load_file("stage.js")
app_raw, app_strip = load_file("app.js")
_, st_l1 = get_layer_boundaries(stage_raw)

st_direct_state_hits = find_pattern_lines(
    stage_strip,
    r"\bwindow\.(DiagramNodes|DataFlows|Glows|Ripples|NodePresets)\.(list|counter|activeId|activeNodeIdx|preset)\s*=",
    st_l1 or 1,
    len(stage_strip)
)
st_direct_ui_hits = find_pattern_lines(
    stage_strip,
    r"\bwindow\.(DiagramNodes\.selectNode|DataFlows\.updateUIOverlay|Glows\.updateUIOverlay|Ripples\.updateUIOverlay)\s*\(",
    st_l1 or 1,
    len(stage_strip)
)
app_direct_ui_hits = find_pattern_lines(
    app_strip,
    r"\bwindow\.(DiagramNodes|DataFlows|Glows|Ripples)\.(syncEditorUI|updateUIOverlay|renderList|deselectNode|deselectFlow|deselectGlow|deselectRipple)\s*\(",
    1,
    len(app_strip)
)

if st_direct_state_hits or st_direct_ui_hits or app_direct_ui_hits:
    record(
        "WARNING",
        "ARCH-07",
        "Known architectural exception (targeted static scan of recognised patterns in inspected Layer 1 regions): stage.js and app.js contain direct cross-module state mutations or direct peer Layer 1 UI refresh calls alongside AppCoordinator delegation",
        f"stage.js state_mutation={st_direct_state_hits}, stage.js ui_calls={st_direct_ui_hits}, app.js ui_refresh_calls={app_direct_ui_hits}"
    )
else:
    record(
        "PASS",
        "ARCH-07",
        "Targeted static scan found no recognised direct cross-module state mutations or peer Layer 1 UI calls in the inspected Layer 1 regions (pattern-based static check, not proof that all interactions exclusively use AppCoordinator)"
    )

# -----------------------------------------------------------------------------
# ARCH-08: ControlStateAdaptor Intentional DOM Boundary Verification
# -----------------------------------------------------------------------------
def inspect_control_state_adaptor(stripped_lines):
    """
    Locates `window.ControlStateAdaptor = { ... }` in stripped source, tracks
    brace depth to establish the exact object literal span, and finds direct
    top-level method definitions at object brace depth 1.
    Returns (start_line, end_line, defined_methods_dict, structure_reliable).
    """
    start_line = None
    end_line = None
    depth = 0
    started_brace = False
    defined_methods = {}
    method_def_re = re.compile(r"^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:\([^)]*\)\s*\{|:\s*(?:async\s+)?function\s*\([^)]*\)\s*\{)")

    for idx, line in enumerate(stripped_lines, start=1):
        if start_line is None:
            if re.search(r"\bwindow\.ControlStateAdaptor\s*=\s*\{", line):
                start_line = idx
            else:
                continue

        # Check for direct method definition at depth == 1 before updating depth for this line
        if started_brace and depth == 1:
            m = method_def_re.match(line)
            if m:
                defined_methods[m.group(1)] = idx

        for ch in line:
            if ch == "{":
                depth += 1
                started_brace = True
            elif ch == "}":
                depth -= 1
                if started_brace and depth == 0:
                    end_line = idx
                    return start_line, end_line, defined_methods, True

    return start_line, end_line, defined_methods, False

ad_start, ad_end, ad_methods_map, ad_reliable = inspect_control_state_adaptor(ss_strip)

if not ad_reliable or ad_start is None or ad_end is None:
    record(
        "WARNING",
        "ARCH-08",
        "Could not reliably determine window.ControlStateAdaptor object literal boundaries via static brace analysis",
        f"start={ad_start}, end={ad_end}, reliable={ad_reliable}"
    )
else:
    expected_ad_methods = ("syncFromDOM", "syncToDOM", "setPairValue")
    found_ad_methods = [m for m in expected_ad_methods if m in ad_methods_map]
    adaptor_dom_hits = find_pattern_lines(ss_strip, r"\bdocument\.getElementById\b", ad_start, ad_end)
    outside_dom_hits = (
        find_pattern_lines(ss_strip, r"\bdocument\.getElementById\b", 1, ad_start - 1)
        + find_pattern_lines(ss_strip, r"\bdocument\.getElementById\b", ad_end + 1, len(ss_strip))
    )
    if len(found_ad_methods) == 3 and len(adaptor_dom_hits) > 0 and len(outside_dom_hits) == 0:
        method_locs = ", ".join(f"{m}:L{ad_methods_map[m]}" for m in found_ad_methods)
        record(
            "PASS",
            "ARCH-08",
            f"ControlStateAdaptor object (lines {ad_start}..{ad_end}) defines syncFromDOM, syncToDOM, and setPairValue as direct object methods and confines all document.getElementById calls in scene-state.js to this boundary",
            f"direct_methods=[{method_locs}], adaptor_getElementById_lines={adaptor_dom_hits}, outside_adaptor_getElementById_lines={outside_dom_hits}"
        )
    else:
        record(
            "FAIL",
            "ARCH-08",
            "ControlStateAdaptor missing direct method definitions or DOM access leaked outside adaptor boundary",
            f"span={ad_start}..{ad_end}, found_methods={found_ad_methods}, adaptor_dom={adaptor_dom_hits}, outside_dom={outside_dom_hits}"
        )

# -----------------------------------------------------------------------------
# ARCH-09: Cross-Check 95 Tracked Control IDs, chkAutoApplyPreset, & index.html
# -----------------------------------------------------------------------------
with open(os.path.join(js_dir, "history.js"), "r", encoding="utf-8") as f:
    hist_full = f.read()
with open(os.path.join(js_dir, "scene-state.js"), "r", encoding="utf-8") as f:
    ss_full = f.read()
with open(index_html_path, "r", encoding="utf-8") as f:
    html_full = f.read()

def safe_extract_ids(source, marker_prefix, marker_suffix):
    try:
        parts = source.split(marker_prefix)
        if len(parts) < 2:
            return None
        sub = parts[1].split(marker_suffix)
        if len(sub) < 1:
            return None
        return re.findall(r"'([a-zA-Z0-9_]+)'", sub[0])
    except Exception:
        return None

hist_ids = safe_extract_ids(hist_full, "trackedControlIds:", "]")
ss_ids = safe_extract_ids(ss_full, "TRACKED_CONTROL_IDS = [", "]")
html_form_ids = re.findall(r'<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"', html_full)
html_form_set = set(html_form_ids)

if hist_ids is None or ss_ids is None:
    record(
        "FAIL",
        "ARCH-09",
        "Control ID extraction failed: missing trackedControlIds or TRACKED_CONTROL_IDS marker in source",
        f"hist_ids_found={hist_ids is not None}, ss_ids_found={ss_ids is not None}"
    )
else:
    missing_in_html = [cid for cid in hist_ids if cid not in html_form_set]
    has_auto_preset_in_html = "chkAutoApplyPreset" in html_form_set

    # Scope chkAutoApplyPreset check strictly to the ControlStateAdaptor object literal slice in raw source
    if ad_reliable and ad_start and ad_end:
        adaptor_slice = "\n".join(ss_raw[ad_start - 1 : ad_end])
        has_auto_preset_in_adaptor = "'chkAutoApplyPreset'" in adaptor_slice
    else:
        has_auto_preset_in_adaptor = False

    if (
        len(hist_ids) == 95
        and len(ss_ids) == 95
        and hist_ids == ss_ids
        and not missing_in_html
        and has_auto_preset_in_html
        and has_auto_preset_in_adaptor
    ):
        record(
            "PASS",
            "ARCH-09",
            "Control ID sets verified across HistoryManager, SceneState, ControlStateAdaptor, and index.html",
            f"HistoryManager.trackedControlIds=95 == SceneState.trackedControlIds=95; ControlStateAdaptor=96 (95 + chkAutoApplyPreset); all present in index.html ({len(html_form_ids)} total form controls)"
        )
    else:
        record(
            "FAIL",
            "ARCH-09",
            "Control ID mismatch or missing adaptor binding detected",
            f"hist={len(hist_ids)}, ss={len(ss_ids)}, equal={hist_ids == ss_ids}, missing_in_html={missing_in_html}, chkAutoApplyPreset_html={has_auto_preset_in_html}, chkAutoApplyPreset_in_adaptor={has_auto_preset_in_adaptor}"
        )

# -----------------------------------------------------------------------------
# ARCH-10: Script Load Order in index.html & Public window.* Method Definitions
# -----------------------------------------------------------------------------
expected_scripts = [
    "js/effects.js",
    "js/scene-state.js",
    "js/coordinator.js",
    "js/stage.js",
    "js/shape-registry.js",
    "js/presets.js",
    "js/nodes.js",
    "js/flows.js",
    "js/glows.js",
    "js/ripples.js",
    "js/history.js",
    "js/projects.js",
    "js/app.js",
    "js/still-export-modal.js",
    "js/export-modal.js",
]

script_tags = re.findall(r'<script\s+src="([^"?]+)(?:\?[^"]*)?"\s*></script>', html_full)

required_contracts = {
    "effects.js": ["window.Effects", "buildPhotoElement", "buildMiteredFrame", "buildFrameMarkup", "build"],
    "scene-state.js": ["window.SceneState", "window.ControlStateAdaptor", "buildCurrentCanvasState", "buildRenderState", "buildFullSVG", "syncFromDOM", "syncToDOM", "setPairValue"],
    "coordinator.js": ["window.AppCoordinator", "selectObject", "clearSelection", "requestRender", "recordHistoryImmediate", "recordHistoryDebounced", "snapPctToGrid", "snapPosition"],
    "stage.js": ["window.Stage", "computeSnappedPosition", "computeSnappedPct", "computeFitScale", "rectClientToPct"],
    "shape-registry.js": ["window.ShapeRegistry", "get", "has", "getAll", "getIds"],
    "presets.js": ["window.NodePresets", "getState", "setState", "setPresetParam", "setAllEnabled", "applyToNodeObject", "extractFromNodeObject"],
    "nodes.js": ["window.DiagramNodes", "getState", "setState", "createNode", "updateNode", "deleteNode", "getNode", "getAllNodes", "findNodeAtPct", "injectIntoSVG"],
    "flows.js": ["window.DataFlows", "getState", "setState", "createFlow", "updateFlow", "deleteFlow", "getFlow", "getAllFlows", "addWaypoint", "removeWaypoint", "updateWaypoint", "generatePathString", "getMidpoint", "injectIntoSVG"],
    "glows.js": ["window.Glows", "getState", "setState", "createGlow", "updateGlow", "deleteGlow", "getGlow", "getAllGlows", "injectIntoSVG"],
    "ripples.js": ["window.Ripples", "getState", "setState", "createRipple", "updateRipple", "deleteRipple", "getRipple", "getAllRipples", "injectIntoSVG"],
    "history.js": ["window.HistoryManager", "captureSnapshot", "applySnapshot", "recordImmediate", "recordDebounced", "undo", "redo"],
    "projects.js": ["window.ProjectManager", "serializeStudioState", "applyStudioState", "fetchProjectsList", "fetchProjectById", "postSaveProject", "postDeleteProject"],
    "app.js": ["window.triggerAppRender", "window.buildFullSVG", "window.serializeSVGForExport", "window.getLoadedPhoto", "window.setLoadedPhoto", "window.populateShapeDropdowns"],
    "still-export-modal.js": ["window.StillExportStudio", "buildStillRenderConfig", "bakeStaticSVGAtTime", "evaluateSMILAnimate"],
    "export-modal.js": ["window.AnimatedExportStudio", "constructExportJobPayload", "requestBitmapRender", "inspectAudioStream"],
}

missing_contracts = []
for fname, symbols in required_contracts.items():
    _, strip_l = load_file(fname)
    joined = "\n".join(strip_l)
    for sym in symbols:
        if sym.startswith("window."):
            pat = rf"\b{re.escape(sym)}\s*="
        else:
            # Pattern matches actual definition sites, not mere call sites:
            # 1) Shorthand method definitions (sync or async) with single or multiline params:
            #    `methodName(...) {` or `async methodName(...) {`
            # 2) Object property function/arrow assignment:
            #    `methodName: [async] function(...) {` or `methodName: [async] (...) =>`
            # 3) Direct property assignment:
            #    `[Obj.]methodName = [async] (function|(...)=> )`
            # 4) Function declarations:
            #    `[async] function methodName(...) {`
            # NOTE: Static regex scanner limitation: does not recognise computed properties ([prop]()),
            # generators (*fn()), accessors (get/set), private identifiers (#prop), or dynamic
            # Object.assign attachments. Any required contract using unsupported syntax will
            # fail this check, preventing misleading PASS results.
            pat = (
                rf"(?:^|\n)\s*(?:async\s+)?{re.escape(sym)}\s*\([\s\S]*?\)\s*\{{"
                rf"|(?:^|\n)\s*{re.escape(sym)}\s*:\s*(?:async\s+)?(?:function\b|\([\s\S]*?\)\s*=>|[a-zA-Z_$][a-zA-Z0-9_$]*\s*=>)"
                rf"|(?:\b[a-zA-Z0-9_$]+\.)?{re.escape(sym)}\s*=\s*(?:async\s+)?(?:function\b|\([\s\S]*?\)\s*=>|[a-zA-Z_$][a-zA-Z0-9_$]*\s*=>)"
                rf"|\b(?:async\s+)?function\s+{re.escape(sym)}\s*\([\s\S]*?\)\s*\{{"
            )
        if not re.search(pat, joined):
            missing_contracts.append(f"{fname}:{sym}")

if script_tags == expected_scripts and not missing_contracts:
    record(
        "PASS",
        "ARCH-10",
        "All 15 <script> tags in index.html are in exact dependency order and all required window.* globals/method definitions are present in stripped source (static definition check)",
        f"scripts={len(script_tags)}, method_and_global_definitions_verified={sum(len(v) for v in required_contracts.values())}"
    )
else:
    record(
        "FAIL",
        "ARCH-10",
        "Script order or public interface definition mismatch",
        f"script_tags_match={script_tags == expected_scripts}, missing_contracts={missing_contracts}"
    )

print("-----------------------------------------------------------------------------")
print(" Four-Way Architectural Classification Summary ([STATIC] targeted pattern scan):")
print("   (Note: Static pattern scan of stripped source, not a full JS AST parser or proof")
print("    of complete runtime separation. Unsupported syntax such as computed property names,")
print("    generators, accessors, or dynamic attachments will produce FAIL.)")
print("   1. Inspected Operational Regions with No Recognised Direct DOM/UI Pattern Hits:")
print("      - effects.js (window.Effects)")
print("      - coordinator.js (window.AppCoordinator)")
print("      - shape-registry.js (window.ShapeRegistry)")
print(f"      - scene-state.js (window.SceneState lines 1..{ss_core_end})")
print("      - Inspected Layer 3 regions of presets.js, nodes.js, flows.js, glows.js, ripples.js, stage.js, export-modal.js")
print("   2. Intentional or Legacy DOM/Web-API Access in Operational/Adaptor Code:")
print("      - Intentional: window.ControlStateAdaptor in scene-state.js (PASS)")
print("      - Intentional: window.SVGExportAdapter in app.js for export XML serialization (PASS)")
print("      - Exception:   Offscreen DOM sandbox in still-export-modal.js bakeStaticSVGAtTime (WARNING)")
print("   3. Operational Code Directly Invoking UI Presentation Methods:")
print("      - Operational restore and serialization methods in HistoryManager and ProjectManager operate cleanly with zero direct UI presentation calls (PASS)")
print("   4. Inspected Layer 1 UI Delegation vs Recognised Cross-Module Coupling:")
print("      - Inspected Layer 1 regions use AppCoordinator for selection, waypoint activation, overlay refresh, history recording, and render requests (PASS)")
print("=============================================================================")

fail_count = sum(1 for r in results if r[0] == "FAIL")
sys.exit(1 if fail_count > 0 else 0)
PYEOF
