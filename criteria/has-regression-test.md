---
name: has-regression-test
description: Bugfix PRs must include a test that reproduces the fixed bug
gate: true
metric: regression_test_present
pass_when: "at least one new test targets the fixed behavior"
---

## Has Regression Test

Bugfix PRs must include at least one new test that would have caught the bug before the fix.

### Pass
A new or modified test exists that directly exercises the behavior that was broken. The test name or assertions clearly relate to the fix.

### Fail
No new test targets the fixed behavior. Report what test is expected and where it should go.

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "has-regression-test", "gate": true, "pass": <bool>, "metric": "regression_test_present", "value": "<yes|no>", "detail": "<summary>"}
```
