export default async function init(p){
  await p.tools.register({ name:"log", execute: async ({ kg }) => { const log=(await p.kv.get("log"))??[]; log.push({ ts:Date.now(), kg }); await p.kv.set("log", log); return { ok:true }; } });
  await p.tools.register({ name:"trend", execute: async () => ({ log: await p.kv.get("log") ?? [] }) });
}
