<div align="center">

<img src="apps/desktop/src-tauri/icons/icon.png" width="128" alt="Passio" />

# Passio

**A local-first desktop AI assistant, shaped like a passionfruit.**

Remembers · Plans · Acts · Grows

[![License: MIT](https://img.shields.io/badge/license-MIT-a855f7.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/linux-Kali%20·%20Debian%20·%20Ubuntu-ff6b9d)](https://github.com/alexandergese/passio/releases)
[![Seeds](https://img.shields.io/badge/seeds-124-ffb84d)](orchard/index.json)
[![Made with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB)](https://tauri.app)
[![Stars](https://img.shields.io/github/stars/alexandergese/passio?style=flat&color=a855f7)](https://github.com/alexandergese/passio/stargazers)

[Docs](https://passio.dev) ·
[Orchard](https://passio.dev/seeds) ·
[Download](https://github.com/alexandergese/passio/releases) ·
[Sell a Seed](docs/seeds/selling-seeds.md)

</div>

---

## What is Passio?

Passio is a floating passionfruit-shaped bubble that lives in the corner of your screen and acts as a proactive personal AI. Unlike every cloud chat app, **your data stays on your laptop** — SQLite + vector index on disk, your OpenAI key in your OS keychain, zero telemetry, nothing phones home. When it needs an LLM, it uses *your* key against *your* budget.

It's built to be more than a chat box. Passio:

- 🧠 **Remembers** facts, notes, todos, goals, conversations, and your Obsidian vault with a hybrid FTS5 + vector search.
- ∞ **Runs autonomous loops** — give it a high-level task, it plans sub-steps, executes, re-plans, and runs until done. Hard caps on steps, cost, and replans. Cancel any moment.
- 📚 **Syncs two-way with Obsidian** — notes mirror into the vault, checkboxes in `Todo.md` reflect instantly, daily-note recaps append automatically.
- 🌱 **Grows via Seeds** — a plugin system with a curated [Orchard](orchard/index.json) (124 seeds · 100 free · 24 paid). Every seed runs in a sandboxed Bun Worker with capability-gated APIs and can be built in an afternoon.
- 🎭 **Has a soul you pick** — a cascading personality picker with 5 × 5 × 5 = 125 leaves, plus a free-form prompt override for the pedantic.

## Screenshots

> *(Coming soon — the app is ~35 MB idle, you can see for yourself.)*

## Install

### Ubuntu / Debian / Kali (`.deb`)

```bash
# Grab the latest release from https://github.com/alexandergese/passio/releases
sudo dpkg -i Passio_2.2.0_amd64.deb
sudo apt -f install   # resolves any missing runtime deps
```

After install, Passio is in your app launcher and **autostarts on next login**. Double-clicking any `.seed` file installs that plugin.

### From source

```bash
# system deps (Debian/Ubuntu/Kali)
sudo apt install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
  librsvg2-dev libxdo-dev build-essential libssl-dev xsel

# toolchain
curl -fsSL https://bun.sh/install | bash
cargo install tauri-cli --version "^2.0"

git clone https://github.com/alexandergese/passio.git
cd passio
bun install
bun run --cwd apps/desktop tauri:dev    # dev mode (hot reload)
bun run --cwd apps/desktop tauri:build  # produces .deb + .AppImage
```

macOS and Windows: Tauri 2 supports both — the build scripts aren't wired yet but the Rust/TS stack is cross-platform. PRs welcome.

## What's in the bubble?

Passio opens into one of **6 tabs** (customizable):

| Tab | What it does |
|---|---|
| 💬 **Chat** | Streaming conversation. Tool-calling. Per-goal scoped chats. History search. ∞ auto-loop toggle. |
| ✓ **Do** | Todos (two-way Obsidian sync), Goals with auto-decomposed milestones, Auto-loop runner with live step log. |
| 🧠 **Know** | Memory browser (facts/notes/entities, editable), Vault editor, Nightly reflection proposals. |
| 📊 **Pulse** | Activity tracker (top processes + active window), Focus sessions w/ Ironman corner HUD, Cost dashboard per tier, Errors ring buffer. |
| 🌱 **Grow** | Seeds (plugins): browse Orchard, one-click install, dev mode, per-seed settings, updates check. |
| ⚙ **Settings** | Persona, keybinds, API keys, mail, calendar, RSS, weather, vault, Todo.md path, policy, automation, privacy, header layout, budget alerts, about/updates. |

### Header chips (reorderable)

Weather · Calendar ticker · Unread-mail pill · Pomodoro ring · What-next (⟲) · Spotlight (🔍) · Speak toggle (🔊/🔇) · Posture chip (🌙 Quiet / ☀ Active / ⚡ Proactive+) · plus any header-widgets contributed by installed seeds.

### Hotkeys (rebindable)

| Default | Action |
|---|---|
| `Super+Shift+Space` | Toggle the bubble — the "Copilot key" combo |
| `Super+Space` | Focus chat |
| `Super+Shift+A` | **Spotlight** — Apple-style launcher: apps, files, notes, todos, clipboard, emoji, system actions ([full reference →](docs/spotlight.md)) |
| `Super+Shift+S` | Screenshot-and-ask (vision) |
| `Super+Shift+W` | "What should I do next?" (one-tap leverage picker) |
| `Super+Shift+C` | Clipboard-ask chip |
| `Super+Shift+R` | Rewrite selection |
| `Super+Shift+L` | Translate selection |
| `Super+Shift+N` | Force a proactive scan |
| `Super+Alt+Space` | Push-to-talk (voice in) |

Seeds can register their own global hotkeys in their manifest — Passio merges them into the registration list.

## Seeds — the plugin system

**[🌱 Browse the Orchard →](https://passio.dev/seeds)**

Seeds are small JS (WASM coming) plugins that run in a sandboxed Bun Worker. Each one declares exactly what it needs in its manifest:

```json
{
  "permissions": {
    "network": ["api.spotify.com"],
    "secrets": ["spotify_token"]
  },
  "contributes": {
    "tools": ["now_playing"],
    "widgets": [{ "id": "spotify-chip", "slot": "header", "panel": "./chip.js" }],
    "scheduler": [{ "id": "poll", "every_seconds": 60 }]
  }
}
```

The host enforces permissions at every call. Undeclared `fetch` or secret access throws.

### Free seeds (100)

Bundled in `seeds/` and listed in [`orchard/index.json`](orchard/index.json). Covers **widgets** (clock-sync, crypto-ticker, rain-warning, battery, pomodoro chip, meeting-soon…), **inbox** (email scheduler, undo-send, mail-digest, smart-bcc…), **news** (hn-pulse, lobsters-pulse, reddit-digest, arxiv-fresh…), **calendar** (weekly-review, birthdays, flow-timer…), **developer** (github-pr-dashboard, npm-outdated, commit-message-coach…), **research** (pdf-drop, highlighter, citation-formatter, quote-collector…), **productivity** (habit-tracker, daily-intent, eisenhower-sorter…), **fun** (compliment-fairy, weather-haiku, word-of-the-day…), **integrations** (read-only Spotify / Linear / Jira / Strava…), and more.

### Paid seeds (24 · full list below)

Each one is a **full API remote + AI autopilot with hard safety caps**. Same anatomy: complete API surface as agent-callable tools, opt-in autopilot (off + dry-run by default), per-day + per-hour caps, license-gated.

| Category | Seed | Price | What it does |
|---|---|---|---|
| Social | [`mastodon-command`](seeds/mastodon-command) | **$19** | Toot, boost, favourite, follow, timelines, any instance |
| Social | [`bluesky-command`](seeds/bluesky-command) | **$19** | Post, like, repost, feeds, follow (AT protocol) |
| Social | [`reddit-command`](seeds/reddit-command) | **$29** | Submit, comment, vote, search, inbox + autopilot |
| Social | [`discord-command`](seeds/discord-command) | **$29** | Channels, threads, events, roles, moderation |
| Social | [`x-command`](seeds/x-command) | **$39** | Tweet, reply, like, RT, delete, timelines + autopilot |
| Social | [`slack-admin-command`](seeds/slack-admin-command) | **$39** | Post as you, channels, reminders, threads, status |
| Social | [`linkedin-command`](seeds/linkedin-command) | **$49** | Share, comment, messages, invites + autopilot |
| Mail | [`gmail-triage`](seeds/gmail-triage) | **$15** | Auto-categorize unread + drafts a reply for each |
| Dev | [`vercel-command`](seeds/vercel-command) | **$39** | Deploys, env vars, rollbacks, domains, logs |
| Dev | [`cloudflare-command`](seeds/cloudflare-command) | **$49** | DNS, Workers deploy, KV, purge cache |
| Dev | [`github-command`](seeds/github-command) | **$49** | Issues, PRs, reviews, releases, stars + stale triage |
| CRM | [`notion-command`](seeds/notion-command) | **$39** | Pages, databases, queries, templates |
| CRM | [`hubspot-command`](seeds/hubspot-command) | **$49** | Contacts, deals, notes, tasks |
| CRM | [`stripe-command`](seeds/stripe-command) | **$49** | Invoicing, refunds, subscriptions, disputes |
| CRM | [`shopify-command`](seeds/shopify-command) | **$79** | Orders, inventory, customers, fulfillments |
| CRM | [`salesforce-command`](seeds/salesforce-command) | **$79** | Accounts, opportunities, SOQL |
| Creator | [`ghost-command`](seeds/ghost-command) | **$29** | Posts, scheduling, tags |
| Creator | [`wordpress-command`](seeds/wordpress-command) | **$29** | Posts, media, comments, categories |
| Creator | [`spotify-remote-command`](seeds/spotify-remote-command) | **$29** | Playback, playlists, search |
| Creator | [`readwise-command`](seeds/readwise-command) | **$29** | Highlights, daily review, save-to-Reader |
| Creator | [`elevenlabs-command`](seeds/elevenlabs-command) | **$39** | Voices, TTS, history |
| Creator | [`canva-command`](seeds/canva-command) | **$49** | Brief → design → export (Connect API) |
| Creator | [`youtube-command`](seeds/youtube-command) | **$59** | Metadata, comments, playlists, captions |
| Productivity | [`zoom-command`](seeds/zoom-command) | **$39** | Meetings, recordings, transcripts |

Total list price ≈ $1,048. A "Social Pack" / "Founder Pack" bundle story is on the roadmap.

### Build your own Seed

```bash
bunx @passio/seed-cli init my-seed
cd my-seed
passio-seed dev .    # hot-reloads into Passio as you edit
passio-seed build .  # produces dist/my-seed.seed
```

See [quickstart](docs/seeds/quickstart.md) · [manifest reference](docs/seeds/manifest.md) · [runtime API](docs/seeds/api.md) · [panels](docs/seeds/panels.md).

### Selling a Seed

100% revenue is yours. Ed25519 license signatures, verified locally:

```bash
license-gen init my-seed     # generates keypair + prints public key
license-gen sign --seed my-seed --buyer buyer@example.com
# → prints a license string; email to buyer after purchase
```

Full flow: [selling-seeds](docs/seeds/selling-seeds.md).

## The autonomous retrigger loop

Tell Passio what you want done. It:

1. **Plans** sub-steps via a standard-tier model.
2. **Executes** each step via the chat agent (with all its tools + all your installed seed tools).
3. **Assesses** after each batch: "is this 100% done?"
4. **Replans** if no, with the memory of what's been done. Max 4 replans.
5. **Stops** on completion, cancellation, step cap (default 20), cost cap (default $0.50), or time.

Every step is logged (plan → step_start → step_done → assess → replan → complete/failed/cancelled). Cost tracked per-loop. The **Auto** tab shows live progress with a cancel button.

```
∞ auto-loop mode toggle in the chat panel → send message → watch it happen in Auto tab
```

## Obsidian integration (two-way)

- Set your vault path in **Settings → Vault**. Passio walks every `.md`, indexes into FTS5 + vector.
- File changes under `<vault>/passio/` flow back into Passio's `notes` table with re-embedding. Delete a note file → note row drops.
- `<vault>/Todo.md` is bidirectional: tick `[x]` in Obsidian → done in Passio; complete in Passio → rewrites the marker block.
- Daily recap at 20:00 appends to `<vault>/daily/YYYY-MM-DD.md` (template configurable — supports `YYYY/MM/DD` tokens for `Journal/YYYY/MM/DD.md`-style layouts).
- Every `note_save` the chat agent makes mirrors to `<vault>/passio/<title>.md` with frontmatter.

## Privacy

**Short version:** your data never leaves the laptop except to LLM providers you've configured with your own keys.

- SQLite + `sqlite-vec` + FTS5 on disk. SQLCipher encryption at rest is optional (set `PASSIO_DB_CIPHER_KEY` in the keychain).
- API keys in your OS keychain (`keyring`), or a `~/.config/passio/secrets.env` chmod-600 file on systems without a keyring daemon.
- Every outbound call is in [`docs/privacy.md`](docs/privacy.md) — you can list them all on one page.
- No telemetry. No crash reporting. No usage pings. The updater checks `github.com` for releases and nothing else.
- Seeds can only reach hosts listed in their manifest's `permissions.network`. A seed asking for `"network": ["*"]` is visibly flagged.
- The `trusted: true` escape hatch exists for seeds that need unrestricted host access. Requires explicit user confirmation at install time and is surfaced as a red badge in the Grove forever after.

## Architecture (30-second tour)

```
┌──────────────────────────────────────┐
│   React HUD                          │   ← listens to events, renders bubble
└─────────────────▲────────────────────┘
                  │  Tauri IPC + events
┌─────────────────┴────────────────────┐
│   Rust core (Tauri 2)                │   ← window, tray, global hotkeys,
│   • supervises the sidecar child      │     keychain, scheduler cron,
│   • relays events HUD ↔ sidecar       │     per-host policy gate
└─────────────────▲────────────────────┘
                  │  JSON-RPC 2.0 over stdin/stdout
┌─────────────────┴────────────────────┐
│   Bun sidecar (single-binary)        │   ← chat agent, tools, SQLite,
│   • Vercel AI SDK                     │     sqlite-vec, FTS5, Obsidian
│   • bridge: WS (extension) +          │     watcher, seeds runtime,
│     HTTP /rpc + /stream/chat (PWA)    │     Bun Worker sandbox per seed
└────▲─────────────▲──────────────────▲┘
     │             │                  │
   Chrome       Mobile PWA          Seed workers
   extension    (local LAN /        (each in its own
                 tailscale)          Bun Worker)
```

Full tour: [docs/architecture.md](docs/architecture.md).

## Repo layout

```
apps/
  desktop/      Tauri 2 app (Rust core in src-tauri/, React HUD in src/)
  docs/         Next.js 14 + shadcn/ui documentation site
  extension/    Chrome MV3 bridge
  mobile/       React PWA companion (chat + todos + brief over LAN)
packages/
  sidecar/      Bun-compiled single-binary sidecar (agent + tools + DB + seeds + bridge)
  shared/       Shared Zod schemas + RPC method registry
  seed-cli/     passio-seed init/build/dev + license-gen init/sign
seeds/          100 free + 24 paid reference seeds
orchard/
  index.json    Curated Orchard registry (what Discover reads)
docs/           Markdown documentation (also rendered by apps/docs)
scripts/        Build helpers (gen-seeds generator, orchard rebuilders)
```

## Development

```bash
bun install
bun run --cwd apps/desktop tauri:dev    # Tauri dev mode (hot reload)
bun run --cwd apps/docs dev             # Docs site on :3000
bun run --cwd packages/sidecar test     # Sidecar tests
cd apps/desktop/src-tauri && cargo check
```

## Tech stack

| Layer | What |
|---|---|
| Desktop shell | [Tauri 2](https://tauri.app) + WebKit2GTK |
| Rust | `tauri`, `keyring`, `tokio`, `chokidar`-lite, `tracing` |
| Sidecar | [Bun](https://bun.sh) compiled to a single 125 MB ELF (embeds its own runtime) |
| Database | SQLite via `drizzle-orm` + `sqlite-vec` + FTS5 |
| AI | [Vercel AI SDK](https://sdk.vercel.ai) (`streamText`, `generateObject`) against OpenAI (`gpt-4o-mini` / `gpt-4.1` / `gpt-5` / `o3`), Whisper, TTS |
| HUD | React 18 + Zustand + Tailwind 3 + Radix primitives |
| Docs | Next.js 14 + Tailwind + hand-written shadcn/ui components + remark |
| Mobile | Vite + React + PWA (service worker) |
| Extension | Chrome MV3 + Readability |
| Seeds | Bun Workers + manifest-declared capabilities + ed25519 licensing |

## Roadmap

- ✅ v1 (W1–W8): foundation, context engine, goals, Obsidian, browser extension, voice, proactive loop, first-run
- ✅ v2 (W9–W18): safety rails, persona, Gmail, calendar/RSS/weather, macros, research agent, automation, local Whisper, secrets vault, CI
- ✅ v2.2 (W19–W20): streaming chat, lipsync, PDF, history search, autonomous act dispatch
- ✅ **v2.3** (this commit): Seeds plugin system + 124-entry Orchard + 2-way Obsidian sync + 6-tab HUD consolidation + autostart
- 🔄 Planned:
  - Rust/WASM seeds (manifest already accepts `language: "wasm"`)
  - Orchard marketplace with hosted checkout
  - MCP server exposing Passio's memory + tools to other AI tools
  - Wake word ("hey passio") via openwakeword
  - Multi-device sync (CRDT or central; design open)

## Contributing

PRs welcome. Opening issues first for anything >100 LOC is appreciated. Seed contributions land via PR against `orchard/index.json` — see [docs/seeds/orchard.md](docs/seeds/orchard.md) for the checklist.

## License

[MIT](LICENSE). Everything in `seeds/` that isn't marked `licensed: true` is also MIT.

---

<div align="center">

Built by [@alexandergese](https://github.com/alexandergese) · crafted with 🍇 · runs on your laptop

</div>
