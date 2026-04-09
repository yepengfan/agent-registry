# PR Review Orchestrator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a PR review orchestrator agent (Opus) that dispatches Sonnet sub-agents for automated code review and fix, with a Node.js CLI for npm distribution.

**Architecture:** Flat composable agents (`pr-reviewer`, `pr-fixer`, `pr-orchestrator`) in the existing registry structure. New frontmatter fields (`type`, `model`, `subagents`, `interface`) enable orchestrator discovery, model declaration, and dependency management. The bash+python installer is replaced by a zero-dependency Node.js CLI publishable as `agent-registry` on npm.

**Tech Stack:** Node.js 18+ (zero dependencies), GitHub CLI (`gh`), Claude Code Agent tool

**Spec:** `docs/superpowers/specs/2026-04-09-pr-orchestrator-design.md`

---

## File Structure

```
Create:
  lib/frontmatter.js          # YAML frontmatter parser (replaces parse_frontmatter.py)
  lib/installer.js             # Install/uninstall logic with subagent support
  lib/discovery.js             # List/status with type grouping
  bin/cli.js                   # Node.js CLI entry point
  package.json                 # npm package config
  test.js                      # Comprehensive test suite (replaces test.sh)
  agents/pr-reviewer/agent.md
  agents/pr-reviewer/ref/review-checklist.md    (migrated from code-reviewer)
  agents/pr-reviewer/ref/coding-conventions.md  (migrated from code-reviewer)
  agents/pr-fixer/agent.md
  agents/pr-fixer/ref/fix-guidelines.md
  agents/pr-orchestrator/agent.md
  agents/pr-orchestrator/ref/workflow.md

Modify:
  install.sh                   # Thin wrapper delegating to node bin/cli.js
  README.md                    # Updated docs
  .gitignore                   # Add node_modules/

Delete:
  agents/code-reviewer/        # Replaced by pr-reviewer + pr-fixer + pr-orchestrator
  lib/parse_frontmatter.py     # Replaced by lib/frontmatter.js
  lib/test_parse_frontmatter.py
  test.sh                      # Replaced by test.js
```

---

## Phase 1: Registry Schema Extensions

### Task 1: Create `lib/frontmatter.js`

**Files:**
- Create: `lib/frontmatter.js`

- [ ] **Step 1: Create `lib/frontmatter.js`**

```js
'use strict';

const fs = require('fs');

const FM_PATTERN = /^---\s*\n([\s\S]*?)\n---\s*\n/;
const REQUIRED_FIELDS = ['name', 'description', 'version', 'author'];
const VALID_TYPES = ['agent', 'orchestrator'];
const VALID_MODELS = ['opus', 'sonnet', 'haiku'];

/**
 * Parse YAML frontmatter from a markdown string.
 * Returns null if no frontmatter block is found.
 */
function parseFrontmatter(content) {
  const match = content.match(FM_PATTERN);
  if (!match) return null;
  return simpleParse(match[1]);
}

/**
 * Return the markdown body after the frontmatter block.
 */
function extractBody(content) {
  const match = content.match(FM_PATTERN);
  if (!match) return content;
  return content.slice(match[0].length).replace(/^\n+/, '');
}

/**
 * Simple YAML parser for frontmatter.
 * Handles: scalar values, inline lists [a, b], block lists (- item),
 * empty lists [], and nested objects (one level deep for interface).
 */
function simpleParse(text) {
  const result = {};
  let currentKey = null;
  let currentList = null;
  let currentObject = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    // Nested object key: value (indented, e.g., "  input: some text")
    const nestedKv = line.match(/^\s{2,}(\w[\w-]*):\s+(.+)$/);
    if (nestedKv && currentKey && currentObject !== null) {
      currentObject[nestedKv[1]] = nestedKv[2].trim().replace(/^["']|["']$/g, '');
      continue;
    }

    // List item (indented "- value")
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && currentKey) {
      if (currentList === null) {
        currentList = [];
        result[currentKey] = currentList;
      }
      currentList.push(listMatch[1].trim());
      continue;
    }

    // Top-level key: value pair
    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)?$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const value = (kvMatch[2] || '').trim();
      currentList = null;
      currentObject = null;

      if (!value) {
        if (currentKey === 'interface') {
          currentObject = {};
          result[currentKey] = currentObject;
        }
        continue;
      }

      // Inline list: [item1, item2] or []
      const inlineList = value.match(/^\[(.*)\]$/);
      if (inlineList) {
        const inner = inlineList[1].trim();
        if (!inner) {
          result[currentKey] = [];
        } else {
          result[currentKey] = inner.split(',').map(i => i.trim().replace(/^["']|["']$/g, ''));
        }
      } else {
        result[currentKey] = value.replace(/^["']|["']$/g, '');
      }
    }
  }

  return result;
}

/**
 * Validate frontmatter data. Throws on invalid data.
 */
function validate(data) {
  if (data === null || data === undefined) {
    throw new Error('No frontmatter found');
  }

  const missing = REQUIRED_FIELDS.filter(f => !(f in data));
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  if (data.type && !VALID_TYPES.includes(data.type)) {
    throw new Error(`Invalid type "${data.type}". Must be: ${VALID_TYPES.join(', ')}`);
  }

  if (data.model && !VALID_MODELS.includes(data.model)) {
    throw new Error(`Invalid model "${data.model}". Must be: ${VALID_MODELS.join(', ')}`);
  }

  const effectiveType = data.type || 'agent';

  if (effectiveType === 'orchestrator') {
    if (!Array.isArray(data.subagents) || data.subagents.length === 0) {
      throw new Error(`Orchestrator "${data.name}" must have a non-empty subagents list`);
    }
  }

  if (data.subagents && effectiveType !== 'orchestrator') {
    throw new Error(`subagents field requires type: orchestrator`);
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    process.stderr.write('Usage: frontmatter.js [--body] <file.md>\n');
    process.exit(1);
  }

  const bodyMode = args[0] === '--body';
  const filepath = bodyMode ? args[1] : args[0];

  if (!filepath) {
    process.stderr.write('Usage: frontmatter.js [--body] <file.md>\n');
    process.exit(1);
  }

  const content = fs.readFileSync(filepath, 'utf8');

  if (bodyMode) {
    process.stdout.write(extractBody(content) + '\n');
    process.exit(0);
  }

  const data = parseFrontmatter(content);
  validate(data);
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

module.exports = { parseFrontmatter, extractBody, validate };
```

- [ ] **Step 2: Verify module loads and parses an existing agent**

Run: `node -e "const fm = require('./lib/frontmatter'); console.log(Object.keys(fm))"`
Expected: `[ 'parseFrontmatter', 'extractBody', 'validate' ]`

Run: `node lib/frontmatter.js agents/devops/agent.md`
Expected: JSON output matching `python3 lib/parse_frontmatter.py agents/devops/agent.md`

- [ ] **Step 3: Commit**

```bash
git add lib/frontmatter.js
git commit -m "Add lib/frontmatter.js — Node.js frontmatter parser with new field validation"
```

---

### Task 2: Create `lib/test-frontmatter.js`

**Files:**
- Create: `lib/test-frontmatter.js`

- [ ] **Step 1: Create `lib/test-frontmatter.js`**

