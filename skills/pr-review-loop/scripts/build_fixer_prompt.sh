#!/usr/bin/env bash
# Build the fixer Task prompt.
#
# Usage:
#   build_fixer_prompt.sh --round N --findings-file PATH
#
# Outputs the fully assembled prompt to stdout.

set -euo pipefail

ROUND_NUM=""
FINDINGS_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --round)          ROUND_NUM="$2"; shift 2;;
    --findings-file)  FINDINGS_FILE="$2"; shift 2;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

if [ -z "$ROUND_NUM" ]; then echo "missing --round" >&2; exit 2; fi
if [ -z "$FINDINGS_FILE" ] || [ ! -f "$FINDINGS_FILE" ]; then
  echo "missing or not-found --findings-file" >&2; exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
PREAMBLE="$SKILL_DIR/templates/fixer_preamble.txt"
TASK_TMPL="$SKILL_DIR/templates/fixer_task.txt"
AGENT_MD="$HOME/.claude/agents/pr-fixer.md"

for f in "$PREAMBLE" "$TASK_TMPL" "$AGENT_MD"; do
  if [ ! -f "$f" ]; then
    echo "missing file: $f" >&2
    exit 3
  fi
done

FINDINGS_CONTENT="$(cat "$FINDINGS_FILE")"

TASK_FILLED="$(
  ROUND_NUM="$ROUND_NUM" FINDINGS_JSON="$FINDINGS_CONTENT" \
  python3 - "$TASK_TMPL" <<'PY'
import os, sys, pathlib
tmpl = pathlib.Path(sys.argv[1]).read_text()
replacements = {
    "__ROUND_NUM__":    os.environ["ROUND_NUM"],
    "__FINDINGS_JSON__": os.environ["FINDINGS_JSON"],
}
out = tmpl
for k, v in replacements.items():
    out = out.replace(k, v)
sys.stdout.write(out)
PY
)"

cat "$PREAMBLE"
echo ""
cat "$AGENT_MD"
echo ""
printf '%s' "$TASK_FILLED"
