---
name: no-accessibility-regression
description: UI changes maintain accessibility standards
gate: true
metric: a11y_issue_count
pass_when: "no new accessibility violations in changed components"
---

## No Accessibility Regression

UI changes must maintain accessibility standards. Check all changed components for violations.

### Checks
- Missing `alt` text on images
- Missing `aria-label` or `aria-labelledby` on interactive elements
- Missing form `<label>` associations
- Broken ARIA roles or attributes
- Missing keyboard event handlers on clickable non-button elements
- Inadequate color contrast (if determinable from code)

### Pass
No new accessibility violations found in changed components.

### Fail
One or more accessibility violations found. Report each with component, element, and violation type.

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "no-accessibility-regression", "gate": true, "pass": <bool>, "metric": "a11y_issue_count", "value": <number>, "detail": "<summary>"}
```
