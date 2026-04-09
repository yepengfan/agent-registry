# agent-registry

A unified registry for Claude Code **agents**, **orchestrators**, and **skills**, managed in one place and installable from anywhere you work.

## Concepts

- **Agent** — A standalone prompt file (`agent.md`) with domain knowledge and skill dependencies. Agents can be activated as slash commands or installed into a project's CLAUDE.md.
- **Orchestrator** — A special agent (`type: orchestrator`) that coordinates multiple sub-agents to complete a multi-step workflow. Orchestrators declare their sub-agents in the `subagents` frontmatter field.
- **Skill** — A package of slash commands that extend Claude Code's capabilities. Skills are reusable across agents.
- **Behavior** — A discipline rule (`behaviors/*.md`) that agents can equip via frontmatter. Behaviors are injected into agent prompts at install time, enforcing consistent practices like verification before committing or evidence-based claims.

## Structure

```
agent-registry/
  agents/
    <agent-name>/
      agent.md          # Agent prompt + YAML frontmatter
      ref/              # Domain knowledge docs
  behaviors/
    <name>.md           # Discipline rules (injected at install time)
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

| Agent | Type | Model | Description | Behaviors | Tools |
|-------|------|-------|-------------|-----------|-------|
| [cit-deck-creator](agents/cit-deck-creator/) | agent | sonnet | CI&T branded slide generation and auditing | — | python-pptx |
| [devops](agents/devops/) | agent | sonnet | Infrastructure and deployment specialist | — | docker, kubectl, terraform |
| [pr-reviewer](agents/pr-reviewer/) | agent | sonnet | Reviews PR diffs for code quality and posts GitHub comments | evidence-based-claims | gh |
| [pr-fixer](agents/pr-fixer/) | agent | sonnet | Fixes must-fix review issues on PR branches | verification-gate, evidence-based-claims, no-blind-trust, safe-revert-on-failure, structured-pushback | gh |
| [pr-orchestrator](agents/pr-orchestrator/) | orchestrator | opus | Orchestrates PR review and fix workflow | evidence-based-claims, independent-output-verification | gh |

## Available Skills

| Skill | Description |
|-------|-------------|
| [slides](skills/slides/) | CI&T branded slide generation and auditing commands |

## Available Behaviors

Behaviors are discipline rules that agents can equip. They are injected into the agent prompt at install time.

| Behavior | Description |
|----------|-------------|
| [verification-gate](behaviors/verification-gate.md) | Run verification command after changes, only commit on pass, revert on failure |
| [evidence-based-claims](behaviors/evidence-based-claims.md) | Never claim success or status without fresh verification evidence |
| [no-blind-trust](behaviors/no-blind-trust.md) | Verify findings and inputs before acting on them |
| [independent-output-verification](behaviors/independent-output-verification.md) | Verify sub-agent outputs independently rather than trusting self-reported results |
| [safe-revert-on-failure](behaviors/safe-revert-on-failure.md) | Revert changes that fail verification instead of committing broken code |
| [structured-pushback](behaviors/structured-pushback.md) | Push back on incorrect findings with technical reasoning instead of blindly complying |

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
  pr-fixer          [installed]  (used by: pr-orchestrator)  (behaviors: verification-gate, evidence-based-claims, no-blind-trust, safe-revert-on-failure, structured-pushback)
  pr-orchestrator   [installed]  (subagents: pr-reviewer ✓, pr-fixer ✓)  (behaviors: evidence-based-claims, independent-output-verification)
  pr-reviewer       [installed]  (used by: pr-orchestrator)  (behaviors: evidence-based-claims)

Skills:
  slides  [not installed]
```

### List available agents and skills

```bash
npx @yepengfan/agent-registry list
```

### Update installed agents and skills

After changing behavior files, agent prompts, or skill content, reinstall everything to pick up the changes:

```bash
npx @yepengfan/agent-registry update
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
behaviors:
  - verification-gate
  - evidence-based-claims
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
| behaviors | no | string[] | Behavior rules (injected at install time from `behaviors/`) |
| subagents | no | string[] | Sub-agent names (required when `type: orchestrator`) |
| interface | no | object | Input/output contract description |

### Validation Rules

- `name` must match `/^[a-zA-Z0-9_-]+$/`
- `version` must be valid semver
- `type` must be one of: `agent`, `orchestrator`
- `model` must be one of: `opus`, `sonnet`, `haiku`
- `behaviors` items must match `/^[a-zA-Z0-9_-]+$/` and correspond to files in `behaviors/`
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
behaviors:
  - evidence-based-claims
  - independent-output-verification
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

## Adding a New Behavior

1. Create `behaviors/<name>.md` with frontmatter and rules:
   ```markdown
   ---
   name: my-behavior
   description: One-line description of the discipline rule
   ---

   ## My Behavior

   Rules and instructions the agent must follow...
   ```
2. Add `- my-behavior` to the `behaviors` list in any agent's frontmatter
3. Run `npx @yepengfan/agent-registry update` to reinstall agents with the new behavior

Behaviors are injected between `<!-- behaviors:start -->` and `<!-- behaviors:end -->` markers in the installed agent file. They are self-contained — no runtime dependencies required.

## Adding a New Skill

1. Create `skills/<name>/commands/` with `.md` command files
2. Add a `README.md` describing the skill
3. Run `npx @yepengfan/agent-registry install --skill <name>` to install
