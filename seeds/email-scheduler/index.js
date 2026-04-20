export default async function init(p){
  await p.tools.register({ name:"queue", description:"queue email: {to,subject,body,sendAt ISO}",
    execute: async (input) => {
      const q = (await p.kv.get("queue")) ?? [];
      q.push({ ...input, id: Date.now()+"-"+Math.random().toString(36).slice(2,6), queuedAt: Date.now() });
      await p.kv.set("queue", q);
      return { ok:true, pending:q.length };
    }});
  await p.tools.register({ name:"list", description:"show queue", execute: async () => ({ queue: await p.kv.get("queue") ?? [] }) });
  p.schedule({id:"tick",every_seconds:60},async()=>{
    const q = (await p.kv.get("queue")) ?? []; const now = Date.now();
    const [due, keep] = [[],[]];
    for(const m of q){ (new Date(m.sendAt).getTime() <= now ? due : keep).push(m); }
    for(const m of due){
      try { await p.mail.send({ to:m.to, subject:m.subject, body:m.body }); } catch {}
    }
    await p.kv.set("queue", keep);
  });
}
