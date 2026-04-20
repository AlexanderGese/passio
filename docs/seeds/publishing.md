# Publishing a Seed

## 1. Code lives on GitHub (or any tarball URL)

Push your seed folder to a repo. Keep the manifest (`seed.json`) at the repo root or inside a known subdirectory.

```
you/passio-seed-foobar/
├── seed.json
├── index.js
├── panel.js
└── README.md
```

Optionally tag a release (`v0.1.0`) so the `.seed` descriptor can pin a specific commit.

## 2. Build the `.seed` descriptor

```
passio-seed build .
```

Writes `dist/<name>.seed`. Default output uses:
- `source.type: "github"` and `source.repo` auto-detected from `git remote`
- `source.ref` = current branch name
- `sha256` = a content hash of the folder (minus `dist/`, `node_modules/`, `.git`, dotfiles)

Edit the file to set a stable `ref` (a tag or SHA) before distribution.

## 3. Distribute

Choose one:
- Commit the `.seed` to your repo's releases as an attachment.
- Host it on your personal site / gist / pastebin.
- Email / DM it directly.

The file is JSON and tiny — it's a pointer, not a bundle.

## 4. Install stories

Users can:
- **Double-click** the `.seed` file in their file manager → Passio auto-installs.
- **Paste the JSON** into Grove → Install.
- **CLI**: `curl -X POST .../rpc -d '{"method":"passio.seed.installDescriptor","params":{...}}'`
- **GitHub shortcut**: Grove → Install → GitHub tab → `owner/repo` + ref → Passio synthesizes the descriptor.

## Versioning

Bump `version` in your manifest (semver) when shipping changes. Users will see the old version in Grove until they reinstall — Passio doesn't auto-update seeds yet (planned for v1.1). To prompt an update, ship a new `.seed` descriptor with the new version.

## Integrity (optional)

Pin `sha256` in the descriptor if you want install-time verification. The value is the sha256 of a canonical walk of the seed folder (sorted entries, file contents hashed alongside filenames). The `passio-seed build` command computes this for you.

## Licensing

Ship a `LICENSE` file in your repo. Surface the license in your `README.md`. Passio itself doesn't claim ownership of seed code.
