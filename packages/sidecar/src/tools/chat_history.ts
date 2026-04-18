import type { Db } from "../db/client.js";

/**
 * Chat-history helpers: FTS5 search across messages + conversation
 * listings. Conversations + messages tables already exist from v1; the
 * FTS trigger is added in the W20 migration batch.
 */

export interface ChatHit {
  id: number;
  conversationId: number | null;
  role: string;
  ts: string;
  snippet: string;
  score: number;
}

export function chatSearch(
  db: Db,
  input: { query: string; limit?: number },
): { hits: ChatHit[] } {
  const terms = input.query
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `${t.replace(/[^a-zA-Z0-9_]/g, "")}*`)
    .filter(Boolean)
    .join(" OR ");
  if (!terms) return { hits: [] };
  const limit = Math.max(1, Math.min(input.limit ?? 20, 50));
  const rows = db.$raw
    .query(
      `SELECT m.id AS id,
              m.conversation_id AS conversationId,
              m.role AS role,
              m.ts AS ts,
              snippet(message_fts, 0, '<em>', '</em>', '…', 12) AS snippet,
              bm25(message_fts) AS score
         FROM message_fts
         JOIN messages m ON m.id = message_fts.rowid
        WHERE message_fts MATCH ?
     ORDER BY score
        LIMIT ?`,
    )
    .all(terms, limit) as ChatHit[];
  return { hits: rows };
}

export interface ConversationSummary {
  id: number;
  startedAt: string;
  mode: string | null;
  messages: number;
  firstMessage: string | null;
}

export function chatListConversations(
  db: Db,
  input: { limit?: number },
): { conversations: ConversationSummary[] } {
  const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
  const rows = db.$raw
    .query(
      `SELECT c.id AS id,
              c.started_at AS startedAt,
              c.mode AS mode,
              COUNT(m.id) AS messages,
              (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY ts ASC LIMIT 1) AS firstMessage
         FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
     GROUP BY c.id
     ORDER BY c.started_at DESC
        LIMIT ?`,
    )
    .all(limit) as ConversationSummary[];
  return { conversations: rows };
}

export interface ConversationDetail {
  id: number;
  startedAt: string;
  messages: Array<{ id: number; ts: string; role: string; content: string }>;
}

export function chatGetConversation(
  db: Db,
  input: { id: number },
): ConversationDetail | null {
  const conv = db.$raw
    .query("SELECT id, started_at AS startedAt FROM conversations WHERE id = ?")
    .get(input.id) as { id: number; startedAt: string } | undefined;
  if (!conv) return null;
  const messages = db.$raw
    .query(
      "SELECT id, ts, role, content FROM messages WHERE conversation_id = ? ORDER BY ts ASC",
    )
    .all(input.id) as Array<{ id: number; ts: string; role: string; content: string }>;
  return { id: conv.id, startedAt: conv.startedAt, messages };
}
