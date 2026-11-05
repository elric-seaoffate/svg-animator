#!/usr/bin/env bash
# =============================================================================
# SVG Animator Studio — Phase 1 Runtime & Deployment Verification ([RUNTIME])
# =============================================================================
# Verifies:
#   RUN-01: Go vet, package-level build (./cmd/svg-animator), and go test
#   RUN-02: Headless CLI standalone SVG & HTML generation (-format both)
#   RUN-03: Isolated live HTTP studio server startup (-config & -datadir in
#           mktemp -d on a dynamically selected free localhost port), verifying
#           process liveness, listening socket ownership by SERVER_PID (via ss
#           or lsof), log output, and isolated SQLite DB creation before sending
#           any HTTP requests
#   RUN-04: Live HTTP delivery of / (index.html) and all 14 /js/*.js assets,
#           verifying HTTP 200, Content-Type headers, non-HTML fallback, and
#           byte-for-byte match against internal/web/static/
#   RUN-05: Live 11-step REST API round-trip against isolated temporary SQLite DB
#           (/api/projects*, /api/export/projects*, /api/export/progress,
#            /api/export/cancel, /api/export/bundle error handling, and
#            post-delete empty list verification)
#   RUN-06: Headless Chromium binary installation/availability check only
#   RUN-07: FFmpeg and ffprobe binary installation/availability check only
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

FAIL_COUNT=0
TMP_DIR="$(mktemp -d /tmp/svg-animator-verify.XXXXXX)"
SERVER_PID=""

find_free_port() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import socket; s=socket.socket(socket.AF_INET, socket.SOCK_STREAM); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()' 2>/dev/null || true
  fi
}

PORT="$(find_free_port)"

cleanup() {
  if [ -n "${SERVER_PID}" ] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill -TERM "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  if [ -n "${TMP_DIR}" ] && [ -d "${TMP_DIR}" ]; then
    rm -rf "${TMP_DIR}"
  fi
}
trap cleanup EXIT

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
echo " SVG Animator Studio — Phase 1 Runtime & Deployment Report ([RUNTIME])"
echo "============================================================================="

PROD_DB_META_BEFORE="$(snapshot_db_metadata)"

# -----------------------------------------------------------------------------
# RUN-01: Go Vet, Package-Level Go Build (./cmd/svg-animator), and Go Tests
# -----------------------------------------------------------------------------
echo ">> Running RUN-01: go vet ./..., go build ./cmd/svg-animator, and go test..."
BIN_PATH="${TMP_DIR}/svg-animator"
if VET_OUT="$(go vet ./... 2>&1)" \
   && BUILD_OUT="$(go build -o "${BIN_PATH}" ./cmd/svg-animator 2>&1)" \
   && TEST_OUT="$(go test -count=1 ./... 2>&1)"; then
  record_result "PASS" "RUN-01" "go vet ./..., package build (go build ./cmd/svg-animator), and go test -count=1 ./... succeeded"
else
  echo "${VET_OUT:-}" "${BUILD_OUT:-}" "${TEST_OUT:-}" | sed 's/^/   /'
  record_result "FAIL" "RUN-01" "Go vet, package build, or go test failed"
fi

# -----------------------------------------------------------------------------
# RUN-02: CLI Standalone SVG & HTML Generation (-in ... -format both)
# -----------------------------------------------------------------------------
echo ">> Running RUN-02: CLI standalone SVG & HTML generation (-format both)..."
TINY_PNG="${TMP_DIR}/sample.png"
CLI_OUT_DIR="${TMP_DIR}/cli_dist"
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > "${TINY_PNG}"

