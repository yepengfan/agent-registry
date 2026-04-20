# engine/steering.py
from __future__ import annotations
import re
from pathlib import Path


def find_steering(cwd: Path) -> dict | None:
    sdd_dir = cwd / ".sdd" / "steering"
    if not sdd_dir.is_dir():
        return None

    for md_file in sorted(sdd_dir.glob("*.md")):
        result = _parse_steering(md_file)
        if result and result.get("figma_url"):
            return result

    return None


def _parse_steering(path: Path) -> dict | None:
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        return None

    match = re.search(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    if not match:
        return None

    frontmatter = match.group(1)
    result: dict = {}
    for line in frontmatter.splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if key == "figma_url":
            result["figma_url"] = value
            parsed = _parse_figma_url(value)
            if parsed:
                result.update(parsed)
        elif key == "page_route":
            result["page_route"] = value
        elif key == "dev_port":
            result["dev_port"] = int(value) if value.isdigit() else 3000

    if not result.get("page_route"):
        result["page_route"] = "/"
    if not result.get("dev_port"):
        result["dev_port"] = 3000

    return result if result.get("figma_url") else None


def _parse_figma_url(url: str) -> dict | None:
    m = re.search(r"figma\.com/design/([^/]+)/.*\?.*node-id=(\d+[-:]\d+)", url)
    if m:
        file_key = m.group(1)
        node_id = m.group(2).replace("-", ":")
        return {"figma_file_key": file_key, "figma_node_id": node_id}
    return None
