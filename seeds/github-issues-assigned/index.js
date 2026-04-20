export default async function init(p){
  async function check(){
    let tok=null; try{ tok = await p.secrets.get("gh_token"); } catch {}
    if(!tok) return { items:[], reason:"set secret gh_token" };
    const r = await p.net.fetch("https://api.github.com/search/issues?q=is:issue+assignee:@me+state:open",{
      init:{ headers:{ "Authorization":"Bearer "+tok, "Accept":"application/vnd.github+json" } }
    });
    const items = ((await r.json()).items ?? []).map(x=>({title:x.title,url:x.html_url,repo:x.repository_url.split("/").slice(-2).join("/")}));
    await p.kv.set("items", items);
    return { items };
  }
  await p.tools.register({ name:"check", description:"refresh assigned issues", execute:check });
  p.schedule({id:"tick",every_seconds:600},()=>check().catch(()=>undefined));
}