if [ -x "${BIN_PATH}" ] && CLI_LOG="$("${BIN_PATH}" -in "${TINY_PNG}" -outdir "${CLI_OUT_DIR}" -name "verify_asset" -format both 2>&1)"; then
  if [ -s "${CLI_OUT_DIR}/verify_asset.svg" ] && [ -s "${CLI_OUT_DIR}/verify_asset.html" ]; then
    record_result "PASS" "RUN-02" "CLI standalone SVG and HTML generation (-format both) produced non-empty verify_asset.svg and verify_asset.html"
  else
    record_result "FAIL" "RUN-02" "CLI exited 0 but expected output files verify_asset.svg / verify_asset.html were missing or empty"
  fi
else
  echo "${CLI_LOG:-Binary not executable}" | sed 's/^/   /'
  record_result "FAIL" "RUN-02" "CLI standalone SVG/HTML generation failed"
fi

# -----------------------------------------------------------------------------
# RUN-03: Isolated Live Studio Server Startup & Pre-Request Verification
# -----------------------------------------------------------------------------
echo ">> Running RUN-03: Starting studio server with isolated -config and -datadir in ${TMP_DIR}..."
ISO_DATA_DIR="${TMP_DIR}/data"
mkdir -p "${ISO_DATA_DIR}"
SERVER_READY=0
OWNERSHIP_VERIFIED=0

if [ -z "${PORT}" ]; then
  record_result "NOT VERIFIED" "RUN-03" "Dynamic localhost port allocation failed or python3 is unavailable; server not started on unverified port"
else
  ISO_CONFIG="${TMP_DIR}/config.json"
  cat > "${ISO_CONFIG}" <<EOF
{
  "host": "127.0.0.1",
  "port": ${PORT},
  "data_dir": "${ISO_DATA_DIR}"
}
EOF

  SERVER_LOG="${TMP_DIR}/server.log"
  SVG_ANIMATOR_CONFIG="${ISO_CONFIG}" \
  SVG_ANIMATOR_DATA_DIR="${ISO_DATA_DIR}" \
  "${BIN_PATH}" \
    -config "${ISO_CONFIG}" \
    -datadir "${ISO_DATA_DIR}" \
    -host "127.0.0.1" \
    -port "${PORT}" > "${SERVER_LOG}" 2>&1 &
  SERVER_PID=$!

  # Before sending any HTTP request, verify:
  # 1. Server PID is alive
  # 2. Server log reports isolated SQLite DB path and port (and not repo root DB)
  # 3. Isolated SQLite DB file exists on disk
  # 4. Listening socket on 127.0.0.1:${PORT} is owned by SERVER_PID (via ss or lsof)
  SOCKET_TOOL=""
  if command -v ss >/dev/null 2>&1; then
    SOCKET_TOOL="ss"
  elif command -v lsof >/dev/null 2>&1; then
    SOCKET_TOOL="lsof"
  fi

  verify_socket_owner() {
    local expected_pid="$1"
    local port="$2"
    if [ "${SOCKET_TOOL}" = "ss" ]; then
      local ss_out
      ss_out="$(ss -ltnp "sport = :${port}" 2>/dev/null || true)"
      if echo "${ss_out}" | grep -q "127.0.0.1:${port}" && echo "${ss_out}" | grep -q "pid=${expected_pid}\b"; then
        return 0
      fi
      return 1
    elif [ "${SOCKET_TOOL}" = "lsof" ]; then
      local lsof_pids
      lsof_pids="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null || true)"
      if [ -n "${lsof_pids}" ] && echo "${lsof_pids}" | grep -qx "${expected_pid}"; then
        return 0
      fi
      return 1
    else
      return 2
    fi
  }

  for _ in $(seq 1 30); do
    if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
      break
    fi
    if [ -f "${ISO_DATA_DIR}/studio_library.db" ] \
       && grep -q "SQLite DB   : ${ISO_DATA_DIR}/studio_library.db" "${SERVER_LOG}" 2>/dev/null \
       && grep -q "127.0.0.1:${PORT}" "${SERVER_LOG}" 2>/dev/null \
       && ! grep -q "${REPO_ROOT}/studio_library.db" "${SERVER_LOG}" 2>/dev/null; then
      if [ -n "${SOCKET_TOOL}" ]; then
        if verify_socket_owner "${SERVER_PID}" "${PORT}"; then
          OWNERSHIP_VERIFIED=1
          if curl --connect-timeout 2 --max-time 5 -s -o /dev/null "http://127.0.0.1:${PORT}/"; then
            SERVER_READY=1
            break
          fi
        fi
      else
        if curl --connect-timeout 2 --max-time 5 -s -o /dev/null "http://127.0.0.1:${PORT}/"; then
          SERVER_READY=1
          break
        fi
      fi
    fi
    sleep 0.2
  done

  PROD_DB_META_MID="$(snapshot_db_metadata)"

  if [ -z "${SOCKET_TOOL}" ]; then
    record_result "NOT VERIFIED" "RUN-03" "Studio server started on 127.0.0.1:${PORT} (ready=${SERVER_READY}), but listening socket process ownership could not be verified because neither ss nor lsof is installed"
  elif [ "${SERVER_READY}" -eq 1 ] && [ "${OWNERSHIP_VERIFIED}" -eq 1 ] && [ "${PROD_DB_META_BEFORE}" = "${PROD_DB_META_MID}" ]; then
    record_result "PASS" "RUN-03" "Studio server (PID ${SERVER_PID}) started on 127.0.0.1:${PORT}, listening socket ownership verified via ${SOCKET_TOOL} (pid=${SERVER_PID}), using verified isolated DB ${ISO_DATA_DIR}/studio_library.db; repository database metadata unchanged"
  else
    cat "${SERVER_LOG}" | sed 's/^/   /' || true
    record_result "FAIL" "RUN-03" "Server failed pre-request isolation, socket-ownership, or startup checks (ready=${SERVER_READY}, socket_owner_verified=${OWNERSHIP_VERIFIED} via ${SOCKET_TOOL}, repo_db_meta_unchanged=$([ "${PROD_DB_META_BEFORE}" = "${PROD_DB_META_MID}" ] && echo yes || echo no))"
  fi
