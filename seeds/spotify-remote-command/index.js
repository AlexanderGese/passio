export default async function init(passio) {
  async function api(path, { method = "GET", body, query } = {}) {
    const tok = await passio.secrets.get("access_token");
    if (!tok) throw new Error("set access_token");
    const qs = query ? "?" + new URLSearchParams(query).toString() : "";
    const r = await passio.net.fetch("https://api.spotify.com/v1" + path + qs, { init: { method, headers: { Authorization: "Bearer " + tok, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined } });
    if (r.status === 204) return {};
    const js = await r.json().catch(() => ({}));
    if (r.status >= 400) throw new Error(`spotify ${r.status}: ${js.error?.message ?? r.status}`);
    return js;
  }
  const reg = (n, d, x) => passio.tools.register({ name: n, description: d, execute: x });

  await reg("me", "", async () => api("/me"));
  await reg("devices", "", async () => api("/me/player/devices"));
  await reg("now_playing", "", async () => api("/me/player/currently-playing"));
  await reg("play", "{ uris? }", async ({ uris } = {}) => api("/me/player/play", { method: "PUT", body: uris ? { uris } : undefined }));
  await reg("pause", "", async () => api("/me/player/pause", { method: "PUT" }));
  await reg("next", "", async () => api("/me/player/next", { method: "POST" }));
  await reg("prev", "", async () => api("/me/player/previous", { method: "POST" }));
  await reg("queue", "{ uri }", async ({ uri }) => api(`/me/player/queue`, { method: "POST", query: { uri } }));
  await reg("transfer", "{ device_id }", async ({ device_id }) => api("/me/player", { method: "PUT", body: { device_ids: [device_id], play: true } }));
  await reg("search", "{ q, type? }", async ({ q, type = "track,artist,album" }) => api("/search", { query: { q, type, limit: 20 } }));
  await reg("playlist_create", "{ name, public? }", async ({ name, public: pub = false }) => { const me = await api("/me"); return api(`/users/${me.id}/playlists`, { method: "POST", body: { name, public: pub } }); });
  await reg("playlist_add", "{ playlist_id, uris }", async ({ playlist_id, uris }) => api(`/playlists/${playlist_id}/tracks`, { method: "POST", body: { uris } }));
  await reg("save_track", "{ id }", async ({ id }) => api("/me/tracks", { method: "PUT", body: { ids: [id] } }));
}
