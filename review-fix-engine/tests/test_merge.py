from engine.schema import Finding, Severity, Category
from engine.merge import merge_and_dedup


def _f(id: str, file: str = "a.js", line_start: int = 1, line_end: int = 1,
       severity: Severity = Severity.MUST_FIX, source: str = "logic") -> Finding:
    return Finding(
        id=id, severity=severity, category=Category.CORRECTNESS,
        claim="issue", file=file, line_start=line_start, line_end=line_end,
        quoted_code="x", suggested_fix="y", source_reviewer=source,
    )


class TestMergeAndDedup:
    def test_merge_assigns_sequential_ids(self):
        findings = {
            "security": [_f("F-S01", line_start=1, line_end=1, source="security")],
            "logic": [
                _f("F-L01", line_start=2, line_end=2, source="logic"),
                _f("F-L02", line_start=3, line_end=3, source="logic"),
            ],
        }
        result = merge_and_dedup(findings)
        ids = [f.id for f in result]
        assert ids == ["F-001", "F-002", "F-003"]

    def test_dedup_same_location_keeps_higher_severity(self):
        findings = {
            "security": [_f("F-S01", file="a.js", line_start=10, line_end=15,
                           severity=Severity.MUST_FIX, source="security")],
            "logic": [_f("F-L01", file="a.js", line_start=10, line_end=15,
                        severity=Severity.NICE_TO_HAVE, source="logic")],
        }
        result = merge_and_dedup(findings)
        assert len(result) == 1
        assert result[0].severity == Severity.MUST_FIX
        assert result[0].source_reviewer == "security"

    def test_different_locations_no_dedup(self):
        findings = {
            "security": [_f("F-S01", file="a.js", line_start=10, source="security")],
            "logic": [_f("F-L01", file="a.js", line_start=20, source="logic")],
        }
        result = merge_and_dedup(findings)
        assert len(result) == 2

    def test_empty_input(self):
        result = merge_and_dedup({})
        assert result == []

    def test_preserves_source_reviewer(self):
        findings = {
            "edge_case": [_f("F-E01", source="edge_case")],
        }
        result = merge_and_dedup(findings)
        assert result[0].source_reviewer == "edge_case"
