from engine.schema import Finding, ReviewOutput, Severity, Category


class TestFinding:
    def test_create_valid_finding(self):
        f = Finding(
            id="F-001", severity=Severity.MUST_FIX, category=Category.SECURITY,
            claim="SQL injection", file="api.js", line_start=42, line_end=48,
            quoted_code="const q = x + y", suggested_fix="Use params",
            source_reviewer="security",
        )
        assert f.id == "F-001"
        assert f.severity == Severity.MUST_FIX
        assert f.source_reviewer == "security"

    def test_default_reasoning_and_source(self):
        f = Finding(
            id="F-001", severity=Severity.MUST_FIX, category=Category.CORRECTNESS,
            claim="Bug", file="a.js", line_start=1, line_end=1,
            quoted_code="x", suggested_fix="y",
        )
        assert f.reasoning == ""
        assert f.source_reviewer == ""

    def test_line_start_must_be_positive(self):
        import pytest
        with pytest.raises(Exception):
            Finding(
                id="F-001", severity=Severity.MUST_FIX, category=Category.CORRECTNESS,
                claim="Bug", file="a.js", line_start=0, line_end=1,
                quoted_code="x", suggested_fix="y",
            )

    def test_line_end_less_than_line_start_rejected(self):
        import pytest
        with pytest.raises(Exception):
            Finding(
                id="F-001", severity=Severity.MUST_FIX, category=Category.CORRECTNESS,
                claim="Bug", file="a.js", line_start=10, line_end=5,
                quoted_code="x", suggested_fix="y",
            )


class TestReviewOutput:
    def test_empty_findings_valid(self):
        output = ReviewOutput(summary="Clean PR", findings=[])
        assert len(output.findings) == 0

    def test_parse_from_dict(self):
        data = {
            "summary": "Found issues",
            "findings": [{
                "id": "F-001", "severity": "must-fix", "category": "security",
                "claim": "Injection", "file": "a.js", "line_start": 1,
                "line_end": 1, "quoted_code": "x", "suggested_fix": "y",
            }]
        }
        output = ReviewOutput.model_validate(data)
        assert len(output.findings) == 1
        assert output.findings[0].severity == Severity.MUST_FIX
