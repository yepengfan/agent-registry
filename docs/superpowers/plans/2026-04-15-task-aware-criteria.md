# Task-Aware Criteria with Repo Profiles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the pr-orchestrator to dynamically select criteria based on task type (feature/bugfix/refactor) and repo profile (frontend/backend), so reviews are tailored to context.

**Architecture:** Profile files in `profiles/` define detection rules and task-type-to-criteria mappings. A new `lib/profiles.js` module handles loading, detection, and resolution. The orchestrator detects profile + task type at runtime and resolves criteria before dispatching the reviewer. Repos without profiles fall back to the reviewer's hardcoded criteria list (zero breaking changes).

**Tech Stack:** Node.js, custom test framework (check/pass/fail pattern in test.js)

**Implementation note:** The existing frontmatter parser (`lib/frontmatter.js:simpleParse`) only supports `interface` as a nested YAML object. Rather than modifying the fragile hand-rolled parser, profile files use a **flattened frontmatter format** (`detect-files`, `criteria-feature`, etc.) that the existing parser handles natively. The `loadProfiles()` function restructures the flat data into the nested format consumers expect.

---

### Task 1: detectTaskType — Tests

**Files:**
- Create: `lib/test-profiles.js`

- [ ] **Step 1: Create test file with detectTaskType test cases**

```js
#!/usr/bin/env node
'use strict';

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) { console.log('  PASS: ' + name); passed++; }
  else { console.log('  FAIL: ' + name); failed++; }
}

// ── detectTaskType ──────────────────────────────────────────

const { detectTaskType } = require('./profiles');

console.log('=== Profile Module Tests ===');

console.log('\n--- detectTaskType: branch prefix ---');
check('feat/ branch', detectTaskType({ headRefName: 'feat/add-login', title: '' }) === 'feature');
check('feature/ branch', detectTaskType({ headRefName: 'feature/new-dashboard', title: '' }) === 'feature');
check('fix/ branch', detectTaskType({ headRefName: 'fix/login-token-expiry', title: '' }) === 'bugfix');
check('bugfix/ branch', detectTaskType({ headRefName: 'bugfix/null-pointer', title: '' }) === 'bugfix');
check('hotfix/ branch', detectTaskType({ headRefName: 'hotfix/prod-crash', title: '' }) === 'bugfix');
check('refactor/ branch', detectTaskType({ headRefName: 'refactor/auth-module', title: '' }) === 'refactor');
check('refact/ branch', detectTaskType({ headRefName: 'refact/cleanup', title: '' }) === 'refactor');

console.log('\n--- detectTaskType: title prefix ---');
check('feat: title', detectTaskType({ headRefName: 'my-branch', title: 'feat: add user auth' }) === 'feature');
check('feat(scope): title', detectTaskType({ headRefName: 'my-branch', title: 'feat(auth): add login' }) === 'feature');
check('fix: title', detectTaskType({ headRefName: 'my-branch', title: 'fix: resolve token bug' }) === 'bugfix');
check('fix(scope): title', detectTaskType({ headRefName: 'my-branch', title: 'fix(api): null check' }) === 'bugfix');
check('refactor: title', detectTaskType({ headRefName: 'my-branch', title: 'refactor: split auth module' }) === 'refactor');
check('refactor(scope): title', detectTaskType({ headRefName: 'my-branch', title: 'refactor(db): normalize' }) === 'refactor');

console.log('\n--- detectTaskType: title keywords ---');
check('keyword: add', detectTaskType({ headRefName: 'my-branch', title: 'Add new dashboard page' }) === 'feature');
check('keyword: implement', detectTaskType({ headRefName: 'my-branch', title: 'Implement search feature' }) === 'feature');
check('keyword: fix', detectTaskType({ headRefName: 'my-branch', title: 'Fix broken pagination' }) === 'bugfix');
check('keyword: resolve', detectTaskType({ headRefName: 'my-branch', title: 'Resolve memory leak' }) === 'bugfix');
check('keyword: refactor', detectTaskType({ headRefName: 'my-branch', title: 'Refactor database layer' }) === 'refactor');
check('keyword: restructure', detectTaskType({ headRefName: 'my-branch', title: 'Restructure API routes' }) === 'refactor');

console.log('\n--- detectTaskType: branch takes priority over title ---');
check('branch wins over title', detectTaskType({ headRefName: 'fix/something', title: 'feat: add thing' }) === 'bugfix');

console.log('\n--- detectTaskType: defaults to feature ---');
check('no match defaults to feature', detectTaskType({ headRefName: 'my-branch', title: 'Update readme' }) === 'feature');
check('empty inputs default to feature', detectTaskType({ headRefName: '', title: '' }) === 'feature');

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node lib/test-profiles.js`
Expected: FAIL — `Cannot find module './profiles'`

- [ ] **Step 3: Commit test file**

```bash
git add lib/test-profiles.js
git commit -m "test: add detectTaskType tests for profile module"
```

---

### Task 2: detectTaskType — Implementation

**Files:**
- Create: `lib/profiles.js`

- [ ] **Step 1: Implement detectTaskType**

