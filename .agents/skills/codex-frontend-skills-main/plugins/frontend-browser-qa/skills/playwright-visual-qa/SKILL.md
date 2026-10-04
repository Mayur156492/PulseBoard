---
name: playwright-visual-qa
description: Use when automating screenshots, responsive checks, route smoke tests, or Playwright verification.
---

# Playwright Visual QA

Use this skill when browser checks should be repeatable.

## Rules

- Prefer existing Playwright setup if the repo has one.
- For quick verification, use a minimal script or CLI flow and save screenshots only when useful.
- Test at least one desktop and one mobile viewport for layout changes.
- Check for blank canvases, clipped text, overlapping controls, and broken images.
- Keep scripts scoped to the route and behavior under review.
