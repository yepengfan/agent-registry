---
name: pr-review-loop
description: Run a deterministic review-fix loop on the current PR until convergence. Use when the user asks to review a PR, fix PR findings, run the PR review loop, or similar. Runs pr-reviewer and pr-fixer subagents with hallucination filtering and gate verification between rounds. Reports final status and trend metrics.
allowed-tools: Task, Bash, Read, Write
---

# PR Review Loop

## Known limitation: custom subagent tool access

Due to Claude Code issue anthropics/claude-code#12392, custom subagents in ~/.claude/agents/ cannot actually invoke tools — they emit fake tool-call XML as text. Built-in subagents (general-purpose, Explore, Plan) work correctly.

This skill works around that by invoking `subagent_type: "general-purpose"` and injecting the pr-reviewer/pr-fixer role via prompt. The prompt is assembled by `scripts/build_reviewer_prompt.sh` and `scripts/build_fixer_prompt.sh` from template files in `templates/`. All inline prompt text lives in those .txt files — SKILL.md itself does not contain the literal prompt content, to avoid markdown parsing corruption of angle-bracket placeholders and nested code fences.

When issue #12392 is fixed, the workaround can be reverted by:
1. Changing Steps 2 and 6 back to direct `subagent_type: "pr-reviewer"` / `"pr-fixer"` invocation
2. Deleting scripts/build_*.sh and templates/

You are orchestrating a review-fix loop on a PR. Drive the loop faithfully. Do not skip steps. Do not substitute your own judgment for the deterministic scripts — they exist specifically to catch LLM judgment errors you can't self-detect.

## Before starting

Verify the working directory is a git repo with a PR checked out:

```bash
gh pr view --json number,title,baseRefName,headRefName 2>&1 | head -20
```

If no PR is associated with the current branch, STOP and ask the user to check out the PR branch first.

If this is the first run in this session, create the state directory and initialize state:

```bash
mkdir -p ./.pr-review-state
cat > ./.pr-review-state/pr-review-loop.json <<'JSON'
{
  "round": 0,
  "max_rounds": 8,
  "required_consecutive_clean": 2,
  "hard_fail_on_gate_failure_rounds": 3,
  "history": []
}
JSON
```

## Per-round procedure (execute exactly in this order)

### 1. Run deterministic gates

```bash
bash skills/pr-review-loop/scripts/run_gates.sh
```

Output goes to `./.pr-review-state/gates.json`. Read it to see the results. Do NOT re-run tests yourself. Do NOT assume gate results from other signals.

### 2. Invoke pr-reviewer subagent

Build the Task prompt from templates and invoke general-purpose subagent.

Step 2a — Get PR number:

```bash
PR_NUM=$(gh pr view --json number -q .number)
```

Step 2b — Read gate results to extract pass/fail booleans:

```bash
TESTS_PASS=$(jq -r '.tests.pass' .pr-review-state/gates.json)
LINT_PASS=$(jq -r '.lint.pass' .pr-review-state/gates.json)
BUILD_PASS=$(jq -r '.build.pass' .pr-review-state/gates.json)
```

Step 2c — Build the prompt:

```bash
bash skills/pr-review-loop/scripts/build_reviewer_prompt.sh \
  --round <CURRENT_ROUND> \
  --pr-num "$PR_NUM" \
  --tests-pass "$TESTS_PASS" \
  --lint-pass "$LINT_PASS" \
  --build-pass "$BUILD_PASS" \
  > /tmp/reviewer_prompt.txt
```

Replace `<CURRENT_ROUND>` with the actual round number (1, 2, 3...).

Step 2d — Read the assembled prompt and invoke Task:

Read /tmp/reviewer_prompt.txt into a variable, then invoke:

- subagent_type: "general-purpose" (NOT "pr-reviewer" — see Known Limitation at top)
- prompt: the entire contents of /tmp/reviewer_prompt.txt

Step 2e — Verify reviewer wrote the findings file:

```bash
ls -la .pr-review-state/findings_raw_round_<CURRENT_ROUND>.json
```

If the file doesn't exist, the subagent failed to invoke Write. Terminate the loop and report the subagent's text response to the user. Do NOT proceed to Step 3.

### 3. Ground-verify every finding

```bash
python3 skills/pr-review-loop/scripts/ground_findings.py \
  --input ./.pr-review-state/findings_raw_round_N.json \
  --output ./.pr-review-state/findings_grounded_round_N.json \
  --repo .
```

The script reads each finding, opens the referenced file, and checks that `quoted_code` matches the content at `line_start..line_end`. It writes a new file with two arrays: `findings` (grounded) and `dropped` (hallucinated), plus `stats.hallucination_rate`.

**You must use this script.** Do not manually judge whether a finding is real. If the script drops it, it's dropped.

### 4. Update state with this round's result

Read `./.pr-review-state/pr-review-loop.json`, and append this round to `history`:

