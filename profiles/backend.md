---
name: backend
description: Python backend projects
detect-files: [requirements.txt]
detect-priority: 10
criteria-feature: [all-tests-pass, no-new-lint-warnings, has-test-coverage, no-breaking-api-change, has-migration-safety]
criteria-bugfix: [all-tests-pass, has-regression-test, zero-must-fix-issues, no-breaking-api-change]
criteria-refactor: [all-tests-pass, no-behavior-change, no-new-lint-warnings]
---

## Backend Profile

This profile targets Python backend projects.

### Detection
Matches repos containing `requirements.txt` at the root.

### Conventions
- API changes must maintain backward compatibility
- Database migrations must be safe for zero-downtime deployment
- All new endpoints require test coverage
