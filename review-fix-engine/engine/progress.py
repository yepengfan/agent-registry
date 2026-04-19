# engine/progress.py
from __future__ import annotations
import os
import sys
import time

_quiet = False


def set_quiet(quiet: bool = True):
    global _quiet
    _quiet = quiet


def is_quiet() -> bool:
    return _quiet


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


_SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
_tag_state: dict[str, dict] = {}
_reviewer_order: list[str] = []
_spin_idx = 0
_last_render = 0.0
_RENDER_INTERVAL = 0.15
_stderr = sys.stderr
_block_initialized = False


def init_reviewers(tags: list[str]):
    global _block_initialized
    _reviewer_order.clear()
    _reviewer_order.extend(tags)
    _tag_state.clear()
    for tag in tags:
        _tag_state[tag] = {
            "tokens": 0, "msgs": 0, "elapsed": 0.0,
            "start": time.monotonic(), "snippet": "", "done": False,
            "done_line": "",
        }
    for _ in tags:
        _stderr.write("\n")
    _stderr.flush()
    _block_initialized = True


def _get_tag_state(tag: str) -> dict:
    if tag not in _tag_state:
        _tag_state[tag] = {
            "tokens": 0, "msgs": 0, "elapsed": 0.0,
            "start": time.monotonic(), "snippet": "", "done": False,
            "done_line": "",
        }
    return _tag_state[tag]


def get_tag_elapsed(tag: str) -> float:
    state = _tag_state.get(tag)
    if state:
        return time.monotonic() - state["start"]
    return 0.0


def update_progress(tag: str, msg_count: int, elapsed: float):
    state = _get_tag_state(tag)
    if state["done"]:
        return
    state["msgs"] = msg_count
    state["elapsed"] = elapsed
    _render_block()


def finish_progress(tag: str, findings_count: int, cost: float, duration: float):
    state = _get_tag_state(tag)
    state["done"] = True
    state["done_line"] = (
        f"  {C.CYAN}[{tag}]{C.RESET}  "
        f"{C.GREEN}\u2713{C.RESET} {findings_count} findings "
        f"{C.DIM}(${cost:.2f}, {duration:.0f}s){C.RESET}"
    )
    _render_block(force=True)


def _render_block(force: bool = False):
    global _spin_idx, _last_render
    if not _block_initialized or not _reviewer_order:
        return
    now = time.monotonic()
    if not force and now - _last_render < _RENDER_INTERVAL:
        return
    _last_render = now
    _spin_idx += 1

    n = len(_reviewer_order)
    spin = _SPINNER[_spin_idx % len(_SPINNER)]
    max_tag_len = max(len(t) for t in _reviewer_order)

    _stderr.write(f"\033[{n}A")

    for tag in _reviewer_order:
        s = _tag_state.get(tag, {})
        if s.get("done"):
            line = s.get("done_line", "")
        else:
            padded = tag.ljust(max_tag_len)
            snippet = s.get("snippet", "").replace("\n", " ").strip()
            if len(snippet) > 35:
                snippet = snippet[:32] + "..."
            detail = f"{s.get('msgs', 0)}msg"
            if s.get("tokens"):
                detail += f" {s['tokens']}t"
            if snippet:
                detail += f" {snippet}"
            elapsed = s.get("elapsed", 0.0)
            line = f"  {C.CYAN}[{padded}]{C.RESET}  {C.MAGENTA}{spin}{C.RESET} {detail} {C.DIM}({elapsed:.0f}s){C.RESET}"
        _stderr.write(f"\r\033[2K{line}\n")

    _stderr.flush()


def _terminal_width() -> int:
    try:
        return os.get_terminal_size().columns
    except (AttributeError, ValueError, OSError):
        return 120


def sdk_message(message, tag: str):
    from claude_agent_sdk import StreamEvent, AssistantMessage, ResultMessage, SystemMessage

    if isinstance(message, StreamEvent):
        event = message.event
        if isinstance(event, dict) and event.get("type") == "content_block_delta":
            delta = event.get("delta", {})
            if delta.get("type") == "text_delta":
                text = delta.get("text", "")
                if _quiet:
                    state = _get_tag_state(tag)
                    state["tokens"] += len(text.split())
                    state["snippet"] = text
                else:
                    sys.stdout.write(f"{C.DIM}{text}{C.RESET}")
                    sys.stdout.flush()

    elif isinstance(message, AssistantMessage):
        if not _quiet:
            content = getattr(getattr(message, "message", None), "content", None) or []
            for block in content:
                btype = block.get("type") if isinstance(block, dict) else getattr(block, "type", None)
                if btype == "tool_use":
                    name = block.get("name", "?") if isinstance(block, dict) else getattr(block, "name", "?")
                    print(f"\n{C.CYAN}[{tag}]{C.RESET} {C.MAGENTA}tool:{C.RESET} {name}", flush=True)

    elif isinstance(message, ResultMessage):
        if not _quiet:
            cost = message.total_cost_usd
            turns = message.num_turns
            cost_str = f"${cost:.4f}" if cost else "?"
            print(f"\n{C.CYAN}[{tag}]{C.RESET} {C.GREEN}Done{C.RESET} (cost: {cost_str}, turns: {turns or '?'})", flush=True)


class Timer:
    def __init__(self):
        self._start = time.monotonic()

    def elapsed(self) -> float:
        return time.monotonic() - self._start
