# x-command — $39

Full X (Twitter) remote from inside Passio. Tweet, reply, like, retweet, delete, read timelines, search, mentions — all from chat or the panel. Opt-in autopilot that Passio's agent runs on an hourly tick.

Price reflects the fact that X's API (as of 2026) requires at minimum the $200/mo Basic tier for writes. You bring your own developer credentials; Passio never touches X on your behalf without you.

## Setup (once)

1. Have an X Developer account with **Basic** or higher access ($200/mo+ for writes).
2. Create a project + app at https://developer.x.com.
3. In the app's User Authentication Settings:
   - Enable OAuth 1.0a
   - App permissions: **Read and write**
   - Callback URL: anything (`http://localhost`)
   - Website: anything
4. Generate:
   - **Bearer token** (App → Keys and tokens → Bearer token) — used for all reads
   - **Consumer keys** (API key + secret) — for signing
   - **Access token + secret** (your user's) — required for writes

5. In Passio → **Grove → x-command → Settings**, paste:
   - **License key** (from Gumroad)
   - **Bearer token** (v2 app-only)
   - All four **OAuth 1.0a** fields (consumer key/secret + access token/secret)

Passio verifies the license locally (ed25519) and enables the seed.

## Tools exposed

Every tool is callable by Passio's chat agent.

**Writes (OAuth 1.0a):**
- `tweet({ text, reply_to? })`
- `reply({ to, text })`
- `like({ id })` / `unlike({ id })`
- `retweet({ id })` / `unretweet({ id })`
- `delete({ id })`

**Reads (Bearer):**
- `timeline({ limit? })` — your home timeline
- `mentions({ limit? })` — recent mentions
- `search({ q, limit? })` — recent-search
- `me()` — your account

**Autopilot:**
- `autopilot_tick()` — run one cycle now
- `autopilot_enable({ on })` / `autopilot_dry_run({ on })`
- `recent_posts()` — local log

## Autopilot

Opt-in. On each hourly tick Passio checks:
- Is the daily cap hit? (default 2)
- Has the min gap elapsed since last tweet? (default 240 min)
- Are there topics configured?

If yes, drafts a tweet in your voice and either writes it to a vault note (dry-run — default) or posts.

**Safety posture is conservative on purpose.** Tweeting auto-is-easy to regret. Keep dry-run on for a week before flipping it off. Even then, a hard daily cap of 2 is a very reasonable default; bump it only once you trust the drafts.

## Cost

- Seed: $39 one-time via Gumroad
- X API: you pay X directly. As of 2026 the Basic tier is $200/mo. The seed does nothing to reduce that cost — it's a remote that makes the paid API useful from inside Passio.

## Privacy

- All credentials live in Passio's secret vault (OS keychain when available, otherwise a chmod-600 fallback file).
- The seed only reaches `api.twitter.com` / `api.x.com` — declared in its manifest's network allowlist. A malicious update would have to ask you to approve new hosts.
- Request signing is in-process; no third-party OAuth library is used.
