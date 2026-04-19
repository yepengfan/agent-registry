# Review-Fix Engine Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python CLI tool that reviews PRs using 3 specialized parallel Claude agents, filters findings through self-reflection and grounding, and posts results as GitHub PR inline comments.

**Architecture:** Python orchestrator calls Claude Agent SDK to run 3 specialized reviewers (security, logic, edge-case) in parallel. Findings are merged, scored via self-reflection, verified via grounding against real files, and posted as GitHub PR review comments. The orchestrator is deterministic code; LLMs only do the creative review work.

**Tech Stack:** Python 3.11+, claude-agent-sdk, pydantic, pytest, gh CLI

**Design spec:** `docs/superpowers/specs/2026-04-17-review-fix-engine-design.md`
**POC reference:** PR #31 (`poc/agent-sdk-review-loop` branch)

---

## File Structure

```
review-fix-engine/
├── engine/
│   ├── __init__.py            # empty
│   ├── __main__.py            # python -m engine entrypoint
│   ├── config.py              # Config dataclass with defaults
│   ├── schema.py              # Pydantic models: Finding, ReviewOutput, GroundResult
│   ├── agents.py              # Agent SDK wrappers: review_single, review_parallel, self_reflect
│   ├── merge.py               # merge_findings, dedup_findings
│   ├── grounding.py           # verify findings against real files
│   ├── github.py              # post_pr_review via gh api
│   ├── progress.py            # streaming display + heartbeat
│   ├── orchestrator.py        # main run() flow
│   └── cli.py                 # argparse + summary
├── agents/
│   ├── reviewer_base.md       # shared schema, rules, process
│   ├── reviewer_security.md   # security focus overlay
│   ├── reviewer_logic.md      # logic correctness focus
│   └── reviewer_edge_case.md  # boundary conditions focus
├── tests/
│   ├── __init__.py
│   ├── test_schema.py
│   ├── test_merge.py
│   ├── test_grounding.py
│   └── test_github.py
├── pyproject.toml
└── DESIGN_PRINCIPLES.md       # copy from POC
```

---

### Task 1: Project Setup

**Files:**
- Create: `review-fix-engine/pyproject.toml`
- Create: `review-fix-engine/engine/__init__.py`
- Create: `review-fix-engine/engine/__main__.py`
- Create: `review-fix-engine/tests/__init__.py`
- Copy: `review-fix-engine/DESIGN_PRINCIPLES.md` (from POC branch)

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p review-fix-engine/engine review-fix-engine/agents review-fix-engine/tests
```

- [ ] **Step 2: Create pyproject.toml**

```toml
[project]
name = "review-fix-engine"
version = "0.1.0"
description = "PR review engine with parallel specialized reviewers"
requires-python = ">=3.11"
dependencies = [
    "claude-agent-sdk>=0.1.0",
    "pydantic>=2.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.0"]

[project.scripts]
review-fix = "engine.cli:main"
```

- [ ] **Step 3: Create module files**

`engine/__init__.py` — empty file

`engine/__main__.py`:
```python
from .cli import main
main()
```

`tests/__init__.py` — empty file

- [ ] **Step 4: Create venv and install**

```bash
cd review-fix-engine
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Run: `python -c "import engine; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add review-fix-engine/
git commit -m "feat: scaffold review-fix-engine project"
```

---

### Task 2: Schema (Pydantic Models)

**Files:**
- Create: `review-fix-engine/engine/schema.py`
- Create: `review-fix-engine/tests/test_schema.py`

- [ ] **Step 1: Write schema tests**

```python
# tests/test_schema.py
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source .venv/bin/activate && python -m pytest tests/test_schema.py -v`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement schema.py**

