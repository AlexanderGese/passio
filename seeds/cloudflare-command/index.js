export default async function init(passio) {
  async function api(path, { method = "GET", body, raw } = {}) {
    const tok = await passio.secrets.get("api_token");
    if (!tok) throw new Error("set api_token");
    const r = await passio.net.fetch("https://api.cloudflare.com/client/v4" + path, {
      init: { method, headers: { Authorization: "Bearer " + tok, ...(body && !raw ? { "content-type": "application/json" } : {}) }, body: raw ?? (body ? JSON.stringify(body) : undefined) },
    });
    const js = await r.json().catch(() => ({}));
    if (!js.success && r.status >= 400) throw new Error(`cf ${r.status}: ${(js.errors ?? []).map((e) => e.message).join("; ")}`);
    return js.result ?? js;
  }
  const acc = async () => passio.kv.get("account_id");
  const reg = (n, d, x) => passio.tools.register({ name: n, description: d, execute: x });

  await reg("zones", "", async () => api("/zones?per_page=50"));
  await reg("dns_list", "{ zone_id }", async ({ zone_id }) => api(`/zones/${zone_id}/dns_records?per_page=100`));
  await reg("dns_add", "{ zone_id, type, name, content, ttl?, proxied? }", async ({ zone_id, ...body }) => api(`/zones/${zone_id}/dns_records`, { method: "POST", body }));
  await reg("dns_update", "{ zone_id, id, ...fields }", async ({ zone_id, id, ...body }) => api(`/zones/${zone_id}/dns_records/${id}`, { method: "PUT", body }));
  await reg("dns_delete", "{ zone_id, id }", async ({ zone_id, id }) => api(`/zones/${zone_id}/dns_records/${id}`, { method: "DELETE" }));
  await reg("purge", "{ zone_id, purge_everything? files? }", async ({ zone_id, ...body }) => api(`/zones/${zone_id}/purge_cache`, { method: "POST", body }));
  await reg("workers_list", "", async () => api(`/accounts/${await acc()}/workers/scripts`));
  await reg("worker_deploy", "{ name, source }", async ({ name, source }) => api(`/accounts/${await acc()}/workers/scripts/${name}`, { method: "PUT", raw: source, headers: { "content-type": "application/javascript" } }));
  await reg("kv_namespaces", "", async () => api(`/accounts/${await acc()}/storage/kv/namespaces`));
  await reg("kv_put", "{ namespace_id, key, value }", async ({ namespace_id, key, value }) => api(`/accounts/${await acc()}/storage/kv/namespaces/${namespace_id}/values/${encodeURIComponent(key)}`, { method: "PUT", raw: value }));
  await reg("kv_get", "{ namespace_id, key }", async ({ namespace_id, key }) => api(`/accounts/${await acc()}/storage/kv/namespaces/${namespace_id}/values/${encodeURIComponent(key)}`));
  await reg("kv_delete", "{ namespace_id, key }", async ({ namespace_id, key }) => api(`/accounts/${await acc()}/storage/kv/namespaces/${namespace_id}/values/${encodeURIComponent(key)}`, { method: "DELETE" }));
  await reg("kv_list", "{ namespace_id }", async ({ namespace_id }) => api(`/accounts/${await acc()}/storage/kv/namespaces/${namespace_id}/keys`));
}
