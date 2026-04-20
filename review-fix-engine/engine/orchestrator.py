# engine/orchestrator.py
from __future__ import annotations

import asyncio
import subprocess
from pathlib import Path

from . import agents, grounding, progress as p
from .config import Config
from .merge import merge_and_dedup
from .github import post_pr_review
from .schema import Finding, Severity


def _build_gh_cmd(base: list[str], config: Config) -> list[str]:
    """Append --repo flag to a gh command list if config.repo is set."""
    if config.repo:
        return base + ["--repo", config.repo]
    return base


def _checkout_pr(config: Config) -> str | None:
    if not config.pr_number:
        return None

    cmd = _build_gh_cmd(
        ["gh", "pr", "view", str(config.pr_number),
         "--json", "headRefName", "-q", ".headRefName"],
        config,
    )
    result = subprocess.run(
        cmd, capture_output=True, text=True, cwd=config.cwd,
    )
    branch = result.stdout.strip()
    if not branch:
        return None

    current = subprocess.run(
        ["git", "branch", "--show-current"],
        capture_output=True, text=True, cwd=config.cwd,
    ).stdout.strip()
    if current == branch:
        return branch

    checkout_cmd = _build_gh_cmd(
        ["gh", "pr", "checkout", str(config.pr_number)],
        config,
    )
    r = subprocess.run(
        checkout_cmd, capture_output=True, text=True, cwd=config.cwd,
    )
    return branch if r.returncode == 0 else None


def _get_diff(config: Config) -> str:
    if config.diff_file:
        return config.diff_file.read_text()
    if config.pr_number:
        cmd = _build_gh_cmd(
            ["gh", "pr", "diff", str(config.pr_number)],
            config,
        )
        return subprocess.run(
            cmd, capture_output=True, text=True, cwd=config.cwd,
        ).stdout
    return ""


def _gates_summary(config: Config) -> str:
    # test_cmd is user-provided, so shell=True is intentional here
    test_result = subprocess.run(
        config.test_cmd, shell=True, capture_output=True, cwd=config.cwd,
    ) if config.test_cmd else None
    tests_pass = test_result.returncode == 0 if test_result else True
    lint_pass = True  # TODO Phase 2
    build_pass = True
    return (
        f"- tests_pass: {str(tests_pass).lower()}\n"
        f"- lint_pass: {str(lint_pass).lower()}\n"
        f"- build_pass: {str(build_pass).lower()}"
    )


def _read_file_contexts(findings: list[Finding], cwd: Path, context_lines: int = 20) -> dict[str, str]:
    # Group findings by file so every finding gets context, not just the first per file
    by_file: dict[str, list[Finding]] = {}
    for f in findings:
        by_file.setdefault(f.file, []).append(f)

    contexts: dict[str, str] = {}
    for file_rel, file_findings in by_file.items():
        file_path = cwd / file_rel
        if not file_path.is_file():
            continue
        try:
            lines = file_path.read_text(encoding="utf-8", errors="replace").splitlines()
            windows: list[str] = []
            captured: list[tuple[int, int]] = []
            for f in file_findings:
                start = max(0, f.line_start - 1 - context_lines)
                end = min(len(lines), f.line_end + context_lines)
                # Skip if this range is fully covered by an already-captured window
                if any(s <= start and end <= e for s, e in captured):
                    continue
                numbered = [f"{i+1:4d} | {lines[i]}" for i in range(start, end)]
                windows.append("\n".join(numbered))
                captured.append((start, end))
            contexts[file_rel] = "\n...\n".join(windows)
        except Exception:
            continue
    return contexts


def _run_post_fix_gates(config: Config) -> bool:
    if not config.test_cmd:
        p.info("gates", "No test command — skipping post-fix gates")
        return True
    p.info("gates", f"Running: {config.test_cmd}")
    result = subprocess.run(
        config.test_cmd, shell=True, capture_output=True, cwd=config.cwd,
    )
    if result.returncode == 0:
        p.success("gates", "Tests pass after fix")
        return True
    else:
        p.error("gates", "Tests FAILED after fix")
        return False


