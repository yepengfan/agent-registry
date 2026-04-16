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

const inventory = extractInventory(targetNode);
return JSON.stringify({
  nodeId: '__NODE_ID__',
  nodeName: targetNode.name,
  elementCount: inventory.length,
  elements: inventory
}, null, 2);
