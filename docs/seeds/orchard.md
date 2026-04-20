# The Orchard

The Orchard is Passio's curated Seed registry — a single JSON file (`orchard/index.json`) that the HUD fetches to populate the **Grow → Grove → Discover** tab. Anyone can propose a Seed; Passio maintainers merge the PR.

## Submitting a Seed

1. Publish your seed's source to a public repo (GitHub works; any `tar.gz` URL works too).
2. Tag a release (e.g. `v0.1.0`).
3. Open a PR against [`alexandergese/passio`](https://github.com/alexandergese/passio) adding your entry to `orchard/index.json`:

```json
{
  "name": "my-seed",
  "version": "0.1.0",
  "description": "One-sentence pitch — what this saves the user.",
  "author": "@you",
  "authorUrl": "https://github.com/you",
  "tags": ["productivity", "widget"],
  "category": "productivity",
  "priceCents": 0,
  "currency": "usd",
  "licenseRequired": false,
  "featured": false,
  "source": {
    "type": "github",
    "repo": "you/my-seed",
    "ref": "v0.1.0"
  }
}
```

Categories are one of: `productivity`, `mail`, `news`, `developer`, `research`, `fun`, `widget`, `other`.

## Review checklist

PRs are merged once:
- The Seed installs cleanly via `passio-seed dev`
- Its `permissions` are declared correctly (no over-requests)
- It doesn't make unexpected network calls
- The description is truthful
- A screenshot or GIF is included in the PR if the Seed has UI

We're permissive about style but strict about permissions — a Seed that asks for `network: "*"` or `trusted: true` needs justification.

## Updates

Bump your seed's `version` in both:
- Your seed's `seed.json`
- The matching entry in `orchard/index.json` (and the `ref` if you pushed a new tag)

Users get a "check updates" chip in Grove; approved PRs to `orchard/index.json` surface new versions to everyone.

## Pointing Passio at a different Orchard

Advanced users can run their own Orchard:
```
# In Passio → Settings → (future Orchard section, or via RPC):
passio.orchard.setUrl({ url: "https://my.site/orchard.json" })
```

Private / corp seeds work the same way — host an `orchard.json` behind auth (Passio just does a plain `fetch`), or for simple cases use a GitHub gist raw URL.
