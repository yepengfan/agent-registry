import tempfile
from pathlib import Path
from engine.schema import Finding, Severity, Category
from engine.grounding import verify


def _f(**overrides) -> Finding:
    defaults = dict(
        id="F-001", severity=Severity.MUST_FIX, category=Category.CORRECTNESS,
        claim="issue", file="src/foo.js", line_start=1, line_end=1,
        quoted_code="const x = 1", suggested_fix="fix",
    )
    defaults.update(overrides)
    return Finding(**defaults)


def _repo(files: dict[str, str]) -> Path:
    tmp = Path(tempfile.mkdtemp())
    for name, content in files.items():
        p = tmp / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)
    return tmp


class TestGrounding:
    def test_exact_match(self):
        repo = _repo({"src/foo.js": "const x = 1\n"})
        result = verify([_f()], repo)
        assert result.grounded_count == 1

    def test_file_not_found(self):
        result = verify([_f()], _repo({}))
        assert result.dropped_count == 1
        assert "file not found" in result.dropped[0]["grounding_error"]

    def test_quoted_code_mismatch(self):
        repo = _repo({"src/foo.js": "const y = 2\n"})
        result = verify([_f()], repo)
        assert result.dropped_count == 1

    def test_path_traversal_blocked(self):
        repo = _repo({"src/foo.js": "ok\n"})
        result = verify([_f(file="../../../etc/passwd", quoted_code="root")], repo)
        assert "escapes repo" in result.dropped[0]["grounding_error"]

    def test_sliding_window(self):
        lines = [f"line{i}" for i in range(20)]
        repo = _repo({"src/foo.js": "\n".join(lines) + "\n"})
        result = verify([_f(line_start=5, line_end=5, quoted_code="line7")], repo)
        assert result.grounded_count == 1

    def test_hallucination_rate(self):
        repo = _repo({"a.js": "real\n"})
        findings = [
            _f(id="F-001", file="a.js", quoted_code="real"),
            _f(id="F-002", file="a.js", quoted_code="fake"),
        ]
        result = verify(findings, repo)
        assert result.hallucination_rate == 0.5

    def test_empty_findings(self):
        result = verify([], _repo({}))
        assert result.hallucination_rate == 0.0
