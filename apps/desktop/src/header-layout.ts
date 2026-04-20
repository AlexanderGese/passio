/**
 * Header-strip layout. The chips that sit in the bubble header are all
 * individually pinnable + reorderable. The user's layout persists to a
 * sidecar setting so it survives restarts.
 *
 *   id: "builtin:<name>" for core chips
 *   id: "seed:<seedName>:<widgetId>" for seed-contributed widgets
 */

export type HeaderItemId = string;

export interface HeaderEntry {
  id: HeaderItemId;
  visible: boolean;
}

export const BUILTIN_HEADER_IDS = [
  "builtin:weather",
  "builtin:calendar",
  "builtin:mail",
  "builtin:pomodoro",
  "builtin:what-next",
  "builtin:spotlight",
  "builtin:auto-speak",
  "builtin:posture",
] as const;

export const DEFAULT_HEADER_LAYOUT: HeaderEntry[] = BUILTIN_HEADER_IDS.map((id) => ({
  id,
  visible: true,
}));

export function seedWidgetId(seedName: string, widgetId: string): HeaderItemId {
  return `seed:${seedName}:${widgetId}`;
}

export function parseId(
  id: HeaderItemId,
): { kind: "builtin"; name: string } | { kind: "seed"; seed: string; widget: string } {
  if (id.startsWith("seed:")) {
    const [, seed, widget] = id.split(":");
    return { kind: "seed", seed: seed ?? "", widget: widget ?? "" };
  }
  const [, name] = id.split(":");
  return { kind: "builtin", name: name ?? "" };
}

/**
 * Merge the persisted layout with the live set of known items. New seed
 * widgets get appended as hidden by default so they don't clobber the
 * user's carefully-curated header on a fresh install.
 */
export function reconcileLayout(
  persisted: HeaderEntry[] | null,
  available: HeaderItemId[],
): HeaderEntry[] {
  const known = new Set(available);
  const byId = new Map<HeaderItemId, HeaderEntry>();
  for (const e of persisted ?? DEFAULT_HEADER_LAYOUT) byId.set(e.id, e);
  const out: HeaderEntry[] = [];
  // Keep persisted order first
  for (const e of persisted ?? DEFAULT_HEADER_LAYOUT) {
    if (known.has(e.id)) out.push(e);
  }
  // Append anything new as hidden — user opts in
  for (const id of available) {
    if (!byId.has(id)) out.push({ id, visible: false });
  }
  // Make sure all built-ins are present; append at end if user removed them
  for (const id of BUILTIN_HEADER_IDS) {
    if (!out.find((e) => e.id === id)) out.push({ id, visible: true });
  }
  return out;
}
