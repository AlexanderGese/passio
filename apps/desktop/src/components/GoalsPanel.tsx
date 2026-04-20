import clsx from "clsx";
import { useEffect, useState } from "react";
import { type Goal, goalCreate, goalExtrasApi, goalList, milestoneDone } from "../ipc";
import { usePassioStore } from "../store";

type View = "list" | "new";

const CATEGORIES = [
  "education",
  "career",
  "health",
  "creative",
  "language",
  "financial",
  "entrepreneurship",
  "personal",
] as const;

export function GoalsPanel() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [view, setView] = useState<View>("list");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const { goals } = await goalList("active");
      setGoals(goals);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (view === "new") {
    return <NewGoalForm onDone={() => { setView("list"); void refresh(); }} onCancel={() => setView("list")} />;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="mb-2 flex items-center justify-between">
        <span className="text-[14px] uppercase tracking-wide text-neutral-200">Active goals</span>
        <button
          type="button"
          onClick={() => setView("new")}
          className="rounded-md bg-passio-skinLight/30 px-2 py-0.5 text-[14px] hover:bg-passio-skinLight/40"
        >
          + new
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {loading && <p className="text-[14px] text-neutral-300">loading…</p>}
        {!loading && goals.length === 0 && (
          <div className="rounded-lg bg-[#120E1A] p-3 text-[14px] text-neutral-200">
            <p>no active goals yet.</p>
            <p className="mt-1">
              tap <span className="text-passio-pulp">+ new</span> or tell me
              something like
              <span className="italic"> "I want to launch a SaaS in 12 months"</span>
              {" "}in chat.
            </p>
          </div>
        )}
        {goals.map((g) => (
          <GoalCard key={g.id} goal={g} onChange={refresh} />
        ))}
      </div>
    </div>
  );
}

