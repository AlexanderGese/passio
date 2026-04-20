export default async function init(passio) {
  async function api(path, { method = "GET", body } = {}) {
    const site = (await passio.kv.get("site_url")) ?? ""; const user = await passio.kv.get("username"); const pw = await passio.secrets.get("app_password");
    if (!site || !user || !pw) throw new Error("set site_url + username + app_password");
    const basic = (typeof Buffer !== "undefined" ? Buffer.from(user + ":" + pw).toString("base64") : btoa(user + ":" + pw));
    const r = await passio.net.fetch(site.replace(/\/$/, "") + "/wp-json/wp/v2" + path, { init: { method, headers: { Authorization: "Basic " + basic, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined } });
    const js = await r.json().catch(() => ({}));
    if (r.status >= 400) throw new Error(`wp ${r.status}: ${js.message ?? JSON.stringify(js).slice(0,200)}`);
    return js;
  }
  const reg = (n, d, x) => passio.tools.register({ name: n, description: d, execute: x });

  await reg("posts", "{ per_page?, status? }", async ({ per_page = 10, status = "any" } = {}) => api(`/posts?per_page=${per_page}&status=${status}`));
  await reg("post", "{ id }", async ({ id }) => api(`/posts/${id}`));
  await reg("post_create", "{ title, content, status? }", async (body) => api("/posts", { method: "POST", body: { status: "draft", ...body } }));
  await reg("post_update", "{ id, ...fields }", async ({ id, ...body }) => api(`/posts/${id}`, { method: "POST", body }));
  await reg("post_delete", "{ id, force? }", async ({ id, force = false }) => api(`/posts/${id}?force=${force}`, { method: "DELETE" }));
  await reg("publish", "{ id }", async ({ id }) => api(`/posts/${id}`, { method: "POST", body: { status: "publish" } }));
  await reg("schedule", "{ id, date }", async ({ id, date }) => api(`/posts/${id}`, { method: "POST", body: { status: "future", date } }));
  await reg("media", "{ per_page? }", async ({ per_page = 20 } = {}) => api(`/media?per_page=${per_page}`));
  await reg("categories", "", async () => api("/categories?per_page=50"));
  await reg("comments", "{ post? }", async ({ post } = {}) => api(`/comments${post ? "?post=" + post : ""}`));
}
