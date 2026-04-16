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

3. **Locate the extraction script:**
   Run `agent-registry root` to get the registry installation directory. Read the script from `{registry_root}/scripts/figma-extract.js`.

4. **Prepare and execute the script:**
   - Replace `__NODE_ID__` with the actual node ID in the script contents
   - Pass the entire script to `figma:use_figma` as the `code` parameter with the correct `fileKey`

5. **Format and output the results:**

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
   Output the full JSON inventory object. This is the input for the `design-verify` skill and `design-diff.js` script.

## Error Handling

- If the node ID is not found, report the error and suggest checking the URL.
- If `use_figma` fails, report the Plugin API error message verbatim.
- If the node has no visible children, report an empty inventory (this may indicate the wrong node was selected).

## Output Contract

The JSON output conforms to this structure:

```json
{
  "nodeId": "1:2",
  "nodeName": "Screen Name",
  "elementCount": 47,
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
