#!/usr/bin/env node
'use strict';

// Design Diff — Figma vs DOM Element Comparison
// Runtime: Node.js CLI
//
// Usage:
//   node design-diff.js <figma-inventory.json> <dom-inventory.json> [--token-map tokens.json]
//   cat figma.json dom.json | node design-diff.js --stdin
//
// Output: JSON conforming to the figma-design-match criterion output contract.

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Tolerance thresholds — the single source of truth for comparison rules
// ---------------------------------------------------------------------------
const TOLERANCES = {
  width: 4,           // px
  height: 4,          // px
  paddingTop: 2,      // px
  paddingRight: 2,    // px
  paddingBottom: 2,   // px
  paddingLeft: 2,     // px
  gap: 2,             // px
  borderRadius: 1,    // px
  // Exact match (tolerance = 0)
  fontSize: 0,
  fontWeight: 0,
  backgroundColor: 0, // exact after normalization
  color: 0,           // exact after normalization
  textColor: 0,       // exact after normalization
  borderColor: 0,     // exact after normalization
  text: 0,            // exact string
  placeholder: 0,     // exact string
  disabled: 0,        // exact boolean
  borderSides: 0,     // exact match on which sides have borders
  lineHeight: 2,        // px
  letterSpacing: 0.5,   // px
  textAlign: 0,         // exact after normalization
  textDecoration: 0,    // exact
  textTransform: 0,     // exact after normalization
  flexDirection: 0,     // exact after normalization
  alignItems: 0,        // exact after normalization
  justifyContent: 0,    // exact after normalization
  opacity: 0.05,        // numeric
  boxShadow: 0,         // presence check
  overflow: 0,          // exact after normalization
};

// ---------------------------------------------------------------------------
// Font weight mapping: Figma style names → numeric weights
// ---------------------------------------------------------------------------
const FONT_WEIGHT_MAP = {
  'thin': '100',
  'hairline': '100',
  'extra light': '200',
  'ultralight': '200',
  'light': '300',
  'regular': '400',
  'normal': '400',
  'medium': '500',
  'semi bold': '600',
  'semibold': '600',
  'demibold': '600',
  'bold': '700',
  'extra bold': '800',
  'extrabold': '800',
  'ultrabold': '800',
  'black': '900',
  'heavy': '900',
};

// Figma layout mode → CSS flex direction
const FLEX_DIRECTION_MAP = {
  'HORIZONTAL': 'row',
  'VERTICAL': 'column',
};

// Figma alignment → CSS alignment
const ALIGNMENT_MAP = {
  'MIN': 'flex-start',
  'CENTER': 'center',
  'MAX': 'flex-end',
  'SPACE_BETWEEN': 'space-between',
};

// Figma text align → CSS text align
const TEXT_ALIGN_MAP = {
  'LEFT': 'left',
  'CENTER': 'center',
  'RIGHT': 'right',
  'JUSTIFIED': 'justify',
};

// Figma text case → CSS text transform
const TEXT_CASE_MAP = {
  'UPPER': 'uppercase',
  'LOWER': 'lowercase',
  'TITLE': 'capitalize',
};

// Figma text decoration → CSS text decoration
const TEXT_DECORATION_MAP = {
  'UNDERLINE': 'underline',
  'STRIKETHROUGH': 'line-through',
};

// ---------------------------------------------------------------------------
// Semantic role mapping: Figma component name patterns → DOM element types
// ---------------------------------------------------------------------------
const SEMANTIC_ROLE_MAP = [
  { pattern: /^button/i, tags: ['button'], roles: ['button'] },
  { pattern: /^input|^textfield|^text.?field/i, tags: ['input', 'textarea'], roles: ['textbox'] },
  { pattern: /^checkbox/i, tags: ['input'], roles: ['checkbox'], inputType: 'checkbox' },
  { pattern: /^radio/i, tags: ['input'], roles: ['radio'], inputType: 'radio' },
  { pattern: /^select|^dropdown/i, tags: ['select'], roles: ['listbox', 'combobox'] },
  { pattern: /^table/i, tags: ['table'], roles: ['table', 'grid'] },
  { pattern: /^switch|^toggle/i, tags: ['button', 'input'], roles: ['switch'] },
  { pattern: /^tab\b/i, tags: ['button'], roles: ['tab'] },
  { pattern: /^link/i, tags: ['a'], roles: ['link'] },
  { pattern: /^dialog|^modal/i, tags: ['dialog', 'div'], roles: ['dialog'] },
];

