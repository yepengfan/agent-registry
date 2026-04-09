---
name: no-new-lint-warnings
description: PR does not introduce new lint warnings
gate: false
metric: new_lint_warning_count
pass_when: "equals 0"
---

## No New Lint Warnings

The PR should not introduce new lint or type-check warnings beyond what existed on the base branch.

### Pass
No new warnings introduced by the PR's changed files.

### Fail
New warnings found. Report each with file, line, and warning message.

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "no-new-lint-warnings", "gate": false, "pass": <bool>, "metric": "new_lint_warning_count", "value": <number>, "detail": "<summary>"}
```
