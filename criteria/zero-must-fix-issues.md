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

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "zero-must-fix-issues", "gate": true, "pass": <bool>, "metric": "must_fix_count", "value": <number>, "detail": "<summary>"}
```
