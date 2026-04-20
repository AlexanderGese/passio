# Manifest reference (`seed.json`)

Every seed's root must contain a `seed.json`. Validation is strict — unknown fields fail install.

```json
{
  "$schema": "passio-seed@1",
  "name": "my-seed",
  "version": "0.1.0",
  "description": "One-sentence pitch.",
  "author": "@you",
  "homepage": "https://...",
  "entry": "./index.js",
  "language": "js",
  "permissions": {
    "network": ["api.example.com"],
    "secrets": ["api_token"],
    "trusted": false,
    "shell": false
  },
  "contributes": {
    "tools": ["my_tool"],
    "tabs":    [{ "id": "my-panel", "title": "My seed", "icon": "🌱", "panel": "./panel.js" }],
    "widgets": [{ "id": "my-widget", "slot": "header", "panel": "./widget.js" }],
    "hotkeys": [{ "id": "open", "default": "Super+Shift+M", "label": "Open my seed" }],
    "scheduler": [{ "id": "refresh", "every_seconds": 900 }],
    "events": ["chat", "activity"]
  },
  "minHost": "2.2.0"
}
```

## Top-level fields

| Field | Required | Notes |
|---|---|---|
| `$schema` | no | `"passio-seed@1"` — validates via zod |
| `name` | yes | lowercase kebab-case, 2–48 chars |
| `version` | yes | semver (`1.2.3` or `1.2.3-alpha`) |
| `description` | yes | ≤280 chars |
| `author` | no | free text |
| `homepage` | no | URL |
| `entry` | no | defaults to `"./index.js"` |
| `language` | no | `"js" \| "ts" \| "wasm"` — v1 effectively uses JS after compile |
| `permissions` | no | see below |
| `contributes` | no | see below |
| `minHost` | no | bail if Passio is older than this |

## `permissions`

| Field | Type | Meaning |
|---|---|---|
| `network` | `string[]` | Hostnames the seed may reach. Suffix match (`".example.com"` allows all subdomains). |
| `secrets` | `string[]` | Names of secrets the seed may read/write. Stored under `seed:<name>:<key>` in the Passio vault. |
| `trusted` | `boolean` | Unsandboxes the seed — full host access. **User confirmation required on install.** |
| `shell` | `boolean` | Reserved. Not implemented in v1. |

Only declared capabilities work at runtime. An undeclared network fetch throws; an undeclared secret read throws.

## `contributes`

| Field | Shape | Notes |
|---|---|---|
| `tools` | `string[]` | Names of tools the seed registers. These are available to the chat agent. |
| `tabs` | `{id,title,icon?,panel}[]` | A tab in the bubble. `id` must match the Web Component's `customElements.define(id)`. `panel` is a relative path to a JS file. |
| `widgets` | `{id,slot,panel}[]` | Small components in the header strip or corner. Same rules as tabs. |
| `hotkeys` | `{id,default,label?}[]` | Global shortcut — user can rebind. `default` is an accelerator string. |
| `scheduler` | `{id,every_seconds}[]` | Intervals. Fires `scheduler:<id>` inside the worker. |
| `events` | `("chat"\|"scan"\|"activity"\|"bubble_state"\|"hotkey")[]` | Host events the seed wants to listen to. Subscribes via `passio.on(event, fn)`. |

Fields are additive — declare only what you need. The Grove tab shows exactly what your seed declares as its "contract."
