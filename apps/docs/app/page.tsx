import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SproutMark } from "@/components/sprout-mark";
import { readOrchard } from "@/lib/docs";
import { SeedCard } from "@/components/seed-card";

export default function Home() {
  const seeds = readOrchard();
  const featured = seeds.filter((s) => s.featured).slice(0, 6);
  const paidCount = seeds.filter((s) => s.priceCents > 0).length;
  const freeCount = seeds.length - paidCount;

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "radial-gradient(1000px 400px at 80% 10%, rgba(168,85,247,0.18), transparent 60%), radial-gradient(900px 400px at 0% 80%, rgba(255,107,157,0.14), transparent 60%), radial-gradient(600px 300px at 50% 100%, rgba(255,184,77,0.08), transparent 60%)",
          }}
        />
        <div className="container pt-24 pb-20 text-center">
          <Badge variant="accent" className="mx-auto">v2.2.0 · 126 seeds</Badge>
          <h1 className="mx-auto mt-4 max-w-3xl font-serif text-5xl leading-[1.05] tracking-tight md:text-7xl">
            A passionfruit that <span className="text-passion-pulpBright">remembers</span>, <span className="text-passion-skin">plans</span>, and <span className="text-passion-seed">acts</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Passio is a local-first desktop AI assistant — a floating bubble with persistent memory, autonomous loops, Obsidian sync, and a plugin system called Seeds.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" variant="accent">
              <Link href="/docs/getting-started">Get started</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="https://github.com/alexandergese/passio/releases" target="_blank" rel="noreferrer">Download .deb</a>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href="/seeds">Browse {seeds.length} seeds →</Link>
            </Button>
          </div>
          <div className="mx-auto mt-10 max-w-4xl">
            <Card className="panel-glow overflow-hidden border-primary/40">
              <CardContent className="p-0">
                <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <SproutMark className="h-4 w-4" />
                  passio <span className="ml-auto">online · 3ms</span>
                </div>
                <div className="grid gap-1 p-6 text-left font-mono text-[13px] leading-6">
                  <span className="text-passion-pulpBright">$ passio chat</span>
                  <span className="text-passion-cream">what should I focus on this morning?</span>
                  <span className="text-muted-foreground">(opens your bubble, fetches intent, activity, goals, calendar)</span>
                  <span className="text-passion-seed">→ "deadline for the Berlin proposal is 2 days out — I moved it to the top of today's todos and drafted the cover letter in your vault."</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="container py-16">
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="group transition-colors hover:border-primary/40">
              <CardContent className="p-6">
                <div className="mb-3 text-2xl">{f.emoji}</div>
                <h3 className="mb-1 font-serif text-lg text-foreground">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Seeds strip */}
      <section className="border-t border-border/60 bg-card/30">
        <div className="container py-16">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <Badge variant="accent" className="mb-3">🌱 Orchard</Badge>
              <h2 className="font-serif text-3xl tracking-tight md:text-4xl">Grow Passio with Seeds</h2>
              <p className="mt-1 max-w-2xl text-muted-foreground">
                {freeCount} free seeds + {paidCount} paid ones. Curated, sandboxed, license-verifiable locally. Add what you need, ignore what you don't.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/seeds">Browse all →</Link>
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((s) => (
              <SeedCard key={s.name} s={s} />
            ))}
          </div>
        </div>
      </section>

      {/* Privacy/local-first strip */}
      <section className="container py-16">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <Badge variant="outline" className="mb-3">🔒 Privacy</Badge>
            <h2 className="font-serif text-3xl tracking-tight md:text-4xl">Your data never leaves the laptop.</h2>
            <p className="mt-4 text-muted-foreground">
              SQLite + sqlite-vec + FTS5 on disk. Your OpenAI key stays in your OS keychain. Seeds run in a sandbox with per-host network allowlists. Nothing phones home. Encrypt the DB at rest with SQLCipher.
            </p>
            <p className="mt-3 text-muted-foreground">
              When you call an LLM, it's *your* key against *your* budget, capped by the Cost dashboard. Passio has no server.
            </p>
            <div className="mt-5 flex gap-2">
              <Button asChild variant="accent"><Link href="/docs/privacy">Privacy model</Link></Button>
              <Button asChild variant="outline"><Link href="/docs/architecture">Architecture</Link></Button>
            </div>
          </div>
          <Card className="panel-glow">
            <CardContent className="space-y-3 p-6 text-sm text-muted-foreground">
              <div className="flex gap-2"><span className="text-passion-pulpBright">local-first</span><span>SQLite + sqlite-vec + FTS5</span></div>
              <div className="flex gap-2"><span className="text-passion-pulpBright">secrets</span><span>OS keychain / chmod 600 fallback</span></div>
              <div className="flex gap-2"><span className="text-passion-pulpBright">seed sandbox</span><span>Bun Worker + manifest allowlist</span></div>
              <div className="flex gap-2"><span className="text-passion-pulpBright">no telemetry</span><span>ever</span></div>
              <div className="flex gap-2"><span className="text-passion-pulpBright">at-rest</span><span>SQLCipher optional</span></div>
              <div className="flex gap-2"><span className="text-passion-pulpBright">autonomy</span><span>gated per host, rate-limited, audited</span></div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-t border-border/60 bg-card/30">
        <div className="container py-16 text-center">
          <h2 className="font-serif text-3xl md:text-4xl">Ship a Seed, earn revenue.</h2>
          <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
            Build a Seed in an afternoon. Publish via Orchard (free) or sell with ed25519-signed licenses — Passio verifies locally, you keep 100%.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild variant="accent"><Link href="/docs/seeds/quickstart">Build a seed</Link></Button>
            <Button asChild variant="outline"><Link href="/docs/seeds/selling-seeds">Sell a seed</Link></Button>
          </div>
        </div>
      </section>
    </div>
  );
}

const FEATURES = [
  { emoji: "🧠", title: "Persistent memory", body: "Facts, notes, todos, goals, milestones — searchable via FTS5 + vector embeddings. Passio remembers what you told it last month." },
  { emoji: "∞", title: "Autonomous loops", body: "Give a task; Passio plans sub-steps, executes each, re-plans, runs until done. Hard caps on steps + cost + time. Toggle off any moment." },
  { emoji: "📚", title: "Obsidian two-way sync", body: "Notes mirror to the vault. Checkboxes in Todo.md reflect instantly. Daily recap appends to your daily note. Customisable template." },
  { emoji: "🌱", title: "Seeds plugin system", body: "Web-Component UIs + sandboxed JS tools + declared capabilities + ed25519 license keys for paid seeds. Orchard-curated registry." },
  { emoji: "🎭", title: "Cascading personality", body: "5 × 5 × 5 = 125 voices + free-form prompt override. Cycle autonomy posture: quiet · active · proactive." },
  { emoji: "📱", title: "Phone companion", body: "A PWA over Tailscale/LAN. Chat + todos + morning brief from your phone. No native wrapper, no app-store review cycles." },
];
