import { z } from "zod";

/**
 * User-configurable settings. Persisted in SQLite `settings` table
 * (key/value with JSON values). This schema is the source of truth.
 */

export const ProactiveMode = z.enum(["check-in", "active-assist", "summary-decide"]);
export type ProactiveMode = z.infer<typeof ProactiveMode>;

export const ContextPack = z.enum(["work", "study", "chill", "custom"]);
export type ContextPack = z.infer<typeof ContextPack>;

export const DockPosition = z.enum([
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "left-edge",
  "right-edge",
]);
export type DockPosition = z.infer<typeof DockPosition>;

export const Provider = z.enum(["openai", "anthropic"]);
export type Provider = z.infer<typeof Provider>;

export const ModelTier = z.enum(["economy", "standard", "power"]);
export type ModelTier = z.infer<typeof ModelTier>;

export const Settings = z.object({
  // General
  proactiveIntervalMinutes: z.number().int().min(5).max(60).default(10),
  proactiveMode: ProactiveMode.default("check-in"),
  autoStartOnLogin: z.boolean().default(true),
  dockPosition: DockPosition.default("bottom-right"),
  bubbleOpacity: z.number().min(0.3).max(1).default(0.7),
  bubbleSizePx: z.number().int().min(40).max(120).default(60),
  activeContextPack: ContextPack.default("work"),

  // Models
  provider: Provider.default("openai"),
  modelEconomy: z.string().default("openai/gpt-4o-mini"),
  modelStandard: z.string().default("openai/gpt-4.1"),
  modelPower: z.string().default("openai/gpt-5"),
  modelStt: z.string().default("openai/whisper-1"),
  modelTts: z.string().default("openai/tts-1-hd"),
  modelEmbed: z.string().default("openai/text-embedding-3-small"),

  // Cost
  monthlySoftCapUsd: z.number().default(20),

  // Sidecar
  sidecarIdleTimeoutSec: z.number().int().min(30).max(600).default(90),
  keepSidecarWarm: z.boolean().default(false),

  // Privacy
  screenshotRetentionDays: z.number().int().min(0).default(7),
  eventRetentionDays: z.number().int().min(1).default(30),
  encryptDb: z.boolean().default(false),
  telemetry: z.literal(false).default(false),

  // Obsidian
  obsidianVaultPath: z.string().nullable().default(null),
  obsidianMirrorNotes: z.boolean().default(true),
  obsidianAppendDailyRecap: z.boolean().default(true),

  // File index
  fileIndexRoots: z.array(z.string()).default([]),
  fileIndexEnabled: z.boolean().default(true),

  // Activity tracking
  activityTrackingEnabled: z.boolean().default(false),

  // Voice
  voiceOutputMode: z.enum(["text", "voice", "both"]).default("both"),

  // DND
  dndUntil: z.string().nullable().default(null), // ISO timestamp
});
export type Settings = z.infer<typeof Settings>;

export const defaultSettings: Settings = Settings.parse({});