```python
# engine/schema.py
from __future__ import annotations
from enum import Enum
from pydantic import BaseModel, Field


class Severity(str, Enum):
    MUST_FIX = "must-fix"
    NICE_TO_HAVE = "nice-to-have"


class Category(str, Enum):
    CORRECTNESS = "correctness"
    SECURITY = "security"
    STYLE = "style"
    TESTING = "testing"
    OTHER = "other"


class Finding(BaseModel):
    id: str = Field(description="Unique ID like F-001")
    severity: Severity
    category: Category
    claim: str = Field(description="One-sentence description")
    reasoning: str = Field(default="", description="Why this is a problem")
    file: str = Field(description="File path relative to repo root")
    line_start: int = Field(ge=1)
    line_end: int = Field(ge=1)
    quoted_code: str = Field(description="Verbatim code from the diff")
    suggested_fix: str = Field(description="Concrete fix")
    source_reviewer: str = Field(default="", description="Which reviewer found this")


class ReviewOutput(BaseModel):
    summary: str = Field(default="")
    findings: list[Finding] = Field(default_factory=list)


class GroundResult(BaseModel):
    grounded: list[Finding] = Field(default_factory=list)
    dropped: list[dict] = Field(default_factory=list)
    raw_count: int = 0
    grounded_count: int = 0
    dropped_count: int = 0
    hallucination_rate: float = 0.0
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_schema.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add engine/schema.py tests/test_schema.py
git commit -m "feat: pydantic schema models for findings"
```

---

### Task 3: Config

**Files:**
- Create: `review-fix-engine/engine/config.py`

- [ ] **Step 1: Implement config.py**

```python
# engine/config.py
from dataclasses import dataclass, field
from pathlib import Path
import subprocess


def _git_root() -> Path:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            return Path(result.stdout.strip())
    except Exception:
        pass
    return Path.cwd()


@dataclass
class Config:
    cwd: Path = field(default_factory=_git_root)
    pr_number: int | None = None
    repo: str | None = None
    diff_file: Path | None = None
    dry_run: bool = False

    max_rounds: int = 3
    reviewer_max_turns: int = 5
    fixer_max_turns: int = 30
    score_threshold: int = 5

    reviewers: list[str] = field(default_factory=lambda: ["security", "logic", "edge_case"])

    state_dir: str = ".pr-review-state"
    test_cmd: str = "npm test"
    lint_cmd: str = ""
    build_cmd: str = ""
```

- [ ] **Step 2: Verify import**

Run: `python -c "from engine.config import Config; c = Config(); print(c.cwd)"`
Expected: prints the git repo root

- [ ] **Step 3: Commit**

```bash
git add engine/config.py
git commit -m "feat: engine config with git root detection"
```

---

### Task 4: Merge + Dedup

**Files:**
- Create: `review-fix-engine/engine/merge.py`
- Create: `review-fix-engine/tests/test_merge.py`

- [ ] **Step 1: Write merge tests**

```python
# tests/test_merge.py
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
            "security": [_f("F-S01", source="security")],
            "logic": [_f("F-L01", source="logic"), _f("F-L02", source="logic")],
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_merge.py -v`
Expected: FAIL

- [ ] **Step 3: Implement merge.py**

```python
# engine/merge.py
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
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_merge.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add engine/merge.py tests/test_merge.py
git commit -m "feat: merge and dedup findings from parallel reviewers"
```

---

### Task 5: Grounding

**Files:**
- Create: `review-fix-engine/engine/grounding.py`
- Create: `review-fix-engine/tests/test_grounding.py`

Port from POC (`poc/agent-sdk-review-loop` branch, `poc/engine/grounding.py`). The implementation is identical — normalize whitespace, path traversal prevention, sliding window ±10 lines.

- [ ] **Step 1: Write grounding tests**

```python
# tests/test_grounding.py
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
```

- [ ] **Step 2: Run tests to verify fail**

Run: `python -m pytest tests/test_grounding.py -v`
Expected: FAIL

- [ ] **Step 3: Implement grounding.py**

```python
# engine/grounding.py
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
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_grounding.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add engine/grounding.py tests/test_grounding.py
git commit -m "feat: grounding verification with sliding window"
```

---

### Task 6: GitHub PR Comments

**Files:**
- Create: `review-fix-engine/engine/github.py`
- Create: `review-fix-engine/tests/test_github.py`

- [ ] **Step 1: Write tests**

```python
# tests/test_github.py
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
```

- [ ] **Step 2: Run tests to verify fail**

