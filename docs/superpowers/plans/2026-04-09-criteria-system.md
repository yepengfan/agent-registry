# Criteria System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a composable criteria system as a new registry primitive for measurable quality evaluation.

**Architecture:** Criteria are markdown files in `criteria/` with structured frontmatter (name, gate, metric, pass_when). The installer injects criteria content into agent prompts at install time, mirroring the existing behavior injection pattern. Discovery/CLI display criteria alongside behaviors.

**Tech Stack:** Node.js, same test harness as existing tests (check/run/tmpDir pattern)

**Spec:** `docs/superpowers/specs/2026-04-09-criteria-system-design.md`

---

### Task 1: Create criteria directory and files

**Files:**
- Create: `criteria/zero-must-fix-issues.md`
- Create: `criteria/all-tests-pass.md`
- Create: `criteria/no-new-lint-warnings.md`

- [ ] **Step 1: Create `criteria/zero-must-fix-issues.md`**

```markdown
---
name: zero-must-fix-issues
description: No must-fix issues remain after review
gate: true
metric: must_fix_count
pass_when: "equals 0"
---

## Zero Must-Fix Issues

The PR must have zero must-fix severity issues remaining after review.

A must-fix issue is:
- A bug, security vulnerability, broken error handling, or breaking API change
- NOT a style suggestion, minor refactor, or nice-to-have improvement

### Pass
All issues found are severity "suggestion" or lower. Zero "must-fix" items remain.

### Fail
One or more "must-fix" issues remain. Report each with file, line, and reason.

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "zero-must-fix-issues", "gate": true, "pass": <bool>, "metric": "must_fix_count", "value": <number>, "detail": "<summary>"}
```
```

- [ ] **Step 2: Create `criteria/all-tests-pass.md`**

```markdown
---
name: all-tests-pass
description: All existing tests pass after changes
gate: true
metric: test_pass_rate
pass_when: "all tests pass with zero failures"
---

## All Tests Pass

The full test suite must pass with zero failures after the PR's changes.

### Pass
Test runner reports 0 failures. Include pass count in value (e.g., "47/47").

### Fail
One or more tests fail. Report the failing test names and error messages.

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "all-tests-pass", "gate": true, "pass": <bool>, "metric": "test_pass_rate", "value": "<pass>/<total>", "detail": "<summary>"}
```
```

- [ ] **Step 3: Create `criteria/no-new-lint-warnings.md`**

```markdown
---
name: no-new-lint-warnings
description: PR does not introduce new lint warnings
gate: false
metric: new_lint_warning_count
pass_when: "equals 0"
---

## No New Lint Warnings

The PR should not introduce new lint or type-check warnings beyond what existed on the base branch.

### Pass
No new warnings introduced by the PR's changed files.

### Fail
New warnings found. Report each with file, line, and warning message.

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "no-new-lint-warnings", "gate": false, "pass": <bool>, "metric": "new_lint_warning_count", "value": <number>, "detail": "<summary>"}
```
```

- [ ] **Step 4: Verify files exist**

Run: `ls criteria/`
Expected: `all-tests-pass.md  no-new-lint-warnings.md  zero-must-fix-issues.md`

- [ ] **Step 5: Commit**

```bash
git add criteria/
git commit -m "feat: add initial criteria files for PR workflow"
```

---

### Task 2: Add criteria validation to frontmatter parser

**Files:**
- Modify: `lib/frontmatter.js` (add criteria validation in `validate()`)
- Modify: `lib/test-frontmatter.js` (add criteria validation tests)

- [ ] **Step 1: Write failing test for criteria validation**

Add to `lib/test-frontmatter.js` — a test that expects `criteria` to be validated as a list of valid names, mirroring the existing `behaviors` validation:

```javascript
// --- criteria validation ---
// Valid criteria list
(() => {
  const fm = parseFrontmatter('---\nname: t\ndescription: d\nversion: 1.0.0\nauthor: a\ncriteria:\n  - zero-must-fix\n  - all-tests-pass\n---\n');
  check('criteria parsed as array', Array.isArray(fm.criteria) && fm.criteria.length === 2);
  check('criteria first item', fm.criteria[0] === 'zero-must-fix');
})();

// Invalid criteria name rejects
(() => {
  try {
    const fm = parseFrontmatter('---\nname: t\ndescription: d\nversion: 1.0.0\nauthor: a\ncriteria:\n  - ../bad\n---\n');
    validate(fm);
    check('invalid criteria name rejects', false);
  } catch (e) {
    check('invalid criteria name rejects', /invalid criteria/i.test(e.message));
  }
})();

