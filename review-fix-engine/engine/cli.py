# engine/cli.py
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from .config import Config
from .orchestrator import run
from .progress import C, info, success, error, set_quiet


def parse_args() -> tuple[Config, Path | None]:
    parser = argparse.ArgumentParser(description="PR review engine with parallel specialized reviewers")
    parser.add_argument("--pr", type=int, help="PR number to review")
    parser.add_argument("--repo", type=str, help="GitHub repo (owner/repo)")
    parser.add_argument("--diff-file", type=Path, help="Path to diff file")
    parser.add_argument("--dry-run", action="store_true", help="Skip GitHub comment posting")
    parser.add_argument("--reviewers", type=str, default="security,logic,edge_case",
                        help="Comma-separated reviewer names")
    parser.add_argument("--score-threshold", type=int, default=5, help="Self-reflection score threshold (0-10)")
    parser.add_argument("--cwd", type=Path, default=None)
    parser.add_argument("--test-cmd", type=str, default="npm test")
    parser.add_argument("--output-json", type=Path, help="Write results JSON to file")
    parser.add_argument("-q", "--quiet", action="store_true", help="Suppress LLM streaming output, show only progress")
    parser.add_argument("--model", type=str, default="anthropic.claude-4-6-sonnet[1m]", help="Model for reviewer agents (default: sonnet)")
    args = parser.parse_args()

    config = Config(
        pr_number=args.pr,
        repo=args.repo,
        diff_file=args.diff_file,
        dry_run=args.dry_run,
        model=args.model,
        reviewers=args.reviewers.split(","),
        score_threshold=args.score_threshold,
        test_cmd=args.test_cmd,
    )
    if args.cwd:
        config.cwd = args.cwd
    if args.quiet:
        set_quiet()
    return config, args.output_json


def print_summary(result: dict):
    stats = result.get("stats", {})
    findings = result.get("findings", [])
    print(f"\n{C.BOLD}=== Summary ==={C.RESET}")
    info("status", result.get("status", "unknown"))
    info("findings", f"{len(findings)} grounded findings")
    if stats:
        info("cost", f"${stats.get('total_cost_usd', 0):.2f}")
        info("duration", f"{stats.get('duration_s', 0):.0f}s")
        info("hallucination", f"{stats.get('hallucination_rate', 0):.0%}")
        info("pipeline", f"{stats.get('before_dedup', 0)} raw → {stats.get('after_dedup', 0)} dedup → {stats.get('after_reflection', 0)} reflect → {stats.get('after_grounding', 0)} grounded")


def main():
    config, output_json = parse_args()
    try:
        result = asyncio.run(run(config))
    except KeyboardInterrupt:
        print(f"\n{C.YELLOW}Interrupted.{C.RESET}")
        sys.exit(130)
    except Exception as e:
        error("fatal", str(e))
        sys.exit(1)

    print_summary(result)

    if output_json:
        output_json.write_text(json.dumps(result, indent=2, default=str))
        info("output", f"Results written to {output_json}")

    if result.get("status") == "error":
        sys.exit(1)
