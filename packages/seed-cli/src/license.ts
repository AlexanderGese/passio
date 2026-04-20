#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateKeyPairSync, sign } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * license-gen — tiny CLI for paid-seed authors.
 *
 *   license-gen init
 *       Creates an ed25519 keypair at ~/.passio-seed-keys/<name>/.
 *       Prints the base64 public key to paste into your seed.json.
 *
 *   license-gen sign --seed <name> --buyer <email> [--days N]
 *       Signs a license payload with your private key and prints the
 *       license blob (payload.sig) to stdout. Email that to the buyer.
 *
 * One keypair per paid seed is recommended so revoking or rotating a
 * compromised seed doesn't invalidate your other licenses.
 */

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

if (cmd === "init") {
  const name = args._[1];
  if (!name) {
    console.error("usage: license-gen init <seed-name>");
    process.exit(2);
  }
  const dir = keyDir(name);
  if (existsSync(join(dir, "priv.pem"))) {
    console.error(`keys already exist at ${dir} — refusing to overwrite`);
    process.exit(1);
  }
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "priv.pem"),
    privateKey.export({ format: "pem", type: "pkcs8" }) as string,
    { mode: 0o600 },
  );
  writeFileSync(
    join(dir, "pub.pem"),
    publicKey.export({ format: "pem", type: "spki" }) as string,
  );
  const pubDer = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  writeFileSync(join(dir, "pub.b64"), pubDer.toString("base64"));
  console.log(`keys written to ${dir}`);
  console.log("");
  console.log("In your seed.json, set:");
  console.log(`  "licensed": true,`);
  console.log(`  "licensePublicKey": "${pubDer.toString("base64")}"`);
} else if (cmd === "sign") {
  const name = args.seed ?? "";
  const buyer = args.buyer ?? "";
  const days = args.days ? Number(args.days) : null;
  if (!name || !buyer) {
    console.error("usage: license-gen sign --seed <name> --buyer <email> [--days N]");
    process.exit(2);
  }
  const dir = keyDir(name);
  const priv = join(dir, "priv.pem");
  if (!existsSync(priv)) {
    console.error(`no key for '${name}' at ${dir} — run 'license-gen init ${name}' first`);
    process.exit(1);
  }
  const payload: Record<string, string> = {
    seed: name,
    buyer,
    issuedAt: new Date().toISOString(),
  };
  if (days !== null) {
    const exp = new Date();
    exp.setDate(exp.getDate() + days);
    payload.expiresAt = exp.toISOString();
  }
  const payloadJson = JSON.stringify(payload);
  const privKey = {
    key: readFileSync(priv),
    format: "pem" as const,
    type: "pkcs8" as const,
  };
  const sig = sign(null, Buffer.from(payloadJson), privKey);
  const b64url = (b: Buffer | string) =>
    Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const license = `${b64url(payloadJson)}.${b64url(sig)}`;
  console.log(license);
  console.error(
    `\n✓ license for ${buyer} (${name})${days ? ` · expires in ${days}d` : " · perpetual"}`,
  );
} else {
  help();
  process.exit(cmd ? 2 : 0);
}

function help() {
  console.log(`license-gen — ed25519 license generator for paid Passio Seeds

  license-gen init <seed-name>                           generate a keypair
  license-gen sign --seed <name> --buyer <email>         perpetual license
  license-gen sign --seed <name> --buyer <email> --days 30   30-day license
`);
}

function parseArgs(argv: string[]): { _: string[]; [k: string]: string | string[] } {
  const out: { _: string[]; [k: string]: string | string[] } = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = "true";
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function keyDir(name: string): string {
  return join(homedir(), ".passio-seed-keys", name);
}
