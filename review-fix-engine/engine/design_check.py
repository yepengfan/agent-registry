# engine/design_check.py
from __future__ import annotations
import json
import subprocess
import tempfile
from pathlib import Path
from .schema import Finding, Severity, Category


_EXACT_MATCH_PROPERTIES = frozenset({
    "fontSize", "fontWeight", "color", "textColor",
    "backgroundColor", "borderColor", "text", "placeholder",
})


def run_design_diff(
    figma_inventory: dict,
    dom_inventory: dict,
    diff_script_path: Path,
    token_map: dict | None = None,
) -> dict:
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f_figma:
        json.dump(figma_inventory, f_figma)
        figma_path = f_figma.name
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f_dom:
        json.dump(dom_inventory, f_dom)
        dom_path = f_dom.name

    cmd = ["node", str(diff_script_path), figma_path, dom_path]

    if token_map:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f_tokens:
            json.dump(token_map, f_tokens)
            cmd += ["--token-map", f_tokens.name]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

    if result.returncode not in (0, 1):
        raise RuntimeError(f"design-diff.js failed: {result.stderr}")

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"design-diff.js returned invalid JSON: {result.stdout[:500]}")


def mismatches_to_findings(diff_result: dict) -> list[Finding]:
    findings = []
    for i, m in enumerate(diff_result.get("mismatches", []), 1):
        prop = m.get("property", "")
        severity = Severity.MUST_FIX if prop in _EXACT_MATCH_PROPERTIES else Severity.NICE_TO_HAVE

        findings.append(Finding(
            id=f"D-{i:03d}",
            severity=severity,
            category=Category.STYLE,
            claim=f"{prop}: Figma {m.get('figma_value', '?')} vs DOM {m.get('dom_value', '?')}",
            reasoning=f"Element '{m.get('figma_element', '?')}' → '{m.get('dom_element', '?')}' ({m.get('match_method', '?')})",
            file="",
            line_start=1,
            line_end=1,
            quoted_code="",
            suggested_fix=m.get("fix_hint", f"Change {prop} to {m.get('figma_value', '?')}"),
            source_reviewer="design",
        ))
    return findings
