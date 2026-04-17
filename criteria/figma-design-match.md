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

- All screens in steering files must have localhost routes and Playwright steps documented. Screens without this data cannot be verified and will cause the criterion to fail.

### Evaluation Workflow

The `pr-design` agent executes this workflow. It is dispatched by the orchestrator when Figma steering files are present.

1. **Phase 0 — Validate Steering Completeness**

   Parse all `feature-*-figma.md` steering files from the orchestrator-injected context. For each screen, verify:
   - Node ID exists (for Figma extraction)
   - Localhost URL exists (for DOM extraction)
   - Playwright steps exist (for screens behind interactions)

   Screens missing required data are classified as **unverifiable** and reported in the output. The criterion fails if any screens are unverifiable.

2. **Phase 1 — Figma Element Inventory** (via `figma:use_figma` Plugin API)

   Locate the extraction script at `{registry_root}/scripts/figma-extract.js`. Replace `__NODE_ID__` with the target Figma node ID. Pass the entire script to `figma:use_figma` as the `code` parameter.

   The script extracts every meaningful visible element with: text content, fontSize, fontWeight, lineHeight, textAlign, letterSpacing, textDecoration, textCase, text color, layout mode, alignment (primary/counter axis), sizing mode, padding, gap, background color, opacity, effects (shadows), border color/width, corner radius, overflow, component names, min/max dimensions, and annotations.

   Run once per screen. Save as `/tmp/figma-inventory-<nodeId>.json`. Figma inventories can be cached across rounds (the design doesn't change between rounds).

3. **Phase 2 — DOM Element Inventory** (via Playwright `browser_evaluate`)

   Navigate to the page via Playwright, execute the documented Playwright steps to reach the correct screen state. Read the extraction script from `{registry_root}/scripts/dom-extract.js`. Replace `__ROOT_SELECTOR__` with the target CSS selector. Pass to `browser_evaluate`.

   The script extracts every meaningful element with: tag, dimensions, position, text content, semantic attributes, computed styles (backgroundColor, color, fontSize, fontWeight, textAlign, lineHeight, letterSpacing, textDecoration, textTransform, flexDirection, alignItems, justifyContent, padding, gap, borderRadius, border widths/colors, opacity, boxShadow, overflow, min/max dimensions), sibling index, and icon presence.

   Run once per screen per round. Save as `/tmp/dom-inventory-<nodeId>.json`.

4. **Phase 3+4 — Map, Diff, and Report**

   Run the deterministic comparison script:
   ```bash
   node {registry_root}/scripts/design-diff.js figma-inventory.json dom-inventory.json --token-map tokens.json || true
   ```

   The script codifies:
   - **Mapping cascade:** text match → semantic role → structural position → container match
   - **Tolerance thresholds:** dimensions ±4px, spacing ±2px, line-height ±2px, letter-spacing ±0.5px, opacity ±0.05, border-radius ±1px, colors exact, typography exact, text exact, state exact, alignment exact, flex direction exact
   - **Color normalization:** Figma hex to rgb, rgba(r,g,b,1) to rgb(r,g,b)
   - **Font weight mapping:** Figma style names to numeric weights
   - **Alignment mapping:** Figma axis values to CSS flex values
   - **Presence mismatches:** Unmatched Figma elements (missing in DOM) and unmatched DOM elements (extra in implementation) are counted as mismatches
   - **Fix hint generation:** with DS token names when a token map is provided

### Pass

Zero mismatches where `figma_value` differs from `dom_value` beyond tolerance thresholds AND zero presence mismatches (no elements missing from DOM that exist in Figma, and vice versa) AND all screens verifiable.

### Fail

One or more of:
- Property mismatches found beyond tolerance thresholds
- Presence mismatches: elements in Figma but missing in DOM, or vice versa
- Unverifiable screens: steering files missing localhost routes or Playwright steps
- MCP tools unavailable (Figma or Playwright)

When `figma-design-match` fails, the issues sent to the fixer agent include the structured `mismatches` array with exact `figma_value`, `dom_value`, and `fix_hint`.

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
  "screens": {
    "verified": [
      {"name": "Screen Name", "nodeId": "123:456", "mismatches": 2, "elements_inspected": 18}
    ],
    "unverifiable": [
      {"name": "Other Screen", "nodeId": "789:012", "reason": "no localhost route"}
    ]
  },
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
    },
    {
      "figma_element": "Close button label (TEXT, 123:789)",
      "dom_element": null,
      "property": "presence",
      "figma_value": "exists",
      "dom_value": "missing",
      "fix_hint": "Element 'Close button label' exists in Figma but has no corresponding DOM element. Implement this element."
    }
  ]
}
```

### Authentication for Playwright

If authentication blocks page access:
- Check if the steering file documents a way to inject auth cookies/tokens
- If not possible, report `pass: false` with detail explaining the auth limitation
- Do not fall back to code-only analysis — report the blocker explicitly