```js
'use strict';

const fs = require('fs');
const path = require('path');
const { parseFrontmatter, extractBody } = require('./frontmatter');

// ── Task Type Detection ─────────────────────────────────────

const BRANCH_PATTERNS = [
  { pattern: /^(?:feat|feature)\//, type: 'feature' },
  { pattern: /^(?:fix|bugfix|hotfix)\//, type: 'bugfix' },
  { pattern: /^(?:refactor|refact)\//, type: 'refactor' },
];

const TITLE_PREFIX_PATTERNS = [
  { pattern: /^feat(?:\(.*?\))?:/, type: 'feature' },
  { pattern: /^fix(?:\(.*?\))?:/, type: 'bugfix' },
  { pattern: /^refactor(?:\(.*?\))?:/, type: 'refactor' },
];

const TITLE_KEYWORDS = [
  { pattern: /\b(?:add|implement|new|create)\b/i, type: 'feature' },
  { pattern: /\b(?:fix|resolve|bug|patch)\b/i, type: 'bugfix' },
  { pattern: /\b(?:refactor|restructure|reorganize|clean\s*up)\b/i, type: 'refactor' },
];

function detectTaskType(prMetadata) {
  const branch = (prMetadata.headRefName || '').trim();
  const title = (prMetadata.title || '').trim();

  // 1. Branch prefix (strongest signal)
  for (const { pattern, type } of BRANCH_PATTERNS) {
    if (pattern.test(branch)) return type;
  }

  // 2. PR title prefix (conventional commits)
  for (const { pattern, type } of TITLE_PREFIX_PATTERNS) {
    if (pattern.test(title)) return type;
  }

  // 3. PR title keywords (fallback)
  for (const { pattern, type } of TITLE_KEYWORDS) {
    if (pattern.test(title)) return type;
  }

  // 4. Default to feature (broadest criteria set)
  return 'feature';
}

module.exports = { detectTaskType };
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `node lib/test-profiles.js`
Expected: All PASS

- [ ] **Step 3: Run full test suite to check for regressions**

Run: `node test.js`
Expected: All existing tests pass

- [ ] **Step 4: Commit**

```bash
git add lib/profiles.js
git commit -m "feat: add detectTaskType to profiles module"
```

---

### Task 3: loadProfiles and validateProfile — Tests

**Files:**
- Modify: `lib/test-profiles.js`

- [ ] **Step 1: Add loadProfiles and validateProfile tests**

Append to `lib/test-profiles.js`, before the summary/exit lines:

```js
const { loadProfiles, validateProfile } = require('./profiles');
const os = require('os');

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-test-')); }
function rmrf(d) { fs.rmSync(d, { recursive: true, force: true }); }

// ── validateProfile ─────────────────────────────────────────

console.log('\n--- validateProfile ---');
{
  const valid = {
    name: 'frontend',
    description: 'FE projects',
    'detect-files': ['package.json', 'tsconfig.json'],
    'criteria-feature': ['all-tests-pass'],
    'criteria-bugfix': ['all-tests-pass'],
    'criteria-refactor': ['all-tests-pass'],
  };
  let threw = false;
  try { validateProfile(valid); } catch { threw = true; }
  check('valid profile passes', !threw);
}
{
  let threw = false;
  try { validateProfile({ description: 'no name' }); } catch { threw = true; }
  check('missing name rejects', threw);
}
{
  let threw = false;
  try { validateProfile({ name: 'x', description: 'x', 'detect-files': ['a'] }); } catch { threw = true; }
  check('missing criteria-feature rejects', threw);
}
{
  let threw = false;
  try { validateProfile({ name: 'x', description: 'x', 'detect-files': 'not-array', 'criteria-feature': ['a'], 'criteria-bugfix': ['a'], 'criteria-refactor': ['a'] }); } catch { threw = true; }
  check('non-array detect-files rejects', threw);
}

// ── loadProfiles ────────────────────────────────────────────

