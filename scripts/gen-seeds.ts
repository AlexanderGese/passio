#!/usr/bin/env bun
/**
 * Bulk seed generator. Reads `gen-seeds.spec.ts` and writes seed folders
 * under seeds/<name>/ with manifest + index.js + optional panel.js. Also
 * regenerates orchard/index.json with entries for every spec'd seed.
 *
 * Re-run this any time you edit the spec. It's idempotent — existing
 * seed files are overwritten, but nothing is deleted, so hand-customised
 * seeds that no longer appear in the spec stay put.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { SEED_SPECS } from "./gen-seeds.spec.js";
import type { SeedSpec } from "./gen-seeds.spec.js";

const REPO = dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, "");
const SEEDS_DIR = join(REPO, "seeds");
const ORCHARD = join(REPO, "orchard", "index.json");

let wrote = 0;
for (const spec of SEED_SPECS) {
  const dir = join(SEEDS_DIR, spec.name);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "seed.json"), buildManifest(spec) + "\n");
  writeFileSync(join(dir, "index.js"), spec.entry + "\n");
  if (spec.panel) writeFileSync(join(dir, "panel.js"), spec.panel + "\n");
  if (spec.readme) writeFileSync(join(dir, "README.md"), spec.readme + "\n");
  wrote++;
}
console.log(`wrote ${wrote} seed folders`);

// --- Rebuild orchard/index.json — keeps existing paid/external entries.
let existingOrchard: {
  $schema: string;
  updated: string;
  seeds: Array<Record<string, unknown>>;
} = { $schema: "passio-orchard@1", updated: new Date().toISOString().slice(0, 10), seeds: [] };
if (existsSync(ORCHARD)) {
  try {
    existingOrchard = JSON.parse(await Bun.file(ORCHARD).text());
  } catch {
    /* fresh */
  }
}
const keepExternal = existingOrchard.seeds.filter((s) => {
  const name = String(s.name);
  const src = (s as { source?: { subdir?: string } }).source;
  const subdir = src?.subdir ?? "";
  return !subdir.startsWith("seeds/") || !SEED_SPECS.some((sp) => sp.name === name);
});
const fresh: Array<Record<string, unknown>> = SEED_SPECS.map((s) => ({
  name: s.name,
  version: "0.1.0",
  description: s.description,
  author: "Passio team",
  authorUrl: "https://github.com/alexandergese",
  tags: s.tags ?? [],
  category: s.category ?? "other",
  priceCents: 0,
  currency: "usd",
  licenseRequired: false,
  featured: s.featured ?? false,
  source: {
    type: "github",
    repo: "alexandergese/passio",
    ref: "main",
    subdir: `seeds/${s.name}`,
  },
}));
const orchard = {
  $schema: "passio-orchard@1",
  updated: new Date().toISOString().slice(0, 10),
  seeds: [...keepExternal, ...fresh],
};
writeFileSync(ORCHARD, JSON.stringify(orchard, null, 2) + "\n");
console.log(`orchard index rewritten (${orchard.seeds.length} entries)`);

function buildManifest(spec: SeedSpec): string {
  const manifest: Record<string, unknown> = {
    $schema: "passio-seed@1",
    name: spec.name,
    version: "0.1.0",
    description: spec.description,
    author: "Passio team",
    entry: "./index.js",
    language: "js",
    permissions: spec.permissions ?? {},
    contributes: spec.contributes ?? {},
  };
  return JSON.stringify(manifest, null, 2);
}
