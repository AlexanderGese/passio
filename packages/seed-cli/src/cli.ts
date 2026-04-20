#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { SeedManifestSchema } from "@passio/shared";

/**
 * passio-seed — scaffolder / builder for Seeds.
 *
 * Commands:
 *   passio-seed init <name>            scaffold a new seed in ./<name>/
 *   passio-seed build [path]           hash + create dist/<name>.seed descriptor
 *   passio-seed dev [path]             instruct the running sidecar to watch this folder
 */

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "init":
    init(args[0]);
    break;
  case "build":
    build(args[0] ?? ".");
    break;
  case "dev":
    dev(args[0] ?? ".");
    break;
  case "help":
  case "--help":
  case "-h":
  case undefined:
    help();
    break;
  default:
    console.error(`unknown command: ${cmd}`);
    help();
    process.exit(2);
}

function help() {
  console.log(`passio-seed — Passio plugin scaffolder

  passio-seed init <name>         scaffold a new seed
  passio-seed build [path]        produce dist/<name>.seed from a seed folder
  passio-seed dev   [path]        ask the running sidecar to watch this folder
`);
}

function init(name?: string) {
  if (!name) {
    console.error("usage: passio-seed init <name>");
    process.exit(2);
  }
  const dir = resolve(name);
  if (existsSync(dir)) {
    console.error(`already exists: ${dir}`);
    process.exit(1);
  }
  mkdirSync(dir, { recursive: true });
  const manifest = {
    $schema: "passio-seed@1",
    name,
    version: "0.1.0",
    description: `A new Passio seed.`,
    author: "@you",
    entry: "./index.js",
    language: "js",
    permissions: {},
    contributes: {
      tools: ["ping"],
      tabs: [{ id: `${name}-panel`, title: name, icon: "🌱", panel: "./panel.js" }],
    },
  };
  writeFileSync(join(dir, "seed.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(
    join(dir, "index.js"),
    `/** @param {any} passio */
export default async function init(passio) {
  passio.log("${name} booted");
  await passio.tools.register({
    name: "ping",
    description: "Say hi.",
    execute: async () => ({ pong: true, at: new Date().toISOString() }),
  });
}
`,
  );
  writeFileSync(
    join(dir, "panel.js"),
    `class Panel extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  connectedCallback() {
    this.shadowRoot.innerHTML = '<h3 style="color:#ff6b9d">🌱 ${name}</h3><button id="p">ping</button><pre id="o"></pre>';
    this.shadowRoot.getElementById("p").onclick = async () => {
      const r = await window.passio.invoke("ping", {});
      this.shadowRoot.getElementById("o").textContent = JSON.stringify(r, null, 2);
    };
  }
}
customElements.define("${name}-panel", Panel);
`,
  );
  writeFileSync(
    join(dir, "README.md"),
    `# ${name}

A Passio seed.

## Develop
\`\`\`
passio-seed dev .
\`\`\`

## Build
\`\`\`
passio-seed build .
\`\`\`

Publishes \`dist/${name}.seed\` — share that file or commit its pointer.
`,
  );
  console.log(`🌱 scaffolded ${dir}
  next:
    cd ${name}
    passio-seed dev .
`);
}

function build(path: string) {
  const dir = resolve(path);
  const manifestPath = join(dir, "seed.json");
  if (!existsSync(manifestPath)) {
    console.error(`no seed.json in ${dir}`);
    process.exit(1);
  }
  const manifest = SeedManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
  const sha = hashDir(dir);
  const repo = detectGitRepo(dir) ?? "OWNER/REPO";
  const ref = detectGitRef(dir) ?? "main";
  const descriptor = {
    $schema: "passio-seed@1",
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    source: { type: "github" as const, repo, ref },
    sha256: sha,
  };
  const outDir = join(dir, "dist");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${manifest.name}.seed`);
  writeFileSync(outFile, JSON.stringify(descriptor, null, 2) + "\n");
  console.log(`→ ${outFile}
  sha256: ${sha}
  source: github:${repo}@${ref}
`);
}

async function dev(path: string) {
  const dir = resolve(path);
  const port = Number(process.env.PASSIO_BRIDGE_PORT ?? 31763);
  const tokenFile = process.env.HOME ? `${process.env.HOME}/.config/passio/bridge-token` : null;
  if (!tokenFile || !existsSync(tokenFile)) {
    console.error("couldn't find ~/.config/passio/bridge-token — is Passio running?");
    process.exit(1);
  }
  const token = readFileSync(tokenFile, "utf8").trim();
  const res = await fetch(`http://127.0.0.1:${port}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-passio-token": token },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "passio.seed.devStart",
      params: { path: dir },
    }),
  });
  const body = await res.json();
  if (body.error) {
    console.error(`⚠ ${body.error.message}`);
    process.exit(1);
  }
  console.log(`watching ${dir} — Passio will reload on change`);
}

function hashDir(root: string): string {
  const h = createHash("sha256");
  const walk = (dir: string) => {
    for (const e of readdirSync(dir).sort()) {
      if (e === "dist" || e === "node_modules" || e.startsWith(".")) continue;
      const p = join(dir, e);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else h.update(`${e}:${readFileSync(p)}`);
    }
  };
  walk(root);
  return h.digest("hex");
}

function detectGitRepo(dir: string): string | null {
  try {
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const url = execSync("git config --get remote.origin.url", { cwd: dir, encoding: "utf8" }).trim();
    const m = url.match(/github\.com[/:]([^/]+\/[^/.\s]+)(?:\.git)?$/);
    return m ? m[1]! : null;
  } catch {
    return null;
  }
}
function detectGitRef(dir: string): string | null {
  try {
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    return execSync("git rev-parse --abbrev-ref HEAD", { cwd: dir, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}
