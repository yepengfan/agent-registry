#!/usr/bin/env bash
# Run deterministic gates for the PR review loop.
# Writes ./.claude/state/gates.json and prints a one-line summary to stdout.
# Never exits non-zero just because a gate failed — those results are captured in JSON.
# Exits non-zero only on infrastructure failure (can't write state file, etc.).

set -u
STATE_DIR="./.claude/state"
mkdir -p "$STATE_DIR"

# Gate commands — override by setting env vars or via GATE_CONFIG (must be an absolute path
# to a file outside the repo, e.g. ~/.config/pr-review-loop/gate_config.json).
# Relative paths are intentionally rejected to prevent a malicious PR from injecting
# arbitrary commands via a gate_config.json committed inside the checked-out tree.
TESTS_CMD="${TESTS_CMD:-npm test}"
LINT_CMD="${LINT_CMD:-npm run lint}"
BUILD_CMD="${BUILD_CMD:-npm run build}"

if [ -n "${GATE_CONFIG:-}" ] && [[ "$GATE_CONFIG" = /* ]] && [ -f "$GATE_CONFIG" ] && command -v jq >/dev/null 2>&1; then
  t=$(jq -r '.tests // empty' "$GATE_CONFIG" 2>/dev/null || true)
  l=$(jq -r '.lint // empty' "$GATE_CONFIG" 2>/dev/null || true)
  b=$(jq -r '.build // empty' "$GATE_CONFIG" 2>/dev/null || true)
  [ -n "$t" ] && TESTS_CMD="$t"
  [ -n "$l" ] && LINT_CMD="$l"
  [ -n "$b" ] && BUILD_CMD="$b"
fi

# JSON-escape a string using python (more portable than jq -Rs)
json_escape() {
  python3 -c 'import json, sys; print(json.dumps(sys.stdin.read()))'
}

run_gate() {
  local name="$1"
  local cmd="$2"
  local log_file="$STATE_DIR/gate_${name}.log"
  local pass="false"

  if bash -c "$cmd" >"$log_file" 2>&1; then
    pass="true"
  fi

  local cmd_json
  cmd_json=$(printf '%s' "$cmd" | json_escape)
  local tail_json
  tail_json=$(tail -c 2048 "$log_file" | json_escape)

  printf '"%s": {"pass": %s, "cmd": %s, "output_tail": %s}' \
    "$name" "$pass" "$cmd_json" "$tail_json"
}

{
  echo "{"
  run_gate "tests" "$TESTS_CMD"
  echo ","
  run_gate "lint" "$LINT_CMD"
  echo ","
  run_gate "build" "$BUILD_CMD"
  echo ","
  # Also include a flat all_pass derived value for easy consumption
  printf '"_derived": {"timestamp": "%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "}"
} > "$STATE_DIR/gates.json"

# Compute all_pass and write a summary to stdout
python3 - "$STATE_DIR/gates.json" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
t = d["tests"]["pass"]
l = d["lint"]["pass"]
b = d["build"]["pass"]
d["all_pass"] = bool(t and l and b)
json.dump(d, open(p, "w"), indent=2)
print(f"gates: tests={t} lint={l} build={b} all_pass={d['all_pass']}")
PY
