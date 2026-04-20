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


def _run_gate(label: str, cmd: str, cwd: Path) -> bool:
    if not cmd:
        return True
    result = subprocess.run(cmd, shell=True, capture_output=True, cwd=cwd)
    return result.returncode == 0


def _gates_summary(config: Config) -> str:
    tests_pass = _run_gate("test", config.test_cmd, config.cwd)
    lint_pass = _run_gate("lint", config.lint_cmd, config.cwd)
    build_pass = _run_gate("build", config.build_cmd, config.cwd)
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
    gate_cmds = [("test", config.test_cmd), ("lint", config.lint_cmd), ("build", config.build_cmd)]
    has_any = any(cmd for _, cmd in gate_cmds)
    if not has_any:
        p.info("gates", "No gate commands configured — skipping")
        return True
    all_ok = True
    for label, cmd in gate_cmds:
        if not cmd:
            continue
        p.info("gates", f"Running {label}: {cmd}")
        result = subprocess.run(cmd, shell=True, capture_output=True, cwd=config.cwd)
        if result.returncode == 0:
            p.success("gates", f"{label} passed")
        else:
            p.error("gates", f"{label} FAILED")
            all_ok = False
    return all_ok


def _revert_changes(cwd: Path):
    subprocess.run(["git", "checkout", "."], cwd=cwd, capture_output=True)
    subprocess.run(["git", "clean", "-fd"], cwd=cwd, capture_output=True)


def _audit_fix_scope(findings: list[Finding], cwd: Path) -> list[str]:
    allowed = set(f.file for f in findings)
    tracked = subprocess.run(
        ["git", "diff", "--name-only"], cwd=cwd, capture_output=True, text=True,
    )
    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"], cwd=cwd, capture_output=True, text=True,
    )
    changed = set(
        line for line in (tracked.stdout + untracked.stdout).strip().splitlines() if line
    )
    return sorted(changed - allowed)


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

            # Scope audit
            violations = _audit_fix_scope(must_fix, config.cwd)
            if violations:
                p.warn("scope", f"Fixer modified files outside findings: {violations}")
                _revert_changes(config.cwd)
                fix_status = "scope_violation"
            else:
                # Run gates after fix
                p.phase("Post-Fix Gates")
                gates_ok = _run_post_fix_gates(config)

                if gates_ok:
                    files_to_stage = list(set(f.file for f in must_fix))
                    r_add = subprocess.run(["git", "add"] + files_to_stage, cwd=config.cwd, capture_output=True)
                    if r_add.returncode != 0:
                        p.error("fix", f"git add failed: {r_add.stderr.decode().strip()}")
                        _revert_changes(config.cwd)
                        fix_status = "failed"
                    else:
                        r_commit = subprocess.run(
                            ["git", "commit", "-m", f"fix: auto-fix {len(must_fix)} must-fix findings"],
                            cwd=config.cwd, capture_output=True,
                        )
                        if r_commit.returncode != 0:
                            p.error("fix", f"git commit failed: {r_commit.stderr.decode().strip()}")
                            subprocess.run(["git", "reset", "HEAD", "--"] + files_to_stage, cwd=config.cwd, capture_output=True)
                            _revert_changes(config.cwd)
                            fix_status = "failed"
                        else:
                            r_push = subprocess.run(["git", "push"], cwd=config.cwd, capture_output=True)
                            if r_push.returncode != 0:
                                p.warn("fix", f"git push failed (commit local only): {r_push.stderr.decode().strip()}")
                            p.success("fix", f"Committed fixes for {len(must_fix)} findings (${fix_cost:.2f})")
                            fix_status = "committed"
                else:
                    _revert_changes(config.cwd)
                    p.warn("fix", "Gates failed after fix — reverted all changes")
                    fix_status = "reverted"

        except Exception as e:
            if p.is_quiet():
                p.finish_progress("fixer", 0, fix_cost, timer.elapsed())
            _revert_changes(config.cwd)
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
