import { useEffect, useState } from "react";
import { calendarApi } from "../../ipc";
import { ChipList, Section } from "./_shared";

export function CalendarSection() {
  const [sources, setSources] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await calendarApi.listSources();
      setSources(res.sources);
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
    setBusy(true);
    try {
      await calendarApi.setSources([...sources, v]);
      setDraft("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function remove(s: string) {
    await calendarApi.setSources(sources.filter((x) => x !== s));
    await refresh();
  }

  return (
    <div className="space-y-2 text-[14px]">
      <Section label="Calendar sources" hint="Public or secret .ics URLs (Google Calendar → Settings → Integrate calendar → Secret iCal URL) or local file paths. Upcoming events surface in morning briefings.">
        <p className="mb-2 text-[14px] text-neutral-200">
          Google Calendar → Settings → Integrate calendar → Secret iCal URL. Or any local .ics path.
        </p>
        <div className="flex gap-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://calendar.google.com/.../basic.ics"
            className="no-drag flex-1 rounded-md border border-passio-border bg-[#241B30] p-1.5 focus:border-passio-pulp focus:outline-none"
          />
          <button
            type="button"
            onClick={add}
            disabled={busy || !draft.trim()}
            className="rounded-md bg-passio-pulp/80 px-2 text-black hover:bg-passio-pulp disabled:opacity-40"
          >
            add
          </button>
        </div>
        {err && <p className="mt-2 text-[14px] text-red-300">{err}</p>}
        <div className="mt-2">
          <ChipList items={sources} onRemove={remove} />
        </div>
      </Section>
    </div>
  );
}
