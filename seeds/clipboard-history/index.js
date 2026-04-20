/** @param {any} passio */
export default async function init(passio) {
  const MAX = 20;

  async function read() {
    return (await passio.kv.get("entries")) ?? [];
  }
  async function write(list) {
    await passio.kv.set("entries", list);
  }

  await passio.tools.register({
    name: "record",
    description: "Record a new clipboard entry (string).",
    input: { type: "object", properties: { text: { type: "string" } } },
    execute: async ({ text }) => {
      const t = String(text ?? "").trim();
      if (!t) return { added: false };
      const list = await read();
      const existing = list.findIndex((e) => e.text === t);
      if (existing >= 0) list.splice(existing, 1);
      list.unshift({ text: t, ts: Date.now(), pinned: false });
      while (list.filter((e) => !e.pinned).length > MAX) {
        const idx = list.map((e) => !e.pinned).lastIndexOf(true);
        if (idx < 0) break;
        list.splice(idx, 1);
      }
      await write(list);
      return { added: true, total: list.length };
    },
  });

  await passio.tools.register({
    name: "recent",
    description: "Return most recent clipboard entries.",
    input: {},
    execute: async () => ({ entries: await read() }),
  });

  await passio.tools.register({
    name: "pin",
    description: "Toggle pin on an entry by index.",
    input: { type: "object", properties: { index: { type: "number" } } },
    execute: async ({ index }) => {
      const list = await read();
      const e = list[index];
      if (!e) return { ok: false, reason: "out_of_range" };
      e.pinned = !e.pinned;
      await write(list);
      return { ok: true, pinned: e.pinned };
    },
  });

  passio.log("clipboard-history ready");
}
