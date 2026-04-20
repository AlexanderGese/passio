# Privacy model

Passio is local-first by default. This doc lists everything that leaves your machine and when.

## What stays local

- Every chat message + assistant reply — in SQLite at your XDG data dir.
- Every fact, note, todo, goal, milestone, journal entry.
- Every activity snapshot (`ps` + active-window title) — in `activity_log`.
- Every audit event (agent tool calls through the gate).
- Your Obsidian vault — only touched via the filesystem; never uploaded.
- API keys — in your OS keychain or `secrets.env` chmod 600.
- Clipboard history (if you install the clipboard-history Seed).

## What leaves your machine, when

| Network call | When | To |
|---|---|---|
| OpenAI Chat Completions | On every chat turn, scan, reflection, summarization | `api.openai.com` |
| OpenAI TTS | When `autoSpeak` is on + Passio has something to speak | `api.openai.com` |
| OpenAI Whisper | When you use voice input | `api.openai.com` |
| OpenAI embeddings | When you add / index new content | `api.openai.com` |
| OpenAI vision | When you use `Super+Shift+S` (screenshot-and-ask) | `api.openai.com` |
| GitHub codeload / git clone | When installing a Seed from a GitHub descriptor | `github.com` / `codeload.github.com` |
| Calendar ICS | On scheduler tick when you've added ICS URLs | user-provided URLs |
| RSS | On scheduler tick when you've added feeds | user-provided URLs |
| Weather | On weather refresh when you've set a location | Open-Meteo (no key required) |
| Updater | On startup via `tauri-plugin-updater` | GitHub releases (configurable) |
| Seeds' network calls | Only what a Seed declared and you approved | per-Seed allowlist |

**Nothing else.** Passio does not phone home, send telemetry, or pre-fetch metadata about you or your data.

## Disabling network features

- **Quiet mode posture** (🌙) still chats when you ask, but skips proactive scans + pulses.
- **Kill switch**: set `PASSIO_OPENAI_API_KEY=""` before launching. Passio falls back to offline-only paths (chat errors out, briefings are string-concatenated summaries instead of LLM-written).

## Seed isolation

Seeds can only reach hosts they declared in their manifest `permissions.network`. An undeclared fetch throws. See [Seeds → Permissions](./seeds/permissions.md).

The `trusted: true` opt-out exists but requires explicit user confirmation at install time and stays visually flagged (red badge).

## Deletion

- **Single-fact**: Memory tab → delete.
- **Whole conversation**: History tab → ✕.
- **Whole seed + its state**: Grove → seed → Uninstall.
- **Everything**: Settings → Privacy → Wipe all data (or delete the XDG data dir manually).

Passio will never resurrect deleted content.

## Encryption at rest

Set `PASSIO_DB_CIPHER_KEY` (Settings → API keys → "DB cipher"). Passio applies SQLCipher `PRAGMA key` on open. Note: this only protects the DB — logs and Obsidian files are plaintext.

## Audit logs

Every agent tool call that mutates browser state / files / emails / shell is logged to `events(kind='action')` with its parameters. The **Undo** surface in the Auto tab uses these to reverse actions where reversal is defined. You can inspect the raw events via the Memory tab or by querying the DB.
