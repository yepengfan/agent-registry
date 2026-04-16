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

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed === 0 ? 0 : 1);
