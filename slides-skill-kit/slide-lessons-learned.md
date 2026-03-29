# Slide Generation — Lessons Learned

## Summary
Built a 27-slide CI&T branded presentation using python-pptx + CI&T's official Google Slides template. The process required ~20 iterations to get the design right.

## Critical Lessons

### 1. Template handling is tricky
- **DON'T duplicate template slides** — they bring ghost text from layouts
- **DO use clean layouts + copy only GROUP shapes** (brand decoration, logos)
- Template slide 9 (index 8) has the brand decoration GROUP for title slides
- Template slide 11 (index 10) was used as a source for the globe icon but was later removed (too prominent)
- Layout 0 has ghost text ("Insert your title here") — always use Layout 22 for content

### 2. Logo is always WHITE
- CI&T logo in ALL layouts is WHITE (#FFFFFF) — 4 freeform shapes in a GROUP
- Attempted to recolor with `recolor_logo()` — this modifies the LAYOUT which affects ALL slides
- Final solution: use dark backgrounds (CORAL, LTBLUE) where white logo is visible
- On LTBLUE bg the small logo at bottom-right is acceptable even though barely visible

### 3. Color coordination requires strict rules
The biggest time sink. Without strict rules, each fix creates new violations.

**Evolution of color schemes:**
1. Light theme (white bg, coral accent) → card text invisible
2. Dark theme (navy bg) → too dark, not CI&T branded
3. Deep red (#690039) bg → ugly with coral cards
4. Coral (#FA5A50) bg → maroon cards looked bad
5. White bg + coral cards → white components invisible on white
6. **LTBLUE bg + coral cards → FINAL** (but needed many sub-fixes)

### 4. The nesting problem
Every time you change a background color, nested components cascade:
- LTBLUE bg → cards must be CORAL (not LTBLUE)
- CORAL cards → sub-boxes must be WHITE (not CORAL)
- WHITE sub-boxes → accent bars must be NAVY (not WHITE)
- Each layer must differ from its parent

### 5. Accent bars are the sneakiest violations
- The audit script initially only checked text colors and fill nesting
- Thin accent bars (Pt(2)/Pt(3) rectangles) were not detected
- `_fnode` left-side bars use `dot_clr` which could be the same as the parent
- Solution: add accent bar detection (shapes with width OR height ≤ 5pt)

### 6. Paragraph vs Run level colors
- python-pptx `tx()` sets color on `p.font.color.rgb` (paragraph level)
- Audit scripts that only check `run.font.color.rgb` miss these
- Must check BOTH paragraph and run level

### 7. Self-contained builders cause constant drift
- Each builder file defines its own color constants (CARD_BG, AGENT_C, etc.)
- When the skeleton's constants change, builders don't automatically update
- Solution: either use `_m = sys.modules['__main__']` to reference skeleton globals, or explicitly update all 5 builder files
- **Assembly process must always re-read builder files from disk**

### 8. Sub-agents need extremely specific instructions
- "Change colors to match dark theme" is too vague — each agent interprets differently
- Must specify: exact color constants, exact fill/text for each component type
- Must list prohibited colors explicitly
- Must distinguish: "on slide bg" vs "inside CORAL card" vs "inside WHITE sub-box"

### 9. Design rules must be machine-readable
The `slide-design-rules.md` evolved from a simple table to a comprehensive ruleset:
- Background color per slide type
- Text color per background context
- Layer hierarchy (3 levels)
- Accent bar rules (light bg → dark bars, dark bg → light bars)
- Nesting rules (child ≠ parent)
- Human/Agent indicator rules
- Monospace text rules
- Prohibited combinations

### 10. Audit script must be comprehensive
Final audit checks:
1. Same-color nesting (fill inside same-color fill)
2. LTBLUE-on-LTBLUE (invisible components)
3. CORAL-on-CORAL (invisible components)
4. Text color = effective background (invisible text)
5. WHITE text on light background
6. Light text (LTBLUE/LTPURPLE) on light background
7. Light accent bars on light background
8. Dark accent bars on dark background
9. Bar color = slide background (invisible bar)

Known false positive: S11 Phase 2 swim lane — WHITE text detected on WHITE lane, but text is actually inside CORAL flow nodes.

## File Inventory

| File | Purpose |
|---|---|
| `generate_harness_deck.py` | Main generation script (skeleton + assembled builders) |
| `build_opening.py` | Slides 1-7 builder |
| `build_sdlc.py` | Slides 8-13 builder |
| `build_sdd.py` | Slides 14-19 builder |
| `build_tooling.py` | Slides 20-23 builder |
| `build_closing.py` | Slides 24-27 builder |
| `slide-design-rules.md` | Complete design rules |
| `slide-template-patterns.md` | Template handling patterns |
| `slide-audit-script.py` | Audit script |
| `CI&T - Slide Presentation Template.pptx` | Original CI&T template |
| `Harness_Engineering_CIT.pptx` | Final output |
| `Harness_Engineering_SDD_Transcript.md` | Presenter transcript |

## What I'd Do Differently

1. **Establish ALL color rules BEFORE writing any code** — we iterated 20+ times
2. **Write the audit script FIRST** — would have caught issues immediately
3. **Use a single builder approach** (not 5 separate files) — reduces drift
4. **Test with 3 sample slides before building 27** — we did this but should have been more thorough
5. **Keep non-brand colors out from the start** — the C_BLUE/C_GREEN/C_AMBER colors caused half the issues
