export default async function init(p){
  await p.tools.register({ name:"hold", description:"queue {to,subject,body} with 30s hold",
    execute: async (m) => {
      const id = Date.now()+"-"+Math.random().toString(36).slice(2,6);
      setTimeout(async () => {
        const pend = (await p.kv.get("pending")) ?? [];
        const idx = pend.findIndex(x=>x.id===id);
        if(idx<0) return;
        const [msg] = pend.splice(idx,1);
        await p.kv.set("pending", pend);
        try { await p.mail.send({ to:msg.to, subject:msg.subject, body:msg.body }); } catch {}
      }, 30000);
      const pend = (await p.kv.get("pending")) ?? []; pend.push({ ...m, id, due:Date.now()+30000 });
      await p.kv.set("pending", pend);
      return { ok:true, id };
    }});
  await p.tools.register({ name:"cancel", description:"cancel a pending send by id",
    execute: async ({ id }) => {
      const pend = (await p.kv.get("pending")) ?? []; const next = pend.filter(x=>x.id!==id);
      await p.kv.set("pending", next);
      return { ok:true };
    }});
}
