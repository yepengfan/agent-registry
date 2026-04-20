#!/usr/bin/env python3
"""
Decide whether the PR review-fix loop should continue.

Reads the state file (e.g. .claude/state/pr-review-loop.json). State shape:
  {
    "round": N,
    "max_rounds": 8,
    "required_consecutive_clean": 2,
    "hard_fail_on_gate_failure_rounds": 3,
    "history": [
      {
        "round_num": 1,
        "gates": {"all_pass": true, ...},
        "grounded_findings": [{"file": "...", "line_start": 42,
                               "category": "correctness",
                               "severity": "must-fix"}, ...],
        "hallucination_rate": 0.2
      },
      ...
    ]
  }

Prints exactly one line, one of:
  CONTINUE / PASS / FAIL_STALLED / FAIL_GATES / MAX_ROUNDS

Exit code is 0 for all decisions. Use stdout for the verdict.
"""
import argparse
import json
import sys
from pathlib import Path


def finding_key(f: dict) -> tuple:
    return (f.get("file"), f.get("line_start"), f.get("category"))


def same_must_fix_set(a: list[dict], b: list[dict]) -> bool:
    ak = sorted(finding_key(f) for f in a if f.get("severity") == "must-fix")
    bk = sorted(finding_key(f) for f in b if f.get("severity") == "must-fix")
    return ak == bk


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--state", required=True)
    args = ap.parse_args()

    try:
        state = json.loads(Path(args.state).read_text())
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"FATAL: cannot read state: {e}", file=sys.stderr)
        sys.exit(2)

    history = state.get("history", [])
    required_clean = state.get("required_consecutive_clean", 2)
    max_rounds = state.get("max_rounds", 8)
    gate_cap = state.get("hard_fail_on_gate_failure_rounds", 3)

    # No rounds yet — first iteration
    if not history:
        print("CONTINUE")
        return

    current = history[-1]
    current_must_fix = [
        f for f in current.get("grounded_findings", [])
        if f.get("severity") == "must-fix"
    ]
    current_gates_pass = current.get("gates", {}).get("all_pass", False)

    # PASS: last N rounds all clean
    if len(history) >= required_clean:
        recent = history[-required_clean:]
        all_clean = all(
            not [f for f in r.get("grounded_findings", [])
                 if f.get("severity") == "must-fix"]
            and r.get("gates", {}).get("all_pass", False)
            for r in recent
        )
        if all_clean:
            print("PASS")
            return

    # FAIL_STALLED: last 2 rounds have identical non-empty must-fix set
    if len(history) >= 2:
        a = history[-1].get("grounded_findings", [])
        b = history[-2].get("grounded_findings", [])
        a_must = [f for f in a if f.get("severity") == "must-fix"]
        if a_must and same_must_fix_set(a, b):
            print("FAIL_STALLED")
            return

    # FAIL_GATES: gate_cap consecutive rounds with gates failing and no must-fix findings
    if len(history) >= gate_cap:
        recent = history[-gate_cap:]
        stuck = all(
            not r.get("gates", {}).get("all_pass", True)
            and not [f for f in r.get("grounded_findings", [])
                     if f.get("severity") == "must-fix"]
            for r in recent
        )
        if stuck:
            print("FAIL_GATES")
            return

    # MAX_ROUNDS: hit the cap
    if len(history) >= max_rounds:
        print("MAX_ROUNDS")
        return

    print("CONTINUE")


if __name__ == "__main__":
    main()
