# Agentic Design Principles

> Reference document for designing and evolving multi-agent workflows.
> Update when new failure patterns are observed or principles need revision.

## 1. Single Responsibility

Each agent has ONE job. If an agent does two things, split it.

**Rationale:** The pr-reviewer was overloaded with code review and Figma verification. Splitting into pr-code and pr-design made each focused and manageable.

## 2. Bounded Work Per Agent

No agent should receive unbounded input. If input scales with PR size (files, diff lines), the coordinator must batch it.

**Rationale:** A single reviewer can't handle a 2000-line diff. The coordinator batches files into ~500 diff-line chunks so each reviewer stays within context budget.

**Rule:** Target ≤500 diff lines per code review agent. If a single file exceeds 500 lines, it gets its own batch.

## 3. Constrained Reading Protocol

Every agent that reads files must have explicit rules: what tool to use, max tool calls per file, no redundant reads.

**Rules:**
- Never fetch the full monolithic diff — process one file at a time
- Use the Read tool for file context — not `gh api`, `git show`, or `cat`
- Max 3 tool calls per changed file (1 for diff, up to 2 for context)
- Analyze as you read — don't queue all reading before analysis
- Never read the same content twice via a different command
- Never pipe through head/tail/sed — use Read with offset/limit

**Rationale:** Without constraints, the reviewer wasted 70 of 80 tool calls reading the same content in different ways.

## 4. Verify, Don't Trust

Every claim by a sub-agent must be independently verified by the caller.

| Claim | Verify by |
|---|---|
| "Tests pass" | Run test suite, check output |
| "Committed and pushed" | `git log --oneline -1` for the expected SHA |
| "N issues found" | Count the actual JSON array length |
| "Comments posted" | `gh pr view --comments` |

**Rationale:** The fixer reported "committed and pushed" but the commit didn't exist.

## 5. Recover on Verification Failure

Verification failure must trigger a recovery path, not just a report.

**Recovery protocol:**
1. Log the discrepancy (what was claimed vs what was found)
2. Retry with a different dispatch method (general-purpose if subagent_type failed)
3. If retry also fails, mark as unfixed and report
4. Never silently accept the sub-agent's version

**Rationale:** The first fixer failed silently. The orchestrator caught it via `git log` but had no automatic retry.

## 6. All Agents Dispatched via subagent_type

Every defined agent MUST be dispatched via `subagent_type`. This loads the agent's scope constraints, tools, skills, behaviors, and guidelines from its definition. General-purpose dispatch (no `subagent_type`) is only a fallback for installation gaps — never the default.

