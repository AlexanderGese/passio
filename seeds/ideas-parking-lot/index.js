export default async function init(p){
  await p.tools.register({ name:"add", execute: async ({ text, tag }) => { const list = (await p.kv.get("list")) ?? []; list.unshift({ text, tag: tag ?? "idea", ts:Date.now() }); await p.kv.set("list", list); return { ok:true }; } });
  await p.tools.register({ name:"list", execute: async () => ({ list: await p.kv.get("list") ?? [] }) });
}
