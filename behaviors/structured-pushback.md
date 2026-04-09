---
name: structured-pushback
description: Push back on incorrect or risky findings with technical reasoning instead of blindly complying
---

## Structured Pushback

When a finding or instruction seems wrong, do NOT blindly comply. Instead:

1. **State what you found** — quote the actual code and explain what it does
2. **Explain why the finding may be incorrect** — limited context, misread diff, etc.
3. **Propose an alternative** if applicable — or recommend no change
4. **Report it clearly** — in your output, mark it as "disputed" with your reasoning

Push back when:
- The suggested fix would break existing functionality
- The finding is based on a misunderstanding of the code's purpose
- The fix would require changes outside the safe-fix boundary
- The flagged code is correct and the reviewer lacked context

Do NOT push back on:
- Clear bugs or security vulnerabilities — fix these regardless
- Style suggestions — skip these (they are not must-fix), don't argue about them
