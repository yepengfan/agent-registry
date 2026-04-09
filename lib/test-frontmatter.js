#!/usr/bin/env node
'use strict';

const fm = require('./frontmatter.js');

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) { console.log('  PASS: ' + name); passed++; }
  else { console.log('  FAIL: ' + name); failed++; }
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
      '---\nname: m\ndescription: M\nversion: 1.0.0\nauthor: Me\nmodel: ' + model + '\n---\n\nBody.\n';
    const data = fm.parseFrontmatter(content);
    let threw = false;
    try { fm.validate(data); } catch (e) { threw = true; }
    check('model \'' + model + '\' is valid', !threw);
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

// ── Behaviors field tests ───────────────────────────────────

function testBehaviorsParsedBlockList() {
  console.log('\n--- testBehaviorsParsedBlockList ---');
  const content =
    '---\nname: b\ndescription: B\nversion: 1.0.0\nauthor: Me\n' +
    'behaviors:\n  - auto-fix\n  - lint-check\n---\n\nBody.\n';
  const data = fm.parseFrontmatter(content);
  let threw = false;
  try { fm.validate(data); } catch (e) { threw = true; }
  check('block list behaviors valid', !threw);
  check('behaviors parsed', deepEqual(data.behaviors, ['auto-fix', 'lint-check']));
}

function testBehaviorsParsedInlineList() {
  console.log('\n--- testBehaviorsParsedInlineList ---');
  const content =
    '---\nname: b\ndescription: B\nversion: 1.0.0\nauthor: Me\n' +
    'behaviors: [auto-fix, lint-check]\n---\n\nBody.\n';
  const data = fm.parseFrontmatter(content);
  let threw = false;
  try { fm.validate(data); } catch (e) { threw = true; }
  check('inline behaviors valid', !threw);
  check('inline behaviors parsed', deepEqual(data.behaviors, ['auto-fix', 'lint-check']));
}

function testBehaviorsEmptyListValid() {
  console.log('\n--- testBehaviorsEmptyListValid ---');
  const content =
    '---\nname: b\ndescription: B\nversion: 1.0.0\nauthor: Me\n' +
    'behaviors: []\n---\n\nBody.\n';
  const data = fm.parseFrontmatter(content);
  let threw = false;
  try { fm.validate(data); } catch (e) { threw = true; }
  check('empty behaviors list valid', !threw);
  check('empty behaviors is array', Array.isArray(data.behaviors));
  check('empty behaviors is empty', data.behaviors.length === 0);
}

function testBehaviorsOnOrchestratorValid() {
  console.log('\n--- testBehaviorsOnOrchestratorValid ---');
  const content =
    '---\nname: orch\ndescription: O\nversion: 1.0.0\nauthor: Me\n' +
    'type: orchestrator\nsubagents:\n  - sub-a\n  - sub-b\n' +
    'behaviors: [auto-fix, lint-check]\n---\n\nBody.\n';
  const data = fm.parseFrontmatter(content);
  let threw = false;
  try { fm.validate(data); } catch (e) { threw = true; }
  check('orchestrator with behaviors valid', !threw);
  check('subagents present', deepEqual(data.subagents, ['sub-a', 'sub-b']));
  check('behaviors present', deepEqual(data.behaviors, ['auto-fix', 'lint-check']));
}

function testBehaviorsInvalidNameRejected() {
  console.log('\n--- testBehaviorsInvalidNameRejected ---');
  const content =
    '---\nname: b\ndescription: B\nversion: 1.0.0\nauthor: Me\n' +
    'behaviors: [../traversal]\n---\n\nBody.\n';
  const data = fm.parseFrontmatter(content);
  let threw = false, errMsg = '';
  try { fm.validate(data); } catch (e) { threw = true; errMsg = e.message; }
  check('invalid behavior name rejected', threw);
  check('error mentions behavior name', errMsg.includes('behavior'));
}

// ── Criteria field tests ─────────────────────────────────────

function testCriteriaValidBlockList() {
  console.log('\n--- testCriteriaValidBlockList ---');
  (() => {
    const parsed = fm.parseFrontmatter('---\nname: t\ndescription: d\nversion: 1.0.0\nauthor: a\ncriteria:\n  - zero-must-fix\n  - all-tests-pass\n---\n');
    check('criteria parsed as array', Array.isArray(parsed.criteria) && parsed.criteria.length === 2);
    check('criteria first item', parsed.criteria[0] === 'zero-must-fix');
  })();
}

function testCriteriaInvalidNameRejected() {
  console.log('\n--- testCriteriaInvalidNameRejected ---');
  (() => {
    try {
      const parsed = fm.parseFrontmatter('---\nname: t\ndescription: d\nversion: 1.0.0\nauthor: a\ncriteria:\n  - ../bad\n---\n');
      fm.validate(parsed);
      check('invalid criteria name rejects', false);
    } catch (e) {
      check('invalid criteria name rejects', /invalid criteria/i.test(e.message));
    }
  })();
}

function testCriteriaNonArrayRejected() {
  console.log('\n--- testCriteriaNonArrayRejected ---');
  (() => {
    try {
      const parsed = fm.parseFrontmatter('---\nname: t\ndescription: d\nversion: 1.0.0\nauthor: a\ncriteria: not-a-list\n---\n');
      fm.validate(parsed);
      check('non-array criteria rejects', false);
    } catch (e) {
      check('non-array criteria rejects', /criteria must be a list/i.test(e.message));
    }
  })();
}

function testCriteriaInlineSyntax() {
  console.log('\n--- testCriteriaInlineSyntax ---');
  (() => {
    const parsed = fm.parseFrontmatter('---\nname: t\ndescription: d\nversion: 1.0.0\nauthor: a\ncriteria: [foo, bar]\n---\n');
    check('inline criteria parsed', Array.isArray(parsed.criteria) && parsed.criteria.length === 2);
  })();
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
testBehaviorsParsedBlockList();
testBehaviorsParsedInlineList();
testBehaviorsEmptyListValid();
testBehaviorsOnOrchestratorValid();
testBehaviorsInvalidNameRejected();
testCriteriaValidBlockList();
testCriteriaInvalidNameRejected();
testCriteriaNonArrayRejected();
testCriteriaInlineSyntax();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed === 0 ? 0 : 1);
