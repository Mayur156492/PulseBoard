# Example: Dashboard Redesign

Use this when you want the agent to turn a busy dashboard into a product-grade
frontend screen instead of repainting the same layout.

## Prompt

```text
Use the frontend skills pack.

Redesign this analytics dashboard for a government or enterprise operations
team. Keep it dense and decision-focused, not decorative.

Goals:
- show the current system state in the first viewport
- separate official data, model estimates, and missing data
- make the main risk metric understandable
- replace generic KPI cards with useful grouped indicators
- choose chart types that match the data
- include loading, empty, error, hover, focus, and mobile states
- verify the result in browser screenshots

Before coding, explain the layout model and why each chart belongs there.
After coding, run browser QA and call out remaining risks.
```

## Expected Skills

- `frontend-design-core`
- `frontend-ui-ux-pro`
- `frontend-react-ui`
- `frontend-browser-qa`
- `frontend-strategy-review`

## What Good Looks Like

- The dashboard reads as an operating surface, not a landing page.
- Important numbers answer a decision.
- Charts show movement, flow, capacity, or distribution.
- Copy explains metrics without adding tutorial clutter.
- Browser verification catches overflow, blank charts, and mobile issues.
