# UI Source Map

Checked on 2026-06-01.

External source-pack: `source-packs/frontend-trusted-upstreams`

## Trusted Active References

- shadcn official skill and docs: core app UI, registry workflow, Radix/Base UI, Tailwind v4.
- Vercel AI Elements: AI SDK-native chat, messages, reasoning, responses, tools, attachments, artifacts.
- 21st Agent Elements: agent UI patterns such as tool cards, plan approvals, diffs, subagents, mode/model controls.
- Magic UI: animated accents and effects; registry has 76 component items in this environment.
- Motion Primitives: lower-level polished motion components.
- Origin UI: broad shadcn-compatible application UI patterns.
- Dify/langgenius and awesome-skills review refs: frontend code review checklist depth.
- UX Enhancer: review-only usability patterns for clutter, vague buttons, dead-end empty states, and scanability.

## Selection Rules

- Core product controls: shadcn/Radix/Base UI first.
- Complex app screens: shadcn + Origin UI patterns, then custom composition.
- Marketing/hero/polish: Magic UI or Motion Primitives, but restrain effects.
- AI products: Vercel AI Elements for AI SDK surfaces; 21st Agent Elements for tool-card/approval/diff-heavy agent UX.
- Voice agent UIs: consider Deepgram UI/agent-specific component libraries only after dependency review.

## Button Standard

A production button must have a clear action verb, variant semantics, icon or text that fits, loading state, disabled state, focus-visible ring, keyboard activation, sufficient target size, and responsive behavior. Destructive actions need clear copy and confirmation when irreversible.
