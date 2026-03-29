# skills-registry

Reusable Claude Code skill packages, managed in one place.

## Structure

Each skill is a self-contained **package** directory:

```
<skill-name>/
  commands/       # Slash commands → ~/.claude/commands/<skill-name>/
    action.md
  skills/         # Context skills → ~/.claude/skills/ (optional)
    SKILL.md
  ref/            # Reference materials (not installed)
  README.md
```

A package can have `commands/`, `skills/`, or both. The `ref/` directory holds source materials for development and maintenance — it is never installed.

## Available Packages

| Package | Type | Description |
|---------|------|-------------|
| [slides](slides/) | commands | CI&T branded slide generation and auditing |

## Usage

### Install all packages

```bash
./install.sh
```

### Install a single package

```bash
./install.sh slides
```

### Check status

```bash
./install.sh --status
```

### Uninstall all

```bash
./install.sh --uninstall
```

## Adding a new skill package

1. Create `<skill-name>/` at the repo root
2. Add `commands/` and/or `skills/` with your `.md` files
3. Add a `README.md` describing the package
4. Run `./install.sh <skill-name>` to symlink it
