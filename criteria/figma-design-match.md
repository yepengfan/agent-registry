---
name: figma-design-match
description: UI implementation matches the linked Figma design
gate: true
metric: design_deviation_count
pass_when: "no significant visual deviations from Figma design"
---

## Figma Design Match

UI implementation must match the linked Figma design specification.

### Prerequisites
- Figma MCP server must be available in the session
- Playwright MCP server should be available for rendered screenshot comparison
- See Evaluation Workflow step 2 for specific fallback behavior when either is unavailable

### Evaluation Workflow

1. **Check applicability:** Read the Figma steering file (`.sdd/steering/feature-*-figma.md`) or extract a Figma URL from the PR description.

   If no steering file exists AND no Figma URL is found in the PR description, report `pass: true` with detail: "No Figma design reference found — criterion not applicable for this PR."

2. **Check prerequisites:** Figma MCP and Playwright MCP must be available in the session.
   - If Figma MCP is missing: report `pass: false` with detail "Figma MCP not available"
   - If Playwright MCP is missing: proceed with code-only verification but report `pass: false` with detail "Playwright MCP not available — rendered comparison not possible, manual visual QA recommended"

3. **PRIMARY CHECK — Visual comparison (requires Playwright):**
   a. Navigate to each affected screen via Playwright (`browser_navigate`)
   b. Wait for content to render, then take a rendered screenshot (`browser_take_screenshot`)
   c. Fetch Figma reference screenshot (`figma:get_screenshot`)
   d. Compare the two screenshots visually — flag every difference in layout, dimensions, typography, content, icons, states

4. **SUPPLEMENTARY CHECK — Data verification:**
   a. Read i18n string values and compare against Figma text — flag any text that doesn't match exactly
   b. Check API response types for data overflow risks (long values vs designed column widths)
   c. Verify DS component disabled/loading/error states render the correct visual style

5. **If Playwright is unavailable**, fall back to code-only analysis with `pass: false` and recommend manual visual QA before merge.

### Authentication for Playwright

If authentication blocks page access:
- Check if the steering file documents a way to inject auth cookies/tokens
- If not possible, report the limitation in criteria_results detail
- Fall back to code-only verification with `pass: false`
- Always recommend manual visual QA in the PR summary when Playwright can't verify

### Pass
No significant visual deviations between Figma design and implementation.

### Fail
One or more deviations found. Report each with: what differs, expected value (from Figma), actual value (from screenshot).

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "figma-design-match", "gate": true, "pass": <bool>, "metric": "design_deviation_count", "value": <number>, "detail": "<summary>"}
```