function GoalCard({ goal, onChange }: { goal: Goal; onChange: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [splittingId, setSplittingId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { setActiveGoal, setTab } = usePassioStore();
  const done = goal.milestones.filter((m) => m.status === "done").length;
  const total = goal.milestones.length;
  const progress = total > 0 ? done / total : 0;
  const daysLeft = goal.targetDate ? daysBetween(new Date(), new Date(goal.targetDate)) : null;

  async function openChat() {
    setActiveGoal(goal.id, goal.title);
    setTab("chat");
  }

  async function splitMilestone(id: number) {
    setSplittingId(id);
    try {
      const res = await goalExtrasApi.milestoneToTodos(id);
      if (res.added > 0) onChange();
    } catch (e) {
      console.error("split failed", e);
    } finally {
      setSplittingId(null);
    }
  }

  async function handleDelete() {
    await goalExtrasApi.delete(goal.id);
    onChange();
  }

  return (
    <div className="rounded-xl border border-passio-border bg-[#1A1422] p-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ProgressRing progress={progress} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium text-passio-cream">{goal.title}</p>
            <p className="truncate text-[13px] text-neutral-200">
              {done}/{total} milestones
              {daysLeft !== null && (
                <>
                  {" · "}
                  <span
                    className={clsx(
                      daysLeft < 0 ? "text-red-400" : daysLeft < 14 ? "text-amber-300" : "",
                    )}
                  >
                    {daysLeft < 0 ? `${-daysLeft}d overdue` : `${daysLeft}d left`}
                  </span>
                </>
              )}
              {goal.category && <> · {goal.category}</>}
            </p>
          </div>
          <span className="text-neutral-300 text-[14px]">{expanded ? "▾" : "▸"}</span>
        </button>
      </div>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={openChat}
          className="flex-1 rounded-lg bg-passio-skin px-3 py-1.5 text-[13px] font-medium text-passio-cream hover:bg-passio-skinLight"
        >
          💬 Chat about this goal
        </button>
        {confirmDelete ? (
          <>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg bg-red-500 px-3 py-1.5 text-[13px] font-semibold text-white"
            >
              Delete?
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg bg-[#2E2340] px-3 py-1.5 text-[13px] text-neutral-200"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded-lg bg-[#2E2340] px-3 py-1.5 text-[13px] text-neutral-300 hover:text-red-300"
            aria-label="Delete goal"
            title="Delete goal"
          >
            🗑
          </button>
        )}
      </div>

      {expanded && (
        <ul className="mt-3 space-y-2 border-t border-passio-border pt-3 text-[14px]">
          {goal.milestones.length === 0 && (
            <li className="text-neutral-300">no milestones — try decompose</li>
          )}
          {goal.milestones.map((m) => (
            <li key={m.id} className="rounded-lg bg-[#241B30] p-2">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (m.status === "done") return;
                    await milestoneDone(m.id);
                    onChange();
                  }}
                  className={clsx(
                    "mt-1 h-4 w-4 shrink-0 rounded-full border-2",
                    m.status === "done"
                      ? "border-emerald-500 bg-emerald-500"
                      : "border-passio-borderBright hover:border-passio-pulp",
                  )}
                  aria-label={m.status === "done" ? "done" : "mark done"}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={clsx(
                      "text-[14px] leading-snug",
                      m.status === "done" && "text-neutral-300 line-through",
                    )}
                  >
                    {m.title}
                  </p>
                  {m.dueDate && (
                    <p className="mt-0.5 text-[12px] text-neutral-300">due {m.dueDate}</p>
                  )}
                </div>
                {m.status !== "done" && (
                  <button
                    type="button"
                    onClick={() => splitMilestone(m.id)}
                    disabled={splittingId === m.id}
                    className="shrink-0 rounded-md bg-passio-pulp/90 px-2 py-1 text-[11px] font-semibold text-passio-seed hover:bg-passio-pulpBright disabled:opacity-40"
                    title="Split this milestone into concrete dated todos"
                  >
                    {splittingId === m.id ? "…" : "Split"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProgressRing({ progress }: { progress: number }) {
  const size = 34;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="#FFB84D"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        fill="none"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="52%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={9}
        fill="#FFF4E0"
      >
        {Math.round(progress * 100)}
      </text>
    </svg>
  );
}

function NewGoalForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("personal");
  const [targetDate, setTargetDate] = useState(() => plusMonths(12));
  const [motivation, setMotivation] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await goalCreate({
        title: title.trim(),
        category,
        target_date: targetDate,
        motivation: motivation.trim() || undefined,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex h-full flex-col gap-2 text-[14px]">
      <header className="flex items-center justify-between">
        <span className="uppercase tracking-wide text-neutral-200">New goal</span>
        <button type="button" onClick={onCancel} className="text-neutral-300 hover:text-neutral-200">
          cancel
        </button>
      </header>
      <label className="block">
        <span className="text-neutral-300">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Get into MIT by fall 2027"
          required
          autoFocus
          className="no-drag mt-0.5 w-full rounded-md border border-passio-border bg-[#241B30] p-1.5 text-sm focus:border-passio-pulp focus:outline-none"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-neutral-300">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="no-drag mt-0.5 w-full rounded-md border border-passio-border bg-[#241B30] p-1.5 focus:border-passio-pulp focus:outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-neutral-300">Target date</span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            required
            className="no-drag mt-0.5 w-full rounded-md border border-passio-border bg-[#241B30] p-1.5 focus:border-passio-pulp focus:outline-none"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-neutral-300">Motivation (why this matters)</span>
        <textarea
          value={motivation}
          onChange={(e) => setMotivation(e.target.value)}
          rows={2}
          className="no-drag mt-0.5 w-full resize-none rounded-md border border-passio-border bg-[#241B30] p-1.5 focus:border-passio-pulp focus:outline-none"
        />
      </label>
      {err && <p className="text-red-400">{err}</p>}
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="mt-auto rounded-md bg-passio-pulp/80 p-2 text-sm text-black font-medium hover:bg-passio-pulp disabled:opacity-40"
      >
        {busy ? "decomposing…" : "create + auto-decompose"}
      </button>
    </form>
  );
}

function daysBetween(a: Date, b: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  const da = new Date(a.toISOString().slice(0, 10));
  const db = new Date(b.toISOString().slice(0, 10));
  return Math.round((db.getTime() - da.getTime()) / MS);
}

function plusMonths(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}