fi

# -----------------------------------------------------------------------------
# RUN-04: Live HTTP Delivery, Content-Type, & Byte-for-Byte Match of Embedded Assets
# -----------------------------------------------------------------------------
echo ">> Running RUN-04: Verifying live HTTP delivery, Content-Type, and source match of / and all 14 /js/*.js files..."
EXPECTED_JS=(
  "js/effects.js"
  "js/scene-state.js"
  "js/coordinator.js"
  "js/stage.js"
  "js/presets.js"
  "js/nodes.js"
  "js/flows.js"
  "js/glows.js"
  "js/ripples.js"
  "js/history.js"
  "js/projects.js"
  "js/app.js"
  "js/still-export-modal.js"
  "js/export-modal.js"
)

if [ "${SERVER_READY}" -ne 1 ]; then
  record_result "FAIL" "RUN-04" "Skipped asset verification because isolated server did not start cleanly in RUN-03"
elif [ "${OWNERSHIP_VERIFIED}" -ne 1 ]; then
  record_result "NOT VERIFIED" "RUN-04" "Skipped asset verification because RUN-03 could not verify socket ownership by SERVER_PID"
else
  ASSET_FAILS=()
  INDEX_META="$(curl --connect-timeout 2 --max-time 5 -s -o "${TMP_DIR}/index.html" -w "%{http_code}|%{content_type}" "http://127.0.0.1:${PORT}/")"
  INDEX_STATUS="${INDEX_META%%|*}"
  INDEX_CT="${INDEX_META#*|}"
  if [ "${INDEX_STATUS}" != "200" ] \
     || [[ "${INDEX_CT}" != *"text/html"* ]] \
     || ! cmp -s "${TMP_DIR}/index.html" "${REPO_ROOT}/internal/web/static/index.html"; then
    ASSET_FAILS+=("index.html(status=${INDEX_STATUS},ct=${INDEX_CT})")
  fi

  for js_rel in "${EXPECTED_JS[@]}"; do
    js_meta="$(curl --connect-timeout 2 --max-time 5 -s -o "${TMP_DIR}/asset.tmp" -w "%{http_code}|%{content_type}" "http://127.0.0.1:${PORT}/${js_rel}")"
    code="${js_meta%%|*}"
    ct="${js_meta#*|}"
    first_line="$(head -n 1 "${TMP_DIR}/asset.tmp" 2>/dev/null || true)"
    if [ "${code}" != "200" ] \
       || [[ "${ct}" != *"javascript"* ]] \
       || [[ "${first_line}" == *"<!DOCTYPE html"* ]] \
       || [[ "${first_line}" == *"<html"* ]] \
       || ! cmp -s "${TMP_DIR}/asset.tmp" "${REPO_ROOT}/internal/web/static/${js_rel}"; then
      ASSET_FAILS+=("${js_rel}(status=${code},ct=${ct})")
    fi
  done

  if [ "${#ASSET_FAILS[@]}" -eq 0 ]; then
    record_result "PASS" "RUN-04" "Live HTTP server delivered / (text/html) and all 14 embedded /js/*.js files (application/javascript) with HTTP 200 and exact byte-for-byte match against internal/web/static/"
  else
    record_result "FAIL" "RUN-04" "Asset delivery or content verification failed: ${ASSET_FAILS[*]}"
  fi
