# Passio

A local-first, agentic desktop AI assistant shaped like a passionfruit. Runs on your Linux machine, remembers everything, helps you pursue massive goals, and acts autonomously in your browser.

- **Platform:** Linux (Kali / Debian / Ubuntu) — `.deb` and `.AppImage`
- **Stack:** Rust (Tauri 2) + TypeScript on Bun + React + Chrome extension
- **AI:** OpenAI primary (GPT-4o-mini / 4.1 / 5), Claude fallback via Vercel AI Gateway
- **Storage:** Local SQLite (Drizzle + sqlite-vec + FTS5) + your Obsidian vault
- **Resources:** idle ~35 MB RAM, ~0.3 % CPU. Cold-by-default sidecar.
- **License:** MIT

## Quickstart

```bash
bun install
bun dev
```

See [`docs/superpowers/specs/2026-04-17-passio-design.md`](docs/superpowers/specs/2026-04-17-passio-design.md) for the full design specification.

## Repository layout

```
apps/
  desktop/       Tauri 2 app (Rust core + React HUD)
  extension/     Chrome MV3 browser extension
packages/
  sidecar/       Bun TypeScript sidecar (AI, Context Engine, voice, tools)
  shared/        Shared TS types (RPC protocol, settings)
  ui/            Shared shadcn components
docs/
  superpowers/   Specs & plans
```

## Status

🚧 Alpha — under active development. v1 target: 8 weeks from 2026-04-17.
