# Fix Guidelines

## Safe Fix Boundaries

Fixes must be **minimal and targeted**. The goal is to resolve the specific issue identified in review, not to improve the surrounding code.

### Always Safe

- Adding error handling (try-catch, null checks, input validation)
- Fixing obvious bugs (wrong variable, off-by-one, missing return)
- Removing hardcoded secrets or credentials
- Adding missing `await` on async calls
- Fixing SQL injection by switching to parameterized queries
- Adding missing input sanitization

### Requires Judgment

- Renaming a variable used in multiple places — safe if all usages are in the same file
- Extracting a function — safe if it does not change the public API
- Adding a missing test — safe if it does not require new test infrastructure

### Never Do

- Refactor code unrelated to the flagged issue
- Change public API signatures without explicit approval
- Delete or rewrite tests that are not directly related to the fix
- Upgrade dependencies
- Change CI/CD configuration

## Commit Conventions

Each fix gets its own commit:

```
Fix: <what was fixed>

Resolves review issue: <original issue message>
File: <file path>, Line: <line number>
```

## When to Mark as Unfixed

Report an issue as `unfixed` when:
- The fix requires changes to multiple services or repositories
- The fix would break the public API contract
- The fix requires a database migration
- You are not confident the fix is correct