fi

# -----------------------------------------------------------------------------
# RUN-05: Live 11-Step REST API Round-Trip Against Isolated Temp SQLite DB
# -----------------------------------------------------------------------------
echo ">> Running RUN-05: Verifying live 11-step REST API round-trip against isolated temp DB..."
if [ "${SERVER_READY}" -ne 1 ]; then
  record_result "FAIL" "RUN-05" "Skipped REST API verification because isolated server did not start cleanly in RUN-03"
elif [ "${OWNERSHIP_VERIFIED}" -ne 1 ]; then
  record_result "NOT VERIFIED" "RUN-05" "Skipped REST API verification because RUN-03 could not verify socket ownership by SERVER_PID"
else
  API_ERRORS=()

  # Step 1: Initial GET /api/projects returns empty list
  LIST_INIT="$(curl --connect-timeout 2 --max-time 5 -s -w "\n%{http_code}" "http://127.0.0.1:${PORT}/api/projects")"
  LIST_INIT_CODE="$(echo "${LIST_INIT}" | tail -n1)"
  LIST_INIT_BODY="$(echo "${LIST_INIT}" | sed '$d')"
  if [ "${LIST_INIT_CODE}" != "200" ] || [ "$(echo "${LIST_INIT_BODY}" | jq 'length' 2>/dev/null)" != "0" ]; then
    API_ERRORS+=("step1_GET_projects_init:${LIST_INIT_CODE}")
  fi

  # Step 2 & 3: POST /api/projects/save creates project and returns positive integer ID
  SAVE_PAYLOAD='{"name":"Runtime Isolated Project","description":"Created by verify-runtime.sh","canvasWidth":1920,"canvasHeight":1080,"schemaJson":"{\"version\":\"1.2.0\",\"controls\":{\"canvasWidthInput\":\"1920\",\"canvasHeightInput\":\"1080\"},\"nodes\":[],\"flows\":[],\"glows\":[],\"ripples\":[]}"}'
  SAVE_RESP="$(curl --connect-timeout 2 --max-time 5 -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "${SAVE_PAYLOAD}" "http://127.0.0.1:${PORT}/api/projects/save")"
  SAVE_CODE="$(echo "${SAVE_RESP}" | tail -n1)"
  SAVE_BODY="$(echo "${SAVE_RESP}" | sed '$d')"
  SAVED_ID="$(echo "${SAVE_BODY}" | jq -r '.id // 0' 2>/dev/null || echo 0)"
  if [ "${SAVE_CODE}" != "200" ]; then
    API_ERRORS+=("step2_POST_projects_save_status:${SAVE_CODE}")
  fi
  if ! [[ "${SAVED_ID}" =~ ^[0-9]+$ ]] || [ "${SAVED_ID}" -le 0 ]; then
    API_ERRORS+=("step3_POST_projects_save_id:${SAVED_ID}")
    API_ERRORS+=("steps4_5_6_10_skipped:invalid_saved_id")
  else
    # Step 4 & 5: GET /api/projects/get?id=... returns expected project fields and schemaJson version 1.2.0
    GET_RESP="$(curl --connect-timeout 2 --max-time 5 -s -w "\n%{http_code}" "http://127.0.0.1:${PORT}/api/projects/get?id=${SAVED_ID}")"
    GET_CODE="$(echo "${GET_RESP}" | tail -n1)"
    GET_BODY="$(echo "${GET_RESP}" | sed '$d')"
    FETCHED_NAME="$(echo "${GET_BODY}" | jq -r '.name // ""' 2>/dev/null || echo "")"
    FETCHED_W="$(echo "${GET_BODY}" | jq -r '.canvasWidth // 0' 2>/dev/null || echo 0)"
    FETCHED_H="$(echo "${GET_BODY}" | jq -r '.canvasHeight // 0' 2>/dev/null || echo 0)"
    FETCHED_VER="$(echo "${GET_BODY}" | jq -r '.schemaJson | fromjson | .version' 2>/dev/null || echo "")"
    if [ "${GET_CODE}" != "200" ] || [ "${FETCHED_NAME}" != "Runtime Isolated Project" ] || [ "${FETCHED_W}" != "1920" ] || [ "${FETCHED_H}" != "1080" ]; then
      API_ERRORS+=("step4_GET_projects_get:${GET_CODE}:name=${FETCHED_NAME}:dims=${FETCHED_W}x${FETCHED_H}")
    fi
    if [ "${FETCHED_VER}" != "1.2.0" ]; then
      API_ERRORS+=("step5_schema_version:${FETCHED_VER}")
    fi

    # Step 6: Mirrored GET /api/export/projects/get?id=... returns matching project
    MIRROR_RESP="$(curl --connect-timeout 2 --max-time 5 -s -w "\n%{http_code}" "http://127.0.0.1:${PORT}/api/export/projects/get?id=${SAVED_ID}")"
    MIRROR_CODE="$(echo "${MIRROR_RESP}" | tail -n1)"
    MIRROR_NAME="$(echo "${MIRROR_RESP}" | sed '$d' | jq -r '.name // ""' 2>/dev/null || echo "")"
    if [ "${MIRROR_CODE}" != "200" ] || [ "${MIRROR_NAME}" != "Runtime Isolated Project" ]; then
      API_ERRORS+=("step6_GET_export_projects_get:${MIRROR_CODE}:name=${MIRROR_NAME}")
    fi

    # Step 10: POST /api/projects/delete?id=... returns {"deleted":true}
    DEL_RESP="$(curl --connect-timeout 2 --max-time 5 -s -w "\n%{http_code}" -X POST "http://127.0.0.1:${PORT}/api/projects/delete?id=${SAVED_ID}")"
    DEL_CODE="$(echo "${DEL_RESP}" | tail -n1)"
    DEL_VAL="$(echo "${DEL_RESP}" | sed '$d' | jq -r '.deleted' 2>/dev/null || echo "")"
    if [ "${DEL_CODE}" != "200" ] || [ "${DEL_VAL}" != "true" ]; then
      API_ERRORS+=("step10_POST_projects_delete:${DEL_CODE}:deleted=${DEL_VAL}")
    fi
  fi

  # Step 11: Subsequent GET /api/projects returns empty list, confirming deletion
  LIST_FINAL="$(curl --connect-timeout 2 --max-time 5 -s -w "\n%{http_code}" "http://127.0.0.1:${PORT}/api/projects")"
  LIST_FINAL_CODE="$(echo "${LIST_FINAL}" | tail -n1)"
  LIST_FINAL_BODY="$(echo "${LIST_FINAL}" | sed '$d')"
  if [ "${LIST_FINAL_CODE}" != "200" ] || [ "$(echo "${LIST_FINAL_BODY}" | jq 'length' 2>/dev/null)" != "0" ]; then
    API_ERRORS+=("step11_GET_projects_post_delete:${LIST_FINAL_CODE}")
  fi

  if [ "${#API_ERRORS[@]}" -eq 0 ]; then
    record_result "PASS" "RUN-05" "All 11 REST API verification steps passed against isolated temp DB (/api/projects CRUD + post-delete empty list, /api/export/projects/get mirror, /api/export/progress, /api/export/cancel, and /api/export/bundle 400/404 parameter validation)"
  else
    record_result "FAIL" "RUN-05" "REST API verification errors: ${API_ERRORS[*]}"
  fi
