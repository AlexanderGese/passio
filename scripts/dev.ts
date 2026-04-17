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
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SIDECAR_PKG = resolve(ROOT, "packages/sidecar");
const DESKTOP_APP = resolve(ROOT, "apps/desktop");
const SIDECAR_BIN = resolve(DESKTOP_APP, "src-tauri/resources/passio-sidecar");

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

function runTauri() {
  const child = spawn("cargo", ["tauri", "dev"], {
    cwd: DESKTOP_APP,
    stdio: "inherit",
    env: { ...process.env, PASSIO_SIDECAR_BIN: SIDECAR_BIN },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
}

await buildSidecar();
runTauri();
