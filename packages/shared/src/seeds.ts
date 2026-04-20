import { z } from "zod";

/**
 * Seed manifest — ships inside every installed seed as `seed.json` at its
 * root. The `.seed` descriptor file is a slim pointer that resolves to a
 * real manifest once installed.
 */

export const SeedPermissionsSchema = z
  .object({
    network: z.array(z.string()).optional(), // host allowlist e.g. ["api.spotify.com"]
    secrets: z.array(z.string()).optional(), // named secrets the seed may read/write
    trusted: z.boolean().optional(), // opt-in escape hatch (runs unsandboxed)
    shell: z.boolean().optional(), // not used in v1 — reserved
  })
  .strict();
export type SeedPermissions = z.infer<typeof SeedPermissionsSchema>;

export const SeedContributesSchema = z
  .object({
    tools: z.array(z.string()).optional(),
    tabs: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          icon: z.string().optional(),
          panel: z.string(), // relative path to a .js web-component bundle
          // When true, this tab is promoted to the HUD's main nav bar
          // alongside Chat/Do/Know/Pulse/Grow/Settings. Only set this for
          // seeds you'd actually open multiple times a day; the nav bar is
          // cramped.
          promoteToMainTab: z.boolean().optional(),
        }),
      )
      .optional(),
    widgets: z
      .array(
        z.object({
          id: z.string(),
          slot: z.enum(["header", "corner"]).default("header"),
          panel: z.string(),
        }),
      )
      .optional(),
    hotkeys: z
      .array(
        z.object({
          id: z.string(),
          default: z.string(), // e.g. "Super+Shift+M"
          label: z.string().optional(),
        }),
      )
      .optional(),
    scheduler: z
      .array(
        z.object({
          id: z.string(),
          every_seconds: z.number().int().positive(),
        }),
      )
      .optional(),
    events: z
      .array(z.enum(["chat", "scan", "activity", "bubble_state", "hotkey"]))
      .optional(),
    settings: z
      .array(
        z.object({
          id: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
          label: z.string(),
          description: z.string().optional(),
          type: z.enum(["string", "number", "boolean", "select", "secret"]),
          default: z.unknown().optional(),
          options: z.array(z.string()).optional(), // for `select`
          min: z.number().optional(),
          max: z.number().optional(),
          step: z.number().optional(),
        }),
      )
      .optional(),
  })
  .strict();
export type SeedContributes = z.infer<typeof SeedContributesSchema>;

export const SeedManifestSchema = z
  .object({
    $schema: z.string().optional(),
    name: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "lowercase kebab-case, 2+ chars")
      .min(2)
      .max(48),
    version: z.string().regex(/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/),
    description: z.string().max(280),
    author: z.string().optional(),
    homepage: z.string().url().optional(),
    entry: z.string().default("./index.js"),
    language: z.enum(["js", "ts", "wasm"]).default("js"),
    permissions: SeedPermissionsSchema.default({}),
    contributes: SeedContributesSchema.default({}),
    minHost: z.string().optional(),
    // Monetization — when true, the runtime requires a valid ed25519-signed
    // license blob in the seed's settings (`license`) before it will start.
    licensed: z.boolean().optional(),
    // Public ed25519 key (base64) used to verify license signatures.
    licensePublicKey: z.string().optional(),
  })
  .strict();
export type SeedManifest = z.infer<typeof SeedManifestSchema>;

// --- Orchard (Passio's curated Seed registry) -------------------------------

export const OrchardEntrySchema = z
  .object({
    name: z.string(),
    version: z.string(),
    description: z.string(),
    author: z.string(),
    authorUrl: z.string().url().optional(),
    homepage: z.string().url().optional(),
    tags: z.array(z.string()).default([]),
    category: z
      .enum([
        "productivity",
        "mail",
        "news",
        "developer",
        "research",
        "fun",
        "widget",
        "other",
      ])
      .default("other"),
    priceCents: z.number().int().nonnegative().default(0),
    currency: z.string().default("usd"),
    checkoutUrl: z.string().url().optional(),
    licenseRequired: z.boolean().default(false),
    featured: z.boolean().default(false),
    source: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("github"),
        repo: z.string(),
        ref: z.string().default("main"),
        subdir: z.string().optional(),
      }),
      z.object({ type: z.literal("tarball"), url: z.string().url() }),
    ]),
    sha256: z.string().optional(),
    screenshots: z.array(z.string().url()).optional(),
  })
  .strict();
export type OrchardEntry = z.infer<typeof OrchardEntrySchema>;

export const OrchardIndexSchema = z
  .object({
    $schema: z.literal("passio-orchard@1"),
    updated: z.string(),
    seeds: z.array(OrchardEntrySchema),
  })
  .strict();
export type OrchardIndex = z.infer<typeof OrchardIndexSchema>;

// --- License payload (ed25519-signed) --------------------------------------

export const LicensePayloadSchema = z.object({
  seed: z.string(),
  buyer: z.string(),
  issuedAt: z.string(),
  expiresAt: z.string().optional(),
});
export type LicensePayload = z.infer<typeof LicensePayloadSchema>;

/**
 * `.seed` descriptor — the file the user double-clicks to install. It's a
 * tiny pointer (typically <1 KB). On open, the host fetches the actual
 * seed from `source`, validates its manifest, shows the permission prompt,
 * and extracts to `~/.config/passio/seeds/<name>/`.
 */
export const SeedDescriptorSchema = z
  .object({
    $schema: z.literal("passio-seed@1"),
    name: z.string(),
    version: z.string(),
    description: z.string().optional(),
    author: z.string().optional(),
    source: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("github"),
        repo: z.string().regex(/^[^\s/]+\/[^\s/]+$/), // owner/repo
        ref: z.string().default("main"),
        subdir: z.string().optional(),
      }),
      z.object({
        type: z.literal("tarball"),
        url: z.string().url(),
      }),
      z.object({
        type: z.literal("local"),
        path: z.string(),
      }),
    ]),
    sha256: z.string().optional(),
  })
  .strict();
export type SeedDescriptor = z.infer<typeof SeedDescriptorSchema>;

/** Message envelope between host and seed worker. */
export type SeedBridgeMessage =
  | { kind: "hello"; seedId: string; permissions: SeedPermissions; settings: unknown }
  | { kind: "rpc.call"; id: string; method: string; params: unknown }
  | { kind: "rpc.reply"; id: string; result?: unknown; error?: string }
  | { kind: "event"; event: string; payload: unknown }
  | { kind: "tool.invoke"; id: string; tool: string; args: unknown }
  | { kind: "tool.result"; id: string; result?: unknown; error?: string }
  | { kind: "log"; level: "info" | "warn" | "error"; args: unknown[] };