```js
#!/usr/bin/env node
'use strict';

const fm = require('./frontmatter.js');

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    console.log('  PASS: ' + name);
    passed++;
  } else {
    console.log('  FAIL: ' + name);
    failed++;
  }
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── Tests ported from test_parse_frontmatter.py ──────────────

function testValidFull() {
  console.log('\n--- testValidFull ---');
  const content =
    '---\n' +
    'name: test-agent\n' +
    'description: A test agent\n' +
    'version: 1.0.0\n' +
    'author: Test Author\n' +
    'tags: [testing, demo]\n' +
    'skills:\n' +
    '  - slides\n' +
    '  - code-review\n' +
    'tools:\n' +
    '  - python-pptx\n' +
    '---\n\n' +
    'Agent prompt body here.\n';

  const data = fm.parseFrontmatter(content);
  check('name parsed', data.name === 'test-agent');
  check('description parsed', data.description === 'A test agent');
  check('version parsed', data.version === '1.0.0');
  check('author parsed', data.author === 'Test Author');
  check('tags parsed', deepEqual(data.tags, ['testing', 'demo']));
  check('skills parsed', deepEqual(data.skills, ['slides', 'code-review']));
  check('tools parsed', deepEqual(data.tools, ['python-pptx']));
}

function testMinimal() {
  console.log('\n--- testMinimal ---');
  const content =
    '---\nname: minimal\ndescription: Minimal agent\nversion: 0.1.0\nauthor: Me\n---\n\nBody.\n';
  const data = fm.parseFrontmatter(content);
  check('minimal name', data.name === 'minimal');
  check('no skills field', !('skills' in data));
}

function testMissingRequired() {
  console.log('\n--- testMissingRequired ---');
  const content =
    '---\nname: incomplete\ndescription: Missing version and author\n---\n\nBody.\n';
  const data = fm.parseFrontmatter(content);
  let threw = false, errMsg = '';
  try { fm.validate(data); } catch (e) { threw = true; errMsg = e.message; }
  check('missing fields throws', threw);
  check('error mentions version', errMsg.includes('version'));
  check('error mentions author', errMsg.includes('author'));
}

function testNoFrontmatter() {
  console.log('\n--- testNoFrontmatter ---');
  const data = fm.parseFrontmatter('Just a regular markdown file.\n');
  let threw = false;
  try { fm.validate(data); } catch (e) { threw = true; }
  check('no frontmatter throws', threw);
}

function testBodyExtraction() {
  console.log('\n--- testBodyExtraction ---');
  const content =
    '---\nname: test\ndescription: Test\nversion: 1.0.0\nauthor: Me\n---\n\nBody content here.\nSecond line.\n';
  const body = fm.extractBody(content);
  check('body contains content', body.includes('Body content here.'));
  check('body strips frontmatter', !body.includes('name: test'));
  check('body strips delimiters', !body.includes('---'));
}

function testEmptyInlineList() {
  console.log('\n--- testEmptyInlineList ---');
  const content =
    '---\nname: empty-list\ndescription: Agent\nversion: 1.0.0\nauthor: Me\ntags: []\n---\n\nBody.\n';
  const data = fm.parseFrontmatter(content);
  check('empty list is array', Array.isArray(data.tags));
  check('empty list is empty', data.tags.length === 0);
}

// ── New schema extension tests ───────────────────────────────

function testTypeOrchestrator() {
  console.log('\n--- testTypeOrchestrator ---');
  const content =
    '---\nname: my-orch\ndescription: Orch\nversion: 1.0.0\nauthor: Me\n' +
    'type: orchestrator\nsubagents:\n  - sub-a\n  - sub-b\n---\n\nBody.\n';
  const data = fm.parseFrontmatter(content);
  let threw = false;
  try { fm.validate(data); } catch (e) { threw = true; }
  check('orchestrator with subagents is valid', !threw);
  check('type parsed', data.type === 'orchestrator');
  check('subagents parsed', deepEqual(data.subagents, ['sub-a', 'sub-b']));
}

function testTypeInvalid() {
  console.log('\n--- testTypeInvalid ---');
  const content =
    '---\nname: bad\ndescription: Bad\nversion: 1.0.0\nauthor: Me\ntype: service\n---\n\nBody.\n';
  const data = fm.parseFrontmatter(content);
  let threw = false;
  try { fm.validate(data); } catch (e) { threw = true; }
  check('invalid type rejected', threw);
}

function testModelValid() {
  console.log('\n--- testModelValid ---');
  for (const model of ['opus', 'sonnet', 'haiku']) {
    const content =
      `---\nname: m\ndescription: M\nversion: 1.0.0\nauthor: Me\nmodel: ${model}\n---\n\nBody.\n`;
    const data = fm.parseFrontmatter(content);
    let threw = false;
    try { fm.validate(data); } catch (e) { threw = true; }
    check(`model '${model}' is valid`, !threw);
  }
}

function testModelInvalid() {
  console.log('\n--- testModelInvalid ---');
  const content =
    '---\nname: bad\ndescription: Bad\nversion: 1.0.0\nauthor: Me\nmodel: gpt-4\n---\n\nBody.\n';
  const data = fm.parseFrontmatter(content);
  let threw = false, errMsg = '';
  try { fm.validate(data); } catch (e) { threw = true; errMsg = e.message; }
  check('invalid model rejected', threw);
  check('error mentions model', errMsg.includes('model'));
}

function testOrchestratorWithoutSubagents() {
  console.log('\n--- testOrchestratorWithoutSubagents ---');
  const content =
    '---\nname: bad\ndescription: Bad\nversion: 1.0.0\nauthor: Me\ntype: orchestrator\n---\n\nBody.\n';
  const data = fm.parseFrontmatter(content);
  let threw = false;
  try { fm.validate(data); } catch (e) { threw = true; }
  check('orchestrator without subagents rejected', threw);
}

function testSubagentsWithoutOrchestrator() {
  console.log('\n--- testSubagentsWithoutOrchestrator ---');
  const content =
    '---\nname: bad\ndescription: Bad\nversion: 1.0.0\nauthor: Me\ntype: agent\nsubagents:\n  - x\n---\n\nBody.\n';
  const data = fm.parseFrontmatter(content);
  let threw = false, errMsg = '';
  try { fm.validate(data); } catch (e) { threw = true; errMsg = e.message; }
  check('subagents on non-orchestrator rejected', threw);
  check('error mentions orchestrator', errMsg.includes('orchestrator'));
}

function testSubagentsNoTypeField() {
  console.log('\n--- testSubagentsNoTypeField ---');
  const content =
    '---\nname: bad\ndescription: Bad\nversion: 1.0.0\nauthor: Me\nsubagents:\n  - x\n---\n\nBody.\n';
  const data = fm.parseFrontmatter(content);
  let threw = false;
  try { fm.validate(data); } catch (e) { threw = true; }
  check('subagents with no type field rejected', threw);
}

function testInterfaceParsed() {
  console.log('\n--- testInterfaceParsed ---');
  const content =
    '---\nname: i\ndescription: I\nversion: 1.0.0\nauthor: Me\ninterface:\n  input: PR number or URL\n  output: Review comments posted\n---\n\nBody.\n';
  const data = fm.parseFrontmatter(content);
  check('interface is object', typeof data.interface === 'object');
  check('interface.input parsed', data.interface.input === 'PR number or URL');
  check('interface.output parsed', data.interface.output === 'Review comments posted');
}

function testNoTypeDefaultsToAgent() {
  console.log('\n--- testNoTypeDefaultsToAgent ---');
  const content =
    '---\nname: legacy\ndescription: L\nversion: 1.0.0\nauthor: Me\n---\n\nBody.\n';
  const data = fm.parseFrontmatter(content);
  let threw = false;
  try { fm.validate(data); } catch (e) { threw = true; }
  check('no type field is valid (defaults to agent)', !threw);
}

function testInlineSubagents() {
  console.log('\n--- testInlineSubagents ---');
  const content =
    '---\nname: i\ndescription: I\nversion: 1.0.0\nauthor: Me\ntype: orchestrator\nsubagents: [a, b]\n---\n\nBody.\n';
  const data = fm.parseFrontmatter(content);
  let threw = false;
  try { fm.validate(data); } catch (e) { threw = true; }
  check('inline subagents valid', !threw);
  check('inline subagents parsed', deepEqual(data.subagents, ['a', 'b']));
}

function testFullOrchestratorFrontmatter() {
  console.log('\n--- testFullOrchestratorFrontmatter ---');
  const content =
    '---\nname: pr-orchestrator\ndescription: Orchestrates PR review\nversion: 1.0.0\nauthor: Yepeng Fan\n' +
    'type: orchestrator\nmodel: opus\ntags: [pr-workflow, code-quality]\n' +
    'subagents:\n  - pr-reviewer\n  - pr-fixer\ntools:\n  - gh\n' +
    'interface:\n  input: PR number or URL\n  output: Review comments posted\n---\n\nPrompt.\n';
  const data = fm.parseFrontmatter(content);
  let threw = false;
  try { fm.validate(data); } catch (e) { threw = true; }
  check('full orchestrator is valid', !threw);
  check('type', data.type === 'orchestrator');
  check('model', data.model === 'opus');
  check('subagents', deepEqual(data.subagents, ['pr-reviewer', 'pr-fixer']));
  check('tools', deepEqual(data.tools, ['gh']));
  check('interface.input', data.interface.input.includes('PR number'));
}

// ── Run ──────────────────────────────────────────────────────

console.log('=== Frontmatter Parser Tests ===');
testValidFull();
testMinimal();
testMissingRequired();
testNoFrontmatter();
testBodyExtraction();
testEmptyInlineList();
testTypeOrchestrator();
testTypeInvalid();
testModelValid();
testModelInvalid();
testOrchestratorWithoutSubagents();
testSubagentsWithoutOrchestrator();
testSubagentsNoTypeField();
testInterfaceParsed();
testNoTypeDefaultsToAgent();
testInlineSubagents();
testFullOrchestratorFrontmatter();

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run tests**

Run: `node lib/test-frontmatter.js`
Expected: All pass, 0 failures.

- [ ] **Step 3: Verify CLI parity with Python parser**

```bash
node lib/frontmatter.js agents/devops/agent.md
node lib/frontmatter.js agents/cit-deck-creator/agent.md
node lib/frontmatter.js agents/code-reviewer/agent.md
```

Each should match `python3 lib/parse_frontmatter.py <same file>`.

- [ ] **Step 4: Commit**

```bash
git add lib/test-frontmatter.js
git commit -m "Add frontmatter parser test suite covering all fields and validation rules"
```

---

## Phase 2: Create the Three Agents

### Task 3: Create `agents/pr-reviewer/`

**Files:**
- Create: `agents/pr-reviewer/agent.md`
- Create: `agents/pr-reviewer/ref/review-checklist.md` (copy from code-reviewer)
- Create: `agents/pr-reviewer/ref/coding-conventions.md` (copy from code-reviewer)

- [ ] **Step 1: Create directory and copy ref docs**

```bash
mkdir -p agents/pr-reviewer/ref
cp agents/code-reviewer/ref/review-checklist.md agents/pr-reviewer/ref/
cp agents/code-reviewer/ref/coding-conventions.md agents/pr-reviewer/ref/
```

- [ ] **Step 2: Create `agents/pr-reviewer/agent.md`**

```markdown
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
  input: PR number or URL. Fetches diff and context via gh CLI.
  output: Posts inline review comments to GitHub PR. Returns JSON summary with issues array.
