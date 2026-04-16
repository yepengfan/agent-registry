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

1. **Check applicability:** Read the Figma steering file (`.sdd/steering/feature-*-figma.md`) or extract a Figma URL from the PR description.

   If no steering file exists AND no Figma URL is found in the PR description, report `pass: true` with detail: `"No Figma design reference found — criterion not applicable for this PR."`

2. **Check prerequisites:** Both Figma MCP and Playwright MCP must be available.
   - If Figma MCP is missing: report `pass: false` with detail `"Figma MCP not available — cannot perform automated verification"`
   - If Playwright MCP is missing: report `pass: false` with detail `"Playwright MCP not available — cannot perform automated verification"`

3. **Phase 1 — Figma Element Inventory** (via `figma:use_figma` Plugin API)

   Run a JavaScript function via `figma:use_figma` that walks the Figma node tree from the screen root and returns a flat JSON array of every meaningful visible element.

   **Elements to extract:**
   - **TEXT nodes:** `characters` (text content), `fontSize`, `fontName.style` (weight), `lineHeight`, fills color (text color)
   - **FRAME/INSTANCE with auto-layout:** `layoutMode`, `paddingLeft/Right/Top/Bottom`, `itemSpacing` (gap), `counterAxisSpacing`
   - **FRAME/INSTANCE with fills:** fills color (background color)
   - **FRAME/INSTANCE with strokes:** strokes color, `strokeWeight` (border)
   - **All visible nodes:** `width`, `height`, `cornerRadius`, `visible`, `name`, `type`
   - **INSTANCE nodes:** `mainComponent.name` (DS component identification)
   - **Nodes with descriptions:** `description` (annotations/interaction specs)

   **Filter out:** Invisible nodes (`visible === false`), pure wrapper frames with no visual properties, clip masks, vector graphics internals.

   **Extraction script:**

   ```javascript
   function rgbToHex(r, g, b) {
     const toHex = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
     return '#' + toHex(r) + toHex(g) + toHex(b);
   }

   function extractInventory(rootNode) {
     const elements = [];

     function walk(node, depth, parentPath) {
       if (!node.visible) return;

       const el = {
         id: node.id,
         name: node.name,
         type: node.type,
         depth: depth,
         path: parentPath + '/' + node.name,
         width: Math.round(node.width),
         height: Math.round(node.height),
       };

       // Text properties
       if (node.type === 'TEXT') {
         el.text = node.characters;
         el.fontSize = node.fontSize;
         el.fontWeight = node.fontName?.style;
         el.lineHeight = typeof node.lineHeight === 'object'
           ? node.lineHeight.value : node.lineHeight;
         if (node.fills?.length > 0 && node.fills[0].type === 'SOLID') {
           const c = node.fills[0].color;
           el.textColor = rgbToHex(c.r, c.g, c.b);
         }
       }

       // Layout properties (auto-layout frames)
       if ('layoutMode' in node && node.layoutMode !== 'NONE') {
         el.layout = node.layoutMode;
         el.padding = {
           top: node.paddingTop, right: node.paddingRight,
           bottom: node.paddingBottom, left: node.paddingLeft
         };
         el.gap = node.itemSpacing;
       }

       // Fill (background color)
       if ('fills' in node && node.fills?.length > 0
           && node.fills[0].type === 'SOLID'
           && node.fills[0].visible !== false) {
         const c = node.fills[0].color;
         el.backgroundColor = rgbToHex(c.r, c.g, c.b);
         el.backgroundOpacity = node.fills[0].opacity ?? 1;
       }

       // Stroke (border)
       if ('strokes' in node && node.strokes?.length > 0
           && node.strokes[0].visible !== false) {
         const c = node.strokes[0].color;
         el.borderColor = rgbToHex(c.r, c.g, c.b);
         el.borderWidth = node.strokeWeight;
       }

       // Corner radius
       if ('cornerRadius' in node && node.cornerRadius !== 0) {
         el.borderRadius = typeof node.cornerRadius === 'number'
           ? node.cornerRadius
           : {
               tl: node.topLeftRadius, tr: node.topRightRadius,
               br: node.bottomRightRadius, bl: node.bottomLeftRadius
             };
       }

       // Component instance info
       if (node.type === 'INSTANCE' && node.mainComponent) {
         el.componentName = node.mainComponent.name;
       }

       // Annotations (interaction specs)
       if (node.description) {
         el.annotation = node.description;
       }

       // Determine if meaningful
       const isMeaningful = node.type === 'TEXT'
         || (node.type === 'INSTANCE')
         || (el.backgroundColor && el.backgroundOpacity > 0.01)
         || (el.borderColor)
         || (el.layout)
         || (el.annotation);

       if (isMeaningful) elements.push(el);

       // Recurse
       if ('children' in node) {
         for (const child of node.children) {
           walk(child, depth + 1, el.path || parentPath);
         }
       }
     }

     walk(rootNode, 0, '');
     return elements;
   }
   ```

   If the `figma-inspect` skill is available, invoke it instead of running this script manually.

