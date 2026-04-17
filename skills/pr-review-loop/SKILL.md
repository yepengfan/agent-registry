---
name: pr-review-loop
description: Run a deterministic review-fix loop on the current PR until convergence. Use when the user asks to review a PR, fix PR findings, run the PR review loop, or similar. Runs pr-reviewer and pr-fixer subagents with hallucination filtering and gate verification between rounds. Reports final status and trend metrics.
allowed-tools: Task, Bash, Read, Write
---

# PR Review Loop

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

Use the Task tool with `subagent_type: "pr-reviewer"`. Construct the prompt as follows:

- Start with: "Review PR #{N}." where {N} is the PR number from `gh pr view`.
- Include the PR diff: get via `gh pr diff` (or `git diff <base>..HEAD` if gh unavailable)
- Include the gate results from step 1, wrapped clearly:

```
DETERMINISTIC FACTS — do not reassess:
- tests_pass: <value from gates.json>
- lint_pass: <value from gates.json>
- build_pass: <value from gates.json>
```

Tell the reviewer explicitly and imperatively to use the Write tool. The prompt should include:

You have the Write tool. Use it to save your findings JSON to:
.pr-review-state/findings_raw_round_{N}.json

Do NOT return the JSON in your response. Do NOT emit <function_calls> XML or any tool-call-looking text. Actually invoke the Write tool through the tool interface.

After Write succeeds, return only a one-line confirmation matching the format in your agent prompt.

The above text block is sent verbatim to pr-reviewer (with {N} replaced by actual round number). This language is redundant with pr-reviewer's agent.md prompt but the redundancy is intentional — reviewers sometimes slip back into "pure LLM mode" if not strongly reminded they're a tool-using agent.

The reviewer writes the JSON file itself using the Write tool and returns only a one-line confirmation. You do NOT need to capture and save the reviewer's response content — the file is already on disk. Verify the file exists before proceeding to Step 3.

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

Only reached if step 5 returned `CONTINUE`. Filter the grounded findings to just `must-fix`:

```bash
jq '.findings | map(select(.severity == "must-fix"))' \
  ./.pr-review-state/findings_grounded_round_N.json \
  > ./.pr-review-state/fixer_input_round_N.json
```

If the filtered array is empty but `CONTINUE` was returned, something is off — go to step 7 anyway to record the round but don't invoke fixer.

If non-empty, use the Task tool with `subagent_type: "pr-fixer"`. The prompt:

```
Fix the following verified findings. Each has been ground-verified against real code.
After applying fixes, run tests/lint/build to verify, and commit to the current branch.

<paste contents of fixer_input_round_N.json>
```

Capture the fixer's status JSON and save to `./.pr-review-state/fixer_result_round_N.json`.

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