Run: `python -m pytest tests/test_github.py -v`
Expected: FAIL

- [ ] **Step 3: Implement github.py**

```python
# engine/github.py
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
        f"> ```\n> {finding.quoted_code}\n> ```\n\n"
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
        comments.append({
            "path": f.file,
            "line": f.line_start,
            "body": format_comment_body(f),
        })

    payload = json.dumps({
        "body": summary,
        "event": "COMMENT",
        "comments": comments,
    })

    repo_flag = f"--repo {repo}" if repo else ""
    result = subprocess.run(
        f"gh api repos/{repo}/pulls/{pr_number}/reviews --method POST --input -",
        input=payload, shell=True, capture_output=True, text=True,
        cwd=cwd,
    )
    return result.returncode == 0
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_github.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add engine/github.py tests/test_github.py
git commit -m "feat: GitHub PR review comment posting"
```

---

### Task 7: Progress Display

**Files:**
- Create: `review-fix-engine/engine/progress.py`

- [ ] **Step 1: Implement progress.py**

```python
# engine/progress.py
from __future__ import annotations
import sys
import time


class C:
    RESET = "\x1b[0m"
    DIM = "\x1b[2m"
    BOLD = "\x1b[1m"
    CYAN = "\x1b[36m"
    GREEN = "\x1b[32m"
    YELLOW = "\x1b[33m"
    RED = "\x1b[31m"
    MAGENTA = "\x1b[35m"


def phase(name: str):
    print(f"\n{C.BOLD}--- {name} ---{C.RESET}\n", flush=True)


def info(tag: str, msg: str):
    print(f"{C.CYAN}[{tag}]{C.RESET} {msg}", flush=True)


def success(tag: str, msg: str):
    print(f"{C.GREEN}[{tag}]{C.RESET} {msg}", flush=True)


def warn(tag: str, msg: str):
    print(f"{C.YELLOW}[{tag}]{C.RESET} {msg}", flush=True)


def error(tag: str, msg: str):
    print(f"{C.RED}[{tag}]{C.RESET} {msg}", flush=True)


def finding(f, indent: str = "  "):
    sev = f.severity.value
    color = C.RED if sev == "must-fix" else C.DIM
    src = f.source_reviewer or "?"
    print(f"{indent}{color}[{sev}]{C.RESET} [{src}] {f.id}: {f.claim} ({f.file}:{f.line_start})", flush=True)


def ground_result(grounded: list, dropped: list, duration_s: float):
    total = len(grounded) + len(dropped)
    rate = (len(dropped) / total * 100) if total else 0
    info("ground", f"{len(grounded)} grounded, {len(dropped)} dropped ({rate:.0f}% hallucination) {C.DIM}({duration_s:.1f}s){C.RESET}")
    for f in grounded:
        print(f"  {C.GREEN}\u2713{C.RESET} {f.id}: {f.claim}", flush=True)
    for d in dropped:
        print(f"  {C.RED}\u2717{C.RESET} {d.get('id', '?')}: {d.get('grounding_error', '?')}", flush=True)


def sdk_message(message, tag: str):
    from claude_agent_sdk import StreamEvent, AssistantMessage, ResultMessage, SystemMessage

    if isinstance(message, StreamEvent):
        event = message.event
        if isinstance(event, dict) and event.get("type") == "content_block_delta":
            delta = event.get("delta", {})
            if delta.get("type") == "text_delta":
                sys.stdout.write(f"{C.DIM}{delta.get('text', '')}{C.RESET}")
                sys.stdout.flush()

    elif isinstance(message, AssistantMessage):
        content = getattr(getattr(message, "message", None), "content", None) or []
        for block in content:
            btype = block.get("type") if isinstance(block, dict) else getattr(block, "type", None)
            if btype == "tool_use":
                name = block.get("name", "?") if isinstance(block, dict) else getattr(block, "name", "?")
                print(f"\n{C.CYAN}[{tag}]{C.RESET} {C.MAGENTA}tool:{C.RESET} {name}", flush=True)

    elif isinstance(message, ResultMessage):
        cost = message.total_cost_usd
        turns = message.num_turns
        cost_str = f"${cost:.4f}" if cost else "?"
        print(f"\n{C.CYAN}[{tag}]{C.RESET} {C.GREEN}Done{C.RESET} (cost: {cost_str}, turns: {turns or '?'})", flush=True)


class Timer:
    def __init__(self):
        self._start = time.monotonic()

    def elapsed(self) -> float:
        return time.monotonic() - self._start
```

