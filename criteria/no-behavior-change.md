---
name: no-behavior-change
description: Refactor PRs must not change observable behavior
gate: true
metric: behavior_change_detected
pass_when: "no changes to public API signatures, no new/removed exports, no changed test assertions"
---

## No Behavior Change

Refactor PRs must not change observable behavior. The code may be restructured but external contracts must remain identical.

### Pass
No changes to public API signatures, no new or removed exports, no changed test assertions, no altered return values.

### Fail
Observable behavior changed. Report each change with file, line, and what differs.

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "no-behavior-change", "gate": true, "pass": <bool>, "metric": "behavior_change_detected", "value": <number>, "detail": "<summary>"}
```
