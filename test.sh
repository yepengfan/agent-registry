#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
passed=0
failed=0

pass() { echo "  PASS: $1"; ((passed++)) || true; }
fail() { echo "  FAIL: $1"; ((failed++)) || true; }

echo "=== Agent Registry — Smoke Tests ==="

# ── Frontmatter Parser ───────────────────────────────────────

echo ""
echo "--- Frontmatter Parser ---"
python3 "$SCRIPT_DIR/lib/test_parse_frontmatter.py" >/dev/null 2>&1
if [[ $? -eq 0 ]]; then
  pass "frontmatter parser tests all pass"
else
  fail "frontmatter parser tests failed"
fi

# ── Clean State ──────────────────────────────────────────────

echo ""
echo "--- Clean State ---"
bash "$SCRIPT_DIR/install.sh" --uninstall >/dev/null 2>&1 || true

# ── Skill Installation ───────────────────────────────────────

echo ""
echo "--- Skill Installation ---"
bash "$SCRIPT_DIR/install.sh" --skill slides >/dev/null 2>&1

cmd_link="$CLAUDE_DIR/commands/slides"
if [[ -L "$cmd_link" ]]; then
  actual="$(readlink "$cmd_link" 2>/dev/null || true)"
  if [[ "$actual" == "$SCRIPT_DIR/skills/slides/commands" ]]; then
    pass "skill symlink points to registry"
  else
    fail "skill symlink points to $actual (expected $SCRIPT_DIR/skills/slides/commands)"
  fi
else
  fail "skill symlink not created at $cmd_link"
fi

if [[ -f "$cmd_link/generate.md" ]]; then
  pass "generate.md accessible through symlink"
else
  fail "generate.md not accessible through symlink"
fi

# ── Agent Installation (ephemeral) ───────────────────────────

echo ""
echo "--- Agent Installation (Ephemeral) ---"
bash "$SCRIPT_DIR/install.sh" --agent cit-deck-creator >/dev/null 2>&1

agent_file="$CLAUDE_DIR/commands/cit-deck-creator.md"
if [[ -f "$agent_file" ]]; then
  pass "agent command file created"
else
  fail "agent command file not created at $agent_file"
fi

if head -1 "$agent_file" 2>/dev/null | grep -q "agent-registry-path:"; then
  pass "agent file has registry path comment"
else
  fail "agent file missing registry path comment"
fi

# Check frontmatter was stripped
if grep -q "^---" "$agent_file" 2>/dev/null; then
  fail "agent file still contains frontmatter delimiters"
else
  pass "frontmatter stripped from agent file"
fi

# Check skill dependency was auto-installed
if [[ -L "$CLAUDE_DIR/commands/slides" ]]; then
  pass "skill dependency auto-installed with agent"
else
  fail "skill dependency not auto-installed"
fi

# ── Agent Installation (project mode) ────────────────────────

echo ""
echo "--- Agent Installation (Project Mode) ---"
tmpdir=$(mktemp -d)

bash "$SCRIPT_DIR/install.sh" --project devops "$tmpdir" >/dev/null 2>&1

if [[ -f "$tmpdir/.claude/CLAUDE.md" ]]; then
  pass "CLAUDE.md created in target project"
else
  fail "CLAUDE.md not created"
fi

if grep -q "infrastructure" "$tmpdir/.claude/CLAUDE.md" 2>/dev/null; then
  pass "CLAUDE.md contains agent content"
else
  fail "CLAUDE.md missing agent content"
fi

if [[ -d "$tmpdir/.claude/ref/devops" ]]; then
  pass "ref/ directory copied to project"
else
  fail "ref/ directory not copied"
fi

if [[ -f "$tmpdir/.claude/ref/devops/deployment-runbook.md" ]]; then
  pass "ref docs accessible in project"
else
  fail "ref docs not found in project"
fi

# Check ref paths were updated
if grep -q "\.claude/ref/devops/" "$tmpdir/.claude/CLAUDE.md" 2>/dev/null; then
  pass "ref paths updated to project-local paths"
else
  fail "ref paths not updated"