---

You are a PR review specialist. You review pull request diffs for code quality, correctness, security, and convention compliance, then post your findings as inline GitHub PR comments.

## Input

You receive a PR number or URL. Use `gh` to fetch all context you need.

## Workflow

1. **Fetch PR metadata:**
   ```bash
   gh pr view <PR> --json number,title,body,baseRefName,headRefName,files
   ```

2. **Fetch the full diff:**
   ```bash
   gh pr diff <PR>
   ```

3. **For each changed file**, read surrounding context if the diff alone is insufficient:
   ```bash
   gh api repos/{owner}/{repo}/contents/{path}?ref={head_branch}
   ```

4. **Analyze every change** against the review checklist and coding conventions in your `ref/` docs.

5. **Post inline comments** on specific lines using the GitHub review API:
   ```bash
   gh api repos/{owner}/{repo}/pulls/{number}/reviews \
     --method POST \
     -f event=COMMENT \
     -f body="Review by pr-reviewer"
   ```
   For each issue, post an inline comment on the relevant file and line.

6. **Return a JSON summary** to the caller:
   ```json
   {
     "pr": 123,
     "issues": [
       {"severity": "must-fix", "file": "src/app.js", "line": 42, "message": "Unhandled promise rejection at API boundary"},
       {"severity": "suggestion", "file": "src/utils.js", "line": 10, "message": "Consider extracting this into a named function"}
     ],
     "summary": "Found 1 must-fix issue and 1 suggestion."
   }
   ```

## Severity Levels

- **must-fix**: Bugs, security vulnerabilities, broken error handling, missing tests for critical paths, breaking API changes. These block merge.
- **suggestion**: Style improvements, minor refactors, nice-to-have tests. These do not block merge.

## Domain Knowledge

Read the reference documentation before every review:
- `ref/review-checklist.md` — Standard review checklist and quality gates
- `ref/coding-conventions.md` — Team coding conventions and style guide

## Behavior

- Be constructive and specific — explain *why* something should change, not just *what*
- Always distinguish between must-fix and suggestion severity
- Check for OWASP top 10 vulnerabilities in security-sensitive code
- Verify error handling at system boundaries (user input, API calls, file I/O)
- Look for test coverage gaps in changed code paths
- Prefer simple, readable code over clever abstractions
- Never post duplicate comments on the same issue
- If the PR is clean, return an empty issues array and post a brief approval comment
```

- [ ] **Step 3: Validate frontmatter**

Run: `node lib/frontmatter.js agents/pr-reviewer/agent.md`
Expected: Valid JSON with type=agent, model=sonnet

- [ ] **Step 4: Commit**

```bash
git add agents/pr-reviewer/
git commit -m "Add pr-reviewer agent with migrated ref docs from code-reviewer"
```

---

### Task 4: Create `agents/pr-fixer/`

**Files:**
- Create: `agents/pr-fixer/agent.md`
- Create: `agents/pr-fixer/ref/fix-guidelines.md`

- [ ] **Step 1: Create directory**

```bash
mkdir -p agents/pr-fixer/ref
```

- [ ] **Step 2: Create `agents/pr-fixer/agent.md`**

```markdown
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
  input: PR number, branch name, and list of must-fix issues as JSON array.
  output: Fixes committed and pushed. Returns JSON summary with fixed and unfixed arrays.
---

You are a PR fix specialist. You receive a list of must-fix issues identified during code review and apply targeted fixes to the PR branch.

## Input

You receive:
1. A PR number
2. The PR branch name
3. A JSON array of must-fix issues, each with `file`, `line`, and `message` fields

## Workflow

1. **Fetch PR metadata** to confirm the branch:
   ```bash
   gh pr view <PR> --json headRefName,headRepository
   ```

2. **Checkout the PR branch:**
   ```bash
   git checkout <branch>
   git pull origin <branch>
   ```

3. **For each must-fix issue**, in order:
   a. Read the file and understand the surrounding context
   b. Apply the minimal fix that addresses the issue
   c. Verify the fix does not break surrounding code
   d. Commit with a descriptive message:
      ```bash
      git commit -m "Fix: <concise description of what was fixed>"
      ```

4. **Push all fixes:**
   ```bash
   git push origin <branch>
   ```

5. **Return a JSON summary** to the caller:
   ```json
   {
     "pr": 123,
     "branch": "feature/add-auth",
     "fixed": [
       {"file": "src/app.js", "line": 42, "message": "Added try-catch around API call"}
     ],
     "unfixed": [
       {"file": "src/db.js", "line": 15, "message": "Requires schema change — cannot fix safely"}
     ]
   }
   ```

## Domain Knowledge

Read the fix guidelines before making any changes:
- `ref/fix-guidelines.md` — Safe fix boundaries and commit conventions

## Behavior

- Fix ONLY must-fix issues — never refactor unrelated code
- Apply the minimal change that resolves each issue
- If a fix is unsafe or requires broader refactoring, mark it as unfixed with a clear explanation
- Never force-push — always use regular push
- Each fix gets its own commit with a descriptive message
- Run existing tests after fixes if a test runner is available
- Do not modify test files unless the test itself is the bug
```

- [ ] **Step 3: Create `agents/pr-fixer/ref/fix-guidelines.md`**

```markdown
# Fix Guidelines

## Safe Fix Boundaries

Fixes must be **minimal and targeted**. The goal is to resolve the specific issue identified in review, not to improve the surrounding code.

### Always Safe

- Adding error handling (try-catch, null checks, input validation)
- Fixing obvious bugs (wrong variable, off-by-one, missing return)
- Removing hardcoded secrets or credentials
- Adding missing `await` on async calls
- Fixing SQL injection by switching to parameterized queries
- Adding missing input sanitization

### Requires Judgment

- Renaming a variable used in multiple places — safe if all usages are in the same file
- Extracting a function — safe if it does not change the public API
- Adding a missing test — safe if it does not require new test infrastructure

### Never Do

- Refactor code unrelated to the flagged issue
- Change public API signatures without explicit approval
- Delete or rewrite tests that are not directly related to the fix
- Upgrade dependencies
- Change CI/CD configuration

## Commit Conventions

Each fix gets its own commit:

```
Fix: <what was fixed>

Resolves review issue: <original issue message>
File: <file path>, Line: <line number>
```

## When to Mark as Unfixed

