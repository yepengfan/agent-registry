'use strict';

const fs = require('fs');
const path = require('path');
const { parseFrontmatter, extractBody, validate } = require('./frontmatter');

const color = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

function validateName(name) {
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid name: "${name}". Only alphanumeric, hyphens, and underscores allowed.`);
  }
  if (name.length > 128) {
    throw new Error(`Invalid name: "${name}". Maximum 128 characters.`);
  }
}

function checkTools(fm) {
  const tools = fm.tools || [];
  if (!Array.isArray(tools)) return;
  const { execFileSync } = require('child_process');
  for (const tool of tools) {
    try {
      execFileSync('which', [tool], { stdio: 'ignore' });
    } catch {
      console.log(color.yellow(`  Warning: tool '${tool}' not found on PATH`));
    }
  }
}

function copyDirRecursive(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      console.log(color.yellow(`  Warning: skipping symlink ${entry.name} in ${src}`));
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

// ── Skill Installation ──────────────────────────────────────

function installSkill(name, registryDir, claudeDir) {
  validateName(name);
  const pkgDir = path.join(registryDir, 'skills', name);
  if (!fs.existsSync(pkgDir)) throw new Error(`Skill not found: ${name}`);

  const commandsDir = path.join(pkgDir, 'commands');
  if (!fs.existsSync(commandsDir)) {
    console.log(color.yellow(`Skill ${name} has no commands/ to install`));
    return;
  }

  const cmdDst = path.join(claudeDir, 'commands', name);
  fs.mkdirSync(path.join(claudeDir, 'commands'), { recursive: true });

  try {
    const stat = fs.lstatSync(cmdDst);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(cmdDst);
    } else if (stat.isDirectory()) {
      console.log(color.yellow(`Warning: ${cmdDst} exists and is not a symlink, skipping`));
      return;
    }
  } catch { /* does not exist */ }

  fs.symlinkSync(commandsDir, cmdDst);
  console.log(color.green(`  Skill ${name}: commands -> ${cmdDst}`));
}

// ── Agent Installation ──────────────────────────────────────

function installAgent(name, registryDir, claudeDir, visited) {
  validateName(name);

  if (visited.has(name)) {
    console.log(color.yellow(`  Skipping ${name}: circular dependency detected`));
    return;
  }
  visited.add(name);

  const agentDir = path.join(registryDir, 'agents', name);
  const agentFile = path.join(agentDir, 'agent.md');
  if (!fs.existsSync(agentFile)) throw new Error(`Agent not found: ${name}`);

  const content = fs.readFileSync(agentFile, 'utf8');
  const fm = parseFrontmatter(content);
  validate(fm);
  const body = extractBody(content);

  fs.mkdirSync(path.join(claudeDir, 'commands'), { recursive: true });
  const dst = path.join(claudeDir, 'commands', `${name}.md`);
  fs.writeFileSync(dst, `<!-- agent-registry-path: ${agentDir} -->\n\n${body}`);
  console.log(color.green(`  Agent ${name} -> ${dst}`));

  // Auto-install subagent dependencies
  const subagents = Array.isArray(fm.subagents) ? fm.subagents : [];
  for (const sub of subagents) {
    if (!fs.existsSync(path.join(registryDir, 'agents', sub, 'agent.md'))) {
      throw new Error(`Subagent "${sub}" required by "${name}" not found in agents/`);
    }
    console.log(`  Installing subagent dependency: ${sub}`);
    installAgent(sub, registryDir, claudeDir, visited);
  }

  // Auto-install skill dependencies
  const skills = Array.isArray(fm.skills) ? fm.skills : [];
  for (const skill of skills) {
    console.log(`  Installing skill dependency: ${skill}`);
    installSkill(skill, registryDir, claudeDir);
  }

  checkTools(fm);
  console.log(color.green(`Installed agent: ${name}`));
}

// ── Project Installation ────────────────────────────────────

function installProject(name, targetDir, registryDir, claudeDir) {
  validateName(name);
  const agentDir = path.join(registryDir, 'agents', name);
  const agentFile = path.join(agentDir, 'agent.md');
  if (!fs.existsSync(agentFile)) throw new Error(`Agent not found: ${name}`);

  const content = fs.readFileSync(agentFile, 'utf8');
  const fm = parseFrontmatter(content);
  validate(fm);
  let body = extractBody(content);

  const claudeMdDir = path.join(targetDir, '.claude');
  fs.mkdirSync(claudeMdDir, { recursive: true });
  const claudeMd = path.join(claudeMdDir, 'CLAUDE.md');

  body = body.replace(/`ref\//g, `\`.claude/ref/${name}/`);

  if (fs.existsSync(claudeMd)) {
    fs.appendFileSync(claudeMd, `\n\n## Agent: ${name}\n\n${body}`);
    console.log(color.green(`  Appended agent ${name} to ${claudeMd}`));
  } else {
    fs.writeFileSync(claudeMd, body);
    console.log(color.green(`  Created ${claudeMd} with agent ${name}`));
  }

  const refSrc = path.join(agentDir, 'ref');
  if (fs.existsSync(refSrc)) {
    const refDst = path.join(claudeMdDir, 'ref', name);
    fs.mkdirSync(refDst, { recursive: true });
    copyDirRecursive(refSrc, refDst);
    console.log(color.green(`  Ref docs -> ${refDst}`));
  }

  const skills = Array.isArray(fm.skills) ? fm.skills : [];
  for (const skill of skills) {
    console.log(`  Installing skill dependency: ${skill}`);
    installSkill(skill, registryDir, claudeDir);
  }

  checkTools(fm);
  console.log(color.green(`Installed agent ${name} into project: ${targetDir}`));
}

