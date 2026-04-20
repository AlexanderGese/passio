"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type NavGroup = { label: string; items: Array<{ label: string; href: string }> };

const GROUPS: NavGroup[] = [
  {
    label: "Start",
    items: [
      { label: "Overview", href: "/docs" },
      { label: "Getting started", href: "/docs/getting-started" },
      { label: "User guide", href: "/docs/user-guide" },
      { label: "Hotkeys", href: "/docs/hotkeys" },
      { label: "Settings", href: "/docs/settings" },
      { label: "Troubleshooting", href: "/docs/troubleshooting" },
    ],
  },
  {
    label: "Deep",
    items: [
      { label: "Architecture", href: "/docs/architecture" },
      { label: "Auto-loop", href: "/docs/auto-loop" },
      { label: "Obsidian", href: "/docs/obsidian" },
      { label: "Privacy", href: "/docs/privacy" },
      { label: "Mobile PWA", href: "/docs/mobile" },
      { label: "Browser extension", href: "/docs/extension" },
    ],
  },
  {
    label: "Seeds",
    items: [
      { label: "Browse the Orchard", href: "/seeds" },
      { label: "What are seeds?", href: "/docs/seeds" },
      { label: "Install a seed", href: "/docs/seeds/install" },
      { label: "Permissions", href: "/docs/seeds/permissions" },
      { label: "Quickstart (dev)", href: "/docs/seeds/quickstart" },
      { label: "Manifest reference", href: "/docs/seeds/manifest" },
      { label: "Runtime API", href: "/docs/seeds/api" },
      { label: "Panels + widgets", href: "/docs/seeds/panels" },
      { label: "Dev mode", href: "/docs/seeds/dev-mode" },
      { label: "Publishing to Orchard", href: "/docs/seeds/orchard" },
      { label: "Selling paid seeds", href: "/docs/seeds/selling-seeds" },
      { label: "Seed catalog", href: "/docs/seeds/catalog" },
    ],
  },
];

export function DocsSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border/60 md:block">
      <ScrollArea className="h-[calc(100vh-3.5rem)]">
        <nav className="px-4 py-6 text-sm">
          {GROUPS.map((g) => (
            <div key={g.label} className="mb-6">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-passion-pulpBright">{g.label}</p>
              <ul className="space-y-1">
                {g.items.map((it) => {
                  const active = pathname === it.href;
                  return (
                    <li key={it.href}>
                      <Link href={it.href} className={cn("block rounded-md px-2 py-1 transition-colors", active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}>
                        {it.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  );
}
