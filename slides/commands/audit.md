You are a CI&T slide audit tool. Your job is to check a `.pptx` file for design rule violations and provide a detailed report with fix suggestions.

## Input

Arguments: $ARGUMENTS

The argument should be a path to a `.pptx` file. If no argument is provided, look for `.pptx` files in the current directory and ask which one to audit.

## Workflow

1. Ensure `python-pptx` is installed (`pip install python-pptx`)
2. Write the audit script below to `/tmp/cit_slide_audit.py`
3. Run it against the target `.pptx`
4. Parse the output and provide a human-readable report
5. For each violation, explain what's wrong and suggest the exact fix
6. If 0 violations, report PASS

## Audit Script

Write this exact script to `/tmp/cit_slide_audit.py` and execute it:

```python
#!/usr/bin/env python3
"""Comprehensive CI&T slide audit — checks all brand design rules.

Checks performed:
1. Same-color nesting (child fill = parent fill)
2. LTBLUE components on LTBLUE background (invisible)
3. CORAL components on CORAL background (invisible)
4. Text color violations (invisible text, low contrast)
5. Accent bar violations (light bars on light bg, dark bars on dark bg)
6. Non-brand colors (fills or text using colors outside the 6-color palette)
"""
import sys, json
from pptx import Presentation

# Brand colors (hex strings without #, as python-pptx returns them)
NAVY = "000050"
CORAL = "FA5A50"
MAROON = "690037"
LTBLUE = "B4DCFA"
LTPURPLE = "FAB9FF"
WHITE = "FFFFFF"

BRAND_COLORS = {NAVY, CORAL, MAROON, LTBLUE, LTPURPLE, WHITE}
LIGHT_FILLS = {WHITE, LTBLUE, LTPURPLE, "F5F5F5", "F0F0F2"}
DARK_FILLS = {NAVY, MAROON}

COLOR_NAMES = {
    NAVY: "NAVY", CORAL: "CORAL", MAROON: "MAROON",
    LTBLUE: "LTBLUE", LTPURPLE: "LTPURPLE", WHITE: "WHITE",
    "F5F5F5": "LTGRAY", "F0F0F2": "LTGRAY2"
}


def name(c):
    return COLOR_NAMES.get(c, f"#{c}")


def audit(pptx_path):
    prs = Presentation(pptx_path)
    violations = []
    slide_count = len(prs.slides)

    for si, slide in enumerate(prs.slides):
        sn = si + 1  # 1-based slide number

        # Detect slide background
        slide_bg = "?"
        try:
            slide_bg = str(slide.background.fill.fore_color.rgb)
        except Exception:
            pass

        is_light_bg = slide_bg in LIGHT_FILLS
        is_coral_bg = slide_bg == CORAL

        # Collect all filled shapes with geometry
        filled = []
        for shape in slide.shapes:
            try:
                fc = str(shape.fill.fore_color.rgb)
                filled.append({
                    "c": fc,
                    "l": shape.left, "t": shape.top,
                    "r": shape.left + shape.width,
                    "b": shape.top + shape.height,
                    "a": shape.width * shape.height,
                    "w_pt": shape.width / 12700,
                    "h_pt": shape.height / 12700,
                })
            except Exception:
                pass

        # Sort DESCENDING by area — iterate large-to-small so last match = innermost
        filled_desc = sorted(filled, key=lambda f: f["a"], reverse=True)

        # ── Check 1: Same-color nesting ─────────────────────────────────
        for child in filled:
            for parent in filled:
                if child is parent or child["a"] >= parent["a"]:
                    continue
                if (parent["l"] <= child["l"] and child["r"] <= parent["r"] and
                        parent["t"] <= child["t"] and child["b"] <= parent["b"]):
                    if child["c"] == parent["c"] and child["c"] not in (WHITE, NAVY):
                        violations.append({
                            "slide": sn, "check": "nesting",
                            "msg": f"S{sn}: {name(child['c'])} nested inside {name(parent['c'])} (same color)",
                            "fix": f"Change inner shape fill to a contrasting color (e.g., WHITE or LTBLUE)"
                        })
                        break

        # ── Check 2: LTBLUE components on LTBLUE background ────────────
        if slide_bg == LTBLUE:
            coral_rects = [(f["l"], f["t"], f["r"], f["b"])
                           for f in filled if f["c"] == CORAL]
            for f in filled:
                if f["c"] == LTBLUE and f["a"] > 914400 * 914400 * 0.02:
                    in_coral = any(
                        cl <= f["l"] and f["r"] <= cr and ct <= f["t"] and f["b"] <= cb
                        for cl, ct, cr, cb in coral_rects)
                    if not in_coral:
                        violations.append({
                            "slide": sn, "check": "invisible_fill",
                            "msg": f"S{sn}: LTBLUE component on LTBLUE background (invisible)",
                            "fix": "Change component fill to CORAL (primary) or WHITE"
                        })

        # ── Check 3: CORAL components on CORAL background ───────────────
        if slide_bg == CORAL:
            white_rects = [(f["l"], f["t"], f["r"], f["b"])
                           for f in filled if f["c"] == WHITE]
            for f in filled:
                if f["c"] == CORAL and f["a"] > 914400 * 914400 * 0.02:
                    in_white = any(
                        wl <= f["l"] and f["r"] <= wr and wt <= f["t"] and f["b"] <= wb
                        for wl, wt, wr, wb in white_rects)
                    if not in_white:
                        violations.append({
                            "slide": sn, "check": "invisible_fill",
                            "msg": f"S{sn}: CORAL component on CORAL background (invisible)",
                            "fix": "Change component fill to WHITE (primary) or LTBLUE"
                        })

        # ── Check 4: Text color violations ──────────────────────────────
        for shape in slide.shapes:
            if not shape.has_text_frame:
                continue
            for para in shape.text_frame.paragraphs:
                if not para.text.strip():
                    continue

                # Get text color from paragraph or run level
                tc = None
                try:
                    if para.font.color and para.font.color.rgb:
                        tc = str(para.font.color.rgb)
                except Exception:
                    pass
                if tc is None:
                    for run in para.runs:
                        try:
                            if run.font.color and run.font.color.rgb:
                                tc = str(run.font.color.rgb)
                                break
                        except Exception:
                            pass
                if tc is None:
                    continue

                # Find effective background (innermost container)
                sx, sy = shape.left, shape.top
                ebg = slide_bg
                for f in filled_desc:
                    if f["l"] <= sx <= f["r"] and f["t"] <= sy <= f["b"]:
                        ebg = f["c"]

                txt = para.text[:30]

                # 4a: Text same color as background
                if tc == ebg:
                    violations.append({
                        "slide": sn, "check": "text_invisible",
                        "msg": f"S{sn}: {name(tc)} text on {name(ebg)} background (SAME COLOR): '{txt}'",
                        "fix": f"Change text color to {'WHITE' if ebg == CORAL else 'NAVY'}"
                    })

                # 4b: WHITE text on light background
                if tc == WHITE and ebg in LIGHT_FILLS:
                    violations.append({
                        "slide": sn, "check": "text_low_contrast",
                        "msg": f"S{sn}: WHITE text on light {name(ebg)} background: '{txt}'",
                        "fix": "Change text color to NAVY"
                    })

                # 4c: Light-colored text on light background
                if tc in (LTBLUE, LTPURPLE) and ebg in LIGHT_FILLS:
                    violations.append({
                        "slide": sn, "check": "text_low_contrast",
                        "msg": f"S{sn}: {name(tc)} text on light {name(ebg)} background: '{txt}'",
                        "fix": "Change text color to NAVY"
                    })

        # ── Check 5: Accent bar violations ──────────────────────────────
        for f in filled:
            is_thin = ((f["w_pt"] <= 5 or f["h_pt"] <= 5) and
                       f["w_pt"] > 0.5 and f["h_pt"] > 0.5)
            if not is_thin:
                continue

            # 5a: Light bars on light background
            if is_light_bg and f["c"] in LIGHT_FILLS:
                violations.append({
                    "slide": sn, "check": "bar_contrast",
                    "msg": f"S{sn}: Light accent bar ({name(f['c'])}) on light background ({name(slide_bg)})",
                    "fix": "Change bar color to NAVY or MAROON"
                })

            # 5b: Dark bars on CORAL background
            if is_coral_bg and f["c"] in DARK_FILLS:
                violations.append({
                    "slide": sn, "check": "bar_contrast",
                    "msg": f"S{sn}: Dark accent bar ({name(f['c'])}) on CORAL background",
                    "fix": "Change bar color to WHITE or LTBLUE"
                })

            # 5c: Bar same color as slide background (invisible)
            if f["c"] == slide_bg:
                violations.append({
                    "slide": sn, "check": "bar_invisible",
                    "msg": f"S{sn}: Accent bar color ({name(f['c'])}) matches slide background (invisible)",
                    "fix": f"Change bar color to {'NAVY or MAROON' if is_light_bg else 'WHITE or LTBLUE'}"
                })

        # ── Check 6: Non-brand colors ──────────────────────────────────
        seen_non_brand = set()
        for f in filled:
            if f["c"] not in BRAND_COLORS and f["c"] not in seen_non_brand:
                seen_non_brand.add(f["c"])
                violations.append({
                    "slide": sn, "check": "non_brand_color",
                    "msg": f"S{sn}: Non-brand fill color #{f['c']}",
                    "fix": "Replace with nearest brand color from palette (NAVY/CORAL/MAROON/LTBLUE/LTPURPLE/WHITE)"
                })
        for shape in slide.shapes:
            if not shape.has_text_frame:
                continue
            for para in shape.text_frame.paragraphs:
                if not para.text.strip():
                    continue
                tc = None
                try:
                    if para.font.color and para.font.color.rgb:
                        tc = str(para.font.color.rgb)
                except Exception:
                    pass
                if tc is None:
                    for run in para.runs:
                        try:
                            if run.font.color and run.font.color.rgb:
                                tc = str(run.font.color.rgb)
                                break
                        except Exception:
                            pass
                if tc and tc not in BRAND_COLORS and tc not in seen_non_brand:
                    seen_non_brand.add(tc)
                    violations.append({
                        "slide": sn, "check": "non_brand_color",
                        "msg": f"S{sn}: Non-brand text color #{tc}: '{para.text[:30]}'",
                        "fix": "Replace with NAVY (on light bg) or WHITE (on dark bg)"
                    })

    return violations, slide_count


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 cit_slide_audit.py <path.pptx>")
        sys.exit(1)

    path = sys.argv[1]
    violations, slide_count = audit(path)

    # Output as JSON for structured parsing
    result = {
        "file": path,
        "slide_count": slide_count,
        "violation_count": len(violations),
        "violations": violations
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
```

