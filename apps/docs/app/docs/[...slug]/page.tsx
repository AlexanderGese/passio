import { notFound } from "next/navigation";
import { listDocs, getDoc } from "@/lib/docs";
import { DocRenderer } from "./doc-renderer";

export const dynamic = "force-static";

export async function generateStaticParams() {
  return listDocs()
    .filter((d) => d.slug.length > 0)
    .map((d) => ({ slug: d.slug }));
}

export default async function DocPage({ params }: { params: { slug: string[] } }) {
  const doc = await getDoc(params.slug);
  if (!doc) notFound();
  return <DocRenderer doc={doc} />;
}
