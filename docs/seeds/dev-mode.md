# Dev mode + live reload

```
passio-seed dev ./my-seed
```

What happens:
1. The CLI reads your bridge token from `~/.config/passio/bridge-token`.
2. It calls `passio.seed.devStart` over HTTP with the folder path.
3. Passio installs the folder into `~/.config/passio/seeds/<name>/` (overwriting any existing install of the same name).
4. The seed's worker starts.
5. A file watcher attaches to the folder. Every change:
   - Re-copies the folder into the installed location
   - Restarts the worker
   - Emits `dev_reloaded` to the Grove → Dev log

Debounce is 200ms — rapid saves roll up into one reload.

Stop with `passio-seed dev stop` or `Grove → Dev → Stop`.

## Dev panel

Open **Grove → Dev**. It shows:
- The folder being watched
- Live log stream from the seed (`passio.log/warn/error` calls)
- Stop button

## Typical loop

1. `passio-seed init my-seed` then `cd my-seed`
2. `passio-seed dev .` in one terminal
3. Edit `index.js` or `panel.js`. Save → reloads in ~300ms.
4. If it broke: read the log in Dev (top-level errors are caught and surfaced).
5. When ready: `passio-seed build .` → produces `dist/<name>.seed`.

## Caveats

- **Only one seed can be in dev mode at a time.** Starting a second `dev` call stops the first.
- **Worker restart keeps the KV store.** But if you remove a KV entry in code, the existing value stays — clear manually via `passio.kv.del(key)`.
- **Hotkey changes need a manifest update + disable/enable.** The runtime only reads `contributes` at start.
- **Panels hot-reload on save** because the iframe's `blob:` URL is regenerated per `connectedCallback` cycle. If it doesn't reload, close + reopen the tab.
