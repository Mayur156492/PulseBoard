---
name: react-composition-patterns
description: Use when untangling React/Next components, state boundaries, or server/client composition.
---

# React Composition Patterns

Use this to improve React structure without premature abstraction.

## Workflow

1. Check React/Next versions and local conventions.
2. Name each component's user-facing responsibility.
3. Separate data, permission gates, interaction state, presentation, and primitives.
4. Keep the smallest stable API between layers.
5. Verify behavior and rerender risk.

## Lens

Prefer composition, slots, and small components over prop-heavy mega-components. Keep state local unless coordination requires lifting. Avoid effects for derived data. Keep Next server/client boundaries explicit.

## Output

Return current pain, target boundaries, migration steps, risk points, and verification. Read `../../references/current-sources.md` when current React behavior matters.