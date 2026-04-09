# Criteria System Design

**Date:** 2026-04-09
**Status:** Approved
**Scope:** New registry primitive for measurable quality criteria

## Problem

Agents and orchestrators have no formal way to measure whether work quality is improving across rounds. The PR orchestrator implicitly tracks "must-fix count decreasing," but this is ad-hoc logic, not a reusable pattern. Other orchestrators would need to reinvent quality measurement from scratch.

Behaviors define HOW agents work (discipline rules). What's missing is a system for defining WHAT "good enough" means and measuring progress toward it.

## Inspiration

Based on the [planner-generator-evaluator pattern](https://www.anthropic.com/engineering/harness-design-long-running-apps) from Anthropic Engineering:

- Separate evaluator agents are more effective than self-evaluation
- Criteria should be explicit, structured, and domain-specific
- Per-criterion pass/fail with specific reasoning is more practical than numeric scoring
- Hard thresholds (gates) define exit conditions; advisory criteria provide visibility

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Registry scope | New primitive (`criteria/`) | Composable and reusable, same pattern as behaviors |
| Scoring model | Per-criterion pass/fail | Practical, no numeric calibration needed |
| Criteria source | Frontmatter + caller override | Agents declare defaults, callers can add/remove per invocation |
| Exit condition | Gate vs advisory per criterion | Gates block completion, advisory reports only |
| Criteria detail | Declarative (what, not how) | Evaluator agent interprets; no executable code in criteria files |
| Evaluator role | Existing pr-reviewer | No new agent needed; reviewer already acts as evaluator |
| Initial scope | PR workflow only | Validates the pattern, generalize to other agents later |

## Criteria File Format

Criteria live in `criteria/` as markdown files:

```markdown
# criteria/zero-must-fix-issues.md
---
name: zero-must-fix-issues
description: No must-fix issues remain after review
gate: true
metric: must_fix_count
pass_when: "equals 0"
---

## Zero Must-Fix Issues

The PR must have zero must-fix severity issues remaining after review.

A must-fix issue is:
- A bug, security vulnerability, broken error handling, or breaking API change
- NOT a style suggestion, minor refactor, or nice-to-have improvement

### Pass
All issues found are severity "suggestion" or lower. Zero "must-fix" items remain.

### Fail
One or more "must-fix" issues remain. Report each with file, line, and reason.
```

### Frontmatter Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Unique identifier, matches filename |
| `description` | string | yes | One-line purpose |
| `gate` | boolean | yes | `true` = blocks completion, `false` = advisory only |
| `metric` | string | yes | Machine-readable key for the measured value |
| `pass_when` | string | yes | Natural language pass condition (hint for evaluator) |

### Body

Natural language describing what the criterion means, with explicit Pass and Fail sections. Same role as behavior body text — injected into the evaluator's prompt at install time.

## Agent Frontmatter Integration

Agents declare criteria in frontmatter, same pattern as behaviors:

```yaml
---
name: pr-reviewer
type: agent
behaviors:
  - evidence-based-claims
criteria:
  - zero-must-fix-issues
  - all-tests-pass
interface:
  input: PR number or URL
  output: JSON summary with issues array and criteria_results array
---
```

### Injection mechanisms

Criteria content reaches the evaluator's prompt via two paths:

1. **Install-time injection** (standalone use): The installer reads `criteria:` from frontmatter and appends criteria content to the agent prompt, identical to how behaviors are injected. This covers the default case when an agent is invoked directly.

2. **Dispatch-time injection** (orchestrator use): When an orchestrator dispatches a sub-agent via the Agent tool, it builds the prompt dynamically — reading the agent.md body, behaviors, and criteria. This is where caller overrides take effect: the orchestrator resolves the final criteria list before building the dispatch prompt.

### Key distinction

- `behaviors:` = injected into ANY agent (discipline rules for how to work)
- `criteria:` = injected into EVALUATOR agents (what to measure and report on)

### Orchestrators

Orchestrators do NOT declare criteria. They read `criteria_results` from their evaluator sub-agents:

```yaml
---
name: pr-orchestrator
type: orchestrator
subagents:
  - pr-reviewer
  - pr-fixer
behaviors:
  - evidence-based-claims
  - independent-output-verification
---
```

## Evaluator Output Contract

The pr-reviewer's JSON output gains a `criteria_results` array alongside the existing `issues` array:

```json
{
  "pr": 123,
  "issues": [
    {"severity": "must-fix", "file": "src/app.js", "line": 42, "message": "Unhandled promise rejection"},
    {"severity": "suggestion", "file": "src/utils.js", "line": 10, "message": "Extract into named function"}
  ],
  "criteria_results": [
    {
      "criterion": "zero-must-fix-issues",
      "gate": true,
      "pass": false,
      "metric": "must_fix_count",
      "value": 1,
      "detail": "1 must-fix issue remains: unhandled promise rejection in src/app.js:42"
    },
    {
      "criterion": "all-tests-pass",
      "gate": true,
      "pass": true,
      "metric": "test_pass_rate",
      "value": "47/47",
      "detail": "All 47 tests pass"
    }
  ],
  "summary": "Found 1 must-fix issue and 1 suggestion. Criteria: 1/2 gates passing."
}
```

### Criteria Result Schema

| Field | Type | Description |
|-------|------|-------------|
| `criterion` | string | Name matching the criteria file |
| `gate` | boolean | Copied from criteria frontmatter |
| `pass` | boolean | Whether the criterion is met |
| `metric` | string | The metric key from criteria frontmatter |
| `value` | string\|number | The measured value |
| `detail` | string | Human-readable explanation of the result |

### Rules

- Every criterion in the resolved criteria list (frontmatter defaults + caller overrides) MUST appear in `criteria_results`
- `pass` is the evaluator's judgment based on `pass_when` hint and its own analysis
- `value` is the raw measurement so orchestrators can log/compare without parsing `detail`
- `detail` provides context for the orchestrator's summary comment

## Orchestrator Exit Logic

The orchestrator's workflow changes from ad-hoc "zero must-fix = done" to a standardized gate check:

```
Round loop (max N rounds):
  1. Dispatch pr-reviewer -> get criteria_results
  2. Filter: failing_gates = criteria_results where gate=true AND pass=false
  3. If failing_gates is empty -> EXIT: all gates pass, post summary, done
  4. If round < max_rounds -> dispatch pr-fixer with failing issues, go to 1
  5. If round = max_rounds -> EXIT: post summary with remaining failures
```

### Changes to pr-orchestrator

**Step 4 (Evaluate Review Results):**
- Parse `criteria_results` from reviewer output
- Extract entries where `gate: true` and `pass: false`
- If none: all gates pass, post summary, exit
- If any: extract failing criteria details, dispatch fixer

**Step 7 (Post Final Summary):**
- Per-criterion results (pass/fail with detail)
- Gate vs advisory distinction
- If multi-round: which criteria flipped from fail to pass across rounds

**Max rounds** stays as a safety valve in the orchestrator's rules. Criteria define what "done" means within those rounds but do not change the round limit.

**Advisory criteria** are always reported in the summary but never block completion.

## Caller Override Mechanism

Users can add or replace criteria when invoking an agent:

```bash
# Use agent's default criteria
/pr-orchestrator 123

# Add an extra criterion for this run
/pr-orchestrator 123 --criteria +no-new-lint-warnings

# Override: use ONLY these criteria (replaces defaults)
/pr-orchestrator 123 --criteria zero-must-fix-issues,all-tests-pass,no-new-lint-warnings

# Remove a default criterion for this run
/pr-orchestrator 123 --criteria -all-tests-pass
```

### Syntax

- `--criteria name1,name2` — replaces all default criteria
- `--criteria +name` — adds to defaults
- `--criteria -name` — removes from defaults
- No flag — uses agent's frontmatter defaults

### Flow

1. Caller passes `--criteria` flag to the orchestrator
2. Orchestrator reads the evaluator sub-agent's frontmatter to get default `criteria:` list
3. Orchestrator applies overrides: adds (`+`), removes (`-`), or replaces the defaults
4. Orchestrator reads criteria files from `criteria/` for the resolved list
5. Orchestrator builds the dispatch prompt: agent body + behaviors + resolved criteria content
6. Evaluator receives criteria in prompt, evaluates, returns `criteria_results`

This uses the dispatch-time injection path. The installed version of the evaluator has its defaults baked in, but the orchestrator overrides those by constructing the full prompt at dispatch time.

### Validation

Criteria names in `--criteria` must match files in `criteria/`. If a caller references a nonexistent criterion, the orchestrator reports an error before dispatching any sub-agent.

## Initial Criteria Files

Three criteria for the PR workflow:

### 1. `criteria/zero-must-fix-issues.md` (gate)

No must-fix severity issues remaining after review. Must-fix = bugs, security vulnerabilities, broken error handling, missing tests for critical paths, breaking API changes.

### 2. `criteria/all-tests-pass.md` (gate)

Full test suite passes with zero failures. Value reports pass count (e.g., "47/47").

### 3. `criteria/no-new-lint-warnings.md` (advisory)

PR does not introduce new lint or type-check warnings beyond what existed on the base branch. Reported for visibility but does not block completion.

## Relationship to Existing Concepts

| Concept | Purpose | When evaluated |
|---------|---------|----------------|
| Behaviors | Discipline rules (HOW to work) | Continuously during agent execution |
| Criteria | Quality metrics (WHAT "good enough" means) | At evaluation checkpoints by evaluator agents |

Behaviors and criteria are complementary:
- `evidence-based-claims` (behavior) ensures the evaluator backs its criteria judgments with evidence
- `zero-must-fix-issues` (criterion) defines what the evaluator measures
- The behavior governs HOW the criterion is evaluated; the criterion defines WHAT is evaluated

## Future Extensions

Not in scope for this implementation, but the design supports:

- **Round tracking**: Orchestrators could pass previous `criteria_results` to the evaluator for explicit improvement comparison
- **Stall detection**: If a gate criterion's value doesn't improve across rounds, exit early
- **Criteria for other agents**: DevOps deployment criteria, deck quality criteria, etc.
- **Weighted advisory criteria**: Advisory criteria with importance weights for richer reporting