## Report Format

After running the script, present the results in this format:

### If violations found:

```
## Audit Report: <filename>
Slides: <count> | Violations: <count>

### Violations by Slide

**S<n>** — <violation description>
  → Fix: <specific fix instruction>

...

### Summary by Type
- Nesting violations: <count>
- Invisible fills: <count>
- Text contrast: <count>
- Bar contrast: <count>
- Non-brand colors: <count>
```

### If no violations:

```
## Audit Report: <filename>
Slides: <count> | Violations: 0

✅ ALL CLEAR — no design rule violations found.
```

## False Positive Analysis

After presenting the raw results, review each violation critically:

1. **Bounding box overlap** — The audit uses shape bounding boxes. Text inside a small CORAL card that sits inside a larger WHITE region may show as "WHITE text on WHITE bg" when the text is actually on CORAL. If a violation looks like it could be caused by this, flag it as a **possible false positive** and explain why.

2. **Group shapes** — Shapes inside groups may have relative coordinates that the audit doesn't account for. Note this limitation.

3. **Decorative elements** — Brand decoration groups (copied from template) may trigger nesting violations. These are expected and can be ignored.

Present false positive candidates separately:

```
### Possible False Positives
- S<n>: <violation> — Likely false positive because <reason>
```

## Brand Design Rules Reference

For context when explaining violations, here are the key rules:

**Palette**: NAVY (#000050), CORAL (#FA5A50), MAROON (#690037), LTBLUE (#B4DCFA), LTPURPLE (#FAB9FF), WHITE (#FFFFFF) — no other colors allowed.

**Text**: Light bg → NAVY text. CORAL component → WHITE text. Never use LTBLUE/LTPURPLE/WHITE as text on light backgrounds.

**Nesting**: Child fill ≠ parent fill. Always.

**Accent bars**: Light bg slides → dark bars (NAVY/MAROON). Dark bg slides → light bars (WHITE/LTBLUE). Applies everywhere on the slide regardless of card nesting.

**Slide types**: Title = CORAL bg + Layout 2. Content = LTBLUE bg + Layout 22. Section divider = CORAL bg + Layout 22.
