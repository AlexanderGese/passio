#!/usr/bin/env bun
/**
 * One-shot: appends the 19 new paid seeds to orchard/index.json. Idempotent —
 * skips names that already exist.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ORCHARD = join(
  new URL("..", import.meta.url).pathname,
  "orchard/index.json",
);

const NEW: Array<{ name: string; price: number; desc: string; tags: string[]; category: string }> = [
  { name: "linkedin-command", price: 4900, desc: "LinkedIn remote — share posts, comment, send messages, manage invites. Includes opt-in AI autopilot with hard daily caps.", tags: ["linkedin","social","automation"], category: "productivity" },
  { name: "github-command", price: 4900, desc: "Full GitHub remote — issues, PRs, reviews, releases, repos, stars. Triage a whole org from Passio chat.", tags: ["github","developer"], category: "developer" },
  { name: "discord-command", price: 2900, desc: "Bot-token Discord remote — channels, threads, events, roles, moderation, autopilot.", tags: ["discord","community"], category: "productivity" },
  { name: "slack-admin-command", price: 3900, desc: "Full Slack user remote — post as you, create channels, threads, reminders, status, reactions.", tags: ["slack","admin"], category: "productivity" },
  { name: "mastodon-command", price: 1900, desc: "Mastodon — toot, boost, favourite, follow, search, timelines. Works with any instance.", tags: ["mastodon","fediverse","social"], category: "news" },
  { name: "bluesky-command", price: 1900, desc: "Bluesky — post, like, repost, reply, feeds, search, follow (AT protocol).", tags: ["bluesky","atproto","social"], category: "news" },
  { name: "notion-command", price: 3900, desc: "Notion workspace automation — create pages, query DBs, update blocks, write from templates.", tags: ["notion","productivity"], category: "productivity" },
  { name: "shopify-command", price: 7900, desc: "Shopify Admin remote — orders, inventory, customers, fulfillments, draft orders.", tags: ["shopify","commerce"], category: "other" },
  { name: "stripe-command", price: 4900, desc: "Stripe remote — invoicing, refunds, subscriptions, disputes, customer ops.", tags: ["stripe","finance"], category: "other" },
  { name: "vercel-command", price: 3900, desc: "Vercel remote — deploys, env vars, rollbacks, domains, logs.", tags: ["vercel","devops"], category: "developer" },
  { name: "cloudflare-command", price: 4900, desc: "Cloudflare — DNS records, Worker deploy, KV ops, zone rules, purge cache.", tags: ["cloudflare","devops"], category: "developer" },
  { name: "hubspot-command", price: 4900, desc: "HubSpot CRM — contacts, deals, notes, tasks, engagements.", tags: ["hubspot","crm"], category: "productivity" },
  { name: "zoom-command", price: 3900, desc: "Zoom — schedule meetings, fetch recordings + transcripts, user ops.", tags: ["zoom","meetings"], category: "productivity" },
  { name: "readwise-command", price: 2900, desc: "Readwise — export highlights, daily review, Reader save, search library.", tags: ["readwise","reading"], category: "research" },
  { name: "spotify-remote-command", price: 2900, desc: "Spotify playback + playlists — play, skip, queue, build playlists from prompts.", tags: ["spotify","music"], category: "fun" },
  { name: "salesforce-command", price: 7900, desc: "Salesforce — accounts, opportunities, contacts, tasks, SOQL queries.", tags: ["salesforce","crm"], category: "productivity" },
  { name: "youtube-command", price: 5900, desc: "YouTube Data API — metadata edits, comments, captions, playlists.", tags: ["youtube","creator"], category: "news" },
  { name: "canva-command", price: 4900, desc: "Canva Connect — create designs from briefs, autofill templates, export.", tags: ["canva","design"], category: "productivity" },
  { name: "elevenlabs-command", price: 3900, desc: "ElevenLabs — list voices, synthesize TTS, fetch history.", tags: ["tts","audio"], category: "fun" },
  { name: "ghost-command", price: 2900, desc: "Ghost CMS — create/update/publish posts, schedule, tags.", tags: ["ghost","blog"], category: "other" },
  { name: "wordpress-command", price: 2900, desc: "WordPress REST — posts, media, categories, comments.", tags: ["wordpress","blog"], category: "other" },
];

const orchard = JSON.parse(readFileSync(ORCHARD, "utf8"));
const existing = new Set(orchard.seeds.map((s: { name: string }) => s.name));
let added = 0;
for (const n of NEW) {
  if (existing.has(n.name)) continue;
  orchard.seeds.push({
    name: n.name,
    version: "0.1.0",
    description: n.desc,
    author: "Passio team",
    authorUrl: "https://github.com/alexandergese",
    homepage: `https://alexandergese.gumroad.com/l/passio-${n.name}`,
    tags: n.tags,
    category: n.category,
    priceCents: n.price,
    currency: "usd",
    checkoutUrl: `https://alexandergese.gumroad.com/l/passio-${n.name}`,
    licenseRequired: true,
    featured: false,
    source: { type: "github", repo: "alexandergese/passio", ref: "main", subdir: `seeds/${n.name}` },
  });
  added++;
}
orchard.updated = new Date().toISOString().slice(0, 10);
writeFileSync(ORCHARD, JSON.stringify(orchard, null, 2) + "\n");
console.log(`added ${added} paid seeds to orchard (${orchard.seeds.length} total)`);