// ---------------------------------------------------------------------------
// Color normalization
// ---------------------------------------------------------------------------

/** Convert Figma hex (#rrggbb) to rgb(r, g, b) string */
function hexToRgb(hex) {
  if (!hex || !hex.startsWith('#')) return hex;
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Normalize any color string to rgb(r, g, b) for comparison */
function normalizeColor(color) {
  if (!color) return null;
  if (color.startsWith('#')) return hexToRgb(color);
  // Normalize rgba(r, g, b, 1) → rgb(r, g, b)
  const rgbaMatch = color.match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*1\s*\)$/);
  if (rgbaMatch) return `rgb(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]})`;
  // Normalize whitespace in rgb()
  const rgbMatch = color.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);
  if (rgbMatch) return `rgb(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]})`;
  return color;
}

/** Parse a CSS px value to a number */
function parsePx(val) {
  if (typeof val === 'number') return val;
  if (typeof val !== 'string') return NaN;
  const n = parseFloat(val);
  return isNaN(n) ? NaN : n;
}

/** Normalize Figma font weight style name to numeric string */
function normalizeFontWeight(weight) {
  if (!weight) return null;
  const s = String(weight).toLowerCase().trim();
  return FONT_WEIGHT_MAP[s] || s;
}

// ---------------------------------------------------------------------------
// Phase 3: Mapping — match Figma elements to DOM elements
// ---------------------------------------------------------------------------

