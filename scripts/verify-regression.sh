#!/usr/bin/env bash
# =============================================================================
# SVG Animator Studio — Phase 1 Functional Regression Suite ([RUNTIME])
# =============================================================================
# Executes functional regression checks across 4 distinct runtime tiers:
#   REG-01: Isolated Go SQLite persistence & REST API unit tests (t.TempDir())
#   REG-02: Stage 1 & 2 JS Operational Harness (SceneState, Effects, Stage math,
#           Presets, Nodes, Flows/Waypoints/PathGeneration, Glows, Ripples)
#   REG-03: Stage 3 & 4 JS Operational Harness (AppCoordinator selection
#           exclusivity, ControlStateAdaptor, HistoryManager maxDepth=50,
#           ProjectManager schema 1.2.0, injectIntoSVG, export payload builders
#           using DOM control test doubles and serializeSVGForExport stub)
#   REG-04: Real Browser Integration (SceneState.serializeSVGForExport
#           DOMParser/XMLSerializer, StillExportStudio.bakeStaticSVGAtTime
#           <animateMotion>, HTML5 Canvas PNG/WebP/JPEG export, interactive DOM)
#   REG-05: Full Animated & Audio Export (/api/export & /api/export/audio/inspect
#           via Headless Chromium + FFmpeg)
#
# Never opens or touches studio_library.db* (primary protection: isolated
# t.TempDir() directories). Reports NOT VERIFIED when required binaries or
# browser/media drivers are absent.
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

FAIL_COUNT=0

record_result() {
  local status="$1"
  local check_id="$2"
  local msg="$3"
  echo "[RESULT] ${status} | ${check_id} | [RUNTIME] | ${msg}"
  if [ "${status}" = "FAIL" ]; then
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

snapshot_db_metadata() {
  local out=""
  for f in "studio_library.db" "studio_library.db-wal" "studio_library.db-shm"; do
    local p="${REPO_ROOT}/${f}"
    if [ -e "${p}" ]; then
      out="${out}${f}:$(stat -c '%Y:%Z:%s' "${p}");"
    else
      out="${out}${f}:absent;"
    fi
  done
  echo "${out}"
}

echo "============================================================================="
echo " SVG Animator Studio — Phase 1 Functional Regression Report ([RUNTIME])"
echo "============================================================================="

DB_META_BEFORE="$(snapshot_db_metadata)"

# -----------------------------------------------------------------------------
# REG-01: Isolated Go SQLite Persistence & REST Handler Tests
# -----------------------------------------------------------------------------
echo ">> Running REG-01: Isolated Go SQLite persistence & REST handler tests..."
if GO_TEST_OUT="$(go test -count=1 -v ./internal/db ./internal/web 2>&1)"; then
  echo "${GO_TEST_OUT}" | sed 's/^/   /'
  record_result "PASS" "REG-01" "Isolated Go SQLite persistence (v1.2.0 round-trip) and REST handler tests passed in t.TempDir()"
else
  echo "${GO_TEST_OUT}" | sed 's/^/   /'
  record_result "FAIL" "REG-01" "Go SQLite persistence or REST handler tests failed"
fi

# -----------------------------------------------------------------------------
# REG-02 & REG-03: Non-Browser JavaScript Operational Regression Harness
# -----------------------------------------------------------------------------
echo ">> Checking Node.js availability for REG-02 and REG-03..."
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node --version 2>&1)"
  echo "   Found Node.js (${NODE_VER}); executing scripts/regression-harness.js..."
  if HARNESS_OUT="$(node "${SCRIPT_DIR}/regression-harness.js" 2>&1)"; then
    echo "${HARNESS_OUT}" | sed 's/^/   /'
    record_result "PASS" "REG-02" "Stage 1 & 2 JS Operational Harness (SceneState, Effects.build, Stage math, NodePresets, DiagramNodes, DataFlows waypoints/routing, Glows, Ripples) passed (${NODE_VER})"
    record_result "PASS" "REG-03" "Stage 3 & 4 JS Operational Harness (AppCoordinator selection exclusivity, ControlStateAdaptor, HistoryManager maxDepth=50, ProjectManager v1.2.0, injectIntoSVG, export payload builders; uses DOM control test doubles and pass-through serializeSVGForExport stub) passed (${NODE_VER})"
  else
    echo "${HARNESS_OUT}" | sed 's/^/   /'
    if echo "${HARNESS_OUT}" | grep -Fq "[HARNESS] REG-02 PASS:"; then
      record_result "PASS" "REG-02" "Stage 1 & 2 JS Operational Harness passed (${NODE_VER})"
      record_result "FAIL" "REG-03" "Stage 3 & 4 JS Operational Harness failed in scripts/regression-harness.js"
    else
      record_result "FAIL" "REG-02" "Stage 1 & 2 JS Operational Harness failed in scripts/regression-harness.js"
      record_result "FAIL" "REG-03" "Stage 3 & 4 JS Operational Harness did not complete due to earlier failure"
    fi
  fi
