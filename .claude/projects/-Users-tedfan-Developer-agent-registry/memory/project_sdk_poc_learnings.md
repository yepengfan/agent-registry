---
name: SDK POC learnings
description: Key technical learnings from the Claude Agent SDK POC for the review-fix engine (Apr 2026)
type: project
---

Validated that Claude Agent SDK (Python) works through CI&T proxy (`flow.ciandt.com/flow-llm-proxy`) with Bearer auth. PR #31 has the full POC.

**Why:** These constraints shape the full engine architecture.

**How to apply:**

SDK constraints discovered during POC:
- `output_format` + `allowed_tools` combination crashes the CLI — use prompt-based JSON instructions instead
- Python SDK v0.1.63 throws a post-result cleanup exception (exit code 1) even on success — catch if ResultMessage already received
- `permission_mode="dontAsk"` denies tools not in `allowed_tools` — for diff-only review, don't give the reviewer tools at all
- `include_partial_messages=True` enables streaming but Python SDK uses `StreamEvent` class with dict `.event`, not string `.type`
- Budget must not be capped for large diffs — $0.50 is insufficient for 72K+ char PRs on Opus

Performance findings:
- Reviewer with Read tool usage: $1.57, 10+ turns, 411s per round
- Reviewer without tools (diff-only): $0.55, 1 turn, 238s per round — 3x faster, 3x cheaper
- Grounding handles verification anyway, so reviewer doesn't need to Read files

Architecture validated:
- Orchestrator as Python script owns the loop (Design Principle #1)
- Grounding between reviewer and fixer prevents hallucination cascading (Principle #2)
- Embed diff in prompt, don't tell agent to read files (Principle #3)
- Auto-checkout PR branch needed for grounding to find files
- Git root auto-detection needed when running from subdirectories
