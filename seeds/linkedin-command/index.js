/**
 * linkedin-command — full LinkedIn remote. Licensed paid seed.
 *
 * Auth: LinkedIn's 3-legged OAuth 2.0 → Bearer access_token. You obtain it
 * once via the helper flow in README, paste into Settings. Tokens are
 * long-lived (60 days) but expire; refresh-token flow is TODO.
 *
 * Writes use the Share on LinkedIn API (`ugcPosts`). We also expose like,
 * comment, and messaging endpoints where they're still available to
 * developer apps in 2026.
 */
const RECENT = "recent_posts";
const COUNTER = "daily_counter";

export default async function init(passio) {
  async function api(path, opts = {}) {
    const token = await passio.secrets.get("access_token");
    if (!token) throw new Error("set access_token in Settings");
    const url = "https://api.linkedin.com" + path;
    const r = await passio.net.fetch(url, {
      init: {
        method: opts.method ?? "GET",
        headers: {
          Authorization: "Bearer " + token,
          "X-Restli-Protocol-Version": "2.0.0",
          ...(opts.body ? { "content-type": "application/json" } : {}),
          ...(opts.headers ?? {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      },
    });
    const body = await r.json().catch(() => ({}));
    if (r.status >= 400) throw new Error(`LinkedIn ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
    return { status: r.status, body };
  }

  await passio.tools.register({
    name: "me",
    description: "Profile of the authenticated user.",
    execute: async () => (await api("/v2/me")).body,
  });

  await passio.tools.register({
    name: "share_text",
    description: "Create a text share. { text, visibility: 'PUBLIC' | 'CONNECTIONS' }",
    input: { type: "object", properties: { text: { type: "string" }, visibility: { type: "string" } }, required: ["text"] },
    execute: async ({ text, visibility = "PUBLIC" }) => {
      const urn = await passio.kv.get("urn");
      if (!urn) throw new Error("set your person URN in Settings (urn:li:person:<id>)");
      const body = {
        author: urn,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text },
            shareMediaCategory: "NONE",
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": visibility },
      };
      const { body: res } = await api("/v2/ugcPosts", { method: "POST", body });
      await appendRecent({ kind: "share", text, urn: res.id, ts: Date.now() });
      return { ok: true, urn: res.id };
    },
  });

  await passio.tools.register({
    name: "share_article",
    description: "Share with an article link. { text, url, title?, description? }",
    input: { type: "object", properties: { text: { type: "string" }, url: { type: "string" }, title: { type: "string" }, description: { type: "string" } }, required: ["text", "url"] },
    execute: async ({ text, url, title, description }) => {
      const urn = await passio.kv.get("urn");
      const body = {
        author: urn,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text },
            shareMediaCategory: "ARTICLE",
            media: [
              {
                status: "READY",
                originalUrl: url,
                ...(title ? { title: { text: title } } : {}),
                ...(description ? { description: { text: description } } : {}),
              },
            ],
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      };
      const { body: res } = await api("/v2/ugcPosts", { method: "POST", body });
      await appendRecent({ kind: "article", text, url, urn: res.id, ts: Date.now() });
      return { ok: true, urn: res.id };
    },
  });

  await passio.tools.register({
    name: "like",
    description: "Like a share. { urn: 'urn:li:share:...' | 'urn:li:ugcPost:...' }",
    input: { type: "object", properties: { urn: { type: "string" } }, required: ["urn"] },
    execute: async ({ urn }) => {
      const me = await passio.kv.get("urn");
      await api("/v2/socialActions/" + encodeURIComponent(urn) + "/likes", {
        method: "POST",
        body: { actor: me, object: urn },
      });
      return { ok: true };
    },
  });

  await passio.tools.register({
    name: "comment",
    description: "Comment on a share. { urn, text }",
    input: { type: "object", properties: { urn: { type: "string" }, text: { type: "string" } }, required: ["urn", "text"] },
    execute: async ({ urn, text }) => {
      const me = await passio.kv.get("urn");
      await api("/v2/socialActions/" + encodeURIComponent(urn) + "/comments", {
        method: "POST",
        body: { actor: me, message: { text } },
      });
      return { ok: true };
    },
  });

  await passio.tools.register({
    name: "feed",
    description: "Your authored posts. { limit? }",
    execute: async ({ limit = 20 } = {}) => {
      const urn = await passio.kv.get("urn");
      const { body } = await api(`/v2/ugcPosts?q=authors&authors=List(${encodeURIComponent(urn)})&count=${Math.min(50, limit)}`);
      return { items: body?.elements ?? [] };
    },
  });

  await passio.tools.register({
    name: "message",
    description: "Send a direct message to a connection. { to_urn, subject, body }",
    input: { type: "object", properties: { to_urn: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["to_urn", "body"] },
    execute: async ({ to_urn, subject, body }) => {
      const me = await passio.kv.get("urn");
      await api("/v2/messages", {
        method: "POST",
        body: {
          recipients: [to_urn],
          subject: subject ?? "",
          body,
          messageCategory: "MEMBER_TO_MEMBER",
          sender: me,
        },
      });
      return { ok: true };
    },
  });

  await passio.tools.register({
    name: "connections_count",
    description: "Approximate connections count — via /v2/connections paginated.",
    execute: async () => {
      const { body } = await api("/v2/connections?q=viewer&start=0&count=1");
      return { total: body?.paging?.total ?? null };
    },
  });

  await passio.tools.register({
    name: "recent_posts",
    execute: async () => ({ posts: (await passio.kv.get(RECENT)) ?? [] }),
  });

  // ---- autopilot ---------------------------------------------------------
  await passio.tools.register({ name: "autopilot_enable", execute: async ({ on }) => { await passio.kv.set("autopilot_enabled", !!on); return { on: !!on }; } });
  await passio.tools.register({ name: "autopilot_dry_run", execute: async ({ on }) => { await passio.kv.set("autopilot_dry_run", !!on); return { on: !!on }; } });

  async function autopilotTick() {
    if ((await passio.kv.get("autopilot_enabled")) !== true) return { skipped: "off" };
    const dry = (await passio.kv.get("autopilot_dry_run")) !== false;
    const topics = String((await passio.kv.get("autopilot_topics")) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!topics.length) return { skipped: "no topics" };
    const today = new Date().toISOString().slice(0, 10);
    const counter = (await passio.kv.get(COUNTER)) ?? {};
    const max = Number((await passio.kv.get("autopilot_max_per_day")) ?? 1);
    if ((counter[today] ?? 0) >= max) return { skipped: "daily cap" };
    const gap = Number((await passio.kv.get("autopilot_min_gap_min")) ?? 720);
    const recent = (await passio.kv.get(RECENT)) ?? [];
    if (recent[0] && Date.now() - recent[0].ts < gap * 60_000) return { skipped: "gap" };
    const topic = topics[Math.floor(Math.random() * topics.length)];
    const style = String((await passio.kv.get("style_guide")) ?? "");
    const text = `[autopilot draft] ${topic}`;
    if (dry) {
      await passio.notes.save({ title: `linkedin-autopilot-${Date.now()}`, body: `Topic: ${topic}\nStyle: ${style}\n\n${text}`, tags: "autopilot,linkedin,draft" });
      return { skipped: "dry-run", topic };
    }
    try {
      const urn = await passio.kv.get("urn");
      const body = {
        author: urn,
        lifecycleState: "PUBLISHED",
        specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text }, shareMediaCategory: "NONE" } },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      };
      const { body: res } = await api("/v2/ugcPosts", { method: "POST", body });
      counter[today] = (counter[today] ?? 0) + 1;
      await passio.kv.set(COUNTER, counter);
      await appendRecent({ kind: "autopilot", text, urn: res.id, ts: Date.now() });
      return { ok: true, live: true, urn: res.id };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  await passio.tools.register({ name: "autopilot_tick", execute: autopilotTick });
  passio.schedule({ id: "autopilot", every_seconds: 3600 }, () => autopilotTick().catch(() => undefined));

  async function appendRecent(entry) {
    const list = (await passio.kv.get(RECENT)) ?? [];
    list.unshift(entry);
    while (list.length > 50) list.pop();
    await passio.kv.set(RECENT, list);
  }
}
