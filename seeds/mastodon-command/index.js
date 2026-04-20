export default async function init(passio) {
  async function base() { return "https://" + ((await passio.kv.get("instance")) ?? "mastodon.social") + "/api/v1"; }
  async function api(path, { method = "GET", body, query } = {}) {
    const tok = await passio.secrets.get("token");
    if (!tok) throw new Error("set token");
    const url = (await base()) + path + (query ? "?" + new URLSearchParams(query).toString() : "");
    const r = await passio.net.fetch(url, { init: { method, headers: { Authorization: "Bearer " + tok, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined } });
    const js = await r.json().catch(() => ({}));
    if (r.status >= 400) throw new Error(`mastodon ${r.status}: ${JSON.stringify(js).slice(0, 160)}`);
    return js;
  }
  const reg = (name, description, execute) => passio.tools.register({ name, description, execute });

  await reg("me", "", async () => api("/accounts/verify_credentials"));
  await reg("toot", "{ status, visibility? public|unlisted|private|direct }", async (p) => api("/statuses", { method: "POST", body: { status: p.status, visibility: p.visibility ?? "public" } }));
  await reg("reply", "{ in_reply_to_id, status }", async (p) => api("/statuses", { method: "POST", body: p }));
  await reg("boost", "{ id }", async ({ id }) => api(`/statuses/${id}/reblog`, { method: "POST" }));
  await reg("unboost", "{ id }", async ({ id }) => api(`/statuses/${id}/unreblog`, { method: "POST" }));
  await reg("favourite", "{ id }", async ({ id }) => api(`/statuses/${id}/favourite`, { method: "POST" }));
  await reg("unfavourite", "{ id }", async ({ id }) => api(`/statuses/${id}/unfavourite`, { method: "POST" }));
  await reg("follow", "{ account_id }", async ({ account_id }) => api(`/accounts/${account_id}/follow`, { method: "POST" }));
  await reg("unfollow", "{ account_id }", async ({ account_id }) => api(`/accounts/${account_id}/unfollow`, { method: "POST" }));
  await reg("timeline", "{ limit?, kind: 'home'|'public' }", async ({ limit = 20, kind = "home" }) => api(`/timelines/${kind}`, { query: { limit } }));
  await reg("mentions", "{ limit? }", async ({ limit = 20 } = {}) => api("/notifications", { query: { types: "mention", limit } }));
  await reg("search", "{ q }", async ({ q }) => api("/search", { query: { q, resolve: "true" } }));
  await reg("delete", "{ id }", async ({ id }) => api(`/statuses/${id}`, { method: "DELETE" }));

  await reg("autopilot_enable", "", async ({ on }) => { await passio.kv.set("autopilot_enabled", !!on); return { on: !!on }; });
  await reg("autopilot_dry_run", "", async ({ on }) => { await passio.kv.set("autopilot_dry_run", !!on); return { on: !!on }; });

  async function tick() {
    if ((await passio.kv.get("autopilot_enabled")) !== true) return { skipped: "off" };
    const dry = (await passio.kv.get("autopilot_dry_run")) !== false;
    const topics = String((await passio.kv.get("autopilot_topics")) ?? "").split(",").map(s=>s.trim()).filter(Boolean);
    if (!topics.length) return { skipped: "no topics" };
    const today = new Date().toISOString().slice(0, 10);
    const counter = (await passio.kv.get("counter")) ?? {};
    if ((counter[today] ?? 0) >= Number((await passio.kv.get("autopilot_max_per_day")) ?? 3)) return { skipped: "cap" };
    const text = `[autopilot] ${topics[Math.floor(Math.random()*topics.length)]}`;
    if (dry) { await passio.notes.save({ title: `mastodon-draft-${Date.now()}`, body: text, tags: "autopilot,mastodon" }); return { skipped: "dry" }; }
    const r = await api("/statuses", { method: "POST", body: { status: text } });
    counter[today] = (counter[today] ?? 0) + 1;
    await passio.kv.set("counter", counter);
    return { ok: true, id: r.id };
  }
  await reg("autopilot_tick", "", tick);
  passio.schedule({ id: "autopilot", every_seconds: 3600 }, () => tick().catch(() => undefined));
}
