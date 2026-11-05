#!/usr/bin/env bash
# =============================================================================
# SVG Animator Studio — Phase 1 Combined Verification Runner
# =============================================================================
# Executes:
#   1. scripts/verify-architecture.sh ([STATIC] ARCH-01..ARCH-10)
#   2. scripts/verify-regression.sh   ([RUNTIME] REG-01..REG-05)
#   3. scripts/verify-runtime.sh      ([RUNTIME] RUN-01..RUN-07)
#
# Preserves exact result categories without converting WARNING or NOT VERIFIED
# into PASS:
#   - PASS
#   - FAIL
#   - WARNING
#   - NOT VERIFIED
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

COMBINED_LOG="$(mktemp /tmp/svg-animator-phase1-results.XXXXXX)"
trap 'rm -f "${COMBINED_LOG}"' EXIT

snapshot_db_metadata() {
  local out=""
  for f in "studio_library.db" "studio_library.db-wal" "studio_library.db-shm"; do
    local p="${REPO_ROOT}/${f}"
    if [ -e "${p}" ]; then
      out="${out}${f}($(stat -c '%Y:%Z:%s' "${p}")) "
    else
      out="${out}${f}(absent) "
    fi
  done
  echo "${out% }"
}

DB_META_BEFORE="$(snapshot_db_metadata)"

SUITE_EXIT=0

run_suite() {
  local script_name="$1"
  echo ""
  if ! bash "${SCRIPT_DIR}/${script_name}" | tee -a "${COMBINED_LOG}"; then
    SUITE_EXIT=1
  fi
}

run_suite "verify-architecture.sh"
run_suite "verify-regression.sh"
run_suite "verify-runtime.sh"

DB_META_AFTER="$(snapshot_db_metadata)"

PASS_COUNT="$(grep -c '^\[RESULT\] PASS |' "${COMBINED_LOG}" || true)"
WARN_COUNT="$(grep -c '^\[RESULT\] WARNING |' "${COMBINED_LOG}" || true)"
UNVER_COUNT="$(grep -c '^\[RESULT\] NOT VERIFIED |' "${COMBINED_LOG}" || true)"
FAIL_COUNT="$(grep -c '^\[RESULT\] FAIL |' "${COMBINED_LOG}" || true)"
TOTAL_COUNT=$((PASS_COUNT + WARN_COUNT + UNVER_COUNT + FAIL_COUNT))

echo ""
echo "============================================================================="
echo " CONSOLIDATED PHASE 1 VERIFICATION SUMMARY"
echo "============================================================================="
grep '^\[RESULT\] ' "${COMBINED_LOG}"
echo "-----------------------------------------------------------------------------"
echo " Total Checks : ${TOTAL_COUNT}"
echo "   PASS         : ${PASS_COUNT}"
echo "   WARNING      : ${WARN_COUNT} (known architectural exceptions / legacy couplings)"
echo "   NOT VERIFIED : ${UNVER_COUNT} (missing LXC runtime binaries [node, chromium, ffmpeg/ffprobe] and unimplemented automated browser/media test drivers)"
echo "   FAIL         : ${FAIL_COUNT}"
echo "-----------------------------------------------------------------------------"
if [ "${DB_META_BEFORE}" = "${DB_META_AFTER}" ]; then
  echo " Repository DB Metadata Comparison (mtime:ctime:size):"
  echo "   UNCHANGED: ${DB_META_AFTER}"
  echo "   (Note: Primary database protection is enforced via isolated /tmp -datadir and"
  echo "    t.TempDir() paths; stat metadata confirms no file writes/truncations.)"
else
  echo " Repository DB Metadata Comparison : MISMATCH DETECTED"
  echo "   Before: ${DB_META_BEFORE}"
  echo "   After : ${DB_META_AFTER}"
  SUITE_EXIT=1
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

if [ "${FAIL_COUNT}" -gt 0 ] || [ "${SUITE_EXIT}" -ne 0 ]; then
  echo " Overall Outcome      : FAIL (${FAIL_COUNT} failed check(s))"
  echo "============================================================================="
  exit 1
elif [ "${WARN_COUNT}" -gt 0 ] || [ "${UNVER_COUNT}" -gt 0 ]; then
  echo " Overall Outcome      : PARTIALLY VERIFIED (${PASS_COUNT} PASS, ${WARN_COUNT} WARNING, ${UNVER_COUNT} NOT VERIFIED, 0 FAIL)"
  echo "============================================================================="
  exit 0
else
  echo " Overall Outcome      : PASS (All ${PASS_COUNT} checks passed cleanly)"
  echo "============================================================================="
  exit 0
fi