function mapElements(figmaElements, domElements) {
  const mapped = [];
  const usedDom = new Set();
  const usedFigma = new Set();

  // Pass 1: Text match (highest confidence)
  for (const fig of figmaElements) {
    if (fig.type !== 'TEXT' || !fig.text) continue;
    const trimmed = fig.text.trim();
    for (let i = 0; i < domElements.length; i++) {
      if (usedDom.has(i)) continue;
      const dom = domElements[i];
      if (dom.text && dom.text.trim() === trimmed) {
        mapped.push({ figma: fig, dom, method: 'text-match' });
        usedDom.add(i);
        usedFigma.add(fig.id);
        break;
      }
    }
  }

  // Pass 2: Semantic role match (component name → DOM tag/role)
  for (const fig of figmaElements) {
    if (usedFigma.has(fig.id)) continue;
    if (fig.type !== 'INSTANCE' || !fig.componentName) continue;

    const rule = SEMANTIC_ROLE_MAP.find(r => r.pattern.test(fig.componentName));
    if (!rule) continue;

    for (let i = 0; i < domElements.length; i++) {
      if (usedDom.has(i)) continue;
      const dom = domElements[i];
      const tagMatch = rule.tags.includes(dom.tag);
      const roleMatch = dom.role && rule.roles.includes(dom.role);
      if (tagMatch || roleMatch) {
        mapped.push({ figma: fig, dom, method: 'semantic-role' });
        usedDom.add(i);
        usedFigma.add(fig.id);
        break;
      }
    }
  }

  // Pass 3: Structural position (same depth + order)
  const remainingFigma = figmaElements.filter(f => !usedFigma.has(f.id));
  const remainingDom = domElements.filter((_, i) => !usedDom.has(i));
  const remainingDomIndices = domElements
    .map((_, i) => i)
    .filter(i => !usedDom.has(i));

  // Group by depth
  const figmaByDepth = {};
  for (const fig of remainingFigma) {
    (figmaByDepth[fig.depth] = figmaByDepth[fig.depth] || []).push(fig);
  }
  const domByDepth = {};
  for (let j = 0; j < remainingDom.length; j++) {
    const dom = remainingDom[j];
    const origIdx = remainingDomIndices[j];
    (domByDepth[dom.depth] = domByDepth[dom.depth] || []).push({ dom, origIdx });
  }

  for (const depth of Object.keys(figmaByDepth)) {
    const figs = figmaByDepth[depth];
    const doms = domByDepth[depth] || [];
    const limit = Math.min(figs.length, doms.length);
    for (let k = 0; k < limit; k++) {
      if (usedFigma.has(figs[k].id) || usedDom.has(doms[k].origIdx)) continue;
      mapped.push({ figma: figs[k], dom: doms[k].dom, method: 'structural-position' });
      usedDom.add(doms[k].origIdx);
      usedFigma.add(figs[k].id);
    }
  }

  // Pass 4: Container match (background color + padding)
  const stillUnmappedFigma = figmaElements.filter(f => !usedFigma.has(f.id));
  for (const fig of stillUnmappedFigma) {
    if (!fig.backgroundColor || !fig.padding) continue;
    const figBg = normalizeColor(fig.backgroundColor);

    for (let i = 0; i < domElements.length; i++) {
      if (usedDom.has(i)) continue;
      const dom = domElements[i];
      if (!dom.backgroundColor || !dom.padding) continue;
      const domBg = normalizeColor(dom.backgroundColor);
      if (figBg === domBg) {
        mapped.push({ figma: fig, dom, method: 'container-match' });
        usedDom.add(i);
        usedFigma.add(fig.id);
        break;
      }
    }
  }

  const unmatchedFigma = figmaElements.filter(f => !usedFigma.has(f.id));
  const unmatchedDom = domElements.filter((_, i) => !usedDom.has(i));

  return { mapped, unmatchedFigma, unmatchedDom };
}

// ---------------------------------------------------------------------------
// Phase 3 (cont.): Diff — compare mapped pairs with tolerances
// ---------------------------------------------------------------------------

