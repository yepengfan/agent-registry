# engine/config.py
from dataclasses import dataclass, field
from pathlib import Path
import re
import subprocess


def _git_root() -> Path:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            return Path(result.stdout.strip())
    except Exception:
        pass
    return Path.cwd()


def _detect_repo() -> str | None:
    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            capture_output=True, text=True, timeout=5,
        )
        url = result.stdout.strip()
        m = re.search(r"github\.com[:/](.+?)(?:\.git)?$", url)
        return m.group(1) if m else None
    except Exception:
        return None


def detect_pr(repo: str | None) -> int | None:
    cmd = ["gh", "pr", "view", "--json", "number", "-q", ".number"]
    if repo:
        cmd += ["--repo", repo]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0 and result.stdout.strip().isdigit():
            return int(result.stdout.strip())
    except Exception:
        pass
    return None


@dataclass
class Config:
    cwd: Path = field(default_factory=_git_root)
    pr_number: int | None = None
    repo: str | None = field(default_factory=_detect_repo)
    diff_file: Path | None = None
    dry_run: bool = False

    max_rounds: int = 3
    reviewer_max_turns: int = 5
    fixer_max_turns: int = 30
    score_threshold: int = 5

    model: str = "anthropic.claude-4-6-sonnet[1m]"
    fix: bool = True
    fix_model: str | None = None
    reviewers: list[str] = field(default_factory=lambda: ["security", "logic", "edge_case"])

    state_dir: str = ".pr-review-state"
    test_cmd: str = ""
    lint_cmd: str = ""
    build_cmd: str = ""