- [ ] **Step 2: Verify import**

Run: `python -c "from engine.progress import info, phase, Timer; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add engine/progress.py
git commit -m "feat: progress display with color output"
```

---

### Task 8: Reviewer Prompts

**Files:**
- Create: `review-fix-engine/agents/reviewer_base.md`
- Create: `review-fix-engine/agents/reviewer_security.md`
- Create: `review-fix-engine/agents/reviewer_logic.md`
- Create: `review-fix-engine/agents/reviewer_edge_case.md`

- [ ] **Step 1: Write base prompt**

`agents/reviewer_base.md`:
````markdown
# Code Reviewer

You review a PR diff and output findings as strict JSON. Your output is consumed by a downstream workflow that verifies each finding against actual files. Findings with inaccurate quoted_code will be dropped.

## Output format

Output ONLY a JSON object — no markdown fences, no prose before or after:

```
{"summary": "...", "findings": [{"id": "F-001", "severity": "must-fix", "category": "correctness", "claim": "...", "reasoning": "...", "file": "...", "line_start": 42, "line_end": 48, "quoted_code": "...", "suggested_fix": "..."}]}
```

severity: "must-fix" or "nice-to-have"
category: "correctness", "security", "style", "testing", or "other"

## Critical rules

1. **quoted_code MUST be verbatim.** Copy exact lines from the diff including whitespace. Do not paraphrase. If you cannot quote exactly, omit the finding.

2. **file and line numbers MUST match.** Extract from diff headers (e.g., `@@ -10,6 +10,15 @@`). line_start/line_end refer to the new file's line numbers.

3. **Empty findings is valid.** If the PR is clean, output `{"summary": "...", "findings": []}`. Do not invent issues.

4. **Focus on what the PR changes.** Don't report pre-existing issues in untouched code.

5. **Do NOT use tools.** Analyze purely from the diff provided. The orchestrator verifies findings afterward.

## Severity calibration

- must-fix: bugs, security issues, broken behavior, missing critical tests
- nice-to-have: style, naming, minor improvements, non-critical refactors
````

- [ ] **Step 2: Write security focus**

`agents/reviewer_security.md`:
```markdown
# Security Focus

You are a security specialist. Focus ONLY on security vulnerabilities in the PR diff.

Look for:
- SQL/NoSQL injection, command injection, XSS, SSRF
- Authentication/authorization bypass
- Secret/credential leakage (API keys, tokens, passwords in code)
- Insecure cryptography (Math.random for tokens, weak hashing)
- Path traversal, directory traversal
- Unsafe deserialization
- Missing input validation on trust boundaries

Do NOT report: style issues, performance, non-security logic bugs. Leave those to other reviewers.
```

- [ ] **Step 3: Write logic focus**

`agents/reviewer_logic.md`:
```markdown
# Logic & Correctness Focus

You are a correctness specialist. Focus ONLY on logic errors and bugs in the PR diff.

Look for:
- Null/undefined access, TypeError potential
- Off-by-one errors in loops, array indexing, slicing
- Incorrect conditional logic (wrong operator, inverted condition)
- Unhandled exceptions, missing error paths
- Race conditions, concurrency issues
- Type mismatches, wrong function signatures
- Dead code that indicates a logic error (unreachable branches)

Do NOT report: security issues, style preferences, test coverage. Leave those to other reviewers.
```

- [ ] **Step 4: Write edge-case focus**

