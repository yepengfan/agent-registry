---
name: has-test-coverage
description: New feature code has corresponding test coverage
gate: true
metric: new_code_test_coverage
pass_when: "all new public functions/endpoints have at least one test"
---

## Has Test Coverage

Feature PRs must have test coverage for new public functions, endpoints, or components.

### Pass
Every new public function, API endpoint, or component has at least one corresponding test.

### Fail
One or more new public interfaces lack tests. Report each untested function/endpoint with file and line.

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "has-test-coverage", "gate": true, "pass": <bool>, "metric": "new_code_test_coverage", "value": "<covered>/<total>", "detail": "<summary>"}
```
