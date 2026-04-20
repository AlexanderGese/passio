import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container flex min-h-[70vh] flex-col items-center justify-center text-center">
      <h1 className="font-serif text-6xl tracking-tight">404</h1>
      <p className="mt-3 text-muted-foreground">This page grew away from the vine.</p>
      <div className="mt-6 flex gap-2">
        <Button asChild variant="accent">
          <Link href="/">Home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/docs">Docs</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/seeds">Seeds</Link>
        </Button>
      </div>
    </div>
  );
}
