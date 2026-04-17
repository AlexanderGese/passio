#!/usr/bin/env bun
/**
 * Chrome extension build:
 *   1. Bundle each entrypoint (background / content / popup / options) with Bun.
 *   2. Copy public/ (manifest + HTML + icons) verbatim into dist/.
 *   3. --watch rebuilds on change for dev.
 */
import { watch } from "node:fs";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const HERE = resolve(import.meta.dir);
const DIST = resolve(HERE, "dist");
const WATCH = process.argv.includes("--watch");

const ENTRIES = [
  { entry: "src/background.ts", out: "background.js" },
  { entry: "src/content.ts", out: "content.js" },
  { entry: "src/popup.ts", out: "popup.js" },
  { entry: "src/options.ts", out: "options.js" },
] as const;

async function build() {
  if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  for (const { entry, out } of ENTRIES) {
    const result = await Bun.build({
      entrypoints: [resolve(HERE, entry)],
      outdir: DIST,
      target: "browser",
      format: "esm",
      minify: false,
      sourcemap: WATCH ? "inline" : "none",
      naming: { entry: out },
    });
    if (!result.success) {
      console.error(`✗ ${entry}`);
      for (const log of result.logs) console.error(log);
      process.exit(1);
    }
  }
  // Copy static assets last so manifest is always present
  cpSync(resolve(HERE, "public"), DIST, { recursive: true });
  console.log(`✓ extension built → ${DIST}`);
}

await build();

if (WATCH) {
  console.log("watching for changes…");
  watch(resolve(HERE, "src"), { recursive: true }, async (event, file) => {
    if (!file) return;
    console.log(`change: ${event} ${file}`);
    try {
      await build();
    } catch (e) {
      console.error(e);
    }
  });
  watch(resolve(HERE, "public"), { recursive: true }, async (event, file) => {
    if (!file) return;
    console.log(`change: ${event} public/${file}`);
    try {
      await build();
    } catch (e) {
      console.error(e);
    }
  });
}