console.log('\n--- loadProfiles ---');
{
  const reg = tmpDir();
  fs.mkdirSync(path.join(reg, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(reg, 'profiles', 'frontend.md'),
    '---\nname: frontend\ndescription: FE\ndetect-files: [package.json, tsconfig.json]\ndetect-priority: 10\n' +
    'criteria-feature: [all-tests-pass, has-test-coverage]\n' +
    'criteria-bugfix: [all-tests-pass, has-regression-test]\n' +
    'criteria-refactor: [all-tests-pass, no-behavior-change]\n' +
    '---\n\n## Frontend Profile\n');
  fs.writeFileSync(path.join(reg, 'profiles', 'backend.md'),
    '---\nname: backend\ndescription: BE\ndetect-files: [requirements.txt]\ndetect-priority: 10\n' +
    'criteria-feature: [all-tests-pass, no-breaking-api-change]\n' +
    'criteria-bugfix: [all-tests-pass, has-regression-test]\n' +
    'criteria-refactor: [all-tests-pass, no-behavior-change]\n' +
    '---\n\n## Backend Profile\n');

  const profiles = loadProfiles(reg);
  check('loads 2 profiles', profiles.length === 2);
  const fe = profiles.find(p => p.name === 'frontend');
  check('frontend profile found', !!fe);
  check('detect.files parsed', fe && Array.isArray(fe.detect.files) && fe.detect.files.length === 2);
  check('detect.files[0] is package.json', fe && fe.detect.files[0] === 'package.json');
  check('detect.priority parsed', fe && fe.detect.priority === 10);
  check('criteria.feature parsed', fe && Array.isArray(fe.criteria.feature) && fe.criteria.feature.length === 2);
  check('criteria.bugfix parsed', fe && Array.isArray(fe.criteria.bugfix));
  check('criteria.refactor parsed', fe && Array.isArray(fe.criteria.refactor));
  check('body extracted', fe && fe.body.includes('## Frontend Profile'));
  rmrf(reg);
}
{
  const reg = tmpDir();
  // No profiles directory
  const profiles = loadProfiles(reg);
  check('no profiles dir returns empty', profiles.length === 0);
  rmrf(reg);
}
{
  const reg = tmpDir();
  fs.mkdirSync(path.join(reg, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(reg, 'profiles', 'bad.md'), '---\nname: bad\n---\n');
  let threw = false;
  try { loadProfiles(reg); } catch { threw = true; }
  check('invalid profile rejects on load', threw);
  rmrf(reg);
}
```

Also add `const fs = require('fs');`, `const path = require('path');`, and `const os = require('os');` to the top of the file (after the existing `'use strict'`).

- [ ] **Step 2: Run test to verify new tests fail**

Run: `node lib/test-profiles.js`
Expected: FAIL — `validateProfile is not a function` / `loadProfiles is not a function`

- [ ] **Step 3: Commit test additions**

```bash
git add lib/test-profiles.js
git commit -m "test: add loadProfiles and validateProfile tests"
```

---

### Task 4: loadProfiles and validateProfile — Implementation

**Files:**
- Modify: `lib/profiles.js`

- [ ] **Step 1: Add validateProfile and loadProfiles to profiles.js**

Add before the `module.exports` line:

```js
// ── Profile Loading ─────────────────────────────────────────

function validateProfile(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Profile has no frontmatter');
  }
  if (!data.name) {
    throw new Error('Profile missing required field: name');
  }
  if (!data.description) {
    throw new Error(`Profile "${data.name}" missing required field: description`);
  }
  const detectFiles = data['detect-files'];
  if (!Array.isArray(detectFiles) || detectFiles.length === 0) {
    throw new Error(`Profile "${data.name}" requires detect-files as a non-empty array`);
  }
  for (const taskType of ['feature', 'bugfix', 'refactor']) {
    const key = `criteria-${taskType}`;
    if (!Array.isArray(data[key])) {
      throw new Error(`Profile "${data.name}" requires ${key} as an array`);
    }
  }
}

function restructureProfile(fm, body) {
  const detectFiles = fm['detect-files'] || [];
  const detectPriority = parseInt(fm['detect-priority'] || '0', 10);
  const criteria = {};
  for (const key of Object.keys(fm)) {
    if (key.startsWith('criteria-')) {
      const taskType = key.slice('criteria-'.length);
      criteria[taskType] = fm[key];
    }
  }
  return {
    name: fm.name,
    description: fm.description,
    detect: { files: detectFiles, priority: detectPriority },
    criteria,
    body: body || '',
  };
}

function loadProfiles(registryDir) {
  const profilesDir = path.join(registryDir, 'profiles');
  if (!fs.existsSync(profilesDir)) return [];

  const files = fs.readdirSync(profilesDir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith('.md'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const profiles = [];
  for (const file of files) {
    const filePath = path.join(profilesDir, file.name);
    const content = fs.readFileSync(filePath, 'utf8');
    const fm = parseFrontmatter(content);
    validateProfile(fm);
    const body = extractBody(content);
    profiles.push(restructureProfile(fm, body));
  }
  return profiles;
}
```

- [ ] **Step 2: Update module.exports**

```js
module.exports = { detectTaskType, validateProfile, loadProfiles };
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `node lib/test-profiles.js`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add lib/profiles.js
git commit -m "feat: add loadProfiles and validateProfile to profiles module"
```

---

### Task 5: detectProfile — Tests and Implementation

**Files:**
- Modify: `lib/test-profiles.js`
- Modify: `lib/profiles.js`

- [ ] **Step 1: Add detectProfile tests**

Append to `lib/test-profiles.js`, before the summary/exit lines:

```js
const { detectProfile } = require('./profiles');

// ── detectProfile ───────────────────────────────────────────

console.log('\n--- detectProfile ---');
{
  const reg = tmpDir();
  const repo = tmpDir();
  fs.mkdirSync(path.join(reg, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(reg, 'profiles', 'frontend.md'),
    '---\nname: frontend\ndescription: FE\ndetect-files: [package.json, tsconfig.json]\ndetect-priority: 10\n' +
    'criteria-feature: [a]\ncriteria-bugfix: [b]\ncriteria-refactor: [c]\n---\n');
  fs.writeFileSync(path.join(reg, 'profiles', 'backend.md'),
    '---\nname: backend\ndescription: BE\ndetect-files: [requirements.txt]\ndetect-priority: 10\n' +
    'criteria-feature: [d]\ncriteria-bugfix: [e]\ncriteria-refactor: [f]\n---\n');

  // Backend repo: has requirements.txt only
  fs.writeFileSync(path.join(repo, 'requirements.txt'), '');
  let result = detectProfile(reg, repo);
  check('detects backend profile', result && result.name === 'backend');

  // Frontend repo: has both package.json and tsconfig.json
  fs.writeFileSync(path.join(repo, 'package.json'), '{}');
  fs.writeFileSync(path.join(repo, 'tsconfig.json'), '{}');
  fs.unlinkSync(path.join(repo, 'requirements.txt'));
  result = detectProfile(reg, repo);
  check('detects frontend profile', result && result.name === 'frontend');

  // No match: empty repo
  const empty = tmpDir();
  result = detectProfile(reg, empty);
  check('no match returns null', result === null);

  // Priority: both match, higher priority wins
  fs.writeFileSync(path.join(repo, 'requirements.txt'), '');
  // Now repo has package.json + tsconfig.json + requirements.txt — both profiles match
  // Both have priority 10, frontend sorts first alphabetically but backend matches too
  // We need a deterministic tiebreaker — test with explicit priority difference
  fs.writeFileSync(path.join(reg, 'profiles', 'backend.md'),
    '---\nname: backend\ndescription: BE\ndetect-files: [requirements.txt]\ndetect-priority: 20\n' +
    'criteria-feature: [d]\ncriteria-bugfix: [e]\ncriteria-refactor: [f]\n---\n');
  result = detectProfile(reg, repo);
  check('higher priority wins', result && result.name === 'backend');

  rmrf(reg); rmrf(repo); rmrf(empty);
}
```

- [ ] **Step 2: Run test to verify new tests fail**

Run: `node lib/test-profiles.js`
Expected: FAIL — `detectProfile is not a function`

- [ ] **Step 3: Implement detectProfile in profiles.js**

Add before `module.exports`:

```js
function detectProfile(registryDir, repoDir) {
  const profiles = loadProfiles(registryDir);
  const matches = [];

  for (const profile of profiles) {
    const allFilesExist = profile.detect.files.every(
      f => fs.existsSync(path.join(repoDir, f))
    );
    if (allFilesExist) {
      matches.push(profile);
    }
  }

  if (matches.length === 0) return null;

  // Highest priority wins; ties broken alphabetically by name
  matches.sort((a, b) => {
    if (b.detect.priority !== a.detect.priority) {
      return b.detect.priority - a.detect.priority;
    }
    return a.name.localeCompare(b.name);
  });

  return matches[0];
}
```

- [ ] **Step 4: Update module.exports**

```js
module.exports = { detectTaskType, validateProfile, loadProfiles, detectProfile };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node lib/test-profiles.js`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add lib/profiles.js lib/test-profiles.js
git commit -m "feat: add detectProfile with file-based repo detection"
```

---

### Task 6: resolveCriteria — Tests and Implementation

**Files:**
- Modify: `lib/test-profiles.js`
- Modify: `lib/profiles.js`

- [ ] **Step 1: Add resolveCriteria tests**

Append to `lib/test-profiles.js`, before the summary/exit lines:

```js
const { resolveCriteria } = require('./profiles');

// ── resolveCriteria ─────────────────────────────────────────

console.log('\n--- resolveCriteria ---');
{
  const reg = tmpDir();
  fs.mkdirSync(path.join(reg, 'criteria'), { recursive: true });
  fs.writeFileSync(path.join(reg, 'criteria', 'all-tests-pass.md'),
    '---\nname: all-tests-pass\ndescription: Tests pass\ngate: true\nmetric: test_pass_rate\npass_when: "all pass"\n---\n\n## All Tests Pass\n\nBody.\n');
  fs.writeFileSync(path.join(reg, 'criteria', 'has-regression-test.md'),
    '---\nname: has-regression-test\ndescription: Regression test\ngate: true\nmetric: regression_test_present\npass_when: "present"\n---\n\n## Has Regression Test\n\nBody.\n');
  fs.writeFileSync(path.join(reg, 'criteria', 'no-lint.md'),
    '---\nname: no-lint\ndescription: No lint\ngate: false\nmetric: lint_count\npass_when: "equals 0"\n---\n\n## No Lint\n\nBody.\n');

  const profile = {
    name: 'backend',
    detect: { files: ['requirements.txt'], priority: 10 },
    criteria: {
      feature: ['all-tests-pass', 'no-lint'],
      bugfix: ['all-tests-pass', 'has-regression-test'],
      refactor: ['all-tests-pass'],
    },
  };

  // Basic resolution: profile + task type
  const result = resolveCriteria(reg, profile, 'bugfix', null);
  check('resolves 2 criteria for bugfix', result.length === 2);
  check('first is all-tests-pass', result[0].name === 'all-tests-pass');
  check('second is has-regression-test', result[1].name === 'has-regression-test');
  check('includes gate field', result[0].gate === true);
  check('includes content', result[0].content.includes('## All Tests Pass'));

  // Unknown task type falls back to feature
  const fallback = resolveCriteria(reg, profile, 'chore', null);
  check('unknown task type falls back to feature', fallback.length === 2);
  check('fallback includes no-lint', fallback.some(c => c.name === 'no-lint'));

  // No profile returns null
  const noProfile = resolveCriteria(reg, null, 'bugfix', null);
  check('null profile returns null', noProfile === null);

  // Override: add
  const added = resolveCriteria(reg, profile, 'refactor', '+has-regression-test');
  check('override + adds criteria', added.length === 2);
  check('added criteria present', added.some(c => c.name === 'has-regression-test'));

  // Override: remove
  const removed = resolveCriteria(reg, profile, 'bugfix', '-has-regression-test');
  check('override - removes criteria', removed.length === 1);
  check('removed criteria absent', !removed.some(c => c.name === 'has-regression-test'));

  // Override: replace
  const replaced = resolveCriteria(reg, profile, 'bugfix', 'no-lint');
  check('override replace replaces list', replaced.length === 1);
  check('replaced list correct', replaced[0].name === 'no-lint');

  rmrf(reg);
}
```

- [ ] **Step 2: Run test to verify new tests fail**

Run: `node lib/test-profiles.js`
Expected: FAIL — `resolveCriteria is not a function`

- [ ] **Step 3: Implement resolveCriteria in profiles.js**

Add before `module.exports`:

```js
// ── Criteria Resolution ─────────────────────────────────────

function resolveCriteria(registryDir, profile, taskType, overrides) {
  if (!profile) return null;

  // Look up criteria list from profile, fall back to 'feature' if task type unknown
  let criteriaNames = profile.criteria[taskType];
  if (!criteriaNames) {
    criteriaNames = profile.criteria['feature'] || [];
  }
  criteriaNames = [...criteriaNames]; // clone

  // Apply overrides
  if (overrides && typeof overrides === 'string') {
    const trimmed = overrides.trim();
    if (trimmed.startsWith('+')) {
      // Add mode: +name1,+name2 or +name
      const toAdd = trimmed.split(',').map(s => s.trim().replace(/^\+/, ''));
      for (const name of toAdd) {
        if (!criteriaNames.includes(name)) {
          criteriaNames.push(name);
        }
      }
    } else if (trimmed.startsWith('-')) {
      // Remove mode: -name1,-name2 or -name
      const toRemove = trimmed.split(',').map(s => s.trim().replace(/^-/, ''));
      criteriaNames = criteriaNames.filter(n => !toRemove.includes(n));
    } else {
      // Replace mode: name1,name2
      criteriaNames = trimmed.split(',').map(s => s.trim());
    }
  }

  // Read each criteria file
  const criteriaDir = path.join(registryDir, 'criteria');
  const results = [];
  for (const name of criteriaNames) {
    const filePath = path.join(criteriaDir, `${name}.md`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Criteria not found: ${name} (expected at criteria/${name}.md)`);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const fm = parseFrontmatter(content);
    const body = extractBody(content);
    results.push({
      name,
      gate: fm.gate === 'true' || fm.gate === true,
      content: body,
    });
  }

  return results;
}
```

- [ ] **Step 4: Update module.exports**

```js
module.exports = { detectTaskType, validateProfile, loadProfiles, detectProfile, resolveCriteria };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node lib/test-profiles.js`
Expected: All PASS

- [ ] **Step 6: Run full test suite**

Run: `node test.js`
Expected: All existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add lib/profiles.js lib/test-profiles.js
git commit -m "feat: add resolveCriteria with override support"
```

---

### Task 7: New criteria files

**Files:**
- Create: `criteria/has-regression-test.md`
- Create: `criteria/has-test-coverage.md`
- Create: `criteria/no-behavior-change.md`
- Create: `criteria/no-accessibility-regression.md`
- Create: `criteria/figma-design-match.md`
- Create: `criteria/no-breaking-api-change.md`
- Create: `criteria/has-migration-safety.md`

- [ ] **Step 1: Create has-regression-test.md**

```markdown
---
name: has-regression-test
description: Bugfix PRs must include a test that reproduces the fixed bug
gate: true
metric: regression_test_present
pass_when: "at least one new test targets the fixed behavior"
---

## Has Regression Test

Bugfix PRs must include at least one new test that would have caught the bug before the fix.

### Pass
A new or modified test exists that directly exercises the behavior that was broken. The test name or assertions clearly relate to the fix.

### Fail
No new test targets the fixed behavior. Report what test is expected and where it should go.

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "has-regression-test", "gate": true, "pass": <bool>, "metric": "regression_test_present", "value": "<yes|no>", "detail": "<summary>"}
```
```

- [ ] **Step 2: Create has-test-coverage.md**

```markdown
---
name: has-test-coverage
description: New feature code has corresponding test coverage
gate: true
metric: new_code_test_coverage
pass_when: "all new public functions/endpoints have at least one test"
---

## Has Test Coverage

Feature PRs must have test coverage for new public functions, endpoints, or components.

### Pass
Every new public function, API endpoint, or component has at least one corresponding test.

### Fail
One or more new public interfaces lack tests. Report each untested function/endpoint with file and line.

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "has-test-coverage", "gate": true, "pass": <bool>, "metric": "new_code_test_coverage", "value": "<covered>/<total>", "detail": "<summary>"}
```
```

