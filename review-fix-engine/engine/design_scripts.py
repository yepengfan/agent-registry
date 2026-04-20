# engine/design_scripts.py
from __future__ import annotations
from pathlib import Path


def _scripts_dir() -> Path:
    return Path(__file__).parent.parent.parent / "scripts"


def load_figma_extract_template() -> str:
    return (_scripts_dir() / "figma-extract.js").read_text()


def load_dom_extract_template() -> str:
    return (_scripts_dir() / "dom-extract.js").read_text()


def inject_figma_node_id(template: str, node_id: str) -> str:
    return template.replace("__NODE_ID__", node_id)


def inject_dom_root_selector(template: str, root_selector: str = "body") -> str:
    return template.replace("__ROOT_SELECTOR__", root_selector)


def get_design_diff_path() -> Path:
    return _scripts_dir() / "design-diff.js"
