<div align="center">

<img src="apps/desktop/src-tauri/icons/icon.png" width="128" alt="Passio" />

# Passio

**Lean, local-first desktop AI — chat, todos, app launcher.**

[![License: MIT](https://img.shields.io/badge/license-MIT-a855f7.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/linux-Kali%20·%20Debian%20·%20Ubuntu-ff6b9d)](https://github.com/alexandergese/passio/releases)
[![Made with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB)](https://tauri.app)

</div>

---

## What's in the box

A floating bubble in the corner of your screen with three things:

| | What |
|---|---|
| **Chat** | Multi-turn conversation with persistent memory + facts. Streams. Your OpenAI key, your budget, no telemetry. |
| **Do** | Todos. The LLM can add/complete them via tool calls; you can edit them in the panel. |
| **Spotlight** (`Win+Shift+A`) | Apple-style launcher: apps (real icons), files, notes, todos, clipboard history (`v:`), emoji (`:`), system actions (`lock`, `suspend`, `brightness up/down`), `?` ask Passio, `@scope` filters. Compact bar that grows downward as results arrive. |

That's the whole product. No proactive scans, no nudges, no plugin system, no voice/vision, no Obsidian sync, no goals/auto-loop UI — explicitly stripped to just the three things you'd actually use every day.

## Hotkeys

| Default | Action |
|---|---|
| `Win+Shift+Space` | Toggle the bubble (Copilot key combo) |
| `Win+Space` | Focus the chat input |
| `Win+Shift+A` | Open Spotlight |

Rebind from **Settings → Keybinds** (click row, press combo, save, restart).

## Install

```bash
sudo dpkg -i Passio_*.deb
```

`.deb` ships from `git push --tags vX.Y.Z` via [`.github/workflows/release.yml`](.github/workflows/release.yml).

**Runtime deps** (standard on Kali / Ubuntu / Debian — install if missing):
```bash
sudo apt install xclip xdotool brightnessctl
```

Used by Spotlight: `xclip` (clipboard read/write), `xdotool` (paste synthesis), `brightnessctl` (brightness actions).

**Configure** the OpenAI key in **Settings → API keys** — stored in your OS keyring, never on disk.

## Architecture (30-second tour)

```
┌──────────────────────────────────────────────────────────────┐
│  HUD (React 18 + Tailwind, transparent Tauri window)         │
│    ↕ Tauri invoke (chat, persona, keybinds, spotlight, …)    │
│  Rust core (Tauri 2: tray, hotkeys, window sizing,           │
│              clipboard poller, app-launch helper)            │
│    ↕ JSON-RPC 2.0 over stdin/stdout                          │
│  Bun sidecar — single 130 MB compiled ELF                    │
│    • OpenAI via Vercel AI SDK (streamText + tool calls)      │
│    • SQLite + sqlite-vec + FTS5 (memory, todos, chat)        │
│    • Hybrid retrieval (RRF over FTS + vector KNN)            │
└──────────────────────────────────────────────────────────────┘
```

Sidecar boot is on-demand and idle-times-out after 90 s of inactivity. State (chat history, todos, facts, keybinds) lives in `~/.local/share/passio/db.sqlite`. The OpenAI key lives in the OS keyring (`keyring` Rust crate) — never written to a file.

## Repo layout

```
apps/
  desktop/             # Tauri app (Rust + React HUD)
    src-tauri/         # Rust core
    src/               # React HUD
packages/
  sidecar/             # Bun-compiled JSON-RPC sidecar (chat + tools)
  shared/              # Zod schemas + protocol method names
docs/
  hotkeys.md
  spotlight.md
scripts/
  push.sh              # `bun run push` — rebuild + commit + push + relaunch
```

## Development

```bash
bun install
bun run --cwd apps/desktop tauri:dev    # Tauri dev mode (hot reload)
cd apps/desktop/src-tauri && cargo check
```

### Ship a build

`scripts/push.sh` is the one-liner: rebuild → commit (if dirty) → push → relaunch.

```bash
bun run push                            # rebuild + commit (if dirty) + push + relaunch
bun run push "fix: chat padding"        # explicit commit message
bun run release v3.0.0                  # also bumps versions, tags, pushes tag,
                                        # which fires the release.yml workflow
                                        # → builds the Linux .deb and attaches it
                                        # to the GitHub Release
bun run push --skip-build               # just commit + push, no rebuild
bun run push --dry-run                  # print every step without doing anything
```

## Tech stack

| Layer | What |
|---|---|
| Desktop shell | [Tauri 2](https://tauri.app) + WebKit2GTK |
| Rust | `tauri`, `keyring`, `tokio`, `tracing` |
| Sidecar | [Bun](https://bun.sh) compiled to a single ~130 MB ELF |
| Database | SQLite + `drizzle-orm` + `sqlite-vec` + FTS5 |
| AI | [Vercel AI SDK](https://sdk.vercel.ai) (`streamText`) against OpenAI |
| HUD | React 18 + Zustand + Tailwind 3 |

## License

MIT — see [LICENSE](LICENSE).
