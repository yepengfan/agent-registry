#!/usr/bin/env python3
"""
Verify each reviewer finding references real code.

Input JSON shape (from pr-reviewer):
  {
    "summary": "...",
    "findings": [
      {"id": "F-001", "severity": "...", "category": "...",
       "claim": "...", "reasoning": "...",
       "file": "src/foo.ts", "line_start": 42, "line_end": 48,
       "quoted_code": "<verbatim>", "suggested_fix": "..."}, ...
    ]
  }

Output JSON shape:
  {
    "summary": "...",
    "findings": [... grounded, with grounded: true ...],
    "dropped": [... hallucinated, with grounded: false and grounding_error ...],
    "stats": {
      "raw_count": N,
      "grounded_count": G,
      "dropped_count": D,
      "hallucination_rate": D / N
    }
  }
"""
import argparse
import json
import sys
from pathlib import Path


def normalize(s: str) -> str:
    """Loose match: strip per-line, collapse internal whitespace runs."""
    lines = [line.strip() for line in s.strip().splitlines()]
    return "\n".join(" ".join(line.split()) for line in lines)


def ground_one(finding: dict, repo: Path) -> tuple[bool, str | None]:
    try:
        file_rel = finding["file"]
        line_start = int(finding["line_start"])
        line_end = int(finding["line_end"])
        quoted = finding["quoted_code"]
    except (KeyError, ValueError, TypeError) as e:
        return False, f"schema error: {e}"

    file_path = (repo / file_rel).resolve()
    # Prevent path traversal outside the repo
    try:
        file_path.relative_to(repo.resolve())
    except ValueError:
        return False, f"file path escapes repo: {file_rel}"

    if not file_path.is_file():
        return False, f"file not found: {file_rel}"

    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return False, f"read error: {e}"

    file_lines = content.splitlines()
    if line_start < 1 or line_end > len(file_lines) or line_start > line_end:
        return False, (
            f"line range {line_start}-{line_end} out of bounds "
            f"(file has {len(file_lines)} lines)"
        )

    actual = "\n".join(file_lines[line_start - 1 : line_end])
    if normalize(actual) != normalize(quoted):
        return False, "quoted_code does not match file content at given lines"

    return True, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="path to raw findings JSON")
    ap.add_argument("--output", required=True, help="path to write grounded findings JSON")
    ap.add_argument("--repo", required=True, help="repo root to resolve file paths against")
    args = ap.parse_args()

    try:
        data = json.loads(Path(args.input).read_text())
    except json.JSONDecodeError as e:
        print(f"FATAL: input is not valid JSON: {e}", file=sys.stderr)
        sys.exit(2)

    repo = Path(args.repo).resolve()
    if not repo.is_dir():
        print(f"FATAL: repo path is not a directory: {repo}", file=sys.stderr)
        sys.exit(2)

    grounded: list[dict] = []
    dropped: list[dict] = []
    for f in data.get("findings", []):
        ok, err = ground_one(f, repo)
        f = dict(f)
        f["grounded"] = ok
        f["grounding_error"] = err
        (grounded if ok else dropped).append(f)

    total = len(grounded) + len(dropped)
    out = {
        "summary": data.get("summary", ""),
        "findings": grounded,
        "dropped": dropped,
        "stats": {
            "raw_count": total,
            "grounded_count": len(grounded),
            "dropped_count": len(dropped),
            "hallucination_rate": (len(dropped) / total) if total else 0.0,
        },
    }

    Path(args.output).write_text(json.dumps(out, indent=2))

    # Summary to stderr so Claude sees it in tool output
    print(
        f"grounding: raw={total} grounded={len(grounded)} "
        f"dropped={len(dropped)} halluc_rate={out['stats']['hallucination_rate']:.1%}",
        file=sys.stderr,
    )
    if dropped:
        print("dropped findings:", file=sys.stderr)
        for f in dropped:
            print(f"  - {f.get('id','?')}: {f.get('grounding_error','?')}", file=sys.stderr)


if __name__ == "__main__":
    main()
