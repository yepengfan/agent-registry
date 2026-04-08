# CI&T Brand Guidelines

## Color Palette — 6 Colors Only

| Name     | Hex       | Primary Use                          |
|----------|-----------|--------------------------------------|
| NAVY     | #000050   | Text on light bg, accent bars        |
| CORAL    | #FA5A50   | Card fills, title bg, accents        |
| MAROON   | #690037   | Title slide brand decoration only    |
| LTBLUE   | #B4DCFA   | Section divider bg, swim lanes       |
| LTPURPLE | #FAB9FF   | QA swim lane, tertiary accent        |
| WHITE    | #FFFFFF   | Content slide bg, text on coral      |

No other colors are allowed.

## Text Color Rules

Core principle: light background -> NAVY text. CORAL background -> WHITE text.

| Text Location            | Text Color | Reason                    |
|--------------------------|------------|---------------------------|
| On WHITE bg              | NAVY       | Light bg -> dark text     |
| On LTBLUE bg             | NAVY       | Light bg -> dark text     |
| On LTPURPLE bg           | NAVY       | Light bg -> dark text     |
| On CORAL card/component  | WHITE      | CORAL is dark enough      |
| On CORAL bg (title slide)| NAVY       | Title slide exception     |
| Emphasis on white bg     | CORAL      | Accent only, not body     |

## Nesting Rules

Child fill must always differ from parent fill.

| Parent Color | Child Fill Options      | Child Text                              |
|--------------|-------------------------|-----------------------------------------|
| WHITE        | CORAL, LTBLUE, LTPURPLE | WHITE on CORAL; NAVY on LTBLUE/LTPURPLE |
| CORAL        | WHITE, LTBLUE, LTPURPLE | NAVY                                    |
| LTBLUE       | CORAL, LTPURPLE         | WHITE on CORAL; NAVY on LTPURPLE        |
| LTPURPLE     | CORAL, LTBLUE           | WHITE on CORAL; NAVY on LTBLUE          |

## Accent Bar Rules

- Light bg slides (LTBLUE/WHITE) -> dark bars: NAVY / MAROON
- Dark bg slides (CORAL) -> light bars: WHITE / LTBLUE
- Applies everywhere on the slide regardless of card nesting

## Prohibited Combinations

- Same-color fill on same-color background (invisible)
- WHITE text on WHITE or LTBLUE bg (invisible)
- LTBLUE or LTPURPLE as text color on light bg (unreadable)
- NAVY or MAROON as slide background
- Large CI&T logo on content slides
- Non-brand colors anywhere
