export default async function init(passio) {
  async function api(path, { method = "GET", body } = {}) {
    const tok = await passio.secrets.get("token");
    if (!tok) throw new Error("set token");
    const team = await passio.kv.get("team_id");
    const sep = path.includes("?") ? "&" : "?";
    const url = `https://api.vercel.com${path}${team ? `${sep}teamId=${team}` : ""}`;
    const r = await passio.net.fetch(url, { init: { method, headers: { Authorization: "Bearer " + tok, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined } });
    const js = await r.json().catch(() => ({}));
    if (r.status >= 400) throw new Error(`vercel ${r.status}: ${JSON.stringify(js).slice(0, 200)}`);
    return js;
  }
  const reg = (n, d, x) => passio.tools.register({ name: n, description: d, execute: x });

  await reg("me", "", async () => api("/v2/user"));
  await reg("projects", "", async () => api("/v9/projects"));
  await reg("deployments", "{ projectId?, limit? }", async ({ projectId, limit = 20 } = {}) => api(`/v6/deployments?${projectId ? "projectId=" + projectId + "&" : ""}limit=${limit}`));
  await reg("deployment", "{ id }", async ({ id }) => api(`/v13/deployments/${id}`));
  await reg("promote", "{ projectId, deploymentId }", async ({ projectId, deploymentId }) => api(`/v10/projects/${projectId}/promote/${deploymentId}`, { method: "POST" }));
  await reg("rollback", "{ projectId, deploymentId }", async ({ projectId, deploymentId }) => api(`/v10/projects/${projectId}/promote/${deploymentId}`, { method: "POST" }));
  await reg("env_list", "{ projectId }", async ({ projectId }) => api(`/v10/projects/${projectId}/env`));
  await reg("env_set", "{ projectId, key, value, target: ['production','preview','development'] }", async ({ projectId, ...body }) => api(`/v10/projects/${projectId}/env`, { method: "POST", body: { type: "encrypted", ...body } }));
  await reg("env_unset", "{ projectId, id }", async ({ projectId, id }) => api(`/v10/projects/${projectId}/env/${id}`, { method: "DELETE" }));
  await reg("domains", "{ projectId? }", async ({ projectId } = {}) => api(projectId ? `/v9/projects/${projectId}/domains` : `/v5/domains`));
  await reg("logs", "{ deploymentId, limit? }", async ({ deploymentId, limit = 100 }) => api(`/v2/deployments/${deploymentId}/events?limit=${limit}`));
}