`agents/reviewer_edge_case.md`:
```markdown
# Edge Case & Quality Focus

You are a quality specialist. Focus on boundary conditions, missing validations, and test coverage gaps.

Look for:
- Missing null/undefined/empty checks at function boundaries
- Empty array, empty string, zero-value handling
- Missing test coverage for new behavior
- API contract mismatches (caller expects different return shape)
- Error messages that leak internal details
- Resource cleanup (unclosed handles, missing finally blocks)
- Inconsistent behavior between similar code paths

Do NOT report: security vulnerabilities, basic logic bugs. Leave those to other reviewers.
```

- [ ] **Step 5: Commit**

```bash
git add agents/
git commit -m "feat: reviewer prompts (base + security, logic, edge-case)"
```

---

### Task 9: Agents (SDK Wrappers)

**Files:**
- Create: `review-fix-engine/engine/agents.py`

This is the core module that calls the Claude Agent SDK. Implements `review_single`, `review_parallel`, and `self_reflect`.

- [ ] **Step 1: Implement agents.py**

```python
# engine/agents.py
from __future__ import annotations

import asyncio
import json
import re
import time
from pathlib import Path

from claude_agent_sdk import (
    query, ClaudeAgentOptions, ResultMessage, AssistantMessage,
)

from .schema import Finding, ReviewOutput
from .progress import sdk_message, info, warn, C


def _load_prompt(path: Path) -> str:
    return path.read_text().strip()


def _extract_json(text: str) -> dict | None:
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    fence = re.search(r"```(?:json)?\s*\n([\s\S]*?)\n```", text)
    if fence:
        try:
            return json.loads(fence.group(1))
        except json.JSONDecodeError:
            pass
    brace = text.find("{")
    if brace >= 0:
        depth = 0
        for i in range(brace, len(text)):
            if text[i] == "{": depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[brace:i+1])
                    except json.JSONDecodeError:
                        break
    return None


async def _run_query(prompt: str, options: ClaudeAgentOptions, tag: str) -> tuple[ResultMessage, str]:
    start = time.monotonic()
    result_msg = None
    last_text = ""
    msg_count = 0
    last_heartbeat = start

    try:
        async for message in query(prompt=prompt, options=options):
            msg_count += 1
            now = time.monotonic()
            if now - last_heartbeat >= 30:
                info(tag, f"still working... {now - start:.0f}s elapsed, {msg_count} messages")
                last_heartbeat = now
            sdk_message(message, tag)
            if isinstance(message, ResultMessage):
                result_msg = message
            elif isinstance(message, AssistantMessage):
                content = getattr(getattr(message, "message", None), "content", None) or []
                for block in content:
                    text = block.get("text") if isinstance(block, dict) else getattr(block, "text", None)
                    if text:
                        last_text = text
    except Exception as e:
        if result_msg:
            pass  # post-result cleanup exception, ignore
        else:
            raise

    if result_msg is None:
        raise RuntimeError(f"[{tag}] query returned no result")
    return result_msg, last_text


async def review_single(
    name: str, base_prompt: str, focus_prompt: str,
    diff: str, gates_summary: str, round_num: int,
    cwd: Path, max_turns: int = 5,
) -> tuple[list[Finding], float]:
    tag = name
    prompt = f"""{base_prompt}

## Your specialized focus
{focus_prompt}

---

DETERMINISTIC FACTS (accept as given):
{gates_summary}

Round: {round_num}

PR diff:
```diff
{diff}
```"""

    options = ClaudeAgentOptions(
        permission_mode="dontAsk",
        cwd=cwd,
        max_turns=max_turns,
        include_partial_messages=True,
    )

    result, last_text = await _run_query(prompt, options, tag)

    findings: list[Finding] = []
    text = result.result or last_text
    parsed = _extract_json(text)
    if parsed:
        output = ReviewOutput.model_validate(parsed)
        for f in output.findings:
            f.source_reviewer = name
        findings = output.findings
    elif text:
        warn(tag, f"Could not parse JSON: {text[:200]}")

    cost = result.total_cost_usd or 0.0
    return findings, cost


async def review_parallel(
    reviewers: list[str], agents_dir: Path,
    diff: str, gates_summary: str, round_num: int,
    cwd: Path, max_turns: int = 5,
) -> tuple[dict[str, list[Finding]], float]:
    base_prompt = _load_prompt(agents_dir / "reviewer_base.md")

    tasks = []
    for name in reviewers:
        focus_prompt = _load_prompt(agents_dir / f"reviewer_{name}.md")
        tasks.append(review_single(
            name, base_prompt, focus_prompt,
            diff, gates_summary, round_num, cwd, max_turns,
        ))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    findings_by_reviewer: dict[str, list[Finding]] = {}
    total_cost = 0.0

    for name, result in zip(reviewers, results):
        if isinstance(result, Exception):
            warn(name, f"reviewer failed: {result}")
            continue
        findings, cost = result
        findings_by_reviewer[name] = findings
        total_cost += cost
        info(name, f"found {len(findings)} issues (${cost:.4f})")

    return findings_by_reviewer, total_cost


async def self_reflect(
    findings: list[Finding], diff: str,
    cwd: Path, score_threshold: int = 5,
) -> tuple[list[Finding], float]:
    if not findings:
        return [], 0.0

    findings_json = json.dumps([f.model_dump() for f in findings], indent=2)

    prompt = f"""Score each code review finding 0-10 for accuracy and importance.

Rules:
- 0: Wrong, hallucinated, or not in the diff
- 1-4: Minor, low impact
- 5-7: Real issue, moderate impact
- 8-10: Critical, must fix

Output ONLY a JSON object:
{{"scores": [{{"id": "F-001", "score": 8, "reason": "one sentence"}}]}}

Findings to score:
{findings_json}

Diff for reference:
```diff
{diff[:50000]}
```"""

    options = ClaudeAgentOptions(
        permission_mode="dontAsk",
        cwd=cwd,
        max_turns=2,
    )

    result, last_text = await _run_query(prompt, options, "reflect")
    cost = result.total_cost_usd or 0.0

    text = result.result or last_text
    parsed = _extract_json(text)
    if not parsed or "scores" not in parsed:
        warn("reflect", "Could not parse scores, keeping all findings")
        return findings, cost

    score_map = {s["id"]: s["score"] for s in parsed["scores"] if "id" in s and "score" in s}
    filtered = [f for f in findings if score_map.get(f.id, 10) >= score_threshold]
    dropped = len(findings) - len(filtered)
    if dropped:
        info("reflect", f"filtered {dropped} low-confidence findings (threshold={score_threshold})")

    return filtered, cost
```

