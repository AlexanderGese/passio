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

## Install

```bash
# runtime deps
sudo apt install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
  librsvg2-dev libxdo-dev build-essential libssl-dev xsel

# tooling
curl -fsSL https://bun.sh/install | bash
cargo install tauri-cli --version "^2.0"

# build + run
bun install
bun run dev         # dev (hot reload + sidecar watch)
bun run build       # produces .deb + .AppImage under apps/desktop/src-tauri/target/release/bundle/
```

On first launch the wizard walks you through API key → vault → first goal → pack. API keys are stored in your OS keychain (`keyring`), never on disk.

## Status

✅ **v2.2.0** — v1 + v2 all 18 weeks complete.

**v2 additions (weeks 9–18):**
- W9 safety rails (per-hostname policy, dangerous-action blocklist, countdown gate)
- W10 persona + speech bubble + rebindable keybinds
- W11 Gmail via [@devalxui/kova-mail](https://www.npmjs.com/package/@devalxui/kova-mail)
- W12 calendar (.ics), RSS feeds, open-meteo weather in morning briefing
- W13 workflow macros (save/list/replay gated steps)
- W14 multi-step research agent (cited) + Vercel Sandbox stub
- W15 task automation (reasoning-model planner) + 4-tier model router
- W16 local whisper.cpp STT + Ollama integration for economy tier
- W17 `pass`-backed secrets vault + SQLCipher hook + WiFi-hashed location
- W18 CI matrix (linux / macOS / Windows) + tauri-plugin-updater wired

## v1 baseline

✅ **v1.0.0-alpha** — all 8 weeks complete.
- Foundation: Tauri 2 + Bun sidecar + HUD bubble + IPC
- Context Engine: Drizzle + sqlite-vec + FTS5 + hybrid retrieval + AI SDK agent
- Goals: auto-decomposition + milestones + weekly reviews
- Obsidian: two-way vault integration + watcher
- Chrome extension: full DOM observation + action surface + audit log
- Proactive loop: scan decisions, packs, DND, pomodoro, morning/recap
- Voice: Whisper + TTS + selection hotkeys (rewrite / translate)
- Analytics + knowledge graph + file index + flashcards + shell/git
- First-run wizard, OS-keychain, Settings UI, conflict-checked keybinds, auto-updater wiring
