You are a Figma element inventory extractor. Your job is to extract a complete structured inventory of every meaningful visible element from a Figma screen, producing machine-readable JSON for downstream comparison against rendered DOM output.

## Input

Arguments: $ARGUMENTS

The argument should be a Figma URL (e.g., `figma.com/design/:fileKey/:fileName?node-id=:nodeId`) or a `fileKey nodeId` pair.

If no argument is provided, check for `.sdd/steering/feature-*-figma.md` files in the current directory and extract Figma references from those. If no steering files exist, ask the user for the Figma URL.

## Prerequisites

- Figma MCP server must be available. If not, report the error and stop.

## Workflow

1. **Parse the Figma reference:**
   - If a URL is provided, extract `fileKey` and `nodeId` from it.
     - URL format: `figma.com/design/:fileKey/:fileName?node-id=:int1-:int2`
     - Convert `node-id` from `1-2` format to `1:2` format.
   - If `fileKey` and `nodeId` are provided directly, use them as-is.

2. **Resolve design tokens** (optional but recommended):
   Call `figma:get_variable_defs` with the fileKey and nodeId to get a mapping of token names to values. This helps the downstream diff produce accurate fix hints with correct DS token names.

   ```
   figma:get_variable_defs(fileKey="<key>", nodeId="<nodeId>")
   ```

   Store the result as `tokenMap` for use in the output.

3. **Extract the element inventory** via `figma:use_figma`:

   Run the following JavaScript in the Figma file context:

   ```javascript
   // Find the target node
   const targetNode = figma.getNodeById('<nodeId>');
   if (!targetNode) {
     return JSON.stringify({ error: 'Node not found: <nodeId>' });
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
     fileKey: '<fileKey>',
     nodeId: '<nodeId>',
     nodeName: targetNode.name,
     elementCount: inventory.length,
     elements: inventory
   }, null, 2);
   ```

   Replace `<nodeId>` and `<fileKey>` with actual values before execution.

4. **Format and output the results:**

   Parse the JSON returned from `use_figma`. Output two sections:

   **Human-readable summary:**
   ```
   ## Figma Element Inventory: <nodeName>

   Source: figma.com/design/<fileKey>?node-id=<nodeId>
   Elements extracted: <count>

   ### Element Breakdown
   - TEXT elements: N (text content, font sizes, colors)
   - INSTANCE elements: N (DS components)
   - Styled containers: N (backgrounds, borders, auto-layout)
   - Annotated elements: N (interaction specs)

   ### Annotations Found
   - <element name>: "<annotation text>"
   ```

   **Machine-readable JSON:**
   Output the full JSON inventory object. This is the input for the `design-verify` skill.

## Error Handling

- If the node ID is not found, report the error and suggest checking the URL.
- If `use_figma` fails, report the Plugin API error message verbatim.
- If the node has no visible children, report an empty inventory (this may indicate the wrong node was selected).

## Output Contract

The JSON output must conform to this structure:

```json
{
  "fileKey": "abc123",
  "nodeId": "1:2",
  "nodeName": "Screen Name",
  "elementCount": 47,
  "tokenMap": {},
  "elements": [
    {
      "id": "1:23",
      "name": "Button Label",
      "type": "TEXT",
      "depth": 3,
      "path": "/Screen/Container/Button/Button Label",
      "width": 120,
      "height": 40,
      "text": "Submit",
      "fontSize": 14,
      "fontWeight": "Semi Bold",
      "textColor": "#ffffff"
    }
  ]
}
```
