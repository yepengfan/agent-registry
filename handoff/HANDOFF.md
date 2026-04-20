# Handoff: PR Review Loop MVP

You are implementing a refactor of the `pr-review` workflow in this repo (agent-registry). This handoff document explains what to change and why, then lists exact edits.

## Context (read this first)

### Problem being solved

The current `pr-orchestrator` agent uses Opus to drive a review-fix loop by prompting itself each round. This has three failure modes:

1. **Hallucination amplification** — Reviewer fabricates findings referencing code that doesn't exist; fixer "fixes" nothing-code; next round reviewer finds new fake issues. The loop diverges instead of converging.
2. **LLM counts rounds unreliably** — Opus miscounts "consecutive clean rounds" and sometimes stops early or runs extra.
3. **Tests-pass claims are unverified** — Reviewer claims "all tests pass" without running them.

### Solution: Skill-as-orchestrator with deterministic grounding

- Replace `pr-orchestrator` agent with `skills/pr-review-loop/` skill
- Main Claude (in Claude Code) becomes the orchestrator, driven by `SKILL.md`
- Every round:
  1. A bash script runs tests/lint/build (deterministic, not LLM-claimed)
  2. Main Claude invokes `pr-reviewer` subagent via Task tool
  3. A Python script verifies each finding references real code at the cited lines
  4. Non-grounded findings are dropped before they reach `pr-fixer`
  5. A Python script decides whether to loop again (PASS / STALL / continue)
- Reviewer's output format changes from free text to strict JSON schema
- Fixer accepts only grounded findings

### Why this architecture fits Claude Code

In Claude Code CLI, the main agent already IS the orchestrator. Wrapping it in an external Python workflow would fight the tool. Instead, the skill provides a procedure for main Claude to follow, and the scripts handle deterministic work (counting, grounding, running tests) that LLMs do poorly.

### What's explicitly out of scope for this MVP

- Parallel reviewers (sectioning/voting)
- Profile-based reviewer routing (frontend/backend specialization)
- Figma / Playwright visual verification
- Nice-to-have findings are reported but not auto-fixed

Add these only after MVP is proven stable.

---

## Changes to make (in order)

### 1. Delete `agents/pr-orchestrator/`

```bash
git rm -r agents/pr-orchestrator/
```

This agent is being replaced by the skill. No deprecation stub — clean removal.

### 2. Replace `agents/pr-reviewer/agent.md`

Full replacement. See `agents/pr-reviewer/agent.md` in this handoff package. Key changes:
- Output format: strict JSON matching `skills/pr-review-loop/schemas/finding.schema.json`
- Every finding MUST include `file`, `line_start`, `line_end`, `quoted_code` (verbatim)
- Reviewer is told gate results are facts, not to re-assess them
- Explicit permission to return empty findings list

### 3. Replace `agents/pr-fixer/agent.md`

Full replacement. See `agents/pr-fixer/agent.md` in this handoff package. Key changes:
- Accepts structured JSON input (array of grounded findings)
- Instructed to commit each round's fixes to the PR branch
- Must not modify code outside the listed findings
- `safe-revert-on-failure` behavior retained

### 4. Create `skills/pr-review-loop/`

New skill with this structure:

```
skills/pr-review-loop/
  SKILL.md
  scripts/
    run_gates.sh
    ground_findings.py
    check_convergence.py
  schemas/
    finding.schema.json
```

All files provided in this handoff package.

### 5. Update top-level `README.md`

Remove `pr-orchestrator` row from the Agents table. Add `pr-review-loop` row to the Skills table:

| Skill | Description |
|---|---|
| [pr-review-loop](skills/pr-review-loop) | Deterministic review-fix loop with grounding verification |
| slides | ... (existing) |

### 6. Update `.gitignore`

Add:
```
# Runtime state from pr-review-loop skill
.claude/state/
```

### 7. Verify install works

```bash
node test.js
npx @yepengfan/agent-registry status
```

Expect: `pr-orchestrator` no longer listed. `pr-review-loop` skill appears.

---

## Validation checklist (run after changes)

This is the dogfood test — review a real PR in agent-registry using the new skill.

### Prep
- [ ] Create a branch `test/pr-review-loop-dogfood`
- [ ] Make 3 intentional issues in some file (one real bug, one style nit, one non-issue)
- [ ] Push and open a PR

### Run
- [ ] In Claude Code, in this repo, invoke: "Review the current PR using the pr-review-loop skill"
- [ ] Main Claude should read `SKILL.md`, then execute steps 1-6

### Observe per round
- [ ] `./.claude/state/gates.json` is written and has real test output
- [ ] `./.claude/state/findings_raw_round_N.json` is valid JSON matching schema
- [ ] `./.claude/state/findings_grounded_round_N.json` has `stats.hallucination_rate` reported
- [ ] `check_convergence.py` prints exactly one of: CONTINUE / PASS / FAIL_STALLED / FAIL_GATES / MAX_ROUNDS
- [ ] Each round's fixer commit is visible in `git log`

### Expected outcomes
- [ ] If you seeded 1 real bug + 1 style nit + 1 non-issue: loop should converge in 2-3 rounds with the real bug fixed, style nit reported as `nice-to-have`, non-issue either not reported (good) or reported but dropped by grounding (also fine)
- [ ] Final summary report to user includes: status, rounds used, hallucination rate per round, nice-to-haves list

### If something goes wrong
- Main Claude skips a script → SKILL.md wording isn't strict enough, adjust
- Reviewer outputs prose instead of JSON → reviewer prompt isn't strict enough, adjust
- Hallucination rate > 30% consistently → reviewer needs stronger quoted_code instruction
- Loop runs 8 rounds without converging on a small PR → something is wrong with convergence logic or fixer isn't actually fixing

---

## File manifest

All files in this handoff are final content — copy them verbatim into the repo.

- `agents/pr-reviewer/agent.md` — full replacement
- `agents/pr-fixer/agent.md` — full replacement
- `skills/pr-review-loop/SKILL.md` — new file
- `skills/pr-review-loop/scripts/run_gates.sh` — new file (chmod +x after copying)
- `skills/pr-review-loop/scripts/ground_findings.py` — new file
- `skills/pr-review-loop/scripts/check_convergence.py` — new file
- `skills/pr-review-loop/schemas/finding.schema.json` — new file

No changes to `lib/`, `bin/`, `install.sh`, `package.json`, or existing behaviors/criteria.

---

## After the MVP ships

Once the dogfood PR converges cleanly and hallucination rates are measurable, next candidates:

1. **Parallel reviewers** — Split `pr-reviewer` into `correctness-reviewer`, `security-reviewer`, `testing-reviewer`. Run in parallel, aggregate findings. Cuts per-reviewer context, improves coverage.
2. **Profile-aware reviewer selection** — Extend profiles to declare which reviewers to use (frontend profile pulls `ui-reviewer`, backend pulls `api-reviewer`).
3. **Figma token diff** — Deterministic comparison of Figma design tokens vs code tokens, with LLM only judging whether diffs are intentional.
4. **Playwright integration** — Rendered screenshot diff for UI PRs.

Don't start these until MVP has 5+ successful real-world runs with data showing stable convergence.
