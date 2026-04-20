import Link from "next/link";
import { SproutMark } from "@/components/sprout-mark";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="container grid gap-8 py-10 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <SproutMark className="h-6 w-6" />
            <span className="font-serif text-base">Passio</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground max-w-[240px]">
            A local-first desktop AI assistant, passionfruit-shaped. Remembers, plans, and grows via Seeds.
          </p>
        </div>
        <FooterCol title="Docs" items={[["Getting started", "/docs/getting-started"], ["Architecture", "/docs/architecture"], ["User guide", "/docs/user-guide"], ["Auto-loop", "/docs/auto-loop"], ["Hotkeys", "/docs/hotkeys"], ["Settings", "/docs/settings"], ["Troubleshooting", "/docs/troubleshooting"]]} />
        <FooterCol title="Seeds" items={[["Browse all", "/seeds"], ["Install a seed", "/docs/seeds/install"], ["Quickstart for devs", "/docs/seeds/quickstart"], ["Manifest reference", "/docs/seeds/manifest"], ["Runtime API", "/docs/seeds/api"], ["Sell a seed", "/docs/seeds/selling-seeds"]]} />
        <FooterCol title="Links" items={[["GitHub", "https://github.com/alexandergese/passio"], ["Orchard", "/seeds"], ["Mobile PWA", "/docs/mobile"], ["Browser extension", "/docs/extension"]]} />
      </div>
      <div className="border-t border-border/60 py-4 text-center text-[11px] text-muted-foreground">
        © 2026 Alexander Gese · Passio is MIT-licensed · local-first forever
      </div>
    </footer>
  );
}

function FooterCol({ title, items }: { title: string; items: Array<[string, string]> }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-passion-pulpBright">{title}</p>
      <ul className="space-y-1.5 text-sm">
        {items.map(([label, href]) => (
          <li key={href}>
            {href.startsWith("http") ? (
              <a href={href} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">{label}</a>
            ) : (
              <Link href={href} className="text-muted-foreground hover:text-foreground">{label}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
