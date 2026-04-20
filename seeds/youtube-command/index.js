export default async function init(passio) {
  async function api(path, { method = "GET", body, query } = {}) {
    const tok = await passio.secrets.get("access_token"); if (!tok) throw new Error("set access_token");
    const qs = query ? "?" + new URLSearchParams(query).toString() : "";
    const r = await passio.net.fetch("https://www.googleapis.com/youtube/v3" + path + qs, { init: { method, headers: { Authorization: "Bearer " + tok, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined } });
    const js = await r.json().catch(() => ({}));
    if (r.status >= 400) throw new Error(`yt ${r.status}: ${js.error?.message ?? r.status}`);
    return js;
  }
  const reg = (n, d, x) => passio.tools.register({ name: n, description: d, execute: x });

  await reg("me", "", async () => api("/channels", { query: { mine: "true", part: "snippet,statistics" } }));
  await reg("my_videos", "{ maxResults? }", async ({ maxResults = 25 } = {}) => {
    const me = await api("/channels", { query: { mine: "true", part: "contentDetails" } });
    const uploads = me.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) return { items: [] };
    return api("/playlistItems", { query: { playlistId: uploads, part: "snippet", maxResults } });
  });
  await reg("video", "{ id }", async ({ id }) => api("/videos", { query: { id, part: "snippet,status,statistics" } }));
  await reg("update_video", "{ id, title?, description?, tags?, category?, privacy? }", async ({ id, ...p }) => api("/videos", { method: "PUT", query: { part: "snippet,status" }, body: { id, snippet: { title: p.title, description: p.description, tags: p.tags, categoryId: p.category ?? "22" }, status: { privacyStatus: p.privacy } } }));
  await reg("delete_video", "{ id }", async ({ id }) => api("/videos", { method: "DELETE", query: { id } }));
  await reg("comment_post", "{ videoId, text, parentId? }", async ({ videoId, text, parentId }) => api("/commentThreads", { method: "POST", query: { part: "snippet" }, body: { snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } }, ...(parentId ? { channelId: parentId } : {}) } } }));
  await reg("comments_list", "{ videoId, maxResults? }", async ({ videoId, maxResults = 50 }) => api("/commentThreads", { query: { part: "snippet,replies", videoId, maxResults } }));
  await reg("captions", "{ videoId }", async ({ videoId }) => api("/captions", { query: { part: "snippet", videoId } }));
  await reg("playlist_create", "{ title, description?, privacy? }", async ({ title, description, privacy = "private" }) => api("/playlists", { method: "POST", query: { part: "snippet,status" }, body: { snippet: { title, description }, status: { privacyStatus: privacy } } }));
  await reg("playlist_add", "{ playlistId, videoId }", async ({ playlistId, videoId }) => api("/playlistItems", { method: "POST", query: { part: "snippet" }, body: { snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } } }));
  await reg("playlist_remove", "{ playlistItemId }", async ({ playlistItemId }) => api("/playlistItems", { method: "DELETE", query: { id: playlistItemId } }));
}
