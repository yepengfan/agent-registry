---
name: all-tests-pass
description: All existing tests pass after changes
gate: true
metric: test_pass_rate
pass_when: "all tests pass with zero failures"
---

## All Tests Pass

The full test suite must pass with zero failures after the PR's changes.

### Pass
Test runner reports 0 failures. Include pass count in value (e.g., "47/47").

### Fail
One or more tests fail. Report the failing test names and error messages.

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "all-tests-pass", "gate": true, "pass": <bool>, "metric": "test_pass_rate", "value": "<pass>/<total>", "detail": "<summary>"}
```
