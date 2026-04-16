# Task-Aware Criteria with Repo Profiles

**Date**: 2026-04-15
**Status**: Design approved, pending implementation

## Problem

The pr-reviewer's criteria are currently static — the same checks apply regardless of whether the PR is a feature, bugfix, or refactor, and regardless of whether the repo is a React frontend or a Python backend. This leads to:

- Missing criteria that matter (no regression test check on bugfix PRs)
- Applying criteria that don't apply (accessibility checks on backend PRs)
- No way to enforce Figma design fidelity on frontend feature PRs

## Solution

Introduce **repo profiles** and **task type detection** so the pr-orchestrator dynamically resolves which criteria to evaluate based on what kind of work is being reviewed and in what kind of repo.

## Design Decisions

- **Approach B (profile configs)**: Profiles define the task-type-to-criteria mapping. Criteria files stay simple and reusable. Profiles are the routing layer.
- **Task types**: Feature, Bugfix, Refactor — detected from PR branch/title conventions.
- **Detection is inference-based**: No CLI flags required. Branch prefix is primary signal, PR title is fallback.
- **Zero breaking changes**: Repos without profiles fall back to the reviewer's frontmatter criteria list (current behavior).

## Registry Structure

```
agent-registry/
├── profiles/
│   ├── frontend.md        # React/TypeScript detection + criteria map
│   └── backend.md         # Python detection + criteria map
├── criteria/
│   ├── all-tests-pass.md              # existing (gate)
│   ├── no-new-lint-warnings.md        # existing (advisory)
│   ├── zero-must-fix-issues.md        # existing (gate)
│   ├── has-regression-test.md         # NEW (gate)
│   ├── has-test-coverage.md           # NEW (gate)
│   ├── no-behavior-change.md          # NEW (gate)
│   ├── no-accessibility-regression.md # NEW, FE-specific (gate)
│   ├── no-breaking-api-change.md      # NEW, BE-specific (gate)
│   ├── has-migration-safety.md        # NEW, BE-specific (gate)
│   └── figma-design-match.md          # NEW, FE-specific (gate)
├── lib/
│   ├── profiles.js        # NEW: profile loading, detection, criteria resolution
│   ├── discovery.js       # UPDATED: profile listing and status display
│   └── frontmatter.js     # UPDATED: profile type validation
└── agents/
    └── pr-orchestrator/
        └── agent.md       # UPDATED: profile + task type detection flow
```

## Profile File Format

Each profile is a markdown file in `profiles/` with YAML frontmatter:

```yaml
---
name: frontend
description: React/TypeScript frontend projects
detect:
  files:
    - package.json
    - tsconfig.json
  priority: 10
criteria:
  feature:
    - all-tests-pass
    - no-new-lint-warnings
    - has-test-coverage
    - no-accessibility-regression
    - figma-design-match
  bugfix:
    - all-tests-pass
    - has-regression-test
    - zero-must-fix-issues
  refactor:
    - all-tests-pass
    - no-behavior-change
    - no-new-lint-warnings
---

## Frontend Profile

This profile targets React + TypeScript frontend projects.
```

Detection uses AND logic — all listed files must exist in the repo root. When multiple profiles match, the highest `priority` value wins. The markdown body is optional context injected into the reviewer prompt.

## Task Type Detection

Ordered detection, first match wins:

1. **Branch prefix** (strongest signal):
   - `feat/*`, `feature/*` -> feature
   - `fix/*`, `bugfix/*`, `hotfix/*` -> bugfix
   - `refactor/*`, `refact/*` -> refactor

2. **PR title prefix** (conventional commits):
   - `feat:`, `feat(*)` -> feature
   - `fix:`, `fix(*)` -> bugfix
   - `refactor:`, `refactor(*)` -> refactor

3. **PR title keywords** (fallback heuristic):
   - "add", "implement", "new", "create" -> feature
   - "fix", "resolve", "bug", "patch" -> bugfix
   - "refactor", "restructure", "reorganize", "clean up" -> refactor

4. **No match** -> default to "feature" (broadest criteria set, most conservative)

## Criteria Matrix

| Criteria | FE Feature | FE Bugfix | FE Refactor | BE Feature | BE Bugfix | BE Refactor |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| all-tests-pass | G | G | G | G | G | G |
| no-new-lint-warnings | A | | A | A | | A |
| zero-must-fix-issues | | G | | | G | |
| has-test-coverage | G | | | G | | |
| has-regression-test | | G | | | G | |
| no-behavior-change | | | G | | | G |
| no-accessibility-regression | G | | | | | |
| figma-design-match | G | | | | | |
| no-breaking-api-change | | | | G | G | |
| has-migration-safety | | | | G | | |

