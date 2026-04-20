"use client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import type { OrchardEntry } from "@/lib/docs";

const ICONS: Record<string, string> = {
  productivity: "✓",
  mail: "✉",
  news: "🗞",
  developer: "⚙",
  research: "🔬",
  fun: "🎈",
  widget: "📊",
  other: "🌱",
};

export function SeedCard({ s }: { s: OrchardEntry }) {
  const paid = s.priceCents > 0;
  return (
    <Card className="group relative overflow-hidden transition-colors hover:border-primary/50">
      <CardContent className="flex flex-col gap-3 p-4 pb-4">
        <div className="flex items-start gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-base">
            {ICONS[s.category] ?? "🌱"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className="truncate font-semibold text-foreground">{s.name}</p>
              <span className="text-[10px] text-muted-foreground">v{s.version}</span>
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
          </div>
          <Badge variant={paid ? "paid" : "free"}>{formatPrice(s.priceCents, s.currency)}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-[10px]">
          {s.tags.slice(0, 4).map((t) => (
            <span key={t} className="chip">
              #{t}
            </span>
          ))}
        </div>
        <div className="mt-auto flex gap-2">
          {paid && s.checkoutUrl ? (
            <>
              <Button asChild size="sm" variant="accent" className="flex-1">
                <a href={s.checkoutUrl} target="_blank" rel="noreferrer">Buy {formatPrice(s.priceCents, s.currency)}</a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={`https://github.com/alexandergese/passio/tree/main/seeds/${s.name}`} target="_blank" rel="noreferrer">Source</a>
              </Button>
            </>
          ) : (
            <>
              <Button asChild size="sm" variant="default" className="flex-1">
                <a href={`https://github.com/alexandergese/passio/tree/main/seeds/${s.name}`} target="_blank" rel="noreferrer">Source</a>
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
