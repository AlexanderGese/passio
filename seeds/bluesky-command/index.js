/** bluesky-command — AT protocol via bsky.social. */
export default async function init(passio) {
  async function getSession() {
    const cache = await passio.kv.get("__session");
    if (cache && Date.now() < (cache.refreshAt ?? 0)) return cache;
    const identifier = await passio.kv.get("identifier");
    const password = await passio.secrets.get("app_password");
    if (!identifier || !password) throw new Error("set identifier + app_password");
    const r = await passio.net.fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
      init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier, password }) },
    });
    const js = await r.json();
    if (r.status >= 400) throw new Error(`bsky auth ${r.status}: ${JSON.stringify(js).slice(0, 200)}`);
    const sess = { ...js, refreshAt: Date.now() + 50 * 60_000 };
    await passio.kv.set("__session", sess);
    return sess;
  }
  async function xrpc(nsid, { method = "POST", body, query } = {}) {
    const s = await getSession();
    const qs = query ? "?" + new URLSearchParams(query).toString() : "";
    const url = `https://bsky.social/xrpc/${nsid}${qs}`;
    const r = await passio.net.fetch(url, { init: { method, headers: { Authorization: "Bearer " + s.accessJwt, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined } });
    const js = await r.json().catch(() => ({}));
    if (r.status >= 400) throw new Error(`bsky ${nsid} ${r.status}: ${JSON.stringify(js).slice(0, 200)}`);
    return js;
  }
  const reg = (name, description, execute) => passio.tools.register({ name, description, execute });

  await reg("me", "", async () => { const s = await getSession(); return { did: s.did, handle: s.handle }; });
  await reg("post", "{ text, reply? }", async ({ text, reply }) => {
    const s = await getSession();
    const record = { $type: "app.bsky.feed.post", text, createdAt: new Date().toISOString(), ...(reply ? { reply } : {}) };
    return xrpc("com.atproto.repo.createRecord", { body: { repo: s.did, collection: "app.bsky.feed.post", record } });
  });
  await reg("reply", "{ to: {uri, cid}, parent: {uri, cid}, text }", async ({ to, parent, text }) => {
    const s = await getSession();
    const record = { $type: "app.bsky.feed.post", text, createdAt: new Date().toISOString(), reply: { root: to, parent } };
    return xrpc("com.atproto.repo.createRecord", { body: { repo: s.did, collection: "app.bsky.feed.post", record } });
  });
  await reg("like", "{ uri, cid }", async ({ uri, cid }) => {
    const s = await getSession();
    return xrpc("com.atproto.repo.createRecord", { body: { repo: s.did, collection: "app.bsky.feed.like", record: { $type: "app.bsky.feed.like", subject: { uri, cid }, createdAt: new Date().toISOString() } } });
  });
  await reg("unlike", "{ rkey }", async ({ rkey }) => { const s = await getSession(); return xrpc("com.atproto.repo.deleteRecord", { body: { repo: s.did, collection: "app.bsky.feed.like", rkey } }); });
  await reg("repost", "{ uri, cid }", async ({ uri, cid }) => {
    const s = await getSession();
    return xrpc("com.atproto.repo.createRecord", { body: { repo: s.did, collection: "app.bsky.feed.repost", record: { $type: "app.bsky.feed.repost", subject: { uri, cid }, createdAt: new Date().toISOString() } } });
  });
  await reg("feed", "{ limit? }", async ({ limit = 30 } = {}) => xrpc("app.bsky.feed.getTimeline", { method: "GET", query: { limit } }));
  await reg("search", "{ q, limit? }", async ({ q, limit = 25 }) => xrpc("app.bsky.feed.searchPosts", { method: "GET", query: { q, limit } }));
  await reg("follow", "{ did }", async ({ did }) => {
    const s = await getSession();
    return xrpc("com.atproto.repo.createRecord", { body: { repo: s.did, collection: "app.bsky.graph.follow", record: { $type: "app.bsky.graph.follow", subject: did, createdAt: new Date().toISOString() } } });
  });
}
