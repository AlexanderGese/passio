# Chrome extension

Pairs with Passio's sidecar over a local WebSocket. Lets the agent read the current tab, navigate, click, type, scroll, extract content, and take screenshots — gated by per-host policy.

## Install (unpacked)

```
cd apps/extension
bun install
bun run build       # produces dist/
```
Then in Chrome / Chromium / Brave / Vivaldi:
1. `chrome://extensions/`
2. Enable **Developer mode** (top right).
3. **Load unpacked** → pick `apps/extension/dist`.
4. Pin the extension to your toolbar.

## Pairing

1. Click the extension icon → **Options**.
2. Paste your bridge token (`cat ~/.config/passio/bridge-token`).
3. Click **Save**. The popup should show "paired · green dot" within a few seconds.

The token persists across sidecar restarts (since v2.3), so you only pair once per machine.

## What the agent can do through the extension

Gated by per-host policy (Settings → Policy):
- `get_current_tab` — title, URL, selected text
- `get_all_tabs` — list
- `navigate(url)` — in current tab
- `new_tab(url)` — new tab
- `close_tab(id)` — closes
- `click(selector)` — CSS selector
- `type(selector, text)` — fills fields
- `scroll({dx, dy})` — arbitrary scroll
- `extract(selector?)` — text + links + structured metadata via Readability
- `screenshot({area?})` — base64 PNG

Most sites default to `ask_first` — Passio shows a countdown toast before acting, which you can cancel.

## Policy levels

- **observe_only** — read-only (tab info, extract, screenshot). Writes blocked.
- **ask_first** — prompts with countdown.
- **full_auto** — no prompt (still audited to `events` table).

Set per-host in Settings → Policy.

## Blocklist

Global — overrides per-host `full_auto`. Example entries:
- `{ kind: "selector", pattern: "button[type=submit]", reason: "form submit" }`
- `{ kind: "url_contains", pattern: "checkout", reason: "payment flow" }`

## Troubleshooting

- **"unpaired" forever** → token is wrong. Re-paste from `~/.config/passio/bridge-token`.
- **WS drops repeatedly** → Chrome is likely putting the service worker to sleep. The extension has 20s heartbeats to keep it alive; if you see drops, restart the browser.
- **Actions time out** → the default tool timeout is 15s. Complex extractions may need longer; this isn't currently tunable without a build.
