# Agentic Review-Fix Loop: Design Principles

A theoretical foundation for building production-grade automated code review systems using LLM agents. Derived from research across Anthropic, OpenAI, Andrew Ng, and academic literature, validated against empirical observations from this project.

---

## Core Pattern: Evaluator-Optimizer

The review-fix loop implements the **Evaluator-Optimizer** pattern (Anthropic) / **LLM-as-Judge** pattern (OpenAI) / **Reflection** pattern (Andrew Ng):

```
┌─────────────────────────────────────────────────┐
│                  Orchestrator (Code)             │
│                                                  │
│   ┌──────┐   ┌──────────┐   ┌────────┐          │
│   │ Gates │──▶│ Reviewer │──▶│ Ground │──┐       │
│   └──────┘   └──────────┘   └────────┘  │       │
│       ▲                                  ▼       │
│       │      ┌──────────┐          ┌─────────┐   │
│       └──────│  Verify  │◀─────────│  Fixer  │   │
│              └──────────┘          └─────────┘   │
│                    │                             │
│              ┌─────▼──────┐                      │
│              │ Convergence │──▶ Exit or Loop     │
│              └────────────┘                      │
└─────────────────────────────────────────────────┘
```

**Key distinction from naive self-correction:** Huang et al. (2023, "Large Language Models Cannot Self-Correct Reasoning Yet", ICLR 2024) established that LLMs degrade when self-correcting without external feedback. The loop MUST be grounded in external signals (test execution, file verification, linter output) — not LLM self-critique.

---

## The 10 Principles

### 1. Code Orchestrates, LLMs Execute

The loop controller is deterministic code (script), not an LLM following instructions. The script owns: round counting, state management, convergence detection, gate evaluation, commit timing, and error recovery.

LLMs do the creative work: analyzing code, identifying bugs, applying fixes. They do NOT decide when to loop, when to stop, or whether gates passed.

**Why:** LLMs fail at counting rounds, detecting stalls, and enforcing convergence. Both Anthropic ("workflows use predefined code paths") and OpenAI ("code-first orchestration over declarative graphs") explicitly recommend this.

**Anti-pattern:** A SKILL.md that tells the LLM "follow these 7 steps in order, then loop." The LLM will skip steps, improvise, or hallucinate a "PASS" to end the loop early.

### 2. Ground Every LLM Claim in External Evidence

Every claim an LLM agent makes must be verified against concrete, external evidence before action is taken.

| Claim | Verification |
|-------|-------------|
| "This code has a bug at line 42" | Grounding script reads line 42, checks `quoted_code` matches |
| "All tests pass" | `npm test` exit code, not LLM assertion |
| "I fixed the issue" | `git diff` shows the expected change + tests pass |
| "The code is clean" | Zero grounded must-fix findings + all gates pass |

**Why:** The Self-Contrast paper (ACL 2024) found LLMs "exhibit overconfidence when self-evaluating." Stechly et al. (2023) found that observed improvement from self-critique was a sampling effect, not genuine reasoning correction.

**Implementation:** Deterministic scripts (`run_gates.sh`, `ground_findings.py`, `check_convergence.py`) handle all verification. These are not LLM agents — they are pure code.

### 3. Embed Data in Prompts, Never Say "Go Read This File"

The orchestrator fetches all data and embeds it directly in each agent's prompt. Agents should never be told to read a file to get their input data.

**Why:** Empirically validated: 100% hallucination rate when agents read files via tool calls vs 0% when data is embedded in the prompt. This is explained by "tool bypass behavior" (arXiv:2601.05214) — the model generates plausible-looking content instead of actually invoking the Read tool.

**Exception:** Agents MAY use Read to verify their own claims (e.g., reviewer reads a file to confirm line numbers for `quoted_code`). The distinction: reading for verification is optional and checked; reading for input is critical and prone to confabulation.

**Practical limit:** PR diffs >100KB should be split by file and fanned out to multiple reviewer calls. Grounded findings are typically 2-10KB and always fit in a prompt.

### 4. One Agent, One Job, One Prompt

Each agent has a single responsibility. The reviewer finds problems. The fixer applies fixes. They never do both.

