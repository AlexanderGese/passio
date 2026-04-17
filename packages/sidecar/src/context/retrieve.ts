import type { Db } from "../db/client.js";
import { embedText, embeddingsAvailable, vecBlob } from "../ai/embeddings.js";

/**
 * Hybrid retrieval: vector-KNN + FTS5, merged via Reciprocal Rank Fusion.
 *
 * Query flow:
 *   1. (if embeddings available & vec loaded) KNN over fact_vec / note_vec / event_vec
 *   2. FTS5 over fact_fts / note_fts / event_fts
 *   3. Merge with RRF(k=60), return top N with kind+id+content+score
 */

export type Hit = {
  kind: "fact" | "note" | "event";
  id: number;
  content: string;
  score: number;
  source: "vec" | "fts" | "both";
};

const RRF_K = 60;

export async function retrieve(db: Db, query: string, limit = 10): Promise<Hit[]> {
  const fts = runFts(db, query, 20);
  const vec = (db.$hasVec && embeddingsAvailable())
    ? await runVec(db, query, 20).catch((e) => {
        console.error(
          JSON.stringify({
            jsonrpc: "2.0",
            method: "passio.log",
            params: { level: "warn", message: `vec retrieval failed: ${(e as Error).message}` },
          }),
        );
        return [] as Hit[];
      })
    : [];
  return rrf([fts, vec], limit);
}

function runFts(db: Db, query: string, per: number): Hit[] {
  const safe = sanitize(query);
  if (!safe) return [];
  const hits: Hit[] = [];

  for (const { kind, table, textCol } of [
    { kind: "fact" as const, table: "fact_fts", textCol: "content" },
    { kind: "note" as const, table: "note_fts", textCol: "body" },
    { kind: "event" as const, table: "event_fts", textCol: "content" },
  ]) {
    try {
      const rows = db.$raw
        .query(
          `SELECT rowid AS id, ${textCol} AS content, bm25(${table}) AS score
           FROM ${table} WHERE ${table} MATCH ? ORDER BY score LIMIT ?`,
        )
        .all(safe, per) as { id: number; content: string; score: number }[];
      for (const r of rows) {
        hits.push({ kind, id: r.id, content: r.content, score: r.score, source: "fts" });
      }
    } catch {
      // FTS5 errors on empty / malformed input — ignore
    }
  }

  return hits.sort((a, b) => a.score - b.score);
}

async function runVec(db: Db, query: string, per: number): Promise<Hit[]> {
  const q = await embedText(query);
  const blob = vecBlob(q);
  const hits: Hit[] = [];

  for (const { kind, vecTable, dataTable, textCol, idCol } of [
    { kind: "fact" as const, vecTable: "fact_vec", dataTable: "facts", textCol: "content", idCol: "fact_id" },
    { kind: "note" as const, vecTable: "note_vec", dataTable: "notes", textCol: "body", idCol: "note_id" },
    { kind: "event" as const, vecTable: "event_vec", dataTable: "events", textCol: "content", idCol: "event_id" },
  ]) {
    const rows = db.$raw
      .query(
        `SELECT v.${idCol} AS id, d.${textCol} AS content, v.distance AS distance
         FROM ${vecTable} v
         JOIN ${dataTable} d ON d.id = v.${idCol}
         WHERE v.embedding MATCH ? AND k = ?
         ORDER BY v.distance`,
      )
      .all(blob, per) as { id: number; content: string; distance: number }[];
    for (const r of rows) {
      hits.push({
        kind,
        id: r.id,
        content: r.content,
        score: r.distance,
        source: "vec",
      });
    }
  }

  return hits;
}

/**
 * Reciprocal Rank Fusion. Each ranked list contributes 1/(k + rank) per
 * item; items appearing in multiple lists get summed. Ties broken by
 * highest fused score first.
 */
export function rrf(lists: Hit[][], limit: number): Hit[] {
  const scores = new Map<string, { hit: Hit; score: number; sources: Set<Hit["source"]> }>();
  for (const list of lists) {
    list.forEach((hit, idx) => {
      const key = `${hit.kind}:${hit.id}`;
      const contribution = 1 / (RRF_K + idx + 1);
      const existing = scores.get(key);
      if (existing) {
        existing.score += contribution;
        existing.sources.add(hit.source);
      } else {
        scores.set(key, { hit, score: contribution, sources: new Set([hit.source]) });
      }
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ hit, score, sources }) => ({
      ...hit,
      score,
      source: sources.size > 1 ? "both" : [...sources][0] ?? hit.source,
    }));
}

/**
 * FTS5 MATCH is sensitive to operator characters. Strip them and wrap
 * multi-word queries as a phrase-OR for broad recall.
 */
function sanitize(q: string): string {
  const cleaned = q.replace(/["'()*:]/g, " ").trim();
  if (!cleaned) return "";
  const terms = cleaned.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return "";
  if (terms.length === 1) return `${terms[0]}*`;
  return terms.map((t) => `${t}*`).join(" OR ");
}
