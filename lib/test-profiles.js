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