**Why:** Every authoritative source (Anthropic, OpenAI, Andrew Ng) independently confirms that separating generator and evaluator roles produces better results than combining them. A single prompt that generates and critiques simultaneously is less effective than two distinct agents.

**Same model is fine.** The separation is in the prompt, not the model. Using Sonnet for both reviewer and fixer with different system prompts is correct. The reviewer doesn't need to be stronger — review (finding problems) is inherently easier than generation (writing correct code).

### 5. Enforce Scope with Tools and Scripts, Not Instructions

Telling an agent "only fix the listed findings" in a prompt is necessary but insufficient. Enforcement must be structural.

**Reliability hierarchy (highest → lowest):**

1. **Deterministic scripts** — File allowlist checks, diff size validation, gate comparisons. Cannot be bypassed by the LLM.
2. **Tool restrictions** — `allowedTools` scoping. The fixer literally cannot write to files outside the allowlist. Runtime-enforced.
3. **Output validation** — Post-hoc diff audit comparing actual changes against expected scope. Deterministic but after-the-fact.
4. **Prompt instructions** — "Fix ONLY the listed findings." Advisory. Can be ignored.
5. **LLM self-assessment** — "Did I stay in scope?" Unreliable. Anthropic notes agents "tend to respond by confidently praising the work."

**Why scope discipline is #1:** Every research agent independently identified scope creep as the primary divergence risk. A fixer that "helpfully" refactors adjacent code while fixing a bug introduces unreviewed changes, breaks convergence detection, and can trigger infinite loops.

### 6. Bound Iterations (Max 3 Rounds)

The loop has a hard cap on iterations. 3 rounds is the practical ceiling.

- **Round 1:** Catches obvious issues.
- **Round 2:** Catches issues introduced by Round 1 fixes.
- **Round 3:** Diminishing returns — exit unless strong signal.
- **Round 4+:** Almost always noise.

**Why:** The Self-Refine paper (Madaan et al., 2023) showed most improvement happens in iterations 1-2, with diminishing returns after 3. The Self-Debugging paper (Chen et al., 2023) confirms the same pattern. Signal-to-noise ratio deteriorates per round as the reviewer searches harder for problems that may not exist.

**Convergence exits before max rounds:**
- `PASS`: Zero grounded must-fix findings + all gates pass.
- `STALLED`: Finding count is non-decreasing for 2 consecutive rounds.
- `OSCILLATING`: Previously-fixed findings reappear.
- `REGRESSION`: Gates that passed in round N-1 fail in round N.

### 7. New Session Per Agent Invocation

Each agent call is a fresh session with clean context. The orchestrator carries state between rounds via files, not via LLM conversation history.

**Why:**
- **Hallucination isolation:** A reviewer in round 3 can't be biased by its own hallucinated findings from round 1 (which were dropped by grounding).
- **Bounded cost:** Each invocation is independently bounded by `maxTurns` and `maxBudgetUsd`.
- **Debuggability:** Each round's prompt is self-contained and replayable.
- **No context window pressure:** 20-30K tokens/round × 3 rounds would require compaction in a shared session.

**What the orchestrator carries between rounds:** Round history, findings per round, hallucination rates, gate results, convergence status — all in JSON files on disk.

### 8. Structured Output for Machine Consumers Only

Use JSON schema enforcement (`outputFormat`) when the downstream consumer is a script. Use free-form output when the consumer needs to reason.

| Agent | Output Format | Consumer | Why |
|-------|--------------|----------|-----|
| Reviewer | JSON Schema (enforced) | Grounding script | Script must parse findings programmatically |
| Fixer | Free-form | Git diff + orchestrator | Fixer needs to reason about code changes, run tests, make judgment calls |

**Why:** Tam et al. (2024) found "significant decline in LLM reasoning abilities under format restrictions." Forced structure degrades creative work. But for the reviewer→grounding→fixer pipeline, machine-parseable JSON is non-negotiable.

**Mitigation:** Include reasoning fields (`reasoning`, `summary`) in the schema so the model can "think within structure" rather than being purely constrained.

