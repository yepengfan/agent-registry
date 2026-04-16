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

## Design Fidelity (when `.sdd/steering/feature-*-figma.md` exists)

Skip this section if no `.sdd/steering/feature-*-figma.md` files are found in the repo.

### Structural Checks
- [ ] Does the layout structure match Figma? (element order, flex direction, alignment)
- [ ] Are container dimensions correct? (drawer widths, input widths, specific gaps)
- [ ] Are elements in the correct position? (button placement, section ordering)
- [ ] Are the correct design system components used? (not custom replacements)
- [ ] Are all elements present? (subtitles, dividers, info icons, dismiss buttons, section headers)

### Token and Style Checks
- [ ] Are typography tokens correct? (text-body-sm, text-heading-md, etc. — not raw values)
- [ ] Are spacing tokens correct? (gap-md, p-lg, etc. — not raw px/rem)
- [ ] Are color tokens from the design system? (not raw Tailwind hex colors)
- [ ] Do component styles match? (bordered card vs colored bg, outlined vs filled)

### Conditional and State Checks
- [ ] Do conditional elements appear/disappear per the correct view state?
- [ ] Does each screen variant match its Figma variant? (e.g., form view vs list view)
- [ ] Are button groups split correctly per screen? (e.g., left/right split vs single row)

### Common Mismatch Patterns

Flag these specifically — they are the most frequently missed issues:

1. **Container width mismatch** — e.g., drawer 620px when Figma specifies 890px
2. **Button grouping wrong** — all buttons in one row when Figma splits left/right
3. **Missing elements** — subtitles, dividers, info icons, dismiss buttons omitted
4. **Section ordering wrong** — e.g., banner before header when Figma shows header-first
5. **Conditional elements on wrong view** — e.g., Reset button on list view when Figma shows it only on form view
6. **Component style mismatch** — colored background when Figma shows bordered card
7. **Spacing tokens wrong** — gap-md when Figma specifies a different gap value
