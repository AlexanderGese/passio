import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SproutMark } from "@/components/sprout-mark";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="container flex h-14 items-center gap-4">
        <Link href="/" className="flex items-center gap-2">
          <SproutMark className="h-7 w-7" />
          <span className="font-serif text-lg">Passio</span>
        </Link>
        <nav className="hidden items-center gap-5 text-sm md:flex">
          <Link href="/docs" className="text-muted-foreground hover:text-foreground">Docs</Link>
          <Link href="/seeds" className="text-muted-foreground hover:text-foreground">Seeds</Link>
          <Link href="/docs/seeds/selling-seeds" className="text-muted-foreground hover:text-foreground">Sell</Link>
          <Link href="/docs/architecture" className="text-muted-foreground hover:text-foreground">Architecture</Link>
          <Link href="/docs/privacy" className="text-muted-foreground hover:text-foreground">Privacy</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <a href="https://github.com/alexandergese/passio" target="_blank" rel="noreferrer">GitHub</a>
          </Button>
          <Button asChild size="sm" variant="accent">
            <Link href="/docs/getting-started">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
