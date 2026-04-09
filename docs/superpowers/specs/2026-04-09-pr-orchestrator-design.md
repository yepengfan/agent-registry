# PR Review Orchestrator — Design Spec

**Date:** 2026-04-09
**Status:** Approved
**Author:** Yepeng Fan

## Overview

Create a PR review orchestrator agent that uses Opus to coordinate two Sonnet sub-agents: one that reviews PRs and posts GitHub comments, and one that fixes must-fix issues. This is the first multi-agent orchestration pattern in the registry, requiring extensions to the agent format, install tooling, and a migration to a Node.js CLI for npm distribution.

**Goals:**
- Automate PR review and fix workflow with model-appropriate agent dispatch
- Establish composable agent architecture — standalone agents that also work as building blocks for orchestrators
- Publish the registry as an npm package (`agent-registry`)

## Design Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Orchestrator vs leaf distinction | `type` field in frontmatter (`orchestrator` or `agent`) |
| 2 | Interface contracts | Lightweight natural-language `interface.input` / `interface.output` |
| 3 | Model declaration | `model` field in frontmatter (`opus`, `sonnet`, `haiku`) |
| 4 | Dependency management | Auto-install subagents on orchestrator install, warn on subagent uninstall |
| 5 | Namespace strategy | Flat + prefix naming convention (`pr-reviewer`, `pr-fixer`, `pr-orchestrator`) |
| 6 | Invocation modes | Both slash command and project CLAUDE.md installation |
| 7 | Review scope | Diff + surrounding context, related files, test coverage, CI status |
| 8 | Fix behavior | Fix must-fix issues only; leave suggestions as comments |
| 9 | Loop behavior | Single pass by default; `--verify` flag enables one re-review cycle |
| 10 | Review output | GitHub PR inline comments via `gh` CLI |
| 11 | Existing code-reviewer | Replaced by the three new agents |
| 12 | npm package name | `agent-registry` (available, unscoped) |
| 13 | CLI rewrite | Node.js CLI replaces bash + python installer |

## Registry Schema Extensions

Three new optional frontmatter fields, all backward-compatible with existing agents:

```yaml
type: orchestrator          # 'agent' (default) | 'orchestrator'
model: opus                 # 'opus' | 'sonnet' | 'haiku' (unset = any)
subagents:                  # agent names this orchestrator composes
  - pr-reviewer
  - pr-fixer
interface:                  # lightweight input/output contract
  input: "PR number or URL"
  output: "Review comments posted, fixes committed"
```

### Validation Rules

- `type: orchestrator` requires non-empty `subagents` list
- `subagents` field requires `type: orchestrator` — error if `subagents` is present on a `type: agent`
- Each name in `subagents` must exist in `agents/`
- `model` values validated against allowed set: `[opus, sonnet, haiku]`
- `interface` is informational only — no runtime enforcement
- Existing agents with no `type` field default to `type: agent`

### Full Frontmatter Schema

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | yes | string | Identifier (alphanumeric, hyphens, underscores) |
| `description` | yes | string | One-line description |
| `version` | yes | string | Semver version |
| `author` | yes | string | Creator/maintainer |
| `type` | no | string | `agent` (default) or `orchestrator` |
| `model` | no | string | Intended model: `opus`, `sonnet`, `haiku` |
| `tags` | no | list | Category tags |
| `skills` | no | list | Skill dependencies (auto-installed) |
| `subagents` | no | list | Agent dependencies (auto-installed, orchestrators only) |
| `tools` | no | list | External tools (warnings if missing) |
| `interface` | no | object | `input` and `output` descriptions |

## Agent Structure

Replace `agents/code-reviewer/` with three new agents:

```
agents/
  pr-reviewer/
    agent.md
    ref/
      review-checklist.md      # migrated from code-reviewer
      coding-conventions.md    # migrated from code-reviewer
  pr-fixer/
    agent.md
    ref/
      fix-guidelines.md        # new
  pr-orchestrator/
    agent.md
    ref/
      workflow.md              # orchestration workflow reference
```

### pr-reviewer (Sonnet)

