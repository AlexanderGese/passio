export default async function init(p){
  async function check(){
    let k=null; try{ k = await p.secrets.get("linear_key"); } catch {}
    if(!k) return { items:[], reason:"set linear_key" };
    const r = await p.net.fetch("https://api.linear.app/graphql",{ method:"POST",
      init:{ headers:{ Authorization:k, "content-type":"application/json" },
      body: JSON.stringify({ query: "{ issues(filter:{ assignee:{isMe:{eq:true}}, state:{type:{nin:["completed","canceled"]}} }, first:30){ nodes{ id title url state{ name } } } }" }) } });
    const items = (((await r.json()).data?.issues?.nodes) ?? []).map(x=>({ title:x.title, state:x.state?.name, url:x.url }));
    await p.kv.set("items", items);
    return { items };
  }
  await p.tools.register({ name:"check", execute:check });
  p.schedule({id:"tick",every_seconds:600},()=>check().catch(()=>undefined));
}
