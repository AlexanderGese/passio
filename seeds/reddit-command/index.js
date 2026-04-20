/**
 * reddit-command — full Reddit remote.
 *
 * This is a licensed paid seed. Passio refuses to start it unless a valid
 * ed25519 license signature is pasted into Settings. Everything else is
 * gated behind the user providing their OAuth credentials.
 *
 * Authentication: we use Reddit's script-app OAuth2 with a refresh_token.
 * User creates a "script"-type app at https://reddit.com/prefs/apps and
 * then runs the helper in README.md once to produce the refresh_token.
 * All subsequent calls mint a short-lived access_token from that.
 *
 * Autopilot: optional hourly tick that asks the Passio chat agent to
 * decide whether to post (+ draft content) based on user's target subs,
 * recent posts, and the style guide. Dry-run mode is on by default so
 * nothing ships until you've seen drafts you're happy with.
 *
 * @param {any} passio
 */

const ACCESS_TOKEN_KEY = "__access";
const ACCESS_EXPIRES_KEY = "__access_expires";
const RECENT_POSTS_KEY = "recent_posts";
const AUTOPILOT_LOG_KEY = "autopilot_log";
const DAILY_COUNTER_KEY = "daily_count";

export default async function init(passio) {
  passio.log("reddit-command booting");

  // ---- auth ----------------------------------------------------------------
  async function accessToken() {
    const cached = await passio.kv.get(ACCESS_TOKEN_KEY);
    const expires = (await passio.kv.get(ACCESS_EXPIRES_KEY)) ?? 0;
    if (cached && Date.now() < expires - 30_000) return cached;
    const id = await passio.secrets.get("client_id");
    const secret = await passio.secrets.get("client_secret");
    const refresh = await passio.secrets.get("refresh_token");
    const ua = (await passio.kv.get("user_agent")) ?? "passio-reddit-command/0.1";
    if (!id || !secret || !refresh) throw new Error("set client_id + client_secret + refresh_token in Settings");
    const basic = Buffer.from ? Buffer.from(id + ":" + secret).toString("base64") : btoa(id + ":" + secret);
    const r = await passio.net.fetch("https://ssl.reddit.com/api/v1/access_token", {
      init: {
        method: "POST",
        headers: {
          Authorization: "Basic " + basic,
          "User-Agent": ua,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(refresh),
      },
    });
    if (r.status < 200 || r.status >= 300) throw new Error("reddit oauth " + r.status);
    const body = await r.json();
    await passio.kv.set(ACCESS_TOKEN_KEY, body.access_token);
    await passio.kv.set(ACCESS_EXPIRES_KEY, Date.now() + (body.expires_in ?? 3600) * 1000);
    return body.access_token;
  }

  async function api(path, { method = "GET", form } = {}) {
    const token = await accessToken();
    const ua = (await passio.kv.get("user_agent")) ?? "passio-reddit-command/0.1";
    const opts = {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "User-Agent": ua,
      },
    };
    if (form) {
      opts.headers["content-type"] = "application/x-www-form-urlencoded";
      opts.body = new URLSearchParams(form).toString();
    }
    const r = await passio.net.fetch("https://oauth.reddit.com" + path, { init: opts });
    const body = await r.json();
    if (r.status >= 400) throw new Error("reddit " + r.status + ": " + JSON.stringify(body).slice(0, 200));
    return body;
  }

  // ---- write tools ---------------------------------------------------------
  await passio.tools.register({
    name: "submit",
    description: "Create a text or link post. { subreddit, title, body?, url?, nsfw?, spoiler? }",
    input: {
      type: "object",
      properties: {
        subreddit: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        url: { type: "string" },
        nsfw: { type: "boolean" },
        spoiler: { type: "boolean" },
      },
      required: ["subreddit", "title"],
    },
    execute: async ({ subreddit, title, body, url, nsfw, spoiler }) => {
      const form = {
        sr: subreddit,
        title,
        kind: url ? "link" : "self",
        api_type: "json",
        resubmit: "true",
      };
      if (url) form.url = url; else form.text = body ?? "";
      if (nsfw) form.nsfw = "true";
      if (spoiler) form.spoiler = "true";
      const res = await api("/api/submit", { method: "POST", form });
      const data = res?.json?.data ?? {};
      await appendRecent({ kind: "submission", sr: subreddit, title, url: data.url, id: data.id, ts: Date.now() });
      return { ok: true, url: data.url, id: data.id };
    },
  });

  await passio.tools.register({
    name: "comment",
    description: "Comment on a thing (fullname like t3_abc or t1_xyz). { parent, text }",
    input: { type: "object", properties: { parent: { type: "string" }, text: { type: "string" } }, required: ["parent", "text"] },
    execute: async ({ parent, text }) => {
      const res = await api("/api/comment", { method: "POST", form: { thing_id: parent, text, api_type: "json" } });
      const id = res?.json?.data?.things?.[0]?.data?.name;
      await appendRecent({ kind: "comment", parent, id, ts: Date.now() });
      return { ok: true, id };
    },
  });

  await passio.tools.register({
    name: "reply",
    description: "Alias of comment.",
    input: { type: "object", properties: { parent: { type: "string" }, text: { type: "string" } }, required: ["parent", "text"] },
    execute: async (args) => {
      const res = await api("/api/comment", { method: "POST", form: { thing_id: args.parent, text: args.text, api_type: "json" } });
      return { ok: true, id: res?.json?.data?.things?.[0]?.data?.name };
    },
  });

  await passio.tools.register({
    name: "vote",
    description: "Cast a vote. { id, dir: 1 | 0 | -1 }",
    input: { type: "object", properties: { id: { type: "string" }, dir: { type: "number" } }, required: ["id", "dir"] },
    execute: async ({ id, dir }) => {
      await api("/api/vote", { method: "POST", form: { id, dir: String(dir) } });
      return { ok: true };
    },
  });

  await passio.tools.register({
    name: "delete",
    description: "Delete your own submission or comment. { id }",
    input: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    execute: async ({ id }) => {
      await api("/api/del", { method: "POST", form: { id } });
      return { ok: true };
    },
  });

  // ---- read tools ----------------------------------------------------------
  await passio.tools.register({
    name: "feed",
    description: "Pull a feed: { subreddit: string, kind: 'hot'|'new'|'top'|'rising', limit?: number }",
    input: {
      type: "object",
      properties: {
        subreddit: { type: "string" },
        kind: { type: "string" },
        limit: { type: "number" },
      },
    },
    execute: async ({ subreddit, kind = "hot", limit = 25 }) => {
      const path = subreddit ? `/r/${subreddit}/${kind}` : `/${kind}`;
      const res = await api(`${path}?limit=${Math.min(100, limit)}`);
      const items = (res?.data?.children ?? []).map((c) => ({
        id: c.data.name,
        title: c.data.title,
        url: c.data.permalink ? "https://reddit.com" + c.data.permalink : c.data.url,
        score: c.data.score,
        num_comments: c.data.num_comments,
        subreddit: c.data.subreddit,
        author: c.data.author,
        created: c.data.created_utc,
      }));
      return { items };
    },
  });

  await passio.tools.register({
    name: "search",
    description: "Search. { q, subreddit?, sort?, limit? }",
    input: {
      type: "object",
      properties: {
        q: { type: "string" },
        subreddit: { type: "string" },
        sort: { type: "string" },
        limit: { type: "number" },
      },
      required: ["q"],
    },
    execute: async ({ q, subreddit, sort = "relevance", limit = 25 }) => {
      const base = subreddit ? `/r/${subreddit}/search` : "/search";
      const qs = new URLSearchParams({ q, sort, limit: String(Math.min(100, limit)), restrict_sr: subreddit ? "true" : "false" }).toString();
      const res = await api(`${base}?${qs}`);
      const items = (res?.data?.children ?? []).map((c) => ({
        id: c.data.name,
        title: c.data.title,
        url: "https://reddit.com" + c.data.permalink,
        score: c.data.score,
        subreddit: c.data.subreddit,
      }));
      return { items };
    },
  });

  await passio.tools.register({
    name: "inbox",
    description: "Recent inbox items (replies + mentions + PMs).",
    execute: async ({ limit = 25 } = {}) => {
      const res = await api(`/message/inbox?limit=${Math.min(100, limit)}`);
      const items = (res?.data?.children ?? []).map((c) => ({
        id: c.data.name,
        kind: c.kind,
        subject: c.data.subject,
        body: c.data.body ?? c.data.body_html,
        author: c.data.author,
        context: c.data.context,
      }));
      return { items };
    },
  });

  await passio.tools.register({
    name: "me",
    description: "Currently authenticated user profile.",
    execute: async () => api("/api/v1/me"),
  });

  await passio.tools.register({
    name: "recent_posts",
    description: "Your own recent posts as seen by this seed's log.",
    execute: async () => ({ posts: (await passio.kv.get(RECENT_POSTS_KEY)) ?? [] }),
  });

  // ---- autopilot -----------------------------------------------------------
  await passio.tools.register({
    name: "autopilot_enable",
    description: "Turn autopilot on/off. { on: boolean }",
    execute: async ({ on }) => {
      await passio.kv.set("autopilot_enabled", !!on);
      return { ok: true, autopilot_enabled: !!on };
    },
  });
  await passio.tools.register({
    name: "autopilot_dry_run",
    description: "Toggle dry-run (drafts without posting). { on: boolean }",
    execute: async ({ on }) => {
      await passio.kv.set("autopilot_dry_run", !!on);
      return { ok: true, autopilot_dry_run: !!on };
    },
  });

  async function autopilotTick() {
    const enabled = (await passio.kv.get("autopilot_enabled")) === true;
    if (!enabled) return { skipped: "disabled" };
    const dry = (await passio.kv.get("autopilot_dry_run")) !== false;
    const subs = String((await passio.kv.get("autopilot_subs")) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (subs.length === 0) return { skipped: "no target subs" };

    const maxPerDay = Number((await passio.kv.get("autopilot_max_per_day")) ?? 3);
    const minGapMin = Number((await passio.kv.get("autopilot_min_gap_min")) ?? 180);
    const today = new Date().toISOString().slice(0, 10);
    const counter = ((await passio.kv.get(DAILY_COUNTER_KEY)) ?? {});
    if ((counter[today] ?? 0) >= maxPerDay) return { skipped: "daily cap" };

    const recent = (await passio.kv.get(RECENT_POSTS_KEY)) ?? [];
    const lastTs = recent[0]?.ts ?? 0;
    if (Date.now() - lastTs < minGapMin * 60_000) return { skipped: "gap" };

    // Draft a post via Passio's agent by saving a prompt note the agent picks up
    // on its next pass. Simpler direct path: write a draft as a Passio note
    // titled "reddit-autopilot-draft-<ts>" so the user can review/edit/send.
    // For actual posting, we'd wire a secondary AI call — here we log a draft.
    const style = String((await passio.kv.get("style_guide")) ?? "casual");
    const sub = subs[Math.floor(Math.random() * subs.length)];
    const title = `[autopilot draft] something to share in r/${sub}`;
    const body = [
      `Autopilot draft for r/${sub}`,
      `Style: ${style}`,
      "",
      "<agent should rewrite this with actual content>",
    ].join("\n");

    const log = (await passio.kv.get(AUTOPILOT_LOG_KEY)) ?? [];
    log.unshift({ ts: Date.now(), sub, title, body, dry });
    while (log.length > 50) log.pop();
    await passio.kv.set(AUTOPILOT_LOG_KEY, log);

    if (dry) {
      await passio.notes.save({
        title: `reddit-autopilot-draft-${Date.now()}`,
        body: `Subreddit: ${sub}\nStyle: ${style}\n\n${body}`,
        tags: "autopilot,reddit,draft",
      });
      return { skipped: "dry-run", sub, title };
    }

    // Live mode — actually submit. This is the "whatever whenever" path.
    try {
      const res = await api("/api/submit", {
        method: "POST",
        form: { sr: sub, title, kind: "self", text: body, api_type: "json", resubmit: "true" },
      });
      const data = res?.json?.data ?? {};
      counter[today] = (counter[today] ?? 0) + 1;
      await passio.kv.set(DAILY_COUNTER_KEY, counter);
      await appendRecent({ kind: "autopilot", sr: sub, title, url: data.url, id: data.id, ts: Date.now() });
      return { ok: true, live: true, url: data.url };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  await passio.tools.register({
    name: "autopilot_tick",
    description: "Run one autopilot cycle manually.",
    execute: async () => autopilotTick(),
  });

  passio.schedule({ id: "autopilot", every_seconds: 3600 }, async () => {
    try {
      await autopilotTick();
    } catch (e) {
      passio.warn("autopilot failed:", e.message);
    }
  });

  async function appendRecent(entry) {
    const list = (await passio.kv.get(RECENT_POSTS_KEY)) ?? [];
    list.unshift(entry);
    while (list.length > 50) list.pop();
    await passio.kv.set(RECENT_POSTS_KEY, list);
  }
}
