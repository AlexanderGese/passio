import { createHash } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import type { SeedDescriptor, SeedManifest } from "@passio/shared";
import { readManifestFromDir, saveSeed } from "./registry.js";
import { seedDir, seedsRoot } from "./paths.js";
import type { Db } from "../db/client.js";

/**
 * Resolves a .seed descriptor to a concrete local folder at seedDir(name),
 * extracts + validates its manifest, then persists it in the registry.
 * The caller is responsible for showing the permission prompt *before*
 * handing the descriptor to install — we assume consent by this point.
 */

export async function installFromDescriptor(
  db: Db,
  desc: SeedDescriptor,
): Promise<{ name: string; version: string; manifest: SeedManifest }> {
  const target = seedDir(desc.name);
  const staging = join(tmpdir(), `passio-seed-${desc.name}-${Date.now()}`);
  mkdirSync(staging, { recursive: true });

  try {
    if (desc.source.type === "github") {
      await fetchGitHub(desc.source.repo, desc.source.ref, desc.source.subdir, staging);
    } else if (desc.source.type === "tarball") {
      await fetchTarball(desc.source.url, staging);
    } else if (desc.source.type === "local") {
      cpSync(desc.source.path, staging, { recursive: true });
    }
    const manifest = readManifestFromDir(staging);
    if (manifest.name !== desc.name) {
      throw new Error(
        `manifest name mismatch: descriptor says '${desc.name}', manifest says '${manifest.name}'`,
      );
    }
    if (desc.sha256) {
      const actual = hashFolder(staging);
      if (actual !== desc.sha256) {
        throw new Error(`sha256 mismatch: descriptor expected ${desc.sha256}, got ${actual}`);
      }
    }
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    mkdirSync(dirname(target), { recursive: true });
    cpSync(staging, target, { recursive: true });
    saveSeed(db, manifest, desc);
    return { name: manifest.name, version: manifest.version, manifest };
  } finally {
    try {
      rmSync(staging, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Install from a local folder — used by `passio-seed dev` and the HUD's
 * "Install from folder" button for sideloading during development.
 */
export async function installFromLocalPath(
  db: Db,
  sourcePath: string,
): Promise<{ name: string; version: string; manifest: SeedManifest }> {
  const manifest = readManifestFromDir(sourcePath);
  const target = seedDir(manifest.name);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(sourcePath, target, { recursive: true });
  saveSeed(db, manifest, { type: "local", path: sourcePath });
  return { name: manifest.name, version: manifest.version, manifest };
}

/**
 * Best-effort GitHub tarball fetch. We prefer `git` if available for
 * private repos / commit refs; otherwise fall back to the codeload tarball.
 */
async function fetchGitHub(
  repo: string,
  ref: string,
  subdir: string | undefined,
  staging: string,
): Promise<void> {
  const git = spawnSync("git", ["--version"], { stdio: "ignore" });
  if (git.status === 0) {
    const tmpClone = `${staging}-git`;
    const clone = spawnSync("git", ["clone", "--depth", "1", `https://github.com/${repo}.git`, tmpClone], {
      stdio: "ignore",
    });
    if (clone.status === 0) {
      if (ref !== "main" && ref !== "master") {
        spawnSync("git", ["-C", tmpClone, "fetch", "--depth", "1", "origin", ref], { stdio: "ignore" });
        spawnSync("git", ["-C", tmpClone, "checkout", ref], { stdio: "ignore" });
      }
      const src = subdir ? join(tmpClone, subdir) : tmpClone;
      cpSync(src, staging, { recursive: true });
      rmSync(tmpClone, { recursive: true, force: true });
      rmSync(join(staging, ".git"), { recursive: true, force: true });
      return;
    }
  }
  // Fallback to codeload tarball
  const tarUrl = `https://codeload.github.com/${repo}/tar.gz/${ref}`;
  await fetchTarball(tarUrl, staging, subdir);
}

async function fetchTarball(url: string, staging: string, subdir?: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  if (!res.body) throw new Error("empty body");
  const tarFile = join(tmpdir(), `passio-seed-${Date.now()}.tar.gz`);
  const nodeStream = Readable.fromWeb(res.body as unknown as import("node:stream/web").ReadableStream<Uint8Array>);
  const { writeFile } = await import("node:fs/promises");
  const chunks: Buffer[] = [];
  for await (const chunk of nodeStream) chunks.push(chunk as Buffer);
  await writeFile(tarFile, Buffer.concat(chunks));
  // tar xf — strip the top-level directory that GitHub/gzip tarballs add
  const extract = spawnSync("tar", ["xzf", tarFile, "-C", staging, "--strip-components=1"], {
    stdio: "ignore",
  });
  if (extract.status !== 0) throw new Error("tar extraction failed");
  try {
    rmSync(tarFile, { force: true });
  } catch {
    /* ignore */
  }
  if (subdir) {
    const sub = join(staging, subdir);
    if (!existsSync(sub)) throw new Error(`subdir not found in tarball: ${subdir}`);
    const tmp2 = join(tmpdir(), `passio-seed-sub-${Date.now()}`);
    cpSync(sub, tmp2, { recursive: true });
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    cpSync(tmp2, staging, { recursive: true });
    rmSync(tmp2, { recursive: true, force: true });
  }
}

function hashFolder(root: string): string {
  const hash = createHash("sha256");
  const walk = (dir: string) => {
    const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
    const entries = readdirSync(dir).sort();
    for (const e of entries) {
      const full = join(dir, e);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else hash.update(`${e}:${readFileSync(full)}`);
    }
  };
  walk(root);
  return hash.digest("hex");
}

export function seedsDirectoryHint(): string {
  return seedsRoot();
}

/** Utility for writing a minimal descriptor file — used by the CLI. */
export function writeDescriptorFile(path: string, desc: SeedDescriptor): void {
  writeFileSync(path, `${JSON.stringify(desc, null, 2)}\n`);
}
