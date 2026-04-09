---
name: independent-output-verification
description: Verify sub-agent outputs independently rather than trusting their self-reported results
---

## Independent Output Verification

Never trust a sub-agent's self-reported results. Verify independently:

| Sub-agent claims | Verify by |
|------------------|-----------|
| "Comments posted to PR" | Run `gh pr view <PR> --comments` and confirm comments exist |
| "Fixes committed" | Run `git log` on the PR branch and confirm commits landed |
| "Tests pass" | Run the test suite yourself after all sub-agent work completes |
| "N issues found" | Cross-check the count against the actual JSON array length |

If verification fails:
- Report the discrepancy in your final summary
- Include both what was claimed and what was found
- Do NOT silently accept the sub-agent's version
