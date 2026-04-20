import { Badge } from "@/components/ui/badge";
import { readOrchard } from "@/lib/docs";
import { SeedsBrowser } from "./seeds-browser";

export const dynamic = "force-static";

export default function SeedsPage() {
  const seeds = readOrchard();
  const paid = seeds.filter((s) => s.priceCents > 0).length;
  const free = seeds.length - paid;
  return (
    <div className="container py-10">
      <div className="mb-8">
        <Badge variant="accent" className="mb-2">🌱 Orchard</Badge>
        <h1 className="font-serif text-4xl tracking-tight md:text-5xl">Every seed in the Orchard</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {seeds.length} curated plugins. {free} free · {paid} paid. Every one is sandboxed, permission-declared, and installable in Passio's Grow tab.
        </p>
      </div>
      <SeedsBrowser seeds={seeds} />
    </div>
  );
}
