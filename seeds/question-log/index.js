export default async function init(p){
  await p.tools.register({ name:"add", execute: async ({ q }) => { const list = (await p.kv.get("open")) ?? []; list.push({ q, ts: Date.now() }); await p.kv.set("open", list); return { ok:true }; } });
  await p.tools.register({ name:"today", execute: async () => { const list = (await p.kv.get("open")) ?? []; const today = list.filter(x => new Date(x.ts).toDateString() === new Date().toDateString()); return { today }; } });
}
