import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";
import matter from "gray-matter";

const REPO_ROOT = join(process.cwd(), "..", "..");
const DOCS_ROOT = join(REPO_ROOT, "docs");

export type DocEntry = {
  slug: string[];
  title: string;
  path: string;
  category?: string;
};

export type DocPage = {
  slug: string[];
  title: string;
  html: string;
  raw: string;
  breadcrumbs: Array<{ label: string; href: string }>;
};

/**
 * Flat index of every `.md` file under docs/. Used for the sidebar + search.
 */
export function listDocs(): DocEntry[] {
  const out: DocEntry[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith(".")) continue;
      const p = join(dir, entry);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (entry.endsWith(".md")) {
        const rel = relative(DOCS_ROOT, p).replace(/\\/g, "/");
        const slug = rel.replace(/\.md$/, "").split("/");
        const title = readTitle(p, slug);
        const last = slug[slug.length - 1] ?? "";
        const category = slug.length > 1 ? slug[0] : undefined;
        if (last === "README") {
          out.push({ slug: slug.slice(0, -1), title, path: p, ...(category ? { category } : {}) });
        } else {
          out.push({ slug, title, path: p, ...(category ? { category } : {}) });
        }
      }
    }
  };
  walk(DOCS_ROOT);
  return out.sort((a, b) => a.slug.join("/").localeCompare(b.slug.join("/")));
}

export async function getDoc(slug: string[]): Promise<DocPage | null> {
  const candidates = [
    join(DOCS_ROOT, ...slug) + ".md",
    join(DOCS_ROOT, ...slug, "README.md"),
  ];
  const path = candidates.find((p) => {
    try {
      statSync(p);
      return true;
    } catch {
      return false;
    }
  });
  if (!path) return null;
  const raw = readFileSync(path, "utf8");
  const parsed = matter(raw);
  const processed = await remark().use(remarkGfm).use(remarkHtml, { sanitize: false }).process(parsed.content);
  const html = String(processed);
  const title = parsed.data.title ?? readTitleFromMarkdown(parsed.content) ?? slug[slug.length - 1] ?? "Docs";
  const breadcrumbs = buildBreadcrumbs(slug);
  return { slug, title, html, raw: parsed.content, breadcrumbs };
}

function readTitle(path: string, slug: string[]): string {
  try {
    const raw = readFileSync(path, "utf8");
    const m = /^#\s+(.+)$/m.exec(raw);
    if (m) return m[1]!.trim();
  } catch {
    /* ignore */
  }
  const last = slug[slug.length - 1] ?? "Docs";
  return last === "README" ? (slug[slug.length - 2] ?? "Docs") : last.replace(/-/g, " ");
}

function readTitleFromMarkdown(content: string): string | null {
  const m = /^#\s+(.+)$/m.exec(content);
  return m ? m[1]!.trim() : null;
}

function buildBreadcrumbs(slug: string[]) {
  const crumbs = [{ label: "Docs", href: "/docs" }];
  let acc = "/docs";
  for (const part of slug) {
    acc += "/" + part;
    crumbs.push({ label: part.replace(/-/g, " "), href: acc });
  }
  return crumbs;
}

export type OrchardEntry = {
  name: string;
  version: string;
  description: string;
  author: string;
  authorUrl?: string;
  homepage?: string;
  tags: string[];
  category: string;
  priceCents: number;
  currency: string;
  checkoutUrl?: string;
  licenseRequired: boolean;
  featured: boolean;
  source: unknown;
};

export function readOrchard(): OrchardEntry[] {
  const path = join(REPO_ROOT, "orchard", "index.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as { seeds: OrchardEntry[] };
  return raw.seeds ?? [];
}
