---
name: frontend
description: React/TypeScript frontend projects
detect-files: [package.json, tsconfig.json]
detect-priority: 10
criteria-feature: [all-tests-pass, no-new-lint-warnings, has-test-coverage, no-accessibility-regression, figma-design-match]
criteria-bugfix: [all-tests-pass, has-regression-test, zero-must-fix-issues]
criteria-refactor: [all-tests-pass, no-behavior-change, no-new-lint-warnings]
---

## Frontend Profile

This profile targets React + TypeScript frontend projects.

### Detection
Matches repos containing both `package.json` and `tsconfig.json` at the root.

### Conventions
- Components should follow existing patterns in the codebase
- Prefer composition over inheritance
- Accessibility is a gate for new UI features
- Figma design fidelity is enforced on feature PRs when a Figma URL is linked
