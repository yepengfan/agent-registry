# PR Reviewer Figma Verification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Figma design verification to the pr-reviewer agent so it catches UI mismatches against Figma designs when SDD steering files are present in the repo.

**Architecture:** Three existing files are modified: the reviewer's workflow (agent.md) gets a new conditional Figma verification step, the review checklist gets a "Design Fidelity" section with specific mismatch patterns, and coding conventions gets a "Frontend Design Conventions" section. The Figma step is conditional — only triggered when `.sdd/steering/feature-*-figma.md` files exist in the target repo. Figma MCP tools (`get_screenshot`, `get_design_context`) fetch design references, and Playwright MCP captures rendered page screenshots from the locally running dev server for side-by-side visual comparison. Existing code review functionality is preserved unchanged.

**Tech Stack:** Markdown (agent prompts), Figma MCP tools

**Note:** The existing `criteria/figma-design-match.md` criterion uses a generic approach (Figma URL in PR description). This plan adds a more specific workflow for repos using SDD steering files. Both can coexist — the criterion is evaluated at orchestrator level, while the workflow step runs inside the reviewer.

---

### Task 1: Add Design Fidelity section to review-checklist.md

**Files:**
- Modify: `agents/pr-reviewer/ref/review-checklist.md`

- [ ] **Step 1: Replace the TODO placeholder with the Design Fidelity section**

Replace the line `<!-- TODO: Fill in team-specific conventions, thresholds, and tooling references -->` at the end of the file with:

```markdown
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
```

- [ ] **Step 2: Verify the file is well-formed**

Run: `cat agents/pr-reviewer/ref/review-checklist.md`
Expected: Four sections visible — Must-Check Items, Quality Checks, Performance Checks, Design Fidelity

- [ ] **Step 3: Commit**

```bash
git add agents/pr-reviewer/ref/review-checklist.md
git commit -m "feat: add Design Fidelity section to pr-reviewer checklist"
```

---

### Task 2: Add Figma verification workflow step to agent.md

**Files:**
- Modify: `agents/pr-reviewer/agent.md`

- [ ] **Step 1: Add Figma MCP to the tools list in frontmatter**

Change line 10 from:
```yaml
tools:
  - gh
```
to:
```yaml
tools:
  - gh
  - figma_mcp
  - playwright
```

- [ ] **Step 2: Add Step 3.5 — Figma Design Verification**

Insert the following new step between the existing step 3 ("For each changed file, read surrounding context") and step 4 ("Analyze every change"). Renumber subsequent steps accordingly (old step 4 becomes step 5, old step 5 becomes step 6, old step 6 becomes step 7):

```markdown
4. **Figma Design Verification** (conditional — skip if no steering files found):

   **Prerequisite:** The frontend dev server must be running locally. Do not start or stop it yourself.

   a. Check if the repo has SDD steering files:
      ```bash
      ls .sdd/steering/feature-*-figma.md 2>/dev/null
      ```
      If no files found, skip this step entirely.

   b. For each steering file found, read it to extract:
      - Figma file key and node IDs per screen
      - The localhost route/URL for each screen
      ```bash
      cat .sdd/steering/feature-<name>-figma.md
      ```

   c. Identify which screens are affected by the PR's changed files. Match changed file paths against the screens documented in the steering file.

   d. For each affected screen, capture both the design reference and the rendered implementation:

      **Figma design screenshot:**
      ```
      figma:get_screenshot(fileKey="<key>", nodeId="<nodeId>")
      ```

      **Rendered implementation screenshot** (via Playwright MCP):
      Navigate to the screen's localhost URL and capture a screenshot of the rendered page.

   e. Compare the Figma screenshot against the rendered screenshot side-by-side. Check every item in the "Design Fidelity" section of `ref/review-checklist.md`. This is a visual comparison — rendered UI vs Figma design, not code reading.

   f. For each mismatch found, classify severity:
      - **must-fix**: Wrong layout structure, missing elements, wrong container dimensions, elements in wrong position, wrong component used
      - **suggestion**: Minor spacing token refinements, polish items, small alignment tweaks

   g. Add all design mismatches to your issues array with `"category": "design"` to distinguish them from code quality issues. Include what differs, expected (from Figma), and actual (from rendered screenshot).
```

