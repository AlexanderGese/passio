export default async function init(p){
  async function latest(){
    const cat = (await p.kv.get("cat")) ?? "cs.AI";
    const r = await p.net.fetch("https://export.arxiv.org/rss/"+cat);
    const xml = await r.text();
    const titles = [...xml.matchAll(/<title>([^<]+)<\/title>/g)].slice(1,11).map(m=>m[1]);
    await p.kv.set("titles", titles);
    return { titles };
  }
  await p.tools.register({ name:"latest", description:"last 10 titles in the category", execute:latest });
  p.schedule({id:"tick",every_seconds:21600},()=>latest().catch(()=>undefined));
  latest().catch(()=>undefined);
}
