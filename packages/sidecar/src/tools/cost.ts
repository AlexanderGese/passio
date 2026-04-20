import type { Db } from "../db/client.js";

/**
 * Token + $ usage tracking. Writes one row per API call to a usage_log
 * table, then rolls up for the dashboard.
 *
 * Prices: OpenAI published rates (USD per 1M tokens, as of early 2026).
 * Keep this table in-source so we don't need a network call to price
 * something we already paid for.
 */

type Tier = "economy" | "standard" | "power" | "reasoning" | "tts" | "whisper" | "embedding";

const PRICING: Record<Tier, { in: number; out: number }> = {
  // per-1M tokens, USD
  economy: { in: 0.15, out: 0.6 }, // gpt-4o-mini
  standard: { in: 2.0, out: 8.0 }, // gpt-4.1
  power: { in: 1.25, out: 10.0 }, // gpt-5
  reasoning: { in: 15.0, out: 60.0 }, // o3
  tts: { in: 15.0, out: 0 }, // tts-1-hd, per 1M chars
  whisper: { in: 6.0, out: 0 }, // whisper-1, per 1M seconds*60 approx
  embedding: { in: 0.02, out: 0 },
};

export function ensureUsageTable(db: Db): void {
  db.$raw
    .query(
      `CREATE TABLE IF NOT EXISTS usage_log (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
         tier TEXT NOT NULL,
         model TEXT,
         in_tokens INTEGER NOT NULL DEFAULT 0,
         out_tokens INTEGER NOT NULL DEFAULT 0,
         dollars REAL NOT NULL DEFAULT 0
       )`,
    )
    .run();
  db.$raw.query("CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_log(ts)").run();
}

export function logUsage(
  db: Db,
  input: {
    tier: Tier;
    model?: string;
    inTokens?: number;
    outTokens?: number;
  },
): void {
  try {
    ensureUsageTable(db);
    const { in: inRate, out: outRate } = PRICING[input.tier];
    const dollars =
      ((input.inTokens ?? 0) / 1_000_000) * inRate +
      ((input.outTokens ?? 0) / 1_000_000) * outRate;
    db.$raw
      .query(
        "INSERT INTO usage_log(tier, model, in_tokens, out_tokens, dollars) VALUES(?, ?, ?, ?, ?)",
      )
      .run(
        input.tier,
        input.model ?? null,
        input.inTokens ?? 0,
        input.outTokens ?? 0,
        dollars,
      );
  } catch {
    /* best-effort — cost tracking must never break an inference call */
  }
}

type Row = {
  tier: string;
  calls: number;
  inTokens: number;
  outTokens: number;
  dollars: number;
};

/**
 * Compare today's / month's spend against user-configured budgets. Returns
 * a non-null `alert` string when a threshold is crossed for the first time
 * since the last alert fired (deduped via settings).
 */
export function budgetCheck(db: Db): { alert: string | null } {
  const budgetRow = db.$raw
    .query("SELECT value FROM settings WHERE key = 'cost_budget'")
    .get() as { value: string } | undefined;
  if (!budgetRow) return { alert: null };
  let budget: { daily?: number; monthly?: number };
  try {
    budget = JSON.parse(budgetRow.value);
  } catch {
    return { alert: null };
  }
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const month = new Date(today);
  month.setMonth(month.getMonth() - 1);

  const sumSince = (iso: string): number => {
    const r = db.$raw
      .query("SELECT COALESCE(SUM(dollars), 0) AS total FROM usage_log WHERE ts >= ?")
      .get(iso) as { total: number };
    return r.total;
  };

  const lastFireRow = db.$raw
    .query("SELECT value FROM settings WHERE key = 'cost_budget_last_fire'")
    .get() as { value: string } | undefined;
  const lastFire = lastFireRow ? JSON.parse(lastFireRow.value) as { daily?: number; monthly?: number } : {};

  const alerts: string[] = [];
  if (budget.daily) {
    const spend = sumSince(today.toISOString());
    if (spend >= budget.daily && (!lastFire.daily || now - lastFire.daily > 6 * 3600_000)) {
      alerts.push(`Today's spend hit $${spend.toFixed(3)} (budget $${budget.daily.toFixed(2)}).`);
      lastFire.daily = now;
    }
  }
  if (budget.monthly) {
    const spend = sumSince(month.toISOString());
    if (spend >= budget.monthly && (!lastFire.monthly || now - lastFire.monthly > 24 * 3600_000)) {
      alerts.push(`Month spend hit $${spend.toFixed(2)} (budget $${budget.monthly.toFixed(2)}).`);
      lastFire.monthly = now;
    }
  }
  if (alerts.length > 0) {
    db.$raw
      .query(
        "INSERT INTO settings(key, value) VALUES('cost_budget_last_fire', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(JSON.stringify(lastFire));
    return { alert: alerts.join(" ") };
  }
  return { alert: null };
}

export function costSummary(db: Db): {
  today: { total: number; rows: Row[] };
  week: { total: number; rows: Row[] };
  month: { total: number; rows: Row[] };
} {
  ensureUsageTable(db);
  const byRange = (since: string): { total: number; rows: Row[] } => {
    const rows = db.$raw
      .query(
        `SELECT tier,
                COUNT(*) AS calls,
                SUM(in_tokens) AS inTokens,
                SUM(out_tokens) AS outTokens,
                SUM(dollars) AS dollars
           FROM usage_log
          WHERE ts >= ?
          GROUP BY tier
          ORDER BY dollars DESC`,
      )
      .all(since) as Array<{
      tier: string;
      calls: number;
      inTokens: number;
      outTokens: number;
      dollars: number;
    }>;
    const total = rows.reduce((s, r) => s + (r.dollars || 0), 0);
    return {
      total,
      rows: rows.map((r) => ({
        tier: r.tier,
        calls: r.calls || 0,
        inTokens: r.inTokens || 0,
        outTokens: r.outTokens || 0,
        dollars: r.dollars || 0,
      })),
    };
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const week = new Date(today);
  week.setDate(week.getDate() - 7);
  const month = new Date(today);
  month.setMonth(month.getMonth() - 1);
  return {
    today: byRange(today.toISOString()),
    week: byRange(week.toISOString()),
    month: byRange(month.toISOString()),
  };
}