fi

# Test append mode
bash "$SCRIPT_DIR/install.sh" --project code-reviewer "$tmpdir" >/dev/null 2>&1

if grep -q "## Agent: code-reviewer" "$tmpdir/.claude/CLAUDE.md" 2>/dev/null; then
  pass "second agent appended with header"
else
  fail "second agent not appended correctly"
fi

rm -rf "$tmpdir"

# ── Status ───────────────────────────────────────────────────

echo ""
echo "--- Status ---"
status_out="$(bash "$SCRIPT_DIR/install.sh" --status 2>&1)"

if echo "$status_out" | grep -q "cit-deck-creator"; then
  pass "--status lists agents"
else
  fail "--status does not list agents"
fi

if echo "$status_out" | grep -q "slides"; then
  pass "--status lists skills"
else
  fail "--status does not list skills"
fi

# ── List ─────────────────────────────────────────────────────

echo ""
echo "--- List ---"
list_out="$(bash "$SCRIPT_DIR/install.sh" --list 2>&1)"

if echo "$list_out" | grep -q "branded slide generation"; then
  pass "--list shows agent descriptions"
else
  fail "--list does not show descriptions"
fi

# ── Name Validation ──────────────────────────────────────────

echo ""
echo "--- Name Validation ---"
out="$(bash "$SCRIPT_DIR/install.sh" --agent "../traversal" 2>&1 || true)"
if echo "$out" | grep -q "Invalid package name"; then
  pass "rejects path traversal in name"
else
  fail "does not reject path traversal"
fi

out="$(bash "$SCRIPT_DIR/install.sh" --agent ".hidden" 2>&1 || true)"
if echo "$out" | grep -q "Invalid package name"; then
  pass "rejects hidden directory name"
else
  fail "does not reject hidden directory name"
fi

out="$(bash "$SCRIPT_DIR/install.sh" --skill "" 2>&1 || true)"
if echo "$out" | grep -q "Invalid package name"; then
  pass "rejects empty name"
else
  fail "does not reject empty name"
fi

# ── Uninstall ────────────────────────────────────────────────

echo ""
echo "--- Agent Uninstall ---"
bash "$SCRIPT_DIR/install.sh" --uninstall --agent cit-deck-creator >/dev/null 2>&1

if [[ ! -f "$CLAUDE_DIR/commands/cit-deck-creator.md" ]]; then
  pass "agent command file removed"
else
  fail "agent command file still exists"
fi

# Skill should still be installed
if [[ -L "$CLAUDE_DIR/commands/slides" ]]; then
  pass "skill kept after agent uninstall"
else
  fail "skill removed with agent (should be kept)"
fi

echo ""
echo "--- Skill Uninstall ---"
bash "$SCRIPT_DIR/install.sh" --uninstall --skill slides >/dev/null 2>&1

if [[ ! -L "$CLAUDE_DIR/commands/slides" ]]; then
  pass "skill symlink removed"
else
  fail "skill symlink still exists"
fi

echo ""
echo "--- Full Uninstall ---"
# Re-install everything, then uninstall all
bash "$SCRIPT_DIR/install.sh" >/dev/null 2>&1
bash "$SCRIPT_DIR/install.sh" --uninstall >/dev/null 2>&1

if [[ ! -f "$CLAUDE_DIR/commands/cit-deck-creator.md" ]] && \
   [[ ! -f "$CLAUDE_DIR/commands/code-reviewer.md" ]] && \
   [[ ! -f "$CLAUDE_DIR/commands/devops.md" ]] && \
   [[ ! -L "$CLAUDE_DIR/commands/slides" ]]; then
  pass "full uninstall removes all agents and skills"
else
  fail "full uninstall left some artifacts"
fi

# ── Re-install to leave in good state ────────────────────────

bash "$SCRIPT_DIR/install.sh" >/dev/null 2>&1

# ── Summary ──────────────────────────────────────────────────

echo ""
echo "=== Results: $passed passed, $failed failed ==="
[[ $failed -eq 0 ]] && exit 0 || exit 1
