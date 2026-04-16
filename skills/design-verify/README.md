# design-verify

Compare a Figma screen against a rendered page using structured element-by-element diffing.

## Commands

| Command | Description |
|---------|-------------|
| `/design-verify` | Compare Figma inventory against rendered DOM |

## Install

```bash
agent-registry install design-verify
```

This symlinks `design-verify/commands/` into `~/.claude/commands/design-verify/`, making the slash command globally available.

## Usage

```
/design-verify <page-url> [root-selector]
```

**Input:** Page URL to verify + optional CSS root selector (defaults to `body`). Requires a Figma element inventory to already be available (from `/figma-inspect` or inline extraction).

**Output:** Structured comparison report with matched pairs, mismatches (with exact values and fix hints), and unmatched elements.

## How It Works

1. Navigates to the page via Playwright and extracts computed styles from every meaningful DOM element
2. Maps Figma elements to DOM elements by text content, semantic role, structural position, and container properties
3. Diffs every shared property with configurable tolerances (dimensions +/-4px, spacing +/-2px, colors exact, typography exact)
4. Produces a structured JSON report with actionable fix hints

## Used By

- `figma-design-match` criterion (Phases 2-4)
- PR reviewer agents performing design verification
- Any agent needing to verify implementation fidelity