Report an issue as `unfixed` when:
- The fix requires changes to multiple services or repositories
- The fix would break the public API contract
- The fix requires a database migration
- You are not confident the fix is correct
```

- [ ] **Step 4: Validate frontmatter**

Run: `node lib/frontmatter.js agents/pr-fixer/agent.md`

- [ ] **Step 5: Commit**

```bash
git add agents/pr-fixer/
git commit -m "Add pr-fixer agent with fix guidelines"
```

---

### Task 5: Create `agents/pr-orchestrator/`

**Files:**
- Create: `agents/pr-orchestrator/agent.md`
- Create: `agents/pr-orchestrator/ref/workflow.md`

- [ ] **Step 1: Create directory**

```bash
mkdir -p agents/pr-orchestrator/ref
```

- [ ] **Step 2: Create `agents/pr-orchestrator/agent.md`**

```markdown
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
  input: PR number or URL. Optional --verify flag.
  output: Review comments posted to GitHub, must-fix issues fixed, final summary comment posted.
---

You are a PR review orchestrator. You coordinate a review-and-fix workflow by dispatching sub-agents. You NEVER edit code yourself — you only coordinate.

## Finding Sub-Agent Prompts

Your agent file contains a registry path comment at the top:
```
<!-- agent-registry-path: /path/to/agent-registry/agents/pr-orchestrator -->
```

To load sub-agent prompts:
1. Read the first line of your own file to extract the registry path
2. The registry root is two directories up from your agent directory
3. Read sub-agent prompts at:
   - `{registry_root}/agents/pr-reviewer/agent.md`
   - `{registry_root}/agents/pr-fixer/agent.md`

## Input Parsing

Parse the user's input to extract:
- **PR identifier**: A number (e.g., `123`) or full URL
- **Flags**: `--verify` enables a re-review cycle after fixes

## Workflow

Read `ref/workflow.md` for the detailed workflow reference. Summary:

### Step 1: Validate Environment

```bash
gh auth status
```
If this fails, report the error and exit.

### Step 2: Fetch PR Metadata

```bash
gh pr view <PR> --json number,title,body,baseRefName,headRefName,state
```
Verify the PR exists and is open.

### Step 3: Dispatch the Reviewer

Use the **Agent tool** to spawn the pr-reviewer sub-agent:
- Read the body of `agents/pr-reviewer/agent.md` (everything after frontmatter)
- Call `Agent(model: "sonnet", prompt: <reviewer body + "Review PR #<number> in this repository.">)`
- Wait for completion and capture the JSON response

### Step 4: Evaluate Review Results

Parse the reviewer's JSON output. Count `must-fix` issues.

**If zero must-fix issues:**
- Post a summary comment on the PR via `gh pr comment`
- Exit. Workflow complete.

### Step 5: Dispatch the Fixer

Extract only `must-fix` issues. Use the **Agent tool**:
- Read the body of `agents/pr-fixer/agent.md`
- Call `Agent(model: "sonnet", prompt: <fixer body + issue list>)`
- Wait for completion and capture the JSON response

### Step 6: Verify (if --verify flag set)

Dispatch the reviewer again (same as Step 3) to check fixes.
Do NOT dispatch the fixer again. Max 1 verify cycle.

### Step 7: Post Final Summary

Post a summary comment on the PR:
```bash
gh pr comment <PR> --body "<summary>"
```

Include: issues found, issues fixed, issues remaining, verify results (if applicable).

## Error Handling

- `gh auth` fails → report error, exit (no sub-agent spawn)
- PR not found / closed → report and exit
- Reviewer finds no issues → post clean summary, exit
- Fixer can't fix an issue → report as unfixed in summary
- Sub-agent timeout → report partial results

## Rules

1. NEVER edit code yourself — only dispatch sub-agents
2. NEVER skip the reviewer step
3. NEVER run more than one fix cycle
4. Always post a final summary comment, even on errors
```

- [ ] **Step 3: Create `agents/pr-orchestrator/ref/workflow.md`**

```markdown
# PR Orchestrator Workflow Reference

## Workflow Diagram

```
User: /pr-orchestrator <PR> [--verify]
         |
         v
  ORCHESTRATOR (Opus)
  1. gh auth status
  2. gh pr view <PR>
         |
         v
  REVIEWER (Sonnet) — Agent tool, model: "sonnet"
  - Fetch diff + context
  - Analyze code
  - Post GH comments
  - Return JSON
         |
         v
  Any must-fix? --no--> Post clean summary, exit
         |
        yes
         v
  FIXER (Sonnet) — Agent tool, model: "sonnet"
  - Checkout branch
  - Fix must-fix only
  - Commit + push
  - Return JSON
         |
         v
  --verify? --no--> Post summary, exit
         |
        yes
         v
  REVIEWER (Sonnet) — re-review fixes
         |
         v
  Post final summary, exit (no more loops)
```

## JSON Contracts

### Reviewer Output

```json
{
  "pr": 123,
  "issues": [
    {"severity": "must-fix", "file": "src/app.js", "line": 42, "message": "..."},
    {"severity": "suggestion", "file": "src/utils.js", "line": 10, "message": "..."}
  ],
  "summary": "Found 1 must-fix issue and 1 suggestion."
}
```

### Fixer Output

```json
{
  "pr": 123,
  "branch": "feature/add-auth",
  "fixed": [{"file": "src/app.js", "line": 42, "message": "Added try-catch"}],
  "unfixed": []
}
```

## Error Recovery

| Scenario | Action |
|----------|--------|
| `gh auth` fails | Report error, exit |
| PR not found / closed | Report, exit |
| Reviewer returns no JSON | Report raw output, exit |
| Reviewer finds 0 must-fix | Post clean summary, exit |
| Fixer partially succeeds | Report fixed + unfixed |
| Sub-agent timeout | Report partial results |
| Verify finds new issues | Report in summary, do NOT fix again |
```

- [ ] **Step 4: Validate frontmatter**

Run: `node lib/frontmatter.js agents/pr-orchestrator/agent.md`
Expected: Valid JSON with type=orchestrator, model=opus, subagents=[pr-reviewer, pr-fixer]

- [ ] **Step 5: Commit**

```bash
git add agents/pr-orchestrator/
git commit -m "Add pr-orchestrator agent with workflow reference"
```

---

### Task 6: Delete `agents/code-reviewer/`

**Files:**
- Delete: `agents/code-reviewer/` (entire directory)

- [ ] **Step 1: Verify ref docs were migrated**

```bash
diff agents/code-reviewer/ref/review-checklist.md agents/pr-reviewer/ref/review-checklist.md
diff agents/code-reviewer/ref/coding-conventions.md agents/pr-reviewer/ref/coding-conventions.md
```
Expected: No differences.

- [ ] **Step 2: Delete the old agent**

```bash
git rm -r agents/code-reviewer/
```

- [ ] **Step 3: Validate all new agents parse correctly**

```bash
node lib/frontmatter.js agents/pr-reviewer/agent.md
node lib/frontmatter.js agents/pr-fixer/agent.md
node lib/frontmatter.js agents/pr-orchestrator/agent.md
```

- [ ] **Step 4: Commit**

```bash
git commit -m "Remove code-reviewer agent, replaced by pr-reviewer + pr-fixer + pr-orchestrator"
```

---

## Phase 3: Node.js CLI

### Task 7: Create `package.json`

**Files:**
- Create: `package.json`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "agent-registry",
  "version": "1.0.0",
  "description": "A unified registry for Claude Code agents and skills",
  "license": "MIT",
  "author": "Yepeng Fan",
  "bin": {
    "agent-registry": "./bin/cli.js"
  },
  "engines": {
    "node": ">=18"
  },
  "files": [
    "bin/",
    "lib/",
    "agents/",
    "skills/"
  ],
  "keywords": [
    "claude",
    "claude-code",
    "agents",
    "skills",
    "registry"
  ]
}
```

- [ ] **Step 2: Verify**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).name)"`
Expected: `agent-registry`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "Add package.json for npm distribution (zero dependencies)"
```

---

### Task 8: Create `bin/cli.js`

**Files:**
- Create: `bin/cli.js`

- [ ] **Step 1: Create `bin/` directory and `bin/cli.js`**

```bash
mkdir -p bin
```

```js
#!/usr/bin/env node
'use strict';

const path = require('path');
const os = require('os');

const REGISTRY_DIR = path.resolve(__dirname, '..');
const CLAUDE_DIR = path.join(os.homedir(), '.claude');

const color = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

