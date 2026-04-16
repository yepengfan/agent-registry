# figma-inspect

Extract a structured element inventory from a Figma screen for automated design verification.

## Commands

| Command | Description |
|---------|-------------|
| `/figma-inspect` | Extract element inventory from a Figma screen |

## Install

```bash
agent-registry install figma-inspect
```

This symlinks `figma-inspect/commands/` into `~/.claude/commands/figma-inspect/`, making the slash command globally available.

## Usage

```
/figma-inspect <figma-url-or-fileKey+nodeId>
```

**Input:** Figma file key + node ID, or a full Figma URL.

**Output:** JSON element inventory with every meaningful visible element's properties (text, colors, spacing, typography, borders, corner radii, component names, annotations).

## How It Works

Uses the Figma Plugin API via `figma:use_figma` to walk the node tree and extract structured data from every visible element. This replaces screenshot-based inspection with exact property values that can be programmatically compared against rendered DOM output.

## Used By

- `figma-design-match` criterion (Phase 1)
- `design-verify` skill (as input)
- Any agent needing structured Figma design data
