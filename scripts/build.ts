#!/usr/bin/env bun
/**
 * Production build: compile sidecar, then `cargo tauri build` which
 * emits .deb + AppImage into `apps/desktop/src-tauri/target/release/bundle`.
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SIDECAR_PKG = resolve(ROOT, "packages/sidecar");
const DESKTOP_APP = resolve(ROOT, "apps/desktop");
const SIDECAR_BIN = resolve(DESKTOP_APP, "src-tauri/resources/passio-sidecar");

async function buildSidecar() {
  console.log("→ compiling sidecar");
  const proc = Bun.spawn(
    [
      "bun",
      "build",
      "./src/main.ts",
      "--compile",
      "--target=bun-linux-x64",
      "--minify",
      "--outfile",
      SIDECAR_BIN,
    ],
    { cwd: SIDECAR_PKG, stdout: "inherit", stderr: "inherit" },
  );
  const code = await proc.exited;
  if (code !== 0) process.exit(code);
}

function tauriBuild() {
  const child = spawn("cargo", ["tauri", "build"], {
    cwd: DESKTOP_APP,
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

await buildSidecar();
tauriBuild();
