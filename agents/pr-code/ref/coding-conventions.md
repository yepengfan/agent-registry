# Coding Conventions

<!-- Fill in your team's coding conventions below -->

## General

- Prefer clarity over cleverness
- Keep functions focused — one responsibility per function
- Validate at system boundaries, trust internal code

## Naming

- Use descriptive names that reveal intent
- Boolean variables: use is_, has_, can_ prefixes
- Functions: use verb phrases (get_user, validate_input)

## Error Handling

- Handle errors at the appropriate level
- Provide actionable error messages
- Never swallow exceptions silently

## Testing

- Write tests for behavior, not implementation
- Test edge cases and error paths
- Keep tests independent — no shared mutable state

## Frontend Design Conventions

### Design System Usage
- All UI must use design system components from the project's DS library (e.g., @ifm-ds/core) — do not create custom elements when a DS component exists
- Use design system token classes for typography (text-body-sm, text-heading-md), spacing (gap-md, p-lg), and color — never use raw Tailwind hex colors or arbitrary values
- When a DS component doesn't exist for a design element, flag it as a gap rather than building a custom replacement

### Figma Compliance
- All UI implementation must match the Figma design for the feature
- Intentional deviations from Figma must be documented with a BRD/FR reference explaining why
- When in doubt about a design detail, check the Figma source — the design is the spec

### Layout Rules
- Container dimensions (widths, heights, max-widths) must match Figma specifications
- Element ordering must match Figma (e.g., header before banner, not the reverse)
- Button grouping and placement must match Figma per screen (e.g., split left/right vs single row)
- Conditional elements must appear only in the view states specified by Figma
