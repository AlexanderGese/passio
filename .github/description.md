# GitHub repo metadata — paste into the "About" drawer

## 📝 Short description (≤350 chars — paste into the main "Description" field)

Pick one:

### Variant A — the flagship one-liner
```
🍇 Local-first desktop AI assistant shaped like a passionfruit. Floating bubble with persistent memory, autonomous retrigger loops, two-way Obsidian sync, and a plugin system called Seeds — 100 free + 24 paid. Tauri 2 + Bun sidecar + React. Zero telemetry. MIT.
```
348 chars.

### Variant B — more concise, tool-forward
```
🍇 A local-first desktop AI that remembers, plans, and acts. Floating bubble, persistent memory, autonomous loops, two-way Obsidian sync, and a 124-entry plugin marketplace (the Orchard). Runs on your laptop — your keys, your data, zero telemetry. Tauri + Bun + React, MIT.
```
270 chars.

### Variant C — hype-forward
```
🍇 The personal AI that lives on your desktop. Remembers everything you told it, runs autonomous loops until tasks are done, syncs with Obsidian, grows via Seeds (plugins). 100 free plugins + 24 paid. Local-first, zero telemetry, MIT. Built with Tauri 2 + Bun + React.
```
269 chars.

**My pick: Variant A** — leads with the sensory hook (passionfruit), lists the exact differentiators, ends with the credibility stack.

## 🌐 Website field

```
https://passio.dev
```

(If you don't own the domain yet, use `https://github.com/alexandergese/passio` as placeholder — GitHub accepts that too.)

## 🏷 Topics (paste up to 20 — GitHub only shows the first 6 above the fold, so put those first)

Priority order (first 6 are visible without clicking "show more"):

```
ai-assistant
local-first
desktop-app
plugin-system
agentic
obsidian

tauri
bun
typescript
rust
react
sqlite
privacy
personal-assistant
productivity
passionfruit
open-source
openai
shadcn
mit
```

## 🖼 Social preview (the big OpenGraph card)

GitHub auto-generates one from the README + avatar, but uploading a custom one is 10x better for click-through. Suggested:

- **1280 × 640 px** PNG
- Passionfruit sprout logo (use `apps/desktop/src-tauri/icons/icon.png` scaled up, or regenerate from `icons/sprout.svg`)
- Two-line tagline:
  ```
  Passio
  A local-first AI assistant that remembers, plans, and acts.
  ```
- Dark background (`#120E1A`) with the pink/purple gradient
- Small "MIT · local-first · zero telemetry" footer chip

Until you make one, GitHub's default is fine.

## 🚀 Release tagline (for the v2.3 GitHub Release page)

Title:
```
v2.3 — Seeds plugin system, 124-entry Orchard, full docs site
```

Body:
```
Passio v2.3 turns the desktop agent into an extensible platform.

Highlights:
- 🌱 Seeds plugin system with sandboxed Bun Workers + manifest-declared capabilities
- 🛒 Orchard registry: 100 free seeds + 24 paid seeds (ed25519-signed licenses, verified locally)
- ∞ Autonomous retrigger loops: plan → execute → assess → replan until done (safety-capped)
- 📚 Two-way Obsidian sync (notes AND todos)
- 🎭 125-leaf personality picker + free-form prompt override
- 📱 PWA companion over Tailscale/LAN with SSE streaming
- 🖱 Click-through fixed + 6-tab HUD consolidation (down from 14)
- 🧩 Header chip reorder/show-hide
- 💰 Cost dashboard with budget alerts
- 📖 Full docs site (apps/docs, Next.js + shadcn) auto-published to passio.dev

Install: sudo dpkg -i Passio_2.2.0_amd64.deb  →  autostart wired on next login.

Zero telemetry. Your keys. Your data. Your laptop.
```

## 💡 Pinning suggestion

Pin these on your GitHub profile:
1. `passio` (this repo)
2. Any seed repo you publish as a showcase (e.g. `passio-seed-spotify`)
3. One of the deeply-used dev seeds (e.g. `passio-seed-github`)

## 📣 Launch copy (for HN / ProductHunt / X threads)

**HN title:**
```
Passio – A local-first desktop AI with autonomous loops and a plugin system
```

**ProductHunt tagline (60 chars):**
```
The personal AI that runs on your laptop, not OpenAI's cloud.
```

**X thread opener:**
```
shipped 🍇 Passio v2.3

a local-first desktop AI that lives in your corner —
• remembers everything via sqlite+vec+fts5
• runs autonomous loops until done
• syncs two-way with obsidian
• grows via 124 plugins (Seeds)
• zero telemetry. your keys. your data.

github.com/alexandergese/passio
```
