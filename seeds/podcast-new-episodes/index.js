export default async function init(p){
  async function check(){
    const feeds = ((await p.kv.get("feeds")) ?? "").split(/\s+/).filter(Boolean);
    const out = [];
    for(const f of feeds){
      try {
        const r = await p.net.fetch(f); const xml = await r.text();
        const first = xml.match(/<item>[\s\S]*?<title>([^<]+)<\/title>/);
        if(first) out.push({ feed:f, latest:first[1] });
      } catch {}
    }
    await p.kv.set("items", out);
    return { items: out };
  }
  await p.tools.register({ name:"check", description:"poll feeds for latest", execute:check });
  p.schedule({id:"tick",every_seconds:3600},()=>check().catch(()=>undefined));
}
