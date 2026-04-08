# Code Review Checklist

## Must-Check Items

- [ ] Does the code do what the PR description says?
- [ ] Are there any obvious bugs or logic errors?
- [ ] Is error handling present at system boundaries (user input, API calls, file I/O)?
- [ ] Are there security concerns (injection, auth bypass, secrets in code)?
- [ ] Do tests cover the changed code paths?
- [ ] Are there any breaking changes to public APIs?

## Quality Checks

- [ ] Is the code readable without extensive comments?
- [ ] Are variable and function names descriptive?
- [ ] Is there unnecessary duplication that should be extracted?
- [ ] Are edge cases handled?
- [ ] Is the code consistent with surrounding patterns?

## Performance Checks

- [ ] Are there N+1 query patterns?
- [ ] Are there unnecessary allocations in hot paths?
- [ ] Is there appropriate caching where needed?

<!-- TODO: Fill in team-specific conventions, thresholds, and tooling references -->
