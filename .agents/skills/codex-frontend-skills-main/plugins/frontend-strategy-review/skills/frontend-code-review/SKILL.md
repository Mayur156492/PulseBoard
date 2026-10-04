---
name: frontend-code-review
description: Use when reviewing frontend diffs for bugs, accessibility, security, performance, and tests.
---

# Frontend Code Review

Use this for review mode. Findings first.

## Workflow

1. Inspect the requested diff/files and nearby contracts.
2. Run available checks when practical.
3. Focus on defects a linter will not catch.
4. Report severity, file/line, evidence, impact, and fix direction.

## Lens

Check async races, stale closures, effects, hydration, forms, cache invalidation, a11y, unsafe HTML/URLs, token exposure, rerenders, bundle growth, responsive styling, ownership, and missing regression tests.

## Output

Use: blocking, important, nit, suggestion. If no issues are found, say that clearly and name residual test risk.