import type { Db } from "../db/client.js";

/**
 * Unified browser/editor over Passio's memory stores — facts, notes, and
 * knowledge-graph entities. Used by the HUD's Memory tab so the user can
 * see what Passio thinks it knows and correct it.
 */

type Row = {
  kind: "fact" | "note" | "entity";
  id: number;
  ts: string;
  title: string | null;
  content: string;
  source: string | null;
  subject: string | null;
  confidence: number | null;
};

export function browseMemory(
  db: Db,
  input: { query?: string; kind?: "all" | "fact" | "note" | "entity"; limit?: number },
): { rows: Row[] } {
  const limit = Math.min(input.limit ?? 100, 500);
  const kind = input.kind ?? "all";
  const q = input.query?.trim();
  const like = q ? `%${q}%` : null;
  const rows: Row[] = [];

  if (kind === "all" || kind === "fact") {
    const sql = like
      ? `SELECT id, ts, subject, content, source, confidence FROM facts
         WHERE content LIKE ? OR subject LIKE ? ORDER BY ts DESC LIMIT ?`
      : `SELECT id, ts, subject, content, source, confidence FROM facts
         ORDER BY ts DESC LIMIT ?`;
    const args = like ? [like, like, limit] : [limit];
    const facts = db.$raw.query(sql).all(...args) as Array<{
      id: number;
      ts: string;
      subject: string | null;
      content: string;
      source: string | null;
      confidence: number;
    }>;
    for (const f of facts)
      rows.push({
        kind: "fact",
        id: f.id,
        ts: f.ts,
        title: null,
        content: f.content,
        source: f.source,
        subject: f.subject,
        confidence: f.confidence,
      });
  }

  if (kind === "all" || kind === "note") {
    const sql = like
      ? `SELECT id, ts, title, body, tags FROM notes
         WHERE body LIKE ? OR title LIKE ? ORDER BY ts DESC LIMIT ?`
      : `SELECT id, ts, title, body, tags FROM notes ORDER BY ts DESC LIMIT ?`;
    const args = like ? [like, like, limit] : [limit];
    const notes = db.$raw.query(sql).all(...args) as Array<{
      id: number;
      ts: string;
      title: string | null;
      body: string;
      tags: string | null;
    }>;
    for (const n of notes)
      rows.push({
        kind: "note",
        id: n.id,
        ts: n.ts,
        title: n.title,
        content: n.body,
        source: n.tags,
        subject: null,
        confidence: null,
      });
  }

  if (kind === "all" || kind === "entity") {
    try {
      const sql = like
        ? `SELECT id, name, type, attributes FROM entities
           WHERE name LIKE ? OR attributes LIKE ? ORDER BY id DESC LIMIT ?`
        : `SELECT id, name, type, attributes FROM entities ORDER BY id DESC LIMIT ?`;
      const args = like ? [like, like, limit] : [limit];
      const ents = db.$raw.query(sql).all(...args) as Array<{
        id: number;
        name: string;
        type: string | null;
        attributes: string | null;
      }>;
      for (const e of ents)
        rows.push({
          kind: "entity",
          id: e.id,
          ts: "",
          title: e.type,
          content: `${e.name}${e.attributes ? ` · ${e.attributes}` : ""}`,
          source: null,
          subject: e.type,
          confidence: null,
        });
    } catch {
      /* entities table may not exist yet */
    }
  }

  // Sort combined results: descending ts, "" ts last.
  rows.sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
  return { rows: rows.slice(0, limit) };
}

export function updateMemory(
  db: Db,
  input: { kind: string; id: number; content: string },
): { ok: true } {
  if (input.kind === "fact") {
    db.$raw.query("UPDATE facts SET content = ? WHERE id = ?").run(input.content, input.id);
  } else if (input.kind === "note") {
    db.$raw.query("UPDATE notes SET body = ? WHERE id = ?").run(input.content, input.id);
  } else if (input.kind === "entity") {
    db.$raw.query("UPDATE entities SET name = ? WHERE id = ?").run(input.content, input.id);
  }
  return { ok: true };
}

export function deleteMemory(
  db: Db,
  input: { kind: string; id: number },
): { ok: true } {
  if (input.kind === "fact") {
    db.$raw.query("DELETE FROM facts WHERE id = ?").run(input.id);
    if (db.$hasVec) db.$raw.query("DELETE FROM fact_vec WHERE fact_id = ?").run(input.id);
  } else if (input.kind === "note") {
    db.$raw.query("DELETE FROM notes WHERE id = ?").run(input.id);
    if (db.$hasVec) db.$raw.query("DELETE FROM note_vec WHERE note_id = ?").run(input.id);
  } else if (input.kind === "entity") {
    try {
      db.$raw.query("DELETE FROM entities WHERE id = ?").run(input.id);
    } catch {
      /* no-op */
    }
  }
  return { ok: true };
}
