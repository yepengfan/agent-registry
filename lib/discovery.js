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

function listSkills(registryDir) {
  const skillsDir = path.join(registryDir, 'skills');
  if (!fs.existsSync(skillsDir)) return [];
  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .filter(d => fs.existsSync(path.join(skillsDir, d.name, 'commands')))
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

    if (type === 'orchestrator') {
      orchestrators.push({ name, desc, subagents });
    } else {
      regularAgents.push({ name, desc });
    }
  }

  if (orchestrators.length > 0) {
    console.log(color.bold('Orchestrators:'));
    for (const o of orchestrators) {
      const subInfo = o.subagents.length > 0 ? ` (subagents: ${o.subagents.join(', ')})` : '';
      console.log(`  ${color.green(o.name)} — ${o.desc}${subInfo}`);
    }
    console.log('');
  }

  console.log(color.bold('Agents:'));
  if (regularAgents.length === 0) {
    console.log('  (none)');
  } else {
    const maxLen = Math.max(...regularAgents.map(a => a.name.length));
    for (const a of regularAgents) {
      console.log(`  ${color.green(a.name.padEnd(maxLen))} — ${a.desc}`);
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
  const dst = path.join(claudeDir, 'commands', `${name}.md`);
  if (!fs.existsSync(dst)) return false;
  try {
    const firstLine = fs.readFileSync(dst, 'utf8').split('\n')[0];
    return firstLine.includes(`agent-registry-path: ${registryDir}/`);
  } catch { return false; }
}

function isSkillInstalled(name, registryDir, claudeDir) {
  const cmdDst = path.join(claudeDir, 'commands', name);
  try {
    const stat = fs.lstatSync(cmdDst);
    if (!stat.isSymbolicLink()) return false;
    const actual = fs.realpathSync(cmdDst);
    return actual === path.join(registryDir, 'skills', name, 'commands');
  } catch { return false; }
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

    console.log(`  ${name}  ${status}${extra}`);
  }

  console.log('');
  console.log(color.bold('Skills:'));
  for (const name of skills) {
    const installed = isSkillInstalled(name, registryDir, claudeDir);
    const status = installed ? `[${color.green('linked')}]` : `[${color.red('not installed')}]`;
    console.log(`  ${name}  ${status}`);
  }
}

module.exports = { listAgents, listSkills, listBehaviors, listCriteria, listProfiles, showList, showStatus, isAgentInstalled, isSkillInstalled };
