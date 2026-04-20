# Settings reference

Open the bubble → **Settings** (⚙). Each section below maps to a tab.

## Persona 🍇
- **Name** — what the assistant calls itself on screen and in TTS.
- **Pronouns** — used in self-reference in system prompts.
- **Voice** — OpenAI TTS voice (alloy / echo / fable / nova / onyx / shimmer).

The personality picker (first-run wizard, step 6) also writes to this section — it sets `voice` from your tree path plus a `persona_prompt_extra` system-prompt fragment that the chat agent injects.

## Keybinds ⌨
Every global shortcut in [Hotkeys](./hotkeys.md) is rebindable here. Seeds' declared hotkeys appear alongside the built-ins.

## API keys 🔑
- **OpenAI** — stored in your OS keychain, or in `~/.config/passio/secrets.env` (chmod 600) if no keychain is available.
- **Anthropic** — reserved for future Claude support.
- **Mail credentials** (user + pass) — used by the Mail section.
- **DB cipher** — optional SQLCipher key to encrypt the DB at rest.
- **Vercel sandbox token** — for the research / sandbox tools.

## Mail ✉
Configure IMAP + SMTP to enable:
- The unread-mail pill in the header
- The chat agent's `mail.inbox`, `mail.send`, `mail.search` tools
- Morning briefing to mention unread count

## Calendar 📅
Add ICS URLs (Google/Apple calendar export, Fastmail, etc). Passio fetches upcoming events for:
- The calendar-ticker widget
- The chat agent's `calendar.upcoming` tool
- Morning briefing

## RSS 📡
Feed URLs for the chat agent and the morning briefing.

## Weather ☀
A latitude/longitude + display name. Powers the weather ring in the header + the morning briefing.

## Vault 📚
Obsidian vault root. When set:
- Index all `.md` files + watch for changes
- Mirror `note_save` to `<vault>/passio/<title>.md`
- Append daily recap to `<vault>/daily/YYYY-MM-DD.md`
- Include vault hits in spotlight

## Todo.md ✅
Path to a markdown file for two-way todo sync. Default `<vault>/Main/Todo.md` if a vault is set, otherwise `~/.vault/Main/Todo.md`.

## Policy 🛡
Safety rails for browser automation:
- **Per-host policy** — `observe_only` / `ask_first` / `full_auto` per hostname.
- **Blocklist** — selectors or URL substrings to never touch.
- **Countdown** — seconds the user has to cancel a proposed autonomous action.

## Automation ⚡
- **`scannerAlwaysGate`** — when on, scanner-proposed actions always route through the gate even if the host is set to `full_auto`.

## Privacy 🔒
- **Zero-telemetry confirmation** — Passio makes no network calls by default beyond API providers you've configured.
- **Data location** — shows exact paths for DB / logs / secrets.
- **Wipe** — clears all data (requires re-setup).

## Grove settings (per-seed)

Each installed seed exposes its own settings in **Grove → seed → Settings** when it declares a settings schema. These persist per-seed and are passed to the seed on startup.

## Reset

**Re-run wizard** at the top of Settings' left rail re-opens the first-run wizard without wiping existing data. Useful if you want to re-pick your personality or add a vault after the fact.
