# Notices

This repository packages frontend-focused Codex skills and plugins. The original
packaging, install scripts, and skill orchestration are MIT licensed under this
repository's `LICENSE`.

Some skills include or reference third-party material. Those materials keep
their upstream licenses and attribution requirements.

## UI/UX Pro Max

`plugins/frontend-ui-ux-pro/skills/ui-ux-pro-max` is adapted from:

- Repository: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Homepage: https://uupm.cc
- Upstream license: MIT
- Local changes: Codex plugin packaging, PowerShell wrapper that prefers bundled
  Python, no-Python fallback guidance, zipped offline data asset, and
  Windows/Codex sandbox cache handling.

## React Bits

`plugins/frontend-react-ui/skills/react-bits` references React Bits:

- Repository: https://github.com/DavidHDev/react-bits
- Website: https://www.reactbits.dev
- Upstream license: MIT + Commons Clause

The large React Bits archive is not committed by default. Use
`scripts/fetch-react-bits.ps1` inside the skill if you want the local extractor
workflow. Review the upstream license before redistributing React Bits source or
archives.

## Trusted Upstream Snapshot

`source-packs/frontend-trusted-upstreams` contains curated notes and limited
reference snapshots from frontend/design repositories used to inform the skills.
Review each upstream project license before redistributing substantial source
content or generated assets.
