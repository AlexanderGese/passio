import type { Db } from "../db/client.js";

/**
 * Email tools via @devalxui/kova-mail.
 *
 * Two auth paths:
 *   - SMTP + IMAP with Gmail app-password (fastest; set up in Google
 *     account → Security → App passwords). Stored in OS keyring as
 *     `mail_user` + `mail_pass`.
 *   - Future: Gmail OAuth (kova-mail supports it; requires clientId +
 *     secret + refresh token). Shipped as stubs in v2.
 *
 * Config lives in settings rows `mail_provider` (smtp|gmail|outlook) and
 * `mail_addresses` (list of addresses managed). The keyring provides the
 * actual credentials; keys are passed to the sidecar via env vars.
 */

import { KovaMail } from "@devalxui/kova-mail";

type ClientCache = { client: KovaMail; user: string; at: number } | null;
let cached: ClientCache = null;
const CACHE_MS = 10 * 60 * 1000;

function mailEnv() {
  const user = process.env.PASSIO_MAIL_USER;
  const pass = process.env.PASSIO_MAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "Gmail not configured. Store your Gmail address in settings and your app password in OS keyring as 'mail_pass'. See Settings → Mail.",
    );
  }
  return { user, pass };
}

function getClient(): KovaMail {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.client;
  const { user, pass } = mailEnv();
  const client = new KovaMail(
    {
      type: "smtp",
      config: {
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user, pass },
        from: user,
      },
    },
    {
      type: "imap",
      config: {
        host: "imap.gmail.com",
        port: 993,
        tls: true,
        auth: { user, pass },
      },
    },
  );
  cached = { client, user, at: now };
  return client;
}

export async function mailInbox(
  _db: Db,
  input: { limit?: number; offset?: number },
): Promise<{ emails: Array<{ id?: string; from: string; subject: string; date?: string; read?: boolean }> }> {
  const client = getClient();
  const rows = await client.inbox(input.limit ?? 20, input.offset ?? 0);
  return {
    emails: rows.map((e) => ({
      ...(e.id ? { id: e.id } : {}),
      from: arrStr(e.from),
      subject: e.subject ?? "(no subject)",
      ...(e.date ? { date: e.date.toISOString() } : {}),
      ...(e.read !== undefined ? { read: e.read } : {}),
    })),
  };
}

export async function mailUnread(
  _db: Db,
  _input: Record<string, never>,
): Promise<{ emails: Array<{ id?: string; from: string; subject: string; date?: string }> }> {
  const client = getClient();
  const rows = await client.unread();
  return {
    emails: rows.map((e) => ({
      ...(e.id ? { id: e.id } : {}),
      from: arrStr(e.from),
      subject: e.subject ?? "(no subject)",
      ...(e.date ? { date: e.date.toISOString() } : {}),
    })),
  };
}

export async function mailSearch(
  _db: Db,
  input: { query: string },
): Promise<{ emails: Array<{ id?: string; from: string; subject: string; snippet?: string }> }> {
  const client = getClient();
  const rows = await client.search(input.query);
  return {
    emails: rows.map((e) => ({
      ...(e.id ? { id: e.id } : {}),
      from: arrStr(e.from),
      subject: e.subject ?? "(no subject)",
      snippet: (e.text ?? "").slice(0, 160),
    })),
  };
}

export async function mailSend(
  _db: Db,
  input: {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    cc?: string | string[];
    bcc?: string | string[];
  },
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const client = getClient();
  const { user } = mailEnv();
  const res = await client.send({
    from: user,
    to: input.to,
    subject: input.subject,
    ...(input.text ? { text: input.text } : {}),
    ...(input.html ? { html: input.html } : {}),
    ...(input.cc ? { cc: input.cc } : {}),
    ...(input.bcc ? { bcc: input.bcc } : {}),
  });
  return {
    success: res.success,
    ...(res.messageId ? { messageId: res.messageId } : {}),
    ...(res.error ? { error: res.error } : {}),
  };
}

function arrStr(v: string | string[]): string {
  return Array.isArray(v) ? v.join(", ") : v;
}
