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
#     - No lint script exists in package.json (no eslint config) -> lint is skipped.
#     - `npm run build` is intentionally NOT run here: it requires Keystatic GitHub
#       OAuth secrets (KEYSTATIC_GITHUB_CLIENT_ID / _SECRET / KEYSTATIC_SECRET) that
#       are not present in this environment, so it fails on missing credentials, not
#       broken code. That check belongs in a live drive with real secrets, not this gate.

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

echo "skip lint (no lint script / eslint config in this repo)"
echo "skip build (requires Keystatic GitHub OAuth secrets not present in this env; verify live with real secrets instead)"

if [ "$FAILED" -ne 0 ]; then
  echo "Blocked by .claude/verify.sh. Fix the FAIL lines above."
  echo "For behavior (not just compilation), drive the feature with a verify-<app> skill."
  exit 1
fi
exit 0