4. **Phase 2 — DOM Element Inventory** (via Playwright `browser_evaluate`)

   Navigate to the page via Playwright, perform any required interactions (click buttons to open drawers, etc.), then run a JavaScript function via `browser_evaluate` that walks the rendered DOM and extracts the same properties.

   **Extraction script:**

   ```javascript
   function extractDomInventory(rootSelector) {
     const root = document.querySelector(rootSelector);
     if (!root) return { error: 'Root element not found: ' + rootSelector };

     const elements = [];

     function walk(node, depth) {
       if (!(node instanceof HTMLElement)) return;
       const style = getComputedStyle(node);
       if (style.display === 'none' || style.visibility === 'hidden') return;

       const rect = node.getBoundingClientRect();
       const rootRect = root.getBoundingClientRect();

       const el = {
         tag: node.tagName.toLowerCase(),
         depth: depth,
         width: Math.round(rect.width),
         height: Math.round(rect.height),
         x: Math.round(rect.left - rootRect.left),
         y: Math.round(rect.top - rootRect.top),
       };

       // Text content (direct text only, not children's text)
       const directText = Array.from(node.childNodes)
         .filter(n => n.nodeType === Node.TEXT_NODE)
         .map(n => n.textContent.trim())
         .join('')
         .trim();
       if (directText) el.text = directText;

       // Semantic attributes
       if (node.getAttribute('role')) el.role = node.getAttribute('role');
       if (node.getAttribute('data-testid')) el.testId = node.getAttribute('data-testid');
       if (node.placeholder) el.placeholder = node.placeholder;
       if (node.disabled) el.disabled = true;
       if (node.tagName === 'H1' || node.tagName === 'H2'
           || node.tagName === 'H3') el.heading = true;

       // Computed styles
       const bg = style.backgroundColor;
       if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
         el.backgroundColor = bg;
       }

       el.color = style.color;
       el.fontSize = style.fontSize;
       el.fontWeight = style.fontWeight;

       const pad = {
         top: style.paddingTop, right: style.paddingRight,
         bottom: style.paddingBottom, left: style.paddingLeft
       };
       if (Object.values(pad).some(v => v !== '0px')) el.padding = pad;

       if (style.gap && style.gap !== 'normal') el.gap = style.gap;
       if (style.borderRadius && style.borderRadius !== '0px') {
         el.borderRadius = style.borderRadius;
       }

       const borderR = style.borderRightWidth;
       const borderB = style.borderBottomWidth;
       const borderL = style.borderLeftWidth;
       const borderT = style.borderTopWidth;
       if ([borderR, borderB, borderL, borderT].some(v => v !== '0px')) {
         el.border = {
           top: borderT, right: borderR,
           bottom: borderB, left: borderL
         };
       }

       // Determine if meaningful
       const isMeaningful =
         el.text || el.heading || el.role || el.testId || el.placeholder ||
         el.backgroundColor || el.border ||
         ['button', 'input', 'textarea', 'table', 'th', 'td',
          'label', 'h1', 'h2', 'h3', 'p'].includes(el.tag);

       if (isMeaningful) elements.push(el);

       // Recurse
       for (const child of node.children) {
         walk(child, depth + 1);
       }
     }

     walk(root, 0);
     return elements;
   }
   ```

   If the `design-verify` skill is available, invoke it instead of running this script manually.

5. **Phase 3 — Map + Diff**

   Map Figma elements to DOM elements using this priority cascade:
   1. **Text match** — Figma TEXT element with `characters` matching DOM element with same text content
   2. **Semantic role** — Figma INSTANCE `"Button-Primary"` maps to DOM `<button>`, INSTANCE `"Input"` maps to DOM `<input>`
   3. **Structural position** — elements at the same depth/order in both trees
   4. **Container match** — Figma auto-layout frame with specific bg/padding maps to DOM element with matching bg/padding

   For each mapped pair, compare every shared property with these tolerances:

   | Property | Tolerance |
   |----------|-----------|
   | Dimensions (width, height) | +/-4px (DS components may add internal padding) |
   | Spacing (padding, gap) | +/-2px |
   | Colors | Exact match (normalize Figma hex to rgb for comparison) |
   | Typography (fontSize, fontWeight) | Exact match |
   | Border radius | +/-1px |
   | Text content / placeholder | Exact string match |
   | State (disabled) | Exact boolean match |
   | Border sides (which sides have borders) | Exact match |

6. **Phase 4 — Report**

   Produce a structured diff report as the criterion output.

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
