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

module.exports = { listAgents, listSkills, showList, showStatus, isAgentInstalled, isSkillInstalled };
