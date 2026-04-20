from __future__ import annotations
import json
import subprocess
from .schema import Finding, Severity


def format_comment_body(finding: Finding) -> str:
    icon = {"security": "\U0001f512", "logic": "\U0001f50d", "edge_case": "\U0001f9ea"}.get(
        finding.source_reviewer, "\U0001f4cb"
    )
    sev_label = finding.severity.value
    return (
        f"{icon} **[{finding.source_reviewer} \u00b7 {sev_label}] {finding.claim}**\n\n"
        f"{finding.reasoning}\n\n"
        f"> ```\n" + "\n".join(f"> {line}" for line in finding.quoted_code.splitlines()) + "\n> ```\n\n"
        f"**Suggested fix:** {finding.suggested_fix}\n\n"
        f"*Found by: {finding.source_reviewer} reviewer*"
    )


def format_review_summary(findings: list[Finding], stats: dict) -> str:
    if not findings:
        return "## Review Summary\n\n\u2705 No issues found. PR looks clean."
    must_fix = sum(1 for f in findings if f.severity == Severity.MUST_FIX)
    nice = len(findings) - must_fix
    cost = stats.get("total_cost_usd", 0)
    duration = stats.get("duration_s", 0)
    halluc = stats.get("hallucination_rate", 0)
    reviewers = set(f.source_reviewer for f in findings)
    return (
        f"## Review Summary\n\n"
        f"**{len(findings)} findings** ({must_fix} must-fix, {nice} nice-to-have)\n\n"
        f"| Metric | Value |\n|--------|-------|\n"
        f"| Reviewers | {', '.join(sorted(reviewers))} |\n"
        f"| Cost | ${cost:.2f} |\n"
        f"| Duration | {duration:.0f}s |\n"
        f"| Hallucination rate | {halluc:.0%} |\n"
    )


def post_pr_review(pr_number: int, repo: str, findings: list[Finding],
                    stats: dict, cwd: str | None = None) -> bool:
    summary = format_review_summary(findings, stats)
    comments = []
    for f in findings:
        comment = {
            "path": f.file,
            "line": f.line_end,
            "body": format_comment_body(f),
        }
        if f.line_end > f.line_start:
            comment["start_line"] = f.line_start
        comments.append(comment)

    payload = json.dumps({
        "body": summary,
        "event": "COMMENT",
        "comments": comments,
    })

    result = subprocess.run(
        ["gh", "api", f"repos/{repo}/pulls/{pr_number}/reviews",
         "--method", "POST", "--input", "-"],
        input=payload, capture_output=True, text=True,
        cwd=cwd,
    )
    return result.returncode == 0