else
  echo "   Node.js binary ('node') is not installed in this LXC environment."
  record_result "NOT VERIFIED" "REG-02" "Stage 1 & 2 JS Operational Harness (SceneState, Effects.build, Stage math, NodePresets, DiagramNodes, DataFlows waypoints/routing, Glows, Ripples) could not execute: 'node' runtime not installed on LXC"
  record_result "NOT VERIFIED" "REG-03" "Stage 3 & 4 JS Operational Harness (AppCoordinator selection, ControlStateAdaptor, HistoryManager maxDepth=50, ProjectManager v1.2.0, injectIntoSVG, export payload builders with DOM control test doubles) could not execute: 'node' runtime not installed on LXC"
fi

# -----------------------------------------------------------------------------
# REG-04: Real Browser Integration Tests (Separated from Node.js Harness)
# -----------------------------------------------------------------------------
echo ">> Checking headless Chromium availability for REG-04 (Real Browser Integration)..."
BROWSER_BIN=""
for candidate in chromium chromium-browser google-chrome google-chrome-stable; do
  if command -v "${candidate}" >/dev/null 2>&1; then
    BROWSER_BIN="$(command -v "${candidate}")"
    break
  fi
done

if [ -z "${BROWSER_BIN}" ]; then
  echo "   No Chromium/Chrome binary found on LXC."
  record_result "NOT VERIFIED" "REG-04" "Missing dependency: Chromium/Chrome browser is not installed on LXC; cannot execute browser-only tests (SceneState.serializeSVGForExport DOMParser/XMLSerializer, StillExportStudio.bakeStaticSVGAtTime <animateMotion> path geometry, HTML5 Canvas PNG/WebP/JPEG export, interactive pointer/DOM events)"
else
  record_result "NOT VERIFIED" "REG-04" "Browser binary found at ${BROWSER_BIN}, but automated headless browser test driver is not implemented in this suite"
fi

# -----------------------------------------------------------------------------
# REG-05: Full Animated & Audio Export Pipeline (Chromium + FFmpeg)
# -----------------------------------------------------------------------------
echo ">> Checking Chromium + FFmpeg availability for REG-05 (Animated & Audio Export)..."
FFMPEG_BIN="$(command -v ffmpeg 2>/dev/null || true)"
FFPROBE_BIN="$(command -v ffprobe 2>/dev/null || true)"

if [ -z "${BROWSER_BIN}" ] || [ -z "${FFMPEG_BIN}" ] || [ -z "${FFPROBE_BIN}" ]; then
  MISSING_DEPS=()
  [ -z "${BROWSER_BIN}" ] && MISSING_DEPS+=("chromium")
  [ -z "${FFMPEG_BIN}" ] && MISSING_DEPS+=("ffmpeg")
  [ -z "${FFPROBE_BIN}" ] && MISSING_DEPS+=("ffprobe")
  MISSING_LIST="$(IFS=, ; echo "${MISSING_DEPS[*]}")"
  echo "   Missing external binaries required for full raster/audio export: ${MISSING_LIST}"
  record_result "NOT VERIFIED" "REG-05" "Missing dependencies (${MISSING_LIST}) on LXC; cannot execute full animated/audio export pipeline (/api/export MP4/WebP/APNG via chromedp+ffmpeg and /api/export/audio/inspect via ffmpeg)"
else
  record_result "NOT VERIFIED" "REG-05" "Dependencies present (${BROWSER_BIN}, ${FFMPEG_BIN}, ${FFPROBE_BIN}), but automated end-to-end media export test driver is not implemented in this suite"
fi

# Compare file metadata of studio_library.db, -wal, and -shm before and after
DB_META_AFTER="$(snapshot_db_metadata)"
if [ "${DB_META_BEFORE}" != "${DB_META_AFTER}" ]; then
  echo "[ERROR] Repository DB metadata (studio_library.db*) changed (${DB_META_BEFORE} -> ${DB_META_AFTER})!"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  echo ">> Repository DB metadata check (studio_library.db, -wal, -shm): unchanged."
fi

echo "============================================================================="
exit $([ "${FAIL_COUNT}" -gt 0 ] && echo 1 || echo 0)
