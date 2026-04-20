# Installing a Seed

Three ways, all from **Grove** (🌱) → **Install**:

## 1. `.seed` file
Paste the JSON of a `.seed` descriptor, or drop a `.seed` file onto the textarea. Passio will:
- Fetch the source (GitHub clone or tarball)
- Optionally verify the folder's `sha256` if the descriptor pins it
- Validate the manifest
- Install into `~/.config/passio/seeds/<name>/`
- Show the permission prompt
- Enable the seed

## 2. GitHub URL
Enter `owner/repo` and an optional `ref` (branch, tag, or commit SHA). Passio clones + validates.

## 3. Local folder (sideload)
Absolute path to any folder containing a valid `seed.json`. Useful for sideloading during development before you've published a `.seed` descriptor.

## Double-click a `.seed` file

Passio registers the `.seed` extension (MIME `application/x-passio-seed`) at install time. Double-clicking one in your file manager opens Passio and installs the seed. (Linux tested first; macOS + Windows wiring comes with those bundles.)

If double-click doesn't work:
- Check that Passio shows up when you right-click → "Open with…"
- As a fallback, open the `.seed` in a text editor, copy the JSON, and paste into Grove → Install.

## Enable / disable

Each installed seed has a toggle in Grove. Disabled seeds:
- Stop their worker immediately (all tools, hotkeys, schedulers go away)
- Stay on disk so their state/settings persist
- Can be re-enabled instantly without a reinstall

## Uninstall

Removes the folder + DB row. See [Permissions model](./permissions.md#revoking-permissions) for what's kept vs wiped.