async def run(config: Config) -> dict:
    timer = p.Timer()
    agents_dir = Path(__file__).parent.parent / "agents"

    # Pre-load prompts before checkout (checkout switches branch, removing these files)
    prompts = {"_base": (agents_dir / "reviewer_base.md").read_text().strip()}
    for name in config.reviewers:
        prompts[name] = (agents_dir / f"reviewer_{name}.md").read_text().strip()
    fixer_prompt = (agents_dir / "fixer.md").read_text().strip() if config.fix else ""

    print(f"{p.C.BOLD}=== Review-Fix Engine ==={p.C.RESET}")
    p.info("setup", f"cwd={config.cwd}")
    p.info("setup", f"reviewers={config.reviewers}")

    # Checkout PR branch
    if config.pr_number:
        p.info("setup", f"Checking out PR #{config.pr_number}...")
        branch = _checkout_pr(config)
        if branch:
            p.success("setup", f"On branch: {branch}")
        else:
            p.warn("setup", "Could not checkout PR branch")

    # Get diff
    diff = _get_diff(config)
    if not diff:
        p.error("setup", "No diff to review")
        return {"status": "error", "reason": "no diff"}
    p.info("setup", f"Diff: {len(diff)} chars, {diff.count(chr(10))} lines")

    # Gates
    p.phase("Gates")
    gates_summary = _gates_summary(config)
    p.info("gates", gates_summary.replace("\n", " | "))

    # Parallel review
    p.phase("Review")
    findings_by_reviewer, review_cost = await agents.review_parallel(
        reviewers=config.reviewers,
        prompts=prompts,
        diff=diff,
        gates_summary=gates_summary,
        round_num=1,
        cwd=config.cwd,
        max_turns=config.reviewer_max_turns,
        model=config.model,
    )

    # All-reviewers-fail guard
    if not findings_by_reviewer:
        p.error("review", "All reviewers failed")
        return {"status": "error", "reason": "all reviewers failed", "cost": review_cost, "duration": timer.elapsed()}

    # Merge + dedup
    merged = merge_and_dedup(findings_by_reviewer)
    p.info("merge", f"{len(merged)} findings after dedup")
    for f in merged:
        p.finding(f)

    if not merged:
        p.success("result", "No issues found!")
        return {"status": "clean", "findings": [], "cost": review_cost, "duration": timer.elapsed()}

    # Self-reflection
    p.phase("Self-Reflection")
    try:
        reflected, reflect_cost = await agents.self_reflect(
            findings=merged, diff=diff, cwd=config.cwd,
            score_threshold=config.score_threshold, model=config.model,
        )
        total_cost = review_cost + reflect_cost
    except Exception as e:
        p.warn("reflect", f"Self-reflection failed: {e}, passing all findings to grounding")
        reflected = merged
        total_cost = review_cost
        reflect_cost = 0.0
    p.info("reflect", f"{len(reflected)} findings after scoring (${reflect_cost:.4f})")

    # Grounding
    p.phase("Grounding")
    gt = p.Timer()
    ground_result = grounding.verify(reflected, config.cwd)
    p.ground_result(ground_result.grounded, ground_result.dropped, gt.elapsed())

    # Fix
    fix_cost = 0.0
    fix_status = "skipped"
    must_fix = [f for f in ground_result.grounded if f.severity == Severity.MUST_FIX]

    if config.fix and must_fix and not config.dry_run:
        p.phase("Fix")
        p.info("fix", f"{len(must_fix)} must-fix findings to fix")

        file_contexts = _read_file_contexts(must_fix, config.cwd)

        if p.is_quiet():
            p.init_reviewers(["fixer"])

        try:
            fix_result, fix_cost = await agents.fix_findings(
                findings=must_fix,
                fixer_prompt=fixer_prompt,
                file_contexts=file_contexts,
                cwd=config.cwd,
                max_turns=config.fixer_max_turns,
                model=config.fix_model or config.model,
                test_cmd=config.test_cmd,
            )
            total_cost += fix_cost

            if p.is_quiet():
                p.finish_progress("fixer", len(must_fix), fix_cost, timer.elapsed())

            # Run gates after fix
            p.phase("Post-Fix Gates")
            gates_ok = _run_post_fix_gates(config)

            if gates_ok:
                subprocess.run(["git", "add", "-A"], cwd=config.cwd, capture_output=True)
                subprocess.run(
                    ["git", "commit", "-m", f"fix: auto-fix {len(must_fix)} must-fix findings"],
                    cwd=config.cwd, capture_output=True,
                )
                subprocess.run(["git", "push"], cwd=config.cwd, capture_output=True)
                p.success("fix", f"Committed and pushed fixes for {len(must_fix)} findings (${fix_cost:.2f})")
                fix_status = "committed"
            else:
                subprocess.run(["git", "checkout", "."], cwd=config.cwd, capture_output=True)
                p.warn("fix", "Gates failed after fix — reverted all changes")
                fix_status = "reverted"

        except Exception as e:
            if p.is_quiet():
                p.finish_progress("fixer", 0, fix_cost, timer.elapsed())
            subprocess.run(["git", "checkout", "."], cwd=config.cwd, capture_output=True)
            p.error("fix", f"Fixer failed: {e} — reverted")
            fix_status = "failed"

    elif config.fix and must_fix and config.dry_run:
        p.warn("dry-run", f"Skipping fix for {len(must_fix)} must-fix findings")
    elif not must_fix and ground_result.grounded:
        p.info("fix", "No must-fix findings — skipping fix")

    # Output
    stats = {
        "total_cost_usd": total_cost,
        "duration_s": timer.elapsed(),
        "hallucination_rate": ground_result.hallucination_rate,
        "reviewers": {name: len(fs) for name, fs in findings_by_reviewer.items()},
        "before_dedup": sum(len(fs) for fs in findings_by_reviewer.values()),
        "after_dedup": len(merged),
        "after_reflection": len(reflected),
        "after_grounding": ground_result.grounded_count,
        "fix_status": fix_status,
        "fix_cost": fix_cost,
    }

    # Post to GitHub
    if not config.dry_run and config.pr_number and config.repo and ground_result.grounded:
        p.phase("Post to GitHub")
        ok = post_pr_review(config.pr_number, config.repo, ground_result.grounded, stats, str(config.cwd))
        if ok:
            p.success("github", "Review posted to PR")
        else:
            p.warn("github", "Failed to post review")
    elif config.dry_run:
        p.warn("dry-run", "Skipping GitHub comment")

    return {
        "status": "reviewed",
        "findings": [f.model_dump() for f in ground_result.grounded],
        "stats": stats,
    }
