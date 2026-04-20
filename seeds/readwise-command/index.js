export default async function init(passio) {
  async function api(path, { method = "GET", body, host = "https://readwise.io/api" } = {}) {
    const tok = await passio.secrets.get("token");
    if (!tok) throw new Error("set token");
    const r = await passio.net.fetch(host + path, { init: { method, headers: { Authorization: "Token " + tok, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined } });
    if (r.status === 200 && (path.endsWith(".json") || path.includes("review") || path.includes("export") || path.includes("highlights") || path.includes("auth"))) {
      return r.json();
    }
    return r.json().catch(() => ({}));
  }
  const reg = (n, d, x) => passio.tools.register({ name: n, description: d, execute: x });

  await reg("me", "", async () => api("/v2/auth/"));
  await reg("export_all", "{ updated_after? }", async ({ updated_after } = {}) => api(`/v2/export/${updated_after ? "?updatedAfter=" + updated_after : ""}`));
  await reg("review_daily", "", async () => api("/v2/review/"));
  await reg("save_to_reader", "{ url, tags?, location? }", async (body) => api("/v3/save/", { method: "POST", body, host: "https://readwise.io/api" }));
  await reg("search_highlights", "{ q }", async ({ q }) => api(`/v2/highlights/?search=${encodeURIComponent(q)}`));

  passio.schedule({ id: "morning", every_seconds: 3600 }, async () => {
    const d = new Date(); if (d.getHours() !== 8 || d.getMinutes() > 5) return;
    try { const r = await api("/v2/review/"); const titles = (r?.highlights ?? []).slice(0, 3).map(h => h.text.slice(0, 120)).join(" · "); if (titles) await passio.bubble.speak("Today's highlights: " + titles); } catch {}
  });
}