function usage() {
  console.log(`Usage: agent-registry <command> [options]

Commands:
  install [name]             Install all agents+skills, or one agent (+deps)
  install --skill <name>     Install one skill
  project <name> [dir]       Install agent into a project's CLAUDE.md
  list                       List available agents and skills
  status                     Show installed status with dependency info
  uninstall [name]           Auto-detect type and uninstall
  uninstall --agent <name>   Uninstall a specific agent
  uninstall --skill <name>   Uninstall a specific skill
  uninstall --all            Uninstall everything
  help                       Show this help`);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  const installer = () => require('../lib/installer');
  const discovery = () => require('../lib/discovery');

  try {
    switch (command) {
      case 'install': {
        const rest = args.slice(1);
        if (rest.length === 0) {
          installer().installAll(REGISTRY_DIR, CLAUDE_DIR);
        } else if (rest[0] === '--skill') {
          if (!rest[1]) { console.error(color.red('Missing skill name')); process.exit(1); }
          installer().installSkill(rest[1], REGISTRY_DIR, CLAUDE_DIR);
        } else if (rest[0] === '--agent') {
          if (!rest[1]) { console.error(color.red('Missing agent name')); process.exit(1); }
          installer().installAgent(rest[1], REGISTRY_DIR, CLAUDE_DIR, new Set());
        } else {
          installer().installAgent(rest[0], REGISTRY_DIR, CLAUDE_DIR, new Set());
        }
        break;
      }
      case 'project': {
        const name = args[1];
        if (!name) { console.error(color.red('Missing agent name')); process.exit(1); }
        installer().installProject(name, args[2] || '.', REGISTRY_DIR, CLAUDE_DIR);
        break;
      }
      case 'list':
        discovery().showList(REGISTRY_DIR);
        break;
      case 'status':
        discovery().showStatus(REGISTRY_DIR, CLAUDE_DIR);
        break;
      case 'uninstall': {
        const rest = args.slice(1);
        if (rest.length === 0 || rest[0] === '--all') {
          installer().uninstallAll(REGISTRY_DIR, CLAUDE_DIR);
        } else if (rest[0] === '--agent') {
          if (!rest[1]) { console.error(color.red('Missing agent name')); process.exit(1); }
          installer().uninstallAgent(rest[1], REGISTRY_DIR, CLAUDE_DIR);
        } else if (rest[0] === '--skill') {
          if (!rest[1]) { console.error(color.red('Missing skill name')); process.exit(1); }
          installer().uninstallSkill(rest[1], REGISTRY_DIR, CLAUDE_DIR);
        } else {
          installer().uninstallByName(rest[0], REGISTRY_DIR, CLAUDE_DIR);
        }
        break;
      }
      case 'help':
      case '--help':
      case '-h':
        usage();
        break;
      default:
        console.error(color.red(`Unknown command: ${command}`));
        usage();
        process.exit(1);
    }
  } catch (err) {
    console.error(color.red(`Error: ${err.message}`));
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: Make executable and verify**

```bash
chmod +x bin/cli.js
node bin/cli.js help
```
Expected: Usage text, exit 0.

- [ ] **Step 3: Commit**

```bash
git add bin/cli.js
git commit -m "Add CLI entry point with argument parsing and command routing"
```

---

### Task 9: Create `lib/installer.js`

**Files:**
- Create: `lib/installer.js`

- [ ] **Step 1: Create `lib/installer.js`**

```js
'use strict';

const fs = require('fs');
const path = require('path');
const { parseFrontmatter, extractBody, validate } = require('./frontmatter');

const color = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

function validateName(name) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid name: "${name}". Only alphanumeric, hyphens, and underscores allowed.`);
  }
}

function checkTools(fm) {
  const tools = fm.tools || [];
  if (!Array.isArray(tools)) return;
  const { execSync } = require('child_process');
  for (const tool of tools) {
    try {
      execSync(`command -v ${tool}`, { stdio: 'ignore' });
    } catch {
      console.log(color.yellow(`  Warning: tool '${tool}' not found on PATH`));
    }
  }
}

function copyDirRecursive(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

// ── Skill Installation ──────────────────────────────────────

function installSkill(name, registryDir, claudeDir) {
  validateName(name);
  const pkgDir = path.join(registryDir, 'skills', name);
  if (!fs.existsSync(pkgDir)) throw new Error(`Skill not found: ${name}`);

  const commandsDir = path.join(pkgDir, 'commands');
  if (!fs.existsSync(commandsDir)) {
    console.log(color.yellow(`Skill ${name} has no commands/ to install`));
    return;
  }

  const cmdDst = path.join(claudeDir, 'commands', name);
  fs.mkdirSync(path.join(claudeDir, 'commands'), { recursive: true });

  try {
    const stat = fs.lstatSync(cmdDst);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(cmdDst);
    } else if (stat.isDirectory()) {
      console.log(color.yellow(`Warning: ${cmdDst} exists and is not a symlink, skipping`));
      return;
    }
  } catch { /* does not exist */ }

  fs.symlinkSync(commandsDir, cmdDst);
  console.log(color.green(`  Skill ${name}: commands -> ${cmdDst}`));
}

// ── Agent Installation ──────────────────────────────────────

function installAgent(name, registryDir, claudeDir, visited) {
  validateName(name);

  if (visited.has(name)) {
    console.log(color.yellow(`  Skipping ${name}: circular dependency detected`));
    return;
  }
  visited.add(name);

  const agentDir = path.join(registryDir, 'agents', name);
  const agentFile = path.join(agentDir, 'agent.md');
  if (!fs.existsSync(agentFile)) throw new Error(`Agent not found: ${name}`);

  const content = fs.readFileSync(agentFile, 'utf8');
  const fm = parseFrontmatter(content);
  validate(fm);
  const body = extractBody(content);

  fs.mkdirSync(path.join(claudeDir, 'commands'), { recursive: true });
  const dst = path.join(claudeDir, 'commands', `${name}.md`);
  fs.writeFileSync(dst, `<!-- agent-registry-path: ${agentDir} -->\n\n${body}`);
  console.log(color.green(`  Agent ${name} -> ${dst}`));

  // Auto-install subagent dependencies
  const subagents = Array.isArray(fm.subagents) ? fm.subagents : [];
  for (const sub of subagents) {
    if (!fs.existsSync(path.join(registryDir, 'agents', sub, 'agent.md'))) {
      throw new Error(`Subagent "${sub}" required by "${name}" not found in agents/`);
    }
    console.log(`  Installing subagent dependency: ${sub}`);
    installAgent(sub, registryDir, claudeDir, visited);
  }

  // Auto-install skill dependencies
  const skills = Array.isArray(fm.skills) ? fm.skills : [];
  for (const skill of skills) {
    console.log(`  Installing skill dependency: ${skill}`);
    installSkill(skill, registryDir, claudeDir);
  }

  checkTools(fm);
  console.log(color.green(`Installed agent: ${name}`));
}

// ── Project Installation ────────────────────────────────────

function installProject(name, targetDir, registryDir, claudeDir) {
  validateName(name);
  const agentDir = path.join(registryDir, 'agents', name);
  const agentFile = path.join(agentDir, 'agent.md');
  if (!fs.existsSync(agentFile)) throw new Error(`Agent not found: ${name}`);

  const content = fs.readFileSync(agentFile, 'utf8');
  const fm = parseFrontmatter(content);
  validate(fm);
  let body = extractBody(content);

  const claudeMdDir = path.join(targetDir, '.claude');
  fs.mkdirSync(claudeMdDir, { recursive: true });
  const claudeMd = path.join(claudeMdDir, 'CLAUDE.md');

  body = body.replace(/`ref\//g, `\`.claude/ref/${name}/`);

  if (fs.existsSync(claudeMd)) {
    fs.appendFileSync(claudeMd, `\n\n## Agent: ${name}\n\n${body}`);
    console.log(color.green(`  Appended agent ${name} to ${claudeMd}`));
  } else {
    fs.writeFileSync(claudeMd, body);
    console.log(color.green(`  Created ${claudeMd} with agent ${name}`));
  }

  const refSrc = path.join(agentDir, 'ref');
  if (fs.existsSync(refSrc)) {
    const refDst = path.join(claudeMdDir, 'ref', name);
    fs.mkdirSync(refDst, { recursive: true });
    copyDirRecursive(refSrc, refDst);
    console.log(color.green(`  Ref docs -> ${refDst}`));
  }

  const skills = Array.isArray(fm.skills) ? fm.skills : [];
  for (const skill of skills) {
    console.log(`  Installing skill dependency: ${skill}`);
    installSkill(skill, registryDir, claudeDir);
  }

  checkTools(fm);
  console.log(color.green(`Installed agent ${name} into project: ${targetDir}`));
}

