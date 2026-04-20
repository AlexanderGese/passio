# Hotkeys

All global shortcuts. Rebind from **Settings → Keybinds** (click a row, press the combo, save, restart).

| Default | Action |
|---|---|
| `Super+Shift+Space` | Toggle the bubble — the "Copilot key" combo (expand/collapse the HUD panel) |
| `Super+Space` | Open the Chat tab + focus the input |
| `Super+Shift+A` | **Spotlight** — Apple-style app launcher + universal search (apps, files, notes, todos, clipboard, emoji, system actions). [Details →](./spotlight.md) |
| `Super+Alt+Space` | Push-to-talk (voice) |
| `Super+Shift+N` | Force a proactive scan |
| `Super+Shift+R` | Rewrite the current text selection (via the agent) |
| `Super+Shift+L` | Translate the current text selection |
| `Super+Shift+S` | Screenshot-and-ask (region select → vision query) |
| `Super+Shift+W` | "What should I do next?" — one-tap top-leverage-task picker |
| `Super+Shift+C` | Clipboard-ask — pops a floating chip with the clipboard text + Ask button |

Seeds can also declare their own hotkeys in `contributes.hotkeys`. They show up in Settings → Keybinds alongside the built-ins.

## Known conflicts

- **XFCE/Ubuntu** bind `Super+Space` to a run-dialog by default. Passio warns at startup if it detects a conflict via `xfconf-query`.
- **KDE** sometimes binds `Super+Space` for app launcher. Rebind in KDE settings or in Passio's Keybinds panel.
- **Windows 11** sends the Copilot key as `Win+Shift+F23` on some keyboards rather than `Win+Shift+Space`; rebind `toggle-bubble` if yours does.

If a hotkey appears registered but doesn't fire, restart Passio; some desktops only release shortcut handlers after the previous owner exits fully.
