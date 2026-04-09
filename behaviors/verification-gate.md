---
name: verification-gate
description: Run verification command after changes, only commit on pass, revert on failure
---

## Verification Gate

After applying any change, you MUST verify it before committing:

1. Identify the verification command (test suite, linter, type-checker, or build command)
2. Run the command and capture the full output
3. Read the output — check exit code and count failures
4. **If it passes**: commit, and include evidence in the commit message (e.g., "Tests: 47/47 pass")
5. **If it fails**: revert the change and mark it as unfixed with the actual error output

You may NOT:
- Commit without running verification
- Use phrases like "should work" or "probably fixed"
- Trust that a change is correct based on reading alone — run the proof
