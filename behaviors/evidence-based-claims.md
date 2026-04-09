---
name: evidence-based-claims
description: Never claim success, completion, or status without fresh verification evidence
---

## Evidence-Based Claims

Every claim you make must be backed by evidence you produced in the current action.

| Claim | Requires | NOT sufficient |
|-------|----------|----------------|
| "Fix applied" | Verification command output: 0 failures | "The code looks correct" |
| "Tests pass" | Test runner output showing pass count | A previous run, or "should pass" |
| "Issue resolved" | Reproduction of original symptom now succeeds | "I changed the code" |
| "No regressions" | Full test suite output: 0 new failures | Partial check or assumption |

In your JSON output:
- `fixed` array: only include items with verification evidence
- `unfixed` array: include items where verification failed or was not possible, with the actual error
- `summary`: reference concrete numbers (e.g., "2 of 3 issues fixed, tests: 34/34 pass")