// ── Install All ─────────────────────────────────────────────

function installAll(registryDir, claudeDir) {
  const discovery = require('./discovery');
  console.log('Installing all agents and skills...\n');

  console.log(color.bold('Skills:'));
  for (const name of discovery.listSkills(registryDir)) {
    installSkill(name, registryDir, claudeDir);
  }

  console.log('');
  console.log(color.bold('Agents:'));
  for (const name of discovery.listAgents(registryDir)) {
    installAgent(name, registryDir, claudeDir, new Set());
  }

  console.log('\nDone.');
}

// ── Uninstall ───────────────────────────────────────────────

function uninstallSkill(name, registryDir, claudeDir) {
  validateName(name);
  const pkgDir = path.join(registryDir, 'skills', name);
  const cmdDst = path.join(claudeDir, 'commands', name);

  try {
    const stat = fs.lstatSync(cmdDst);
    if (stat.isSymbolicLink()) {
      const actual = fs.realpathSync(cmdDst);
      if (actual === path.join(pkgDir, 'commands')) {
        fs.unlinkSync(cmdDst);
        console.log(color.yellow(`  Removed skill: ${name}`));
      } else {
        console.log(color.yellow(`  Skipped skill: ${name} (symlink points elsewhere)`));
      }
    }
  } catch { /* not installed */ }

  // Warn if any agent depends on this skill
  const discovery = require('./discovery');
  for (const agentName of discovery.listAgents(registryDir)) {
    const agentFile = path.join(registryDir, 'agents', agentName, 'agent.md');
    const content = fs.readFileSync(agentFile, 'utf8');
    const fm = parseFrontmatter(content);
    if (fm && Array.isArray(fm.skills) && fm.skills.includes(name)) {
      console.log(color.yellow(`  Warning: agent '${agentName}' depends on skill '${name}'`));
    }
  }
}

function uninstallAgent(name, registryDir, claudeDir) {
  validateName(name);
  const dst = path.join(claudeDir, 'commands', `${name}.md`);

  if (!fs.existsSync(dst)) {
    console.log(color.yellow(`  Agent ${name} is not installed`));
    return;
  }

  const firstLine = fs.readFileSync(dst, 'utf8').split('\n')[0];
  if (firstLine.includes(`agent-registry-path: ${registryDir}/`)) {
    fs.unlinkSync(dst);
    console.log(color.yellow(`  Removed agent: ${name}`));
  } else {
    console.log(color.yellow(`  Skipped: ${dst} not installed by this registry`));
    return;
  }

  // Warn if any orchestrator depends on this agent
  const discovery = require('./discovery');
  for (const other of discovery.listAgents(registryDir)) {
    const agentFile = path.join(registryDir, 'agents', other, 'agent.md');
    const content = fs.readFileSync(agentFile, 'utf8');
    const fm = parseFrontmatter(content);
    if (fm && Array.isArray(fm.subagents) && fm.subagents.includes(name)) {
      console.log(color.yellow(`  Warning: agent '${other}' depends on subagent '${name}'`));
    }
  }
}

function uninstallByName(name, registryDir, claudeDir) {
  validateName(name);
  const isAgent = fs.existsSync(path.join(registryDir, 'agents', name));
  const isSkill = fs.existsSync(path.join(registryDir, 'skills', name));

  if (isAgent && isSkill) {
    throw new Error(`Name '${name}' exists as both agent and skill. Use: uninstall --agent ${name} or uninstall --skill ${name}`);
  } else if (isAgent) {
    uninstallAgent(name, registryDir, claudeDir);
  } else if (isSkill) {
    uninstallSkill(name, registryDir, claudeDir);
  } else {
    throw new Error(`Not found: ${name}`);
  }
}

function uninstallAll(registryDir, claudeDir) {
  const discovery = require('./discovery');
  for (const name of discovery.listAgents(registryDir)) {
    uninstallAgent(name, registryDir, claudeDir);
  }
  for (const name of discovery.listSkills(registryDir)) {
    uninstallSkill(name, registryDir, claudeDir);
  }
  console.log('Done.');
}

module.exports = {
  validateName,
  installSkill,
  installAgent,
  installProject,
  installAll,
  uninstallSkill,
  uninstallAgent,
  uninstallByName,
  uninstallAll,
};
```

- [ ] **Step 2: Verify agent install round-trip**

```bash
node bin/cli.js install cit-deck-creator
head -1 ~/.claude/commands/cit-deck-creator.md
# Expected: <!-- agent-registry-path: .../agents/cit-deck-creator -->
node bin/cli.js uninstall cit-deck-creator
```

- [ ] **Step 3: Verify skill install round-trip**

```bash
node bin/cli.js install --skill slides
ls -la ~/.claude/commands/slides
node bin/cli.js uninstall --skill slides
```

- [ ] **Step 4: Commit**

```bash
git add lib/installer.js
git commit -m "Add installer module with frontmatter parsing, dependency resolution, and subagent support"
```

---

### Task 10: Create `lib/discovery.js`

**Files:**
- Create: `lib/discovery.js`

- [ ] **Step 1: Create `lib/discovery.js`**

```js
'use strict';

const fs = require('fs');
const path = require('path');
const { parseFrontmatter } = require('./frontmatter');

const color = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

function listAgents(registryDir) {
  const agentsDir = path.join(registryDir, 'agents');
  if (!fs.existsSync(agentsDir)) return [];
  return fs.readdirSync(agentsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .filter(d => fs.existsSync(path.join(agentsDir, d.name, 'agent.md')))
    .map(d => d.name)
    .sort();
}

function listSkills(registryDir) {
  const skillsDir = path.join(registryDir, 'skills');
  if (!fs.existsSync(skillsDir)) return [];
  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .filter(d => fs.existsSync(path.join(skillsDir, d.name, 'commands')))
    .map(d => d.name)
    .sort();
}

function readFm(name, registryDir) {
  const agentFile = path.join(registryDir, 'agents', name, 'agent.md');
  if (!fs.existsSync(agentFile)) return null;
  try {
    return parseFrontmatter(fs.readFileSync(agentFile, 'utf8'));
  } catch { return null; }
}

function showList(registryDir) {
  const agents = listAgents(registryDir);
  const skills = listSkills(registryDir);
  const orchestrators = [];
  const regularAgents = [];

  for (const name of agents) {
    const fm = readFm(name, registryDir);
    const type = (fm && fm.type) || 'agent';
    const desc = (fm && fm.description) || 'no description';
    const subagents = (fm && Array.isArray(fm.subagents)) ? fm.subagents : [];

    if (type === 'orchestrator') {
      orchestrators.push({ name, desc, subagents });
    } else {
      regularAgents.push({ name, desc });
    }
  }

  if (orchestrators.length > 0) {
    console.log(color.bold('Orchestrators:'));
    for (const o of orchestrators) {
      const subInfo = o.subagents.length > 0 ? ` (subagents: ${o.subagents.join(', ')})` : '';
      console.log(`  ${color.green(o.name)} — ${o.desc}${subInfo}`);
    }
    console.log('');
  }

  console.log(color.bold('Agents:'));
  if (regularAgents.length === 0) {
    console.log('  (none)');
  } else {
    const maxLen = Math.max(...regularAgents.map(a => a.name.length));
    for (const a of regularAgents) {
      console.log(`  ${color.green(a.name.padEnd(maxLen))} — ${a.desc}`);
    }
  }

  console.log('');
  console.log(color.bold('Skills:'));
  for (const name of skills) {
    console.log(`  ${color.green(name)}`);
  }
}

function isAgentInstalled(name, registryDir, claudeDir) {
  const dst = path.join(claudeDir, 'commands', `${name}.md`);
  if (!fs.existsSync(dst)) return false;
  try {
    const firstLine = fs.readFileSync(dst, 'utf8').split('\n')[0];
    return firstLine.includes(`agent-registry-path: ${registryDir}/`);
  } catch { return false; }
}

function isSkillInstalled(name, registryDir, claudeDir) {
  const cmdDst = path.join(claudeDir, 'commands', name);
  try {
    const stat = fs.lstatSync(cmdDst);
    if (!stat.isSymbolicLink()) return false;
    const actual = fs.realpathSync(cmdDst);
    return actual === path.join(registryDir, 'skills', name, 'commands');
  } catch { return false; }
}

function showStatus(registryDir, claudeDir) {
  const agents = listAgents(registryDir);
  const skills = listSkills(registryDir);

  // Build used-by map
  const usedBy = {};
  for (const name of agents) {
    const fm = readFm(name, registryDir);
    if (fm && Array.isArray(fm.subagents)) {
      for (const sub of fm.subagents) {
        if (!usedBy[sub]) usedBy[sub] = [];
        usedBy[sub].push(name);
      }
    }
  }

  console.log(color.bold('Agents:'));
  for (const name of agents) {
    const installed = isAgentInstalled(name, registryDir, claudeDir);
    const status = installed ? `[${color.green('installed')}]` : `[${color.red('not installed')}]`;
    const fm = readFm(name, registryDir);
    let extra = '';

    if (fm && Array.isArray(fm.subagents) && fm.subagents.length > 0) {
      const subStatus = fm.subagents.map(sub => {
        return isAgentInstalled(sub, registryDir, claudeDir) ? `${sub} ✓` : `${sub} ✗`;
      });
      extra = `  (subagents: ${subStatus.join(', ')})`;
    }

    if (usedBy[name] && usedBy[name].length > 0) {
      extra += `  (used by: ${usedBy[name].join(', ')})`;
    }

    console.log(`  ${name}  ${status}${extra}`);
  }

  console.log('');
  console.log(color.bold('Skills:'));
  for (const name of skills) {
    const installed = isSkillInstalled(name, registryDir, claudeDir);
    const status = installed ? `[${color.green('linked')}]` : `[${color.red('not installed')}]`;
    console.log(`  ${name}  ${status}`);
  }
}

module.exports = { listAgents, listSkills, showList, showStatus, isAgentInstalled, isSkillInstalled };
```

- [ ] **Step 2: Verify list and status**

```bash
node bin/cli.js list
node bin/cli.js status
```

- [ ] **Step 3: Commit**

```bash
git add lib/discovery.js
git commit -m "Add discovery module with type grouping and dependency status display"
```

---

### Task 11: Update `install.sh` to delegate to Node.js CLI

**Files:**
- Modify: `install.sh`

- [ ] **Step 1: Replace `install.sh` with thin wrapper**

```bash
#!/usr/bin/env bash
set -euo pipefail

REGISTRY_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v node &>/dev/null; then
  echo "Error: Node.js >= 18 is required. Install it from https://nodejs.org" >&2
  exit 1
fi

# Translate legacy flags to CLI subcommands
translate_args() {
  case "${1:-}" in
    --help|-h)       echo "help" ;;
    --agent)         echo "install --agent $2" ;;
    --skill)         echo "install --skill $2" ;;
    --project)       echo "project $2 ${3:-.}" ;;
    --status)        echo "status" ;;
    --list)          echo "list" ;;
    --uninstall)
      shift
      if [[ $# -eq 0 ]]; then
        echo "uninstall --all"
      elif [[ "$1" == "--agent" ]]; then
        echo "uninstall --agent $2"
      elif [[ "$1" == "--skill" ]]; then
        echo "uninstall --skill $2"
      else
        echo "uninstall $1"
      fi
      ;;
    *)               echo "$@" ;;
  esac
}

