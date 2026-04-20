# Review-Fix Engine: Design Spec

## Problem

The agent-registry's PR review workflow uses a SKILL.md-based orchestration with multiple workarounds for Claude Code limitations (fake XML tool calls, prompt injection hacks, LLM-driven loop control). The architecture needs a redesign around the Claude Agent SDK with deterministic orchestration.

## Goals

- **Production-ready fix quality**: findings that are real and actionable
- **Reliability**: always completes, handles errors gracefully, never crashes silently
- **Pluggable reviewers**: add/remove specialized reviewers without changing the engine
- **Phased delivery**: each phase independently usable

## Non-Goals

- Design review pipeline (Figma vs DOM) — future separate pipeline
- CI/CD integration (GitHub Actions) — future
- Multi-repo support — one repo at a time

## Prior Art

| Tool | What we borrow | What we don't |
|------|---------------|---------------|
| PR-Agent (10.9K stars) | Self-reflection scoring, YAML/JSON structured output, progressive diff handling | AGPL license, LiteLLM dependency, no review-fix loop |
| Claude Code Review | Multi-agent parallel review, verification filtering, severity classification | Managed service, not available for custom proxy |
| CodeRabbit | Autofix with build verification, path-based review rules | Closed source, RAG-to-agentic migration path |
| Anthropic Cookbook | Evaluator-optimizer loop pattern, orchestrator-workers pattern | Reference implementations only |

## Phased Delivery

```
Phase 1: Review (this spec)
  Parallel specialized reviewers → merge → self-reflection → grounding → output

Phase 2: Fix (future spec)
  Fixer agent → human confirmation → gates → commit

Phase 3: Loop (future spec)
  Review → fix → verify → convergence → loop or exit
```

Each phase is independently usable. Phase 1 is a complete code review tool.

---

## Phase 1 Architecture

### Data Flow

```
PR number
  → gh pr checkout (switch to PR branch)
  → gh pr diff (get full diff)
  → 3 specialized reviewers in parallel via Agent SDK
      Security Reviewer ──→ findings[]
      Logic Reviewer ────→ findings[]
      Edge-case Reviewer ─→ findings[]
  → Merge + dedup (deterministic)
  → Self-reflection scoring (LLM, 0-10 per finding)
  → Grounding verification (deterministic, verify quoted_code vs files)
  → Output:
      Terminal (real-time progress)
      JSON file (persistent)
      GitHub PR inline comments (via gh api)
```

### No Diff Compression

Model uses 1M token context window (`anthropic.claude-4-6-opus[1m]`). Even a 500-file PR (~200K chars) uses ~50K tokens. Compression is unnecessary. Full diff goes to each reviewer.

### Specialized Reviewers

Three parallel reviewers share a base prompt (schema, rules) with different focus overlays:

| Reviewer | Focus | Finds |
|----------|-------|-------|
| Security | Vulnerabilities | Injection, auth bypass, secret leakage, insecure crypto, path traversal |
| Logic | Correctness | Null access, off-by-one, type errors, unhandled exceptions, race conditions |
| Edge-case | Boundary conditions | Missing null checks, empty array/string handling, test coverage gaps, API contract mismatches |

Prompt structure:
```
{base_prompt}       ← shared: schema, critical rules, process
{focus_prompt}      ← specific: what this reviewer looks for
{gates_summary}     ← deterministic facts: tests_pass, lint_pass, build_pass
{diff}              ← full PR diff
```

Reviewers do NOT use tools (no Read/Grep/Glob). They analyze purely from the embedded diff. Grounding handles verification. This is 3x faster and 3x cheaper than tool-using reviewers (validated in POC: $0.55/1 turn vs $1.57/10+ turns).

Adding a reviewer for a specific domain (e.g., accessibility, performance) is adding one `.md` file — no engine changes.

### SDK Configuration Per Reviewer

```python
ClaudeAgentOptions(
    permission_mode="dontAsk",
    cwd=repo_root,          # auto-detected git root
    max_turns=5,            # no tools, 1-2 turns expected
    include_partial_messages=True,
)
```

No `output_format` (causes CLI crashes with other options). No `allowed_tools` (not needed, no tool use). No `max_budget_usd` (let agent complete). JSON schema instructions embedded in the prompt.

### Findings Schema

Shared across all reviewers. Pydantic model as source of truth:

```python
class Finding(BaseModel):
    id: str                    # F-001, F-002...
    severity: Severity         # must-fix | nice-to-have
    category: Category         # correctness | security | style | testing | other
    claim: str                 # one-sentence description
    reasoning: str             # why this is a problem
    file: str                  # path relative to repo root
    line_start: int
    line_end: int
    quoted_code: str           # verbatim from the diff
    suggested_fix: str         # concrete fix
    source_reviewer: str       # security | logic | edge_case
```

### Merge + Dedup

Deterministic (no LLM):
1. Merge all findings from 3 reviewers with unified IDs
2. Dedup by `(file, line_start, line_end)` — keep higher severity
3. Conservatively: only dedup exact location matches. Two findings on the same line from different angles both survive.

### Self-Reflection

One LLM call scoring each finding 0-10 (PR-Agent validated pattern):
- 0: hallucinated or wrong
- 1-4: minor, low impact
- 5-7: real issue, moderate impact
- 8-10: critical, must fix

Threshold: findings scoring < 5 are filtered out. The call is cheap (~$0.20) because it only scores, doesn't generate.

Self-reflection is NOT self-correction (Huang et al. concern). It's a separate session evaluating the reviewers' output with the diff as external reference.

### Grounding

