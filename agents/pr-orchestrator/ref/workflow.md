# PR Orchestrator Workflow Reference

## Workflow Diagram

```
User: /pr-orchestrator <PR> [--verify]
         |
         v
  ORCHESTRATOR (Opus)
  1. gh auth status
  2. gh pr view <PR>
  3. Detect task type (branch/title)
  4. Detect repo profile (file detection)
  5. Resolve criteria (profile + task type + overrides)
         |
         v
  REVIEWER (Sonnet) — Agent tool, model: "sonnet"
  - Fetch diff + context
  - Analyze code
  - Post GH comments
  - Evaluate criteria
  - Return JSON
         |
         v
  Any gate failing? --no--> Post clean summary, exit
         |
        yes
         v
  FIXER (Sonnet) — Agent tool, model: "sonnet"
  - Checkout branch
  - Fix must-fix only
  - Commit + push
  - Return JSON
         |
         v
  --verify? --no--> Post summary, exit
         |
        yes
         v
  REVIEWER (Sonnet) — re-review fixes
         |
         v
  Post final summary, exit (no more loops)
```

## JSON Contracts

### Reviewer Output

```json
{
  "pr": 123,
  "issues": [
    {"severity": "must-fix", "file": "src/app.js", "line": 42, "message": "..."},
    {"severity": "suggestion", "file": "src/utils.js", "line": 10, "message": "..."}
  ],
  "summary": "Found 1 must-fix issue and 1 suggestion."
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
| Reviewer finds 0 must-fix | Post clean summary, exit |
| Fixer partially succeeds | Report fixed + unfixed |
| Sub-agent timeout | Report partial results |
| Verify finds new issues | Report in summary, do NOT fix again |
