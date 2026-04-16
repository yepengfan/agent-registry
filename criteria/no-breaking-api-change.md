---
name: no-breaking-api-change
description: API endpoints are not broken by changes
gate: true
metric: breaking_api_change_count
pass_when: "no removed endpoints, no changed response shapes without versioning, no removed required fields"
---

## No Breaking API Change

API changes must not break existing consumers.

### Breaking Changes
- Removed endpoints or routes
- Changed response shape (removed fields, changed types) without API versioning
- Removed or renamed required request parameters
- Changed authentication/authorization requirements
- Changed HTTP methods for existing endpoints

### Non-Breaking Changes (allowed)
- Adding new optional fields to responses
- Adding new endpoints
- Adding new optional request parameters
- Deprecation notices (without removal)

### Pass
No breaking API changes detected.

### Fail
One or more breaking changes found. Report each with endpoint, change type, and impact.

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "no-breaking-api-change", "gate": true, "pass": <bool>, "metric": "breaking_api_change_count", "value": <number>, "detail": "<summary>"}
```
