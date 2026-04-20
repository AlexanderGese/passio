import type { Db } from "../db/client.js";

/**
 * Cross-store fuzzy search for the Super+/ global spotlight. Keeps it
 * simple: FTS/LIKE against each kind, merge, rank by a naive score.
 */

type Hit = {
  kind: "todo" | "fact" | "note" | "goal" | "conversation" | "file" | "vault";
  id: number;
  title: string;
  snippet: string;
  score: number;
};

export function spotlightSearch(
  db: Db,
  input: { query: string; limit?: number },
): { hits: Hit[] } {
  const q = input.query.trim();
  if (!q) return { hits: [] };
  const like = `%${q}%`;
  const limit = Math.min(input.limit ?? 30, 100);
  const all: Hit[] = [];

  try {
    const rows = db.$raw
      .query(
        "SELECT id, text, priority FROM todos WHERE text LIKE ? AND done = 0 ORDER BY priority DESC LIMIT 10",
      )
      .all(like) as Array<{ id: number; text: string; priority: number }>;
    for (const r of rows)
      all.push({
        kind: "todo",
        id: r.id,
        title: r.text,
        snippet: `priority ${r.priority}`,
        score: 0.5 + r.priority * 0.1,
      });
  } catch {
    /* ignore */
  }

  try {
    const rows = db.$raw
      .query(
        "SELECT id, subject, content FROM facts WHERE content LIKE ? OR subject LIKE ? ORDER BY ts DESC LIMIT 10",
      )
      .all(like, like) as Array<{
      id: number;
      subject: string | null;
      content: string;
    }>;
    for (const r of rows)
      all.push({
        kind: "fact",
        id: r.id,
        title: r.subject || r.content.slice(0, 60),
        snippet: r.content.slice(0, 80),
        score: 0.4,
      });
  } catch {
    /* ignore */
  }

  try {
    const rows = db.$raw
      .query(
        "SELECT id, title, body FROM notes WHERE body LIKE ? OR title LIKE ? ORDER BY ts DESC LIMIT 10",
      )
      .all(like, like) as Array<{ id: number; title: string | null; body: string }>;
    for (const r of rows)
      all.push({
        kind: "note",
        id: r.id,
        title: r.title || r.body.slice(0, 60),
        snippet: r.body.slice(0, 80),
        score: 0.35,
      });
  } catch {
    /* ignore */
  }

  try {
    const rows = db.$raw
      .query(
        "SELECT id, title, category FROM goals WHERE title LIKE ? OR description LIKE ? LIMIT 10",
      )
      .all(like, like) as Array<{
      id: number;
      title: string;
      category: string | null;
    }>;
    for (const r of rows)
      all.push({
        kind: "goal",
        id: r.id,
        title: r.title,
        snippet: r.category ?? "",
        score: 0.6,
      });
  } catch {
    /* ignore */
  }

  try {
    const rows = db.$raw
      .query(
        `SELECT m.conversation_id AS id,
                m.content AS content,
                c.started_at AS startedAt
           FROM messages m JOIN conversations c ON m.conversation_id = c.id
          WHERE m.content LIKE ? ORDER BY c.started_at DESC LIMIT 10`,
      )
      .all(like) as Array<{ id: number; content: string; startedAt: string }>;
    for (const r of rows)
      all.push({
        kind: "conversation",
        id: r.id,
        title: r.content.slice(0, 60),
        snippet: `chat · ${r.startedAt.slice(0, 10)}`,
        score: 0.3,
      });
  } catch {
    /* ignore */
  }

  try {
    const rows = db.$raw
      .query("SELECT id, path, summary FROM files WHERE path LIKE ? LIMIT 10")
      .all(like) as Array<{ id: number; path: string; summary: string | null }>;
    for (const r of rows)
      all.push({
        kind: "file",
        id: r.id,
        title: r.path.split("/").pop() || r.path,
        snippet: r.summary ?? r.path,
        score: 0.25,
      });
  } catch {
    /* ignore */
  }

  try {
    const rows = db.$raw
      .query(
        "SELECT id, path, title, body FROM vault_notes WHERE body LIKE ? OR title LIKE ? LIMIT 10",
      )
      .all(like, like) as Array<{
      id: number;
      path: string;
      title: string | null;
      body: string;
    }>;
    for (const r of rows)
      all.push({
        kind: "vault",
        id: r.id,
        title: r.title || r.path,
        snippet: r.body.slice(0, 80),
        score: 0.3,
      });
  } catch {
    /* ignore */
  }

  all.sort((a, b) => b.score - a.score);
  return { hits: all.slice(0, limit) };
}
