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
- Playwright MCP server must be available for capturing screenshots
- If either is missing, report `pass: false` with detail: "Required MCP server not available"

### Evaluation Workflow
1. Extract Figma URL from PR description body. If none found, report `pass: true` with detail: "No Figma design reference linked in PR description"
2. Use Figma MCP `get_design_context` and `get_screenshot` to obtain the design reference
3. Use Playwright MCP to start the dev server and capture screenshots of the affected pages
4. Compare the implementation against the design for:
   - **Layout**: element positioning, spacing, alignment
   - **Colors**: fill, border, text colors match design tokens
   - **Typography**: font family, size, weight, line-height
   - **Components**: correct design system components used
   - **Responsive**: if design shows multiple breakpoints, check each

### Pass
No significant visual deviations between Figma design and implementation.

### Fail
One or more deviations found. Report each with: what differs, expected value (from Figma), actual value (from screenshot).

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "figma-design-match", "gate": true, "pass": <bool>, "metric": "design_deviation_count", "value": <number>, "detail": "<summary>"}
```
