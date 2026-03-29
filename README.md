# skills-registry

My frequently used Claude Code skills, managed in one place.

## Structure

```
skills/
  <skill-name>/
    SKILL.md
```

Each subdirectory under `skills/` is a standalone Claude Code skill.

## Usage

### Install all skills

Symlink all skills into `~/.claude/skills/`:

```bash
./install.sh
```

### Install a single skill

```bash
./install.sh gitnexus-cli
```

### Uninstall all skills

```bash
./install.sh --uninstall
```

### List installed status

```bash
./install.sh --status
```

## Adding a new skill

1. Create `skills/<skill-name>/SKILL.md` with the standard frontmatter:

```markdown
---
name: <skill-name>
description: "When to trigger this skill"
---

# Skill content here
```

2. Run `./install.sh <skill-name>` to symlink it.
