---
name: figma-design-match
description: UI implementation matches the linked Figma design via automated element-level verification
gate: true
metric: design_deviation_count
pass_when: "zero mismatches between Figma element properties and rendered DOM properties beyond tolerance thresholds"
---

## Figma Design Match

UI implementation must match the linked Figma design specification. Verification is performed by extracting structured element inventories from both Figma (Plugin API) and the rendered DOM (Playwright `getComputedStyle`), then diffing every property element-by-element.

### Prerequisites

- Figma MCP server must be available (for `use_figma` Plugin API extraction)
- Playwright MCP server must be available (for DOM computed style extraction)

If either MCP is unavailable, report `pass: false` with detail: `"<tool> MCP not available — cannot perform automated verification"`. There is no screenshot fallback and no manual QA recommendation — the automated extraction is the only valid evaluation method.

### Evaluation Workflow

1. **Check applicability:** List all files in `.sdd/steering/` and find any file whose name contains `figma` (case-insensitive). Use `ls .sdd/steering/ 2>/dev/null | grep -i figma` rather than a case-sensitive glob. If a matching file exists, read it to extract the Figma file key and node IDs. Also check for a Figma URL in the PR description.

   If no steering file matches AND no Figma URL is found in the PR description, report `pass: true` with detail: `"No Figma design reference found — criterion not applicable for this PR."`

2. **Check prerequisites:** Both Figma MCP and Playwright MCP must be available.
   - If Figma MCP is missing: report `pass: false` with detail `"Figma MCP not available — cannot perform automated verification"`
   - If Playwright MCP is missing: report `pass: false` with detail `"Playwright MCP not available — cannot perform automated verification"`

3. **Phase 1 — Figma Element Inventory** (via `figma:use_figma` Plugin API)

   Locate the registry root via `agent-registry root`. Read the extraction script from `{registry_root}/scripts/figma-extract.js`. Replace `__NODE_ID__` with the target Figma node ID. Pass the entire script to `figma:use_figma` as the `code` parameter.

   The script walks the Figma node tree and returns a JSON inventory of every meaningful visible element with: text content, fontSize, fontWeight, lineHeight, text color, layout mode, padding, gap, background color, border color/width, corner radius, component names, and annotations. Invisible nodes and pure wrappers are filtered out.

   Save the JSON output as `figma-inventory.json`.

   If the `figma-inspect` skill is available, invoke it instead.

4. **Phase 2 — DOM Element Inventory** (via Playwright `browser_evaluate`)

   Navigate to the page via Playwright, perform any required interactions (click buttons to open drawers, etc.). Read the extraction script from `{registry_root}/scripts/dom-extract.js`. Replace `__ROOT_SELECTOR__` with the target CSS selector (e.g., `body` or `#app`). Pass the entire script to `browser_evaluate`.

   The script walks the rendered DOM and returns a JSON inventory of every meaningful element with: tag, dimensions, position, text content, semantic attributes (role, data-testid, placeholder, disabled), and computed styles (backgroundColor, color, fontSize, fontWeight, padding, gap, borderRadius, border widths).

   Save the JSON output as `dom-inventory.json`.

   If the `design-verify` skill is available, invoke it instead.

5. **Phase 3+4 — Map, Diff, and Report**

   Run the deterministic comparison script:
   ```bash
   node {registry_root}/scripts/design-diff.js figma-inventory.json dom-inventory.json
   ```

   Optionally pass a token map for richer fix hints:
   ```bash
   node {registry_root}/scripts/design-diff.js figma-inventory.json dom-inventory.json --token-map tokens.json
   ```

   The script codifies the full mapping and diffing algorithm:
   - **Mapping cascade:** text match → semantic role → structural position → container match
   - **Tolerance thresholds:** dimensions +/-4px, spacing +/-2px, colors exact, typography exact, border radius +/-1px, text exact, state exact, borders exact
   - **Color normalization:** Figma hex to rgb, rgba(r,g,b,1) to rgb(r,g,b)
   - **Font weight mapping:** Figma style names (e.g., "Semi Bold") to numeric weights (e.g., "600")
   - **Fix hint generation:** with DS token names when a token map is provided

   The script outputs JSON conforming to the output contract below. Exit code 0 = pass, 1 = fail.

### Pass

Zero mismatches where `figma_value` differs from `dom_value` beyond tolerance thresholds.

### Fail

One or more mismatches found. The `mismatches` array provides exact values and fix hints for each deviation.

When `figma-design-match` fails, the issues sent to the fixer agent MUST include the structured `mismatches` array with exact `figma_value`, `dom_value`, and `fix_hint`. This replaces vague descriptions like "table doesn't match design" with actionable data like `"td border-right: Figma=0px, Rendered=1px — add [&_td]:!border-r-0 to wrapper"`.

### Output Contract

Include in `criteria_results`:

```json
{
  "criterion": "figma-design-match",
  "gate": true,
  "pass": false,
  "metric": "design_deviation_count",
  "value": 3,
  "detail": "3 mismatches found across 42 elements inspected",
  "inventory": {
    "figma_elements": 47,
    "dom_elements": 42,
    "mapped_pairs": 39,
    "unmatched_figma": 8,
    "unmatched_dom": 3
  },
  "mismatches": [
    {
      "figma_element": "Button container (Column-1)",
      "dom_element": "div[data-testid='csi-action-buttons']",
      "property": "padding-left",
      "figma_value": "24px",
      "dom_value": "32px",
      "fix_hint": "Use pl-lg (24px) not pl-xl (32px). DS token mapping: spacing.l=24"
    }
  ]
}
```

### Authentication for Playwright

If authentication blocks page access:
- Check if the steering file documents a way to inject auth cookies/tokens
- If not possible, report `pass: false` with detail explaining the auth limitation
- Do not fall back to code-only analysis — report the blocker explicitly
