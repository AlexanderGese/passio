export default async function init(p){
  await p.tools.register({ name:"log", execute: async ({ score }) => { const log=(await p.kv.get("log"))??[]; log.push({ ts:Date.now(), score }); await p.kv.set("log", log); return { ok:true }; } });
  await p.tools.register({ name:"trend", execute: async () => ({ log: await p.kv.get("log") ?? [] }) });
}
