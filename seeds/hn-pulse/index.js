/** @param {any} passio */
export default async function init(passio) {
  const HN = "https://hacker-news.firebaseio.com/v0";

  async function fetchJson(url) {
    const r = await passio.net.fetch(url);
    if (!r.ok) throw new Error(`HN HTTP ${r.status}`);
    return r.json();
  }

  async function topStories(limit = 5) {
    const ids = await fetchJson(`${HN}/topstories.json`);
    const items = [];
    for (const id of ids.slice(0, limit)) {
      try {
        const s = await fetchJson(`${HN}/item/${id}.json`);
        items.push({ id, title: s.title, url: s.url, score: s.score, by: s.by });
      } catch (e) {
        passio.warn(`HN item ${id} failed:`, e.message);
      }
    }
    await passio.kv.set("lastFetch", { ts: Date.now(), items });
    return items;
  }

  await passio.tools.register({
    name: "top_stories",
    description: "Fetch top N Hacker News stories. Default 5.",
    input: { type: "object", properties: { limit: { type: "number" } } },
    execute: async ({ limit }) => ({ items: await topStories(limit ?? 5) }),
  });

  passio.schedule({ id: "refresh", every_seconds: 900 }, async () => {
    try {
      await topStories(10);
      passio.log("HN refreshed");
    } catch (e) {
      passio.warn("HN refresh failed:", e.message);
    }
  });

  // Prime cache immediately so the panel shows data on first open.
  topStories(10).catch((e) => passio.warn("initial HN fetch failed:", e.message));
}