Deterministic verification (already implemented, 26 tests passing):
1. Read actual file at `line_start..line_end`
2. Normalize whitespace
3. Compare against `quoted_code`
4. Sliding window ±10 lines if exact match fails
5. Path traversal prevention

Findings that fail grounding are dropped with a reason. Hallucination rate tracked per run.

### Output

Three targets, all populated:

**Terminal**: real-time progress with 30s heartbeat, color-coded findings by severity and source reviewer.

**JSON file** (`{state_dir}/findings_final.json`):
```json
{
  "pr_number": 24,
  "findings": [...grounded findings...],
  "dropped": [...filtered/hallucinated...],
  "stats": {
    "reviewers": {"security": 3, "logic": 2, "edge_case": 3},
    "before_dedup": 8,
    "after_dedup": 6,
    "after_reflection": 4,
    "after_grounding": 3,
    "hallucination_rate": 0.125,
    "total_cost_usd": 1.70,
    "duration_s": 250
  }
}
```

**GitHub PR review**: single review via `POST /repos/{owner}/{repo}/pulls/{pr}/reviews` with:
- Summary body (stats, reviewer coverage)
- Inline comments on specific code lines
- Each comment tagged with source reviewer and confidence score

### Error Handling

| Failure | Response |
|---------|----------|
| 1 of 3 reviewers fails | Other 2 proceed. Summary notes "X reviewer failed" |
| All reviewers fail | Exit with error, no PR comment posted |
| Self-reflection fails | Skip scoring, pass all findings to grounding (grounding is the safety net) |
| Grounding fails | Exit with error (grounding is non-negotiable) |
| gh api PR comment fails | Findings still in terminal + JSON file. Warn user |
| PR branch checkout fails | Warn user, proceed (grounding may fail on some findings) |

### Partial Failure Design Principle

The pipeline degrades gracefully:
- All 3 reviewers + reflection + grounding = best quality
- 2 reviewers + grounding = good quality (1 reviewer failed)
- 3 reviewers + grounding only = good quality (reflection failed)
- Minimum viable: 1 reviewer + grounding = acceptable quality

Grounding is the only hard requirement. Everything else can degrade.

---

## Module Structure

```
review-fix-engine/
├── engine/
│   ├── __init__.py
│   ├── __main__.py            # python -m engine
│   ├── cli.py                 # CLI args + summary
│   ├── orchestrator.py        # Main flow
│   ├── agents.py              # Agent SDK wrappers (review_parallel, self_reflect)
│   ├── merge.py               # Merge + dedup findings
│   ├── grounding.py           # ✅ Verify quoted_code vs files
│   ├── github.py              # Post PR review comments via gh api
│   ├── progress.py            # ✅ Streaming display (adapt for parallel)
│   ├── schema.py              # ✅ Pydantic models (add source_reviewer)
│   ├── config.py              # ✅ Constants
│   ├── convergence.py         # ✅ (Phase 3)
│   ├── gates.py               # ✅ (Phase 2)
│   └── state.py               # ✅ (Phase 2/3)
├── agents/
│   ├── reviewer_base.md       # Shared schema, rules, process
│   ├── reviewer_security.md   # Security focus overlay
│   ├── reviewer_logic.md      # Logic focus overlay
│   ├── reviewer_edge_case.md  # Edge-case focus overlay
│   └── fixer.md               # ✅ (Phase 2)
├── tests/
│   ├── test_grounding.py      # ✅ 14 tests
│   ├── test_convergence.py    # ✅ 12 tests
│   ├── test_merge.py          # Merge + dedup tests
│   ├── test_schema.py         # Schema validation
│   └── test_github.py         # PR comment formatting
├── pyproject.toml
└── DESIGN_PRINCIPLES.md       # ✅ 10 principles
```

## Cost Estimate

Per review (72K diff, Opus model):
- 3 parallel reviewers: ~$1.50 ($0.50 each)
- Self-reflection: ~$0.20
- Grounding: $0 (no LLM)
- PR comment: $0 (gh api)
- **Total: ~$1.70 per review**

Wall-clock time: ~4-5 min (parallel reviewers dominate, ~250s based on POC)

## CLI Usage

```bash
# Review a PR (dry-run: no PR comments)
python -m engine --pr 24 --repo owner/repo --dry-run

# Review and post comments to GitHub
python -m engine --pr 24 --repo owner/repo

# Custom reviewers (any .md file in agents/ matching reviewer_*.md)
python -m engine --pr 24 --reviewers security,logic,edge_case,a11y

# As Claude Code skill
/review-fix 24
```

## Design Principles Applied

1. **Code orchestrates, LLMs execute** — orchestrator.py is Python, not LLM instructions
2. **Ground every claim** — grounding.py verifies all findings
3. **Embed data in prompts** — full diff in each reviewer's prompt
4. **One agent, one job** — each reviewer has one focus
5. **Enforce scope structurally** — reviewers have no tools, can't wander
6. **Bounded iterations** — max_turns=5 per reviewer
7. **New session per agent** — each reviewer is independent
8. **Structured output for machines** — JSON from prompt instructions
9. **Orchestrator commits** — (Phase 2)
10. **Output is a PR** — findings posted as PR review, human decides

## SDK Constraints (from POC)

- `output_format` + `allowed_tools` crashes CLI — use prompt-based JSON
- Python SDK throws post-result cleanup exception — catch if ResultMessage exists
- `permission_mode="dontAsk"` sufficient — no `allowed_tools` needed
- `include_partial_messages=True` for streaming — Python SDK uses `StreamEvent` class with dict `.event`
- No budget cap — let agent complete (Opus on 72K diff costs ~$0.50/reviewer)
