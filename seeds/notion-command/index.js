export default async function init(passio) {
  async function api(path, { method = "GET", body } = {}) {
    const tok = await passio.secrets.get("token");
    if (!tok) throw new Error("set token");
    const r = await passio.net.fetch("https://api.notion.com/v1" + path, {
      init: { method, headers: { Authorization: "Bearer " + tok, "Notion-Version": "2022-06-28", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined },
    });
    const js = await r.json().catch(() => ({}));
    if (r.status >= 400) throw new Error(`notion ${r.status}: ${JSON.stringify(js).slice(0, 200)}`);
    return js;
  }
  const reg = (n, d, x) => passio.tools.register({ name: n, description: d, execute: x });

  await reg("user_me", "", async () => api("/users/me"));
  await reg("db_query", "{ database_id, filter?, sorts? }", async ({ database_id, ...rest }) => api(`/databases/${database_id}/query`, { method: "POST", body: rest }));
  await reg("page_create", "{ parent: { database_id | page_id }, properties?, children? }", async (body) => api("/pages", { method: "POST", body }));
  await reg("page_update", "{ page_id, properties, archived? }", async ({ page_id, ...body }) => api(`/pages/${page_id}`, { method: "PATCH", body }));
  await reg("block_list", "{ block_id, page_size? }", async ({ block_id, page_size = 50 }) => api(`/blocks/${block_id}/children?page_size=${page_size}`));
  await reg("block_append", "{ block_id, children }", async ({ block_id, children }) => api(`/blocks/${block_id}/children`, { method: "PATCH", body: { children } }));
  await reg("search", "{ query, filter? }", async (body) => api("/search", { method: "POST", body }));
}