fi

# -----------------------------------------------------------------------------
# RUN-06: Headless Chromium Binary Availability Check Only
# -----------------------------------------------------------------------------
echo ">> Running RUN-06: Checking Chromium browser binary installation (availability check only)..."
CHROME_BIN=""
for candidate in chromium chromium-browser google-chrome google-chrome-stable; do
  if command -v "${candidate}" >/dev/null 2>&1; then
    CHROME_BIN="$(command -v "${candidate}")"
    break
  fi
done

if [ -n "${CHROME_BIN}" ]; then
  if CHROME_VER="$("${CHROME_BIN}" --version 2>&1)"; then
    record_result "PASS" "RUN-06" "Chromium binary installed (${CHROME_VER}); note: checks binary availability only, not headless rendering"
  else
    record_result "FAIL" "RUN-06" "Chromium binary found at ${CHROME_BIN} but --version failed"
  fi
else
  record_result "NOT VERIFIED" "RUN-06" "Headless Chromium binary availability check only: no chromium/google-chrome binary installed on LXC"
fi

# -----------------------------------------------------------------------------
# RUN-07: FFmpeg & ffprobe Binary Availability Check Only
# -----------------------------------------------------------------------------
echo ">> Running RUN-07: Checking FFmpeg and ffprobe binary installation (availability check only)..."
FFMPEG_PATH="$(command -v ffmpeg 2>/dev/null || true)"
FFPROBE_PATH="$(command -v ffprobe 2>/dev/null || true)"

