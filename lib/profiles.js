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
  const VALID_CRITERIA_NAME = /^[a-zA-Z0-9_-]+$/;
  for (const taskType of ['feature', 'bugfix', 'refactor']) {
    const key = `criteria-${taskType}`;
    if (!Array.isArray(data[key])) {
      throw new Error(`Profile "${data.name}" requires ${key} as an array`);
    }
    for (const name of data[key]) {
      if (!VALID_CRITERIA_NAME.test(name)) {
        throw new Error(`Profile "${data.name}" has invalid criteria name "${name}" in ${key}: only a-z, A-Z, 0-9, hyphens and underscores are allowed`);
      }
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

// ── Criteria Resolution ─────────────────────────────────────

const VALID_CRITERIA_NAME = /^[a-zA-Z0-9_-]+$/;

function resolveCriteria(registryDir, profile, taskType, overrides) {
  if (!profile) return null;

  // Look up criteria list from profile, fall back to 'feature' if task type unknown
  let criteriaNames = profile.criteria[taskType];
  if (!criteriaNames) {
    criteriaNames = profile.criteria['feature'] || [];
  }
  criteriaNames = [...criteriaNames]; // clone

  // Validate profile-sourced names before any file access
  for (const name of criteriaNames) {
    if (!VALID_CRITERIA_NAME.test(name)) {
      throw new Error(`Invalid criteria name "${name}" in profile: only a-z, A-Z, 0-9, hyphens and underscores are allowed`);
    }
  }

  // Apply overrides
  if (overrides && typeof overrides === 'string') {
    const trimmed = overrides.trim();
    if (trimmed.startsWith('+')) {
      // Add mode: +name1,+name2 or +name
      const toAdd = trimmed.split(',').map(s => s.trim().replace(/^\+/, ''));
      for (const name of toAdd) {
        if (!VALID_CRITERIA_NAME.test(name)) {
          throw new Error(`Invalid criteria name "${name}" in override: only a-z, A-Z, 0-9, hyphens and underscores are allowed`);
        }
        if (!criteriaNames.includes(name)) {
          criteriaNames.push(name);
        }
      }
    } else if (trimmed.startsWith('-')) {
      // Remove mode: -name1,-name2 or -name
      const toRemove = trimmed.split(',').map(s => s.trim().replace(/^-/, ''));
      for (const name of toRemove) {
        if (!VALID_CRITERIA_NAME.test(name)) {
          throw new Error(`Invalid criteria name "${name}" in override: only a-z, A-Z, 0-9, hyphens and underscores are allowed`);
        }
      }
      criteriaNames = criteriaNames.filter(n => !toRemove.includes(n));
    } else {
      // Replace mode: name1,name2
      const names = trimmed.split(',').map(s => s.trim());
      for (const name of names) {
        if (!VALID_CRITERIA_NAME.test(name)) {
          throw new Error(`Invalid criteria name "${name}" in override: only a-z, A-Z, 0-9, hyphens and underscores are allowed`);
        }
      }
      criteriaNames = names;
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

module.exports = { detectTaskType, validateProfile, loadProfiles, detectProfile, resolveCriteria };
