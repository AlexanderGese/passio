# Mobile PWA

A lightweight React PWA that talks to your desktop sidecar's HTTP `/rpc` endpoint. Chat, todos, and today's briefing on your phone — everything else is still best at the desktop.

## Setup

1. **Expose the sidecar over LAN/Tailscale.**
   The bridge listens on `127.0.0.1:31763`. To reach it from your phone, either:
   - Use Tailscale → your laptop's tailnet IP (e.g. `100.64.0.1:31763`).
   - Use a LAN bridge — `PASSIO_BRIDGE_BIND=0.0.0.0` (planned, currently loopback-only for safety).

2. **Get your token.**
   `cat ~/.config/passio/bridge-token` on the laptop.

3. **Serve the PWA.**
   From the repo root:
   ```
   cd apps/mobile
   bun install
   bun run dev    # development
   # or
   bun run build  # production bundle in dist/
   ```
   Open on your phone, install to home screen.

4. **First-run config.**
   Paste your base URL + token. They're saved to `localStorage`.

## What it can do

- **Chat** — one-shot chat (no streaming). Runs the full agent (tools, memory, goals).
- **Todos** — list / add / complete. Shares the same data as the desktop.
- **Brief** — pull today's morning briefing (weather + calendar + top todos + RSS highlights).

## What it can't do (yet)

- Voice input / TTS
- Browser automation (no extension pairing over HTTP yet)
- Push notifications (planned — will piggyback on the Passio bubble state events)
- Any Seed UIs (Web Components loading requires a different build)

## Security

Auth is the same token used by the desktop extension bridge. Treat it like a password — anyone with it + network reach can drive your Passio. Regenerate by deleting `~/.config/passio/bridge-token` and restarting Passio.