- [ ] **Step 3: Create no-behavior-change.md**

```markdown
---
name: no-behavior-change
description: Refactor PRs must not change observable behavior
gate: true
metric: behavior_change_detected
pass_when: "no changes to public API signatures, no new/removed exports, no changed test assertions"
---

## No Behavior Change

Refactor PRs must not change observable behavior. The code may be restructured but external contracts must remain identical.

### Pass
No changes to public API signatures, no new or removed exports, no changed test assertions, no altered return values.

### Fail
Observable behavior changed. Report each change with file, line, and what differs.

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "no-behavior-change", "gate": true, "pass": <bool>, "metric": "behavior_change_detected", "value": <number>, "detail": "<summary>"}
```
```

- [ ] **Step 4: Create no-accessibility-regression.md**

```markdown
---
name: no-accessibility-regression
description: UI changes maintain accessibility standards
gate: true
metric: a11y_issue_count
pass_when: "no new accessibility violations in changed components"
---

## No Accessibility Regression

UI changes must maintain accessibility standards. Check all changed components for violations.

### Checks
- Missing `alt` text on images
- Missing `aria-label` or `aria-labelledby` on interactive elements
- Missing form `<label>` associations
- Broken ARIA roles or attributes
- Missing keyboard event handlers on clickable non-button elements
- Inadequate color contrast (if determinable from code)

