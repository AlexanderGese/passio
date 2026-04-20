# Selling paid Seeds

Passio supports paid Seeds out of the box via ed25519-signed license keys. No Passio-owned server is involved — you handle the checkout, you generate keys, the buyer pastes the key into Passio. Fully local verification.

Revenue is **100% yours**. (When the Orchard marketplace opens managed billing, we'll take a small cut for processing + hosting. Until then, you keep it all.)

## How it works

1. You publish a Seed with `"licensed": true` + your ed25519 public key in its manifest.
2. Passio refuses to run a licensed Seed without a valid key pasted into its settings.
3. You pick a checkout provider (Gumroad recommended — simplest) and set `checkoutUrl` in the Orchard entry.
4. On each purchase you run `license-gen sign` to mint a key and email it to the buyer (manually at first; automate via Gumroad webhook later).

## Step-by-step

### 1. Generate a keypair per seed

```
bunx @passio/seed-cli/license-gen init my-seed
```

This writes:
- `~/.passio-seed-keys/my-seed/priv.pem` (private — never share)
- `~/.passio-seed-keys/my-seed/pub.pem` + `pub.b64` (public — ships with the seed)

The command prints the base64 public key. Paste it into your seed's `seed.json`:

```json
{
  "name": "my-seed",
  "licensed": true,
  "licensePublicKey": "MCowBQYDK2VwAyEA…"
}
```

### 2. List on the Orchard

Submit a PR with a paid entry:

```json
{
  "name": "my-seed",
  "priceCents": 1500,
  "currency": "usd",
  "checkoutUrl": "https://you.gumroad.com/l/my-seed",
  "licenseRequired": true,
  "featured": false,
  "source": { "type": "github", "repo": "you/my-seed", "ref": "v0.1.0" }
}
```

Passio's Discover tab will show a "Buy $15.00" button that opens your Gumroad page.

### 3. Set up Gumroad (or Stripe / Lemon Squeezy)

Create the product on Gumroad:
- Fixed price: $15
- Delivery: "Custom email delivery" — means *you* email the license key after purchase

Gumroad will email you on every sale. For the first 5-10 sales just do it manually. Once it hurts, wire up a Gumroad webhook → small serverless function that calls `license-gen sign`.

### 4. Mint a key on each purchase

```
bunx @passio/seed-cli/license-gen sign \
  --seed my-seed \
  --buyer buyer@example.com
```

Outputs a single line like:

```
eyJzZWVkIjoibXktc2VlZCIsImJ1eWVyIjoiYnV5ZXJAZXhhbXBsZS5jb20iLCJpc3N1ZWRBdCI6IjIwMjYtMDQtMTlUMTk6MzA6MDBaIn0.aBc…signature…Xyz
```

Email that to the buyer with:

```
Thanks for buying my-seed! Paste this key into Passio → Grove → my-seed → Settings → License:

<paste-the-line>

Enjoy!
```

For a 30-day trial:
```
license-gen sign --seed my-seed --buyer buyer@example.com --days 30
```

### 5. Buyer activates

The buyer:
1. Installs your seed via Discover (one-click if it's on the Orchard)
2. Grove → your seed → Settings → pastes the license
3. Seed starts

If they paste a bad or expired license the seed refuses to start and the Grove error chip surfaces why ("License invalid: signature mismatch").

## Pricing tactics

- **$5–$15 one-time** for small automations (clipboard, pomodoro-plus, inbox triage).
- **$30–$50 one-time** for deep integrations (full calendar agent, research compounder).
- **$5–$15/month subscription** — use `--days 31` licenses, re-issue after each renewal. Subscription is higher effort; don't start there.
- **Pay-what-you-want**: Gumroad supports a floor price + suggested — use it for your first seed to learn.

## Important considerations

- **Key rotation**: if a private key leaks, rotate it. You'll have to ship a new seed version with a new `licensePublicKey` + re-issue every existing customer's license. So *don't let it leak*.
- **Refunds**: Gumroad handles this natively. Do not build a revocation list unless you really need one — the honor system + good support scales further than you'd think.
- **Piracy**: someone will crack your Seed eventually (it's JS). Accept it. Focus on serving paying customers well so they keep buying your next Seed.
- **Taxes**: Gumroad handles EU VAT and US sales tax for you. Worth the cut alone in most jurisdictions.

## Attribution

You don't owe Passio anything to sell a Seed. The Orchard is a free, curated registry. When the marketplace grows enough to justify a storefront (with managed billing + license delivery), the cut will be 15–30% and it'll be opt-in — you can always keep publishing to the Orchard as a free listing with your own checkout.
