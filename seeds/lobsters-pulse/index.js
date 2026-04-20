export default async function init(p){
  async function top(){
    const r = await p.net.fetch("https://lobste.rs/hottest.json");
    const items = (await r.json()).slice(0,5).map(x=>({id:x.short_id,title:x.title,url:x.url,score:x.score,user:x.submitter_user?.username}));
    await p.kv.set("items", items);
    return { items };
  }
  await p.tools.register({ name:"top", description:"top 5 lobsters", execute:top });
  p.schedule({id:"tick",every_seconds:900},()=>top().catch(()=>undefined));
  top().catch(()=>undefined);
}