### Pass
No new accessibility violations found in changed components.

### Fail
One or more accessibility violations found. Report each with component, element, and violation type.

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "no-accessibility-regression", "gate": true, "pass": <bool>, "metric": "a11y_issue_count", "value": <number>, "detail": "<summary>"}
```
```

- [ ] **Step 5: Create figma-design-match.md**

```markdown
---
name: figma-design-match
description: UI implementation matches the linked Figma design
gate: true
metric: design_deviation_count
pass_when: "no significant visual deviations from Figma design"
---

## Figma Design Match

UI implementation must match the linked Figma design specification.

### Prerequisites
- Figma MCP server must be available in the session
- Playwright MCP server must be available for capturing screenshots
- If either is missing, report `pass: false` with detail: "Required MCP server not available"

### Evaluation Workflow
1. Extract Figma URL from PR description body. If none found, report `pass: true` with detail: "No Figma design reference linked in PR description"
2. Use Figma MCP `get_design_context` and `get_screenshot` to obtain the design reference
3. Use Playwright MCP to start the dev server and capture screenshots of the affected pages
4. Compare the implementation against the design for:
   - **Layout**: element positioning, spacing, alignment
   - **Colors**: fill, border, text colors match design tokens
   - **Typography**: font family, size, weight, line-height
   - **Components**: correct design system components used
   - **Responsive**: if design shows multiple breakpoints, check each

### Pass
No significant visual deviations between Figma design and implementation.

### Fail
One or more deviations found. Report each with: what differs, expected value (from Figma), actual value (from screenshot).

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "figma-design-match", "gate": true, "pass": <bool>, "metric": "design_deviation_count", "value": <number>, "detail": "<summary>"}
```
```

- [ ] **Step 6: Create no-breaking-api-change.md**

```markdown
---
name: no-breaking-api-change
description: API endpoints are not broken by changes
gate: true
metric: breaking_api_change_count
pass_when: "no removed endpoints, no changed response shapes without versioning, no removed required fields"
---

