export default async function init(passio) {
  async function api(path, { method = "GET", body } = {}) {
    const tok = await passio.secrets.get("access_token"); if (!tok) throw new Error("set access_token");
    const r = await passio.net.fetch("https://api.canva.com/rest/v1" + path, { init: { method, headers: { Authorization: "Bearer " + tok, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined } });
    const js = await r.json().catch(() => ({}));
    if (r.status >= 400) throw new Error(`canva ${r.status}: ${JSON.stringify(js).slice(0, 200)}`);
    return js;
  }
  const reg = (n, d, x) => passio.tools.register({ name: n, description: d, execute: x });

  await reg("me", "", async () => api("/users/me"));
  await reg("designs", "", async () => api("/designs?limit=20"));
  await reg("design", "{ id }", async ({ id }) => api(`/designs/${id}`));
  await reg("design_create", "{ design_type, title? }", async (body) => api("/designs", { method: "POST", body }));
  await reg("autofill_create", "{ brand_template_id, data }", async ({ brand_template_id, data }) => api("/autofills", { method: "POST", body: { brand_template_id, data } }));
  await reg("export", "{ design_id, format }", async ({ design_id, format = "png" }) => api("/exports", { method: "POST", body: { design_id, format: { type: format } } }));
}
