import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../db/client.js";
import {
  goalCreate,
  goalDecompose,
  goalList,
  goalReview,
  goalUpdate,
  milestoneAdd,
  milestoneDone,
  milestoneReschedule,
  recomputeProgress,
} from "./goals.js";

function tempDb(tag: string) {
  return openDb(join(tmpdir(), `passio-goals-${tag}-${Date.now()}.sqlite`));
}

// Stub decomposer — no network, deterministic.
function fakeDecompose(overrides?: { milestones?: { title: string; due_date: string }[] }) {
  return async () => ({
    rationale: "Test plan — two milestones with reverse-engineered dates.",
    milestones: overrides?.milestones ?? [
      { title: "Ship alpha", due_date: "2026-06-01" },
      { title: "Public beta", due_date: "2026-09-01" },
      { title: "v1 launch", due_date: "2026-12-01" },
    ],
  });
}

describe("goals", () => {
  test("goalCreate persists and auto-decomposes via injected decomposer", async () => {
    const db = tempDb("create");
    const res = await goalCreate(
      db,
      {
        title: "Launch a SaaS in 12 months",
        category: "entrepreneurship",
        target_date: "2027-04-17",
      },
      fakeDecompose(),
    );
    expect(res.id).toBeGreaterThan(0);
    const list = await goalList(db, {});
    expect(list.goals).toHaveLength(1);
    expect(list.goals[0]?.milestones).toHaveLength(3);
    expect(list.goals[0]?.milestones[0]?.dueDate).toBe("2026-06-01");
    db.$raw.close();
  });

  test("milestoneDone updates progress", async () => {
    const db = tempDb("progress");
    const { id: goalId } = await goalCreate(
      db,
      { title: "Run a marathon", category: "health", target_date: "2026-11-01" },
      fakeDecompose(),
    );
    const { goals: list } = await goalList(db, {});
    const firstM = list[0]!.milestones[0]!;
    const { progress } = await milestoneDone(db, { id: firstM.id });
    expect(progress).toBeCloseTo(1 / 3);

    // Finish all
    for (const m of list[0]!.milestones.slice(1)) {
      await milestoneDone(db, { id: m.id });
    }
    const { goals: after } = await goalList(db, { status: "all" });
    const mine = after.find((g) => g.id === goalId)!;
    expect(mine.progress).toBeCloseTo(1);
    expect(mine.status).toBe("achieved");
    db.$raw.close();
  });

  test("goalUpdate changes fields", async () => {
    const db = tempDb("update");
    const { id } = await goalCreate(
      db,
      { title: "Learn Japanese", category: "language", target_date: "2027-10-01" },
      fakeDecompose(),
    );
    await goalUpdate(db, { id, fields: { status: "paused", priority: 3 } });
    const { goals: rows } = await goalList(db, { status: "all" });
    expect(rows.find((g) => g.id === id)?.status).toBe("paused");
    expect(rows.find((g) => g.id === id)?.priority).toBe(3);
    db.$raw.close();
  });

  test("goalDecompose replace:true wipes old milestones", async () => {
    const db = tempDb("redecompose");
    const { id } = await goalCreate(
      db,
      { title: "Get into MIT", category: "education", target_date: "2027-09-01" },
      fakeDecompose(),
    );
    await goalDecompose(
      db,
      { id, replace: true },
      fakeDecompose({
        milestones: [
          { title: "Take SAT", due_date: "2026-06-01" },
          { title: "Essay drafts", due_date: "2026-10-01" },
          { title: "Submit apps", due_date: "2027-01-01" },
        ],
      }),
    );
    const { goals: list } = await goalList(db, { status: "all" });
    const mine = list.find((g) => g.id === id)!;
    expect(mine.milestones.map((m) => m.title)).toEqual([
      "Take SAT",
      "Essay drafts",
      "Submit apps",
    ]);
    db.$raw.close();
  });

  test("milestoneAdd + milestoneReschedule", async () => {
    const db = tempDb("manual");
    const { id: goalId } = await goalCreate(
      db,
      { title: "Finish novel", category: "creative", target_date: "2027-01-01" },
      fakeDecompose(),
    );
    const { id: mid } = await milestoneAdd(db, {
      goal_id: goalId,
      title: "Draft chapter 4",
      due_date: "2026-07-01",
    });
    await milestoneReschedule(db, { id: mid, new_date: "2026-08-15" });
    const { goals: list } = await goalList(db, { status: "all" });
    const m = list.find((g) => g.id === goalId)!.milestones.find((x) => x.id === mid);
    expect(m?.dueDate).toBe("2026-08-15");
    db.$raw.close();
  });

  test("goalReview captures progress + overdue summary", async () => {
    const db = tempDb("review");
    const { id } = await goalCreate(
      db,
      { title: "N2 Japanese", category: "language", target_date: "2027-07-01" },
      fakeDecompose({
        milestones: [
          { title: "Grammar done", due_date: "2025-01-01" }, // overdue
          { title: "Mock N3", due_date: "2026-06-01" },
        ],
      }),
    );
    const { summary } = await goalReview(db, { id, kind: "weekly" });
    expect(summary).toContain("N2 Japanese");
    expect(summary).toContain("Overdue");
    db.$raw.close();
  });

  test("recomputeProgress on empty goal returns 0", async () => {
    const db = tempDb("empty");
    const { id } = await goalCreate(
      db,
      { title: "Stub", category: "personal", target_date: "2027-01-01", auto_decompose: false },
    );
    const p = await recomputeProgress(db, id);
    expect(p).toBe(0);
    db.$raw.close();
  });
});
