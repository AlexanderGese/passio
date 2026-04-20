# Hotkeys

All global shortcuts. Rebind from **Settings → Keybinds**.

| Default | Action |
|---|---|
| `Super+B` | Toggle the bubble (expand/collapse the panel) |
| `Super+Space` | Open the Chat tab + focus the input |
| `Super+Alt+Space` | Push-to-talk (voice) |
| `Super+Shift+N` | Force a proactive scan |
| `Super+Shift+R` | Rewrite the current text selection (via the agent) |
| `Super+Shift+L` | Translate the current text selection |
| `Super+/` | Global spotlight (search todos, facts, notes, goals, conversations, files, vault) |
| `Super+Shift+S` | Screenshot-and-ask (region select → vision query) |
| `Super+Shift+W` | "What should I do next?" — one-tap top-leverage-task picker |
| `Super+Shift+C` | Clipboard-ask — pops a floating chip with the clipboard text + Ask button |

Seeds can also declare their own hotkeys in `contributes.hotkeys`. They show up in Settings → Keybinds alongside the built-ins.

## Known conflicts

- **Xfce** binds `Super+Space` to run-dialog by default. Passio warns at startup if it detects an Xfce conflict via `xfconf-query`.
- **KDE** sometimes binds `Super+Space` for app launcher. Rebind in KDE settings or in Passio's Keybinds panel.

If a hotkey appears registered but doesn't fire, restart Passio; some desktops only release shortcut handlers after the previous owner exits fully.
