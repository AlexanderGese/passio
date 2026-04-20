import { useEffect, useState } from "react";
import { rssApi } from "../../ipc";
import { ChipList, Section } from "./_shared";

export function RssSection() {
  const [feeds, setFeeds] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await rssApi.getFeeds();
      setFeeds(res.feeds);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function add() {
    const v = draft.trim();
    if (!v) return;
    await rssApi.setFeeds([...feeds, v]);
    setDraft("");
    await refresh();
  }
  async function remove(url: string) {
    await rssApi.setFeeds(feeds.filter((f) => f !== url));
    await refresh();
  }

  return (
    <div className="space-y-2 text-[14px]">
      <Section label="RSS / Atom feeds" hint="News + blog feeds Passio pulls during the morning briefing. One URL per row.">
        <div className="flex gap-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://example.com/feed.xml"
            className="no-drag flex-1 rounded-md border border-passio-border bg-[#241B30] p-1.5 focus:border-passio-pulp focus:outline-none"
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim()}
            className="rounded-md bg-passio-pulp/80 px-2 text-black hover:bg-passio-pulp disabled:opacity-40"
          >
            add
          </button>
        </div>
        {err && <p className="mt-2 text-[14px] text-red-300">{err}</p>}
        <div className="mt-2">
          <ChipList items={feeds} onRemove={remove} />
        </div>
      </Section>
    </div>
  );
}
