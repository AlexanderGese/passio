export default async function init(p){
  async function ping(){
    const urls = ((await p.kv.get("urls")) ?? "").split(/\s+/).filter(Boolean);
    const res = [];
    for(const u of urls){
      const t0 = Date.now();
      try { await p.net.fetch(u, { method:"HEAD" }); res.push({ url:u, ms: Date.now()-t0 }); }
      catch { res.push({ url:u, ms:-1 }); }
    }
    const log = (await p.kv.get("log")) ?? [];
    log.push({ ts:Date.now(), res }); while(log.length>200) log.shift();
    await p.kv.set("log", log);
    return { res };
  }
  await p.tools.register({ name:"ping", description:"ping all URLs now", execute:ping });
  p.schedule({id:"tick",every_seconds:60},()=>ping().catch(()=>undefined));
}