- [ ] **Step 2: Verify import**

Run: `python -c "from engine.agents import review_parallel, self_reflect; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add engine/agents.py
git commit -m "feat: agent SDK wrappers for parallel review and self-reflection"
```

---

### Task 10: Orchestrator

**Files:**
- Create: `review-fix-engine/engine/orchestrator.py`

- [ ] **Step 1: Implement orchestrator.py**

```python
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


def _checkout_pr(config: Config) -> str | None:
    if not config.pr_number:
        return None
    repo_flag = f"--repo {config.repo}" if config.repo else ""
    result = subprocess.run(
        f"gh pr view {config.pr_number} {repo_flag} --json headRefName -q .headRefName",
        shell=True, capture_output=True, text=True, cwd=config.cwd,
    )
    branch = result.stdout.strip()
    if not branch:
        return None

    current = subprocess.run(
        "git branch --show-current", shell=True, capture_output=True, text=True, cwd=config.cwd,
    ).stdout.strip()
    if current == branch:
        return branch

    r = subprocess.run(
        f"gh pr checkout {config.pr_number} {repo_flag}",
        shell=True, capture_output=True, text=True, cwd=config.cwd,
    )
    return branch if r.returncode == 0 else None


def _get_diff(config: Config) -> str:
    if config.diff_file:
        return config.diff_file.read_text()
    if config.pr_number:
        repo_flag = f"--repo {config.repo}" if config.repo else ""
        return subprocess.run(
            f"gh pr diff {config.pr_number} {repo_flag}",
            shell=True, capture_output=True, text=True, cwd=config.cwd,
        ).stdout
    return ""


def _gates_summary(config: Config) -> str:
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


async def run(config: Config) -> dict:
    timer = p.Timer()
    agents_dir = Path(__file__).parent.parent / "agents"

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
        agents_dir=agents_dir,
        diff=diff,
        gates_summary=gates_summary,
        round_num=1,
        cwd=config.cwd,
        max_turns=config.reviewer_max_turns,
    )

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
    reflected, reflect_cost = await agents.self_reflect(
        findings=merged, diff=diff, cwd=config.cwd,
        score_threshold=config.score_threshold,
    )
    total_cost = review_cost + reflect_cost
    p.info("reflect", f"{len(reflected)} findings after scoring (${reflect_cost:.4f})")

    # Grounding
    p.phase("Grounding")
    gt = p.Timer()
    ground_result = grounding.verify(reflected, config.cwd)
    p.ground_result(ground_result.grounded, ground_result.dropped, gt.elapsed())

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
```