- [ ] **Step 3: Update Severity Levels section**

After the existing severity level definitions (must-fix and suggestion), add:

```markdown
### Design-Specific Severity

When a Figma steering file is present, design mismatches follow these severity rules:

- **must-fix (design)**: Wrong layout structure (flex direction, element order), missing UI elements, wrong container dimensions (width/height off by more than cosmetic), elements positioned incorrectly, wrong design system component used
- **suggestion (design)**: Minor spacing differences (within ~4px), token refinement opportunities, polish items that don't affect usability or layout
```

- [ ] **Step 4: Verify the agent still installs correctly**

Run: `node bin/cli.js install --agent pr-reviewer && echo "OK"`
Expected: Agent installs without errors, prints "OK"

- [ ] **Step 5: Verify the installed file contains the Figma workflow step**

Run: `grep -c "Figma Design Verification" ~/.claude/commands/pr-reviewer.md`
Expected: `1`

- [ ] **Step 6: Run full test suite for regressions**

Run: `node test.js`
Expected: All tests pass (72 passed, 0 failed)

- [ ] **Step 7: Commit**

```bash
git add agents/pr-reviewer/agent.md
git commit -m "feat: add Figma design verification workflow step to pr-reviewer"
```

---

### Task 3: Add Frontend Design Conventions to coding-conventions.md

**Files:**
- Modify: `agents/pr-reviewer/ref/coding-conventions.md`

- [ ] **Step 1: Replace the TODO placeholder with Frontend Design Conventions**

Replace the line `<!-- TODO: Add language-specific conventions, linting rules, and CI requirements -->` at the end of the file with:

```markdown
## Frontend Design Conventions

### Design System Usage
- All UI must use design system components from the project's DS library (e.g., @ifm-ds/core) — do not create custom elements when a DS component exists
- Use design system token classes for typography (text-body-sm, text-heading-md), spacing (gap-md, p-lg), and color — never use raw Tailwind hex colors or arbitrary values
- When a DS component doesn't exist for a design element, flag it as a gap rather than building a custom replacement

### Figma Compliance
- All UI implementation must match the Figma design for the feature
- Intentional deviations from Figma must be documented with a BRD/FR reference explaining why
- When in doubt about a design detail, check the Figma source — the design is the spec

### Layout Rules
- Container dimensions (widths, heights, max-widths) must match Figma specifications
- Element ordering must match Figma (e.g., header before banner, not the reverse)
- Button grouping and placement must match Figma per screen (e.g., split left/right vs single row)
- Conditional elements must appear only in the view states specified by Figma
```

- [ ] **Step 2: Verify the file is well-formed**

Run: `cat agents/pr-reviewer/ref/coding-conventions.md`
Expected: Six sections visible — General, Naming, Error Handling, Testing, Frontend Design Conventions

- [ ] **Step 3: Verify the agent reinstalls cleanly with updated ref docs**

Run: `node bin/cli.js install --agent pr-reviewer && echo "OK"`
Expected: Installs without errors

- [ ] **Step 4: Run full test suite**

Run: `node test.js`
Expected: All tests pass (72 passed, 0 failed)

- [ ] **Step 5: Commit**

```bash
git add agents/pr-reviewer/ref/coding-conventions.md
git commit -m "feat: add Frontend Design Conventions to pr-reviewer coding conventions"
```

---

### Task 4: Final verification

**Files:**
- No new files

- [ ] **Step 1: Reinstall the full pr-orchestrator stack**

Run: `node bin/cli.js install --agent pr-orchestrator`
Expected: pr-orchestrator, pr-reviewer, and pr-fixer all install cleanly

- [ ] **Step 2: Verify Figma content is present in installed reviewer**

Run: `grep "Figma Design Verification" ~/.claude/commands/pr-reviewer.md && grep "Design Fidelity" ~/.claude/commands/pr-reviewer.md && grep "Frontend Design Conventions" ~/.claude/commands/pr-reviewer.md && echo "ALL PRESENT"`
Expected: Three matches + "ALL PRESENT"

- [ ] **Step 3: Run full test suite**

Run: `node test.js`
Expected: 72 passed, 0 failed

- [ ] **Step 4: Verify list command still works**

Run: `node bin/cli.js list`
Expected: All agents, criteria, and profiles listed without errors
