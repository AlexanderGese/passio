import type { Db } from "../db/client.js";
import { iconDataUrl, listApps } from "./apps_index.js";

/**
 * Cross-store fuzzy search for the global spotlight. Keeps it simple:
 * FTS/LIKE against each kind + scan the Linux .desktop app index, merge,
 * rank by a naive score.
 */

type Hit = {
  kind: "todo" | "fact" | "note" | "goal" | "conversation" | "file" | "vault" | "app";
  id: number;
  title: string;
  snippet: string;
  score: number;
  // Populated for launchable hits. Lets the HUD open the app/file directly.
  exec?: string;
  path?: string;
  icon?: string;
  /** Inline data-URL of the app icon, when resolvable. The HUD renders this
   *  directly in an <img>; no asset-protocol plumbing needed. */
  iconUrl?: string;
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
        path: r.path,
      });
  } catch {
    /* ignore */
  }

  // --- Linux .desktop apps (cached, refreshes every 10 min) ---
  try {
    const qLower = q.toLowerCase();
    const qCompact = qLower.replace(/\s+/g, "");
    let appHits = 0;
    for (const app of listApps()) {
      if (appHits >= 12) break;
      const name = app.name.toLowerCase();
      const generic = (app.genericName ?? "").toLowerCase();
      const comment = (app.comment ?? "").toLowerCase();
      const keywords = app.keywords.join(" ").toLowerCase();
      const execName = app.exec.split(/\s+/)[0]!.split("/").pop()!.toLowerCase();

      let score = 0;
      if (name === qLower) score = 1.4;
      else if (name.startsWith(qLower)) score = 1.2;
      else if (name.includes(qLower)) score = 1.0;
      else if (execName === qCompact) score = 1.1;
      else if (execName.startsWith(qCompact)) score = 0.95;
      else if (generic.includes(qLower)) score = 0.7;
      else if (keywords.includes(qLower)) score = 0.65;
      else if (comment.includes(qLower)) score = 0.45;

      if (score > 0) {
        all.push({
          kind: "app",
          // apps don't have a DB id; stable-ish hash of the path keeps React keys stable
          id: hash32(app.path),
          title: app.name,
          snippet: app.comment || app.genericName || execName,
          score,
          exec: app.exec,
          path: app.path,
          ...(app.icon ? { icon: app.icon } : {}),
        });
        appHits += 1;
      }
    }
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
        path: r.path,
      });
  } catch {
    /* ignore */
  }

  all.sort((a, b) => b.score - a.score);
  const top = all.slice(0, limit);
  // Inline an icon data-URL for the top-N app hits (cheap; cached).
  for (const hit of top) {
    if (hit.kind !== "app") continue;
    const app = listApps().find((a) => a.path === hit.path);
    if (!app?.iconPath) continue;
    const url = iconDataUrl(app.iconPath);
    if (url) hit.iconUrl = url;
  }
  return { hits: top };
}

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // Keep positive 31-bit so it fits the React `id: number` key comfortably.
  return h & 0x7fffffff;
}