**Rules:**
- Always dispatch via `subagent_type` — agents need their scope constraints to operate safely
- Agent definitions must be self-contained: all tools, skills, behaviors, criteria, and reference docs declared in frontmatter and body
- If an agent needs context at runtime (file list, criteria text, steering content), the caller injects it via the prompt — but the agent's workflow, constraints, and reading protocol live in the definition
- After write operations (file edits, git commits), verify persistence via `git log` and file inspection
- If verification fails (writes didn't persist due to sandbox), retry as general-purpose agent with the agent body inlined as fallback
- If fallback also fails, mark as unfixed

**Agent definition completeness checklist:**
- `tools:` — every MCP tool the agent needs
- `skills:` — every skill the agent invokes
- `behaviors:` — every behavioral constraint
- `criteria:` — every criterion the agent evaluates
- `interface:` — input/output contract
- Body: workflow steps, reading protocol, severity rules, output format

**Rationale:** `subagent_type` provides scope constraints that prevent agents from overstepping. An agent without constraints is a liability — it can read anything, change anything, and produce inconsistent results. General-purpose dispatch loses all constraints and should only be used as a persistence fallback, not a regular dispatch pattern.

## 7. Deterministic Scripts Over LLM Judgment

For reproducible operations (diffing, mapping, tolerance checking), use scripts. LLM agents invoke scripts, not re-implement the logic.

**Examples:**
- `design-diff.js` — element mapping, tolerance comparison, fix hint generation
- `figma-extract.js` — structured Figma inventory extraction
- `dom-extract.js` — computed style extraction from rendered DOM

**Rationale:** If an LLM re-implemented diffing logic, results would be inconsistent across runs. Scripts are deterministic and testable.

## 8. Flat Dispatch — Depth-1 Only

Claude Code limits agent dispatch to depth-1: sub-agents cannot spawn further sub-agents. All agent dispatches must happen directly from the orchestrator.

```
Orchestrator (Opus)  — decides + dispatches: loop control, batching, gate evaluation, exit
Agent (Sonnet)       — executes: focused work on bounded scope, never dispatches
```

**Rules:**
- Only the orchestrator dispatches agents — never nest orchestrators
- Orchestrators may read lightweight data (diff stats, file lists) for batching decisions
- Orchestrators must NOT read full file content or diffs — pre-fetch and pass to agents
- Agents never dispatch other agents — if an agent needs the Agent tool, the architecture is wrong
- Keep orchestrator logic thin: batching is simple math, merging is JSON concatenation

**Rationale:** Mixing dispatch logic into the orchestrator bloats its context. Mixing decisions into agents makes them fragile.

## 9. Stateless Agents, Stateful Orchestrators

Agents receive everything they need in the prompt. They don't read prior round results or track accumulated state. The orchestrator owns state.

**Orchestrator owns:**
- Consecutive clean count
- Prior round suggestions
- Cached Figma inventories
- Environmental blocker tracking

**Agents receive:**
- Their scope (file list, screen list)
- Criteria definitions
- Prior suggestions (injected by orchestrator, not self-discovered)

**Rationale:** Stateless agents produce consistent results. If the design reviewer tracked prior results, it would bias toward previously-failing screens.

## 10. Explicit I/O Contracts

Every agent declares its input shape and output shape in frontmatter. The caller validates outputs match the contract.

**Frontmatter `interface` field:**
```yaml
interface:
  input: What the agent receives
  output: What the agent returns (format, structure)
```

**Validation rules:**
- Output must be valid JSON when JSON is expected
- All required fields must be present
- Array lengths must match claimed counts
- If output is invalid, report error — don't fabricate results

**Rationale:** When a reviewer returns invalid JSON, the orchestrator needs to know what valid JSON looks like to detect the failure.

---

## Principle Application Matrix

| Principle | Orchestrator | Code Reviewer | Design Reviewer | Fixer |
|---|:---:|:---:|:---:|:---:|
| 1. Single Responsibility | Loop + batch + merge | Code quality | Design fidelity | Apply fixes |
| 2. Bounded Work | Diff stat only | ≤500 diff lines | All screens | Only must-fix list |
| 3. Reading Protocol | Pre-fetch diffs, pass to agents | Analyze provided diff | Scripts do extraction | Issue list + targets |
| 4. Verify Don't Trust | Verifies all sub-agents | N/A (leaf) | N/A (leaf) | N/A (leaf) |
| 5. Recover on Failure | Retry fixer dispatch | N/A | N/A | N/A |
| 6. Scoped then fallback | Dispatches all | subagent_type | subagent_type | subagent_type → verify → GP fallback |
| 7. Scripts over LLM | N/A | N/A | design-diff.js | N/A |
| 8. Flat dispatch | Dispatches all agents | Never dispatches | Never dispatches | Never dispatches |
| 9. Stateless | Owns state | Stateless | Stateless | Stateless |
| 10. I/O Contracts | Validates outputs | Issues JSON | Issues JSON | Fixed/unfixed JSON |

---

## Observed Failures Log

Track failures here to inform principle updates.

| Date | Failure | Root Cause | Principle Violated | Fix Applied |
|---|---|---|---|---|
| 2026-04-17 | Fixer commit didn't persist | subagent_type dispatch sandboxed writes | #6 (GP for writes) | Re-dispatched as general-purpose agent |
| 2026-04-17 | Reviewer exhausted context on reading | No reading constraints, 80+ redundant tool calls | #2 (bounded), #3 (reading protocol) | Added per-file reading protocol to pr-code |
| 2026-04-17 | Design mismatches missed across screens | Single reviewer guessed which screens to check | #1 (single responsibility), #2 (bounded) | Split into pr-design with all-screen sweep |
| 2026-04-17 | Unmatched Figma elements not counted as failures | design-diff.js treated them as informational | #7 (scripts over LLM) | Added presence mismatches to design-diff.js |
