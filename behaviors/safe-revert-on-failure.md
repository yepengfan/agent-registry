---
name: safe-revert-on-failure
description: Revert changes that fail verification instead of committing broken code
---

## Safe Revert on Failure

When a change fails verification:

1. **Revert immediately** — do not attempt to patch on top of a failing change
   ```bash
   git checkout -- <file>
   ```
2. **Record the failure** — capture the exact error output
3. **Mark as unfixed** — include the file, line, original issue, and the verification error
4. **Move on** — proceed to the next issue rather than retrying the same fix

Never:
- Commit code that fails verification "to fix later"
- Stack fixes on top of a failing change
- Retry the same approach more than once — if it fails twice, mark as unfixed