if [[ $# -eq 0 ]]; then
  exec node "$REGISTRY_DIR/bin/cli.js" install
else
  TRANSLATED=$(translate_args "$@")
  exec node "$REGISTRY_DIR/bin/cli.js" $TRANSLATED
fi
```

- [ ] **Step 2: Verify legacy commands work**

```bash
./install.sh --list
./install.sh --status
```

- [ ] **Step 3: Commit**

```bash
git add install.sh
git commit -m "Update install.sh to delegate to Node.js CLI with legacy flag translation"
```

---

## Phase 4: Testing

### Task 12: Create `test.js`

**Files:**
- Create: `test.js`

- [ ] **Step 1: Create `test.js`**

Write a comprehensive test suite using only Node.js builtins. The test suite should cover:

1. **Frontmatter tests** — run `node lib/test-frontmatter.js` as a subprocess
2. **Install/uninstall tests** — use temp directories for `$HOME` to avoid polluting real `~/.claude`
3. **Orchestrator dependency tests** — create temp registries with mock agents
4. **Discovery tests** — list grouping and status display
5. **Integration tests** — full lifecycle, project mode

```js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, execSync } = require('child_process');

const REGISTRY_DIR = path.resolve(__dirname);
const CLI = path.join(REGISTRY_DIR, 'bin', 'cli.js');

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

function run(args, env) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd: REGISTRY_DIR,
      env: { ...process.env, ...(env || {}) },
      encoding: 'utf8',
      timeout: 30000,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status || 1, stdout: (e.stdout || '').toString(), stderr: (e.stderr || '').toString() };
  }
}

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ar-test-')); }
function rmrf(d) { fs.rmSync(d, { recursive: true, force: true }); }

function writeAgent(reg, name, fm, body) {
  const dir = path.join(reg, 'agents', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'agent.md'), `---\n${fm}\n---\n\n${body || 'Body.'}\n`);
}

function copyLib(reg) {
  execSync(`cp -r "${path.join(REGISTRY_DIR, 'bin')}" "${reg}/"`);
  execSync(`cp -r "${path.join(REGISTRY_DIR, 'lib')}" "${reg}/"`);
  execSync(`cp "${path.join(REGISTRY_DIR, 'package.json')}" "${reg}/"`);
}

console.log('=== Agent Registry — Test Suite ===\n');

// ── Frontmatter Parser ──────────────────────────────────────

console.log('--- Frontmatter Parser ---');
try {
  execFileSync(process.execPath, [path.join(REGISTRY_DIR, 'lib', 'test-frontmatter.js')], {
    cwd: REGISTRY_DIR, encoding: 'utf8', timeout: 30000
  });
  check('frontmatter parser tests all pass', true);
} catch (e) {
  check('frontmatter parser tests all pass', false, (e.stdout || '').toString().split('\n').pop());
}

// ── Agent Install ───────────────────────────────────────────

console.log('\n--- Agent Installation ---');
{
  const home = tmpDir();
  run(['install', '--agent', 'cit-deck-creator'], { HOME: home });
  const dst = path.join(home, '.claude', 'commands', 'cit-deck-creator.md');
  check('agent file created', fs.existsSync(dst));
  if (fs.existsSync(dst)) {
    const content = fs.readFileSync(dst, 'utf8');
    check('has registry path comment', content.startsWith('<!-- agent-registry-path:'));
    check('frontmatter stripped', !content.includes('---\nname:'));
  }
  // Skill dependency auto-installed
  check('skill dependency auto-installed', fs.existsSync(path.join(home, '.claude', 'commands', 'slides')));
  rmrf(home);
}

// ── Skill Install ───────────────────────────────────────────

console.log('\n--- Skill Installation ---');
{
  const home = tmpDir();
  run(['install', '--skill', 'slides'], { HOME: home });
  const link = path.join(home, '.claude', 'commands', 'slides');
  const isLink = fs.existsSync(link) && fs.lstatSync(link).isSymbolicLink();
  check('skill symlink created', isLink);
  if (isLink) {
    check('symlink points to registry', fs.readlinkSync(link).includes('skills/slides/commands'));
  }
  rmrf(home);
}

// ── Orchestrator Subagent Auto-Install ──────────────────────

console.log('\n--- Orchestrator Subagent Auto-Install ---');
{
  const reg = tmpDir();
  const home = tmpDir();
  writeAgent(reg, 'sub-a', 'name: sub-a\ndescription: A\nversion: 1.0.0\nauthor: Me');
  writeAgent(reg, 'sub-b', 'name: sub-b\ndescription: B\nversion: 1.0.0\nauthor: Me');
  writeAgent(reg, 'my-orch', 'name: my-orch\ndescription: O\nversion: 1.0.0\nauthor: Me\ntype: orchestrator\nsubagents:\n  - sub-a\n  - sub-b');
  copyLib(reg);
  execFileSync(process.execPath, [path.join(reg, 'bin', 'cli.js'), 'install', '--agent', 'my-orch'], {
    cwd: reg, env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 30000
  });
  const cmds = path.join(home, '.claude', 'commands');
  check('orchestrator installed', fs.existsSync(path.join(cmds, 'my-orch.md')));
  check('subagent sub-a auto-installed', fs.existsSync(path.join(cmds, 'sub-a.md')));
  check('subagent sub-b auto-installed', fs.existsSync(path.join(cmds, 'sub-b.md')));
  rmrf(reg); rmrf(home);
}

// ── Uninstall ───────────────────────────────────────────────

