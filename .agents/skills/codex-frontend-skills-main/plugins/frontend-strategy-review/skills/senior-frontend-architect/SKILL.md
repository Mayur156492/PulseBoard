---
name: senior-frontend-architect
description: Use when making senior frontend architecture decisions or reviewing app structure.
---

# Senior Frontend Architect

Use this before broad frontend changes or senior-level design reviews.

## Workflow

1. Read stack, routes, data flow, state, design system, tests, and deploy constraints.
2. Name the user workflow the architecture must protect.
3. Compare options only when the decision is nontrivial.
4. Recommend the smallest maintainable path; avoid framework churn.
5. Define verification: tests, build, browser, performance, migration slice.

## Lens

Check ownership boundaries, server/client split, caching, routing, error/loading/empty states, tokens/primitives, observability, rollback, and test coverage.

## Output

Return context, constraints, recommendation, rejected alternatives, migration steps, risks, and verification. Read `../../references/current-sources.md` only when current framework behavior matters.