# agent-registry

A unified registry for Claude Code **agents**, **orchestrators**, and **skills**, managed in one place and installable from anywhere you work.

## Concepts

- **Agent** — A standalone prompt file (`agent.md`) with domain knowledge and skill dependencies. Agents can be activated as slash commands or installed into a project's CLAUDE.md.
- **Orchestrator** — A special agent (`type: orchestrator`) that coordinates multiple sub-agents to complete a multi-step workflow. Orchestrators declare their sub-agents in the `subagents` frontmatter field.
- **Skill** — A package of slash commands that extend Claude Code's capabilities. Skills are reusable across agents.

## Structure

```
agent-registry/
  agents/
    <agent-name>/
      agent.md          # Agent prompt + YAML frontmatter
      ref/              # Domain knowledge docs
  skills/
    <skill-name>/
      commands/         # Slash commands -> ~/.claude/commands/<skill>/
      ref/              # Development reference (not installed)
  bin/
    cli.js              # npx entry point
  lib/
    frontmatter.js      # Frontmatter parser and validator
    installer.js        # Install/uninstall logic
    discovery.js        # Agent and skill discovery
  package.json
  test.js
```

## Available Agents

| Agent | Type | Model | Description | Skills | Tools |
|-------|------|-------|-------------|--------|-------|
| [cit-deck-creator](agents/cit-deck-creator/) | agent | sonnet | CI&T branded slide generation and auditing | slides | python-pptx |
| [devops](agents/devops/) | agent | sonnet | Infrastructure and deployment specialist | — | docker, kubectl, terraform |
| [pr-reviewer](agents/pr-reviewer/) | agent | sonnet | Reviews PR diffs for code quality and posts GitHub comments | — | gh |
| [pr-fixer](agents/pr-fixer/) | agent | sonnet | Fixes must-fix review issues on PR branches | — | gh |
| [pr-orchestrator](agents/pr-orchestrator/) | orchestrator | opus | Orchestrates PR review and fix workflow | — | gh |

## Available Skills

| Skill | Description |
|-------|-------------|
| [slides](skills/slides/) | CI&T branded slide generation and auditing commands |

## Usage

### Install everything

```bash
npx @yepengfan/agent-registry install
```

### Install a single agent (+ its skill dependencies)

```bash
npx @yepengfan/agent-registry install --agent cit-deck-creator
```

### Install a single skill

```bash
npx @yepengfan/agent-registry install --skill slides
```

### Install an agent into a project

```bash
npx @yepengfan/agent-registry project devops ~/my-project
```

This copies the agent prompt into `~/my-project/.claude/CLAUDE.md` and the reference docs into `~/my-project/.claude/ref/devops/`.

### Check status

```bash
npx @yepengfan/agent-registry status
```

Example output:

```
Agents:
  cit-deck-creator  [not installed]
  devops            [installed]
  pr-fixer          [not installed]  (used by: pr-orchestrator)
  pr-orchestrator   [not installed]  (subagents: pr-reviewer ✗, pr-fixer ✗)
  pr-reviewer       [not installed]  (used by: pr-orchestrator)

Skills:
  slides  [not installed]
```

### List available agents and skills

```bash
npx @yepengfan/agent-registry list
```

### Uninstall

```bash
npx @yepengfan/agent-registry uninstall cit-deck-creator   # auto-detects type
npx @yepengfan/agent-registry uninstall --agent devops      # explicit
npx @yepengfan/agent-registry uninstall --skill slides      # explicit
npx @yepengfan/agent-registry uninstall --all               # remove all
```

### Run tests

```bash
node test.js
```

## Agent File Format

```markdown
---
name: my-agent
description: What this agent does
version: 1.0.0
author: Your Name
type: agent
model: sonnet
tags: [category, tags]
skills:
  - skill-name
tools:
  - external-tool
---

Agent system prompt goes here...
```

### Frontmatter Schema

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| name | yes | string | Identifier (alphanumeric, hyphens, underscores) |
| description | yes | string | One-line description |
| version | yes | string | Semver version |
| author | yes | string | Creator/maintainer |
| type | no | `agent` \| `orchestrator` | Defaults to `agent` |
| model | no | `opus` \| `sonnet` \| `haiku` | Target Claude model tier |
| tags | no | string[] | Category tags |
| skills | no | string[] | Skill dependencies (auto-installed) |
| tools | no | string[] | External tools (warnings if missing) |
| subagents | no | string[] | Sub-agent names (required when `type: orchestrator`) |
| interface | no | string | Interaction interface (e.g. `cli`, `slash-command`) |

### Validation Rules

- `name` must match `/^[a-zA-Z0-9_-]+$/`
- `version` must be valid semver
- `type` must be one of: `agent`, `orchestrator`
- `model` must be one of: `opus`, `sonnet`, `haiku`
- `subagents` is required (and must be non-empty) when `type: orchestrator`
- `subagents` is forbidden when `type` is not `orchestrator`

## Orchestrator Frontmatter Example

```markdown
---
name: pr-orchestrator
description: Orchestrates PR review and fix workflow
version: 1.0.0
author: Yepeng Fan
type: orchestrator
model: opus
subagents:
  - pr-reviewer
  - pr-fixer
tools:
  - gh
---

Orchestrator prompt goes here...
```

## Adding a New Agent

1. Create `agents/<name>/` with an `agent.md` file
2. Add `ref/` docs with domain knowledge
3. List skill dependencies in frontmatter
4. Run `npx @yepengfan/agent-registry install --agent <name>` to install

## Adding a New Orchestrator

1. Create `agents/<name>/` with an `agent.md` file
2. Set `type: orchestrator` in frontmatter
3. List all sub-agents in `subagents:` (they must exist in the registry)
4. Set `model: opus` if this orchestrator coordinates complex multi-step work
5. Run `npx @yepengfan/agent-registry install --agent <name>` to install (sub-agents install automatically)

## Adding a New Skill

1. Create `skills/<name>/commands/` with `.md` command files
2. Add a `README.md` describing the skill
3. Run `npx @yepengfan/agent-registry install --skill <name>` to install
