/**
 * x-command — full X (Twitter) remote.
 *
 * Licensed paid seed. All X API v2 endpoints used.
 *
 * Auth model:
 *   - READ operations (search, timeline, mentions, me) use an app-only
 *     BEARER token (easy: one field).
 *   - WRITE operations (tweet, reply, like, retweet, delete) need OAuth 1.0a
 *     user context (consumer key/secret + access token/secret). X still
 *     requires this for writes even on v2. The seed signs every request
 *     itself — no third-party libs.
 *
 * Autopilot is off + dry-run by default. It calls the autonomous path only
 * when both toggles are set live and within the daily cap + min-gap.
 *
 * @param {any} passio
 */

import { createHmac, randomBytes } from "node:crypto";

const RECENT = "recent_posts";
const COUNTER = "daily_counter";
const AUTOPILOT_LOG = "autopilot_log";

export default async function init(passio) {
  passio.log("x-command booting");

  // ---- OAuth 1.0a signing (for writes) -----------------------------------
  async function oauthHeader(method, url, body) {
    const ck = await passio.secrets.get("oauth1_consumer_key");
    const cs = await passio.secrets.get("oauth1_consumer_secret");
    const tk = await passio.secrets.get("oauth1_access_token");
    const ts = await passio.secrets.get("oauth1_access_secret");
    if (!ck || !cs || !tk || !ts) throw new Error("OAuth 1.0a credentials missing — set all four in Settings");
    const oauthParams = {
      oauth_consumer_key: ck,
      oauth_nonce: randomBytes(16).toString("hex"),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: String(Math.floor(Date.now() / 1000)),
      oauth_token: tk,
      oauth_version: "1.0",
    };
    const baseParams = { ...oauthParams };
    if (body && typeof body === "object" && !(body instanceof URLSearchParams)) {
      // v2 endpoints use JSON bodies — JSON bodies are NOT included in signature base
    } else if (body instanceof URLSearchParams) {
      for (const [k, v] of body) baseParams[k] = v;
    }
    const paramStr = Object.keys(baseParams)
      .sort()
      .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(baseParams[k])}`)
      .join("&");
    const base = `${method.toUpperCase()}&${encodeRfc3986(url)}&${encodeRfc3986(paramStr)}`;
    const signingKey = `${encodeRfc3986(cs)}&${encodeRfc3986(ts)}`;
    const signature = createHmac("sha1", signingKey).update(base).digest("base64");
    const finalParams = { ...oauthParams, oauth_signature: signature };
    return (
      "OAuth " +
      Object.keys(finalParams)
        .sort()
        .map((k) => `${encodeRfc3986(k)}="${encodeRfc3986(finalParams[k])}"`)
        .join(", ")
    );
  }

  function encodeRfc3986(s) {
    return encodeURIComponent(String(s)).replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  }

  async function readFetch(path, params) {
    const bearer = await passio.secrets.get("bearer_token");
    if (!bearer) throw new Error("set bearer_token in Settings");
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    const r = await passio.net.fetch("https://api.twitter.com/2" + path + qs, {
      init: { headers: { Authorization: "Bearer " + bearer } },
    });
    const body = await r.json();
    if (r.status >= 400) throw new Error("x read " + r.status + ": " + JSON.stringify(body).slice(0, 200));
    return body;
  }

  async function writeFetch(path, jsonBody, method = "POST") {
    const url = "https://api.twitter.com/2" + path;
    const auth = await oauthHeader(method, url, jsonBody);
    const r = await passio.net.fetch(url, {
      init: {
        method,
        headers: {
          Authorization: auth,
          "content-type": jsonBody ? "application/json" : undefined,
        },
        body: jsonBody ? JSON.stringify(jsonBody) : undefined,
      },
    });
    const body = await r.json().catch(() => ({}));
    if (r.status >= 400) throw new Error("x write " + r.status + ": " + JSON.stringify(body).slice(0, 200));
    return body;
  }

  // ---- WRITES ------------------------------------------------------------
  await passio.tools.register({
    name: "tweet",
    description: "Post a tweet. { text, reply_to? }",
    input: {
      type: "object",
      properties: { text: { type: "string" }, reply_to: { type: "string" } },
      required: ["text"],
    },
    execute: async ({ text, reply_to }) => {
      const body = { text };
      if (reply_to) body.reply = { in_reply_to_tweet_id: reply_to };
      const res = await writeFetch("/tweets", body);
      const id = res?.data?.id;
      await appendRecent({ kind: "tweet", id, text, ts: Date.now() });
      return { ok: true, id };
    },
  });

  await passio.tools.register({
    name: "reply",
    description: "Reply to a tweet. { to, text }",
    input: { type: "object", properties: { to: { type: "string" }, text: { type: "string" } }, required: ["to", "text"] },
    execute: async ({ to, text }) => {
      const res = await writeFetch("/tweets", { text, reply: { in_reply_to_tweet_id: to } });
      return { ok: true, id: res?.data?.id };
    },
  });

  await passio.tools.register({
    name: "like",
    description: "Like a tweet. { id }",
    input: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    execute: async ({ id }) => {
      const me = await readFetch("/users/me");
      const uid = me?.data?.id;
      if (!uid) throw new Error("could not resolve my user id");
      await writeFetch(`/users/${uid}/likes`, { tweet_id: id });
      return { ok: true };
    },
  });

  await passio.tools.register({
    name: "unlike",
    description: "Unlike a tweet. { id }",
    input: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    execute: async ({ id }) => {
      const me = await readFetch("/users/me");
      const uid = me?.data?.id;
      await writeFetch(`/users/${uid}/likes/${id}`, null, "DELETE");
      return { ok: true };
    },
  });

  await passio.tools.register({
    name: "retweet",
    description: "Retweet. { id }",
    input: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    execute: async ({ id }) => {
      const me = await readFetch("/users/me");
      const uid = me?.data?.id;
      await writeFetch(`/users/${uid}/retweets`, { tweet_id: id });
      return { ok: true };
    },
  });

  await passio.tools.register({
    name: "unretweet",
    description: "Remove your retweet. { id }",
    input: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    execute: async ({ id }) => {
      const me = await readFetch("/users/me");
      const uid = me?.data?.id;
      await writeFetch(`/users/${uid}/retweets/${id}`, null, "DELETE");
      return { ok: true };
    },
  });

  await passio.tools.register({
    name: "delete",
    description: "Delete one of your tweets. { id }",
    input: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    execute: async ({ id }) => {
      await writeFetch(`/tweets/${id}`, null, "DELETE");
      return { ok: true };
    },
  });

  // ---- READS -------------------------------------------------------------
  await passio.tools.register({
    name: "timeline",
    description: "Your home timeline (reverse chronological).",
    execute: async ({ limit = 25 } = {}) => {
      const me = await readFetch("/users/me");
      const uid = me?.data?.id;
      const res = await readFetch(`/users/${uid}/timelines/reverse_chronological`, {
        max_results: String(Math.min(100, Math.max(5, limit))),
        "tweet.fields": "created_at,public_metrics,author_id",
      });
      return { items: res?.data ?? [] };
    },
  });

  await passio.tools.register({
    name: "mentions",
    description: "Recent mentions of you.",
    execute: async ({ limit = 25 } = {}) => {
      const me = await readFetch("/users/me");
      const uid = me?.data?.id;
      const res = await readFetch(`/users/${uid}/mentions`, {
        max_results: String(Math.min(100, Math.max(5, limit))),
        "tweet.fields": "created_at,public_metrics,author_id",
      });
      return { items: res?.data ?? [] };
    },
  });

  await passio.tools.register({
    name: "search",
    description: "Recent-search. { q, limit? }",
    input: { type: "object", properties: { q: { type: "string" }, limit: { type: "number" } }, required: ["q"] },
    execute: async ({ q, limit = 25 }) => {
      const res = await readFetch("/tweets/search/recent", {
        query: q,
        max_results: String(Math.min(100, Math.max(10, limit))),
        "tweet.fields": "created_at,public_metrics,author_id",
      });
      return { items: res?.data ?? [] };
    },
  });

  await passio.tools.register({
    name: "me",
    description: "Your account profile.",
    execute: async () => readFetch("/users/me", { "user.fields": "public_metrics,verified,description" }),
  });

  await passio.tools.register({
    name: "recent_posts",
    description: "Local log of what this seed has posted.",
    execute: async () => ({ posts: (await passio.kv.get(RECENT)) ?? [] }),
  });

  // ---- autopilot ---------------------------------------------------------
  await passio.tools.register({
    name: "autopilot_enable",
    execute: async ({ on }) => { await passio.kv.set("autopilot_enabled", !!on); return { ok: true, on: !!on }; },
  });
  await passio.tools.register({
    name: "autopilot_dry_run",
    execute: async ({ on }) => { await passio.kv.set("autopilot_dry_run", !!on); return { ok: true, on: !!on }; },
  });

  async function autopilotTick() {
    const enabled = (await passio.kv.get("autopilot_enabled")) === true;
    if (!enabled) return { skipped: "disabled" };
    const dry = (await passio.kv.get("autopilot_dry_run")) !== false;
    const topics = String((await passio.kv.get("autopilot_topics")) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (topics.length === 0) return { skipped: "no topics" };

    const maxPerDay = Number((await passio.kv.get("autopilot_max_per_day")) ?? 2);
    const minGapMin = Number((await passio.kv.get("autopilot_min_gap_min")) ?? 240);
    const today = new Date().toISOString().slice(0, 10);
    const counter = (await passio.kv.get(COUNTER)) ?? {};
    if ((counter[today] ?? 0) >= maxPerDay) return { skipped: "daily cap" };

    const recent = (await passio.kv.get(RECENT)) ?? [];
    const lastTs = recent[0]?.ts ?? 0;
    if (Date.now() - lastTs < minGapMin * 60_000) return { skipped: "gap" };

    const style = String((await passio.kv.get("style_guide")) ?? "");
    const topic = topics[Math.floor(Math.random() * topics.length)];
    // Draft: write a prompt note — the user reviews, or the agent can pick it up
    // and expand into a real tweet on the next chat turn.
    const text = `[autopilot draft] ${topic}`;

    const log = (await passio.kv.get(AUTOPILOT_LOG)) ?? [];
    log.unshift({ ts: Date.now(), topic, text, dry });
    while (log.length > 50) log.pop();
    await passio.kv.set(AUTOPILOT_LOG, log);

    if (dry) {
      await passio.notes.save({
        title: `x-autopilot-draft-${Date.now()}`,
        body: `Topic: ${topic}\nStyle: ${style}\n\n${text}`,
        tags: "autopilot,x,draft",
      });
      return { skipped: "dry-run", topic, text };
    }

    try {
      const res = await writeFetch("/tweets", { text });
      const id = res?.data?.id;
      counter[today] = (counter[today] ?? 0) + 1;
      await passio.kv.set(COUNTER, counter);
      await appendRecent({ kind: "autopilot", id, text, ts: Date.now() });
      return { ok: true, live: true, id };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  await passio.tools.register({
    name: "autopilot_tick",
    description: "Run one autopilot cycle.",
    execute: async () => autopilotTick(),
  });

  passio.schedule({ id: "autopilot", every_seconds: 3600 }, async () => {
    try { await autopilotTick(); } catch (e) { passio.warn("autopilot failed:", e.message); }
  });

  async function appendRecent(entry) {
    const list = (await passio.kv.get(RECENT)) ?? [];
    list.unshift(entry);
    while (list.length > 50) list.pop();
    await passio.kv.set(RECENT, list);
  }
}
