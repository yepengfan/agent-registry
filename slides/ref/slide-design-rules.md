# CI&T Slide Design Rules

## Background Colors

| Slide Type | Background | Layout |
|---|---|---|
| Title slide | CORAL (#FA5A50) + brand decoration | Layout 2 (large CI&T logo top-left) |
| Content slides | WHITE (#FFFFFF) | Layout 22 (small CI&T logo bottom-right) |
| Section dividers | LTBLUE (#B4DCFA) | Layout 22 (small CI&T logo bottom-right) |

## Text Color Rules

**Core principle: light background → NAVY text. CORAL (only dark-ish brand color) → WHITE text.**

Light backgrounds: WHITE, LTBLUE, LTPURPLE
Dark-ish backgrounds: CORAL (the only one where WHITE text is used)

| Text location | Text color | Why |
|---|---|---|
| On WHITE bg | **NAVY** | Light bg → dark text |
| On LTBLUE bg | **NAVY** | Light bg → dark text |
| On LTPURPLE bg | **NAVY** | Light bg → dark text |
| On CORAL card/component | **WHITE** | CORAL is the only bg dark enough for white text |
| On CORAL bg (title slide) | **NAVY** | Title slide uses navy for headings |
| Emphasis/highlight on white bg | CORAL — only for accents, not body text | |

## Component/Card Rules

**Layer hierarchy — every layer uses a different color:**

| Slide bg | Level 1 (cards) | Level 2 (sub-boxes) | Accent bars |
|---|---|---|---|
| LTBLUE (light) | **CORAL** fill, WHITE text | **WHITE** fill, NAVY text | **NAVY / MAROON** (dark, alternate) |
| CORAL (dark-ish) | **WHITE** fill, NAVY text | **LTBLUE** fill, NAVY text | **WHITE / LTBLUE** (light, alternate) |
| CORAL (title) | — | — | **WHITE / LTBLUE** (light) |

## Accent Bar Rule

**On light bg slides (LTBLUE) → ALL accent bars use dark colors: NAVY / MAROON (alternate)**
This applies everywhere on the slide — on the slide background, inside CORAL cards, inside WHITE sub-boxes. ALL bars dark.

**On dark bg slides (CORAL section, NAVY) → ALL accent bars use light colors: WHITE / LTBLUE (alternate)**
This applies everywhere on the slide.

Never use light bars (WHITE, LTBLUE, LTPURPLE) on light bg slides.
Never use dark bars (NAVY, MAROON) on dark bg slides.

## Monospace / Code Text Rule

On LTBLUE bg: monospace command names, file paths, code text = **NAVY**. Never use accent colors for functional text — use NAVY uniformly for readability and consistency.

## Role Differentiation Rule

When a slide has components representing different roles/levels, use different fill colors:

| Component role | Fill | Text |
|---|---|---|
| Primary / orchestrator (e.g. Opus) | **NAVY** | WHITE |
| Worker / executor (e.g. Sonnet) | **CORAL** | WHITE |
| Info / supplementary | **WHITE** | NAVY |

## Human / Agent Indicator Rule

| Role | Dot color | Dot size |
|---|---|---|
| Human | **NAVY** (solid) | Pt(8) |
| Agent | **WHITE** (solid) | Pt(8) |

Both dots must be large enough (Pt(8)) to be clearly visible on CORAL cards.
NAVY vs WHITE provides maximum contrast on CORAL background.

**Detailed component rules:**

| Context | Fill | Text | Border |
|---|---|---|---|
| Cards on LTBLUE bg | CORAL | WHITE | CORAL |
| Accent bars on LTBLUE bg | CORAL or WHITE (NOT NAVY, NOT LTBLUE) | — | — |
| Flow nodes on LTBLUE bg | CORAL | WHITE | CORAL |
| Gate/artefact boxes inside CORAL cards | WHITE | NAVY | CORAL |
| Gate/artefact boxes on LTBLUE bg (standalone) | CORAL | WHITE | CORAL |
| Cards on CORAL section bg | WHITE | NAVY | WHITE |
| Phase 2: SDD swim lane | WHITE | NAVY label, CORAL nodes | CORAL |
| Phase 2: QA swim lane | LTPURPLE | NAVY label, CORAL nodes | LTPURPLE |
| Phase 2: PR Review lane | CORAL | WHITE label | CORAL |

**PROHIBITED on LTBLUE bg:** LTBLUE fill, LTBLUE border, LTBLUE accent bars, NAVY accent bars (too heavy)
**PROHIBITED on CORAL bg:** CORAL fill, CORAL border, CORAL accent bars

## Logo Rules

| Slide Type | Logo |
|---|---|
| Title slide | Large CI&T logo top-left (from Layout 2) |
| Content slides | Small CI&T logo bottom-right (from Layout 22) |
| Section dividers | Small CI&T logo bottom-right (from Layout 22) |

## Nesting Rule: Components on Components

**When a component sits INSIDE another component, the inner component must use a DIFFERENT fill color.**

**Adjacent layers must never be the same color. Alternate from the brand palette.**

| Parent color | Child fill options | Child text |
|---|---|---|
| WHITE (slide bg) | CORAL, LTBLUE, LTPURPLE | WHITE on CORAL; NAVY on LTBLUE/LTPURPLE |
| CORAL | LTBLUE, LTPURPLE | NAVY |
| LTBLUE | CORAL, LTPURPLE | WHITE on CORAL; NAVY on LTPURPLE |
| LTPURPLE | CORAL, LTBLUE | WHITE on CORAL; NAVY on LTBLUE |

Examples:
- Phase card (CORAL) inside white slide → ✓
- Gate box inside CORAL card → fill = **LTBLUE**, text = NAVY
- Artefact box inside CORAL card → fill = **LTBLUE**, text = NAVY
- Flow node inside LTBLUE swim lane → fill = **CORAL**, text = WHITE
- Flow node inside LTPURPLE swim lane → fill = **CORAL**, text = WHITE
- Flow node inside CORAL swim lane → fill = **LTBLUE**, text = NAVY

**One rule: child ≠ parent color. Always.**

## Prohibited

- ❌ WHITE (#FFFFFF) as component fill on WHITE background — invisible, use LTBLUE or LTPURPLE instead
- ❌ LTBLUE (#B4DCFA) as text on WHITE background — too light, unreadable
- ❌ LTPURPLE (#FAB9FF) as text on WHITE background — too light, unreadable
- ❌ CORAL (#FA5A50) as text on CORAL card — invisible (same color)
- ❌ WHITE as text on WHITE or LTBLUE background — invisible/unreadable
- ❌ NAVY or MAROON as slide background (use LTBLUE for section dividers instead)
- ❌ Large CI&T logo on content slides (use small bottom-right only)
- ❌ Non-brand colors (no custom blues, greens, ambers, purples outside the 6 brand colors)

## Brand Palette (6 colors only)

| Color | Hex | Primary use |
|---|---|---|
| NAVY | #000050 | Text on light backgrounds, accent bars |
| CORAL | #FA5A50 | Card fills, title bg, accent highlights |
| MAROON | #690037 | Title slide only (brand decoration uses this) |
| LTBLUE | #B4DCFA | Section divider bg, SDD swim lane |
| LTPURPLE | #FAB9FF | QA swim lane, tertiary accent |
| WHITE | #FFFFFF | Content slide bg, text on coral cards |

## Quick Check: "Can I read this?"

For every text element, verify:
1. Is the text color different from its immediate background?
2. Is there sufficient contrast? (dark on light, or white on coral)
3. If text is on a card, is the card color different from the slide background?
