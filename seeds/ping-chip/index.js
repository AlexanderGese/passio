export default async function init(p){
  async function ping(){
    const host = (await p.kv.get("host")) ?? "https://google.com";
    const t0 = Date.now();
    try { await p.net.fetch(host, { method: "HEAD" }); }
    catch { return { host, ms: -1 }; }
    const ms = Date.now()-t0;
    await p.kv.set("last", { host, ms });
    return { host, ms };
  }
  await p.tools.register({ name:"ping", description:"ping host", execute:ping });
  p.schedule({id:"tick",every_seconds:60},()=>ping().catch(()=>undefined));
  ping().catch(()=>undefined);
}
