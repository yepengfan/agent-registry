from engine.schema import Finding, Severity, Category
from engine.github import format_comment_body, format_review_summary


def _f(id="F-001", source="security", severity=Severity.MUST_FIX, **kw) -> Finding:
    defaults = dict(
        category=Category.SECURITY, claim="SQL injection",
        reasoning="Dangerous", file="api.js", line_start=42, line_end=48,
        quoted_code="const q = x + y", suggested_fix="Use params",
        source_reviewer=source,
    )
    defaults.update(kw)
    return Finding(id=id, severity=severity, **defaults)


class TestFormatComment:
    def test_includes_source_reviewer(self):
        body = format_comment_body(_f(source="security"))
        assert "security" in body

    def test_includes_severity(self):
        body = format_comment_body(_f(severity=Severity.MUST_FIX))
        assert "must-fix" in body

    def test_includes_suggested_fix(self):
        body = format_comment_body(_f(suggested_fix="Use parameterized queries"))
        assert "parameterized" in body


class TestReviewSummary:
    def test_summary_includes_counts(self):
        findings = [_f(id="F-001"), _f(id="F-002", severity=Severity.NICE_TO_HAVE)]
        stats = {"total_cost_usd": 1.70, "duration_s": 250, "hallucination_rate": 0.1}
        summary = format_review_summary(findings, stats)
        assert "2 findings" in summary
        assert "1 must-fix" in summary

    def test_empty_findings_summary(self):
        summary = format_review_summary([], {})
        assert "0 findings" in summary or "clean" in summary.lower()
