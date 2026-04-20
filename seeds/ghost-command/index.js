import { createHmac } from "node:crypto";

export default async function init(passio) {
  async function jwt() {
    const key = await passio.secrets.get("admin_key"); if (!key) throw new Error("set admin_key");
    const [id, secret] = key.split(":");
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT", kid: id })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, aud: "/admin/" })).toString("base64url");
    const sig = createHmac("sha256", Buffer.from(secret, "hex")).update(`${header}.${payload}`).digest("base64url");
    return `${header}.${payload}.${sig}`;
  }
  async function api(path, { method = "GET", body } = {}) {
    const base = (await passio.kv.get("url")) ?? "";
    const token = await jwt();
    const r = await passio.net.fetch(base.replace(/\/$/, "") + "/ghost/api/admin" + path, { init: { method, headers: { Authorization: "Ghost " + token, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined } });
    const js = await r.json().catch(() => ({}));
    if (r.status >= 400) throw new Error(`ghost ${r.status}: ${JSON.stringify(js).slice(0, 200)}`);
    return js;
  }
  const reg = (n, d, x) => passio.tools.register({ name: n, description: d, execute: x });

  await reg("posts", "{ limit?, status? }", async ({ limit = 15, status = "all" } = {}) => api(`/posts/?limit=${limit}&filter=status:${status}`));
  await reg("post", "{ id }", async ({ id }) => api(`/posts/${id}/`));
  await reg("post_create", "{ title, html?, status? }", async (p) => api("/posts/", { method: "POST", body: { posts: [p] } }));
  await reg("post_update", "{ id, updated_at, ...fields }", async ({ id, ...fields }) => api(`/posts/${id}/`, { method: "PUT", body: { posts: [fields] } }));
  await reg("post_delete", "{ id }", async ({ id }) => api(`/posts/${id}/`, { method: "DELETE" }));
  await reg("publish", "{ id, updated_at }", async ({ id, updated_at }) => api(`/posts/${id}/`, { method: "PUT", body: { posts: [{ status: "published", updated_at }] } }));
  await reg("schedule", "{ id, published_at, updated_at }", async ({ id, updated_at, published_at }) => api(`/posts/${id}/`, { method: "PUT", body: { posts: [{ status: "scheduled", published_at, updated_at }] } }));
  await reg("tags", "", async () => api("/tags/"));
}
