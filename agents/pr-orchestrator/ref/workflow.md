# PR Orchestrator Workflow Reference

## Workflow Diagram

```
User: /pr-orchestrator <PR> [--rounds N]    (default N=3)
         |
         v
  ORCHESTRATOR (Opus)
  1. gh auth status
  2. gh pr view <PR>
  3. Detect task type (branch/title)
  4. Detect repo profile (file detection)
  5. Resolve criteria (profile + task type + overrides)
  6. Initialize: consecutive_clean=0, round=0
         |
         v
  ┌─────────────────────────────────────────┐
  │  REVIEW-FIX LOOP                        │
  │                                         │
  │  REVIEWER (Sonnet) — Agent tool         │
  │  - Fetch diff + context                 │
  │  - Analyze code + Figma verification    │
  │  - Post GH comments                     │
  │  - Evaluate criteria                    │
  │  - Return JSON                          │
  │         |                               │
  │         v                               │
  │  Any must-fix? ──no──> consecutive_clean++ │
  │         |                  |             │
  │        yes          consecutive_clean    │
  │         |            >= N? ──yes──> EXIT │
  │         v                  |             │
  │  consecutive_clean=0       no            │
  │         |                  |             │
  │  FIXER (Sonnet)            |             │
  │  - Fix must-fix only       |             │
  │  - Commit + push           |             │
  │         |                  |             │
  │         v                  v             │
  │  Post round summary, loop back ─────────│
  └─────────────────────────────────────────┘
         |
         v
  Post final summary with all rounds table
```

## JSON Contracts

### Reviewer Output

```json
{
  "pr": 123,
  "issues": [
    {"severity": "must-fix", "file": "src/app.js", "line": 42, "message": "..."},
    {"severity": "must-fix", "file": "src/components/Drawer.tsx", "line": 15, "message": "padding-left: Figma=24px, Rendered=32px", "category": "design", "figma_value": "24px", "dom_value": "32px", "fix_hint": "Use pl-lg (24px) not pl-xl (32px). DS token: spacing.l=24"},
    {"severity": "suggestion", "file": "src/utils.js", "line": 10, "message": "..."}
  ],
  "criteria_results": [
    {"criterion": "<name>", "gate": true, "pass": true, "metric": "<key>", "value": "<measured>", "detail": "<explanation>"}
  ],
  "summary": "Found N issues. Criteria: X/Y gates passing."
}
```

### Fixer Output

```json
{
  "pr": 123,
  "branch": "feature/add-auth",
  "fixed": [{"file": "src/app.js", "line": 42, "message": "Added try-catch"}],
  "unfixed": []
}
```

## Error Recovery

| Scenario | Action |
|----------|--------|
| `gh auth` fails | Report error, exit |
| PR not found / closed | Report, exit |
| Reviewer returns no JSON | Report raw output, exit |
| Reviewer finds 0 must-fix | Increment consecutive_clean, loop or exit |
| Fixer partially succeeds | Report fixed + unfixed, next round catches remainder |
| Sub-agent timeout | Report partial results |
| Consecutive clean runs reached | Post final summary, exit |
