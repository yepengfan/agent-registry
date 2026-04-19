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
from .progress import sdk_message, info, warn, is_quiet, update_progress


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
    start = 0
    while True:
        brace = text.find("{", start)
        if brace < 0:
            break
        depth = 0
        for i in range(brace, len(text)):
            if text[i] == "{": depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[brace:i+1])
                    except json.JSONDecodeError:
                        pass
                    break
        start = brace + 1
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
            if is_quiet():
                update_progress(tag, msg_count, now - start)
            elif now - last_heartbeat >= 30:
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
    reviewers: list[str], prompts: dict[str, str],
    diff: str, gates_summary: str, round_num: int,
    cwd: Path, max_turns: int = 5,
) -> tuple[dict[str, list[Finding]], float]:
    base_prompt = prompts["_base"]

    tasks = []
    for name in reviewers:
        focus_prompt = prompts[name]
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
