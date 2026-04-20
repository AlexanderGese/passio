import Link from "next/link";
import type { DocPage } from "@/lib/docs";

export function DocRenderer({ doc }: { doc: DocPage }) {
  return (
    <article className="mx-auto max-w-3xl py-4">
      {doc.breadcrumbs.length > 1 && (
        <nav className="mb-6 flex flex-wrap gap-1 text-xs text-muted-foreground">
          {doc.breadcrumbs.map((b, i) => (
            <span key={b.href} className="flex items-center gap-1">
              {i > 0 && <span>/</span>}
              <Link href={b.href} className="hover:text-foreground capitalize">
                {b.label}
              </Link>
            </span>
          ))}
        </nav>
      )}
      <h1 className="mb-6 font-serif text-4xl tracking-tight">{doc.title}</h1>
      <div className="prose-passion" dangerouslySetInnerHTML={{ __html: doc.html }} />
    </article>
  );
}
