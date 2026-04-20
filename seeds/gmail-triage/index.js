/**
 * gmail-triage — paid example seed.
 *
 * Uses Passio's host-side mail.inbox tool to pull unread messages,
 * classifies each via the agent, and (optionally) generates a draft reply
 * which it saves as a Passio note. No email is sent automatically — the
 * user reviews drafts in the panel and clicks Send.
 *
 * Licensed: the host refuses to start this seed without a valid license
 * key pasted into Settings. See docs/seeds/publishing.md for how authors
 * issue keys.
 *
 * @param {any} passio
 */
export default async function init(passio) {
  passio.log("gmail-triage booting");

  /** Pulls recent triage results out of KV for the panel. */
  async function recent() {
    return (await passio.kv.get("queue")) ?? [];
  }

  async function triage({ limit } = {}) {
    const style = (await passio.kv.get("reply_style")) ?? "brief";
    const autoDraft = (await passio.kv.get("auto_draft")) ?? true;
    const max = Number(limit ?? (await passio.kv.get("max_per_run")) ?? 10);

    // Passio's built-in mail helper — no permission needed because we're
    // calling the host, not the network. The host enforces mail creds
    // were already configured in Settings.
    const fetched = await passio.mail.unread(max);
    // fetched = { emails: [{ id, from, subject, date }] }
    if (!fetched?.emails?.length) {
      await passio.kv.set("queue", []);
      return { triaged: 0 };
    }

    const triaged = [];
    for (const m of fetched.emails) {
      const category = classify(m);
      const item = {
        id: m.id ?? crypto.randomUUID(),
        from: m.from,
        subject: m.subject,
        date: m.date ?? null,
        category,
        draft: null,
        ts: Date.now(),
      };
      if (autoDraft && (category === "action" || category === "reply")) {
        item.draft = draftReply(m, style);
      }
      triaged.push(item);
    }

    await passio.kv.set("queue", triaged);
    await passio.bubble.speak(
      `Triaged ${triaged.length} unread${triaged.filter((t) => t.category === "action").length > 0 ? " — one needs your attention." : "."}`,
    );
    return { triaged: triaged.length };
  }

  function classify(m) {
    const s = `${m.subject ?? ""} ${m.from ?? ""}`.toLowerCase();
    if (/unsubscribe|noreply|newsletter|offer|sale|promo/.test(s)) return "archive";
    if (/\bspam\b|suspicious|verify your/.test(s)) return "spam";
    if (/\?|please|asap|urgent|action required|sign/.test(s)) return "action";
    return "reply";
  }

  function draftReply(m, style) {
    const greeting = style === "formal" ? `Dear ${firstName(m.from)},` : `Hi ${firstName(m.from)},`;
    const sign = style === "formal" ? "Kind regards," : "Thanks,";
    return `${greeting}\n\nThanks for the note. <replace me — one-line acknowledgement + action you'll take>\n\n${sign}\n`;
  }

  function firstName(from) {
    if (!from) return "there";
    const m = from.match(/^([^<"]+?)(?:\s*<|"|$)/);
    const name = m ? m[1].trim().replace(/,.*$/, "").trim() : from.split("@")[0];
    return (name || "there").split(/\s+/)[0];
  }

  await passio.tools.register({
    name: "triage",
    description: "Classify unread mail + prepare drafts.",
    input: { type: "object", properties: { limit: { type: "number" } } },
    execute: triage,
  });
  await passio.tools.register({
    name: "draft_reply",
    description: "Prepare a draft reply for a specific queued email (by id).",
    input: { type: "object", properties: { id: { type: "string" } } },
    execute: async ({ id }) => {
      const list = await recent();
      const m = list.find((i) => i.id === id);
      if (!m) throw new Error("not in queue");
      m.draft = draftReply(m, (await passio.kv.get("reply_style")) ?? "brief");
      await passio.kv.set("queue", list);
      return { ok: true, draft: m.draft };
    },
  });
  await passio.tools.register({
    name: "recent",
    description: "Return the most recent triage queue.",
    execute: async () => ({ items: await recent() }),
  });

  passio.schedule({ id: "tick", every_seconds: 900 }, async () => {
    try {
      await triage({});
    } catch (e) {
      passio.warn("triage tick failed:", e.message);
    }
  });
}