- [ ] **Step 2: Verify import**

Run: `python -c "from engine.orchestrator import run; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add engine/orchestrator.py
git commit -m "feat: orchestrator wiring review pipeline"
```

---

### Task 11: CLI

**Files:**
- Create: `review-fix-engine/engine/cli.py`

- [ ] **Step 1: Implement cli.py**

```python
# engine/cli.py
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from .config import Config
from .orchestrator import run
from .progress import C, info, success, error


def parse_args() -> Config:
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
    args = parser.parse_args()

    config = Config(
        pr_number=args.pr,
        repo=args.repo,
        diff_file=args.diff_file,
        dry_run=args.dry_run,
        reviewers=args.reviewers.split(","),
        score_threshold=args.score_threshold,
        test_cmd=args.test_cmd,
    )
    if args.cwd:
        config.cwd = args.cwd
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
```

- [ ] **Step 2: Verify CLI help**

Run: `python -m engine --help`
Expected: shows usage with --pr, --repo, --dry-run, --reviewers flags

- [ ] **Step 3: Commit**

```bash
git add engine/cli.py engine/__main__.py
git commit -m "feat: CLI with argparse and summary output"
```

---

### Task 12: Integration Test

- [ ] **Step 1: Run all unit tests**

```bash
source .venv/bin/activate
python -m pytest tests/ -v
```

Expected: all tests pass

- [ ] **Step 2: Dry-run with sample diff**

Create a sample diff file for testing without a real PR:

```bash
cat > /tmp/sample.diff << 'DIFF'
diff --git a/lib/example.js b/lib/example.js
--- a/lib/example.js
+++ b/lib/example.js
@@ -10,6 +10,15 @@ function validateInput(input) {
   return true
 }
 
+function processUserData(data) {
+  const query = "SELECT * FROM users WHERE id = " + data.userId
+  const result = db.execute(query)
+  if (result == null) {
+    return { error: "not found" }
+  }
+  return { user: result, token: Math.random().toString(36) }
+}
+
 module.exports = { validateInput }
DIFF
```

```bash
python -m engine --diff-file /tmp/sample.diff --dry-run
```

Expected: 3 reviewers run in parallel, findings produced, self-reflection scores them, grounding drops them (sample file doesn't exist), summary printed.

- [ ] **Step 3: Test with real PR**

```bash
python -m engine --pr 24 --repo yepengfan/agent-registry --dry-run
```

Expected: PR branch checked out, diff fetched, 3 reviewers produce findings, some findings grounded successfully, summary shows pipeline stats.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: review-fix-engine Phase 1 complete"
```

---

## Verification Checklist

- [ ] `python -m pytest tests/ -v` — all unit tests pass
- [ ] `python -m engine --help` — CLI shows usage
- [ ] `python -m engine --diff-file sample.diff --dry-run` — runs without errors
- [ ] `python -m engine --pr 24 --repo yepengfan/agent-registry --dry-run` — produces grounded findings
- [ ] GitHub PR comments posted (without --dry-run)
- [ ] Terminal shows real-time progress with heartbeat
- [ ] Each reviewer's findings tagged with source_reviewer
- [ ] Self-reflection filters low-confidence findings
- [ ] Grounding drops hallucinated findings
- [ ] Summary shows pipeline stats (raw → dedup → reflect → grounded)
