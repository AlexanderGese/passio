# Seeds — Passio's plugin system

A **Seed** is a small program that extends Passio. Seeds can:

- register chat tools the agent can call
- add tabs + widgets to the bubble
- register global hotkeys
- schedule background loops
- react to events (chat, scan, activity, bubble_state, hotkey)
- read/write their own KV state
- make network calls to explicitly-declared hosts
- read/write their own secrets (stored in Passio's vault)
- speak to the user via speech bubbles

Seeds live under `~/.config/passio/seeds/<name>/` once installed. Each one has a manifest (`seed.json`) + an entry file (JS by default).

## User-facing guides
- [Installing a Seed](./install.md)
- [Permissions model](./permissions.md)

## Developer guides
- [Quickstart — build your first Seed](./quickstart.md)
- [Seed manifest reference](./manifest.md)
- [Seed runtime API (`passio`)](./api.md)
- [Panels & widgets (Web Components)](./panels.md)
- [Dev mode + live reload](./dev-mode.md)
- [Publishing a .seed descriptor](./publishing.md)

## File format

A `.seed` file is a JSON descriptor — *not* the code itself. It points to where the code lives (a GitHub repo, a tarball URL, or a local path). When you double-click a `.seed`, Passio:

1. Parses the descriptor
2. Shows a permission prompt with what the seed will get to do
3. On accept, clones/downloads the source into `~/.config/passio/seeds/<name>/`
4. Validates the manifest inside
5. Registers + enables it

Example `.seed`:
```json
{
  "$schema": "passio-seed@1",
  "name": "hn-pulse",
  "version": "0.1.0",
  "description": "Hacker News top 5 in a tab",
  "source": {
    "type": "github",
    "repo": "you/passio-seed-hn",
    "ref": "v0.1.0"
  },
  "sha256": "optional-integrity-pin"
}
```

Because the descriptor is tiny, you can email it, share it as a gist, or commit pointers to it elsewhere — the actual code lives where you maintain it.

## Example Seeds shipped with Passio

See `seeds/` in the repo:
- **hello-seed** — minimal echo tool + panel (the "Hello World" of Seeds)
- **hn-pulse** — Hacker News top-5 with scheduler refresh
- **clipboard-history** — 20-entry history with pinning

## Security posture

Seeds run in a Bun `Worker` with no direct access to the host process. All privileged APIs (network, secrets, bubble, todos, notes) go through a postMessage RPC that the host validates against the seed's declared `permissions`. A buggy or malicious seed's worst case is what it declared — if it didn't declare `network: ["api.foo.com"]`, it can't reach `api.foo.com`.

The `permissions.trusted: true` escape hatch exists for seeds that need low-level host access, but it requires explicit user consent at install time and is surfaced as a red badge in the Grove tab forever after.