## No Breaking API Change

API changes must not break existing consumers.

### Breaking Changes
- Removed endpoints or routes
- Changed response shape (removed fields, changed types) without API versioning
- Removed or renamed required request parameters
- Changed authentication/authorization requirements
- Changed HTTP methods for existing endpoints

### Non-Breaking Changes (allowed)
- Adding new optional fields to responses
- Adding new endpoints
- Adding new optional request parameters
- Deprecation notices (without removal)

### Pass
No breaking API changes detected.

### Fail
One or more breaking changes found. Report each with endpoint, change type, and impact.

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "no-breaking-api-change", "gate": true, "pass": <bool>, "metric": "breaking_api_change_count", "value": <number>, "detail": "<summary>"}
```
```

- [ ] **Step 7: Create has-migration-safety.md**

```markdown
---
name: has-migration-safety
description: Database migrations are safe for zero-downtime deployment
gate: true
metric: migration_safety
pass_when: "no destructive operations without multi-step plan, no locks on large tables"
---

## Has Migration Safety

Database migrations must be safe for zero-downtime deployment.

### Unsafe Patterns
- `DROP TABLE` or `DROP COLUMN` without a multi-step migration plan
- Adding `NOT NULL` column without a default value
- Renaming columns or tables (breaks running code during deploy)
- Long-running locks on large tables (adding indexes without `CONCURRENTLY`)
- Data migrations mixed with schema migrations in a single file

### Safe Patterns
- Adding nullable columns
- Adding indexes with `CONCURRENTLY` (PostgreSQL) or equivalent
- Multi-step migrations: add column → backfill → add constraint
- Separate data migration files from schema migration files

### Pass
All migrations follow safe patterns, or no migration files are present.

### Fail
One or more unsafe migration patterns detected. Report each with file, line, and recommended safe alternative.

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "has-migration-safety", "gate": true, "pass": <bool>, "metric": "migration_safety", "value": "<safe|unsafe>", "detail": "<summary>"}
```
```

- [ ] **Step 8: Verify all criteria parse correctly**

Run: `node -e "const fm = require('./lib/frontmatter'); const fs = require('fs'); const files = fs.readdirSync('criteria').filter(f => f.endsWith('.md')); for (const f of files) { const d = fm.parseFrontmatter(fs.readFileSync('criteria/' + f, 'utf8')); console.log(d.name, d.gate ? '[gate]' : '[advisory]'); }"`

Expected: All 10 criteria listed with correct gate/advisory tags

- [ ] **Step 9: Commit**

```bash
git add criteria/has-regression-test.md criteria/has-test-coverage.md criteria/no-behavior-change.md criteria/no-accessibility-regression.md criteria/figma-design-match.md criteria/no-breaking-api-change.md criteria/has-migration-safety.md
git commit -m "feat: add 7 new criteria for task-aware review profiles"
```

---

### Task 8: Profile definition files

**Files:**
- Create: `profiles/frontend.md`
- Create: `profiles/backend.md`

- [ ] **Step 1: Create profiles directory and frontend.md**

```markdown
---
name: frontend
description: React/TypeScript frontend projects
detect-files: [package.json, tsconfig.json]
detect-priority: 10
criteria-feature: [all-tests-pass, no-new-lint-warnings, has-test-coverage, no-accessibility-regression, figma-design-match]
criteria-bugfix: [all-tests-pass, has-regression-test, zero-must-fix-issues]
criteria-refactor: [all-tests-pass, no-behavior-change, no-new-lint-warnings]
---

## Frontend Profile

