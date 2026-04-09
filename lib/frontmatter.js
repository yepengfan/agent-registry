'use strict';

const fs = require('fs');

const FM_PATTERN = /^---\s*\n([\s\S]*?)\n---\s*\n/;
const REQUIRED_FIELDS = ['name', 'description', 'version', 'author'];
const VALID_TYPES = ['agent', 'orchestrator'];
const VALID_MODELS = ['opus', 'sonnet', 'haiku'];

function parseFrontmatter(content) {
  const match = content.match(FM_PATTERN);
  if (!match) return null;
  return simpleParse(match[1]);
}

function extractBody(content) {
  const match = content.match(FM_PATTERN);
  if (!match) return content;
  return content.slice(match[0].length).replace(/^\n+/, '');
}

function simpleParse(text) {
  const result = {};
  let currentKey = null;
  let currentList = null;
  let currentObject = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    const nestedKv = line.match(/^\s{2,}(\w[\w-]*):\s+(.+)$/);
    if (nestedKv && currentKey && currentObject !== null) {
      currentObject[nestedKv[1]] = nestedKv[2].trim().replace(/^["']|["']$/g, '');
      continue;
    }

    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && currentKey) {
      if (currentList === null) {
        currentList = [];
        result[currentKey] = currentList;
      }
      currentList.push(listMatch[1].trim());
      continue;
    }

    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)?$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const value = (kvMatch[2] || '').trim();
      currentList = null;
      currentObject = null;

      if (!value) {
        // Only 'interface' supports nested objects per schema spec.
        // To add another nested field, add its key to this check and
        // the nested kv regex above will parse its children.
        if (currentKey === 'interface') {
          currentObject = {};
          result[currentKey] = currentObject;
        }
        continue;
      }

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
