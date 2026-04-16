#!/usr/bin/env node
'use strict';

const path = require('path');
const os = require('os');

const REGISTRY_DIR = path.resolve(__dirname, '..');
const CLAUDE_DIR = path.join(os.homedir(), '.claude');

const color = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

function usage() {
  console.log(`Usage: agent-registry <command> [options]

Commands:
  install [name]             Install all agents+skills, or one agent (+deps)
  install --skill <name>     Install one skill
  project <name> [dir]       Install agent into a project's CLAUDE.md
  list                       List available agents and skills
  status                     Show installed status with dependency info
  uninstall [name]           Auto-detect type and uninstall
  uninstall --agent <name>   Uninstall a specific agent
  uninstall --skill <name>   Uninstall a specific skill
  uninstall --all            Uninstall everything
  update                     Reinstall all installed agents+skills (picks up changes)
  root                       Print the registry installation directory
  help                       Show this help`);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  const installer = () => require('../lib/installer');
  const discovery = () => require('../lib/discovery');

  try {
    switch (command) {
      case 'install': {
        const rest = args.slice(1);
        if (rest.length === 0) {
          installer().installAll(REGISTRY_DIR, CLAUDE_DIR);
        } else if (rest[0] === '--skill') {
          if (!rest[1]) { console.error(color.red('Missing skill name')); process.exit(1); }
          installer().installSkill(rest[1], REGISTRY_DIR, CLAUDE_DIR);
        } else if (rest[0] === '--agent') {
          if (!rest[1]) { console.error(color.red('Missing agent name')); process.exit(1); }
          installer().installAgent(rest[1], REGISTRY_DIR, CLAUDE_DIR, new Set());
        } else {
          installer().installAgent(rest[0], REGISTRY_DIR, CLAUDE_DIR, new Set());
        }
        break;
      }
      case 'project': {
        const name = args[1];
        if (!name) { console.error(color.red('Missing agent name')); process.exit(1); }
        installer().installProject(name, args[2] || '.', REGISTRY_DIR, CLAUDE_DIR);
        break;
      }
      case 'list':
        discovery().showList(REGISTRY_DIR);
        break;
      case 'status':
        discovery().showStatus(REGISTRY_DIR, CLAUDE_DIR);
        break;
      case 'uninstall': {
        const rest = args.slice(1);
        if (rest.length === 0 || rest[0] === '--all') {
          installer().uninstallAll(REGISTRY_DIR, CLAUDE_DIR);
        } else if (rest[0] === '--agent') {
          if (!rest[1]) { console.error(color.red('Missing agent name')); process.exit(1); }
          installer().uninstallAgent(rest[1], REGISTRY_DIR, CLAUDE_DIR);
        } else if (rest[0] === '--skill') {
          if (!rest[1]) { console.error(color.red('Missing skill name')); process.exit(1); }
          installer().uninstallSkill(rest[1], REGISTRY_DIR, CLAUDE_DIR);
        } else {
          installer().uninstallByName(rest[0], REGISTRY_DIR, CLAUDE_DIR);
        }
        break;
      }
      case 'update':
        installer().updateAll(REGISTRY_DIR, CLAUDE_DIR);
        break;
      case 'root':
        console.log(REGISTRY_DIR);
        break;
      case 'help':
      case '--help':
      case '-h':
        usage();
        break;
      default:
        console.error(color.red(`Unknown command: ${command}`));
        usage();
        process.exit(1);
    }
  } catch (err) {
    console.error(color.red(`Error: ${err.message}`));
    process.exit(1);
  }
}

main();