// ── Install All ─────────────────────────────────────────────

function installAll(registryDir, claudeDir) {
  const discovery = require('./discovery');
  console.log('Installing all agents and skills...\n');

  console.log(color.bold('Skills:'));
  for (const name of discovery.listSkills(registryDir)) {
    installSkill(name, registryDir, claudeDir);
  }

  console.log('');
  console.log(color.bold('Agents:'));
  for (const name of discovery.listAgents(registryDir)) {
    installAgent(name, registryDir, claudeDir, new Set());
  }

  console.log('\nDone.');
}

// ── Uninstall ───────────────────────────────────────────────

function uninstallSkill(name, registryDir, claudeDir) {
  validateName(name);
  const pkgDir = path.join(registryDir, 'skills', name);
  const cmdDst = path.join(claudeDir, 'commands', name);

  try {
    const stat = fs.lstatSync(cmdDst);
    if (stat.isSymbolicLink()) {
      const actual = fs.realpathSync(cmdDst);
      if (actual === path.join(pkgDir, 'commands')) {
        fs.unlinkSync(cmdDst);
        console.log(color.yellow(`  Removed skill: ${name}`));
      } else {
        console.log(color.yellow(`  Skipped skill: ${name} (symlink points elsewhere)`));
      }
    }
  } catch { /* not installed */ }

  // Warn if any agent depends on this skill
  const discovery = require('./discovery');
  for (const agentName of discovery.listAgents(registryDir)) {
    const agentFile = path.join(registryDir, 'agents', agentName, 'agent.md');
    const content = fs.readFileSync(agentFile, 'utf8');
    const fm = parseFrontmatter(content);
    if (fm && Array.isArray(fm.skills) && fm.skills.includes(name)) {
      console.log(color.yellow(`  Warning: agent '${agentName}' depends on skill '${name}'`));
    }
  }
}

function uninstallAgent(name, registryDir, claudeDir) {
  validateName(name);
  const dst = path.join(claudeDir, 'commands', `${name}.md`);

  if (!fs.existsSync(dst)) {
    console.log(color.yellow(`  Agent ${name} is not installed`));
    return;
  }

  const firstLine = fs.readFileSync(dst, 'utf8').split('\n')[0];
  if (firstLine.includes(`agent-registry-path: ${registryDir}/`)) {
    fs.unlinkSync(dst);
    console.log(color.yellow(`  Removed agent: ${name}`));
  } else {
    console.log(color.yellow(`  Skipped: ${dst} not installed by this registry`));
    return;
  }

  // Warn if any orchestrator depends on this agent
  const discovery = require('./discovery');
  for (const other of discovery.listAgents(registryDir)) {
    const agentFile = path.join(registryDir, 'agents', other, 'agent.md');
    const content = fs.readFileSync(agentFile, 'utf8');
    const fm = parseFrontmatter(content);
    if (fm && Array.isArray(fm.subagents) && fm.subagents.includes(name)) {
      console.log(color.yellow(`  Warning: agent '${other}' depends on subagent '${name}'`));
    }
  }
}

function uninstallByName(name, registryDir, claudeDir) {
  validateName(name);
  const isAgent = fs.existsSync(path.join(registryDir, 'agents', name));
  const isSkill = fs.existsSync(path.join(registryDir, 'skills', name));

  if (isAgent && isSkill) {
    throw new Error(`Name '${name}' exists as both agent and skill. Use: uninstall --agent ${name} or uninstall --skill ${name}`);
  } else if (isAgent) {
    uninstallAgent(name, registryDir, claudeDir);
  } else if (isSkill) {
    uninstallSkill(name, registryDir, claudeDir);
  } else {
    throw new Error(`Not found: ${name}`);
  }
}

function uninstallAll(registryDir, claudeDir) {
  const discovery = require('./discovery');
  for (const name of discovery.listAgents(registryDir)) {
    uninstallAgent(name, registryDir, claudeDir);
  }
  for (const name of discovery.listSkills(registryDir)) {
    uninstallSkill(name, registryDir, claudeDir);
  }
  console.log('Done.');
}

module.exports = {
  validateName,
  installSkill,
  installAgent,
  installProject,
  installAll,
  uninstallSkill,
  uninstallAgent,
  uninstallByName,
  uninstallAll,
};
