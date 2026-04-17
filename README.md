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
