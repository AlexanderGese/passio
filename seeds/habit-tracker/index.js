export default async function init(p){
  await p.tools.register({ name:"add", execute: async ({ name }) => { const hs=(await p.kv.get("hs"))??[]; if(!hs.find(h=>h.name===name)) hs.push({ name, days:[] }); await p.kv.set("hs", hs); return { ok:true }; } });
  await p.tools.register({ name:"tick", execute: async ({ name }) => { const hs=(await p.kv.get("hs"))??[]; const h=hs.find(x=>x.name===name); const today=new Date().toISOString().slice(0,10); if(h && !h.days.includes(today)) h.days.push(today); await p.kv.set("hs", hs); return { ok:!!h }; } });
  await p.tools.register({ name:"list", execute: async () => ({ habits: await p.kv.get("hs") ?? [] }) });
}
