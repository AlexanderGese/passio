export default async function init(p){
  await p.tools.register({ name:"add", execute: async ({ title, author }) => { const list=(await p.kv.get("books"))??[]; list.push({ title, author, pct:0, startedAt:Date.now() }); await p.kv.set("books", list); return { ok:true }; } });
  await p.tools.register({ name:"update", execute: async ({ title, pct }) => { const list=(await p.kv.get("books"))??[]; const b=list.find(x=>x.title===title); if(b) b.pct=pct; await p.kv.set("books", list); return { ok:!!b }; } });
  await p.tools.register({ name:"list", execute: async () => ({ books: await p.kv.get("books") ?? [] }) });
  p.schedule({id:"weekly",every_seconds:604800},async()=>{ await p.bubble.speak("How's the reading? Update progress in the Books panel."); });
}
