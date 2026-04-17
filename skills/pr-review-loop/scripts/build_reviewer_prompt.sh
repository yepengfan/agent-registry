#!/usr/bin/env bash
# Build the reviewer Task prompt by concatenating preamble + pr-reviewer.md + task template,
# with placeholders replaced.
#
# Usage:
#   build_reviewer_prompt.sh --round N --pr-num N --tests-pass true|false \
#                            --lint-pass true|false --build-pass true|false \
#                            [--diff-file path]
#
# Outputs the fully assembled prompt to stdout. Caller pipes to Task tool.

set -euo pipefail

ROUND_NUM=""
PR_NUM=""
TESTS_PASS=""
LINT_PASS=""
BUILD_PASS=""
DIFF_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --round)       ROUND_NUM="$2"; shift 2;;
    --pr-num)      PR_NUM="$2"; shift 2;;
    --tests-pass)  TESTS_PASS="$2"; shift 2;;
    --lint-pass)   LINT_PASS="$2"; shift 2;;
    --build-pass)  BUILD_PASS="$2"; shift 2;;
    --diff-file)   DIFF_FILE="$2"; shift 2;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

for var in ROUND_NUM PR_NUM TESTS_PASS LINT_PASS BUILD_PASS; do
  if [ -z "${!var}" ]; then
    echo "missing --$(echo "$var" | tr '[:upper:]' '[:lower:]' | tr _ -)" >&2
    exit 2
  fi
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
PREAMBLE="$SKILL_DIR/templates/reviewer_preamble.txt"
TASK_TMPL="$SKILL_DIR/templates/reviewer_task.txt"
AGENT_MD="$HOME/.claude/agents/pr-reviewer.md"

for f in "$PREAMBLE" "$TASK_TMPL" "$AGENT_MD"; do
  if [ ! -f "$f" ]; then
    echo "missing file: $f" >&2
    exit 3
  fi
done

# Read PR diff
if [ -n "$DIFF_FILE" ] && [ -f "$DIFF_FILE" ]; then
  PR_DIFF_CONTENT="$(cat "$DIFF_FILE")"
else
  PR_DIFF_CONTENT="$(gh pr diff "$PR_NUM" 2>/dev/null || git diff main..HEAD)"
fi

# Substitute placeholders in task template using python (safer than sed with arbitrary content)
TASK_FILLED="$(
  PR_NUM="$PR_NUM" ROUND_NUM="$ROUND_NUM" TESTS_PASS="$TESTS_PASS" \
  LINT_PASS="$LINT_PASS" BUILD_PASS="$BUILD_PASS" PR_DIFF_CONTENT="$PR_DIFF_CONTENT" \
  python3 - "$TASK_TMPL" <<'PY'
import os, sys, pathlib
tmpl = pathlib.Path(sys.argv[1]).read_text()
replacements = {
    "__PR_NUM__":     os.environ["PR_NUM"],
    "__ROUND_NUM__":  os.environ["ROUND_NUM"],
    "__TESTS_PASS__": os.environ["TESTS_PASS"],
    "__LINT_PASS__":  os.environ["LINT_PASS"],
    "__BUILD_PASS__": os.environ["BUILD_PASS"],
    "__PR_DIFF__":    os.environ["PR_DIFF_CONTENT"],
}
out = tmpl
for k, v in replacements.items():
    out = out.replace(k, v)
sys.stdout.write(out)
PY
)"

# Concatenate: preamble + agent.md + (filled task)
cat "$PREAMBLE"
echo ""
cat "$AGENT_MD"
echo ""
printf '%s' "$TASK_FILLED"
