---
name: frontend-performance-audit
description: Use when auditing frontend load, interaction, bundle, hydration, or Core Web Vitals.
---

# Frontend Performance Audit

Use this when speed or performance regressions matter.

## Workflow

1. Identify route, user path, device class, and network expectation.
2. Measure when possible: production build, trace, Lighthouse, Playwright timing, bundle output.
3. Separate load cost from interaction cost.
4. Fix the largest proven bottleneck and verify before/after.

## Lens

Check LCP, INP, CLS, server latency, image/font cost, JS shipped, client components, render work, effects, imports, API waterfalls, cache headers, virtualization, and animation strategy.

## Output

Return prioritized findings with evidence, expected impact, implementation steps, and verification commands. Read `../../references/current-sources.md` for current perf guidance.