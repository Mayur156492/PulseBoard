---
name: shadcn-registry
description: Use when adding, styling, debugging, or composing shadcn/ui components or registries.
---

# shadcn Registry

Use this skill when a project uses `components.json`, shadcn/ui, Radix-based components, or registry installs.

## Rules

- Use the project package runner and `shadcn@latest` unless the repo pins a command.
- Add components as source code and adapt them to the local design tokens.
- Use `Form`, `FormLabel`, accessible descriptions, and clear errors for forms.
- Prefer registry items that solve a real workflow; do not add component collections just for decoration.
- Check generated imports, path aliases, Tailwind config, and dark mode tokens after install.
