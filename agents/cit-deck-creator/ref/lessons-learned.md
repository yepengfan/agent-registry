# Slide Generation — Lessons Learned

## Critical Rules

1. **Never duplicate template slides** — they bring ghost text from layouts. Use clean layouts and copy only GROUP shapes (brand decoration, logos).

2. **Logo is always WHITE** in all layouts. Don't try to recolor it — modifying the layout affects all slides. Use dark backgrounds where white logo is visible.

3. **Set text color on paragraph level** (`p.font.color.rgb`), not just run level. The audit script checks both.

4. **Monospace text** (commands, file paths, code) on LTBLUE bg must be NAVY. Never use accent colors for functional text.

5. **Accent bars are thin rectangles** (width or height <= 5pt). They follow the same dark-on-light / light-on-dark rule everywhere.

6. **Each nested layer must differ from its parent.** This is the #1 source of violations.

7. **Always remove placeholders** after adding a slide from a layout — they can contain ghost text.

## Template Details

- Template slide 9 (index 8) has the brand decoration GROUP for title slides
- Layout 0 has ghost text — always use Layout 2 (title) or Layout 22 (content)
- Layouts 1-27 are clean; Layout 4 has a large logo — avoid it for content
