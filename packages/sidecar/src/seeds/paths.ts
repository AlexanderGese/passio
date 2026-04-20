import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

/**
 * Well-known filesystem locations for installed Seeds. Every seed lives
 * at <root>/<name>/ and carries a seed.json manifest at its root.
 */

export function seedsRoot(): string {
  const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  const root = join(xdg, "passio", "seeds");
  mkdirSync(root, { recursive: true });
  return root;
}

export function seedDir(name: string): string {
  return join(seedsRoot(), name);
}