G = gate, A = advisory

## New Criteria Definitions

### has-regression-test (gate)
Bugfix PRs must include at least one new test that reproduces the fixed bug. The reviewer checks that a test exists targeting the specific behavior that was broken.

### has-test-coverage (gate)
Feature PRs must have test coverage for new public functions/endpoints. The reviewer checks that all new public interfaces have at least one corresponding test.

### no-behavior-change (gate)
Refactor PRs must not change observable behavior. The reviewer checks for no changes to public API signatures, no new/removed exports, and no changed test assertions.

### no-accessibility-regression (gate, FE-specific)
UI changes must maintain accessibility standards. The reviewer checks for missing alt text, missing labels, broken ARIA attributes, and missing keyboard handling in changed components.

### figma-design-match (gate, FE-specific)
UI implementation must match the linked Figma design. Requires Figma MCP and Playwright MCP. Workflow:
1. Extract Figma URL from PR description (if none found, pass with note)
2. Use Figma MCP `get_design_context` / `get_screenshot` for the design reference
3. Use Playwright MCP to start dev server and capture screenshots of the implemented UI
4. Compare layout, spacing, colors, typography, and component usage
5. Report each deviation with expected (Figma) vs actual (screenshot)

The pr-reviewer agent needs Figma MCP and Playwright MCP available in the Claude Code session. These are environment prerequisites, not something the orchestrator provisions. The criterion instructs the reviewer to use these tools when present. If either MCP server is not configured, the criterion should report `pass: false` with detail explaining the missing dependency (e.g. "Figma MCP not available — cannot evaluate design match").

### no-breaking-api-change (gate, BE-specific)
API endpoints must not be broken by changes. The reviewer checks for removed endpoints, changed response shapes without versioning, and removed required fields.

### has-migration-safety (gate, BE-specific)
Database migrations must be safe for zero-downtime deployment. The reviewer checks for destructive operations (DROP TABLE/COLUMN) without a multi-step migration plan and locks on large tables.

## Orchestrator Flow

```
User: /pr-orchestrator <PR>
         |
         v
  1. Validate environment (gh auth status)
  2. Fetch PR metadata (number, title, headRefName, files)
         |
         v
  3. Detect task type from branch/title
     → "bugfix"
         |
         v
  4. Detect repo profile from repo files
     → "backend"
         |
         v
  5. Resolve criteria:
     a. Profile + task type match → use profile.criteria[taskType]
     b. Profile match, unknown task type → profile.criteria["feature"]
     c. No profile match → reviewer's frontmatter criteria list
     d. Apply --criteria overrides (+add, -remove, replace)
         |
         v
  6. Read criteria file bodies from criteria/
  7. Dispatch reviewer with:
     - Reviewer agent.md body
     - Injected criteria content
     - Task type + profile context
         |
         v
  8. Evaluate criteria_results (gate vs advisory)
  9. Dispatch fixer if gates fail
 10. Post summary with profile/task context
```

## Criteria Override Interaction

`--criteria` flags apply after profile resolution:

```bash
# Add to profile's list:
/pr-orchestrator 42 --criteria +figma-design-match

# Remove from profile's list:
/pr-orchestrator 42 --criteria -has-regression-test

# Replace entirely (ignores profile):
/pr-orchestrator 42 --criteria all-tests-pass,zero-must-fix-issues
```

## Library Changes

### New: `lib/profiles.js`

- `loadProfiles(registryDir)` — reads all `profiles/*.md`, returns parsed objects
- `detectProfile(registryDir)` — checks `detect.files` against cwd, returns best match or null
- `detectTaskType(prMetadata)` — branch prefix -> title prefix -> keyword fallback chain
- `resolveCriteria(registryDir, profile, taskType, overrides)` — resolves final criteria list with file bodies

### Modified: `lib/discovery.js`

- `listProfiles(registryDir)` — new function, lists profile names
- `showList()` — adds "Profiles:" section to output
- `showStatus()` — shows which profile matches current repo

### Modified: `lib/frontmatter.js`

- `validateFrontmatter()` — add "profile" as recognized type, validate `detect.files` array and `criteria` map structure

### Not modified: `lib/installer.js`

Profiles are read at orchestrator runtime from the registry. No installation step needed.

## Fallback Behavior

The system degrades gracefully:

| Scenario | Behavior |
|----------|----------|
| Profile matches + task type matches | Full task-aware criteria from profile |
| Profile matches + task type unknown | Profile's "feature" criteria (broadest set) |
| No profile matches | Reviewer's frontmatter `criteria:` list (current behavior) |
| No criteria at all | Reviewer runs without criteria evaluation |

Zero breaking changes — existing repos without profiles work identically to current behavior.
