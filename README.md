# Passio

> Local-first desktop AI assistant shaped like a passionfruit. Remembers, plans, acts, and grows via Seeds.

A floating bubble that lives in your corner of the screen. Persistent memory (SQLite + vec + FTS5), autonomous retrigger loops with safety caps, two-way Obsidian sync, cascading personality picker, and a plugin system (Seeds) with a curated Orchard registry. Everything runs locally — your OpenAI key stays in your OS keychain, zero telemetry, nothing phones home.

- **Platform:** Linux (Kali · Debian · Ubuntu) — `.deb` + AppImage
- **Stack:** Tauri 2 (Rust core) + Bun-compiled sidecar (TypeScript) + React HUD + Chrome MV3 extension + PWA
- **AI:** OpenAI primary (`gpt-4o-mini` / `gpt-4.1` / `gpt-5` / `o3`), Whisper for STT, TTS for voice-out
- **Storage:** SQLite via `drizzle-orm` + `sqlite-vec` + FTS5, your Obsidian vault
- **Resources:** ~35 MB RAM idle, cold-by-default sidecar (90s idle kill)
- **License:** MIT

## What's inside

- **Chat** — streaming, tool-calling, per-goal scoped, history search, spotlight across everything
- **Do** — todos (two-way sync with `<vault>/Todo.md`), goals with auto-decomposed milestones, autonomous retrigger loops that run until a task is done
- **Know** — memory browser (facts / notes / entities), vault editor (notes mirror both ways, daily-note template configurable), nightly reflection proposals
- **Pulse** — ambient activity tracker, focus sessions with Ironman corner HUD, cost dashboard with per-tier $, errors ring buffer
- **Grow** — Seeds (plugins): 125-entry Orchard · license-gated paid seeds · dev mode · ed25519 keys verified locally
- **Settings** — persona tree (5 × 5 × 5 = 125 voices + free-form prompt override), rebindable hotkeys, budgets, data export/import, header layout customization, vault config, Obsidian daily-note template

## Install

```bash
# one-liner once the .deb lands in releases:
sudo dpkg -i Passio_2.2.0_amd64.deb

# or build from source:
sudo apt install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
  librsvg2-dev libxdo-dev build-essential libssl-dev xsel
curl -fsSL https://bun.sh/install | bash
cargo install tauri-cli --version "^2.0"
bun install
bun run --cwd apps/desktop tauri:build
```

After install, Passio is in your app launcher and autostarts on login. Double-clicking any `.seed` file installs that seed.

## Seeds — the plugin system

Seeds are small JS (soon: WASM) plugins that run in a sandboxed Bun Worker. They can:

- Register chat tools (callable by the agent)
- Add tabs/widgets to the bubble
- Schedule background loops
- Listen to events (chat, scan, activity, hotkey)
- Make network calls to hosts they explicitly declared
- Read/write seed-scoped secrets + KV

Every seed declares its permissions in a manifest — the host enforces them at every call. Paid seeds use ed25519 license signatures verified locally (no phoning home).

**Free seeds** are bundled under `seeds/` and listed in [`orchard/index.json`](orchard/index.json). Install in Grove with one click.

**Paid seeds** currently include:
- `reddit-command` ($29), `x-command` ($39), `linkedin-command` ($49) — full remotes with AI autopilot
- `gmail-triage` ($15), `slack-admin-command` ($39), `discord-command` ($29) — inbox/team automations
- `github-command` ($49), `vercel-command` ($39), `cloudflare-command` ($49) — dev ops
- `stripe-command` ($49), `hubspot-command` ($49), `shopify-command` ($79), `salesforce-command` ($79) — B2B
- `notion-command` ($39), `readwise-command` ($29), `spotify-remote-command` ($29) — knowledge/music
- `mastodon-command` ($19), `bluesky-command` ($19) — fediverse
- `youtube-command` ($59), `canva-command` ($49), `elevenlabs-command` ($39), `ghost-command` ($29), `wordpress-command` ($29) — creator tools
- `zoom-command` ($39)

All of them share the same anatomy: full API surface as agent-callable tools + opt-in autopilot with hard daily caps + dry-run default + license-gated.

See [the catalog](docs/seeds/catalog.md) for the full list, the [quickstart](docs/seeds/quickstart.md) to build your own, and [selling-seeds](docs/seeds/selling-seeds.md) for monetization.

## Repo layout

```
apps/
  desktop/      Tauri 2 app (Rust core + React HUD)
  docs/         Next.js + shadcn/ui documentation site (this)
  extension/    Chrome MV3 bridge
  mobile/       React PWA companion
packages/
  sidecar/      Bun-compiled single-binary sidecar (agent, tools, DB, seeds runtime, HTTP /rpc bridge)
  shared/       Shared types, Zod schemas, RPC method registry
  seed-cli/     `passio-seed init|build|dev` + `license-gen init|sign`
seeds/          Reference seeds (100 free + 24 paid)
orchard/
  index.json    Curated Orchard registry
docs/           Markdown docs (rendered at passio.dev)
```

## Running

```bash
bun install
bun run --cwd apps/desktop tauri:dev    # dev mode
bun run --cwd apps/docs dev             # docs site on :3000
```

## Privacy

Your data never leaves the laptop except when you explicitly call an LLM with your own key. No telemetry, no crash reporting, no update pings you didn't opt into. See [`docs/privacy.md`](docs/privacy.md) for the exhaustive list of network calls + how to kill each of them.

## License

MIT. See [LICENSE](LICENSE).

---

Built by [@alexandergese](https://github.com/alexandergese).
