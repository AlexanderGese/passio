# Troubleshooting

## First-run wizard fires every boot
Your OS keychain isn't writable (often the case on Kali / headless installs). Passio falls back to `~/.config/passio/secrets.env` but also writes a `first_run_done` marker in the DB. If the DB is missing or the sidecar can't reach it, re-check:
```
ls -la ~/.config/passio/
```
You should see `secrets.env` chmod 600. If not, run the wizard once — it'll create one. Or set the API key directly:
```
echo "PASSIO_OPENAI_API_KEY=sk-..." > ~/.config/passio/secrets.env
chmod 600 ~/.config/passio/secrets.env
```

## Sidecar EPIPE / crashes
Symptoms: chat hangs, then comes back with `⚠ broken pipe`.

Cause: the sidecar idle-killed itself during a long call. The supervisor retries on `BrokenPipe`, so the next message should work. If it doesn't, restart the app.

To debug, tail the sidecar log at `~/.cache/passio/logs/` (XDG cache).

## "HotKey already registered"
You have two Passio instances running. `ps aux | grep passio-desktop` → kill the older one.

## Extension can't pair
1. Passio must be running.
2. The extension's options page should show the WS URL (`ws://127.0.0.1:31763`).
3. Paste the token from `~/.config/passio/bridge-token` into the extension.
4. Token persists across sidecar respawns (fixed in v2.3), so you only need to do this once per install.

## Mobile PWA can't reach Passio
- Passio's bridge binds to `127.0.0.1:31763` by default — reachable only from localhost.
- Use Tailscale (or equivalent) and point the PWA at your Tailnet address: `http://100.x.y.z:31763`.
- The token is in `~/.config/passio/bridge-token`.

## Vault search returns 0 results
- Did you click "Save + index" after setting the path? Settings → Vault.
- If no `.md` files are found, check permissions (`ls` as your user).
- If `hasVec=false` in the startup log, vector search is disabled but FTS still works. Ensure `PASSIO_VEC_SO` points at the `vec0.so` if you want semantic search.

## Screen stays dimmed after distraction streak ended
The distraction dimmer sets `xrandr --brightness`. On Wayland this is a no-op; on X11 it should restore automatically after streak < 15 min. To restore manually:
```
for out in $(xrandr --listactivemonitors | tail -n +2 | awk '{print $4}'); do
  xrandr --output $out --brightness 1.0
done
```

## Seeds fail to install from GitHub
Passio tries `git clone` first, falls back to the codeload tarball. If both fail:
- Check your network (are you on a captive portal?).
- Check the `ref` exists — type the exact branch / tag / SHA.
- Check repo visibility — private repos need your GitHub auth; in v1 only public repos work via git clone, unless you have `gh` authenticated for the CLI path.

## Seed crashes silently
Open **Grove → Dev** (even for non-dev installs — logs are available for every running seed via `passio.seed.logs`). Look for stack traces from the init function.

A seed that errors during init stays installed but disabled; toggle it off + on to retry.

## "no such method" from a Seed panel
The panel called a tool via `window.passio.invoke('x')` but the seed hasn't registered `x` yet. Likely the panel mounted before the worker finished its init. Wrap the invoke in a try/catch or await a "ready" event.

## I want to uninstall Passio cleanly
```
# Stop all processes
pkill -f passio-desktop
pkill -f passio-sidecar

# Wipe data (confirm first!)
rm -rf ~/.config/passio
rm -rf ~/.local/share/passio
rm -rf ~/.cache/passio

# Remove keychain entries (if you used the keychain backend)
secret-tool clear service passio.openai
secret-tool clear service passio.mail_user
# etc.

# Uninstall the package
sudo apt remove passio-desktop  # deb
rm ./Passio-*.AppImage          # appimage
```
