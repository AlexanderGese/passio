/**
 * Minimal Obsidian markdown parser. Extracts YAML frontmatter (a small
 * subset — plain key/value + lists; nested structures fall back to raw),
 * `#tags`, and `[[wiki-links]]`. We keep the parser narrow to avoid a
 * heavy YAML dep inside the Bun-compiled binary.
 */

export interface ParsedNote {
  title: string | null;
  body: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  wikiLinks: string[];
}

export function parseMarkdown(filename: string, raw: string): ParsedNote {
  const { frontmatter, body } = extractFrontmatter(raw);
  const wikiLinks = extractWikiLinks(body);
  const tags = extractTags(body, frontmatter);
  const title = extractTitle(filename, body, frontmatter);
  return { title, body, frontmatter, tags, wikiLinks };
}

function extractFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  if (!raw.startsWith("---\n")) return { frontmatter: {}, body: raw };
  const end = raw.indexOf("\n---\n", 4);
  const altEnd = raw.indexOf("\n---", 4);
  const fmEnd = end !== -1 ? end : altEnd;
  if (fmEnd === -1) return { frontmatter: {}, body: raw };
  const fmBlock = raw.slice(4, fmEnd);
  // skip past closing fence (accounts for \n---\n or \n---<EOF>)
  const afterFence = fmEnd + (end !== -1 ? 5 : 4);
  const body = raw.slice(afterFence).replace(/^\n+/, "");
  return { frontmatter: parseYamlLike(fmBlock), body };
}

/**
 * Tiny YAML-ish parser. Supports: `key: value`, `key: [a, b]`, multi-line
 * lists `key:\n  - a\n  - b`, and `#comment`. No anchors, no nested maps.
 * Values are coerced to number / boolean / string.
 */
function parseYamlLike(block: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = block.split(/\r?\n/);
  let listKey: string | null = null;
  let listItems: string[] | null = null;

  const flushList = () => {
    if (listKey && listItems) {
      out[listKey] = listItems.map(coerce);
    }
    listKey = null;
    listItems = null;
  };

  for (const line of lines) {
    const raw = line.replace(/\s+#.*$/, "").trimEnd();
    if (!raw.trim()) continue;
    if (listKey && /^\s{2,}-\s+/.test(raw)) {
      const item = raw.replace(/^\s{2,}-\s+/, "");
      listItems!.push(item.trim());
      continue;
    }
    flushList();
    const m = raw.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, rest] = m;
    if (rest === "" || rest === undefined) {
      listKey = key!;
      listItems = [];
      continue;
    }
    if (rest.startsWith("[") && rest.endsWith("]")) {
      const items = rest
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      out[key!] = items.map(coerce);
      continue;
    }
    out[key!] = coerce(rest);
  }
  flushList();
  return out;
}

function coerce(v: string): unknown {
  const s = v.replace(/^["']|["']$/g, "");
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

const WIKI_RE = /\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g;
function extractWikiLinks(body: string): string[] {
  const seen = new Set<string>();
  for (const m of body.matchAll(WIKI_RE)) {
    const target = m[1]!.trim();
    if (target) seen.add(target);
  }
  return [...seen];
}

const TAG_RE = /(^|\s)#([A-Za-z0-9_\-/]+)/g;
function extractTags(body: string, fm: Record<string, unknown>): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(TAG_RE)) {
    out.add(m[2]!);
  }
  const fmTags = fm["tags"];
  if (Array.isArray(fmTags)) {
    for (const t of fmTags) out.add(String(t));
  } else if (typeof fmTags === "string") {
    for (const t of fmTags.split(/[,\s]+/).filter(Boolean)) out.add(t);
  }
  return [...out];
}

function extractTitle(
  filename: string,
  body: string,
  fm: Record<string, unknown>,
): string | null {
  if (typeof fm["title"] === "string" && fm["title"]) return fm["title"] as string;
  const h1 = body.match(/^#\s+(.+)$/m);
  if (h1) return h1[1]!.trim();
  const base = filename.replace(/\.md$/, "");
  return base.length ? base : null;
}
