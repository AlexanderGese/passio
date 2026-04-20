import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: {
    default: "Passio — local-first desktop AI assistant",
    template: "%s · Passio",
  },
  description:
    "Passio is a local-first, passionfruit-themed desktop AI assistant. Floating bubble, persistent memory, autonomous loops, Obsidian integration, and a plugin system called Seeds.",
  metadataBase: new URL("https://passio.dev"),
  openGraph: {
    type: "website",
    title: "Passio — local-first desktop AI assistant",
    description: "Remembers, plans, acts. Grows via Seeds.",
  },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground font-sans">
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
