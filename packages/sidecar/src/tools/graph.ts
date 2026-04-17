import type { Db } from "../db/client.js";

/**
 * Minimal knowledge-graph layer. Entities are unique per (kind, name);
 * edges are typed + weighted. graphQuery walks N hops outward from a
 * seed entity and returns all touched entities + edges.
 */

export type EntityKind =
  | "person"
  | "project"
  | "topic"
  | "goal"
  | "source"
  | "place"
  | "tool"
  | "skill";

export function entityUpsert(
  db: Db,
  input: { kind: EntityKind; name: string; canonical_id?: string; data?: Record<string, unknown> },
): { id: number } {
  db.$raw
    .query(
      "INSERT INTO entities(kind, name, canonical_id, data) VALUES(?, ?, ?, ?) ON CONFLICT(kind, name) DO UPDATE SET canonical_id = COALESCE(excluded.canonical_id, entities.canonical_id), data = COALESCE(excluded.data, entities.data)",
    )
    .run(
      input.kind,
      input.name,
      input.canonical_id ?? null,
      input.data ? JSON.stringify(input.data) : null,
    );
  const row = db.$raw
    .query("SELECT id FROM entities WHERE kind = ? AND name = ?")
    .get(input.kind, input.name) as { id: number } | undefined;
  if (!row) throw new Error("entity upsert failed");
  return { id: row.id };
}

export function edgeAdd(
  db: Db,
  input: {
    src: { kind: EntityKind; name: string };
    dst: { kind: EntityKind; name: string };
    relation: string;
    weight?: number;
    source_ref?: string;
  },
): { id: number } {
  const { id: srcId } = entityUpsert(db, { kind: input.src.kind, name: input.src.name });
  const { id: dstId } = entityUpsert(db, { kind: input.dst.kind, name: input.dst.name });
  const res = db.$raw
    .query(
      "INSERT INTO edges(src_id, dst_id, relation, weight, source_ref) VALUES(?, ?, ?, ?, ?) RETURNING id",
    )
    .get(srcId, dstId, input.relation, input.weight ?? 1, input.source_ref ?? null) as
    | { id: number }
    | undefined;
  if (!res) throw new Error("edge insert failed");
  return { id: res.id };
}

export interface GraphNode {
  id: number;
  kind: string;
  name: string;
}
export interface GraphEdge {
  src: GraphNode;
  dst: GraphNode;
  relation: string;
  weight: number;
}

export function graphQuery(
  db: Db,
  input: { kind: EntityKind; name: string; depth?: number; relation_filter?: string[] },
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const depth = Math.min(Math.max(input.depth ?? 1, 0), 3);
  const seed = db.$raw
    .query("SELECT id, kind, name FROM entities WHERE kind = ? AND name = ?")
    .get(input.kind, input.name) as GraphNode | undefined;
  if (!seed) return { nodes: [], edges: [] };

  const nodes = new Map<number, GraphNode>([[seed.id, seed]]);
  const edges: GraphEdge[] = [];
  const queue: Array<{ id: number; dist: number }> = [{ id: seed.id, dist: 0 }];
  const relationFilter = input.relation_filter ? new Set(input.relation_filter) : null;

  while (queue.length) {
    const { id, dist } = queue.shift()!;
    if (dist >= depth) continue;
    const out = db.$raw
      .query(
        `SELECT e.id AS eid, e.relation AS relation, e.weight AS weight,
                e.src_id AS src_id, e.dst_id AS dst_id,
                s.kind AS s_kind, s.name AS s_name,
                d.kind AS d_kind, d.name AS d_name
         FROM edges e
         JOIN entities s ON s.id = e.src_id
         JOIN entities d ON d.id = e.dst_id
         WHERE e.src_id = ? OR e.dst_id = ?`,
      )
      .all(id, id) as Array<{
      eid: number;
      relation: string;
      weight: number;
      src_id: number;
      dst_id: number;
      s_kind: string;
      s_name: string;
      d_kind: string;
      d_name: string;
    }>;
    for (const row of out) {
      if (relationFilter && !relationFilter.has(row.relation)) continue;
      const src: GraphNode = { id: row.src_id, kind: row.s_kind, name: row.s_name };
      const dst: GraphNode = { id: row.dst_id, kind: row.d_kind, name: row.d_name };
      if (!nodes.has(src.id)) {
        nodes.set(src.id, src);
        queue.push({ id: src.id, dist: dist + 1 });
      }
      if (!nodes.has(dst.id)) {
        nodes.set(dst.id, dst);
        queue.push({ id: dst.id, dist: dist + 1 });
      }
      edges.push({ src, dst, relation: row.relation, weight: row.weight });
    }
  }

  return { nodes: [...nodes.values()], edges };
}
