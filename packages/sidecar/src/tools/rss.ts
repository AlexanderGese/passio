import type { Db } from "../db/client.js";

/**
 * Minimalist RSS / Atom reader. Feeds configured in settings; fetches
 * on demand, returns top N items from the last 24h across all feeds.
 */

export interface RssItem {
  title: string;
  url: string;
  summary: string;
  feed: string;
  published: string | null;
}

export function getFeeds(db: Db): string[] {
  const row = db.$raw.query("SELECT value FROM settings WHERE key = 'rss_feeds'").get() as
    | { value: string }
    | undefined;
  if (!row) return [];
  try {
    return JSON.parse(row.value) as string[];
  } catch {
    return [];
  }
}

export function listFeeds(db: Db): { feeds: string[] } {
  return { feeds: getFeeds(db) };
}

export function setFeeds(db: Db, feeds: string[]): { ok: true } {
  db.$raw
    .query(
      "INSERT INTO settings(key, value) VALUES('rss_feeds', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(JSON.stringify([...new Set(feeds.map((f) => f.trim()).filter(Boolean))]));
  return { ok: true };
}

export async function latestItems(
  db: Db,
  input: { hours?: number; limit?: number },
): Promise<{ items: RssItem[] }> {
  const hours = input.hours ?? 24;
  const limit = input.limit ?? 15;
  const cutoff = Date.now() - hours * 3_600_000;
  const feeds = getFeeds(db);
  const all: RssItem[] = [];
  for (const url of feeds) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "passio/1.0" } });
      if (!res.ok) continue;
      const xml = await res.text();
      all.push(...parseFeed(xml, url));
    } catch {
      /* skip broken feed */
    }
  }
  const filtered = all
    .filter((i) => {
      if (!i.published) return true;
      return Date.parse(i.published) >= cutoff;
    })
    .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""))
    .slice(0, limit);
  return { items: filtered };
}

/**
 * Parse RSS 2.0 or Atom. Tiny regex-based extractor — good enough for
 * the "top N items" use case, doesn't try to handle malformed XML.
 */
export function parseFeed(xml: string, sourceUrl: string): RssItem[] {
  const feedTitleMatch = xml.match(/<title[^>]*>([^<]*)<\/title>/i);
  const feedTitle = feedTitleMatch?.[1]?.trim() ?? sourceUrl;
  const items: RssItem[] = [];

  if (xml.includes("<entry")) {
    // Atom
    for (const entry of xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)) {
      const block = entry[0];
      items.push({
        title: decodeEntities(firstTag(block, "title")),
        url: firstAttr(block, /<link[^>]*href="([^"]+)"/i) ?? "",
        summary: stripTags(firstTag(block, "summary") || firstTag(block, "content")).slice(0, 500),
        feed: feedTitle,
        published: firstTag(block, "updated") || firstTag(block, "published") || null,
      });
    }
  } else {
    for (const entry of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
      const block = entry[0];
      items.push({
        title: decodeEntities(firstTag(block, "title")),
        url: decodeEntities(firstTag(block, "link")),
        summary: stripTags(firstTag(block, "description")).slice(0, 500),
        feed: feedTitle,
        published: firstTag(block, "pubDate") || null,
      });
    }
  }
  return items;
}

function firstTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m?.[1]?.trim() ?? "";
}
function firstAttr(block: string, re: RegExp): string | null {
  const m = block.match(re);
  return m?.[1] ?? null;
}
function stripTags(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim();
}
function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
