#!/usr/bin/env bash
set -euo pipefail

REGISTRY_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

# Colors
green='\033[0;32m'
yellow='\033[0;33m'
red='\033[0;31m'
bold='\033[1m'
reset='\033[0m'

usage() {
  cat <<EOF
Usage: $0 [options]

Install/manage agents and skills from this registry.

  (no args)                       Install all agents and skills
  --agent <name>                  Install one agent (+ skill deps)
  --skill <name>                  Install one skill
  --skills                        Install all skills only
  --project <agent> [target-dir]  Install agent into a project's CLAUDE.md
  --uninstall [name]              Remove all, or a specific agent/skill
  --uninstall --agent <name>      Remove a specific agent
  --uninstall --skill <name>      Remove a specific skill
  --status                        Show installed status
  --list                          List available agents and skills
  --help                          Show this help
EOF
  exit 1
}

# Validate package name: only allow alphanumeric, hyphens, and underscores
validate_name() {
  local name="$1"
  if [[ ! "$name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo -e "${red}Invalid package name: $name${reset}"
    return 1
  fi
}

# Resolve a symlink to its absolute target path
resolve_link() {
  local link="$1"
  if command -v realpath &>/dev/null; then
    realpath "$link" 2>/dev/null || readlink "$link"
  else
    readlink "$link"
  fi
}

# Parse frontmatter using Python helper, returns JSON on stdout
parse_frontmatter() {
  local file="$1"
  python3 "$REGISTRY_DIR/lib/parse_frontmatter.py" "$file"
}

# Get a scalar field from frontmatter JSON
get_field() {
  local json="$1" field="$2"
  echo "$json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
v = d.get('$field')
print(v if v is not None else '')
" 2>/dev/null
}

# Get a list field from frontmatter JSON (one item per line)
get_list_field() {
  local json="$1" field="$2"
  echo "$json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
v = d.get('$field', [])
if isinstance(v, list):
    for item in v:
        print(item)
" 2>/dev/null
}

# ── Discovery ────────────────────────────────────────────────

list_agents() {
  local _old_nullglob
  _old_nullglob=$(shopt -p nullglob 2>/dev/null || true)
  shopt -s nullglob
  for dir in "$REGISTRY_DIR/agents"/*/; do
    local name
    name="$(basename "$dir")"
    [[ "$name" == .* ]] && continue
    if [[ -f "$dir/agent.md" ]]; then
      echo "$name"
    fi
  done | sort
  eval "$_old_nullglob" 2>/dev/null || true
}

list_skills() {
  local _old_nullglob
  _old_nullglob=$(shopt -p nullglob 2>/dev/null || true)
  shopt -s nullglob
  for dir in "$REGISTRY_DIR/skills"/*/; do
    local name
    name="$(basename "$dir")"
    [[ "$name" == .* ]] && continue
    if [[ -d "$dir/commands" ]]; then
      echo "$name"
    fi
  done | sort
  eval "$_old_nullglob" 2>/dev/null || true
}

# ── Skill Installation ───────────────────────────────────────

install_skill() {
  local name="$1"
  validate_name "$name" || return 1
  local pkg_dir="$REGISTRY_DIR/skills/$name"

  if [[ ! -d "$pkg_dir" ]]; then
    echo -e "${red}Skill not found: $name${reset}"
    return 1
  fi

  if [[ -d "$pkg_dir/commands" ]]; then
    local cmd_dst="$CLAUDE_DIR/commands/$name"
    mkdir -p "$CLAUDE_DIR/commands"

    if [[ -L "$cmd_dst" ]]; then
      rm "$cmd_dst"
    elif [[ -d "$cmd_dst" ]]; then
      echo -e "${yellow}Warning: $cmd_dst exists and is not a symlink, skipping${reset}"
      return 1
    fi

    ln -s "$pkg_dir/commands" "$cmd_dst"
    echo -e "${green}  Skill $name: commands -> $cmd_dst${reset}"
  else
    echo -e "${yellow}Skill $name has no commands/ to install${reset}"
  fi
}

# ── Agent Installation (ephemeral — slash command) ───────────

install_agent() {
  local name="$1"
  validate_name "$name" || return 1
  local agent_dir="$REGISTRY_DIR/agents/$name"
  local agent_file="$agent_dir/agent.md"

  if [[ ! -f "$agent_file" ]]; then
    echo -e "${red}Agent not found: $name${reset}"
    return 1
  fi

  mkdir -p "$CLAUDE_DIR/commands"
  local dst="$CLAUDE_DIR/commands/$name.md"

  # Copy with registry path comment prepended, frontmatter stripped
  {
    echo "<!-- agent-registry-path: $agent_dir -->"
    echo ""
    python3 -c "
content = open('$agent_file').read()
parts = content.split('---', 2)
if len(parts) >= 3:
    print(parts[2].lstrip())
else:
    print(content)
"
  } > "$dst"

  echo -e "${green}  Agent $name -> $dst${reset}"

  # Auto-install skill dependencies
  local fm
  fm="$(parse_frontmatter "$agent_file")"
  local skill
  while IFS= read -r skill; do
    [[ -n "$skill" ]] || continue
    echo -e "  Installing skill dependency: $skill"
    install_skill "$skill"
  done < <(get_list_field "$fm" "skills")

  # Check tool dependencies
  local tool
  while IFS= read -r tool; do
    [[ -n "$tool" ]] || continue
    if ! command -v "$tool" &>/dev/null; then
      echo -e "${yellow}  Warning: tool '$tool' not found on PATH${reset}"
    fi
  done < <(get_list_field "$fm" "tools")

  echo -e "${green}Installed agent: $name${reset}"
}

# ── Agent Project Installation ───────────────────────────────

install_agent_project() {
  local name="$1"
  local target_dir="${2:-.}"
  validate_name "$name" || return 1
  local agent_dir="$REGISTRY_DIR/agents/$name"
  local agent_file="$agent_dir/agent.md"

  if [[ ! -f "$agent_file" ]]; then
    echo -e "${red}Agent not found: $name${reset}"
    return 1
  fi

  local claude_dir="$target_dir/.claude"
  mkdir -p "$claude_dir"

  local claude_md="$claude_dir/CLAUDE.md"

  # Extract body (without frontmatter)
  local body
  body="$(python3 -c "
content = open('$agent_file').read()
parts = content.split('---', 2)
if len(parts) >= 3:
    print(parts[2].lstrip())
else:
    print(content)
")"

  # Update ref/ paths to point to local .claude/ref/<name>/
  body="$(echo "$body" | sed "s|ref/|.claude/ref/$name/|g")"

  if [[ -f "$claude_md" ]]; then
    {
      echo ""
      echo "## Agent: $name"
      echo ""
      echo "$body"
    } >> "$claude_md"
    echo -e "${green}  Appended agent $name to $claude_md${reset}"
  else
    echo "$body" > "$claude_md"
    echo -e "${green}  Created $claude_md with agent $name${reset}"
  fi

  # Copy ref/ directory
  if [[ -d "$agent_dir/ref" ]]; then
    local ref_dst="$claude_dir/ref/$name"
    mkdir -p "$ref_dst"
    cp -r "$agent_dir/ref/"* "$ref_dst/"
    echo -e "${green}  Ref docs -> $ref_dst${reset}"
  fi

  # Auto-install skill dependencies
  local fm
  fm="$(parse_frontmatter "$agent_file")"
  local skill
  while IFS= read -r skill; do
    [[ -n "$skill" ]] || continue
    echo -e "  Installing skill dependency: $skill"
    install_skill "$skill"
  done < <(get_list_field "$fm" "skills")

  echo -e "${green}Installed agent $name into project: $target_dir${reset}"
}

# ── Uninstall ────────────────────────────────────────────────

uninstall_skill() {
  local name="$1"
  validate_name "$name" || return 1
  local pkg_dir="$REGISTRY_DIR/skills/$name"
  local cmd_dst="$CLAUDE_DIR/commands/$name"

  if [[ -L "$cmd_dst" ]]; then
    local actual
    actual="$(resolve_link "$cmd_dst")"
    if [[ "$actual" == "$pkg_dir/commands" ]]; then
      rm "$cmd_dst"
      echo -e "${yellow}  Removed skill: $name${reset}"
    else
      echo -e "${yellow}  Skipped skill: $name (symlink points elsewhere)${reset}"
    fi
  fi

  # Warn if any agent depends on this skill
  for agent_name in $(list_agents); do
    local agent_file="$REGISTRY_DIR/agents/$agent_name/agent.md"
    local fm
    fm="$(parse_frontmatter "$agent_file" 2>/dev/null)" || continue
    if get_list_field "$fm" "skills" | grep -q "^${name}$"; then
      echo -e "${yellow}  Warning: agent '$agent_name' depends on skill '$name'${reset}"
    fi
  done
}

uninstall_agent() {
  local name="$1"
  validate_name "$name" || return 1
  local dst="$CLAUDE_DIR/commands/$name.md"

  if [[ -f "$dst" ]]; then
    # Verify it's from this registry
    if head -1 "$dst" 2>/dev/null | grep -q "agent-registry-path:"; then
      rm "$dst"
      echo -e "${yellow}  Removed agent: $name${reset}"
    else
      echo -e "${yellow}  Skipped: $dst doesn't appear to be from this registry${reset}"
    fi
  else
    echo -e "${yellow}  Agent $name is not installed${reset}"
  fi
}

# Detect type by name and uninstall
uninstall_by_name() {
  local name="$1"
  validate_name "$name" || return 1
  local is_agent=false
  local is_skill=false

  [[ -d "$REGISTRY_DIR/agents/$name" ]] && is_agent=true
  [[ -d "$REGISTRY_DIR/skills/$name" ]] && is_skill=true

  if $is_agent && $is_skill; then
    echo -e "${red}Name '$name' exists as both agent and skill. Use --uninstall --agent $name or --uninstall --skill $name${reset}"
    return 1
  elif $is_agent; then
    uninstall_agent "$name"
  elif $is_skill; then
    uninstall_skill "$name"
  else
    echo -e "${red}Not found: $name${reset}"
    return 1
  fi
}

uninstall_all() {
  for name in $(list_agents); do
    uninstall_agent "$name"
  done
  for name in $(list_skills); do
    uninstall_skill "$name"
  done
  echo "Done."
}

# ── Status ───────────────────────────────────────────────────

show_status() {
  echo -e "${bold}Agents:${reset}"
  for name in $(list_agents); do
    local dst="$CLAUDE_DIR/commands/$name.md"
    if [[ -f "$dst" ]] && head -1 "$dst" 2>/dev/null | grep -q "agent-registry-path:"; then
      echo -e "  $name  [${green}installed${reset}]"
    else
      echo -e "  $name  [${red}not installed${reset}]"
    fi
  done

  echo ""
  echo -e "${bold}Skills:${reset}"
  for name in $(list_skills); do
    local pkg_dir="$REGISTRY_DIR/skills/$name"
    local cmd_dst="$CLAUDE_DIR/commands/$name"
    if [[ -L "$cmd_dst" ]]; then
      local actual
      actual="$(resolve_link "$cmd_dst")"
      if [[ "$actual" == "$pkg_dir/commands" ]]; then
        echo -e "  $name  [${green}linked${reset}]"
      else
        echo -e "  $name  [${yellow}other${reset}]"
      fi
    else
      echo -e "  $name  [${red}not installed${reset}]"
    fi
  done
}

# ── List ─────────────────────────────────────────────────────

show_list() {
  echo -e "${bold}Agents:${reset}"
  for name in $(list_agents); do
    local agent_file="$REGISTRY_DIR/agents/$name/agent.md"
    local fm desc
    fm="$(parse_frontmatter "$agent_file" 2>/dev/null)" || true
    desc="$(get_field "$fm" "description" 2>/dev/null)" || true
    echo -e "  ${green}$name${reset} — ${desc:-no description}"
  done

  echo ""
  echo -e "${bold}Skills:${reset}"
  for name in $(list_skills); do
    echo -e "  ${green}$name${reset}"
  done
}

# ── Main ─────────────────────────────────────────────────────

install_all() {
  echo "Installing all agents and skills..."
  echo ""
  echo -e "${bold}Skills:${reset}"
  for name in $(list_skills); do
    install_skill "$name"
  done
  echo ""
  echo -e "${bold}Agents:${reset}"
  for name in $(list_agents); do
    install_agent "$name"
  done
  echo ""
  echo "Done."
}

# Parse arguments
if [[ $# -eq 0 ]]; then
  install_all
elif [[ "$1" == "--help" || "$1" == "-h" ]]; then
  usage
elif [[ "$1" == "--agent" ]]; then
  [[ $# -ge 2 ]] || { echo -e "${red}Missing agent name${reset}"; usage; }
  install_agent "$2"
elif [[ "$1" == "--skill" ]]; then
  [[ $# -ge 2 ]] || { echo -e "${red}Missing skill name${reset}"; usage; }
  install_skill "$2"
elif [[ "$1" == "--skills" ]]; then
  echo "Installing all skills..."
  for name in $(list_skills); do
    install_skill "$name"
  done
  echo "Done."
elif [[ "$1" == "--project" ]]; then
  [[ $# -ge 2 ]] || { echo -e "${red}Missing agent name${reset}"; usage; }
  install_agent_project "$2" "${3:-.}"
elif [[ "$1" == "--uninstall" ]]; then
  if [[ $# -eq 1 ]]; then
    uninstall_all
  elif [[ "$2" == "--agent" ]]; then
    [[ $# -ge 3 ]] || { echo -e "${red}Missing agent name${reset}"; usage; }
    uninstall_agent "$3"
  elif [[ "$2" == "--skill" ]]; then
    [[ $# -ge 3 ]] || { echo -e "${red}Missing skill name${reset}"; usage; }
    uninstall_skill "$3"
  else
    uninstall_by_name "$2"
  fi
elif [[ "$1" == "--status" ]]; then
  show_status
elif [[ "$1" == "--list" ]]; then
  show_list
else
  echo -e "${red}Unknown option: $1${reset}"
  usage
fi