```json
{
  "round_num": N,
  "gates": {"all_pass": <bool>, "tests_pass": ..., "lint_pass": ..., "build_pass": ...},
  "grounded_findings": [... array from findings_grounded_round_N.json ...],
  "dropped_count": <from stats>,
  "hallucination_rate": <from stats>
}
```

Write it back. Increment `round`.

### 5. Check convergence

```bash
python3 skills/pr-review-loop/scripts/check_convergence.py \
  --state ./.pr-review-state/pr-review-loop.json
```

Reads exactly one line:

- `PASS` — Last N rounds had zero must-fix findings AND all gates pass. Report success to user, stop.
- `FAIL_STALLED` — Last two rounds had the same grounded must-fix set. Fixer isn't making progress. Report last findings to user, stop.
- `FAIL_GATES` — Gates failing for several rounds but reviewer can't produce grounded findings. Likely infra or test flakiness. Report gate output to user, stop.
- `MAX_ROUNDS` — Hit the cap without converging. Report state to user, stop.
- `CONTINUE` — Go to step 6.

### 6. Invoke pr-fixer subagent

Only reached if step 5 returned `CONTINUE` AND there are grounded must-fix findings.

Step 6a — Prepare the findings input file (same jq filter as before):

```bash
jq '.findings | map(select(.severity == "must-fix"))' \
  ./.pr-review-state/findings_grounded_round_<N>.json \
  > ./.pr-review-state/fixer_input_round_<N>.json
```

If the filtered array is empty but `CONTINUE` was returned, something is off — go to step 7 anyway to record the round but don't invoke fixer.

Step 6b — Build the fixer prompt:

```bash
bash skills/pr-review-loop/scripts/build_fixer_prompt.sh \
  --round <CURRENT_ROUND> \
  --findings-file ./.pr-review-state/fixer_input_round_<CURRENT_ROUND>.json \
  > /tmp/fixer_prompt.txt
```

Step 6c — Invoke Task:

- subagent_type: "general-purpose" (NOT "pr-fixer" — see Known Limitation)
- prompt: the entire contents of /tmp/fixer_prompt.txt

Step 6d — Read the fixer's status output. The fixer writes its status JSON to `.pr-review-state/fixer_result_round_<N>.json`. Read that file to determine outcome.

### 7. Loop back to step 1

Proceed to the next round. The next `run_gates.sh` call picks up the fixer's new commit automatically.

## Final report (after loop terminates)

Regardless of termination status, emit a summary to the user:

```
PR Review Loop — <final status>
Rounds run: <N> of <max_rounds>

Hallucination rate trend:
  Round 1: <X>%  (raw: <R>, grounded: <G>, dropped: <D>)
  Round 2: <X>%
  ...

Final grounded findings (must-fix): <count>
Final grounded findings (nice-to-have, not auto-fixed): <count, with short list>

Gate status on final round:
  tests: <pass/fail>
  lint:  <pass/fail>
  build: <pass/fail>

<if FAIL_STALLED>
Stalled on these findings — fixer could not resolve:
  - F-XXX: <claim> (file:line)
  - ...

<if FAIL_GATES>
Gates failing with tail output:
  <last 20 lines from gates.json>

<if MAX_ROUNDS>
Reached max rounds with remaining must-fix findings:
  - ...

<if PASS>
All must-fix findings resolved. PR is ready for human review.
```

## What you MUST NOT do

- **Don't skip `run_gates.sh`.** Never assume tests/lint/build passed or failed based on intuition.
- **Don't skip `ground_findings.py`.** Never pass reviewer output directly to fixer — grounding is what prevents hallucination damage.
- **Don't skip `check_convergence.py`.** Never decide "I think we're done" or "let's do one more round" — the script decides.
- **Don't modify findings between reviewer and fixer.** Grounding is filtering, not editing. Pass findings through as-is after the grounding step.
- **Don't re-prompt the reviewer with different instructions.** The reviewer prompt is fixed. Varying it between rounds makes rounds non-comparable.
- **Don't proceed past `max_rounds`.** If the script says `MAX_ROUNDS`, stop.

## Edge cases

**Reviewer returns non-JSON.** The ground script expects `{"findings": [...]}` at minimum. If the reviewer output can't be parsed, that's a reviewer bug — save the raw output to `./.pr-review-state/reviewer_parse_error_round_N.log`, terminate the loop, and report to the user. Don't try to salvage.

**Fixer returns `status: "failed"`.** Record in history (with `fix_attempted: true, fix_succeeded: false`), still check convergence. Likely leads to `FAIL_STALLED` on next round.

**Round N's fixer somehow broke tests that were passing in round N-1.** Next round's `run_gates.sh` will catch it. `safe-revert-on-failure` behavior on pr-fixer should have prevented this, but if it didn't, the gate failure triggers the `FAIL_GATES` path after a few rounds.

**User asks you to "just quickly review" without running the loop.** That's a different request — use pr-reviewer directly via Task tool, don't invoke this skill's loop. This skill is specifically for the review-fix-verify cycle.
