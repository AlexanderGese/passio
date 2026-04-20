export default async function init(passio) {
  async function api(path, { method = "GET", body } = {}) {
    const tok = await passio.secrets.get("oauth_token");
    if (!tok) throw new Error("set oauth_token");
    const r = await passio.net.fetch("https://api.zoom.us/v2" + path, { init: { method, headers: { Authorization: "Bearer " + tok, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined } });
    const js = await r.json().catch(() => ({}));
    if (r.status >= 400) throw new Error(`zoom ${r.status}: ${js.message ?? JSON.stringify(js).slice(0,180)}`);
    return js;
  }
  const reg = (n, d, x) => passio.tools.register({ name: n, description: d, execute: x });

  await reg("me", "", async () => api("/users/me"));
  await reg("users", "", async () => api("/users?page_size=30"));
  await reg("meeting_create", "{ topic, start_time, duration?, timezone? }", async (body) => api("/users/me/meetings", { method: "POST", body: { type: 2, ...body } }));
  await reg("meetings", "{ type?: upcoming|live|scheduled }", async ({ type = "scheduled" } = {}) => api(`/users/me/meetings?type=${type}&page_size=30`));
  await reg("meeting_delete", "{ id }", async ({ id }) => api(`/meetings/${id}`, { method: "DELETE" }));
  await reg("recordings", "{ from, to }", async ({ from, to }) => api(`/users/me/recordings?from=${from}&to=${to}`));
  await reg("transcript_fetch", "{ download_url }", async ({ download_url }) => {
    const tok = await passio.secrets.get("oauth_token");
    const r = await passio.net.fetch(download_url + "?access_token=" + encodeURIComponent(tok));
    const text = await r.text();
    return { text };
  });
}
