# Slide Template Patterns — Technical Reference

## Template File
`CI&T - Slide Presentation Template.pptx` — 83 slides, 28 layouts, 10" x 5.625"

## Layout Selection

| Use case | Layout index | CI&T logo position |
|---|---|---|
| Title slide (S1 only) | **2** (TITLE_1_1) | Large, top-left |
| Content slides (all others) | **22** (TITLE_1_1_1_1_1_1_1_1) | Small, bottom-right |
| Section dividers | **22** (same as content) | Small, bottom-right |

**Layout 0 has ghost text ("Insert your title here") — NEVER use it.**
Layouts 1-27 are clean. Layout 4 has a large logo — only use layout 2 for title and 22 for everything else.

## Slide Creation Functions

### `make_content(prs, tpl, bg=LTBLUE)`
Creates a content slide on LTBLUE background with small CI&T logo at bottom-right.
```python
sl = prs.slides.add_slide(prs.slide_layouts[22])
f = sl.background.fill; f.solid(); f.fore_color.rgb = LTBLUE
# Remove any inherited placeholders
for ph in list(sl.placeholders):
    ph._element.getparent().remove(ph._element)
```

### `make_title(prs, tpl)`
Creates the title slide on CORAL background with brand decoration from template S9.
```python
sl = prs.slides.add_slide(prs.slide_layouts[2])
f = sl.background.fill; f.solid(); f.fore_color.rgb = CORAL
# Copy brand decoration GROUP from template slide 9 (index 8)
for c in tpl[8].shapes._spTree:
    if c.tag.split('}')[-1] == 'grpSp':
        sl.shapes._spTree.append(copy.deepcopy(c))
```

### `make_section(prs)`
Creates a section divider on CORAL background.
```python
sl = prs.slides.add_slide(prs.slide_layouts[22])
f = sl.background.fill; f.solid(); f.fore_color.rgb = CORAL
```

## Template Slide Duplication Pattern

The proven approach for preserving brand elements:
1. Load template: `prs = Presentation(TEMPLATE_PATH)`
2. Index template slides: `tpl = {si: slide for si, slide in enumerate(prs.slides)}`
3. Store count: `N_TPL = len(prs.slides)`
4. Create new slides using layouts (NOT duplicating template slides — that copies ghost text)
5. Copy only GROUP shapes (brand decoration) from specific template slides
6. After all slides created, delete original template slides:
```python
for _ in range(N_TPL):
    rId = prs.slides._sldIdLst[0].get(qn('r:id'))
    prs.part.drop_rel(rId)
    prs.slides._sldIdLst.remove(prs.slides._sldIdLst[0])
```

## CI&T Logo Behavior

- Logo is a GROUP of 4 FREEFORM shapes in the layout
- Color is WHITE (#FFFFFF) in ALL layouts
- On CORAL/dark backgrounds → white logo is visible (no action needed)
- On LTBLUE/light backgrounds → white logo is barely visible but acceptable (it's small, at bottom-right)
- Do NOT try to recolor the layout logo — it affects ALL slides sharing that layout

## Brand Decoration (Title Slide Only)

Template slide 9 (index 8) has a large decorative GROUP shape at `(4.19", 0.07")` size `(8.34" x 5.97")`. This contains geometric shapes in NAVY + LTBLUE. Copy it only for the title slide.

## Modular Builder Architecture

```
generate_harness_deck.py
├── Section A: Imports, constants, template loading
├── Section B: Helper functions (tx, rc, rr, dt, harr, varr, fnode, etc.)
├── Section C: 5 builder functions
│   ├── build_opening(prs, tpl)   — Slides 1-7
│   ├── build_sdlc(prs, tpl)     — Slides 8-13
│   ├── build_sdd(prs, tpl)      — Slides 14-19
│   ├── build_tooling(prs, tpl)  — Slides 20-23
│   └── build_closing(prs, tpl)  — Slides 24-27
└── Section D: Main (calls builders, deletes template slides, saves)
```

Each builder can be in a separate file (`build_opening.py`, etc.) and assembled into the main script. Self-contained builders define their own color constants and helper functions locally.

## Assembly Process

```python
# Read skeleton
with open("generate_harness_deck.py") as f:
    skeleton = f.read()

# Find builder section boundaries
first_build = skeleton.index("def build_opening(")
builder_start = skeleton.rindex('\n', 0, first_build) + 1
main_section = skeleton.rindex('\n# ', 0, skeleton.index("def main():"))

header = skeleton[:builder_start]
footer = skeleton[main_section:]

# Read and concatenate builders
builders = []
for fname in ["build_opening.py", "build_sdlc.py", "build_sdd.py",
              "build_tooling.py", "build_closing.py"]:
    with open(fname) as f:
        builders.append(f.read())

final = header + '\n\n\n'.join(builders) + '\n\n\n' + footer
with open("generate_harness_deck.py", "w") as f:
    f.write(final)
```

## Key Helper Functions

| Helper | Purpose | Key params |
|---|---|---|
| `tx(sl, l, t, w, h, text, sz, c, b, al, fn)` | Text box | Default c=NAVY, fn="DM Sans" |
| `mn(sl, l, t, w, h, text, sz, c)` | Monospace text | fn="Courier New" |
| `rc(sl, l, t, w, h, c)` | Filled rectangle (no border) | Used for accent bars |
| `rr(sl, l, t, w, h, fill, border, bw)` | Rounded rectangle | Used for cards |
| `dt(sl, l, t, c, sz)` | Colored dot (oval) | Used for Human/Agent indicators |
| `harr(sl, x, y, w, c, h)` | Right arrow | |
| `varr(sl, x, y, h, c, w)` | Down arrow | |
| `fnode(sl, x, y, w, h, label, clr, sz, bg, tc)` | Flow node card | bg/tc override for nesting |
| `top_bar(sl)` | Top accent bar (NAVY) | |

## Canvas Constraints (10" x 5.625")

- Content area: x=0.3–9.7, y=0.5–5.0
- Title text on title slide: keep left of x=4.2" (brand decoration starts there)
- CI&T logo at bottom-right: ~(9.12", 5.13") — don't place content there
- Max 4-column layout: each ~2.25" wide
- Max 5-column layout: each ~1.8" wide
- Font sizes: titles 22pt, headings 10-12pt, body 8-9pt, detail 7pt
