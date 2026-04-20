# User guide — every tab

The bubble has these tabs (click the avatar to expand):

## Chat 💬
Free-form chat with Passio. Streams assistant tokens live. Voice in (🎙) + voice out (with lipsync). Goal-scoped mode shows a "Focused on goal" banner — useful when you want to stay tight on one project.

The **∞ Auto mode** toggle next to Send turns your next message into an autonomous loop (see [Auto-loop guide](./auto-loop.md)).

## Todos ✓
First-class todo manager. Add / priority 0–3 / due date / complete / delete. Syncs both ways with `<vault>/Todo.md` when configured (see [Obsidian guide](./obsidian.md)).

## Goals 🎯
Long-horizon goals. Auto-decomposes into milestones via the power-tier model on creation. Per-goal chat (scoped), per-goal conversations list, "Split to todos" on any milestone.

## Auto ∞
Lists every autonomous loop. Live step-by-step log (plan → execute → assess → replan → done), cost tracking, cancel button. See [Auto-loop guide](./auto-loop.md).

## Memory 📝
Unified browser over facts, notes, and knowledge-graph entities. Search, inline edit, inline delete. This is your "what does Passio think it knows?" surface.

## Vault 📚
Obsidian vault panel — search, read, edit, create notes. New notes default to `passio/`; existing notes can be edited anywhere in the vault.

## Grove 🌱
Installed Seeds (plugins). Enable / disable / inspect permissions / uninstall / dev mode. Three install paths: `.seed` file, GitHub URL, local folder. See [Seeds guide](./seeds/README.md).

## History 🕘
Full-text search across all past conversations. Jump into any past thread.

## Activity 📊
Ambient system tracker — current app, top 5 processes, today/last-hour work/distraction breakdown. Amber warning when distraction streak > 15min.

## Browser 🌐
Extension bridge status, current tab info, page summarizer. Requires the Chrome extension paired (see [Extension guide](./extension.md)).

## Focus ⏱
Focus sessions — start a 25-min block, status shows in a corner HUD (Ironman-style) with time remaining, active app, CPU ring. Auto-enables DND, logs to activity.

## Reflect 🌙
Nightly reflection proposals. Every night at 22:00 Passio reviews today's events and proposes fact add / update / forget. Approve in bulk in the morning.

## Cost 💰
Today / this week / this month spend by tier (economy / standard / power / reasoning / TTS / Whisper / embedding). Token counts straight from the SDK response.

## Errors ⚠
Recent sidecar warnings and errors (ring buffer of 50). Red chip appears in the header when there's activity within the last 10 min.

## Settings ⚙
- **Persona** — name, pronouns, TTS voice
- **Keybinds** — rebind any global shortcut
- **API keys** — OpenAI, Anthropic, secrets vault
- **Mail** — IMAP/SMTP credentials for Mail pill + agent email tool
- **Calendar** — ICS URLs for upcoming events
- **RSS** — feed list for latest items
- **Weather** — location for the header weather ring
- **Vault** — Obsidian vault path, reindex, unlink
- **Todo.md** — sync path
- **Policy** — per-host browser policy, countdown seconds, blocklist
- **Automation** — scannerAlwaysGate (always prompt before autonomous actions)
- **Privacy** — local data controls

## Header widgets

Left: assistant name + Passio brand.
Right strip: weather ring · calendar ticker · unread mail pill · pomodoro ring · what-next button (⟲) · spotlight (🔍) · speak toggle (🔊/🔇) · posture chip (🌙/☀/⚡).
Status row: current activity · error chip (if any recent errors) · sidecar pulse dot + ping time.

Tab bar sits below; all tabs are always visible.

## Mini widget

When the bubble is collapsed, a small pill above the avatar shows the clock + top todo. Pomodoro status (🍅) appears when a timer is running.

## Corner HUD

Only visible during a focus session. Top-left overlay with countdown, active app, and a CPU ring.
