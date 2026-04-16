#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) { console.log('  PASS: ' + name); passed++; }
  else { console.log('  FAIL: ' + name); failed++; }
}

// ── detectTaskType ──────────────────────────────────────────

const { detectTaskType } = require('./profiles');
const { loadProfiles, validateProfile } = require('./profiles');

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-test-')); }
function rmrf(d) { fs.rmSync(d, { recursive: true, force: true }); }

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
{
  let err = null;
  try { validateProfile({ name: 'x', description: 'x', 'detect-files': ['a'], 'criteria-feature': ['../escape'], 'criteria-bugfix': ['a'], 'criteria-refactor': ['a'] }); } catch (e) { err = e; }
  check('path traversal in criteria-feature rejects', err !== null);
  check('path traversal error mentions the bad name', err && err.message.includes('../escape'));
}
{
  let threw = false;
  try { validateProfile({ name: 'x', description: 'x', 'detect-files': ['a'], 'criteria-feature': ['valid'], 'criteria-bugfix': ['../../etc/passwd'], 'criteria-refactor': ['a'] }); } catch { threw = true; }
  check('path traversal in criteria-bugfix rejects', threw);
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
  fs.writeFileSync(path.join(reg, 'profiles', 'backend.md'),
    '---\nname: backend\ndescription: BE\ndetect-files: [requirements.txt]\ndetect-priority: 20\n' +
    'criteria-feature: [d]\ncriteria-bugfix: [e]\ncriteria-refactor: [f]\n---\n');
  result = detectProfile(reg, repo);
  check('higher priority wins', result && result.name === 'backend');

  rmrf(reg); rmrf(repo); rmrf(empty);
}

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

  // Override: path traversal via + (add) mode
  {
    let err = null;
    try { resolveCriteria(reg, profile, 'feature', '+../secret'); } catch (e) { err = e; }
    check('override + path traversal is rejected', err !== null);
    check('override + error mentions the bad name', err && err.message.includes('../secret'));
  }

  // Override: path traversal via replace mode
  {
    let threw = false;
    try { resolveCriteria(reg, profile, 'feature', '../secret'); } catch { threw = true; }
    check('override replace path traversal is rejected', threw);
  }

  // Override: path traversal via - (remove) mode
  {
    let threw = false;
    try { resolveCriteria(reg, profile, 'feature', '-../secret'); } catch { threw = true; }
    check('override - path traversal is rejected', threw);
  }

  rmrf(reg);
}

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed === 0 ? 0 : 1);
