import { createPublicKey, verify } from "node:crypto";
import { LicensePayloadSchema, type LicensePayload } from "@passio/shared";

/**
 * ed25519 license verification. Author publishes their public key inside
 * the Seed manifest (`licensePublicKey`). After a purchase they generate
 * a signed payload via the `license-gen` CLI and email it to the buyer,
 * who pastes it into Passio's seed settings. No network call needed.
 *
 * Encoding: `<base64url(payload json)>.<base64url(signature)>`
 */

export type LicenseVerification =
  | { ok: true; payload: LicensePayload }
  | { ok: false; reason: string };

export function verifyLicense(
  license: string,
  seedName: string,
  publicKeyB64: string,
): LicenseVerification {
  const parts = license.trim().split(".");
  if (parts.length !== 2) return { ok: false, reason: "license must be <payload>.<sig>" };
  const [payloadB64, sigB64] = parts;
  let payloadJson: string;
  let sig: Buffer;
  try {
    payloadJson = Buffer.from(payloadB64!, "base64url").toString("utf8");
    sig = Buffer.from(sigB64!, "base64url");
  } catch {
    return { ok: false, reason: "license not base64url" };
  }
  let payload: LicensePayload;
  try {
    payload = LicensePayloadSchema.parse(JSON.parse(payloadJson));
  } catch (err) {
    return { ok: false, reason: `malformed payload: ${(err as Error).message}` };
  }
  if (payload.seed !== seedName) {
    return { ok: false, reason: `license is for '${payload.seed}', not '${seedName}'` };
  }
  if (payload.expiresAt && new Date(payload.expiresAt).getTime() < Date.now()) {
    return { ok: false, reason: "license expired" };
  }
  let pubKey;
  try {
    pubKey = createPublicKey({
      key: Buffer.from(publicKeyB64, "base64"),
      format: "der",
      type: "spki",
    });
  } catch {
    // Try raw 32-byte key format too.
    try {
      const raw = Buffer.from(publicKeyB64, "base64");
      if (raw.length !== 32) throw new Error("not raw ed25519");
      const spki = Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"),
        raw,
      ]);
      pubKey = createPublicKey({ key: spki, format: "der", type: "spki" });
    } catch {
      return { ok: false, reason: "bad public key format" };
    }
  }
  const valid = verify(null, Buffer.from(payloadJson), pubKey, sig);
  if (!valid) return { ok: false, reason: "signature invalid" };
  return { ok: true, payload };
}