console.log('\n--- Uninstall ---');
{
  const home = tmpDir();
  run(['install', '--agent', 'devops'], { HOME: home });
  check('agent exists before uninstall', fs.existsSync(path.join(home, '.claude', 'commands', 'devops.md')));
  run(['uninstall', '--agent', 'devops'], { HOME: home });
  check('agent removed after uninstall', !fs.existsSync(path.join(home, '.claude', 'commands', 'devops.md')));
  rmrf(home);
}

// ── Uninstall Subagent Warns ────────────────────────────────

console.log('\n--- Uninstall Subagent Warning ---');
{
  const reg = tmpDir();
  const home = tmpDir();
  writeAgent(reg, 'dep', 'name: dep\ndescription: D\nversion: 1.0.0\nauthor: Me');
  writeAgent(reg, 'orch', 'name: orch\ndescription: O\nversion: 1.0.0\nauthor: Me\ntype: orchestrator\nsubagents:\n  - dep');
  copyLib(reg);
  const cli = path.join(reg, 'bin', 'cli.js');
  execFileSync(process.execPath, [cli, 'install', '--agent', 'orch'], { cwd: reg, env: { ...process.env, HOME: home }, encoding: 'utf8' });
  let out = '';
  try { out = execFileSync(process.execPath, [cli, 'uninstall', '--agent', 'dep'], { cwd: reg, env: { ...process.env, HOME: home }, encoding: 'utf8' }); } catch (e) { out = (e.stdout || '').toString(); }
  check('warns about orchestrator dependency', /warning/i.test(out) && out.includes('orch'));
  rmrf(reg); rmrf(home);
}

// ── Uninstall Orchestrator Keeps Subagents ──────────────────

console.log('\n--- Uninstall Orchestrator Keeps Subagents ---');
{
  const reg = tmpDir();
  const home = tmpDir();
  writeAgent(reg, 'kept', 'name: kept\ndescription: K\nversion: 1.0.0\nauthor: Me');
  writeAgent(reg, 'rem', 'name: rem\ndescription: R\nversion: 1.0.0\nauthor: Me\ntype: orchestrator\nsubagents:\n  - kept');
  copyLib(reg);
  const cli = path.join(reg, 'bin', 'cli.js');
  execFileSync(process.execPath, [cli, 'install', '--agent', 'rem'], { cwd: reg, env: { ...process.env, HOME: home }, encoding: 'utf8' });
  execFileSync(process.execPath, [cli, 'uninstall', '--agent', 'rem'], { cwd: reg, env: { ...process.env, HOME: home }, encoding: 'utf8' });
  const cmds = path.join(home, '.claude', 'commands');
  check('orchestrator removed', !fs.existsSync(path.join(cmds, 'rem.md')));
  check('subagent kept', fs.existsSync(path.join(cmds, 'kept.md')));
  rmrf(reg); rmrf(home);
}

// ── Circular Dependency Guard ───────────────────────────────

console.log('\n--- Circular Dependency Guard ---');
{
  const reg = tmpDir();
  const home = tmpDir();
  writeAgent(reg, 'ca', 'name: ca\ndescription: A\nversion: 1.0.0\nauthor: Me\ntype: orchestrator\nsubagents:\n  - cb');
  writeAgent(reg, 'cb', 'name: cb\ndescription: B\nversion: 1.0.0\nauthor: Me\ntype: orchestrator\nsubagents:\n  - ca');
  copyLib(reg);
  let completed = false;
  try {
    execFileSync(process.execPath, [path.join(reg, 'bin', 'cli.js'), 'install', '--agent', 'ca'], {
      cwd: reg, env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 10000
    });
    completed = true;
  } catch { completed = true; /* threw but didn't hang */ }
  check('circular dependency does not hang', completed);
  rmrf(reg); rmrf(home);
}

// ── Name Validation ─────────────────────────────────────────

console.log('\n--- Name Validation ---');
{
  const home = tmpDir();
  const r1 = run(['install', '--agent', '../traversal'], { HOME: home });
  check('rejects path traversal', r1.status !== 0 || /invalid/i.test(r1.stdout + r1.stderr));
  const r2 = run(['install', '--agent', '.hidden'], { HOME: home });
  check('rejects hidden dir name', r2.status !== 0 || /invalid/i.test(r2.stdout + r2.stderr));
  rmrf(home);
}

// ── List Groups Correctly ───────────────────────────────────

console.log('\n--- List Command ---');
{
  const r = run(['list']);
  check('list succeeds', r.status === 0);
  check('list shows agents', /cit-deck-creator|devops/i.test(r.stdout));
}

// ── Integration: Full Lifecycle ─────────────────────────────

console.log('\n--- Integration: Full Lifecycle ---');
{
  const home = tmpDir();
  const r1 = run(['install'], { HOME: home });
  check('install all succeeds', r1.status === 0);
  const r2 = run(['status'], { HOME: home });
  check('status shows installed', /installed/i.test(r2.stdout));
  const r3 = run(['uninstall', '--all'], { HOME: home });
  check('uninstall all succeeds', r3.status === 0);
  const r4 = run(['status'], { HOME: home });
  check('status shows not installed', /not installed/i.test(r4.stdout));
  rmrf(home);
}

// ── Integration: Project Mode ───────────────────────────────

console.log('\n--- Integration: Project Mode ---');
{
  const home = tmpDir();
  const proj = tmpDir();
  run(['project', 'devops', proj], { HOME: home });
  const claudeMd = path.join(proj, '.claude', 'CLAUDE.md');
  check('CLAUDE.md created', fs.existsSync(claudeMd));
  if (fs.existsSync(claudeMd)) {
    const content = fs.readFileSync(claudeMd, 'utf8');
    check('CLAUDE.md has agent content', /infrastructure/i.test(content));
    check('ref paths rewritten', content.includes('.claude/ref/devops/'));
  }
  check('ref docs copied', fs.existsSync(path.join(proj, '.claude', 'ref', 'devops', 'deployment-runbook.md')));
  rmrf(home); rmrf(proj);
}

// ── Summary ─────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run tests**

Run: `node test.js`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add test.js
git commit -m "Add comprehensive Node.js test suite replacing test.sh"
```

---

## Phase 5: Cleanup and Publish

### Task 13: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README.md** with new schema docs, npm usage, orchestrator docs, updated agent table. See spec Section "npm Packaging" and design decisions for content.

Key sections to update:
- Add `npx agent-registry` usage throughout
- Update agent table to include pr-reviewer, pr-fixer, pr-orchestrator with type/model columns
- Add frontmatter schema table with new fields
- Add "Adding a New Orchestrator" section
- Update structure diagram

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Update README with npm usage, orchestrator docs, and extended schema"
```

---

### Task 14: Update .gitignore and delete old files

**Files:**
- Modify: `.gitignore`
- Delete: `agents/code-reviewer/` (if not already done in Task 6)
- Delete: `lib/parse_frontmatter.py`
- Delete: `lib/test_parse_frontmatter.py`
- Delete: `test.sh`

- [ ] **Step 1: Add node_modules to .gitignore**

Append `node_modules/` to `.gitignore`

- [ ] **Step 2: Delete old files**

```bash
rm -f lib/parse_frontmatter.py lib/test_parse_frontmatter.py test.sh
rm -rf lib/__pycache__/
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Remove old Python parser, bash tests, and add node_modules to .gitignore"
```

---

### Task 15: Final verification and publish

- [ ] **Step 1: Run full test suite**

```bash
node test.js
```

- [ ] **Step 2: Verify install/uninstall cycle**

```bash
node bin/cli.js install
node bin/cli.js status
node bin/cli.js uninstall --all
```

- [ ] **Step 3: Verify orchestrator lifecycle**

```bash
node bin/cli.js install --agent pr-orchestrator
node bin/cli.js status
# Should show: pr-orchestrator [installed] (subagents: pr-reviewer ✓, pr-fixer ✓)
node bin/cli.js uninstall --all
```

- [ ] **Step 4: Verify legacy install.sh**

```bash
./install.sh --list
./install.sh --status
```

- [ ] **Step 5: Dry-run npm pack**

```bash
npm pack --dry-run
```
Verify it includes `bin/`, `lib/`, `agents/`, `skills/` and excludes `node_modules/`, `.git/`.

- [ ] **Step 6: Publish**

```bash
npm login
npm publish
npm info agent-registry
```

- [ ] **Step 7: Tag release**

```bash
git tag v1.0.0
git push origin main --tags
```
