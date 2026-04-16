# agent-registry

A unified registry for Claude Code **agents**, **orchestrators**, and **skills**, managed in one place and installable from anywhere you work.

## Concepts

- **Agent** — A standalone prompt file (`agent.md`) with domain knowledge and skill dependencies. Agents can be activated as slash commands or installed into a project's CLAUDE.md.
- **Orchestrator** — A special agent (`type: orchestrator`) that coordinates multiple sub-agents to complete a multi-step workflow. Orchestrators declare their sub-agents in the `subagents` frontmatter field.
- **Skill** — A package of slash commands that extend Claude Code's capabilities. Skills are reusable across agents.
- **Behavior** — A discipline rule (`behaviors/*.md`) that agents can equip via frontmatter. Behaviors are injected into agent prompts at install time, enforcing consistent practices like verification before committing or evidence-based claims.
- **Criteria** — A quality gate or advisory check (`criteria/*.md`) that agents evaluate during their workflow. Gate criteria block merge when failing; advisory criteria are reported but don't block. Criteria are injected into agent prompts at install time.
- **Profile** — A repo type definition (`profiles/*.md`) that maps task types (feature/bugfix/refactor) to criteria sets. Profiles are detected automatically from repo files (e.g., `package.json` + `tsconfig.json` = frontend).

## Structure

```
agent-registry/
  agents/
    <agent-name>/
      agent.md          # Agent prompt + YAML frontmatter
      ref/              # Domain knowledge docs
  behaviors/
    <name>.md           # Discipline rules (injected at install time)
  criteria/
    <name>.md           # Quality gates and advisory checks
  profiles/
    <name>.md           # Repo type → task type → criteria mappings
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
    profiles.js         # Profile loading, task type detection, criteria resolution
  package.json
  test.js
```

## Available Agents

| Agent | Type | Model | Description | Skills | Behaviors | Tools |
|-------|------|-------|-------------|--------|-----------|-------|
| [cit-deck-creator](agents/cit-deck-creator/) | agent | — | CI&T branded slide generation and auditing expert | slides | — | python-pptx |
| [devops](agents/devops/) | agent | — | Infrastructure and deployment specialist | — | — | docker, kubectl, terraform |
| [pr-reviewer](agents/pr-reviewer/) | agent | sonnet | Reviews PR diffs for code quality, Figma design verification, and posts GitHub comments | — | evidence-based-claims | gh, figma_mcp, playwright |
| [pr-fixer](agents/pr-fixer/) | agent | sonnet | Fixes must-fix review issues on PR branches | — | verification-gate, evidence-based-claims, no-blind-trust, safe-revert-on-failure, structured-pushback | gh |
| [pr-orchestrator](agents/pr-orchestrator/) | orchestrator | opus | Orchestrates PR review-fix loop until N consecutive clean runs (default 3) | — | evidence-based-claims, independent-output-verification | gh |

## Available Skills

| Skill | Description |
|-------|-------------|
| [slides](skills/slides/) | CI&T branded slide generation and auditing commands |

## Available Behaviors

Behaviors are discipline rules that agents can equip. They are injected into the agent prompt at install time.

| Behavior | Description |
|----------|-------------|
| [verification-gate](behaviors/verification-gate.md) | Run verification command after changes, only commit on pass, revert on failure |
| [evidence-based-claims](behaviors/evidence-based-claims.md) | Never claim success, completion, or status without fresh verification evidence |
| [no-blind-trust](behaviors/no-blind-trust.md) | Verify findings and inputs before acting on them |
| [independent-output-verification](behaviors/independent-output-verification.md) | Verify sub-agent outputs independently rather than trusting self-reported results |
| [safe-revert-on-failure](behaviors/safe-revert-on-failure.md) | Revert changes that fail verification instead of committing broken code |
| [structured-pushback](behaviors/structured-pushback.md) | Push back on incorrect or risky findings with technical reasoning instead of blindly complying |

## Available Criteria

Criteria are quality checks that agents evaluate during review. Gate criteria block merge; advisory criteria are reported only.

