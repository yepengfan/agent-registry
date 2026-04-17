# MCP Tool Reference

Maps logical capabilities to actual MCP tool function names. The orchestrator reads this file and injects relevant sections into the reviewer's dispatch prompt.

## Playwright (browser automation)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `mcp__playwright__browser_navigate` | Navigate to URL | `url` |
| `mcp__playwright__browser_resize` | Set viewport size | `width`, `height` |
| `mcp__playwright__browser_snapshot` | Get accessibility tree (preferred over screenshot) | — |
| `mcp__playwright__browser_click` | Click element by ref | `element`, `ref` |
| `mcp__playwright__browser_type` | Type text into element | `element`, `ref`, `text` |
| `mcp__playwright__browser_evaluate` | Run JavaScript in page context | `function` (JS string) |
| `mcp__playwright__browser_take_screenshot` | Capture page as PNG | — |

### Common Playwright Workflow

```
1. mcp__playwright__browser_resize({width: 1280, height: 800})
2. mcp__playwright__browser_navigate({url: "http://localhost:3000/page"})
3. mcp__playwright__browser_snapshot()  — verify page loaded
4. mcp__playwright__browser_evaluate({function: "() => { return document.title }"})
5. mcp__playwright__browser_take_screenshot()
```

### Availability Probe

Call `mcp__playwright__browser_snapshot`. If it returns (even "no page open" or an accessibility tree), Playwright is available.

## Figma (design extraction)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `mcp__plugin_figma_figma__get_design_context` | Get code + screenshot for a node | `fileKey`, `nodeId` |
| `mcp__plugin_figma_figma__get_screenshot` | Screenshot of a node | `fileKey`, `nodeId` |
| `mcp__plugin_figma_figma__use_figma` | Run Plugin API JavaScript | `fileKey`, `code`, `description` |
| `mcp__plugin_figma_figma__get_metadata` | Get XML node tree | `fileKey`, `nodeId` |
| `mcp__plugin_figma_figma__get_variable_defs` | Get design token definitions | `fileKey`, `nodeId` |
| `mcp__plugin_figma_figma__whoami` | Get authenticated user info | — |

### Common Figma Workflow

```
1. mcp__plugin_figma_figma__get_design_context({fileKey: "abc123", nodeId: "1:2"})
2. mcp__plugin_figma_figma__use_figma({fileKey: "abc123", code: "<extraction script>", description: "Extract element inventory"})
3. mcp__plugin_figma_figma__get_variable_defs({fileKey: "abc123", nodeId: "1:2"})
```

### Availability Probe

Call `mcp__plugin_figma_figma__whoami`. If it returns user info, Figma MCP is available.

## GitHub CLI (always available)

The `gh` CLI is always available via Bash. Not an MCP tool — invoked directly:

```bash
gh pr view <PR> --json number,title,body
gh pr diff <PR>
gh api repos/{owner}/{repo}/pulls/{number}/reviews --method POST ...
```
