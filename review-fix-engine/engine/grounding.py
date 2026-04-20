from __future__ import annotations
from pathlib import Path
from .schema import Finding, GroundResult


def _normalize(s: str) -> str:
    lines = [line.strip() for line in s.strip().splitlines()]
    return "\n".join(" ".join(line.split()) for line in lines)


def _ground_one(finding: Finding, repo: Path, sliding_window: int = 10) -> tuple[bool, str | None]:
    file_path = (repo / finding.file).resolve()
    try:
        file_path.relative_to(repo.resolve())
    except ValueError:
        return False, f"file path escapes repo: {finding.file}"

    if not file_path.is_file():
        return False, f"file not found: {finding.file}"

    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return False, f"read error: {e}"

    file_lines = content.splitlines()
    total_lines = len(file_lines)

    if finding.line_start < 1 or finding.line_start > total_lines:
        return False, f"line_start {finding.line_start} out of bounds (file has {total_lines} lines)"

    line_end = finding.line_end or finding.line_start
    if line_end > total_lines or finding.line_start > line_end:
        return False, f"line range {finding.line_start}-{line_end} out of bounds"

    actual = "\n".join(file_lines[finding.line_start - 1 : line_end])
    if _normalize(actual) == _normalize(finding.quoted_code):
        return True, None

    search_start = max(0, finding.line_start - 1 - sliding_window)
    search_end = min(total_lines, line_end + sliding_window)
    span_size = line_end - finding.line_start + 1

    for offset in range(search_start, search_end - span_size + 1):
        window = "\n".join(file_lines[offset : offset + span_size])
        if _normalize(window) == _normalize(finding.quoted_code):
            return True, None

    return False, "quoted_code does not match file content at given lines"


def verify(findings: list[Finding], repo_root: Path, sliding_window: int = 10) -> GroundResult:
    grounded: list[Finding] = []
    dropped: list[dict] = []
    for f in findings:
        ok, err = _ground_one(f, repo_root, sliding_window)
        if ok:
            grounded.append(f)
        else:
            dropped.append({**f.model_dump(), "grounding_error": err})
    total = len(grounded) + len(dropped)
    return GroundResult(
        grounded=grounded, dropped=dropped,
        raw_count=total, grounded_count=len(grounded), dropped_count=len(dropped),
        hallucination_rate=(len(dropped) / total) if total else 0.0,
    )
