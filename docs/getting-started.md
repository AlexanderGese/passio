# Getting started

## Install

**Linux (Debian/Kali/Ubuntu):**
```
sudo dpkg -i passio_2.2.0_amd64.deb
```
or run the AppImage:
```
chmod +x Passio-2.2.0.AppImage && ./Passio-2.2.0.AppImage
```

On first launch you'll see a splash while the sidecar boots (~3 seconds on a cold cache), then the first-run wizard.

## First-run wizard (6 steps)

1. **Welcome** — one-paragraph pitch; nothing to fill in.
2. **OpenAI key** — stored in your OS keychain. Falls back to `~/.config/passio/secrets.env` (chmod 600) when no keychain daemon is available.
3. **Obsidian vault path** — optional. If set, Passio indexes it, watches for changes, mirrors new notes into `<vault>/passio/`, and appends daily recaps to `<vault>/daily/YYYY-MM-DD.md`.
4. **First goal** — a long-horizon goal Passio will auto-decompose into milestones.
5. **Default pack** — work / study / chill. Cycle later with `Super+M`.
6. **Personality picker** — three cascading choices define Passio's voice:
   - **Archetype:** Coach · Companion · Operator · Scholar · Trickster
   - **Tone:** five options scoped by archetype
   - **Flavor:** five options scoped by tone
   125 possible personalities, each applying a system-prompt fragment, TTS voice, and default autonomy posture.

Click **finish** to save. You can re-run the wizard any time from Settings → "Re-run wizard."

## Skipping the wizard

Click **skip** at any step. Passio will ship without an OpenAI key — chat will error until you set one in Settings → API keys. Vault, goal, and persona are all optional.

## Enabling autonomy

Passio defaults to "active" posture — a 7-minute proactive scanner, deadline radar, initiative pulse every 15min. To switch modes live, click the posture chip in the bubble header (🌙 quiet / ☀ active / ⚡ proactive+).

## Installing Seeds (plugins)

Open the Grove tab (🌱). Three ways to install:
- Drop a `.seed` descriptor file
- Paste `owner/repo` from GitHub
- Point at a local folder (dev/sideload)

Permissions are shown on install. Enable/disable later with a toggle; uninstall removes both state and files.

See [Seeds user guide](./seeds/README.md) for details.
