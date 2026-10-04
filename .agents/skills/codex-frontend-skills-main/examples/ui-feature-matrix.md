# UI Feature Matrix

This is the fastest way to show what the repo actually adds to Codex or Claude.

## Feature Coverage

| Feature | What the agent learns to do | Skills involved |
| --- | --- | --- |
| Product UI direction | Choose layout, density, tone, and interaction model based on the product | `frontend-design-core`, `frontend-ui-ux-pro` |
| Design systems | Generate palette, typography, spacing, motion, and anti-patterns | `frontend-ui-ux-pro` |
| Buttons | Handle labels, icons, loading, disabled, focus, hover, stable sizing | `frontend-design-core`, `frontend-react-ui` |
| Forms | Add labels, hints, validation, errors, keyboard flow, submit states | `frontend-react-ui`, `frontend-browser-qa` |
| Dashboards | Separate KPIs, trends, flows, capacity, risks, and source badges | `frontend-prototypes`, `frontend-ui-ux-pro` |
| Charts | Pick chart types based on the data question, not decoration | `frontend-ui-ux-pro`, `frontend-design-core` |
| Motion | Use restrained motion with `prefers-reduced-motion` | `frontend-3d-motion`, `frontend-react-ui` |
| Three.js | Avoid blank canvases, bad imports, broken controls, and poor framing | `frontend-3d-motion`, `frontend-browser-qa` |
| React UI | Fit existing project patterns instead of dropping generic components | `frontend-react-ui`, `frontend-strategy-review` |
| Accessibility | Check contrast, labels, keyboard navigation, focus, and semantic flow | `frontend-strategy-review`, `frontend-browser-qa` |
| Browser QA | Verify screenshots, console, network, overflow, and responsive behavior | `frontend-browser-qa` |
| Code review | Surface architecture, performance, composition, and maintainability issues | `frontend-strategy-review` |

## Demo Prompt

```text
Use the frontend skills pack.

Build a production dashboard module with:
- KPI summary
- trend chart
- risk explanation
- source badges
- filter controls
- loading, empty, error, and disabled states
- responsive desktop/mobile layout
- browser QA evidence

Before implementation, explain which skills are being used and why.
After implementation, summarize verification results and remaining risk.
```

## Expected Output

The agent should not only produce code. It should produce a workflow:

1. Product pattern and layout choice.
2. Component state inventory.
3. Implementation using the existing stack.
4. Browser verification.
5. Review findings and remaining risk.