### 9. Fixer Doesn't Commit; Orchestrator Commits After Gates Pass

The fixer applies code changes. The orchestrator verifies gates pass, then commits. If gates fail, the orchestrator reverts.

**Why:** In a loop, commit timing is a control-flow decision. If the fixer commits but tests fail, the orchestrator must revert — adding complexity. If the orchestrator controls commits:

```
fixer applies changes → orchestrator runs gates
  ├── gates pass → orchestrator commits
  └── gates fail → orchestrator reverts (git checkout)
```

This is simpler and safer than asking the fixer to commit-then-maybe-revert.

### 10. The Loop's Output Is a PR, Not a Merge

The review-fix loop produces commits on a feature branch. A human reviews the PR before merge. This is the ultimate safety net.

**Why:** OpenAI recommends "always require human review for high-risk actions." Automated code modification is inherently high-risk. The loop should reduce human review burden, not eliminate it.

**Autonomy zones (no human needed):**
- Running gates
- Grounding findings
- Convergence checks
- Reverting failed fixes

**Human checkpoints:**
- Before merge (always)
- When loop terminates with `STALLED` or `MAX_ROUNDS`
- When fixer skips findings with structured pushback
- When hallucination rate exceeds 50%

---

## Failure Modes Reference

| Failure Mode | Detection | Response |
|---|---|---|
| **Oscillation** | Same findings reappear after being fixed | Exit `OSCILLATING`, escalate |
| **Scope creep** | Diff touches files not in findings list | Revert, flag for human review |
| **Hallucinated findings** | Grounding drops >50% of findings | Continue (grounding handles it), warn if persistent |
| **Sycophantic fixing** | Fixer skip rate <5% across many rounds | Monitor — fixer may be too compliant |
| **Regression** | Gates worse after fix than before | Revert fix commit, exit `REGRESSION` |
| **Stall** | Finding count non-decreasing for 2 rounds | Exit `STALLED`, report remaining findings |
| **Cost runaway** | Cumulative cost exceeds budget | Exit `BUDGET_EXCEEDED` |
| **Reviewer can't parse** | Non-JSON output | Exit `REVIEWER_PARSE_ERROR`, save raw output for debugging |

---

## Guardrail Layers

```
Layer 1: Input Validation (before agent runs)
  - PR diff size within bounds
  - Branch is not main/master
  - No protected files in diff (.env, CI configs)

Layer 2: Tool Restrictions (during agent execution)
  - Reviewer: Read, Grep, Glob (read-only)
  - Fixer: Read, Edit, Bash(scoped to git/test)
  - File allowlist enforcement via tool guardrails

Layer 3: Output Validation (after agent completes)
  - Reviewer: JSON schema compliance + grounding verification
  - Fixer: Diff audit (scope check), diff size limit

Layer 4: Gate Verification (deterministic scripts)
  - Tests, lint, build must pass
  - No regressions from previous round

Layer 5: Convergence Control (deterministic script)
  - Max rounds, stall detection, oscillation detection
  - Monotonic improvement constraint
```

---

## Key Sources

| Source | Contribution |
|--------|-------------|
| Anthropic, "Building Effective Agents" (2024) | Pattern taxonomy, ACI concept, "start simple" principle |
| OpenAI, "A Practical Guide to Building Agents" (2025) | Manager vs decentralized patterns, guardrail taxonomy, incremental approach |
| Andrew Ng, "Agentic Design Patterns" (2024) | 4-pattern framework, maturity ranking |
| Huang et al., "LLMs Cannot Self-Correct" (ICLR 2024) | External grounding requirement |
| Tam et al., "Format Restrictions" (2024) | Structured output degrades reasoning |
| Madaan et al., "Self-Refine" (2023) | Diminishing returns after 2-3 iterations |
| Chen et al., "Self-Debugging" (2023) | Execution feedback > self-assessment |
| Shinn et al., "Reflexion" (2023) | Specific actionable feedback > general critique |
| Yang et al., "SWE-agent" (2024) | Tool descriptions > system prompts |
| Healy et al., "Tool Bypass Behavior" (2026) | Why agents hallucinate with tool calls |