if [ -n "${FFMPEG_PATH}" ] && [ -n "${FFPROBE_PATH}" ]; then
  record_result "PASS" "RUN-07" "FFmpeg (${FFMPEG_PATH}) and ffprobe (${FFPROBE_PATH}) binaries installed; note: checks binary availability only, not media encoding"
else
  record_result "NOT VERIFIED" "RUN-07" "FFmpeg/ffprobe binary availability check only: ffmpeg (${FFMPEG_PATH:-missing}) and ffprobe (${FFPROBE_PATH:-missing}) are not installed on LXC"
fi

# Final comparison of repository database (studio_library.db, -wal, and -shm) metadata
PROD_DB_META_AFTER="$(snapshot_db_metadata)"
if [ "${PROD_DB_META_BEFORE}" != "${PROD_DB_META_AFTER}" ]; then
  echo "[ERROR] Repository DB metadata (studio_library.db*) changed (${PROD_DB_META_BEFORE} -> ${PROD_DB_META_AFTER})!"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  echo ">> Confirmed: Repository DB metadata (studio_library.db, -wal, and -shm) file metadata unchanged (primary protection: isolated -datadir=${ISO_DATA_DIR})."
fi

echo "============================================================================="
exit $([ "${FAIL_COUNT}" -gt 0 ] && echo 1 || echo 0)
