# reddit-command — $29

Full Reddit remote from inside Passio. Post, comment, vote, browse, search, handle inbox — all from chat or the panel. Opt-in autopilot that Passio's agent runs on an hourly tick, following your style guide, with hard daily caps.

## Setup (once)

1. Go to https://www.reddit.com/prefs/apps and create a **script** app.
   - name: anything
   - redirect uri: `http://localhost:8080`
   - note the **client id** (under the app name) and **secret**.

2. Mint a refresh token via OAuth2. From any shell with `curl` + a browser:

   ```sh
   # 1. open this URL in your browser — you'll be asked to authorise.
   #    replace CLIENT_ID and use the scopes your seed needs.
   URL="https://www.reddit.com/api/v1/authorize?client_id=CLIENT_ID&response_type=code&state=x&redirect_uri=http://localhost:8080&duration=permanent&scope=identity submit edit read vote privatemessages history"
   echo "$URL"

   # 2. after accepting, Reddit redirects to http://localhost:8080/?state=x&code=XYZ
   #    copy the ?code=XYZ value.

   # 3. exchange it for a refresh token:
   curl -u CLIENT_ID:CLIENT_SECRET \
     -d "grant_type=authorization_code&code=XYZ&redirect_uri=http://localhost:8080" \
     -A "passio-reddit-command/0.1 by your_username" \
     https://ssl.reddit.com/api/v1/access_token
   ```

   The JSON response contains a `refresh_token` — that's what you paste into Passio.

3. In Passio → **Grow → Grove → reddit-command → Settings**, paste:
   - **License key** (the one you got from Gumroad after purchase)
   - **Reddit app client id / secret**
   - **OAuth refresh token**
   - **User-Agent** (required by Reddit: e.g. `passio-reddit-command/0.1 by your_username`)

Passio verifies the license locally (ed25519) and enables the seed.

## Tools exposed

Every tool is also callable by Passio's chat agent — so you can say "post a meta-post to r/foo saying bar" in chat.

- `submit({ subreddit, title, body?, url?, nsfw?, spoiler? })`
- `comment({ parent, text })` / `reply({ parent, text })`
- `vote({ id, dir: 1 | 0 | -1 })`
- `delete({ id })`
- `feed({ subreddit?, kind: 'hot'|'new'|'top'|'rising', limit? })`
- `search({ q, subreddit?, sort?, limit? })`
- `inbox({ limit? })`
- `me()`
- `recent_posts()`
- `autopilot_tick()` / `autopilot_enable({on})` / `autopilot_dry_run({on})`

## Autopilot

Opt-in. When on, every hour Passio checks:
- Is the daily cap hit? (configurable, default 3)
- Has enough time passed since the last post? (default 180 min)
- Are there target subs configured?

If yes, it drafts a post in your voice (style guide setting) and either
writes it as a vault note (dry-run mode — on by default) or actually posts.

**Keep dry-run on for at least 3–5 drafts.** Autonomous posting is easy to
get wrong — you want to see what it'd say before shipping.

## Keys + safety

- Credentials live in Passio's secret vault (OS keychain when available, a chmod-600 file otherwise). They never leave your machine except to `oauth.reddit.com` and `ssl.reddit.com`.
- The autopilot daily cap is enforced in-seed; it never bypasses.
- If autopilot fails (Reddit rate limit, network) it silently backs off; nothing queued.
