export default async function init(p){
  await p.tools.register({ name:"log", execute: async ({ score }) => { const log=(await p.kv.get("log"))??[]; log.push({ ts:Date.now(), score }); await p.kv.set("log", log); return { ok:true }; } });
  await p.tools.register({ name:"avg", execute: async () => { const log=(await p.kv.get("log"))??[]; const last = log.slice(-7); const avg = last.length ? last.reduce((s,e)=>s+e.score,0)/last.length : null; return { avg, last }; } });
}
