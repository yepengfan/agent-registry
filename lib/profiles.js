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

module.exports = { detectTaskType, validateProfile, loadProfiles, detectProfile };
