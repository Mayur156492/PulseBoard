<div align="center">

# Agent Elements

**Production-ready React components for chat, tools, and AI workflows.**

A shadcn-style registry of agent UI primitives — message lists, streaming markdown, tool cards (Bash, Edit, Search, Todo, Plan…), clarifying questions, and a composable input bar — built on React 19, Tailwind v4, and the Vercel AI SDK.

[Live site](https://agent-elements.21st.dev) · [Docs](https://agent-elements.21st.dev/docs) · [Discord](https://discord.gg/Aq2B7bCp) · [21st.dev](https://21st.dev)

</div>

---

## What's in the box

- **`AgentChat`** — drop-in chat shell that wires `MessageList` + `InputBar`, dispatches tool invocations to renderers, and handles the empty state.
- **Tool cards** — `BashTool`, `EditTool` (with diffs + approval), `SearchTool`, `TodoTool`, `PlanTool`, `ToolGroup`, `SubagentTool`, `McpTool`, `ThinkingTool`, `GenericTool`.
- **Question tool** — clarifying questions with single / multi / free-text answers.
- **Composer pieces** — `InputBar`, `Suggestions`, `ModelPicker`, `ModeSelector`, `SendButton`, `AttachmentButton`, `FileAttachment`.
- **Streaming bits** — `Markdown` (safe streaming), `TextShimmer`, `SpiralLoader`.

26 components total — see the full catalog at [agent-elements.21st.dev/docs](https://agent-elements.21st.dev/docs) or the registry index at [`/r/index.json`](https://agent-elements.21st.dev/r/index.json).

## Install components

The registry is shadcn-compatible. Pull in `agent-chat` and it transitively installs everything it needs:

```bash
npx shadcn@latest add https://agent-elements.21st.dev/r/agent-chat.json
```

Files land under `components/agent-elements/`. Pick individual pieces the same way:

```bash
npx shadcn@latest add https://agent-elements.21st.dev/r/bash-tool.json
npx shadcn@latest add https://agent-elements.21st.dev/r/input-bar.json
```

**Requirements:** React 19, Tailwind v4, a shadcn-initialised project (`npx shadcn@latest init`).

## Quick example

```tsx
"use client";

import { AgentChat } from "@/components/agent-elements/agent-chat";
import { BashTool } from "@/components/agent-elements/tools/bash-tool";
import { EditTool } from "@/components/agent-elements/tools/edit-tool";
import { SearchTool } from "@/components/agent-elements/tools/search-tool";
import { useChat } from "@ai-sdk/react";

export default function Chat() {
  const { messages, status, sendMessage, stop } = useChat();

  return (
    <AgentChat
      messages={messages}
      status={status}
      onSend={({ content }) => sendMessage({ text: content })}
      onStop={stop}
      toolRenderers={{
        Bash: BashTool,
        Edit: EditTool,
        Write: EditTool,
        Search: SearchTool,
      }}
    />
  );
}
```

## Skill for Claude Code & friends

A bundled [skills.sh](https://skills.sh) skill teaches AI assistants the component catalog, prop shapes, and composition rules so they stop hallucinating imports.

```bash
npx skills add 21st-dev/agent-elements
```

Source: [`skills/agent-elements/SKILL.md`](skills/agent-elements/SKILL.md). More at [docs/skills](https://agent-elements.21st.dev/docs/skills).

## Local development

This repo is **both** the registry source and the documentation site (Next.js 16). To run it:

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Other scripts:

| Script                   | What it does                                                |
| ------------------------ | ----------------------------------------------------------- |
| `pnpm dev`               | Next.js dev server                                          |
| `pnpm build`             | Rebuilds the registry, then builds the site (`prebuild` hook) |
| `pnpm registry:build`    | Generates `public/r/*.json` from `lib/agent-ui/`            |
| `pnpm lint` / `pnpm format` | ESLint / Prettier                                        |

## Project structure

```
.
├── app/                   Next.js app — landing page, /docs, /api/agent
├── lib/agent-ui/          Component source (the library)
├── scripts/build-registry.mts   Compiles lib/agent-ui → public/r/*.json
├── public/r/              Generated shadcn registry (committed)
├── skills/agent-elements/ skills.sh bundle (SKILL.md + README)
└── agents/my-agent/       Example @21st-sdk/agent definition
```

The registry builder resolves intra-library imports, rewrites `@/lib/agent-ui/*` → `@/components/agent-elements/*`, and emits one JSON per component plus an index.

## Part of the 21st.dev Agent SDK

Agent Elements is the UI layer of the [**21st.dev Agent SDK**](https://21st.dev/agents). If you just want the components, everything above works on its own — plug them into any React app and wire them to your backend.

If you need a full agent (Claude Code or Codex running in a sandbox, with threads, streaming, tool approvals, and this UI out of the box), use the SDK directly. You get the same components, preconfigured, plus the runtime.

→ [Explore the Agent SDK](https://21st.dev/agents)

## Stack

Next.js 16 · React 19 · Tailwind v4 · [Vercel AI SDK](https://sdk.vercel.ai) · [shadcn](https://ui.shadcn.com) · [Base UI](https://base-ui.com) · [Motion](https://motion.dev) · [Shiki](https://shiki.style) · [`@21st-sdk/*`](https://21st.dev/agents)

## Links

- **Site:** [agent-elements.21st.dev](https://agent-elements.21st.dev)
- **Registry index:** [agent-elements.21st.dev/r/index.json](https://agent-elements.21st.dev/r/index.json)
- **LLM-friendly docs:** [agent-elements.21st.dev/llms-full.txt](https://agent-elements.21st.dev/llms-full.txt)
- **Issues:** [github.com/21st-dev/agent-elements/issues](https://github.com/21st-dev/agent-elements/issues)
- **Discord:** [discord.gg/Aq2B7bCp](https://discord.gg/Aq2B7bCp)

## License

[MIT](LICENSE) — built by [21st.dev](https://21st.dev).
