"use client";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SeedCard } from "@/components/seed-card";
import type { OrchardEntry } from "@/lib/docs";

const CATEGORIES = [
  "all",
  "productivity",
  "mail",
  "news",
  "developer",
  "research",
  "widget",
  "fun",
  "other",
] as const;

export function SeedsBrowser({ seeds }: { seeds: OrchardEntry[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("all");
  const [tier, setTier] = useState<"all" | "free" | "paid">("all");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return seeds.filter((s) => {
      if (cat !== "all" && s.category !== cat) return false;
      if (tier === "free" && s.priceCents > 0) return false;
      if (tier === "paid" && s.priceCents === 0) return false;
      if (!query) return true;
      return (
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        s.tags.some((t) => t.toLowerCase().includes(query))
      );
    });
  }, [seeds, q, cat, tier]);

  const featured = filtered.filter((s) => s.featured);
  const rest = filtered.filter((s) => !s.featured);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Input
          placeholder="search seeds by name, description, or tag…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-md"
        />
        <div className="flex items-center gap-1">
          {(["all", "free", "paid"] as const).map((t) => (
            <Button key={t} size="sm" variant={tier === t ? "accent" : "outline"} onClick={() => setTier(t)}>
              {t}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {CATEGORIES.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={cat === c ? "default" : "outline"}
              className={cn("capitalize", cat === c ? "" : "text-muted-foreground")}
              onClick={() => setCat(c)}
            >
              {c}
            </Button>
          ))}
        </div>
      </div>

      {featured.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-passion-pulpBright">Featured</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((s) => (
              <SeedCard key={s.name} s={s} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {rest.length === filtered.length ? "All" : "Everything else"} · {rest.length}
        </h2>
        {rest.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">no seeds match</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((s) => (
              <SeedCard key={s.name} s={s} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