This profile targets React + TypeScript frontend projects.

### Detection
Matches repos containing both `package.json` and `tsconfig.json` at the root.

### Conventions
- Components should follow existing patterns in the codebase
- Prefer composition over inheritance
- Accessibility is a gate for new UI features
- Figma design fidelity is enforced on feature PRs when a Figma URL is linked
```

- [ ] **Step 2: Create backend.md**

```markdown
---
name: backend
description: Python backend projects
detect-files: [requirements.txt]
detect-priority: 10
criteria-feature: [all-tests-pass, no-new-lint-warnings, has-test-coverage, no-breaking-api-change, has-migration-safety]
criteria-bugfix: [all-tests-pass, has-regression-test, zero-must-fix-issues, no-breaking-api-change]
criteria-refactor: [all-tests-pass, no-behavior-change, no-new-lint-warnings]
---

## Backend Profile

This profile targets Python backend projects.

### Detection
Matches repos containing `requirements.txt` at the root.

### Conventions
- API changes must maintain backward compatibility
- Database migrations must be safe for zero-downtime deployment
- All new endpoints require test coverage
```

- [ ] **Step 3: Verify profiles load correctly**

Run: `node -e "const p = require('./lib/profiles'); const profiles = p.loadProfiles('.'); for (const pr of profiles) { console.log(pr.name, 'detect:', pr.detect.files.join('+'), 'feature:', pr.criteria.feature.length, 'bugfix:', pr.criteria.bugfix.length, 'refactor:', pr.criteria.refactor.length); }"`

Expected: Both profiles listed with correct criteria counts (frontend: 5/3/3, backend: 5/4/3)

- [ ] **Step 4: Commit**

```bash
git add profiles/frontend.md profiles/backend.md
git commit -m "feat: add frontend and backend profile definitions"
```

---

### Task 9: Discovery module — Profile listing

**Files:**
- Modify: `lib/discovery.js`
- Modify: `test.js`

- [ ] **Step 1: Add listProfiles function to discovery.js**

After the `listCriteria` function, add:

```js
function listProfiles(registryDir) {
  const profilesDir = path.join(registryDir, 'profiles');
  if (!fs.existsSync(profilesDir)) return [];
  return fs.readdirSync(profilesDir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith('.md'))
    .map(d => d.name.replace(/\.md$/, ''))
    .sort();
}
```

- [ ] **Step 2: Add Profiles section to showList()**

In `showList()`, after the criteria section (after the `if (criteria.length > 0)` block's closing brace), add:

```js
  const profiles = listProfiles(registryDir);
  if (profiles.length > 0) {
    console.log('');
    console.log(color.bold('Profiles:'));
    for (const name of profiles) {
      const filePath = path.join(registryDir, 'profiles', `${name}.md`);
      const content = fs.readFileSync(filePath, 'utf8');
      const pfm = parseFrontmatter(content);
      const desc = (pfm && pfm.description) || '';
      const detectFiles = pfm && pfm['detect-files'];
      const detectInfo = Array.isArray(detectFiles) ? ` [${detectFiles.join(' + ')}]` : '';
      console.log(`  ${color.green(name)}${detectInfo}${desc ? ' — ' + desc : ''}`);
    }
  }
```

- [ ] **Step 3: Export listProfiles**

Update the `module.exports` line to include `listProfiles`:

```js
module.exports = { listAgents, listSkills, listBehaviors, listCriteria, listProfiles, showList, showStatus, isAgentInstalled, isSkillInstalled };
```

- [ ] **Step 4: Add integration test to test.js**

Add a new test section to `test.js`, before the `// ── Summary` section:

```js
// ── List Shows Profiles ───────────────────────────────────

console.log('\n--- List Shows Profiles ---');
{
  const reg = tmpDir();
  fs.mkdirSync(path.join(reg, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(reg, 'profiles', 'frontend.md'),
    '---\nname: frontend\ndescription: React/TS frontend\ndetect-files: [package.json, tsconfig.json]\ndetect-priority: 10\n' +
    'criteria-feature: [a]\ncriteria-bugfix: [b]\ncriteria-refactor: [c]\n---\n');
  fs.mkdirSync(path.join(reg, 'agents'), { recursive: true });
  copyLib(reg);
  let out = '';
  try {
    out = execFileSync(process.execPath, [path.join(reg, 'bin', 'cli.js'), 'list'], {
      cwd: reg, encoding: 'utf8', timeout: 30000
    });
  } catch (e) { out = (e.stdout || '').toString(); }
  check('list shows profiles section', /profiles/i.test(out));
  check('list shows frontend profile', out.includes('frontend'));
  check('list shows detect files', out.includes('package.json'));
  check('list shows profile description', out.includes('React/TS frontend'));
  rmrf(reg);
}
```

- [ ] **Step 5: Run tests**

Run: `node test.js`
Expected: All tests pass including the new profile listing test

- [ ] **Step 6: Commit**

```bash
git add lib/discovery.js test.js
git commit -m "feat: add profile listing to discovery module and list command"
```

---

### Task 10: Wire test-profiles.js into main test runner

**Files:**
- Modify: `test.js`

- [ ] **Step 1: Add profile module test execution to test.js**

In `test.js`, after the frontmatter parser test block (around line 60), add:

