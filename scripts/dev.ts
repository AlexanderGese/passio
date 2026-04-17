#!/usr/bin/env bun
/**
 * Dev entrypoint: compiles the sidecar to a native binary (so the Tauri
 * core can spawn it), then runs `cargo tauri dev` which in turn runs
 * `bun run dev` for the Vite frontend.
 *
 * The sidecar rebuild is cheap on Bun (< 1s typical) so we do it on every
 * dev launch. For hot-reload during a session, edit and relaunch the app.
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SIDECAR_PKG = resolve(ROOT, "packages/sidecar");
const DESKTOP_APP = resolve(ROOT, "apps/desktop");
const RESOURCES = resolve(DESKTOP_APP, "src-tauri/resources");
const SIDECAR_BIN = resolve(RESOURCES, "passio-sidecar");
const VEC_SO_TARGET = resolve(RESOURCES, "vec0.so");

async function buildSidecar() {
  console.log("→ compiling sidecar to", SIDECAR_BIN);
  const proc = Bun.spawn(
    [
      "bun",
      "build",
      "./src/main.ts",
      "--compile",
      "--target=bun-linux-x64",
      "--outfile",
      SIDECAR_BIN,
    ],
    { cwd: SIDECAR_PKG, stdout: "inherit", stderr: "inherit" },
  );
  const code = await proc.exited;
  if (code !== 0) {
    console.error("sidecar compile failed");
    process.exit(code);
  }
}

/**
 * Copy sqlite-vec's native .so next to the compiled sidecar so the Rust
 * core can point PASSIO_VEC_SO at a stable path in dev + release.
 */
function copyVecExtension() {
  // Bun hoists into node_modules/.bun/<pkg>@<ver>/node_modules/<pkg>/ — so
  // we glob that layout first, then fall back to the classic location.
  const candidates = [
    resolve(ROOT, "node_modules/sqlite-vec-linux-x64/vec0.so"),
    resolve(SIDECAR_PKG, "node_modules/sqlite-vec-linux-x64/vec0.so"),
  ];
  const bunDir = resolve(ROOT, "node_modules/.bun");
  if (existsSync(bunDir)) {
    for (const entry of new Bun.Glob(
      "sqlite-vec-linux-x64@*/node_modules/sqlite-vec-linux-x64/vec0.so",
    ).scanSync({ cwd: bunDir })) {
      candidates.unshift(resolve(bunDir, entry));
    }
  }
  const src = candidates.find((p) => existsSync(p));
  if (!src) {
    console.warn("⚠ vec0.so not found — vector search will be disabled");
    return;
  }
  copyFileSync(src, VEC_SO_TARGET);
  console.log("→ copied vec0.so →", VEC_SO_TARGET);
}

function runTauri() {
  const child = spawn("cargo", ["tauri", "dev"], {
    cwd: DESKTOP_APP,
    stdio: "inherit",
    env: {
      ...process.env,
      PASSIO_SIDECAR_BIN: SIDECAR_BIN,
      PASSIO_VEC_SO: VEC_SO_TARGET,
    },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
}

await buildSidecar();
copyVecExtension();
runTauri();
