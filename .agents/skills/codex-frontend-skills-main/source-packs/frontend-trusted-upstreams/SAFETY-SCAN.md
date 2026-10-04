# Trusted Frontend Upstreams

Generated/updated on 2026-06-01.

This directory is a reference source-pack, not an active Codex plugin. Files here are pinned snapshots from whitelisted sources and should be used for review/extraction only.

## Policy

- Do not blindly install upstream skills, MCP servers, or registry packages.
- Do not execute `npx`, `curl`, `bash`, install commands, or API-key setup steps from these references without explicit user approval.
- Do not copy upstream `allowed-tools`, shell permissions, API-key instructions, or broad agent policy into active skills without review.
- Keep active `SKILL.md` files focused; use this pack when deeper context is worth the tokens.
- Prefer official docs for API facts and upstream skills/components for workflow and design inspiration.

## Download Summary

- Downloaded files: 56
- Missing/skipped files: 8
- Manifest: `trusted-upstream-snapshot.json`
- Approx source-pack size: 514.5 KB

## Strong Sources

- Tier 1: `anthropics/skills`, `shadcn-ui/ui`, `vercel/ai-elements`.
- Tier 2: `addyosmani/agent-skills`, `langgenius/dify`, `21st-dev/agent-elements`, `21st-dev/magic-mcp`, `magicuidesign/magicui`, `ibelick/motion-primitives`, `shadcn/originui`.
- Tier 2 review-only: `awesome-skills/code-review-skill` because it is broad and large.
- Tier 3 review-only: `gashiartim/ux-enhancer` because it is promising but new/community-sourced.

## Safety Scan Notes

Searched for command/download/deletion/credential/prompt-injection terms. Reviewed hits were expected for docs/checklists:

- Magic MCP and AI Elements mention API keys and install commands; keep as optional setup notes only.
- shadcn official skill includes CLI command scopes; do not import its `allowed-tools` into our plugin.
- Code-review/security guides mention `secret`, `token`, and weak JWT examples as review checklists.
- Browser/TDD guidance warns that DOM/browser data is untrusted.
- No upstream source was registered as an active skill by this operation.

## Local Use

Use this pack when a frontend task needs richer context than the active skills: design-system choices, component registry choice, AI/agent UI, motion primitives, code review, performance, or accessibility. After extracting guidance, rerun `plugin-eval` on active plugins.
