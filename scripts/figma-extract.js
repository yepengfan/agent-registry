// Figma Element Inventory Extraction Script
// Runtime: Figma Plugin API (via figma:use_figma)
//
// Usage: Read this file, replace __NODE_ID__ with the target node ID,
// then pass the entire string to figma:use_figma as the `code` parameter.
//
// Output: JSON string with { fileKey, nodeId, nodeName, elementCount, elements[] }

const targetNode = figma.getNodeById('__NODE_ID__');
if (!targetNode) {
  return JSON.stringify({ error: 'Node not found: __NODE_ID__' });
}

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

    // Text alignment
    if (node.type === 'TEXT') {
      el.textAlign = node.textAlignHorizontal; // 'LEFT','CENTER','RIGHT','JUSTIFIED'
      if (node.letterSpacing && node.letterSpacing.value !== 0) {
        el.letterSpacing = node.letterSpacing.value;
      }
      if (node.textDecoration && node.textDecoration !== 'NONE') {
        el.textDecoration = node.textDecoration; // 'UNDERLINE','STRIKETHROUGH'
      }
      if (node.textCase && node.textCase !== 'ORIGINAL') {
        el.textCase = node.textCase; // 'UPPER','LOWER','TITLE'
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

    // Auto-layout alignment
    if ('layoutMode' in node && node.layoutMode !== 'NONE') {
      el.primaryAxisAlign = node.primaryAxisAlignItems; // 'MIN','CENTER','MAX','SPACE_BETWEEN'
      el.counterAxisAlign = node.counterAxisAlignItems; // 'MIN','CENTER','MAX'
      el.primarySizing = node.primaryAxisSizingMode; // 'FIXED','AUTO'
      el.counterSizing = node.counterAxisSizingMode; // 'FIXED','AUTO'
    }

    // Sizing mode
    if ('layoutSizingHorizontal' in node) {
      el.sizingH = node.layoutSizingHorizontal; // 'FIXED','HUG','FILL'
      el.sizingV = node.layoutSizingVertical;
    }

    // Min/max dimensions
    if (node.minWidth) el.minWidth = node.minWidth;
    if (node.maxWidth) el.maxWidth = node.maxWidth;
    if (node.minHeight) el.minHeight = node.minHeight;
    if (node.maxHeight) el.maxHeight = node.maxHeight;

    // Fill (background color)
    if ('fills' in node && node.fills?.length > 0
        && node.fills[0].type === 'SOLID'
        && node.fills[0].visible !== false) {
      const c = node.fills[0].color;
      el.backgroundColor = rgbToHex(c.r, c.g, c.b);
      el.backgroundOpacity = node.fills[0].opacity ?? 1;
    }

    // Element-level opacity
    if ('opacity' in node && node.opacity !== undefined && node.opacity < 1) {
      el.opacity = node.opacity;
    }

    // Effects (shadows)
    if ('effects' in node && node.effects?.length > 0) {
      const shadows = node.effects.filter(e => e.visible !== false && (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW'));
      if (shadows.length > 0) {
        el.shadows = shadows.map(s => ({
          type: s.type,
          offsetX: s.offset?.x ?? 0,
          offsetY: s.offset?.y ?? 0,
          radius: s.radius ?? 0,
          color: s.color ? rgbToHex(s.color.r, s.color.g, s.color.b) : null,
        }));
      }
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

    // Overflow (clipping)
    if ('clipsContent' in node && node.clipsContent) {
      el.overflow = 'hidden';
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

const inventory = extractInventory(targetNode);
return JSON.stringify({
  nodeId: '__NODE_ID__',
  nodeName: targetNode.name,
  elementCount: inventory.length,
  elements: inventory
}, null, 2);
