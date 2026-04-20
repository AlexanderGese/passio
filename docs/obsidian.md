# Obsidian integration

Passio treats your vault as a peer storage — notes you create via Passio land there, the daily recap appends to your daily note, the agent can search/read/write, and spotlight + memory searches include vault content.

## Setup

Settings → Vault (📚):
1. Paste the absolute path to your vault (e.g. `/home/you/Documents/MyVault`).
2. Click **Save + index**. Passio walks every `.md` file, parses frontmatter + wiki-links + tags, and persists to `vault_notes` + a FTS5 mirror.
3. A file watcher starts — edits in Obsidian / Notion / any editor show up in Passio within a few seconds.

Unlink any time. The index is preserved until you reindex against a different root.

## Write boundaries

Passio writes **only** inside `<vault>/passio/` by default. Writing outside that subfolder requires `allow_outside_passio_subfolder: true` — the chat agent has to explicitly ask, and the user has to confirm. Daily-note recaps are an allowed exception (they go under `<vault>/daily/YYYY-MM-DD.md`).

## What Passio auto-writes

- **Notes saved via the agent** (`note_save` tool): mirrored to `<vault>/passio/<title>.md` with frontmatter: `created`, `tags` (if any). The DB row stores the vault path.
- **Daily recap at 20:00**: appended under `## Passio recap` heading in `<vault>/daily/<today>.md`. Creates the file if missing.
- **Todo.md sync**: two-way sync with `<vault>/Main/Todo.md` (configurable path) using `<!-- passio:todos:start --> ... <!-- passio:todos:end -->` markers.

## What Passio reads

- Every `.md` file in the vault at index time.
- On-demand during chat (`vault_search`, `vault_read_note`) — the agent prefers the vault over internal memory for user-authored content.
- Spotlight (Super+/) includes vault hits alongside todos, facts, goals, notes, conversations, files.

## Agent tools

The chat agent has these tools available when a vault is configured:
- `vault_search(query, limit?)` — FTS + wiki-link-aware
- `vault_read_note(path)` — path is vault-relative
- `vault_write_note(path, body, frontmatter?, allow_outside_passio_subfolder?)` — path is vault-relative
- `vault_list_tags` — surfaces frontmatter + inline `#tags`

These are listed in the system prompt, so the agent will naturally reach for them when you ask about your notes.

## Daily note conventions

The daily recap machinery expects the structure `<vault>/daily/YYYY-MM-DD.md`. If your vault uses a different scheme (e.g. `Journal/2026/Apr/19.md`), we'll add per-path templating in a future release. For now, create a symlink or disable the recap feature (Settings → Automation).

## Troubleshooting

- **Vault not indexing:** check permissions — the sidecar runs as your user and needs read access.
- **Daily recap not appearing:** verify `<vault>/daily/` exists; Passio will create it on first write.
- **Two-way Todo.md conflict:** Passio last-write-wins within a 15-second window. If the markdown file is edited while the sidecar is writing, the DB may briefly diverge — both sides converge on the next sync tick.