function diffPair(figma, dom, tokenMap) {
  const mismatches = [];

  function check(property, figVal, domVal, tolerance) {
    if (figVal == null || domVal == null) return;

    if (tolerance === 0) {
      // Exact match
      if (String(figVal) !== String(domVal)) {
        mismatches.push({
          property,
          figma_value: String(figVal),
          dom_value: String(domVal),
        });
      }
    } else {
      // Numeric tolerance
      const fNum = parsePx(figVal);
      const dNum = parsePx(domVal);
      if (isNaN(fNum) || isNaN(dNum)) return;
      if (Math.abs(fNum - dNum) > tolerance) {
        mismatches.push({
          property,
          figma_value: fNum + 'px',
          dom_value: dNum + 'px',
        });
      }
    }
  }

  // Dimensions
  check('width', figma.width, dom.width, TOLERANCES.width);
  check('height', figma.height, dom.height, TOLERANCES.height);

  // Text content
  if (figma.text != null && dom.text != null) {
    check('text', figma.text.trim(), dom.text.trim(), TOLERANCES.text);
  }
  if (figma.text != null && dom.placeholder != null && dom.text == null) {
    check('placeholder', figma.text.trim(), dom.placeholder.trim(), TOLERANCES.placeholder);
  }

  // Typography
  if (figma.fontSize != null && dom.fontSize != null) {
    check('fontSize', figma.fontSize, parsePx(dom.fontSize), TOLERANCES.fontSize);
  }
  if (figma.fontWeight != null && dom.fontWeight != null) {
    const figWeight = normalizeFontWeight(figma.fontWeight);
    const domWeight = String(dom.fontWeight);
    check('fontWeight', figWeight, domWeight, TOLERANCES.fontWeight);
  }

  // Colors
  if (figma.textColor && dom.color) {
    const fc = normalizeColor(figma.textColor);
    const dc = normalizeColor(dom.color);
    check('color', fc, dc, TOLERANCES.color);
  }
  if (figma.backgroundColor && dom.backgroundColor) {
    const fc = normalizeColor(figma.backgroundColor);
    const dc = normalizeColor(dom.backgroundColor);
    check('backgroundColor', fc, dc, TOLERANCES.backgroundColor);
  }

  // Spacing (padding)
  if (figma.padding && dom.padding) {
    check('padding-top', figma.padding.top, dom.padding.top, TOLERANCES.paddingTop);
    check('padding-right', figma.padding.right, dom.padding.right, TOLERANCES.paddingRight);
    check('padding-bottom', figma.padding.bottom, dom.padding.bottom, TOLERANCES.paddingBottom);
    check('padding-left', figma.padding.left, dom.padding.left, TOLERANCES.paddingLeft);
  }

  // Gap
  if (figma.gap != null && dom.gap != null) {
    check('gap', figma.gap, dom.gap, TOLERANCES.gap);
  }

  // Border radius
  if (figma.borderRadius != null && dom.borderRadius != null) {
    const figBr = typeof figma.borderRadius === 'object'
      ? figma.borderRadius.tl : figma.borderRadius;
    check('borderRadius', figBr, dom.borderRadius, TOLERANCES.borderRadius);
  }

  // Border sides
  if (figma.borderWidth != null && dom.border) {
    const figHasBorder = figma.borderWidth > 0;
    const domSides = dom.border;
    const domHasTop = parsePx(domSides.top) > 0;
    const domHasRight = parsePx(domSides.right) > 0;
    const domHasBottom = parsePx(domSides.bottom) > 0;
    const domHasLeft = parsePx(domSides.left) > 0;
    if (figHasBorder !== (domHasTop || domHasRight || domHasBottom || domHasLeft)) {
      mismatches.push({
        property: 'border',
        figma_value: figHasBorder ? figma.borderWidth + 'px' : '0px',
        dom_value: `top:${domSides.top} right:${domSides.right} bottom:${domSides.bottom} left:${domSides.left}`,
      });
    }
  }

  // Border color
  if (figma.borderColor && dom.border) {
    // DOM border color would need additional extraction — skip if not available
  }

  // Text alignment
  if (figma.textAlign && dom.textAlign) {
    const figAlign = TEXT_ALIGN_MAP[figma.textAlign] || figma.textAlign.toLowerCase();
    check('textAlign', figAlign, dom.textAlign, TOLERANCES.textAlign);
  }

  // Line height
  if (figma.lineHeight != null && dom.lineHeight != null) {
    check('lineHeight', figma.lineHeight, parsePx(dom.lineHeight), TOLERANCES.lineHeight);
  }

  // Letter spacing
  if (figma.letterSpacing != null && dom.letterSpacing != null) {
    check('letterSpacing', figma.letterSpacing, parsePx(dom.letterSpacing), TOLERANCES.letterSpacing);
  }

  // Text decoration
  if (figma.textDecoration && dom.textDecoration) {
    const figDeco = TEXT_DECORATION_MAP[figma.textDecoration] || figma.textDecoration.toLowerCase();
    check('textDecoration', figDeco, dom.textDecoration, TOLERANCES.textDecoration);
  }

  // Text transform
  if (figma.textCase && dom.textTransform) {
    const figCase = TEXT_CASE_MAP[figma.textCase] || figma.textCase.toLowerCase();
    check('textTransform', figCase, dom.textTransform, TOLERANCES.textTransform);
  }

  // Flex direction
  if (figma.layout && dom.flexDirection) {
    const figDir = FLEX_DIRECTION_MAP[figma.layout] || figma.layout.toLowerCase();
    check('flexDirection', figDir, dom.flexDirection, TOLERANCES.flexDirection);
  }

  // Alignment (main axis)
  if (figma.primaryAxisAlign && dom.justifyContent) {
    const figAlign = ALIGNMENT_MAP[figma.primaryAxisAlign] || figma.primaryAxisAlign.toLowerCase();
    check('justifyContent', figAlign, dom.justifyContent, TOLERANCES.justifyContent);
  }

  // Alignment (cross axis)
  if (figma.counterAxisAlign && dom.alignItems) {
    const figAlign = ALIGNMENT_MAP[figma.counterAxisAlign] || figma.counterAxisAlign.toLowerCase();
    check('alignItems', figAlign, dom.alignItems, TOLERANCES.alignItems);
  }

  // Opacity
  if (figma.opacity != null && dom.opacity != null) {
    const fOp = typeof figma.opacity === 'number' ? figma.opacity : parseFloat(figma.opacity);
    const dOp = typeof dom.opacity === 'number' ? dom.opacity : parseFloat(dom.opacity);
    if (!isNaN(fOp) && !isNaN(dOp) && Math.abs(fOp - dOp) > TOLERANCES.opacity) {
      mismatches.push({
        property: 'opacity',
        figma_value: String(fOp),
        dom_value: String(dOp),
      });
    }
  }

  // Box shadow (presence check)
  if (figma.shadows && figma.shadows.length > 0 && !dom.boxShadow) {
    mismatches.push({
      property: 'boxShadow',
      figma_value: 'has shadow',
      dom_value: 'none',
    });
  }
  if (!figma.shadows && dom.boxShadow) {
    mismatches.push({
      property: 'boxShadow',
      figma_value: 'none',
      dom_value: 'has shadow',
    });
  }

  // Overflow
  if (figma.overflow && dom.overflow) {
    check('overflow', figma.overflow, dom.overflow, TOLERANCES.overflow);
  }

  // Disabled state
  if (figma.annotation && /disabled/i.test(figma.annotation) && dom.disabled != null) {
    if (!dom.disabled) {
      mismatches.push({
        property: 'disabled',
        figma_value: 'true (from annotation)',
        dom_value: 'false',
      });
    }
  }

  // Generate fix hints
  for (const m of mismatches) {
    m.fix_hint = generateFixHint(m.property, m.figma_value, m.dom_value, tokenMap);
  }

  return mismatches;
}

