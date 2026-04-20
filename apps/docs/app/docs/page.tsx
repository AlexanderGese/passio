import { notFound } from "next/navigation";
import { getDoc } from "@/lib/docs";
import { DocRenderer } from "./[...slug]/doc-renderer";

export const dynamic = "force-static";

export default async function DocsIndex() {
  const doc = await getDoc([]);
  if (!doc) notFound();
  return <DocRenderer doc={doc} />;
}
