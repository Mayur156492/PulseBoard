# Agent Workflow Loop

This example shows the "wow" story: the pack turns a coding agent into a
frontend worker that can reason, build, verify, and review.

It is similar in spirit to autonomous agent workflows: plan the task, inspect
the app, choose the frontend approach, implement, run browser checks, and report
evidence. It is not a Manus integration; it is a frontend workflow pattern for
Codex and Claude.

## Manus-Style Flow

```text
User request
  -> understand product intent
  -> choose frontend skills
  -> inspect app and constraints
  -> design the screen
  -> implement components
  -> verify in browser
  -> review like a senior frontend engineer
  -> report evidence and risks
```

## Demo Prompt

```text
Use the frontend skills pack as an autonomous frontend loop.

Task:
Improve this education analytics dashboard so a regional operator can understand
capacity, risk, demand, and missing data in the first viewport.

Workflow:
1. Decide which frontend skills apply.
2. Explain the product interpretation.
3. Propose the dashboard structure.
4. Implement the UI.
5. Run browser QA.
6. Review the result for accessibility, performance, and visual clarity.
7. Return evidence, not just a claim that it works.
```

## What This Demonstrates

- `frontend-design-core` decides the layout and interface quality bar.
- `frontend-ui-ux-pro` provides design-system and UX guidance from local data.
- `frontend-react-ui` improves components without random library bloat.
- `frontend-browser-qa` checks the real rendered UI.
- `frontend-strategy-review` catches architecture and review issues.

## Example Agent Trace

```text
Skills selected:
- frontend-design-core for layout and hierarchy
- frontend-ui-ux-pro for design-system search
- frontend-react-ui for component states
- frontend-browser-qa for screenshots and console checks
- frontend-strategy-review for final review

Plan:
- Replace generic KPI cards with grouped operational indicators.
- Add source badges: official, model, missing.
- Use trend and capacity charts instead of static decoration.
- Add empty/loading/error states to filters and chart panels.
- Verify 390px mobile and 1440px desktop.

Evidence:
- desktop screenshot checked
- mobile screenshot checked
- no console errors
- no text overflow in primary cards
- remaining risk: data formulas still need domain validation
```

## Why It Is Useful

This is what most single skills do not show. A frontend task is not just code
generation. It is a loop of product judgment, implementation, verification, and
review.