// ---------------------------------------------------------------------------
// Fix hint generation
// ---------------------------------------------------------------------------

function generateFixHint(property, figmaVal, domVal, tokenMap) {
  const tokenHint = tokenMap ? findTokenForValue(property, figmaVal, tokenMap) : null;

  switch (property) {
    case 'padding-top':
    case 'padding-right':
    case 'padding-bottom':
    case 'padding-left':
    case 'gap': {
      const side = property.replace('padding-', '');
      const abbrev = property === 'gap' ? 'gap' : `p${side[0]}`;
      return tokenHint
        ? `Use ${abbrev} token "${tokenHint}" (${figmaVal}) instead of ${domVal}`
        : `Expected ${figmaVal}, got ${domVal}. Check spacing token for ${property}.`;
    }
    case 'fontSize':
      return tokenHint
        ? `Use font-size token "${tokenHint}" (${figmaVal})`
        : `Expected font-size ${figmaVal}, got ${domVal}`;
    case 'fontWeight':
      return `Expected font-weight ${figmaVal}, got ${domVal}`;
    case 'color':
    case 'textColor':
      return tokenHint
        ? `Use text color token "${tokenHint}" (${figmaVal})`
        : `Expected text color ${figmaVal}, got ${domVal}`;
    case 'backgroundColor':
      return tokenHint
        ? `Use background color token "${tokenHint}" (${figmaVal})`
        : `Expected background ${figmaVal}, got ${domVal}`;
    case 'borderRadius':
      return tokenHint
        ? `Use border-radius token "${tokenHint}" (${figmaVal})`
        : `Expected border-radius ${figmaVal}, got ${domVal}`;
    case 'border':
      return `Border mismatch: Figma=${figmaVal}, DOM=${domVal}`;
    case 'text':
    case 'placeholder':
      return `Text content mismatch: expected "${figmaVal}", got "${domVal}". Check i18n key.`;
    case 'disabled':
      return `Element should be disabled per Figma annotation`;
    case 'width':
    case 'height':
      return `Expected ${property} ${figmaVal}, got ${domVal}. Check size constraint or container.`;
    case 'textAlign':
      return `Expected text-align ${figmaVal}, got ${domVal}`;
    case 'lineHeight':
      return tokenHint
        ? `Use line-height token "${tokenHint}" (${figmaVal})`
        : `Expected line-height ${figmaVal}, got ${domVal}`;
    case 'letterSpacing':
      return `Expected letter-spacing ${figmaVal}, got ${domVal}`;
    case 'textDecoration':
      return `Expected text-decoration ${figmaVal}, got ${domVal}`;
    case 'textTransform':
      return `Expected text-transform ${figmaVal}, got ${domVal}`;
    case 'flexDirection':
      return `Expected flex-direction ${figmaVal}, got ${domVal}. Check layout orientation.`;
    case 'justifyContent':
      return `Expected justify-content ${figmaVal}, got ${domVal}. Check main-axis alignment.`;
    case 'alignItems':
      return `Expected align-items ${figmaVal}, got ${domVal}. Check cross-axis alignment.`;
    case 'opacity':
      return `Expected opacity ${figmaVal}, got ${domVal}`;
    case 'boxShadow':
      return `Shadow mismatch: Figma=${figmaVal}, DOM=${domVal}. Check shadow/elevation token.`;
    case 'overflow':
      return `Expected overflow ${figmaVal}, got ${domVal}`;
    case 'presence':
      return figmaVal === 'exists'
        ? `Element exists in Figma but missing in DOM — implement it`
        : `Element exists in DOM but not in Figma — verify if intentional`;
    default:
      return `Expected ${figmaVal}, got ${domVal}`;
  }
}