```js
// ── Profile Module ──────────────────────────────────────────

console.log('\n--- Profile Module ---');
try {
  execFileSync(process.execPath, [path.join(REGISTRY_DIR, 'lib', 'test-profiles.js')], {
    cwd: REGISTRY_DIR, encoding: 'utf8', timeout: 30000
  });
  check('profile module tests all pass', true);
} catch (e) {
  check('profile module tests all pass', false, (e.stdout || '').toString().split('\n').pop());
}
```

- [ ] **Step 2: Run full test suite**

Run: `node test.js`
Expected: All tests pass, profile module tests included in output

- [ ] **Step 3: Commit**

```bash
git add test.js
git commit -m "test: wire profile module tests into main test runner"
```

---

### Task 11: Update pr-orchestrator agent

**Files:**
- Modify: `agents/pr-orchestrator/agent.md`
- Modify: `agents/pr-orchestrator/ref/workflow.md`

- [ ] **Step 1: Update pr-orchestrator agent.md**

Add the following new section after `## Input Parsing` and before `## Workflow`:

```markdown
## Profile and Task Type Detection

Before resolving criteria, detect the repo profile and task type:

### Task Type Detection

Detect from PR metadata (first match wins):

1. **Branch prefix**: `feat/`→feature, `fix/`/`bugfix/`/`hotfix/`→bugfix, `refactor/`→refactor
2. **PR title prefix**: `feat:`→feature, `fix:`→bugfix, `refactor:`→refactor
3. **Title keywords**: "add/implement/new/create"→feature, "fix/resolve/bug/patch"→bugfix, "refactor/restructure"→refactor
4. **Default**: feature (broadest criteria set)

### Repo Profile Detection

Read profile definitions from `{registry_root}/profiles/*.md`. Each profile has `detect-files` listing files that must exist in the repo root. Check which profile's files all exist in the current repo. If multiple match, highest `detect-priority` wins.

### Criteria Resolution

Replace the current criteria resolution (Step 3 in Workflow) with:

1. If a profile matched AND the detected task type exists in the profile's criteria map → use `profile.criteria[taskType]`
2. If a profile matched but task type is unknown → use `profile.criteria["feature"]` (broadest)
3. If no profile matched → fall back to the reviewer's frontmatter `criteria:` list (current behavior)
4. Apply any `--criteria` overrides on top of the resolved list

When dispatching the reviewer, include task type and profile context:

```
## Context
Task type: <detected_type> (detected from: <source>)
Profile: <profile_name> (detected from: <matched_files>)
```
```

- [ ] **Step 2: Update the Input Parsing section to include profile/tasktype in output description**

In the `## Input Parsing` section, after the `--criteria` override line, add:

```markdown
- **Task type**: Automatically detected from PR branch name and title (no flag needed)
- **Profile**: Automatically detected from repo files (no flag needed)
```

- [ ] **Step 3: Update Step 7 (Post Final Summary) in agent.md**

In the summary section, update the "Include:" list to add:

```markdown
- Detected profile and task type (with detection source)
```

- [ ] **Step 4: Update ref/workflow.md diagram**

Replace the workflow diagram in `ref/workflow.md` with:

```
User: /pr-orchestrator <PR> [--verify]
         |
         v
  ORCHESTRATOR (Opus)
  1. gh auth status
  2. gh pr view <PR>
  3. Detect task type (branch/title)
  4. Detect repo profile (file detection)
  5. Resolve criteria (profile + task type + overrides)
         |
         v
  REVIEWER (Sonnet) — Agent tool, model: "sonnet"
  - Fetch diff + context
  - Analyze code
  - Post GH comments
  - Evaluate criteria
  - Return JSON
         |
         v
  Any gate failing? --no--> Post clean summary, exit
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

- [ ] **Step 5: Commit**

```bash
git add agents/pr-orchestrator/agent.md agents/pr-orchestrator/ref/workflow.md
git commit -m "feat: update pr-orchestrator with profile and task type detection"
```

---

### Task 12: Add profiles directory to package.json files list

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Check current package.json files list**

Read `package.json` to see if it has a `files` field that needs updating.

- [ ] **Step 2: Add profiles/ to the files list if present**

If `package.json` has a `files` array, add `"profiles/"` to it alongside the existing entries.

- [ ] **Step 3: Run full test suite**

Run: `node test.js`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add profiles directory to package manifest"
```

---

### Task 13: Final integration verification

**Files:**
- No new files

- [ ] **Step 1: Run the full test suite**

Run: `node test.js`
Expected: All tests pass (existing + new profile tests + list profiles test)

- [ ] **Step 2: Verify the list command shows profiles**

Run: `node bin/cli.js list`
Expected: Output includes "Profiles:" section with frontend and backend profiles showing detect files and descriptions

- [ ] **Step 3: Verify all 10 criteria parse**

Run: `node bin/cli.js list`
Expected: Output includes "Criteria:" section with all 10 criteria, each showing [gate] or [advisory]

- [ ] **Step 4: Verify profile loading end-to-end**

Run: `node -e "const p = require('./lib/profiles'); console.log(JSON.stringify(p.loadProfiles('.'), null, 2))"`
Expected: Both profiles loaded with correct detect rules and criteria maps

- [ ] **Step 5: Verify detectTaskType edge cases**

Run: `node -e "const p = require('./lib/profiles'); console.log(p.detectTaskType({headRefName: 'feat/new-thing', title: ''})); console.log(p.detectTaskType({headRefName: 'fix/bug', title: ''})); console.log(p.detectTaskType({headRefName: 'main', title: 'Update docs'}));"`
Expected: `feature`, `bugfix`, `feature`
