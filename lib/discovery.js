'use strict';

const fs = require('fs');
const path = require('path');
const { parseFrontmatter } = require('./frontmatter');

const color = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

function listAgents(registryDir) {
  const agentsDir = path.join(registryDir, 'agents');
  if (!fs.existsSync(agentsDir)) return [];
  return fs.readdirSync(agentsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .filter(d => fs.existsSync(path.join(agentsDir, d.name, 'agent.md')))
    .map(d => d.name)
    .sort();
}

function getSkillType(skillPath) {
  if (fs.existsSync(path.join(skillPath, 'commands'))) return 'commands';
  if (fs.existsSync(path.join(skillPath, 'SKILL.md'))) return 'skillmd';
  return null;
}

function listSkills(registryDir) {
  const skillsDir = path.join(registryDir, 'skills');
  if (!fs.existsSync(skillsDir)) return [];
  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .filter(d => getSkillType(path.join(skillsDir, d.name)) !== null)
    .map(d => d.name)
    .sort();
}

function listBehaviors(registryDir) {
  const behaviorsDir = path.join(registryDir, 'behaviors');
  if (!fs.existsSync(behaviorsDir)) return [];
  return fs.readdirSync(behaviorsDir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith('.md'))
    .map(d => d.name.replace(/\.md$/, ''))
    .sort();
}

function listCriteria(registryDir) {
  const criteriaDir = path.join(registryDir, 'criteria');
  if (!fs.existsSync(criteriaDir)) return [];
  return fs.readdirSync(criteriaDir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith('.md'))
    .map(d => d.name.replace(/\.md$/, ''))
    .sort();
}

function listProfiles(registryDir) {
  const profilesDir = path.join(registryDir, 'profiles');
  if (!fs.existsSync(profilesDir)) return [];
  return fs.readdirSync(profilesDir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith('.md'))
    .map(d => d.name.replace(/\.md$/, ''))
    .sort();
}

function readFm(name, registryDir) {
  const agentFile = path.join(registryDir, 'agents', name, 'agent.md');
  if (!fs.existsSync(agentFile)) return null;
  try {
    return parseFrontmatter(fs.readFileSync(agentFile, 'utf8'));
  } catch { return null; }
}

function showList(registryDir) {
  const agents = listAgents(registryDir);
  const skills = listSkills(registryDir);
  const orchestrators = [];
  const regularAgents = [];

  for (const name of agents) {
    const fm = readFm(name, registryDir);
    const type = (fm && fm.type) || 'agent';
    const desc = (fm && fm.description) || 'no description';
    const subagents = (fm && Array.isArray(fm.subagents)) ? fm.subagents : [];

    const agentColor = (fm && fm.color) || '';

    if (type === 'orchestrator') {
      orchestrators.push({ name, desc, subagents, color: agentColor });
    } else {
      regularAgents.push({ name, desc, color: agentColor });
    }
  }

  if (orchestrators.length > 0) {
    console.log(color.bold('Orchestrators:'));
    for (const o of orchestrators) {
      const subInfo = o.subagents.length > 0 ? ` (subagents: ${o.subagents.join(', ')})` : '';
      const colorTag = o.color ? ` [${o.color}]` : '';
      console.log(`  ${color.green(o.name)}${colorTag} — ${o.desc}${subInfo}`);
    }
    console.log('');
  }

  console.log(color.bold('Agents:'));
  if (regularAgents.length === 0) {
    console.log('  (none)');
  } else {
    const maxLen = Math.max(...regularAgents.map(a => a.name.length));
    for (const a of regularAgents) {
      const colorTag = a.color ? ` [${a.color}]` : '';
      console.log(`  ${color.green(a.name.padEnd(maxLen))}${colorTag} — ${a.desc}`);
    }
  }

  console.log('');
  console.log(color.bold('Skills:'));
  for (const name of skills) {
    console.log(`  ${color.green(name)}`);
  }

  const behaviors = listBehaviors(registryDir);
  if (behaviors.length > 0) {
    console.log('');
    console.log(color.bold('Behaviors:'));
    for (const name of behaviors) {
      const filePath = path.join(registryDir, 'behaviors', `${name}.md`);
      const content = fs.readFileSync(filePath, 'utf8');
      const bfm = parseFrontmatter(content);
      const desc = (bfm && bfm.description) || '';
      console.log(`  ${color.green(name)}${desc ? ' — ' + desc : ''}`);
    }
  }

  const criteria = listCriteria(registryDir);
  if (criteria.length > 0) {
    console.log('');
    console.log(color.bold('Criteria:'));
    for (const name of criteria) {
      const filePath = path.join(registryDir, 'criteria', `${name}.md`);
      const content = fs.readFileSync(filePath, 'utf8');
      const cfm = parseFrontmatter(content);
      const desc = (cfm && cfm.description) || '';
      // gate is stored as a string by the YAML parser (e.g. "true"/"false"), not a boolean
      const gateTag = (cfm && cfm.gate === 'true') ? ' [gate]' : ' [advisory]';
      console.log(`  ${color.green(name)}${gateTag}${desc ? ' — ' + desc : ''}`);
    }
  }

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
}

function isAgentInstalled(name, registryDir, claudeDir) {
  const cmdDst = path.join(claudeDir, 'commands', `${name}.md`);
  if (fs.existsSync(cmdDst)) {
    try {
      const firstLine = fs.readFileSync(cmdDst, 'utf8').split('\n')[0];
      if (firstLine.includes(`agent-registry-path: ${registryDir}/`)) return true;
    } catch { /* continue */ }
  }

  const agentDst = path.join(claudeDir, 'agents', `${name}.md`);
  if (fs.existsSync(agentDst)) {
    try {
      const content = fs.readFileSync(agentDst, 'utf8');
      if (content.includes(`agent-registry-path: ${registryDir}/`)) return true;
    } catch { /* ignore */ }
  }

  return false;
}

function isSkillInstalled(name, registryDir, claudeDir) {
  const skillPath = path.join(registryDir, 'skills', name);
  const type = getSkillType(skillPath);

  if (type === 'commands') {
    const cmdDst = path.join(claudeDir, 'commands', name);
    try {
      const stat = fs.lstatSync(cmdDst);
      if (!stat.isSymbolicLink()) return false;
      const actual = fs.realpathSync(cmdDst);
      return actual === path.join(registryDir, 'skills', name, 'commands');
    } catch { return false; }
  }

  if (type === 'skillmd') {
    const skillDst = path.join(claudeDir, 'skills', name);
    try {
      const stat = fs.lstatSync(skillDst);
      if (!stat.isSymbolicLink()) return false;
      const actual = fs.realpathSync(skillDst);
      return actual === path.join(registryDir, 'skills', name);
    } catch { return false; }
  }

  return false;
}

function showStatus(registryDir, claudeDir) {
  const agents = listAgents(registryDir);
  const skills = listSkills(registryDir);

  // Build used-by map
  const usedBy = {};
  for (const name of agents) {
    const fm = readFm(name, registryDir);
    if (fm && Array.isArray(fm.subagents)) {
      for (const sub of fm.subagents) {
        if (!usedBy[sub]) usedBy[sub] = [];
        usedBy[sub].push(name);
      }
    }
  }

  console.log(color.bold('Agents:'));
  for (const name of agents) {
    const installed = isAgentInstalled(name, registryDir, claudeDir);
    const status = installed ? `[${color.green('installed')}]` : `[${color.red('not installed')}]`;
    const fm = readFm(name, registryDir);
    let extra = '';

    if (fm && Array.isArray(fm.subagents) && fm.subagents.length > 0) {
      const subStatus = fm.subagents.map(sub => {
        return isAgentInstalled(sub, registryDir, claudeDir) ? `${sub} ✓` : `${sub} ✗`;
      });
      extra = `  (subagents: ${subStatus.join(', ')})`;
    }

    if (usedBy[name] && usedBy[name].length > 0) {
      extra += `  (used by: ${usedBy[name].join(', ')})`;
    }

    if (fm && Array.isArray(fm.behaviors) && fm.behaviors.length > 0) {
      extra += `  (behaviors: ${fm.behaviors.join(', ')})`;
    }

    if (fm && Array.isArray(fm.criteria) && fm.criteria.length > 0) {
      extra += `  (criteria: ${fm.criteria.join(', ')})`;
    }

    if (fm && fm.color) {
      extra += `  (color: ${fm.color})`;
    }

    console.log(`  ${name}  ${status}${extra}`);
  }

  console.log('');
  console.log(color.bold('Skills:'));
  for (const name of skills) {
    const installed = isSkillInstalled(name, registryDir, claudeDir);
    const status = installed ? `[${color.green('linked')}]` : `[${color.red('not installed')}]`;
    const skillPath = path.join(registryDir, 'skills', name);
    const type = getSkillType(skillPath);
    console.log(`  ${name}  ${status}  (type: ${type})`);
  }
}

/**
 * Count installed skills by type.
 * @param {string} registryDir
 * @returns {Object} {commands: N, skillmd: M}
 */
function CountInstalledSkills(registryDir) {
  const skills = listSkills(registryDir);
  const counts = { commands: 0, skillmd: 0 };
  for (const name of skills) {
    const skillPath = path.join(registryDir, 'skills', name);
    const type = getSkillType(skillPath);
    counts[type] = counts[type] + 1;
  }
  return counts;
}

module.exports = { listAgents, listSkills, listBehaviors, listCriteria, listProfiles, getSkillType, showList, showStatus, isAgentInstalled, isSkillInstalled, countInstalledSkills: CountInstalledSkills };
