// DOM Element Inventory Extraction Script
// Runtime: Browser context (via Playwright browser_evaluate)
//
// Usage: Read this file, replace __ROOT_SELECTOR__ with the target CSS selector,
// then pass the entire string to browser_evaluate.
//
// Output: JSON string with { url, rootSelector, elementCount, elements[] }

(function() {
  const rootSelector = '__ROOT_SELECTOR__';
  const root = document.querySelector(rootSelector);
  if (!root) {
    return JSON.stringify({ error: 'Root element not found: ' + rootSelector });
  }

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
    if (['H1', 'H2', 'H3'].includes(node.tagName)) el.heading = true;

    // Computed styles
    const bg = style.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      el.backgroundColor = bg;
    }

    el.color = style.color;
    el.fontSize = style.fontSize;
    el.fontWeight = style.fontWeight;
    el.textAlign = style.textAlign;
    el.lineHeight = style.lineHeight;
    if (style.letterSpacing && style.letterSpacing !== 'normal') el.letterSpacing = style.letterSpacing;
    if (style.textDecorationLine && style.textDecorationLine !== 'none') el.textDecoration = style.textDecorationLine;
    if (style.textTransform && style.textTransform !== 'none') el.textTransform = style.textTransform;

    const pad = {
      top: style.paddingTop, right: style.paddingRight,
      bottom: style.paddingBottom, left: style.paddingLeft
    };
    if (Object.values(pad).some(v => v !== '0px')) el.padding = pad;

    if (style.gap && style.gap !== 'normal') el.gap = style.gap;

    // Layout properties
    if (style.display === 'flex' || style.display === 'inline-flex') {
      el.flexDirection = style.flexDirection;
      el.alignItems = style.alignItems;
      el.justifyContent = style.justifyContent;
    }

    // Opacity
    if (style.opacity && style.opacity !== '1') el.opacity = style.opacity;

    // Box shadow
    if (style.boxShadow && style.boxShadow !== 'none') el.boxShadow = style.boxShadow;

    // Border colors (when border exists)
    if (el.border) {
      el.borderColor = {
        top: style.borderTopColor,
        right: style.borderRightColor,
        bottom: style.borderBottomColor,
        left: style.borderLeftColor,
      };
    }

    // Overflow
    if (style.overflow && style.overflow !== 'visible') el.overflow = style.overflow;

    // Min/max dimensions
    if (style.minWidth && style.minWidth !== '0px') el.minWidth = style.minWidth;
    if (style.maxWidth && style.maxWidth !== 'none') el.maxWidth = style.maxWidth;
    if (style.minHeight && style.minHeight !== '0px') el.minHeight = style.minHeight;
    if (style.maxHeight && style.maxHeight !== 'none') el.maxHeight = style.maxHeight;

    if (style.borderRadius && style.borderRadius !== '0px') {
      el.borderRadius = style.borderRadius;
    }

    const borderT = style.borderTopWidth;
    const borderR = style.borderRightWidth;
    const borderB = style.borderBottomWidth;
    const borderL = style.borderLeftWidth;
    if ([borderT, borderR, borderB, borderL].some(v => v !== '0px')) {
      el.border = {
        top: borderT, right: borderR,
        bottom: borderB, left: borderL
      };
    }

    // Icon/SVG detection
    const hasSvgChild = node.querySelector(':scope > svg') !== null;
    if (hasSvgChild) el.hasIcon = true;
    if (el.tag === 'svg') el.isIcon = true;

    // Determine if meaningful
    const isMeaningful =
      el.text || el.heading || el.role || el.testId || el.placeholder ||
      el.backgroundColor || el.border || el.hasIcon || el.isIcon ||
      ['button', 'input', 'textarea', 'table', 'th', 'td',
       'label', 'h1', 'h2', 'h3', 'p', 'svg'].includes(el.tag);

    if (isMeaningful) elements.push(el);

    // Element index among siblings (for order comparison)
    if (node.parentElement) {
      el.siblingIndex = Array.from(node.parentElement.children).indexOf(node);
    }

    // Recurse
    for (const child of node.children) {
      walk(child, depth + 1);
    }
  }

  walk(root, 0);
  return JSON.stringify({
    url: window.location.href,
    rootSelector: rootSelector,
    elementCount: elements.length,
    elements: elements
  }, null, 2);
})();
