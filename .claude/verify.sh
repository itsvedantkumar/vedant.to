#!/usr/bin/env bash
# .claude/verify.sh — contract with the Stop hook (~/.claude/hooks/verify-gate.sh)
#
#   The hook runs this file with cwd = project root every time the agent tries to finish.
#     exit 0   -> the agent may stop.
#     exit !=0 -> the agent is BLOCKED and this script's stdout+stderr is handed back
#                 to it verbatim as the reason to fix. Capped at 3 blocks per session.
#
#   Therefore this file MUST:
#     - never cd (the hook already runs it from the project root)
#     - never read stdin, prompt, or require anything interactive
#     - be safe to run repeatedly and concurrently: read-only, no leftover state
#     - stay fast (target < 90s) — it runs on every single turn-end
#     - print only what the agent needs in order to fix it, not full tool logs
#     - SKIP (not fail) any check whose prerequisite is missing; an unfixable
#       failure just burns the 3-block budget and disables the gate for the session
#
#   Deep behavioral verification lives in .claude/skills/verify-<app>/, not here.
#
#   Repo-specific notes:
#     - `npm run lint` is eslint (eslint-config-next + eslint-plugin-security).
#     - .claude/security-scan.sh (gitleaks, semgrep, osv-scanner, zizmor) is seeded by
#       `vstack overlay .`; fix its template in vstack, not here.
#     - `npm run build` runs with the same placeholder Keystatic secrets CI uses
#       (.github/actions/build-next/action.yml). Keystatic only needs those three to be
#       non-empty at build time; Vercel rebuilds with the real ones. Without them the
#       build fails on missing credentials rather than on broken code, which is why this
#       gate used to skip it entirely -- and why a build-breaking change passed the gate.

set -uo pipefail   # deliberately NOT -e: report every failing check, not just the first
FAILED=0
TAIL="${VERIFY_TAIL:-25}"

run() {  # run <label> <command...>
  local label="$1"; shift
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "skip $label ($1 not installed)"
    return 0
  fi
  local out rc
  out=$("$@" 2>&1); rc=$?
  if [ "$rc" -ne 0 ]; then
    FAILED=1
    echo "FAIL $label (exit $rc)"
    printf '%s\n' "$out" | tail -n "$TAIL"
    echo
  else
    echo "ok   $label"
  fi
}

has_script() { [ -f package.json ] && node -e "process.exit(require('./package.json').scripts?.['$1']?0:1)" 2>/dev/null; }

# --- Static gate ---------------------------------------------------------------
if [ ! -d node_modules ]; then
  echo "skip typecheck (no node_modules; run npm install)"
  echo "skip test (no node_modules; run npm install)"
else
  has_script typecheck && run typecheck npm run --silent typecheck || echo "skip typecheck (no script)"
  has_script test      && run test      npm run --silent test      || echo "skip test (no script)"
fi

if [ ! -d node_modules ]; then
  echo "skip lint (no node_modules; run npm install)"
else
  has_script lint && run lint npm run --silent lint || echo "skip lint (no script)"
fi

# --- Security scan (gitleaks, semgrep, osv-scanner, zizmor; seeded by vstack overlay) ---------
if [ -f .claude/security-scan.sh ]; then
  run security-scan bash .claude/security-scan.sh
else
  echo "skip security-scan (.claude/security-scan.sh absent; run: vstack overlay .)"
fi
# Placeholders, not secrets: these three only have to be non-empty for Keystatic's
# build-time config check. They match .github/actions/build-next/action.yml so a green
# gate here means the same thing a green CI build means.
if [ ! -d node_modules ]; then
  echo "skip build (no node_modules; run npm install)"
elif has_script build; then
  run build env \
    KEYSTATIC_GITHUB_CLIENT_ID="${KEYSTATIC_GITHUB_CLIENT_ID:-build-placeholder}" \
    KEYSTATIC_GITHUB_CLIENT_SECRET="${KEYSTATIC_GITHUB_CLIENT_SECRET:-build-placeholder}" \
    KEYSTATIC_SECRET="${KEYSTATIC_SECRET:-build-placeholder-secret-minimum-32-chars}" \
    npm run --silent build
else
  echo "skip build (no script)"
fi

if [ "$FAILED" -ne 0 ]; then
  echo "Blocked by .claude/verify.sh. Fix the FAIL lines above."
  echo "For behavior (not just compilation), drive the feature with a verify-<app> skill."
  exit 1
fi
exit 0
