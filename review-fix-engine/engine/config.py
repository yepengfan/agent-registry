# engine/config.py
from dataclasses import dataclass, field
from pathlib import Path
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


@dataclass
class Config:
    cwd: Path = field(default_factory=_git_root)
    pr_number: int | None = None
    repo: str | None = None
    diff_file: Path | None = None
    dry_run: bool = False

    max_rounds: int = 3
    reviewer_max_turns: int = 5
    fixer_max_turns: int = 30
    score_threshold: int = 5

    reviewers: list[str] = field(default_factory=lambda: ["security", "logic", "edge_case"])

    state_dir: str = ".pr-review-state"
    test_cmd: str = "npm test"
    lint_cmd: str = ""
    build_cmd: str = ""
