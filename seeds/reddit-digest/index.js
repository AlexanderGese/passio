export default async function init(p){
  async function fetchAll(){
    const subs = ((await p.kv.get("subs")) ?? "programming").split(",").map(s=>s.trim()).filter(Boolean);
    const out = [];
    for(const s of subs){
      try {
        const r = await p.net.fetch("https://www.reddit.com/r/"+s+"/hot.json?limit=5");
        const b = await r.json();
        for(const c of (b?.data?.children ?? [])){
          out.push({ sub:s, title:c.data.title, url:"https://reddit.com"+c.data.permalink, score:c.data.score });
        }
      } catch {}
    }
    await p.kv.set("items", out);
    return { items: out };
  }
  await p.tools.register({ name:"fetch", description:"refresh reddit digest", execute:fetchAll });
  p.schedule({id:"tick",every_seconds:1800},()=>fetchAll().catch(()=>undefined));
}
