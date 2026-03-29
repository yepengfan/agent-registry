# slides

CI&T branded PowerPoint generation and auditing.

## Commands

| Command | Description |
|---------|-------------|
| `/slides:generate` | Generate `.pptx` from content outline + CI&T template |
| `/slides:audit` | Audit `.pptx` for brand design rule violations |

## Install

```bash
./install.sh slides
```

This symlinks `slides/commands/` into `~/.claude/commands/slides/`, making both slash commands globally available.

## Reference Materials

The `ref/` directory contains the source knowledge used to build these commands:

- `slide-design-rules.md` — 6-color brand palette, text/bg rules, nesting rules
- `slide-template-patterns.md` — python-pptx template handling patterns
- `slide-lessons-learned.md` — pitfalls from building a 27-slide deck
- `slide-audit-script.py` — standalone audit script (embedded in commands)

These are not installed — they exist for maintenance and context.
