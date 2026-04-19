from __future__ import annotations
from .schema import Finding, Severity


_SEVERITY_RANK = {Severity.MUST_FIX: 2, Severity.NICE_TO_HAVE: 1}


def _fingerprint(f: Finding) -> tuple:
    return (f.file, f.line_start, f.line_end)


def merge_and_dedup(findings_by_reviewer: dict[str, list[Finding]]) -> list[Finding]:
    """Merge findings from multiple reviewers, dedup by location, assign sequential IDs."""
    all_findings: list[Finding] = []
    for findings in findings_by_reviewer.values():
        all_findings.extend(findings)

    seen: dict[tuple, Finding] = {}
    for f in all_findings:
        key = _fingerprint(f)
        if key in seen:
            existing = seen[key]
            if _SEVERITY_RANK.get(f.severity, 0) > _SEVERITY_RANK.get(existing.severity, 0):
                seen[key] = f
        else:
            seen[key] = f

    deduped = list(seen.values())
    for i, f in enumerate(deduped, 1):
        f.id = f"F-{i:03d}"

    return deduped