// Non-array criteria rejects
(() => {
  try {
    const fm = parseFrontmatter('---\nname: t\ndescription: d\nversion: 1.0.0\nauthor: a\ncriteria: not-a-list\n---\n');
    validate(fm);
    check('non-array criteria rejects', false);
  } catch (e) {
    check('non-array criteria rejects', /criteria must be a list/i.test(e.message));
  }
})();

// Inline criteria syntax
(() => {
  const fm = parseFrontmatter('---\nname: t\ndescription: d\nversion: 1.0.0\nauthor: a\ncriteria: [foo, bar]\n---\n');
  check('inline criteria parsed', Array.isArray(fm.criteria) && fm.criteria.length === 2);
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node lib/test-frontmatter.js`
Expected: FAIL — `validate()` doesn't check `criteria` yet

- [ ] **Step 3: Add criteria validation to `validate()` in `lib/frontmatter.js`**

Add this block after the existing `behaviors` validation (after line 123):

```javascript
  if (data.criteria !== undefined) {
    if (!Array.isArray(data.criteria)) {
      throw new Error(`criteria must be a list`);
    }
    const namePattern = /^[a-zA-Z0-9_-]+$/;
    for (const item of data.criteria) {
      if (typeof item !== 'string' || !namePattern.test(item)) {
        throw new Error(`Invalid criteria name "${item}". Must match [a-zA-Z0-9_-]+`);
      }
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node lib/test-frontmatter.js`
Expected: All tests pass

- [ ] **Step 5: Run full test suite to check no regressions**

Run: `node test.js`
Expected: All existing tests pass (100/100)

- [ ] **Step 6: Commit**

```bash
git add lib/frontmatter.js lib/test-frontmatter.js
git commit -m "feat: add criteria validation to frontmatter parser"
```

---

### Task 3: Add criteria loading and injection to installer

**Files:**
- Modify: `lib/installer.js` (add `loadCriteria()`, call it in `installAgent()` and `installProject()`)
- Modify: `test.js` (add criteria injection tests)

- [ ] **Step 1: Write failing test for criteria injection**

Add to `test.js` before the Summary section (after the "List Shows Behaviors" tests):

```javascript
// ── Criteria Injection ─────────────────────────────────────

console.log('\n--- Criteria Injection ---');
{
  const reg = tmpDir();
  const home = tmpDir();
  fs.mkdirSync(path.join(reg, 'criteria'), { recursive: true });
  fs.writeFileSync(path.join(reg, 'criteria', 'test-criterion.md'),
    '---\nname: test-criterion\ndescription: A test criterion\ngate: true\nmetric: test_metric\npass_when: "equals 0"\n---\n\n## Test Criterion\n\nCheck this thing.\n');
  writeAgent(reg, 'criteria-agent',
    'name: criteria-agent\ndescription: C\nversion: 1.0.0\nauthor: Me\ncriteria:\n  - test-criterion',
    'Do your job.');
  copyLib(reg);
  execFileSync(process.execPath, [path.join(reg, 'bin', 'cli.js'), 'install', '--agent', 'criteria-agent'], {
    cwd: reg, env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 30000
  });
  const dst = path.join(home, '.claude', 'commands', 'criteria-agent.md');
  check('agent with criteria installed', fs.existsSync(dst));
  if (fs.existsSync(dst)) {
    const content = fs.readFileSync(dst, 'utf8');
    check('has criteria start marker', content.includes('<!-- criteria:start -->'));
    check('has criteria end marker', content.includes('<!-- criteria:end -->'));
    check('criteria content injected', content.includes('## Test Criterion'));
    check('criteria content includes rule', content.includes('Check this thing.'));
    check('agent body still present', content.includes('Do your job.'));
    check('criteria appear before body', content.indexOf('## Test Criterion') < content.indexOf('Do your job.'));
  }
  rmrf(reg); rmrf(home);
}

console.log('\n--- Missing Criteria Error ---');
{
  const reg = tmpDir();
  const home = tmpDir();
  writeAgent(reg, 'bad-criteria',
    'name: bad-criteria\ndescription: B\nversion: 1.0.0\nauthor: Me\ncriteria:\n  - nonexistent');
  copyLib(reg);
  const result = (() => {
    try {
      execFileSync(process.execPath, [path.join(reg, 'bin', 'cli.js'), 'install', '--agent', 'bad-criteria'], {
        cwd: reg, env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 30000
      });
      return { status: 0 };
    } catch (e) {
      return { status: 1, stderr: (e.stderr || '').toString(), stdout: (e.stdout || '').toString() };
    }
  })();
  check('missing criteria rejects install', result.status !== 0);
  rmrf(reg); rmrf(home);
}

console.log('\n--- Agent Without Criteria Unchanged ---');
{
  const reg = tmpDir();
  const home = tmpDir();
  writeAgent(reg, 'no-criteria', 'name: no-criteria\ndescription: N\nversion: 1.0.0\nauthor: Me', 'Plain body.');
  copyLib(reg);
  execFileSync(process.execPath, [path.join(reg, 'bin', 'cli.js'), 'install', '--agent', 'no-criteria'], {
    cwd: reg, env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 30000
  });
  const dst = path.join(home, '.claude', 'commands', 'no-criteria.md');
  if (fs.existsSync(dst)) {
    const content = fs.readFileSync(dst, 'utf8');
    check('no criteria markers when none declared', !content.includes('<!-- criteria:'));
    check('plain body present', content.includes('Plain body.'));
  }
  rmrf(reg); rmrf(home);
}

console.log('\n--- Both Behaviors and Criteria ---');
{
  const reg = tmpDir();
  const home = tmpDir();
  fs.mkdirSync(path.join(reg, 'behaviors'), { recursive: true });
  fs.writeFileSync(path.join(reg, 'behaviors', 'test-behave.md'),
    '---\nname: test-behave\ndescription: B\n---\n\n## Test Behavior\n\nBehavior content.\n');
  fs.mkdirSync(path.join(reg, 'criteria'), { recursive: true });
  fs.writeFileSync(path.join(reg, 'criteria', 'test-crit.md'),
    '---\nname: test-crit\ndescription: C\ngate: true\nmetric: m\npass_when: "equals 0"\n---\n\n## Test Criteria\n\nCriteria content.\n');
  writeAgent(reg, 'both-agent',
    'name: both-agent\ndescription: X\nversion: 1.0.0\nauthor: Me\nbehaviors:\n  - test-behave\ncriteria:\n  - test-crit',
    'Agent body.');
  copyLib(reg);
  execFileSync(process.execPath, [path.join(reg, 'bin', 'cli.js'), 'install', '--agent', 'both-agent'], {
    cwd: reg, env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 30000
  });
  const dst = path.join(home, '.claude', 'commands', 'both-agent.md');
  if (fs.existsSync(dst)) {
    const content = fs.readFileSync(dst, 'utf8');
    check('has both behavior and criteria markers', content.includes('<!-- behaviors:start -->') && content.includes('<!-- criteria:start -->'));
    check('behaviors before criteria', content.indexOf('<!-- behaviors:start -->') < content.indexOf('<!-- criteria:start -->'));
    check('criteria before body', content.indexOf('<!-- criteria:end -->') < content.indexOf('Agent body.'));
  }
  rmrf(reg); rmrf(home);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test.js`
Expected: New criteria tests FAIL — `loadCriteria` doesn't exist yet

- [ ] **Step 3: Add `loadCriteria()` to `lib/installer.js`**

Add after the `loadBehaviors()` function (after line 52):

```javascript
function loadCriteria(criteriaNames, registryDir) {
  if (!criteriaNames || criteriaNames.length === 0) return '';
  const criteriaDir = path.join(registryDir, 'criteria');
  const sections = [];

  for (const name of criteriaNames) {
    const filePath = path.join(criteriaDir, `${name}.md`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Criteria not found: ${name} (expected at criteria/${name}.md)`);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const body = extractBody(content);
    sections.push(body);
  }

  return `<!-- criteria:start -->\n${sections.join('\n\n')}\n<!-- criteria:end -->`;
}
```

- [ ] **Step 4: Update `installAgent()` to inject criteria**

In `installAgent()`, after line 122 (`const behaviorBlock = loadBehaviors(behaviors, registryDir);`), add:

```javascript
  const criteria = Array.isArray(fm.criteria) ? fm.criteria : [];
  const criteriaBlock = loadCriteria(criteria, registryDir);
```

Update the parts assembly (around line 126-128) to include criteria between behaviors and body:

```javascript
  const parts = [`<!-- agent-registry-path: ${agentDir} -->`];
  if (behaviorBlock) parts.push(behaviorBlock);
  if (criteriaBlock) parts.push(criteriaBlock);
  parts.push(body);
```

- [ ] **Step 5: Update `installProject()` to inject criteria**

In `installProject()`, after line 178 (`const behaviorBlock = loadBehaviors(behaviors, registryDir);`), add:

```javascript
  const criteria = Array.isArray(fm.criteria) ? fm.criteria : [];
  const criteriaBlock = loadCriteria(criteria, registryDir);
```

Update the body assembly (around lines 183-188) to include criteria:

```javascript
  if (fs.existsSync(claudeMd)) {
    const blocks = [behaviorBlock, criteriaBlock].filter(Boolean);
    const agentContent = blocks.length > 0 ? `${blocks.join('\n\n')}\n\n${body}` : body;
    fs.appendFileSync(claudeMd, `\n\n## Agent: ${name}\n\n${agentContent}`);
  } else {
    const blocks = [behaviorBlock, criteriaBlock].filter(Boolean);
    const agentContent = blocks.length > 0 ? `${blocks.join('\n\n')}\n\n${body}` : body;
    fs.writeFileSync(claudeMd, agentContent);
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node test.js`
Expected: All tests pass including new criteria tests

- [ ] **Step 7: Commit**

```bash
git add lib/installer.js test.js
git commit -m "feat: add criteria loading and injection to installer"
```

---

### Task 4: Add criteria to discovery and CLI display

**Files:**
- Modify: `lib/discovery.js` (add `listCriteria()`, update `showList()` and `showStatus()`)
- Modify: `test.js` (add criteria display tests)

- [ ] **Step 1: Write failing test for criteria in list command**

Add to `test.js` before the Summary section:

```javascript
// ── List Shows Criteria ───────────────────────────────────

console.log('\n--- List Shows Criteria ---');
{
  const reg = tmpDir();
  fs.mkdirSync(path.join(reg, 'criteria'), { recursive: true });
  fs.writeFileSync(path.join(reg, 'criteria', 'my-criterion.md'),
    '---\nname: my-criterion\ndescription: A quality gate\ngate: true\nmetric: m\npass_when: "equals 0"\n---\n\nContent.\n');
  fs.mkdirSync(path.join(reg, 'agents'), { recursive: true });
  copyLib(reg);
  let out = '';
  try {
    out = execFileSync(process.execPath, [path.join(reg, 'bin', 'cli.js'), 'list'], {
      cwd: reg, encoding: 'utf8', timeout: 30000
    });
  } catch (e) { out = (e.stdout || '').toString(); }
  check('list shows criteria section', /criteria/i.test(out));
  check('list shows my-criterion', out.includes('my-criterion'));
  check('list shows criteria description', out.includes('A quality gate'));
  rmrf(reg);
}

console.log('\n--- Status Shows Criteria ---');
{
  const reg = tmpDir();
  const home = tmpDir();
  fs.mkdirSync(path.join(reg, 'criteria'), { recursive: true });
  fs.writeFileSync(path.join(reg, 'criteria', 'test-gate.md'),
    '---\nname: test-gate\ndescription: G\ngate: true\nmetric: m\npass_when: "equals 0"\n---\n\nContent.\n');
  writeAgent(reg, 'crit-agent',
    'name: crit-agent\ndescription: C\nversion: 1.0.0\nauthor: Me\ncriteria:\n  - test-gate',
    'Body.');
  copyLib(reg);
  const cli = path.join(reg, 'bin', 'cli.js');
  execFileSync(process.execPath, [cli, 'install', '--agent', 'crit-agent'], {
    cwd: reg, env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 30000
  });
  let out = '';
  try {
    out = execFileSync(process.execPath, [cli, 'status'], {
      cwd: reg, env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 30000
    });
  } catch (e) { out = (e.stdout || '').toString(); }
  check('status shows criteria for agent', out.includes('criteria:') && out.includes('test-gate'));
  rmrf(reg); rmrf(home);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test.js`
Expected: New list/status criteria tests FAIL

- [ ] **Step 3: Add `listCriteria()` to `lib/discovery.js`**

Add after `listBehaviors()` (after line 41):

```javascript
function listCriteria(registryDir) {
  const criteriaDir = path.join(registryDir, 'criteria');
  if (!fs.existsSync(criteriaDir)) return [];
  return fs.readdirSync(criteriaDir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith('.md'))
    .map(d => d.name.replace(/\.md$/, ''))
    .sort();
}
```

- [ ] **Step 4: Update `showList()` to display criteria**

Add at the end of `showList()`, after the behaviors block (after line 106):

```javascript
  const criteria = listCriteria(registryDir);
  if (criteria.length > 0) {
    console.log('');
    console.log(color.bold('Criteria:'));
    for (const name of criteria) {
      const filePath = path.join(registryDir, 'criteria', `${name}.md`);
      const content = fs.readFileSync(filePath, 'utf8');
      const cfm = parseFrontmatter(content);
      const desc = (cfm && cfm.description) || '';
      const gateTag = (cfm && cfm.gate === 'true') ? ' [gate]' : ' [advisory]';
      console.log(`  ${color.green(name)}${gateTag}${desc ? ' — ' + desc : ''}`);
    }
  }
```

- [ ] **Step 5: Update `showStatus()` to display criteria for agents**

In `showStatus()`, after the behaviors display (after line 164), add:

```javascript
    if (fm && Array.isArray(fm.criteria) && fm.criteria.length > 0) {
      extra += `  (criteria: ${fm.criteria.join(', ')})`;
    }
```

- [ ] **Step 6: Update `module.exports` to include `listCriteria`**

```javascript
module.exports = { listAgents, listSkills, listBehaviors, listCriteria, showList, showStatus, isAgentInstalled, isSkillInstalled };
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `node test.js`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add lib/discovery.js test.js
git commit -m "feat: add criteria to list and status CLI commands"
```

---

### Task 5: Update agent prompts and package.json

**Files:**
- Modify: `agents/pr-reviewer/agent.md` (add `criteria:` to frontmatter, add output contract)
- Modify: `agents/pr-orchestrator/agent.md` (update workflow for criteria-aware exit logic)
- Modify: `package.json` (add `criteria/` to `files` array)

- [ ] **Step 1: Add `criteria:` field to pr-reviewer frontmatter**

In `agents/pr-reviewer/agent.md`, add after the `behaviors:` block (after line 11):

```yaml
criteria:
  - zero-must-fix-issues
  - all-tests-pass
```

- [ ] **Step 2: Add evaluator output contract to pr-reviewer body**

Add before the `## Behavior` section at the end of `agents/pr-reviewer/agent.md`:

```markdown
## Criteria Evaluation

You have criteria injected into your prompt. For each criterion, include a `criteria_results` entry in your JSON output:

```json
{
  "pr": 123,
  "issues": [...],
  "criteria_results": [
    {"criterion": "<name>", "gate": <bool>, "pass": <bool>, "metric": "<key>", "value": <measured>, "detail": "<explanation>"}
  ],
  "summary": "Found N issues. Criteria: X/Y gates passing."
}
```

Rules:
- Every criterion in your injected criteria list MUST appear in `criteria_results`
- `pass` is your judgment based on the criterion's `pass_when` condition
- `value` is the raw measurement (number or string)
- `detail` explains your reasoning
```

- [ ] **Step 3: Update pr-orchestrator workflow for criteria-aware exit logic**

In `agents/pr-orchestrator/agent.md`, replace Step 4 (Evaluate Review Results) content:

```markdown
### Step 4: Evaluate Criteria Results

Parse the reviewer's JSON output. Check `criteria_results`:

- Extract all entries where `gate: true` and `pass: false`
- If none → all gates pass. Post summary comment and exit.
- If any → extract the failing gate details and corresponding issues, dispatch the fixer.

Advisory criteria (`gate: false`) are reported in the summary but never block completion.
```

Update Step 7 (Post Final Summary) to include criteria reporting:

```markdown
### Step 7: Post Final Summary

Post a summary comment on the PR:
```bash
gh pr comment <PR> --body "<summary>"
```

Include:
- Per-criterion results (pass/fail with detail, gate vs advisory)
- If multi-round: which criteria flipped from fail→pass
- Issues found, issues fixed, issues remaining
- Verify results (if applicable)
```

Add to the Input Parsing section, after the flags description:

```markdown
- **Criteria overrides**: `--criteria +name` (add), `--criteria -name` (remove), `--criteria name1,name2` (replace)

When dispatching the reviewer, resolve the final criteria list:
1. Read the reviewer's frontmatter to get default `criteria:` list
2. Apply any caller `--criteria` overrides
3. Include the resolved criteria content in the reviewer's dispatch prompt
```

- [ ] **Step 4: Add `criteria/` to `package.json` files array**

In `package.json`, add `"criteria/"` after `"behaviors/"` in the `files` array:

```json
  "files": [
    "bin/",
    "lib/frontmatter.js",
    "lib/installer.js",
    "lib/discovery.js",
    "agents/",
    "skills/",
    "behaviors/",
    "criteria/"
  ],
```

- [ ] **Step 5: Verify the install works end-to-end**

Run: `node bin/cli.js install --agent pr-reviewer`
Expected: Installs successfully with criteria injected. Check the output file:

Run: `grep -c 'criteria:start' ~/.claude/commands/pr-reviewer.md`
Expected: `1`

- [ ] **Step 6: Run full test suite**

Run: `node test.js`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add agents/pr-reviewer/agent.md agents/pr-orchestrator/agent.md package.json
git commit -m "feat: add criteria to pr-reviewer, update orchestrator workflow, add criteria/ to package"
```

---

### Task 6: Update command picks up criteria changes

**Files:**
- Modify: `test.js` (add criteria update test)

- [ ] **Step 1: Write test for update reflecting criteria changes**

Add to `test.js` before the Summary section:

```javascript
// ── Update Picks Up Criteria Changes ──────────────────────

console.log('\n--- Update Picks Up Criteria Changes ---');
{
  const reg = tmpDir();
  const home = tmpDir();
  fs.mkdirSync(path.join(reg, 'criteria'), { recursive: true });
  fs.writeFileSync(path.join(reg, 'criteria', 'evolving.md'),
    '---\nname: evolving\ndescription: V1\ngate: true\nmetric: m\npass_when: "equals 0"\n---\n\n## Evolving\n\nVersion one.\n');
  writeAgent(reg, 'crit-up-agent',
    'name: crit-up-agent\ndescription: U\nversion: 1.0.0\nauthor: Me\ncriteria:\n  - evolving',
    'Agent body.');
  copyLib(reg);
  const cli = path.join(reg, 'bin', 'cli.js');
  execFileSync(process.execPath, [cli, 'install', '--agent', 'crit-up-agent'], {
    cwd: reg, env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 30000
  });
  const dst = path.join(home, '.claude', 'commands', 'crit-up-agent.md');
  check('initial criteria install has v1', fs.readFileSync(dst, 'utf8').includes('Version one.'));
  // Update the criteria file
  fs.writeFileSync(path.join(reg, 'criteria', 'evolving.md'),
    '---\nname: evolving\ndescription: V2\ngate: true\nmetric: m\npass_when: "equals 0"\n---\n\n## Evolving\n\nVersion two updated.\n');
  // Run update
  execFileSync(process.execPath, [cli, 'update'], {
    cwd: reg, env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 30000
  });
  check('after update has v2 criteria', fs.readFileSync(dst, 'utf8').includes('Version two updated.'));
  check('after update v1 criteria gone', !fs.readFileSync(dst, 'utf8').includes('Version one.'));
  rmrf(reg); rmrf(home);
}
```

- [ ] **Step 2: Run test to verify it passes**

This test should already pass because `updateAll()` calls `installAgent()` which now calls `loadCriteria()`. Run:

Run: `node test.js`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add test.js
git commit -m "test: add criteria update verification test"
```

---

### Task 7: Final integration verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `node test.js`
Expected: All tests pass (should be ~115+ tests now)

- [ ] **Step 2: Verify list command shows criteria**

Run: `node bin/cli.js list`
Expected: Output includes a "Criteria:" section showing all 3 criteria with gate/advisory tags

- [ ] **Step 3: Install all and verify status shows criteria**

Run: `node bin/cli.js install --agent pr-reviewer`
Run: `node bin/cli.js status`
Expected: pr-reviewer shows `(criteria: zero-must-fix-issues, all-tests-pass)` in status output

- [ ] **Step 4: Verify installed pr-reviewer has criteria content**

Run: `cat ~/.claude/commands/pr-reviewer.md | head -30`
Expected: Shows `<!-- criteria:start -->` marker with criteria content injected between behaviors and body

- [ ] **Step 5: Final commit if any cleanup needed**

Only commit if there are changes from the verification steps. Otherwise, task is complete.