| Criteria | Type | Description |
|----------|------|-------------|
| [all-tests-pass](criteria/all-tests-pass.md) | gate | All existing tests pass after changes |
| [zero-must-fix-issues](criteria/zero-must-fix-issues.md) | gate | No must-fix issues remain after review |
| [has-regression-test](criteria/has-regression-test.md) | gate | Bugfix PRs must include a regression test |
| [has-test-coverage](criteria/has-test-coverage.md) | gate | New feature code has corresponding test coverage |
| [no-behavior-change](criteria/no-behavior-change.md) | gate | Refactor PRs must not change observable behavior |
| [no-accessibility-regression](criteria/no-accessibility-regression.md) | gate | UI changes maintain accessibility standards |
| [figma-design-match](criteria/figma-design-match.md) | gate | UI implementation matches linked Figma design (two-pass: rendered screenshot + code verification) |
| [no-breaking-api-change](criteria/no-breaking-api-change.md) | gate | API endpoints are not broken by changes |
| [has-migration-safety](criteria/has-migration-safety.md) | gate | Database migrations are safe for zero-downtime deployment |
| [no-new-lint-warnings](criteria/no-new-lint-warnings.md) | advisory | PR does not introduce new lint warnings |

## Available Profiles

Profiles map repo types to task-type-specific criteria sets. Detected automatically from repo files.

| Profile | Detects via | Feature criteria | Bugfix criteria | Refactor criteria |
|---------|------------|-----------------|----------------|-------------------|
| [frontend](profiles/frontend.md) | package.json + tsconfig.json | 5 (incl. a11y, figma) | 3 | 3 |
| [backend](profiles/backend.md) | requirements.txt | 5 (incl. API, migration) | 4 | 3 |

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
| criteria | no | string[] | Quality criteria (injected at install time from `criteria/`) |
| subagents | no | string[] | Sub-agent names (required when `type: orchestrator`) |
| interface | no | object | Input/output contract description |

### Validation Rules

- `name` must match `/^[a-zA-Z0-9_-]+$/`
- `version` is required (semver format recommended but not enforced at parse time)
- `type` must be one of: `agent`, `orchestrator`
- `model` must be one of: `opus`, `sonnet`, `haiku`
- `behaviors` items must match `/^[a-zA-Z0-9_-]+$/` (file existence in `behaviors/` is verified at install time)
- `criteria` items must match `/^[a-zA-Z0-9_-]+$/` (file existence in `criteria/` is verified at install time)
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

## Adding a New Criterion

1. Create `criteria/<name>.md` with frontmatter and evaluation rules:
   ```markdown
   ---
   name: my-criterion
   description: One-line description
   gate: true
   metric: metric_name
   pass_when: "condition for passing"
   ---

   ## My Criterion

   What this criterion checks...

   ### Pass
   When it passes...

   ### Fail
   When it fails...

   ### Output Contract
   Include in `criteria_results`:
   {"criterion": "my-criterion", "gate": true, "pass": <bool>, ...}
   ```
2. Add `- my-criterion` to the `criteria` list in any agent's frontmatter
3. Optionally add it to a profile's `criteria-feature`/`criteria-bugfix`/`criteria-refactor` list
4. Run `npx @yepengfan/agent-registry update` to reinstall agents with the new criterion

## Adding a New Profile

1. Create `profiles/<name>.md` with flattened frontmatter:
   ```markdown
   ---
   name: my-profile
   description: One-line description
   detect-files: [file1, file2]
   detect-priority: 10
   criteria-feature: [criterion-a, criterion-b]
   criteria-bugfix: [criterion-a, criterion-c]
   criteria-refactor: [criterion-a]
   ---

   ## My Profile

   Detection rules and conventions...
   ```
2. `detect-files` uses AND logic — all listed files must exist in the repo root
3. When multiple profiles match, highest `detect-priority` wins
4. The pr-orchestrator detects profiles automatically at review time — no installation needed

## Adding a New Skill

1. Create `skills/<name>/commands/` with `.md` command files
2. Add a `README.md` describing the skill
3. Run `npx @yepengfan/agent-registry install --skill <name>` to install