```yaml
---
name: pr-reviewer
description: Reviews PR diffs for code quality and posts GitHub comments
version: 1.0.0
author: Yepeng Fan
type: agent
model: sonnet
tags: [pr-workflow, code-quality]
tools:
  - gh
interface:
  input: "PR number or URL. Fetches diff and context via gh CLI."
  output: "Posts inline review comments to GitHub PR. Returns JSON summary: {issues: [{severity, file, line, message}]}"
---
```

- Fetches PR diff + surrounding context via `gh`
- Analyzes code quality, correctness, security, conventions
- Posts inline review comments to GitHub PR
- Returns structured JSON summary: `{issues: [{severity, file, line, message}]}`
- Severity levels: `must-fix`, `suggestion`
- Uses ref docs for review standards

### pr-fixer (Sonnet)

```yaml
---
name: pr-fixer
description: Fixes must-fix review issues on PR branches
version: 1.0.0
author: Yepeng Fan
type: agent
model: sonnet
tags: [pr-workflow, code-quality]
tools:
  - gh
interface:
  input: "PR number, branch name, and list of must-fix issues as JSON array."
  output: "Fixes committed and pushed. Returns JSON summary: {fixed: [...], unfixed: [...]}"
---
```

- Receives a list of `must-fix` issues from the orchestrator
- Checks out the PR branch
- Fixes each issue, commits with descriptive messages
- Pushes fixes to the PR branch
- Returns summary of what was fixed vs. what couldn't be fixed
- Ref doc defines safe fix boundaries (e.g., don't refactor unrelated code)

### pr-orchestrator (Opus)

```yaml
---
name: pr-orchestrator
description: Orchestrates PR review and fix workflow
version: 1.0.0
author: Yepeng Fan
type: orchestrator
model: opus
tags: [pr-workflow, code-quality]
subagents:
  - pr-reviewer
  - pr-fixer
tools:
  - gh
interface:
  input: "PR number or URL. Optional --verify flag."
  output: "Review comments posted to GitHub, must-fix issues fixed, final summary comment posted."
---
```

- Accepts PR number/URL as input
- Dispatches sub-agents via Claude Code's Agent tool with `model: "sonnet"`
- Never edits code itself — only coordinates

### Runtime: How the Orchestrator Finds Sub-Agent Prompts

When installed via `install.sh` or the Node.js CLI, each agent file gets a registry path comment prepended:

```markdown
<!-- agent-registry-path: /path/to/agent-registry/agents/pr-orchestrator -->
```

The orchestrator prompt instructs Claude to:
1. Read its own registry path from the comment at the top of the file
2. Derive the registry root (two levels up from the agent directory)
3. Read `agents/pr-reviewer/agent.md` and `agents/pr-fixer/agent.md` from the registry
4. Use the body of those files as the `prompt` parameter when calling the Agent tool

This means the orchestrator's prompt contains instructions like:
> "Read the file at `{registry_root}/agents/pr-reviewer/agent.md`. Use its content as the prompt when spawning the review sub-agent via the Agent tool with `model: sonnet`."

The sub-agent prompt is self-contained — it includes references to its own `ref/` docs, which the sub-agent resolves the same way (via its own registry path).

## Orchestrator Workflow

```
User invokes: /pr-orchestrator <PR-number> [--verify]
                    │
                    ▼
        ┌─────────────────────┐
        │  ORCHESTRATOR (Opus) │
        │  Parse input, fetch  │
        │  PR metadata via gh  │
        └──────────┬──────────┘
                   │
                   ▼
        ┌─────────────────────┐
        │  REVIEWER (Sonnet)   │
        │  Agent tool spawn    │
        │  - Fetch diff + ctx  │
        │  - Analyze code      │
        │  - Post GH comments  │
        │  - Return JSON       │
        └──────────┬──────────┘
                   │
                   ▼
        ┌─────────────────────┐
        │  Any must-fix issues?│
        └───┬─────────┬───────┘
            │         │
         no │         │ yes
            ▼         ▼
     Report clean   ┌─────────────────────┐
     & exit         │  FIXER (Sonnet)      │
                    │  Agent tool spawn    │
                    │  - Checkout branch   │
                    │  - Fix must-fix only │
                    │  - Commit + push     │
                    │  - Return summary    │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  --verify flag set?  │
                    └───┬─────────┬───────┘
                        │         │
                     no │         │ yes
                        ▼         ▼
                Post summary   ┌──────────────────┐
                & exit         │  REVIEWER (Sonnet)│
                               │  Re-review fixes  │
                               │  Post comments    │
                               └──────┬───────────┘
                                      │
                                      ▼
                               Post final summary
                               & exit (no more loops)
```

### Key Behaviors

- The orchestrator **never edits code itself** — it only dispatches and coordinates
- Each sub-agent gets a self-contained prompt with all context it needs (PR number, repo info, issue list)
- The orchestrator passes the reviewer's JSON output directly to the fixer as input
- Max 1 verify cycle — the re-review never triggers another fix round
- Final summary comment on the PR includes: issues found, issues fixed, issues remaining

### Error Handling

- If `gh` auth fails → orchestrator reports error and exits (no sub-agent spawn)
- If reviewer finds no issues → orchestrator posts "clean review" comment and exits
- If fixer can't fix an issue → it reports it as `unfixed` in its summary; orchestrator includes it in the final PR comment
- If a sub-agent times out → orchestrator reports partial results

## install.sh / CLI Changes

### Frontmatter Validation

Add validation for the new fields in `lib/frontmatter.js`:
- `type` — if present, must be `agent` or `orchestrator`
- `model` — if present, must be one of `[opus, sonnet, haiku]`
- `subagents` — if present, must be a list of strings
- If `type: orchestrator` and `subagents` is empty/missing → validation error
- `interface` — no validation (informational only)

### Subagent Auto-Install

Extend agent installation to handle `subagents` the same way it handles `skills`:
- Recursive: if a subagent is itself an orchestrator, its subagents get installed too
- Circular dependency guard: track visited agents to prevent infinite loops

### --list and --status Updates

`--list` groups by type:
```
Orchestrators:
  pr-orchestrator — PR review and fix workflow (subagents: pr-reviewer, pr-fixer)

Agents:
  pr-reviewer      — Reviews PR diffs for code quality
  pr-fixer         — Fixes must-fix review issues
  cit-deck-creator — CI&T branded slide generation
  devops           — Infrastructure and deployment specialist
```

`--status` shows dependency info:
```
pr-orchestrator  [installed]  (subagents: pr-reviewer ✓, pr-fixer ✓)
pr-reviewer      [installed]  (used by: pr-orchestrator)
pr-fixer         [installed]  (used by: pr-orchestrator)
```

Uninstall warns on dependency:
```
$ agent-registry uninstall pr-reviewer
  Removed agent: pr-reviewer
  Warning: agent 'pr-orchestrator' depends on subagent 'pr-reviewer'
```

### Files Changed

| File | Change |
|------|--------|
| `lib/frontmatter.js` | New — replaces parse_frontmatter.py |
| `lib/installer.js` | New — install/uninstall logic with subagent support |
| `lib/discovery.js` | New — list/status with type grouping |
| `bin/cli.js` | New — CLI entry point |

## npm Packaging

### Package Structure

```
agent-registry/
  package.json
  bin/
    cli.js                  # Node.js CLI entry point
  lib/
    installer.js            # Install/uninstall logic
    frontmatter.js          # YAML frontmatter parser
    discovery.js            # Agent/skill listing and status
  agents/                   # unchanged
  skills/                   # unchanged
  install.sh                # kept, delegates to node bin/cli.js
```

### CLI Commands

```bash
npx agent-registry install                     # all agents + skills
npx agent-registry install pr-orchestrator     # one agent + subagent + skill deps
npx agent-registry install --skill slides      # one skill
npx agent-registry project devops ./my-project # project mode
npx agent-registry list                        # list available
npx agent-registry status                      # show install status
npx agent-registry uninstall pr-reviewer       # auto-detect type
npx agent-registry uninstall --agent devops    # explicit
npx agent-registry uninstall --all             # everything
```

### Package Details

| Field | Value |
|-------|-------|
| Package name | `agent-registry` |
| CLI framework | None — `process.argv` parsing, zero dependencies |
| YAML parsing | Built-in regex parser (mirrors current Python approach) |
| Minimum Node | 18+ (LTS) |
| Dependencies | Zero |
| License | MIT |

## Testing Strategy

### Agent Tests

| Test | What it verifies |
|------|-----------------|
| Install orchestrator → subagents auto-installed | `install pr-orchestrator` installs all three agents |
| Uninstall subagent → warning printed | `uninstall pr-reviewer` warns about pr-orchestrator dependency |
| Uninstall orchestrator → subagents kept | Subagents remain independently usable |
| Circular dependency guard | Orchestrator A → B → A doesn't infinite loop |
| Missing subagent → error | `subagents: [nonexistent]` fails with clear message |

### Frontmatter Validation Tests

| Test | What it verifies |
|------|-----------------|
| `type: orchestrator` with subagents → valid | Happy path |
| `type: orchestrator` without subagents → error | Enforces the constraint |
| `model: opus` → valid | Accepted value |
| `model: gpt-4` → error | Not in allowed set |
| `interface` field parsed correctly | Input/output extracted |
| No `type` field → defaults to `agent` | Backward compatibility |

### CLI Tests (Node.js)

| Test | What it verifies |
|------|-----------------|
| `list` groups orchestrators and agents separately | Output format |
| `status` shows subagent relationships | `used by` / `subagents` info |
| `install --skill` still works | Backward compat |
| `project` mode copies ref docs and rewrites paths | Project installation |
| Frontmatter.js matches parse_frontmatter.py output | Migration parity |

### Integration Tests

| Test | What it verifies |
|------|-----------------|
| Install all → status → uninstall all → status | Full lifecycle |
| Install orchestrator, uninstall subagent, reinstall subagent | Dependency recovery |
| `npx agent-registry list` from a temp dir | npm distribution works |

## Migration Plan

### Phase 1: Registry schema extensions
1. Rewrite `lib/parse_frontmatter.py` → `lib/frontmatter.js`
2. Add validation for new fields: `type`, `model`, `subagents`, `interface`
3. Keep `parse_frontmatter.py` temporarily for backward compat during migration

### Phase 2: Create the three agents
4. Delete `agents/code-reviewer/`
5. Create `agents/pr-reviewer/` — migrate review-checklist.md and coding-conventions.md
6. Create `agents/pr-fixer/` — new ref/fix-guidelines.md
7. Create `agents/pr-orchestrator/` — orchestration prompt + ref/workflow.md

### Phase 3: Node.js CLI
8. Create `package.json`
9. Create `bin/cli.js` — argument parsing, command routing
10. Create `lib/installer.js` — install/uninstall logic with subagent support
11. Create `lib/discovery.js` — list/status with type grouping
12. Update `install.sh` to delegate to `node bin/cli.js`

### Phase 4: Testing
13. Create `test.js` — Node.js test suite
14. Verify backward compat: existing agents still install correctly
15. Verify orchestrator lifecycle: install → status → uninstall

### Phase 5: Publish
16. Update `README.md` — new schema docs, npm usage, orchestrator docs
17. Update design spec with final decisions
18. npm publish

### What Gets Deleted
- `agents/code-reviewer/` — replaced by pr-reviewer + pr-fixer + pr-orchestrator
- `lib/parse_frontmatter.py` — replaced by lib/frontmatter.js
- `test.sh` — replaced by test.js

### What Stays Unchanged
- `agents/cit-deck-creator/` — no changes
- `agents/devops/` — no changes
- `skills/slides/` — no changes

## Out of Scope

- Remote registry / package manager (e.g., `agent-registry pull <url>`) — future work
- Per-agent npm packages — future work
- Agent versioning/update mechanism beyond `version` field — future work
- GUI or web interface for browsing agents — future work
- Nested orchestration depth limits — handle if needed
