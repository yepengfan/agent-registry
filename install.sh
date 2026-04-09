#!/usr/bin/env bash
set -euo pipefail

REGISTRY_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v node &>/dev/null; then
  echo "Error: Node.js >= 18 is required. Install it from https://nodejs.org" >&2
  exit 1
fi

# Translate legacy flags to CLI subcommands.
# Uses an array to avoid word-splitting issues with paths containing spaces.
run_cli() {
  local args=()
  case "${1:-}" in
    --help|-h)
      args=(help)
      ;;
    --agent)
      args=(install --agent "$2")
      ;;
    --skill)
      args=(install --skill "$2")
      ;;
    --project)
      args=(project "$2" "${3:-.}")
      ;;
    --status)
      args=(status)
      ;;
    --list)
      args=(list)
      ;;
    --uninstall)
      shift
      if [[ $# -eq 0 ]]; then
        args=(uninstall --all)
      elif [[ "$1" == "--agent" ]]; then
        args=(uninstall --agent "$2")
      elif [[ "$1" == "--skill" ]]; then
        args=(uninstall --skill "$2")
      else
        args=(uninstall "$1")
      fi
      ;;
    *)
      args=("$@")
      ;;
  esac
  exec node "$REGISTRY_DIR/bin/cli.js" "${args[@]}"
}

if [[ $# -eq 0 ]]; then
  exec node "$REGISTRY_DIR/bin/cli.js" install
else
  run_cli "$@"
fi
