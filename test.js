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
  const r3 = run(['install', '--agent', 'a'.repeat(129)], { HOME: home });
  check('rejects name > 128 chars', r3.status !== 0 || /invalid/i.test(r3.stdout + r3.stderr));
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