function findTokenForValue(property, value, tokenMap) {
  if (!tokenMap) return null;
  const numVal = parsePx(value);
  for (const [name, tokenVal] of Object.entries(tokenMap)) {
    if (typeof tokenVal === 'number' && tokenVal === numVal) return name;
    if (String(tokenVal) === String(value)) return name;
    if (normalizeColor(String(tokenVal)) === normalizeColor(String(value))) return name;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main: run the full comparison pipeline
// ---------------------------------------------------------------------------

function compare(figmaInventory, domInventory, tokenMap) {
  const figmaElements = figmaInventory.elements || [];
  const domElements = domInventory.elements || [];

  // Phase 3: Map
  const { mapped, unmatchedFigma, unmatchedDom } = mapElements(figmaElements, domElements);

  // Phase 3 (cont.): Diff each mapped pair
  const allMismatches = [];
  for (const { figma, dom, method } of mapped) {
    const pairMismatches = diffPair(figma, dom, tokenMap);
    for (const m of pairMismatches) {
      allMismatches.push({
        figma_element: `${figma.name} (${figma.type}, ${figma.id})`,
        dom_element: dom.testId
          ? `${dom.tag}[data-testid="${dom.testId}"]`
          : `${dom.tag} (depth ${dom.depth})`,
        match_method: method,
        ...m,
      });
    }
  }

  // Presence mismatches: Figma elements with no DOM match
  for (const fig of unmatchedFigma) {
    // Filter noise: only report meaningful unmatched elements
    const isText = fig.type === 'TEXT' && fig.text;
    const isComponent = fig.type === 'INSTANCE';
    const isContainer = fig.backgroundColor || fig.layout;
    if (isText || isComponent || isContainer) {
      allMismatches.push({
        figma_element: `${fig.name} (${fig.type}, ${fig.id})`,
        dom_element: null,
        match_method: 'unmatched',
        property: 'presence',
        figma_value: 'exists',
        dom_value: 'missing',
        fix_hint: `Element "${fig.name}" exists in Figma but has no corresponding DOM element. Implement this element.`,
      });
    }
  }

  // Presence mismatches: DOM elements with no Figma match
  for (const dom of unmatchedDom) {
    // Filter noise: only report elements with identifiable content
    const hasIdentity = dom.text || dom.testId || dom.role || dom.heading;
    if (hasIdentity) {
      allMismatches.push({
        figma_element: null,
        dom_element: dom.testId
          ? `${dom.tag}[data-testid="${dom.testId}"]`
          : `${dom.tag} (depth ${dom.depth})`,
        match_method: 'unmatched',
        property: 'presence',
        figma_value: 'missing',
        dom_value: 'exists',
        fix_hint: `Element "${dom.testId || dom.text || dom.tag}" exists in DOM but not in Figma. Verify if intentional (BRD deviation) or remove.`,
      });
    }
  }

  // Phase 4: Report
  return {
    criterion: 'figma-design-match',
    gate: true,
    pass: allMismatches.length === 0,
    metric: 'design_deviation_count',
    value: allMismatches.length,
    detail: allMismatches.length === 0
      ? `${mapped.length} elements inspected, all within tolerance`
      : `${allMismatches.length} mismatches found across ${mapped.length} elements inspected`,
    inventory: {
      figma_elements: figmaElements.length,
      dom_elements: domElements.length,
      mapped_pairs: mapped.length,
      unmatched_figma: unmatchedFigma.length,
      unmatched_dom: unmatchedDom.length,
    },
    mismatches: allMismatches,
    unmatched_figma: unmatchedFigma.map(f => ({
      name: f.name,
      type: f.type,
      annotation: f.annotation || null,
    })),
    unmatched_dom: unmatchedDom.map(d => ({
      tag: d.tag,
      testId: d.testId || null,
      text: d.text || null,
    })),
  };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function printUsage() {
  console.log(`Usage: design-diff <figma.json> <dom.json> [--token-map tokens.json]

Compare a Figma element inventory against a DOM element inventory.
Outputs a structured JSON report conforming to the figma-design-match criterion.

Arguments:
  figma.json        Path to Figma element inventory JSON (from figma-extract.js)
  dom.json          Path to DOM element inventory JSON (from dom-extract.js)

Options:
  --token-map FILE  Optional DS token map JSON for richer fix hints
  --help            Show this help`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const positional = args.filter(a => !a.startsWith('--'));
  if (positional.length < 2) {
    console.error('Error: Two inventory JSON files required.');
    printUsage();
    process.exit(1);
  }

  const figmaPath = path.resolve(positional[0]);
  const domPath = path.resolve(positional[1]);

  let tokenMap = null;
  const tokenIdx = args.indexOf('--token-map');
  if (tokenIdx !== -1 && args[tokenIdx + 1]) {
    tokenMap = JSON.parse(fs.readFileSync(path.resolve(args[tokenIdx + 1]), 'utf8'));
  }

  const figmaInventory = JSON.parse(fs.readFileSync(figmaPath, 'utf8'));
  const domInventory = JSON.parse(fs.readFileSync(domPath, 'utf8'));

  const report = compare(figmaInventory, domInventory, tokenMap);
  console.log(JSON.stringify(report, null, 2));

  process.exit(report.pass ? 0 : 1);
}

// Export for testing; run as CLI when executed directly
module.exports = { compare, mapElements, diffPair, normalizeColor, normalizeFontWeight, hexToRgb, parsePx, TOLERANCES, FONT_WEIGHT_MAP, FLEX_DIRECTION_MAP, ALIGNMENT_MAP, TEXT_ALIGN_MAP, TEXT_CASE_MAP, TEXT_DECORATION_MAP };

if (require.main === module) {
  main();
}
