#!/usr/bin/env bash
set -euo pipefail

SKILLS_DIR="$(cd "$(dirname "$0")" && pwd)/skills"
TARGET_DIR="$HOME/.claude/skills"

mkdir -p "$TARGET_DIR"

# Colors
green='\033[0;32m'
yellow='\033[0;33m'
red='\033[0;31m'
reset='\033[0m'

usage() {
  echo "Usage: $0 [--uninstall | --status | <skill-name>]"
  echo ""
  echo "  (no args)        Install/update all skills via symlink"
  echo "  <skill-name>     Install a single skill"
  echo "  --uninstall       Remove all symlinks managed by this registry"
  echo "  --status          Show installed status of each skill"
  exit 1
}

list_skills() {
  find "$SKILLS_DIR" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort
}

install_skill() {
  local name="$1"
  local src="$SKILLS_DIR/$name"
  local dst="$TARGET_DIR/$name"

  if [[ ! -d "$src" ]]; then
    echo -e "${red}Skill not found: $name${reset}"
    return 1
  fi

  if [[ -L "$dst" ]]; then
    rm "$dst"
  elif [[ -d "$dst" ]]; then
    echo -e "${yellow}Warning: $dst exists and is not a symlink, skipping (back up manually if needed)${reset}"
    return 1
  fi

  ln -s "$src" "$dst"
  echo -e "${green}Installed: $name -> $dst${reset}"
}

uninstall_all() {
  for name in $(list_skills); do
    local dst="$TARGET_DIR/$name"
    if [[ -L "$dst" ]]; then
      rm "$dst"
      echo -e "${yellow}Removed: $name${reset}"
    fi
  done
  echo "Done."
}

show_status() {
  for name in $(list_skills); do
    local dst="$TARGET_DIR/$name"
    if [[ -L "$dst" ]]; then
      local actual
      actual="$(readlink "$dst")"
      if [[ "$actual" == "$SKILLS_DIR/$name" ]]; then
        echo -e "${green}[linked]${reset}  $name"
      else
        echo -e "${yellow}[other]${reset}   $name -> $actual"
      fi
    elif [[ -d "$dst" ]]; then
      echo -e "${yellow}[copied]${reset}  $name (not managed by registry)"
    else
      echo -e "${red}[missing]${reset} $name"
    fi
  done
}

# Parse args
if [[ $# -eq 0 ]]; then
  echo "Installing all skills..."
  for name in $(list_skills); do
    install_skill "$name"
  done
  echo "Done."
elif [[ "$1" == "--uninstall" ]]; then
  uninstall_all
elif [[ "$1" == "--status" ]]; then
  show_status
elif [[ "$1" == "--help" || "$1" == "-h" ]]; then
  usage
else
  install_skill "$1"
fi
