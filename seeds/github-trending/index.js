export default async function init(p){
  async function fetchAll(){
    const langs = ((await p.kv.get("langs")) ?? "").split(",").map(s=>s.trim()).filter(Boolean);
    const out = [];
    for(const l of langs){
      try {
        const r = await p.net.fetch("https://github-trending-api.de.a9sapp.eu/repositories?since=daily&language="+l);
        for(const repo of (await r.json()).slice(0,5)){
          out.push({ lang:l, name:repo.author+"/"+repo.name, stars:repo.stars, url:repo.url });
        }
      } catch {}
    }
    await p.kv.set("items", out);
    return { items: out };
  }
  await p.tools.register({ name:"fetch", description:"refresh trending", execute:fetchAll });
  p.schedule({id:"tick",every_seconds:3600},()=>fetchAll().catch(()=>undefined));
}
