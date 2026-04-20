# Permissions model

Every Seed ships with a `permissions` block in its manifest. Passio enforces it at every API call — a seed can't do anything it didn't declare.

## On install

When a user installs a seed, they see exactly what it asks for:

```
Install "hn-pulse"?
  ✓ network → hacker-news.firebaseio.com
  [Install]   [Cancel]
```

A seed that asks for:
- network to any host
- secrets to any name
- `trusted: true` (unsandboxed)
- `shell: true` (reserved)

is shown with that permission listed. Nothing is implicit.

## Runtime enforcement

Every privileged call goes through postMessage → host. The host validates the seed's declared permissions before executing. Concretely:

### Network
`passio.net.fetch(url)` → host parses the URL, gets the hostname, and checks it against `permissions.network`. Suffix match on a declared host includes subdomains:
- `"example.com"` allows `example.com` and `sub.example.com`.
- `"api.example.com"` only allows that one host.

Undeclared host → throws with a clear message.

### Secrets
`passio.secrets.get(name)` / `.set(name, value)` → host validates `name` is in `permissions.secrets`. Storage is namespaced (`seed:<seed>:<name>`), so two seeds can both declare `api_token` without colliding.

### Trusted
`permissions.trusted: true` flags the seed as "runs unsandboxed." In v1 it doesn't change the execution model (seeds already run in-process via Bun Worker), but it:
- Requires explicit user confirmation at install time
- Shows a red badge in the Grove tab forever
- In a future release, may unlock raw `node:*` imports inside the worker

Leave it off unless you know you need it.

### Shell
Reserved for v1.1. Will allow the seed to register commands for Passio's shell allowlist. Not wired yet.

## What Seeds can do without any permissions

- Register tools (`tools.register`)
- Register hotkeys (`hotkeys.register`)
- Read/write their own KV (`kv.*`)
- Schedule timers (`schedule`)
- Subscribe to declared events (`on`)
- Surface a speech bubble (`bubble.speak`)
- Log to the dev console (`log`/`warn`/`error`)
- Add todos / notes (shared with the rest of Passio)

These are considered safe because they only operate within Passio's own data / UI — no reach outside the app.

## Revoking permissions

Uninstall the seed (Grove → seed → Uninstall). This:
- Stops its worker
- Removes the folder at `~/.config/passio/seeds/<name>/`
- Deletes the `seeds` row + its settings blob
- Leaves seed-scoped secrets in the vault (so you can reinstall without losing them). To also wipe secrets, delete them via Settings → API keys.

You can't grant permissions *after* install — reinstall the seed with the new permissions in its manifest. (Enforced to keep the permission list an atomic, visible contract.)
