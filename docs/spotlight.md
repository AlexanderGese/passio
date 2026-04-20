# Spotlight

Apple-style app launcher and universal search. Open with **`Super+Shift+A`** (`Win+Shift+A`).

Starts as a compact search bar — 760×76, dead-centered on the primary monitor — and grows downward as results stream in. `Esc` closes it and restores whatever the bubble was doing before.

## What it searches

| Source | Notes |
|---|---|
| **Installed apps** | Linux `.desktop` files from `/usr/share/applications`, `/usr/local/share/applications`, `~/.local/share/applications`, flatpak and snap export dirs. Real app icons resolved from the XDG icon theme (hicolor, Adwaita, breeze, Papirus, …) and inlined as data URLs. |
| **Todos** | `passio.todo.*` |
| **Notes** | Passio notes + Obsidian vault notes |
| **Goals & milestones** | |
| **Facts (memory)** | What Passio remembers about you |
| **Past chat turns** | Jumps back to the conversation |
| **Indexed files** | Files Passio has seen (vault + import) |

## Prefixes

| Prefix | What it does |
|---|---|
| `?<question>` | Single "Ask Passio" row. Enter → opens chat with the question pre-filled and streams the answer. |
| `:<name>` | Emoji picker. `:fire`, `:rocket`, `:tada`. Enter → pastes the emoji into the focused app. |
| `v:` or `v:<filter>` | Clipboard history. Shows the last 20 unique items the system clipboard has held; Enter → pastes (writes to clipboard + synthesizes `Ctrl+V`). |
| `@app <q>` | Only apps. |
| `@note <q>` | Only notes. |
| `@todo <q>` | Only todos. |
| `@goal <q>` | Only goals. |
| `@vault <q>` | Only Obsidian vault notes. |
| `@file <q>` | Only indexed files. |
| `@fact <q>` | Only memory facts. |
| `@conv <q>` | Only past conversations. |

The scope chip appears to the left of the input so you can see what you're filtering.

## System actions

Type the name — they surface inline:

- `lock` → `xdg-screensaver lock`
- `suspend` / `sleep` → `systemctl suspend`
- `brightness up` → `brightnessctl s +10%`
- `brightness down` → `brightnessctl s 10%-`

Conservative set by design. No one-keystroke shutdown/logout.

## Create-from-query

Every non-scope query always shows three action rows at the bottom so an "empty" search is never dead:

- **`➕ Add todo: <query>`** — appends to `passio.todo` with default priority.
- **`📝 Save note: <query>`** — saves the query as a note body.
- **`💬 Ask Passio: <query>`** — hands it to chat with prefill.

## Clipboard history

A background thread in the Tauri Rust side polls the X11 `CLIPBOARD` selection every 900 ms via `xclip`, dedupes, keeps the last 20 entries in memory.

- **Never persisted.** The clipboard often holds secrets; a file on disk is a footgun. Restart clears the ring.
- **Max entry size:** 8192 bytes. Bigger captures are ignored.
- **Paste mechanism:** Enter on a clipboard row writes to clipboard via `xclip`, waits 180 ms for the target app to regain focus, then injects `Ctrl+V` via `xdotool`.

## Dependencies

Everything below ships on Kali/Ubuntu/Debian by default; install if missing:

- `xclip` — clipboard read/write (Spotlight clipboard history + emoji paste)
- `xdotool` — synthetic `Ctrl+V` for the paste helper
- `brightnessctl` — brightness system actions

```bash
sudo apt install xclip xdotool brightnessctl
```

Wayland: the poller and paste helper are X11-only for now. Missing tools fail silently; the rest of Spotlight still works.

## Rebind

The default hotkey is `Super+Shift+A` — chosen to sit next to `Super+Shift+Space` (the Copilot-key bubble toggle). Change it in **Settings → Keybinds**: click the `spotlight` row, press the new combo, save, restart Passio.

## Extending

Two clean extension points (both backend-side):

- **More system actions** — edit `SYSTEM_ACTIONS` in `apps/desktop/src/components/spotlight_sources.ts` and add the matching arm in `run_system_action` in `apps/desktop/src-tauri/src/commands.rs`.
- **More search sources** — add a source block to `packages/sidecar/src/tools/spotlight.ts`. The hit shape supports `exec` (spawn), `path` (open in OS handler), `iconUrl` (inline image) — plus `ask`/`clipboard`/`emoji`/`system` synthetic kinds handled client-side in `Spotlight.tsx`.

Seed-contributed Spotlight commands aren't wired yet (that's the natural next step for this feature).
