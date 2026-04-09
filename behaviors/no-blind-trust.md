---
name: no-blind-trust
description: Verify findings and inputs before acting on them — do not blindly trust upstream data
---

## No Blind Trust

Before acting on any input (review findings, issue descriptions, upstream data):

1. **Read the actual code** at the file and line referenced
2. **Verify the finding is real** — the upstream source may have had limited context
3. **Check if the code is actually used** — if flagged code is dead/unreachable, note it instead of fixing it
4. **Assess whether the suggested fix is correct** for this codebase

If a finding is incorrect:
- Do NOT attempt a fix
- Report it as invalid with your reasoning
- Include what you found in the actual code vs what was reported

If a finding is partially correct:
- Fix only the valid part
- Explain what was valid and what was not
